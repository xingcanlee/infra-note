"""17 DSpark：延迟公式的三个杠杆、低秩 Markov head、按置信度排验证长度。

uv run --with numpy python toy.py
"""
import numpy as np

# ── ① 延迟公式 L = (T_draft + T_verify) / τ（论文式 (1)） ──
def latency(t_draft, t_verify, tau):
    return (t_draft + t_verify) / tau


base = latency(1.0, 4.0, 2.0)
print('延迟公式 L = (T_draft + T_verify) / τ  —— 三个可动的量\n')
print(f'{"方案":<28}{"T_draft":>9}{"T_verify":>10}{"τ":>7}{"每 token 延迟":>14}')
rows = [
    ('基线', 1.0, 4.0, 2.0),
    ('只把草稿做便宜一半', 0.5, 4.0, 2.0),
    ('只把接受长度提高 50%', 1.0, 4.0, 3.0),
    ('只减少无效验证（T_verify −25%）', 1.0, 3.0, 2.0),
    ('三者同时', 0.5, 3.0, 3.0),
]
for label, d, v, t in rows:
    L = latency(d, v, t)
    print(f'{label:<28}{d:>9.1f}{v:>10.1f}{t:>7.1f}{L:>12.2f}  ({L / base * 100:.0f}%)')
assert latency(0.5, 3.0, 3.0) < min(latency(0.5, 4, 2), latency(1, 4, 3), latency(1, 3, 2))
print('\nτ 在分母上，所以提高接受长度的杠杆最大 —— 但三个量互相牵制：')
print('  草稿做得太便宜 → 猜得差 → τ 下降；草稿做得太好 → T_draft 上升')

# ── ② 低秩 Markov head：B = W1 W2，r=256 ──
V, r, d = 128_000, 256, 7168
full = V * V                       # 完整的 V×V 转移矩阵
lowrank = V * r + r * V            # W1 ∈ R^{V×r}, W2 ∈ R^{r×V}
print(f'\n转移 bias 的参数量（词表 V={V:,}，秩 r={r}）：')
print(f'  完整 V×V 矩阵 ：{full:>18,} 个参数（放不下）')
print(f'  低秩 W1W2     ：{lowrank:>18,} 个参数（{full / lowrank:,.0f} 倍小）')
assert full / lowrank > 200, "低秩分解把参数量压下两个数量级以上"

# 取一行只是查表 + 一次 r×V 乘：不需要物化 V×V
rng = np.random.default_rng(0)
Vs, rs = 1000, 16                  # 缩小规模演示
W1 = rng.normal(size=(Vs, rs)) * 0.1
W2 = rng.normal(size=(rs, Vs)) * 0.1
prev = 42
bias_lowrank = W1[prev] @ W2       # (V,)：先取一行，再一次乘
bias_full = (W1 @ W2)[prev]        # 物化整个 V×V 再取行
assert np.allclose(bias_lowrank, bias_full), '低秩形式与完整矩阵等价'
print(f'  取一行只需 {rs}×{Vs} 次乘加，不必物化 {Vs}×{Vs} 的矩阵 ✓')

# ── ③ 置信度调度：把验证预算给最可能被接受的请求 ──
def survival(cs):
    """prefix survival probability a_j = ∏_{i<=j} c_i（论文 §3.2.1）"""
    out, acc = [], 1.0
    for c in cs:
        acc *= c
        out.append(acc)
    return out


def expected_accepted(cs, ell):
    """安排验证 ell 个时的期望接受数 = Σ_{j<=ell} a_j"""
    return sum(survival(cs)[:ell])


# 三个请求，置信度差别很大
reqs = {
    'A（好猜，如代码补全）': [0.95, 0.93, 0.90, 0.88, 0.85, 0.80],
    'B（一般）': [0.80, 0.65, 0.50, 0.40, 0.30, 0.20],
    'C（难猜，开放创作）': [0.55, 0.30, 0.15, 0.08, 0.04, 0.02],
}
BUDGET = 12          # 一次验证总共能塞多少个 draft token

print(f'\n置信度调度（总验证预算 {BUDGET} 个 draft token，3 个请求）：')
for name, cs in reqs.items():
    print(f'  {name:<22} 各位置 survival = {[round(x, 2) for x in survival(cs)]}')

# 方案一：平均分
even = BUDGET // len(reqs)
acc_even = sum(expected_accepted(cs, even) for cs in reqs.values())

# 方案二：贪心按边际收益分配（每次把下一个名额给 survival 最高的请求）
alloc = {k: 0 for k in reqs}
for _ in range(BUDGET):
    best, gain = None, -1.0
    for k, cs in reqs.items():
        j = alloc[k]
        if j < len(cs):
            g = survival(cs)[j]        # 再加一个位置的边际期望收益
            if g > gain:
                best, gain = k, g
    alloc[best] += 1
acc_sched = sum(expected_accepted(reqs[k], alloc[k]) for k in reqs)

print(f'\n  平均分配  每个请求 {even} 个 → 期望接受 {acc_even:.2f} 个 token')
print(f'  置信度调度 {dict(alloc)} → 期望接受 {acc_sched:.2f} 个 token')
print(f'  同样的验证预算，多产出 {(acc_sched / acc_even - 1) * 100:.1f}%')
assert acc_sched > acc_even, '把预算给更可能被接受的请求，总产出更高'
# 难猜的请求应当分到更少
assert alloc['C（难猜，开放创作）'] < alloc['A（好猜，如代码补全）']

# 验证 batch 大小 B = Σ(1 + ℓ_r)
B = sum(1 + v for v in alloc.values())
print(f'  这一次验证送进主模型的 token 数 B = Σ(1+ℓ_r) = {B}')
assert B == len(reqs) + BUDGET
print('OK 17')
