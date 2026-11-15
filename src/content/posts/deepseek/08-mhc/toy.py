# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""12 流形受限超连接（mHC）：Birkhoff 双随机投影、30 层稳定性与 V4.1 Single-Pass 对比。

运行方式：uv run src/content/posts/deepseek/12-mhc/toy.py
"""

from __future__ import annotations

import numpy as np


def rms_norm(x: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    """对最后一维做 RMSNorm，避免特征尺度扰动系数预测。"""
    rms = np.sqrt(np.mean(x * x, axis=-1, keepdims=True) + eps)
    return x / rms


def sinkhorn_knopp(raw: np.ndarray, sk_iters: int = 20, eps: float = 1e-12) -> np.ndarray:
    """将任意实矩阵 exp 后做交替行列归一，投回 Birkhoff 双随机多面体。"""
    shifted = raw - np.max(raw, axis=-1, keepdims=True)
    mat = np.exp(shifted)
    for _ in range(sk_iters):
        mat = mat / np.maximum(mat.sum(axis=1, keepdims=True), eps)
        mat = mat / np.maximum(mat.sum(axis=0, keepdims=True), eps)
    return mat


def amax_gain(mat: np.ndarray) -> tuple[float, float]:
    """论文式 (5) 增益度量：前向 max|行和| 与反向 max|列和|。"""
    fwd = float(np.max(np.abs(mat.sum(axis=1))))
    bwd = float(np.max(np.abs(mat.sum(axis=0))))
    return fwd, bwd


def ds_error(mat: np.ndarray) -> float:
    """衡量矩阵偏离双随机流形（行和=1, 列和=1）的最大绝对误差。"""
    row_err = np.max(np.abs(mat.sum(axis=1) - 1.0))
    col_err = np.max(np.abs(mat.sum(axis=0) - 1.0))
    return float(max(row_err, col_err))


def predict_coeffs(
    x: np.ndarray,
    w_proj: np.ndarray,
    b_proj: np.ndarray,
    sk_iters: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """按 mHC 式 (7)-(9) 从隐藏状态预测非负 A(pre)、双随机 B(res)、非负 C(post)。"""
    flat = rms_norm(x.reshape(-1))
    n = x.shape[0]
    logits = w_proj @ flat + b_proj
    raw_pre = logits[:n]
    raw_post = logits[n : 2 * n]
    raw_res = logits[2 * n :].reshape(n, n)
    a_pre = 1.0 / (1.0 + np.exp(-raw_pre))
    c_post = 2.0 / (1.0 + np.exp(-raw_post))
    b_res = sinkhorn_knopp(raw_res, sk_iters=sk_iters)
    return a_pre, b_res, c_post


def main() -> None:
    rng = np.random.default_rng(42)
    n, d, layers, sk_iters = 4, 32, 30, 20

    # ① 20 层 / 30 层连乘数值对照（无约束 HC vs 20 步 Sinkhorn mHC）
    hc_mats = [1.05 * np.eye(n) + rng.normal(0.06, 0.25, size=(n, n)) for _ in range(layers)]
    mhc_mats = [sinkhorn_knopp(m, sk_iters=sk_iters) for m in hc_mats]

    p_hc = np.eye(n)
    p_mhc = np.eye(n)
    for l in range(layers):
        p_hc = hc_mats[l] @ p_hc
        p_mhc = mhc_mats[l] @ p_mhc
        if l == 19:
            hc_20 = max(amax_gain(p_hc))
            mhc_20 = max(amax_gain(p_mhc))

    hc_30 = max(amax_gain(p_hc))
    mhc_30 = max(amax_gain(p_mhc))
    spec_norm_mhc = float(np.linalg.norm(p_mhc, ord=2))
    mhc_ds_err = ds_error(p_mhc)

    assert hc_30 > 100.0, f"expected HC gain explosion, got {hc_30}"
    if sk_iters >= 20:
        assert mhc_ds_err < 1e-3, f"Birkhoff closure violated: {mhc_ds_err}"
        assert mhc_30 <= 1.0 + 1e-3 and spec_norm_mhc <= 1.0 + 1e-3

    print(f"① {n}x{n} 混合矩阵连乘增益（前向/反向最大值）：")
    print(f"   20 层连乘：无约束 HC = {hc_20:9.2f}×  vs  mHC(sk={sk_iters}) = {mhc_20:.6f}×")
    print(
        f"   30 层连乘：无约束 HC = {hc_30:9.2f}×  vs  mHC(sk={sk_iters}) = {mhc_30:.6f}×"
        f"（谱范数 {spec_norm_mhc:.6f}，双随机误差 {mhc_ds_err:.2e}）"
    )

    # ② 30 层前向传播对比：标准 mHC vs V4.1 Single-Pass mHC（输入混合错位 A_{l-1}）
    w_layers = [rng.normal(0.0, 0.05, size=(n + n + n * n, n * d)) for _ in range(layers)]
    b_layers = [np.concatenate([np.zeros(n), np.zeros(n), (1.5 * np.eye(n)).ravel()]) for _ in range(layers)]
    w_f = [rng.normal(0.0, 0.15 / np.sqrt(d), size=(d, d)) for _ in range(layers)]

    x0 = rng.normal(0.0, 1.0, size=(n, d))
    x_std = x0.copy()
    x_sp = x0.copy()
    a_prev = np.full(n, 1.0 / n)

    max_layer_ds_err = 0.0
    p_sp = np.eye(n)
    for l in range(layers):
        a_l, b_l, c_l = predict_coeffs(x_std, w_layers[l], b_layers[l], sk_iters=sk_iters)
        f_std = np.tanh(w_f[l] @ rms_norm(a_l @ x_std))
        x_std = b_l @ x_std + np.outer(c_l, f_std)

        a_cur, b_sp, c_sp = predict_coeffs(x_sp, w_layers[l], b_layers[l], sk_iters=sk_iters)
        f_sp = np.tanh(w_f[l] @ rms_norm(a_prev @ x_sp))
        x_sp = b_sp @ x_sp + np.outer(c_sp, f_sp)
        a_prev = a_cur

        max_layer_ds_err = max(max_layer_ds_err, ds_error(b_sp))
        p_sp = b_sp @ p_sp

    if sk_iters >= 20:
        assert max_layer_ds_err < 1e-3 and ds_error(p_sp) < 1e-3
    cos_sim = float(np.dot(x_std.ravel(), x_sp.ravel()) / (np.linalg.norm(x_std) * np.linalg.norm(x_sp)))

    # ③ 激活显存访存账本（单位：× d）
    io_multipass = 4 * n + 4
    io_twopass_mega = 3 * n + 2
    io_singlepass_mega = 2 * n + 2

    print("② 30 层端到端动态预测传播（标准 mHC vs V4.1 Single-Pass）：")
    print(f"   单层最大双随机误差 = {max_layer_ds_err:.2e}，30 层复合积 Amax = {max(amax_gain(p_sp)):.6f}×")
    print(f"   标准 mHC 输出 RMS = {np.sqrt(np.mean(x_std**2)):.4f}，"
          f"Single-Pass 输出 RMS = {np.sqrt(np.mean(x_sp**2)):.4f}（方向余弦相似度 {cos_sim:.4f}）")
    print(f"③ n={n} 每层边界激活访存对比（Mega-mHC 融合）：")
    print(f"   三核 Multi-Pass = {io_multipass}d  |  两趟 Mega-mHC = {io_twopass_mega}d  |"
          f"  V4.1 Single-Pass Mega-mHC = {io_singlepass_mega}d（访存减半 {io_multipass / io_singlepass_mega:.1f}×）")
    print("OK 12")


if __name__ == "__main__":
    main()
