# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""05 FlashAttention 与硬件对齐内核：在线 Softmax、Split-KV 归并与 exp2 多项式逼近。

uv run --with numpy python toy.py
"""
import numpy as np

rng = np.random.default_rng(42)


# ① 1-query × 4-key 手算例验证：[1.0, 3.0 | 5.0, 2.0]，分两块 B_c = 2
s_demo = np.array([1.0, 3.0, 5.0, 2.0], dtype=np.float64)
v_demo = np.array([[1.0, 0.0], [0.0, 2.0], [2.0, 1.0], [0.0, 4.0]], dtype=np.float64)
p_ref = np.exp(s_demo - np.max(s_demo))
p_ref /= np.sum(p_ref)
o_demo_ref = p_ref @ v_demo

m_run, l_run = -np.inf, 0.0
o_acc = np.zeros(2, dtype=np.float64)
for start in (0, 2):
    s_blk, v_blk = s_demo[start : start + 2], v_demo[start : start + 2]
    m_new = max(m_run, float(np.max(s_blk)))
    scale = float(np.exp(m_run - m_new)) if np.isfinite(m_run) else 0.0
    p_tilde = np.exp(s_blk - m_new)
    l_run = scale * l_run + float(np.sum(p_tilde))
    o_acc = scale * o_acc + p_tilde @ v_blk
    m_run = m_new
o_demo_online = o_acc / l_run
assert np.allclose(o_demo_online, o_demo_ref, atol=1e-12)
print(f"① 4 数手算例：m={m_run:.1f}, l={l_run:.6f}, max|Δo|={np.max(np.abs(o_demo_online - o_demo_ref)):.2e}")


# ② 完整注意力 vs FA-2 分块在线 Softmax（[16, 64]，B_c = 4，延迟归一化）
def naive_attention(Q: np.ndarray, K: np.ndarray, V: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    scale = 1.0 / np.sqrt(Q.shape[-1])
    S = (Q @ K.T) * scale
    m = np.max(S, axis=-1, keepdims=True)
    exp_s = np.exp(S - m)
    lse = np.squeeze(m, axis=-1) + np.log(np.sum(exp_s, axis=-1))
    P = exp_s / np.sum(exp_s, axis=-1, keepdims=True)
    return P @ V, lse


def fa2_tiled_attention(Q: np.ndarray, K: np.ndarray, V: np.ndarray, Bc: int = 4) -> tuple[np.ndarray, np.ndarray]:
    N_q, d = Q.shape
    N_kv = K.shape[0]
    scale = Q.dtype.type(1.0 / np.sqrt(d))
    m = np.full(N_q, -np.inf, dtype=Q.dtype)
    l = np.zeros(N_q, dtype=Q.dtype)
    o_tilde = np.zeros((N_q, V.shape[1]), dtype=Q.dtype)

    for j in range(0, N_kv, Bc):
        K_j, V_j = K[j : j + Bc], V[j : j + Bc]
        S_j = (Q @ K_j.T) * scale
        m_new = np.maximum(m, np.max(S_j, axis=-1))
        alpha = np.exp(m - m_new)
        P_tilde = np.exp(S_j - m_new[:, None])
        l = alpha * l + np.sum(P_tilde, axis=-1)
        o_tilde = alpha[:, None] * o_tilde + P_tilde @ V_j
        m = m_new

    return o_tilde / l[:, None], m + np.log(l)


N, d = 16, 64
Q = rng.normal(0.0, 1.0, size=(N, d))
K = rng.normal(0.0, 1.0, size=(N, d))
V = rng.normal(0.0, 1.0, size=(N, d))

O_naive, lse_naive = naive_attention(Q, K, V)
O_fa2, lse_fa2 = fa2_tiled_attention(Q, K, V, Bc=4)
err_fa2 = float(np.max(np.abs(O_fa2 - O_naive)))
assert err_fa2 < 1e-6
print(f"② FA-2 分块在线 Softmax ([16, 64], Bc=4)：max|ΔO| = {err_fa2:.2e}")


# ③ Split-KV（num_splits = 3）与 LogSumExp 跨分片归并
def split_kv_attention(Q: np.ndarray, K: np.ndarray, V: np.ndarray, num_splits: int = 3) -> np.ndarray:
    chunks_k = np.array_split(K, num_splits, axis=0)
    chunks_v = np.array_split(V, num_splits, axis=0)
    o_parts, lse_parts = [], []
    for k_c, v_c in zip(chunks_k, chunks_v):
        o_c, lse_c = fa2_tiled_attention(Q, k_c, v_c, Bc=4)
        o_parts.append(o_c)
        lse_parts.append(lse_c)
    o_stack = np.stack(o_parts, axis=0)       # [S, N_q, d]
    lse_stack = np.stack(lse_parts, axis=0)   # [S, N_q]
    m_global = np.max(lse_stack, axis=0, keepdims=True)
    w = np.exp(lse_stack - m_global)
    w = w / np.sum(w, axis=0, keepdims=True)
    return np.sum(w[:, :, None] * o_stack, axis=0)


O_split3 = split_kv_attention(Q, K, V, num_splits=3)
err_split3 = float(np.max(np.abs(O_split3 - O_naive)))
assert err_split3 < 1e-6
print(f"③ Split-KV 归并 (num_splits=3)：max|ΔO| = {err_split3:.2e}")

# 浮点结合律与归约顺序差异（FP32 下不同 num_splits 的微弱漂移）
O_s1_f32 = split_kv_attention(Q.astype(np.float32), K.astype(np.float32), V.astype(np.float32), num_splits=1)
O_s5_f32 = split_kv_attention(Q.astype(np.float32), K.astype(np.float32), V.astype(np.float32), num_splits=5)
drift_f32 = float(np.max(np.abs(O_s1_f32 - O_s5_f32)))
print(f"   FP32 不同分片数 (1 vs 5) 归约顺序漂移：max|ΔO| = {drift_f32:.2e}")


# ④ FA-4 多项式 exp2 逼近（2^x = 2^floor(x) * poly(frac(x))）与 BF16 量化阶比较
def to_bf16_sim(x: np.ndarray) -> np.ndarray:
    u = x.astype(np.float32).view(np.uint32)
    lsb = (u >> 16) & np.uint32(1)
    rounded = u + np.uint32(0x7FFF) + lsb
    return (rounded & np.uint32(0xFFFF0000)).view(np.float32)


xs = np.linspace(-8.0, 4.0, 200_000, dtype=np.float64)
exact_2x = np.exp2(xs)
# 在 [0, 1) 上用切比雪夫节点拟合 3 次与 5 次多项式，模拟 Horner FMA 路径
nodes = 0.5 * (1.0 - np.cos(np.pi * (np.arange(200) + 0.5) / 200.0))
c3 = np.polyfit(nodes, np.exp2(nodes), deg=3)
c5 = np.polyfit(nodes, np.exp2(nodes), deg=5)

x_int = np.floor(xs).astype(np.int32)
x_frac = xs - x_int
poly3_2x = np.ldexp(np.polyval(c3, x_frac), x_int)
poly5_2x = np.ldexp(np.polyval(c5, x_frac), x_int)

rel_deg3 = float(np.max(np.abs(poly3_2x - exact_2x) / exact_2x))
rel_deg5 = float(np.max(np.abs(poly5_2x - exact_2x) / exact_2x))
rel_bf16_ideal = float(np.max(np.abs(to_bf16_sim(exact_2x) - exact_2x) / exact_2x))
rel_bf16_deg3 = float(np.max(np.abs(to_bf16_sim(poly3_2x) - exact_2x) / exact_2x))
assert rel_deg3 < 2e-4 and rel_deg5 < 1e-6 and rel_bf16_deg3 < 5e-3
print(f"④ exp2 多项式逼近：3 次 max rel={rel_deg3:.2e}，5 次 max rel={rel_deg5:.2e}")
print(f"   落回 BF16 后误差被 7-bit 尾数淹没：理想 BF16={rel_bf16_ideal:.2e} vs 3 次={rel_bf16_deg3:.2e}")
print("OK 05")
