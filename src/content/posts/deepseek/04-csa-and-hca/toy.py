"""Ch08 verification: sequence folding (G=16) + tail ring, gated pooling vs mean, GPT-J inverse RoPE."""

import numpy as np


def apply_partial_gptj_rope(
    x: np.ndarray, pos: np.ndarray | int, rope_dim: int = 16, theta: float = 10000.0, inverse: bool = False
) -> np.ndarray:
    """Apply (or invert) GPT-J interleaved-pair RoPE on the last `rope_dim` channels."""
    pos_arr = np.asarray(pos, dtype=np.float64)
    half = rope_dim // 2
    inv_freq = 1.0 / (theta ** (np.arange(0, rope_dim, 2, dtype=np.float64) / rope_dim))
    angles = np.outer(pos_arr, inv_freq) if pos_arr.ndim > 0 else pos_arr * inv_freq
    cos, sin = np.cos(angles), np.sin(angles)
    if inverse:
        sin = -sin
    out = x.copy()
    tail = out[..., -rope_dim:]
    even, odd = tail[..., 0::2], tail[..., 1::2]
    # Exact match to DeepseekV4ScalingRotaryEmbedding & fused_inv_rope_fp8_quant.py
    rot_even = even * cos - odd * sin
    rot_odd = odd * cos + even * sin
    out[..., -rope_dim:][..., 0::2] = rot_even
    out[..., -rope_dim:][..., 1::2] = rot_odd
    return out


def main() -> None:
    rng = np.random.default_rng(42)

    # 1. Sequence compression (G=16) + circular tail state ring (< G tokens)
    seq_len, stride_g, d_kv = 100, 16, 64
    tokens = rng.standard_normal((seq_len, d_kv))
    logits = rng.standard_normal((seq_len, d_kv)) * 0.2
    pos_bias = rng.standard_normal((stride_g, d_kv)) * 0.1

    ring_kv = np.zeros((stride_g, d_kv), dtype=np.float64)
    ring_logits = np.zeros((stride_g, d_kv), dtype=np.float64)
    main_cache: list[np.ndarray] = []

    for t in range(seq_len):
        slot = t % stride_g
        ring_kv[slot] = tokens[t]
        ring_logits[slot] = logits[t]
        if slot == stride_g - 1:
            z = ring_logits + pos_bias
            z = z - np.max(z, axis=0, keepdims=True)
            weights = np.exp(z) / np.sum(np.exp(z), axis=0, keepdims=True)
            main_cache.append(np.sum(weights * ring_kv, axis=0))

    tail_len = seq_len % stride_g
    completed_tokens = seq_len - tail_len
    ratio = completed_tokens / len(main_cache)
    assert len(main_cache) == seq_len // stride_g and tail_len < stride_g
    assert ratio == 16.0
    print(
        f"[1] Compression L={seq_len}, G={stride_g}: "
        f"main_blocks={len(main_cache)} ({ratio:.1f}x vs {completed_tokens} completed tokens), "
        f"tail_ring={tail_len}/{stride_g}"
    )

    # 2. Learned per-token gate weights vs uniform mean pooling on needle retrieval (G=16)
    bg = rng.standard_normal((stride_g, d_kv)) * 0.25
    needle = rng.standard_normal(d_kv)
    needle /= np.linalg.norm(needle)
    needle_idx = 11
    block = bg.copy()
    block[needle_idx] = 2.0 * needle  # Salient needle inside 16-token block

    # Unweighted mean pooling treats every slot equally (1/16)
    pooled_mean = block.mean(axis=0)

    # Learned gate + positional bias assigns higher salience logits to needle slot
    gate_logits = rng.standard_normal((stride_g, d_kv)) * 0.15
    gate_logits[needle_idx] += 4.5
    gate_exp = np.exp(gate_logits - np.max(gate_logits, axis=0, keepdims=True))
    gate_weights = gate_exp / np.sum(gate_exp, axis=0, keepdims=True)
    pooled_gated = np.sum(gate_weights * block, axis=0)

    def cos_sim(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

    cos_mean = cos_sim(pooled_mean, needle)
    cos_gated = cos_sim(pooled_gated, needle)
    assert cos_gated > 0.90 and cos_mean < 0.45 and cos_gated > cos_mean + 0.50
    print(f"[2] Needle cosine (G=16, idx={needle_idx}): mean={cos_mean:.4f}, gated={cos_gated:.4f}")

    # 3. Partial GPT-J RoPE + inverse=True round-trip & relative-position theorem
    head_dim, rope_dim = 64, 16
    x = rng.standard_normal((4, head_dim))
    pos = np.array([3, 17, 48, 127], dtype=np.float64)
    x_rot = apply_partial_gptj_rope(x, pos, rope_dim=rope_dim, inverse=False)
    x_rec = apply_partial_gptj_rope(x_rot, pos, rope_dim=rope_dim, inverse=True)
    nope_drift = float(np.max(np.abs(x_rot[..., :-rope_dim] - x[..., :-rope_dim])))
    roundtrip_err = float(np.max(np.abs(x_rec - x)))

    # Output inverse RoPE theorem: RoPE(-q_pos, RoPE(k_pos, v)) == RoPE(k_pos - q_pos, v)
    v = rng.standard_normal((1, head_dim))
    k_pos, q_pos = 17, 50
    v_at_k = apply_partial_gptj_rope(v, k_pos, rope_dim=rope_dim, inverse=False)
    v_inv_q = apply_partial_gptj_rope(v_at_k, q_pos, rope_dim=rope_dim, inverse=True)
    v_rel = apply_partial_gptj_rope(v, k_pos - q_pos, rope_dim=rope_dim, inverse=False)
    rel_err = float(np.max(np.abs(v_inv_q - v_rel)))

    assert nope_drift == 0.0 and roundtrip_err < 1e-12 and rel_err < 1e-12
    print(
        f"[3] Partial GPT-J RoPE (last {rope_dim}/{head_dim} dims): "
        f"nope_drift={nope_drift:.1e}, roundtrip_err={roundtrip_err:.2e}, "
        f"rel_pos_err={rel_err:.2e}"
    )
    print("OK 08")


if __name__ == "__main__":
    main()
