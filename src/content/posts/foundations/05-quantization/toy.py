"""Chapter 05 toy experiment: INT8, Hadamard, DeepSeek-V3 FP8, and MXFP4."""
import numpy as np

# Exact IEEE-like finite grids for FP8 E4M3FN (max 448) and FP4 E2M1 (max 6)
E4M3_POS = [m / 512.0 for m in range(1, 8)] + [
    (2.0 ** (e - 7)) * (1.0 + m / 8.0)
    for e in range(1, 16)
    for m in range(8)
    if not (e == 15 and m == 7)  # e=15, m=7 is NaN in E4M3FN
]
E4M3_GRID = np.array(sorted([-v for v in E4M3_POS] + [0.0] + E4M3_POS))
E2M1_POS = [0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0]
E2M1_GRID = np.array([-v for v in reversed(E2M1_POS)] + [0.0] + E2M1_POS)


def snap_to_grid(x: np.ndarray, grid: np.ndarray) -> np.ndarray:
    idx = np.searchsorted(grid, x)
    lo, hi = np.clip(idx - 1, 0, len(grid) - 1), np.clip(idx, 0, len(grid) - 1)
    return np.where(np.abs(x - grid[lo]) <= np.abs(grid[hi] - x), grid[lo], grid[hi])


def sylvester_hadamard(n: int) -> np.ndarray:
    h = np.array([[1.0]], dtype=np.float64)
    while h.shape[0] < n:
        h = np.block([[h, h], [h, -h]])
    return h / np.sqrt(n)


def quant_int8_per_tensor(x: np.ndarray) -> np.ndarray:
    s = max(float(np.max(np.abs(x))), 1e-8) / 127.0
    return np.clip(np.round(x / s), -127, 127) * s


def quant_fp8_blocks(x: np.ndarray, bh: int, bw: int, ue8m0: bool = False) -> np.ndarray:
    m, k = x.shape
    blocks = x.reshape(m // bh, bh, k // bw, bw)
    amax = np.maximum(np.max(np.abs(blocks), axis=(1, 3), keepdims=True), 1e-4)
    s = amax / 448.0
    if ue8m0:
        s = np.exp2(np.ceil(np.log2(s)))
    return (snap_to_grid(blocks / s, E4M3_GRID) * s).reshape(m, k)


def quant_fp4_tensor(x: np.ndarray) -> np.ndarray:
    s = max(float(np.max(np.abs(x))), 1e-12) / 6.0
    return snap_to_grid(x / s, E2M1_GRID) * s


def quant_mxfp4(x: np.ndarray, group: int = 32) -> np.ndarray:
    blocks = x.reshape(-1, group)
    amax = np.maximum(np.max(np.abs(blocks), axis=1, keepdims=True), 1e-12)
    s = np.exp2(np.ceil(np.log2(amax / 6.0)))
    return (snap_to_grid(blocks / s, E2M1_GRID) * s).reshape(x.shape)


def sqnr_db(ref: np.ndarray, approx: np.ndarray) -> float:
    sig = float(np.sum(ref ** 2))
    err = float(np.sum((ref - approx) ** 2))
    return 10.0 * np.log10(sig / max(err, 1e-18))


def main() -> None:
    # Part A: 4-element symmetric INT8 walkthrough
    x4 = np.array([0.42, -1.18, 0.05, 0.89], dtype=np.float64)
    s4 = np.max(np.abs(x4)) / 127.0
    q4 = np.clip(np.round(x4 / s4), -127, 127).astype(np.int8)
    x4_hat = q4.astype(np.float64) * s4
    max_err4 = float(np.max(np.abs(x4 - x4_hat)))
    assert max_err4 <= s4 / 2.0 + 1e-12
    print(f"[4-elem] s={s4:.6f}, q={q4.tolist()}, max_err={max_err4:.6f} <= s/2={s4/2:.6f}")

    # Part B: [64, 128] x [128, 128] GEMM with two 40x outlier channels in X
    rng = np.random.default_rng(42)
    x = rng.normal(0.0, 1.0, size=(64, 128))
    outlier_cols = [17, 73]
    x[:, outlier_cols] *= 40.0
    norm_mask = np.ones(128, dtype=bool)
    norm_mask[outlier_cols] = False
    w = rng.normal(0.0, 1.0 / np.sqrt(128.0), size=(128, 128))
    y_ref = x @ w

    # 1) Naive Per-Tensor INT8 (W8A8)
    x_pt, w_pt = quant_int8_per_tensor(x), quant_int8_per_tensor(w)
    # 2) SmoothQuant (alpha=0.5) + Sylvester Hadamard INT8 (W8A8)
    col_s = (np.max(np.abs(x), axis=0) ** 0.5) / (np.max(np.abs(w), axis=1) ** 0.5)
    h = sylvester_hadamard(128)
    x_sqh_q = quant_int8_per_tensor((x / col_s[None, :]) @ h)
    w_sqh_q = quant_int8_per_tensor(h.T @ (w * col_s[:, None]))
    x_sqh_hat = (x_sqh_q @ h.T) * col_s[None, :]
    # 3) DeepSeek-V3 FP8 E4M3FN: 1x128 activation + 128x128 weight block
    x_fp8 = quant_fp8_blocks(x, 1, 128)
    w_fp8 = quant_fp8_blocks(w, 128, 128)
    # 4) FP4 without microscaling vs MXFP4 (E2M1 + group=32 E8M0 scale)
    x_fp4_pt, w_fp4_pt = quant_fp4_tensor(x), quant_fp4_tensor(w)
    x_mx, w_mx = quant_mxfp4(x, 32), quant_mxfp4(w, 32)
    x_mx_rot = quant_mxfp4((x / col_s[None, :]) @ h, 32)
    x_mx_sqh = (x_mx_rot @ h.T) * col_s[None, :]
    w_mx_sqh = quant_mxfp4(h.T @ (w * col_s[:, None]), 32)

    rows = [
        ("Per-Tensor INT8 (W8A8)", x_pt, x_pt @ w_pt, 1.0),
        ("Smooth+Hadamard INT8", x_sqh_hat, x_sqh_q @ w_sqh_q, 1.0),
        ("DS-V3 FP8 (1x128/128x128)", x_fp8, x_fp8 @ w_fp8, 1.0 + 4.0 / (128 * 128)),
        ("Per-Tensor FP4 (no MX)", x_fp4_pt, x_fp4_pt @ w_fp4_pt, 0.5),
        ("MXFP4 g=32 (W4A4)", x_mx, x_mx @ w_mx, 0.5 + 1.0 / 32.0),
        ("Smooth+Hadamard MXFP4", x_mx_sqh, x_mx_rot @ w_mx_sqh, 0.53125),
        ("W4A8 (FP8 x MXFP4 wt)", x_fp8, x_fp8 @ w_mx, 0.5 + 1.0 / 32.0),
    ]
    print(f"{'Scheme':<26} {'NormX_dB':>8} {'GEMM_dB':>8} {'RelL2':>8} {'WtComp':>7}")
    for name, x_hat, y_hat, bpw in rows:
        nx = sqnr_db(x[:, norm_mask], x_hat[:, norm_mask])
        gm = sqnr_db(y_ref, y_hat)
        rl2 = float(np.linalg.norm(y_ref - y_hat) / np.linalg.norm(y_ref))
        print(f"{name:<26} {nx:>8.2f} {gm:>8.2f} {rl2:>8.4f} {2.0 / bpw:>6.2f}x")

    assert sqnr_db(x[:, norm_mask], x_pt[:, norm_mask]) < 15.0
    assert sqnr_db(x[:, norm_mask], x_sqh_hat[:, norm_mask]) > 35.0
    assert sqnr_db(x[:, norm_mask], x_fp8[:, norm_mask]) > 28.0
    assert sqnr_db(x[:, norm_mask], x_fp4_pt[:, norm_mask]) < 1.0
    assert sqnr_db(y_ref, x_fp8 @ w_mx) > sqnr_db(y_ref, x_mx @ w_mx) + 2.0
    print("OK 05")


if __name__ == "__main__":
    main()
