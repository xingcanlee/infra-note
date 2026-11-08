"""18 在线 softmax：不物化整行、数值稳定、与朴素实现逐位一致。

uv run python toy.py        # 不需要 numpy
"""
import math


def naive_softmax_dot(scores, values, subtract_max=True):
    """朴素实现：先物化整行。"""
    m = max(scores) if subtract_max else 0.0
    e = [math.exp(x - m) for x in scores]
    return sum(ei * v for ei, v in zip(e, values)) / sum(e)


def online_softmax_dot(scores, values, block_size, tau=None):
    """分块遍历，只保留 m / l / o 三个标量。tau 不为 None 时启用 FA4 的条件重缩放。"""
    m, l, o = float('-inf'), 0.0, 0.0
    n_rescale = n_skip = 0
    for b in range(0, len(scores), block_size):
        s, v = scores[b:b + block_size], values[b:b + block_size]
        prev_m, new_m = m, max(m, max(s))
        grew = float('inf') if prev_m == float('-inf') else new_m - prev_m

        if tau is None or grew > tau:                    # 重缩放
            scale = 0.0 if prev_m == float('-inf') else math.exp(prev_m - new_m)
            l = scale * l + sum(math.exp(x - new_m) for x in s)
            o = scale * o + sum(math.exp(x - new_m) * vi for x, vi in zip(s, v))
            m = new_m
            n_rescale += 1
        else:                                            # 跳过重缩放
            l += sum(math.exp(x - prev_m) for x in s)
            o += sum(math.exp(x - prev_m) * vi for x, vi in zip(s, v))
            n_skip += 1
    return o / l, n_rescale, n_skip                      # 只归一化一次


SCORES = [1.2, -0.4, 3.1, 0.8, 2.2, -1.5, 0.3, 4.0]
VALUES = [1, 2, 3, 4, 5, 6, 7, 8]

ref = naive_softmax_dot(SCORES, VALUES)
print(f'{"朴素实现（先物化整行）":<28}= {ref:.6f}')
for bs in (1, 2, 3, 8):
    got, _, _ = online_softmax_dot(SCORES, VALUES, bs)
    extra = '  峰值只存 3 个标量' if bs == 1 else ''
    print(f'{f"在线 softmax（块大小 {bs}）":<28}= {got:.6f}   ✓{extra}')
    assert abs(got - ref) < 1e-12, '在线 softmax 是精确的，不是近似'

got, nr, ns = online_softmax_dot(SCORES, VALUES, 2, tau=8)
print(f'{"条件重缩放（τ=8）":<28}= {got:.6f}   ✓  重缩放 {nr} 次，跳过 {ns} 次')
assert abs(got - ref) < 1e-9, '条件重缩放仍在容差内'
assert ns > 0, 'τ=8 时应当跳过一些重缩放'

# 数值稳定性
print('\n分数全部 +1000（测溢出）：')
big = [x + 1000 for x in SCORES]
try:
    bad = naive_softmax_dot(big, VALUES, subtract_max=False)
    status = f'{bad:.6f}'
except OverflowError:
    status = 'OverflowError'
if status not in ('OverflowError',) and not math.isfinite(float(status)):
    status = 'inf（溢出）'
print(f'  朴素实现（不减最大值）→ {status}')
got_big, _, _ = online_softmax_dot(big, VALUES, 2)
print(f'  在线 softmax          → {got_big:.6f}   ✓ running max 保证了稳定性')
assert abs(got_big - ref) < 1e-9, 'softmax 平移不变：+1000 不改变结果'

# 显存对照
L = 4096
print(f'\n显存：L={L} 时')
print(f'  朴素：物化 {L}×{L} = {L * L:,} 个分数')
print('  在线：3 个标量（输出向量另算）')
print(f'  比值：{L * L // 3:,} 倍')
assert L * L // 3 > 5_000_000

# τ 太大时会开始失真
print('\nτ 越大跳过越多，但数值余量越小：')
for tau in (0.5, 8, 100, 1000):
    g, nr2, ns2 = online_softmax_dot(SCORES, VALUES, 1, tau=tau)
    print(f'  τ={tau:>6}：重缩放 {nr2} 次、跳过 {ns2} 次，误差 {abs(g - ref):.2e}')
_, _, ns_small = online_softmax_dot(SCORES, VALUES, 1, tau=0.5)
_, _, ns_big = online_softmax_dot(SCORES, VALUES, 1, tau=1000)
assert ns_big >= ns_small
print('OK 18')
