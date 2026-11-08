"""10 CSA：重叠压缩、两级省法、窗口补洞。

uv run --with numpy python toy.py
"""
import numpy as np


def softmax_cols(z):
    """按列（跨 2m 个元素）做 softmax，-inf 安全。"""
    m = np.where(np.isfinite(z), z, -np.inf).max(axis=0, keepdims=True)
    m = np.where(np.isfinite(m), m, 0.0)
    e = np.exp(np.where(np.isfinite(z), z - m, -np.inf))
    return e / e.sum(axis=0, keepdims=True)


def csa_compress(H, W_aKV, W_bKV, W_aZ, W_bZ, B_a, B_b, m):
    """式 (9)–(12)：重叠的两套区间 + 可学习位置偏置 + 逐元素加权求和。"""
    n = H.shape[0]
    C_a, C_b = H @ W_aKV, H @ W_bKV
    Z_a, Z_b = H @ W_aZ, H @ W_bZ
    out, weights = [], []
    for i in range(n // m):
        za = Z_a[m * i:m * (i + 1)] + B_a
        ca = C_a[m * i:m * (i + 1)]
        if i == 0:
            zb = np.full((m, Z_b.shape[1]), -np.inf)
            cb = np.zeros((m, C_b.shape[1]))
        else:
            zb = Z_b[m * (i - 1):m * i] + B_b
            cb = C_b[m * (i - 1):m * i]
        z = np.concatenate([za, zb], axis=0)
        s = softmax_cols(z)
        out.append((s[:m] * ca).sum(0) + (s[m:] * cb).sum(0))
        weights.append(s)
    return np.array(out), weights


rng = np.random.default_rng(0)
n, d, c, m = 64, 32, 8, 4
H = rng.normal(size=(n, d))
W_aKV, W_bKV = rng.normal(size=(d, c)) * 0.3, rng.normal(size=(d, c)) * 0.3
W_aZ, W_bZ = rng.normal(size=(d, c)) * 0.3, rng.normal(size=(d, c)) * 0.3
B_a, B_b = rng.normal(size=(m, c)) * 0.3, rng.normal(size=(m, c)) * 0.3

comp, weights = csa_compress(H, W_aKV, W_bKV, W_aZ, W_bZ, B_a, B_b, m)
print(f'原始序列 {n} 个 token → 压缩成 {len(comp)} 个条目（m={m}，压到 1/{m}）')
assert comp.shape == (n // m, c)

print(f'每个压缩条目实际看了 {2 * m} 个 token（2m），但序列只缩到 1/{m} —— 相邻条目重叠')
w1 = weights[1]
assert np.allclose(w1.sum(axis=0), 1.0), '2m 个元素上的 softmax，每一维权重和为 1'
col = w1[:m, 0]
print(f'压缩权重是学出来的：同一块内各 token 的权重 {col.round(2)}，不是均匀的 {1 / m}')
assert not np.allclose(col, 1 / m), '不是平均池化'

# 第 0 个条目：没有前一块，前半权重应占满
assert np.allclose(weights[0][:m].sum(axis=0), 1.0), 'i=0 时 C^b 区间被屏蔽'
assert np.allclose(weights[0][m:], 0.0)

# ── 两级省法 ──
L, m_v4, k_v4 = 1024 * 1024, 4, 1024
after_comp = L // m_v4
print(f'\n两级省法（1M 上下文、m={m_v4}、k={k_v4}）：')
print(f'  压缩：{L} → {after_comp} 个条目（1/{m_v4}）')
print(f'  稀疏：{after_comp} → {k_v4} 个条目（1/{after_comp // k_v4}）')
print(f'  合计读 {k_v4} / {L} = {k_v4 / L * 100:.3f}% 的历史')
idx_dense = L * L
idx_comp = after_comp * after_comp
print(f'  indexer 打分对数：从 {idx_dense:.1e} 降到 {idx_comp:.1e}（省 {idx_dense // idx_comp} 倍 = m²）')
assert idx_dense // idx_comp == m_v4 ** 2, 'indexer 的平方项按 m² 下降'
assert k_v4 / L < 0.001

# ── 窗口分支补洞：同块邻居压缩分支读不到 ──
t = n - 1
own_block = t // m
neighbors = [s for s in range(own_block * m, t) if s != t]
# 压缩分支只能读 s < floor(t/m) 的块，即严格在当前块之前
readable_blocks = [b for b in range(own_block)]
readable_tokens = {s for b in readable_blocks for s in range(b * m, (b + 1) * m)}
win = set(range(max(0, t - 4 + 1), t + 1))
print(f'\n窗口分支补洞：当前 token 所在块内的其他 token，压缩分支读不到')
print(f'  位置 {t} 的同块邻居 {neighbors}：压缩分支 '
      f'{"✓" if all(s in readable_tokens for s in neighbors) else "✗"}，'
      f'窗口分支 {"✓" if all(s in win for s in neighbors) else "✗"}')
assert not any(s in readable_tokens for s in neighbors), '同块邻居确实在压缩分支之外'
assert all(s in win for s in neighbors), '窗口分支把它们补回来了'
print('OK 10')
