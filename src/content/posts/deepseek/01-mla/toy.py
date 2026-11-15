# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""Verify MLA matrix absorption equivalence, coupled-RoPE failure, and KV savings."""

import numpy as np


def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    m = np.max(x, axis=axis, keepdims=True)
    e = np.exp(x - m)
    return e / np.sum(e, axis=axis, keepdims=True)


def apply_rope(x: np.ndarray, pos: np.ndarray) -> np.ndarray:
    """Apply 2D rotary embeddings along the last dimension."""
    half = x.shape[-1] // 2
    freqs = 1.0 / (10000.0 ** (np.arange(0, half, dtype=np.float64) / half))
    ang = pos[..., None] * freqs
    c, s = np.cos(ang), np.sin(ang)
    x1, x2 = x[..., :half], x[..., half:]
    return np.concatenate([x1 * c - x2 * s, x1 * s + x2 * c], axis=-1)


def verify_mla_absorption() -> None:
    rng = np.random.default_rng(42)
    s_kv, n_h, d_c, d_nope, d_rope, d_v, d_model = 6, 4, 6, 8, 4, 8, 16
    scale_softmax = (d_nope + d_rope) ** -0.5

    x = rng.normal(0.0, 1.0, size=(s_kv, d_model))
    pos = np.arange(s_kv, dtype=np.float64)
    q_pos = np.array(s_kv - 1, dtype=np.float64)

    w_q_nope = rng.normal(0.0, 0.2, size=(d_model, n_h, d_nope))
    w_q_rope = rng.normal(0.0, 0.2, size=(d_model, n_h, d_rope))
    w_dkv = rng.normal(0.0, 0.2, size=(d_model, d_c))
    w_kr = rng.normal(0.0, 0.2, size=(d_model, d_rope))
    w_uk = rng.normal(0.0, 0.2, size=(d_c, n_h, d_nope))
    w_uv = rng.normal(0.0, 0.2, size=(d_c, n_h, d_v))
    w_o = rng.normal(0.0, 0.2, size=(n_h * d_v, d_model))

    # vLLM layouts after process_weights_after_loading:
    # W_UK_T: [N, P, L], W_UV: [N, L, V]
    w_uk_t = np.transpose(w_uk, (1, 2, 0))
    w_uv_nhv = np.transpose(w_uv, (1, 0, 2))

    # Shared projections + Decoupled RoPE
    c_kv = x @ w_dkv                                  # [S_kv, L]
    k_pe = apply_rope(x @ w_kr, pos)                  # [S_kv, R]
    q_nope = np.einsum("d,dhp->hp", x[-1], w_q_nope)  # [N, P]
    q_pe = apply_rope(np.einsum("d,dhr->hr", x[-1], w_q_rope), q_pos)  # [N, R]

    # Path A: Naive Prefill (decompress c_kv -> full MHA, P+R head dim)
    k_nope = np.einsum("tc,hcp->thp", c_kv, np.transpose(w_uk, (1, 0, 2)))
    v_full = np.einsum("tc,hcw->thw", c_kv, np.transpose(w_uv, (1, 0, 2)))
    k_pe_exp = np.broadcast_to(k_pe[:, None, :], (s_kv, n_h, d_rope))
    q_mha = np.concatenate([q_nope, q_pe], axis=-1)               # [N, P+R]
    k_mha = np.concatenate([k_nope, k_pe_exp], axis=-1)           # [S_kv, N, P+R]
    logits_mha = np.einsum("hd,thd->ht", q_mha, k_mha) * scale_softmax
    probs_mha = softmax(logits_mha, axis=-1)
    o_mha = np.einsum("ht,thv->hv", probs_mha, v_full).reshape(-1) @ w_o

    # Path B: Absorbed Decode (1-head MQA over packed [c_kv; k_pe] of dim L+R)
    q_nope_abs = np.einsum("hp,hpl->hl", q_nope, w_uk_t)          # _prepare_mqa_query
    q_mqa = np.concatenate([q_nope_abs, q_pe], axis=-1)           # [N, L+R]
    kv_joint = np.concatenate([c_kv, k_pe], axis=-1)              # [S_kv, L+R]
    logits_mqa = (q_mqa @ kv_joint.T) * scale_softmax
    probs_mqa = softmax(logits_mqa, axis=-1)
    o_latent = probs_mqa @ c_kv                                   # [N, L], head_dim_v=L
    o_abs = np.einsum("hl,hlv->hv", o_latent, w_uv_nhv).reshape(-1) @ w_o

    logit_diff = float(np.max(np.abs(logits_mha - logits_mqa)))
    out_diff = float(np.max(np.abs(o_mha - o_abs)))
    assert np.allclose(logits_mha, logits_mqa, atol=1e-12)
    assert np.allclose(o_mha, o_abs, atol=1e-12)
    print(f"[MLA decoupled] max_logit_diff={logit_diff:.2e} | max_out_diff={out_diff:.2e}")

    # Test why full-dimension coupled RoPE breaks pre-absorption:
    # Exact coupled score applies R_{t-s} between q_nope and (c_kv @ W_UK):
    q_coup = apply_rope(q_nope, q_pos)
    k_coup = apply_rope(k_nope, pos[:, None])
    score_coupled_exact = np.einsum("hp,thp->ht", q_coup, k_coup) * (d_nope ** -0.5)
    # Naive attempt to pre-absorb W_UK into q_coup ignores W_UK not commuting with R:
    score_coupled_naive_abs = (np.einsum("hp,hpl->hl", q_coup, w_uk_t) @ c_kv.T) * (d_nope ** -0.5)
    coupled_err = float(np.max(np.abs(score_coupled_exact - score_coupled_naive_abs)))
    assert coupled_err > 1e-2
    print(f"[coupled RoPE breaks absorb] max_logit_error={coupled_err:.4f} (cannot merge R_t * W_UK)")


def print_mla_ledger() -> None:
    layers, d_h, n_q = 61, 128, 128  # DeepSeek-V3 dimensions, BF16 (2 B/elem)
    kv_lora_rank, qk_rope_dim = 512, 64
    mla_elems = kv_lora_rank + qk_rope_dim
    configs = [
        ("MHA (128 KV heads) ", 2 * n_q * d_h),
        ("GQA-8 (8 KV heads) ", 2 * 8 * d_h),
        ("MLA (512 + 64)     ", mla_elems),
    ]
    print("\n--- DeepSeek-V3 Scale KV Cache Ledger (61 layers, n_q=128, d_h=128, BF16) ---")
    for name, elems_per_layer in configs:
        b_layer = elems_per_layer * 2
        b_total = b_layer * layers
        vs_mha = (mla_elems / elems_per_layer) if name.startswith("MLA") else (elems_per_layer / mla_elems)
        tag = f"{vs_mha:5.2f}x larger than MLA" if not name.startswith("MLA") else "baseline (576 elems/layer)"
        print(f"{name}: {b_layer:6d} B/layer/tok | {b_total / 1024:7.2f} KiB/tok (61L) | {tag}")


if __name__ == "__main__":
    verify_mla_absorption()
    print_mla_ledger()
    print("OK 04")
