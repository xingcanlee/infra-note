"""01 异构硬件底座与单层前向（Embedding -> RMSNorm -> SwiGLU -> Logits + Roofline）验证。"""

import numpy as np


def silu(x: np.ndarray) -> np.ndarray:
    return x / (1.0 + np.exp(-x))


def rms_norm(x: np.ndarray, gamma: np.ndarray, eps: float = 1e-6) -> tuple[np.ndarray, float]:
    rms = np.sqrt(np.mean(x * x, axis=-1, keepdims=True) + eps)
    return (x / rms) * gamma, float(np.squeeze(rms))


def run_4d_walkthrough() -> None:
    rng = np.random.default_rng(42)
    vocab_size, d, d_ff = 8, 4, 6
    embed_table = rng.normal(0.0, 0.3, size=(vocab_size, d)).astype(np.float32)
    embed_table[3] = np.array([2.0, -1.0, 2.0, 0.0], dtype=np.float32)

    token_id = 3
    x = embed_table[token_id]
    gamma = np.ones(d, dtype=np.float32)
    x_hat, rms = rms_norm(x, gamma)
    assert abs(rms - 1.5) < 1e-6, f"unexpected rms={rms}"

    x_scaled, _ = rms_norm(x * 1000.0, gamma)
    assert np.allclose(x_hat, x_scaled, atol=1e-5), "RMSNorm should be scale-invariant"

    w_gate = rng.normal(0.0, 0.25, size=(d, d_ff)).astype(np.float32)
    w_up = rng.normal(0.0, 0.25, size=(d, d_ff)).astype(np.float32)
    w_down = rng.normal(0.0, 0.25, size=(d_ff, d)).astype(np.float32)

    g = silu(x_hat @ w_gate)
    u = x_hat @ w_up
    h = g * u
    y = x + (h @ w_down)

    lm_head = embed_table  # tied output head (V=8, d=4)
    logits = y @ lm_head.T
    probs = np.exp(logits - np.max(logits))
    probs /= np.sum(probs)
    top_id = int(np.argmax(probs))
    assert abs(float(np.sum(probs)) - 1.0) < 1e-6

    fmt = lambda a: [round(float(v), 4) for v in a]
    print("=== 1. 4D Single-Token Forward Walkthrough ===")
    print(f"token_id={token_id} x={fmt(x)}")
    print(f"rms={rms:.6f} x_hat={fmt(x_hat)}")
    print(f"swiglu h(6D)={fmt(h)}")
    print(f"residual y={fmt(y)}")
    print(f"logits top_token={top_id} prob={probs[top_id]:.4f}")


def ffn_swiglu_roofline(m: int, d: int = 4096, d_ff: int = 11008) -> tuple[float, float, float]:
    """返回单个 SwiGLU FFN 层的 (GFLOPs, HBM MiB, 算术强度 FLOPs/Byte, BF16)."""
    flops = 2.0 * m * (3.0 * d * d_ff)
    w_bytes = 3.0 * d * d_ff * 2.0
    # Unfused approximation: Gate+Up (read x, write g/u) + SwiGLU (read g/u, write h) + Down (read h, write y)
    act_bytes = m * (2.0 * d + 5.0 * d_ff) * 2.0
    total_bytes = w_bytes + act_bytes
    return flops / 1e9, total_bytes / (1024**2), flops / total_bytes


def run_roofline_analysis() -> None:
    d, d_ff = 4096, 11008
    # Parameter parity check: classic 2-matrix (d -> 4d -> d) vs 3-matrix SwiGLU (8/3 d)
    p_classic = 2 * d * (4 * d)
    p_swiglu = 3 * d * d_ff
    assert abs(p_swiglu / p_classic - 1.0) < 0.02

    # H800 SXM5 dense BF16 peak=990 TFLOPS, HBM3=3.35 TB/s (FlashMLA deep-dive);
    # NPU-Sample illustrates a DaVinci AI Core SKU profile parameterized at 320 TFLOPS / 1.60 TB/s.
    devices = [
        ("H800-SXM5(BF16)", 990.0, 3.35),
        ("NPU-Sample(BF16)", 320.0, 1.60),
    ]
    print("\n=== 2. SwiGLU Roofline (d=4096, d_ff=11008, BF16) ===")
    print(f"param_parity: classic_4d={p_classic:,} swiglu={p_swiglu:,} ratio={p_swiglu/p_classic:.3f}x")
    for name, p_peak, bw in devices:
        ridge = p_peak / bw
        print(f"\n[{name}] peak={p_peak:.1f} TFLOPS, HBM={bw:.2f} TB/s, ridge I*={ridge:.1f} FLOP/B")
        for label, m in [("Decode ", 1), ("Batch  ", 64), ("Prefill", 2048)]:
            gf, mib, ai = ffn_swiglu_roofline(m, d, d_ff)
            attained = min(p_peak, ai * bw)
            util = attained / p_peak * 100.0
            regime = "compute-bound" if ai >= ridge else "memory-bound"
            print(f"  {label} M={m:<4d}: I={ai:7.2f} FLOP/B -> {attained:6.2f} TFLOPS ({util:5.1f}%) [{regime}]")


def run_ascend_pipeline_checks() -> None:
    # Cube (GEMM) and Vector (RMSNorm/SiLU/Mul) overlap on DaVinci AI Core
    t_cube_us, t_vec_us = 18.0, 9.0
    t_serial = t_cube_us + t_vec_us
    t_cv_overlap = max(t_cube_us, t_vec_us)
    speedup = t_serial / t_cv_overlap
    assert speedup > 1.4

    print("\n=== 3. Ascend Cube+Vector Overlap & FRACTAL_NZ ===")
    print(f"serial={t_serial:.1f}us vs cv_overlap={t_cv_overlap:.1f}us -> speedup={speedup:.2f}x")
    # FRACTAL_NZ (16x16 fractal block) padding overhead check
    for k in (4096, 520):
        padded = ((k + 15) // 16) * 16
        overhead = (padded - k) / k * 100.0
        print(f"FRACTAL_NZ align(16): dim={k} -> padded={padded} overhead={overhead:.2f}%")
    print("\nOK 01")


if __name__ == "__main__":
    run_4d_walkthrough()
    run_roofline_analysis()
    run_ascend_pipeline_checks()
