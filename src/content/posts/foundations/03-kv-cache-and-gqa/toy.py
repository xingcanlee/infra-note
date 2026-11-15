# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""Verify KV-cache numerical equivalence and MHA/GQA/MQA memory-bandwidth math."""

import numpy as np


def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    m = np.max(x, axis=axis, keepdims=True)
    e = np.exp(x - m)
    return e / np.sum(e, axis=axis, keepdims=True)


def attn_step_full(x_seq: np.ndarray, wq: np.ndarray, wk: np.ndarray, wv: np.ndarray,
                   n_q: int, n_kv: int) -> tuple[np.ndarray, int]:
    """Recompute Q, K, V for the entire prefix [0..t] (no KV cache)."""
    t_len, d_model = x_seq.shape
    d_head = d_model // n_q
    g = n_q // n_kv
    q = (x_seq @ wq).reshape(t_len, n_q, d_head)
    k = (x_seq @ wk).reshape(t_len, n_kv, d_head)
    v = (x_seq @ wv).reshape(t_len, n_kv, d_head)
    k_exp = np.repeat(k, g, axis=1)
    v_exp = np.repeat(v, g, axis=1)
    scores = np.einsum("qhd,khd->hqk", q[-1:], k_exp) / np.sqrt(d_head)
    probs = softmax(scores, axis=-1)
    out = np.einsum("hqk,khd->qhd", probs, v_exp).reshape(d_model)
    proj_flops = 2 * t_len * d_model * (d_model + 2 * n_kv * d_head)
    return out, proj_flops


def attn_step_cached(x_t: np.ndarray, wq: np.ndarray, wk: np.ndarray, wv: np.ndarray,
                     k_cache: list[np.ndarray], v_cache: list[np.ndarray],
                     n_q: int, n_kv: int) -> tuple[np.ndarray, int]:
    """Project only current token x_t, append to KV cache, attend over full history."""
    d_model = x_t.shape[0]
    d_head = d_model // n_q
    g = n_q // n_kv
    q_t = (x_t @ wq).reshape(n_q, d_head)
    k_t = (x_t @ wk).reshape(n_kv, d_head)
    v_t = (x_t @ wv).reshape(n_kv, d_head)
    k_cache.append(k_t)
    v_cache.append(v_t)
    k_all = np.repeat(np.stack(k_cache, axis=0), g, axis=1)
    v_all = np.repeat(np.stack(v_cache, axis=0), g, axis=1)
    scores = np.einsum("hd,khd->hk", q_t, k_all) / np.sqrt(d_head)
    probs = softmax(scores, axis=-1)
    out = np.einsum("hk,khd->hd", probs, v_all).reshape(d_model)
    proj_flops = 2 * d_model * (d_model + 2 * n_kv * d_head)
    return out, proj_flops


def verify_equivalence(n_q: int, n_kv: int, d_head: int = 8,
                       t_prompt: int = 4, t_gen: int = 4) -> None:
    rng = np.random.default_rng(42)
    d_model = n_q * d_head
    scale = 1.0 / np.sqrt(d_model)
    x = rng.normal(0.0, 1.0, size=(t_prompt + t_gen, d_model))
    wq = rng.normal(0.0, scale, size=(d_model, d_model))
    wk = rng.normal(0.0, scale, size=(d_model, n_kv * d_head))
    wv = rng.normal(0.0, scale, size=(d_model, n_kv * d_head))

    k_cache: list[np.ndarray] = []
    v_cache: list[np.ndarray] = []
    # Prefill prompt tokens into cache
    for t in range(t_prompt):
        k_cache.append((x[t] @ wk).reshape(n_kv, d_head))
        v_cache.append((x[t] @ wv).reshape(n_kv, d_head))

    max_diff = 0.0
    flops_full_total = 0
    flops_cache_total = 0
    for t in range(t_prompt, t_prompt + t_gen):
        out_full, f_full = attn_step_full(x[: t + 1], wq, wk, wv, n_q, n_kv)
        out_cache, f_cache = attn_step_cached(x[t], wq, wk, wv, k_cache, v_cache, n_q, n_kv)
        diff = float(np.max(np.abs(out_full - out_cache)))
        max_diff = max(max_diff, diff)
        assert np.allclose(out_full, out_cache, atol=1e-12), f"mismatch: {diff}"
        flops_full_total += f_full
        flops_cache_total += f_cache

    print(
        f"[equiv] n_q={n_q:2d}, n_kv={n_kv:2d} (g={n_q // n_kv:2d}) | "
        f"max_abs_diff={max_diff:.2e} | proj_flops_ratio(full/cached)={flops_full_total / flops_cache_total:.2f}x"
    )


def print_ledger() -> None:
    layers, n_q, d_head, dtype_bytes = 64, 64, 128, 2  # BF16
    batch, seq_len = 16, 32768
    t_decode = 2048
    print("\n--- 64-Layer Ledger (n_q=64, d_head=128, BF16, T_ctx=2048 decode) ---")
    for name, n_kv in [("MHA  ", 64), ("GQA-8", 8), ("MQA  ", 1)]:
        g = n_q // n_kv
        bytes_per_tok = 2 * layers * n_kv * d_head * dtype_bytes
        gib_32k_b16 = (bytes_per_tok * batch * seq_len) / (1024**3)
        # Single-layer B=1 decode attention FLOPs (QK^T + PV) vs HBM bytes (Q + K_cache + V_cache + k_t,v_t write + O)
        attn_flops = 4 * t_decode * n_q * d_head
        hbm_bytes = (2 * (t_decode + 1) * n_kv * d_head + 2 * n_q * d_head) * dtype_bytes
        ai = attn_flops / hbm_bytes
        print(
            f"{name} (n_kv={n_kv:2d}, g={g:2d}): "
            f"{bytes_per_tok / 1024:7.1f} KiB/tok | "
            f"B=16,32K: {gib_32k_b16:6.1f} GiB | "
            f"Decode AI={ai:6.3f} FLOP/B"
        )


if __name__ == "__main__":
    for kv_heads in (8, 2, 1):
        verify_equivalence(n_q=8, n_kv=kv_heads)
    print_ledger()
    print("OK 03")
