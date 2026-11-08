"""05 解耦 RoPE 与矩阵吸收：两条路径的等价性与代价。

uv run --with numpy python toy.py
"""
import numpy as np

n_heads, d_c, d_nope, d_rope, d_v, L = 2, 3, 4, 2, 4, 4

rng = np.random.default_rng(0)
c = rng.normal(size=(L, d_c))              # 缓存里的 latent
k_pe = rng.normal(size=(L, d_rope))        # 缓存里的位置分支（所有 head 共享一份）
q_c = rng.normal(size=(n_heads, d_nope))   # 当前 token 的内容分支 Query
q_r = rng.normal(size=(n_heads, d_rope))   # 当前 token 的位置分支 Query
W_uk = rng.normal(size=(n_heads, d_nope, d_c))
W_uv = rng.normal(size=(n_heads, d_v, d_c))


def naive(h):
    """先把 latent 展开成 K/V，再按常规注意力算。"""
    k_c = c @ W_uk[h].T                       # (L, d_nope) ← 物化出来了
    v = c @ W_uv[h].T                         # (L, d_v)
    e = k_c @ q_c[h] + k_pe @ q_r[h]
    a = np.exp(e - e.max())
    a /= a.sum()
    return a @ v


def absorb(h):
    """把上投影折进 Query / 折到输出侧，全程不展开 K/V。"""
    q_tilde = W_uk[h].T @ q_c[h]              # (d_c,) ← 吸收 Key 侧
    e = c @ q_tilde + k_pe @ q_r[h]
    a = np.exp(e - e.max())
    a /= a.sum()
    z = a @ c                                 # (d_c,) 在 latent 空间里聚合
    return W_uv[h] @ z                        # 最后一次上投影 ← 吸收 Value 侧


for h in range(n_heads):
    assert np.allclose(naive(h), absorb(h)), '吸收是恒等变形，结果必须相同'
print('两条路径逐位相同 ✓')

# 浮点顺序差异真实存在：允许末位不同，但不能期待逐位相等
diffs = [np.abs(naive(h) - absorb(h)).max() for h in range(n_heads)]
print(f'最大绝对差：{max(diffs):.2e}（来自浮点求和顺序，不是算法差异）')

# ── RoPE 的关键性质：R_t^T R_s = R_{s-t}，分数只依赖相对位置 ──
def rot(theta):
    return np.array([[np.cos(theta), -np.sin(theta)],
                     [np.sin(theta), np.cos(theta)]])


theta = 0.37
q2 = rng.normal(size=2)
k2 = rng.normal(size=2)
for (t, s) in [(5, 2), (9, 6), (100, 97)]:      # 同样的相对距离 3
    lhs = (rot(t * theta) @ q2) @ (rot(s * theta) @ k2)
    rhs = q2 @ (rot((s - t) * theta) @ k2)
    assert np.allclose(lhs, rhs), 'RoPE：旋转后的内积等于按相对位置旋转一次'
rel = [(rot(t * theta) @ q2) @ (rot((t - 3) * theta) @ k2) for t in (5, 9, 100)]
assert np.allclose(rel, rel[0]), '相对距离相同 → 分数相同（平移不变）'
print(f'相对距离 3 的分数在位置 5/9/100 处都是 {rel[0]:.6f} ✓')


# ── 代价对照：V3 的真实维度 ──
def cost(L_, d_k, d_c_):
    return {'naive': L_ * (d_k * d_c_ + d_k), 'absorb': d_k * d_c_ + L_ * d_c_}


d_k_v3, d_c_v3 = 128, 512          # qk_nope_head_dim, kv_lora_rank
for L_ in (4096, 128 * 1024):
    x = cost(L_, d_k_v3, d_c_v3)
    print(f'L={L_:>6}：朴素 {x["naive"]:>14,} 次乘法   吸收 {x["absorb"]:>12,} 次   '
          f'{x["naive"] / x["absorb"]:.1f}×')

x4k = cost(4096, d_k_v3, d_c_v3)
assert x4k['naive'] == 4096 * (128 * 512 + 128) == 268_959_744
assert x4k['absorb'] == 128 * 512 + 512 * 4096 == 2_162_688
# 比值趋近 d_k
big = cost(10 ** 9, d_k_v3, d_c_v3)
assert abs(big['naive'] / big['absorb'] - d_k_v3) < 1.0, '历史越长，比值越接近 d_k'
print('OK 05')
