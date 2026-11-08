"""09 DSA：Lightning Indexer 的训练、准确度、复杂度交易与固定 k 的后果。

indexer 用论文 §2.1.1 的 KL 目标训练：让 Softmax(I_t,:) 去对齐主注意力的聚合分布。
梯度手写（numpy），因为 d/dI KL(p‖softmax(I)) = softmax(I) − p，很短。

uv run --with numpy python toy.py
"""
import numpy as np


def softmax(z, axis=-1):
    z = z - z.max(axis=axis, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=axis, keepdims=True)


# ────────── Lightning Indexer ──────────
def indexer_scores(h_t, h_hist, Wq, Wk, Ww, H_I):
    """I[t, s]：head 少、ReLU（不是 exp）。返回 (I, 中间量) 供反向用。"""
    q = (h_t @ Wq).reshape(H_I, -1)          # (H_I, d_I)
    k = h_hist @ Wk                           # (L, d_I)
    w = h_t @ Ww                              # (H_I,)
    a = q @ k.T                               # (H_I, L)
    r = np.maximum(a, 0.0)                    # ReLU
    return (w[:, None] * r).sum(axis=0), (q, k, w, a, r)


def indexer_grads(h_t, h_hist, Wq, Wk, Ww, H_I, g):
    """g = dL/dI（长度 L）。返回 dWq, dWk, dWw。"""
    _, (q, k, w, a, r) = indexer_scores(h_t, h_hist, Wq, Wk, Ww, H_I)
    d_w = r @ g                                       # (H_I,)
    d_a = (w[:, None] * (a > 0)) * g[None, :]         # (H_I, L)
    d_q = d_a @ k                                     # (H_I, d_I)
    d_k = d_a.T @ q                                   # (L, d_I)
    return (np.outer(h_t, d_q.reshape(-1)),
            h_hist.T @ d_k,
            np.outer(h_t, d_w))


def dsa_select(scores, k):
    k = min(k, len(scores))
    return np.sort(np.argpartition(-scores, k - 1)[:k])


# ────────── ① indexer 必须训练才挑得准 ──────────
rng = np.random.default_rng(0)
L, d, d_I, H_I, k = 256, 32, 16, 4, 32
n_query = 48

h = rng.normal(size=(L + n_query, d))
Wq_main = rng.normal(size=(d, d)) * 0.2
Wk_main = rng.normal(size=(d, d)) * 0.2

# 主注意力（稠密）的分布，作为 KL 目标 p
keys_main = h[:L] @ Wk_main
queries = h[L:]
p = softmax(queries @ Wq_main @ keys_main.T / np.sqrt(d), axis=-1)   # (n_query, L)

Wq = rng.normal(size=(d, H_I * d_I)) * 0.1
Wk = rng.normal(size=(d, d_I)) * 0.1
Ww = rng.normal(size=(d, H_I)) * 0.1


def coverage(Wq_, Wk_, Ww_):
    """indexer 选中的集合覆盖了多少真实注意力质量（平均）。"""
    tot = 0.0
    for i, h_t in enumerate(queries):
        I, _ = indexer_scores(h_t, h[:L], Wq_, Wk_, Ww_, H_I)
        tot += p[i][dsa_select(I, k)].sum()
    return tot / len(queries)


cov_before = coverage(Wq, Wk, Ww)

lr = 0.02
for step in range(400):
    gq = np.zeros_like(Wq); gk = np.zeros_like(Wk); gw = np.zeros_like(Ww)
    for i, h_t in enumerate(queries):
        I, _ = indexer_scores(h_t, h[:L], Wq, Wk, Ww, H_I)
        g = softmax(I) - p[i]                 # d/dI KL(p‖softmax(I))
        a, b, c = indexer_grads(h_t, h[:L], Wq, Wk, Ww, H_I, g)
        gq += a; gk += b; gw += c
    n = len(queries)
    Wq -= lr * gq / n; Wk -= lr * gk / n; Ww -= lr * gw / n

cov_after = coverage(Wq, Wk, Ww)
cov_oracle = np.sort(p, axis=-1)[:, ::-1][:, :k].sum(axis=-1).mean()

print(f'随机初始化的 indexer：  选中集合覆盖了 {cov_before * 100:.1f}% 的真实注意力质量')
print(f'按 KL 目标训练之后：    选中集合覆盖了 {cov_after * 100:.1f}% 的真实注意力质量')
print(f'（上限：直接取真实注意力 top-{k} 可覆盖 {cov_oracle * 100:.1f}%）')
assert cov_after > cov_before * 1.5, '训练后的 indexer 应当显著更准'
assert cov_after <= cov_oracle + 1e-9, '不可能超过直接取真实 top-k 的上限'

# ────────── ② 复杂度交易 ──────────
print('\n--- 按乘法次数估算（indexer 的每对位置工作量远小于主注意力）')
d_main, d_idx = 576, 72
for L_ in (4096, 32768, 131072):
    k_ = 2048
    idx_cost = L_ * L_ * d_idx
    attn_sparse = L_ * min(k_, L_) * d_main
    attn_dense = L_ * L_ * d_main
    share = idx_cost / (idx_cost + attn_sparse)
    saved = 1 - attn_sparse / attn_dense
    print(f'L={L_:>7}, k={k_}：indexer 占总量 {share * 100:4.1f}%，主注意力省了 {saved * 100:.1f}%')
# 序列够长时 indexer 自己成为主要开销
big = 131072 * 131072 * d_idx / (131072 * 131072 * d_idx + 131072 * 2048 * d_main)
assert big > 0.5, 'L 很大时 indexer 占比超过一半'

# ────────── ③ 固定 k 的后果 ──────────
print('\n--- k 固定为 2048，覆盖率随上下文下降')
for L_ in (4096, 32768, 131072):
    print(f'L={L_:>7}：读 {min(2048, L_) / L_ * 100:5.1f}% 的历史')
assert abs(2048 / 131072 - 0.015625) < 1e-12
print('OK 09')
