# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""06 原生稀疏注意力（NSA）：Attention Sink 数值验算与三分支 GQA 块稀疏等价性。

uv run src/content/posts/deepseek/06-swa-and-nsa/toy.py
"""
import numpy as np


def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    m = np.max(x, axis=axis, keepdims=True)
    e = np.exp(x - m)
    return e / np.sum(e, axis=axis, keepdims=True)


def jsd(p: np.ndarray, q: np.ndarray) -> float:
    m = 0.5 * (p + q)
    tp = np.sum(p[p > 0] * np.log(p[p > 0] / m[p > 0]))
    tq = np.sum(q[q > 0] * np.log(q[q > 0] / m[q > 0]))
    return float(0.5 * (tp + tq))


rng = np.random.default_rng(42)

# ① 8 词元 Attention Sink 数值推演（t=0..7，局部窗口 w=4 保留 [4..7]）
logits = np.array([6.0, 0.2, 0.1, 0.0, 1.0, 1.2, 1.5, 2.0])
V_8 = rng.normal(0.0, 1.0, size=(8, 4))
p_full = softmax(logits)
p_win = np.zeros(8)
p_win[4:] = softmax(logits[4:])
p_sw = np.zeros(8)
p_sw[[0, 4, 5, 6, 7]] = softmax(logits[[0, 4, 5, 6, 7]])

eps = 1e-12
kl_win = float(np.sum(p_full * np.log((p_full + eps) / (p_win + eps))))
kl_sw = float(np.sum(p_full * np.log((p_full + eps) / (p_sw + eps))))
err_win = float(np.linalg.norm(p_win @ V_8 - p_full @ V_8))
err_sw = float(np.linalg.norm(p_sw @ V_8 - p_full @ V_8))
assert kl_sw < kl_win / 100 and err_sw < err_win / 50

# 中段关键事实（t=2 突刺）在纯 Sink+SWA 下被完全遗忘
logits_mid = np.array([6.0, 0.2, 7.5, 0.0, 1.0, 1.2, 1.5, 2.0])
p_mid_full = softmax(logits_mid)
p_mid_sw = np.zeros(8)
p_mid_sw[[0, 4, 5, 6, 7]] = softmax(logits_mid[[0, 4, 5, 6, 7]])
err_mid = float(np.linalg.norm(p_mid_sw @ V_8 - p_mid_full @ V_8))
assert p_mid_full[2] > 0.80 and p_mid_sw[2] == 0.0

print(f'① 8 词元 Softmax 失真：Full 局部总重={p_full[4:].sum():.4f}, '
      f'无 Sink={p_win[4:].sum():.4f}, 留 Sink={p_sw[4:].sum():.4f}')
print(f'   KL(ε=1e-12)：无 Sink={kl_win:.4f} vs 留 Sink={kl_sw:.4f} | '
      f'JSD：{jsd(p_full, p_win):.4f} vs {jsd(p_full, p_sw):.4f}')
print(f'   输出误差 ||Δo||：无 Sink={err_win:.4f} vs 留 Sink={err_sw:.4f} | '
      f'中段事实 t=2 遗忘误差={err_mid:.4f}')

# ② 完整三分支 NSA（单组 GQA，G_q=16 查询头共享 1 组三分支 KV，T=1024）
T, G_q, d_k, d_v = 1024, 16, 24, 16
l_blk, stride, l_prime, top_n, w_win, B_k = 32, 16, 64, 4, 64, 32

x_seq = rng.normal(0.0, 0.4, size=(T, d_k))
Q_g = rng.normal(0.0, 0.5, size=(G_q, d_k))  # 当前词元 t=T-1 的 GQA 整组查询
W_K = {c: rng.normal(0.0, 0.3, size=(d_k, d_k)) for c in ('cmp', 'slc', 'win')}
W_V = {c: rng.normal(0.0, 0.3, size=(d_k, d_v)) for c in ('cmp', 'slc', 'win')}
W_phi_k = rng.normal(0.0, 0.25, size=(l_blk * d_k, d_k))
W_phi_v = rng.normal(0.0, 0.25, size=(l_blk * d_v, d_v))
pos_k = rng.normal(0.0, 0.1, size=(l_blk, d_k))
pos_v = rng.normal(0.0, 0.1, size=(l_blk, d_v))
W_gate = rng.normal(0.0, 0.2, size=(d_k, 3))

# 分支 1：粗粒度压缩 cmp（带块内位置编码的可学习压缩映射 φ）
n_cmp = (T - l_blk) // stride + 1
k_cmp_raw = x_seq @ W_K['cmp']
v_cmp_raw = x_seq @ W_V['cmp']
starts = np.arange(n_cmp) * stride
K_cmp = np.stack([(k_cmp_raw[s : s + l_blk] + pos_k).reshape(-1) @ W_phi_k for s in starts])
V_cmp = np.stack([(v_cmp_raw[s : s + l_blk] + pos_v).reshape(-1) @ W_phi_v for s in starts])
p_cmp = softmax((Q_g @ K_cmp.T) / np.sqrt(d_k), axis=-1)  # [G_q, n_cmp]
o_cmp = p_cmp @ V_cmp                                    # [G_q, d_v]

# 分支 2：复用 p_cmp 计算选择块得分，并在 GQA 组内求和以共享 Top-n 块下标
n_slc = T // l_prime
overlap = np.zeros((n_slc, n_cmp))
for j in range(n_slc):
    b_lo, b_hi = j * l_prime, (j + 1) * l_prime
    for i, s in enumerate(starts):
        if s + l_blk > b_lo and s < b_hi:
            overlap[j, i] = 1.0
p_slc_heads = p_cmp @ overlap.T               # [G_q, n_slc]
p_slc_group = np.sum(p_slc_heads, axis=0)     # GQA 组共享聚合得分 [n_slc]
shared_blocks = np.sort(np.argsort(p_slc_group)[-top_n:])
indep_blocks = [np.argsort(p_slc_heads[h])[-top_n:] for h in range(G_q)]
union_blocks = len(set().union(*map(set, indep_blocks)))

k_slc_all, v_slc_all = x_seq @ W_K['slc'], x_seq @ W_V['slc']
sel_tok = np.concatenate([np.arange(b * l_prime, (b + 1) * l_prime) for b in shared_blocks])
K_slc, V_slc = k_slc_all[sel_tok], v_slc_all[sel_tok]
o_slc_ref = softmax((Q_g @ K_slc.T) / np.sqrt(d_k), axis=-1) @ V_slc

# 对照组共享块内循环：以 [G_q, d_k] @ [d_k, B_k] 在 SRAM 分块在线 Softmax 累加
m_run = np.full(G_q, -np.inf)
l_run = np.zeros(G_q)
o_tilde = np.zeros((G_q, d_v))
inv_sqrt_d = 1.0 / np.sqrt(d_k)
for blk in shared_blocks:
    for off in range(0, l_prime, B_k):
        K_b = k_slc_all[blk * l_prime + off : blk * l_prime + off + B_k]
        V_b = v_slc_all[blk * l_prime + off : blk * l_prime + off + B_k]
        S_b = (Q_g @ K_b.T) * inv_sqrt_d      # 硬件 MMA：[G_q, d_k] @ [d_k, B_k]
        m_new = np.maximum(m_run, np.max(S_b, axis=-1))
        alpha = np.exp(m_run - m_new)
        P_b = np.exp(S_b - m_new[:, None])
        l_run = alpha * l_run + np.sum(P_b, axis=-1)
        o_tilde = alpha[:, None] * o_tilde + P_b @ V_b
        m_run = m_new
o_slc_tiled = o_tilde / l_run[:, None]
slc_diff = float(np.max(np.abs(o_slc_ref - o_slc_tiled)))

# 分支 3：局部滑动窗口 win 与可学习 Sigmoid 门控融合
K_win, V_win = (x_seq[-w_win:] @ W_K['win']), (x_seq[-w_win:] @ W_V['win'])
o_win = softmax((Q_g @ K_win.T) / np.sqrt(d_k), axis=-1) @ V_win

gates = 1.0 / (1.0 + np.exp(-(x_seq[-1] @ W_gate)))  # g_t^c ∈ (0, 1), shape [3]
o_nsa_ref = gates[0] * o_cmp + gates[1] * o_slc_ref + gates[2] * o_win
o_nsa_tiled = gates[0] * o_cmp + gates[1] * o_slc_tiled + gates[2] * o_win
nsa_diff = float(np.max(np.abs(o_nsa_ref - o_nsa_tiled)))

N_t = K_cmp.shape[0] + K_slc.shape[0] + K_win.shape[0]
assert K_cmp.shape == (63, d_k) and K_slc.shape == (256, d_k) and K_win.shape == (64, d_k)
assert o_nsa_tiled.shape == (G_q, d_v) and nsa_diff < 1e-14
assert union_blocks > top_n

print(f'② 三分支张量形状：K_cmp={K_cmp.shape}, K_slc={K_slc.shape}, K_win={K_win.shape}')
print(f'   活跃 KV 预算 N_t = {N_t} / T={T}（占比 {N_t / T:.1%}，稀疏跳过 {1 - N_t / T:.1%}）')
print(f'   GQA 组共享等价性 max|ΔO| = {nsa_diff:.2e}，门控 g=[{gates[0]:.3f}, {gates[1]:.3f}, {gates[2]:.3f}]')
print(f'   slc 访存节省：独立选块并集={union_blocks} 块（{union_blocks * l_prime} tokens）'
      f' vs 组共享={top_n} 块（{top_n * l_prime} tokens，带宽省 {union_blocks / top_n:.2f}×）')
print('OK 06')
