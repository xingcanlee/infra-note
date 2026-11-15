# /// script
# dependencies = ["numpy"]
# ///
"""Chapter 02 toy lab: Causal Attention, Variance Scaling, RoPE, and YaRN."""

import math
import numpy as np


def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    e = np.exp(x - np.max(x, axis=axis, keepdims=True))
    return e / np.sum(e, axis=axis, keepdims=True)


def causal_attention(q: np.ndarray, k: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    t, dk = q.shape[-2], q.shape[-1]
    scores = (q @ np.swapaxes(k, -1, -2)) / math.sqrt(dk)
    mask = np.triu(np.full((t, t), -np.inf), k=1)
    weights = softmax(scores + mask, axis=-1)
    return weights @ v, weights


def inv_freqs(dim: int, base: float = 10000.0) -> np.ndarray:
    return 1.0 / (base ** (np.arange(0, dim, 2, dtype=np.float64) / dim))


def rope_neox(x: np.ndarray, pos: np.ndarray, freqs: np.ndarray, inverse: bool = False) -> np.ndarray:
    angles = pos[:, None] * freqs[None, :]
    cos = np.concatenate([np.cos(angles), np.cos(angles)], axis=-1)
    sin = np.concatenate([np.sin(angles), np.sin(angles)], axis=-1)
    if inverse:
        sin = -sin
    d2 = x.shape[-1] // 2
    x_rot = np.concatenate([-x[..., d2:], x[..., :d2]], axis=-1)
    return x * cos + x_rot * sin


def rope_gptj(x: np.ndarray, pos: np.ndarray, freqs: np.ndarray, inverse: bool = False) -> np.ndarray:
    angles = np.repeat(pos[:, None] * freqs[None, :], 2, axis=-1)
    cos, sin = np.cos(angles), np.sin(angles)
    if inverse:
        sin = -sin
    x_even, x_odd = x[..., 0::2], x[..., 1::2]
    x_rot = np.stack([-x_odd, x_even], axis=-1).reshape(x.shape)
    return x * cos + x_rot * sin


def yarn_ramp_and_mscale(
    dim: int, orig_max_pos: int, factor: float, base: float = 10000.0, beta_fast: float = 32.0, beta_slow: float = 1.0
) -> tuple[np.ndarray, np.ndarray, float]:
    def find_dim(num_rot: float) -> float:
        return (dim * math.log(orig_max_pos / (num_rot * 2.0 * math.pi))) / (2.0 * math.log(base))

    low = max(math.floor(find_dim(beta_fast)), 0)
    high = min(math.ceil(find_dim(beta_slow)), dim // 2 - 1)
    idx = np.arange(dim // 2, dtype=np.float64)
    ramp = np.clip((idx - low) / max(high - low, 1e-3), 0.0, 1.0)
    extrapolation = 1.0 - ramp  # 1 at high freq (low idx), 0 at low freq (high idx)
    freq_base = inv_freqs(dim, base)
    inv_yarn = (freq_base / factor) * (1.0 - extrapolation) + freq_base * extrapolation
    mscale = 0.1 * 1.0 * math.log(factor) + 1.0
    return ramp, inv_yarn, mscale


def main() -> None:
    rng = np.random.default_rng(42)

    # 1. Worked 4-token Causal Attention example ("猫 坐在 垫 上", d_k=4)
    tokens = ["猫", "坐在", "垫", "上"]
    q0 = np.array([[1.0, 0.0, 1.0, 0.0], [1.0, 1.0, 0.0, 0.0], [0.0, 1.0, 1.0, 0.0], [1.0, 0.0, 1.0, 1.0]])
    k0 = np.array([[1.0, 0.0, 1.0, 0.0], [0.0, 1.0, 1.0, 0.0], [1.0, 1.0, 0.0, 0.0], [0.0, 1.0, 1.0, 1.0]])
    v0 = np.array([[1.0, 0.0, 0.5, 0.0], [0.0, 1.0, 0.0, 0.5], [0.5, 0.5, 1.0, 0.0], [0.0, 0.0, 0.5, 1.0]])
    out0, w0 = causal_attention(q0, k0, v0)
    print("=== Worked Causal Attention (H0, d_k=4) ===")
    for i, tok in enumerate(tokens):
        print(f"t={i} ({tok:2s}) weights={np.round(w0[i], 4)} -> out={np.round(out0[i], 4)}")

    # 2. Causal future-invariance (H=2, T=4, d_k=4)
    qh, kh, vh = rng.normal(size=(2, 4, 4)), rng.normal(size=(2, 4, 4)), rng.normal(size=(2, 4, 4))
    out_a, _ = causal_attention(qh, kh, vh)
    qh_p, kh_p, vh_p = qh.copy(), kh.copy(), vh.copy()
    qh_p[:, 3] += 50.0
    kh_p[:, 3] -= 50.0
    vh_p[:, 3] += 99.0
    out_b, _ = causal_attention(qh_p, kh_p, vh_p)
    assert np.allclose(out_a[:, :3], out_b[:, :3], atol=1e-12)

    # 3. 1/sqrt(d_k) dot-product variance scaling (d_k=64)
    dk = 64
    q_s = rng.normal(size=(20000, dk))
    k_s = rng.normal(size=(20000, dk))
    dots = np.sum(q_s * k_s, axis=-1)
    var_raw, var_scaled = float(np.var(dots)), float(np.var(dots / math.sqrt(dk)))
    assert abs(var_raw - dk) / dk < 0.05 and abs(var_scaled - 1.0) < 0.05
    print(f"\n=== Dot-Product Variance (d_k={dk}) ===")
    print(f"Var(q.k)={var_raw:.2f}, Var(q.k/sqrt(d_k))={var_scaled:.4f}")

    # 4. RoPE relative invariance + NeoX vs GPT-J permutation equivalence + DS-V4 tail slice & inverse
    d_rope = 8
    freqs = inv_freqs(d_rope)
    q_vec = rng.normal(size=(1, d_rope))
    k_vec = rng.normal(size=(1, d_rope))
    m, n, delta = 2, 5, 17
    dot_base = float(np.sum(rope_neox(q_vec, np.array([m]), freqs) * rope_neox(k_vec, np.array([n]), freqs)))
    dot_shift = float(np.sum(rope_neox(q_vec, np.array([m + delta]), freqs) * rope_neox(k_vec, np.array([n + delta]), freqs)))
    assert abs(dot_base - dot_shift) < 1e-12

    perm = np.zeros((d_rope, d_rope))
    for i in range(d_rope // 2):
        perm[2 * i, i] = 1.0
        perm[2 * i + 1, i + d_rope // 2] = 1.0
    pos4 = np.arange(4)
    x4 = rng.normal(size=(4, d_rope))
    neox_mapped = rope_neox(x4, pos4, freqs) @ perm.T
    gptj_out = rope_gptj(x4 @ perm.T, pos4, freqs)
    assert np.allclose(neox_mapped, gptj_out, atol=1e-12)

    # DeepSeek-V4 tail-slice rotary_dim=4 inside head_size=8 + inverse=True roundtrip
    rotary_dim = 4
    freqs_tail = inv_freqs(rotary_dim)
    x_tail = x4.copy()
    x_tail[:, -rotary_dim:] = rope_gptj(x4[:, -rotary_dim:], pos4, freqs_tail)
    assert np.allclose(x_tail[:, : d_rope - rotary_dim], x4[:, : d_rope - rotary_dim])
    x_rec = rope_gptj(x_tail[:, -rotary_dim:], pos4, freqs_tail, inverse=True)
    assert np.allclose(x_rec, x4[:, -rotary_dim:], atol=1e-12)
    print(f"\n=== RoPE Checks ===")
    print(f"dot(m={m},n={n})={dot_base:.6f} == dot(m={m+delta},n={n+delta})={dot_shift:.6f}")
    print(f"max|NeoX->perm - GPT-J|={np.max(np.abs(neox_mapped - gptj_out)):.2e}")
    print(f"max|DS-V4 tail inverse - orig|={np.max(np.abs(x_rec - x4[:, -rotary_dim:])):.2e}")

    # 5. YaRN ramp monotonicity & mscale (DeepSeek-V3 config: 4K -> 160K, s=40, d=64)
    ramp, inv_yarn, mscale = yarn_ramp_and_mscale(dim=64, orig_max_pos=4096, factor=40.0)
    assert np.all(np.diff(ramp) >= 0.0) and ramp[0] == 0.0 and ramp[-1] == 1.0
    print(f"\n=== YaRN Ramp (dim=64, s=40) ===")
    print(f"extrap_mask[0]={1-ramp[0]:.2f} (high freq) ... extrap_mask[-1]={1-ramp[-1]:.2f} (low freq)")
    print(f"mscale={mscale:.4f}, softmax_scale_mul=mscale^2={mscale**2:.4f}")
    print("\nOK 02")


if __name__ == "__main__":
    main()
