"""06 稀疏注意力地图：统一的 mask 接口与三个指标。

与 src/explainers/core/masks.ts 是同一套定义（动画、正文、本脚本三处一致）。

uv run --with numpy python toy.py
"""
from collections import deque

# ── 读取集合：位置 t 是否允许读取位置 s ──
def causal(t, s, L):
    return s <= t


def sliding_window(w):
    return lambda t, s, L: s <= t and t - s < w


def window_with_sink(w, n_sink=1):
    return lambda t, s, L: s <= t and (t - s < w or s < n_sink)


def block_select(block, keep):
    return lambda t, s, L: s <= t and t // block - s // block < keep


def strided(stride):
    return lambda t, s, L: s <= t and (s % stride == 0 or s == t)


def union(*fns):
    return lambda t, s, L: any(f(t, s, L) for f in fns)


# ── 三个指标 ──
def density(L, fn):
    """相对因果基线的密度。"""
    kept = sum(1 for t in range(L) for s in range(t + 1) if fn(t, s, L))
    return kept / (L * (L + 1) / 2)


def row_counts(L, fn):
    return [sum(1 for s in range(t + 1) if fn(t, s, L)) for t in range(L)]


def receptive_field(L, fn, t, n_layers):
    """用真实可达性算 n_layers 层后能看到的最早位置（不是 w × 层数的估算）。"""
    reach = {t}
    for _ in range(n_layers):
        nxt = set(reach)
        for p in reach:
            for s in range(p + 1):
                if fn(p, s, L):
                    nxt.add(s)
        reach = nxt
    return min(reach)


L = 8
catalog = [
    ('因果（全读）', causal),
    ('滑动窗口 w=2', sliding_window(2)),
    ('窗口 + 锚点', window_with_sink(2, 1)),
    ('选块 2×1', block_select(2, 1)),
    ('跨步 2', strided(2)),
    ('多分支并集', union(sliding_window(2), block_select(2, 2))),
]
print(f'{"机制":<16}{"密度":>8}{"单步≤":>8}{"单层可达":>10}{"4层可达":>9}')
for name, fn in catalog:
    print(f'{name:<16}{density(L, fn) * 100:7.1f}%{max(row_counts(L, fn)):>8}'
          f'{receptive_field(L, fn, L - 1, 1):>10}{receptive_field(L, fn, L - 1, 4):>9}')

# 正文表格的核对
assert abs(density(8, causal) - 1.0) < 1e-12
assert max(row_counts(8, sliding_window(2))) == 2
assert abs(density(8, sliding_window(2)) - 5 / 12) < 1e-12          # 41.7%
assert abs(density(8, strided(2)) - 2 / 3) < 1e-12                   # 66.7%

# 洞察 ①：密度更高的跨步却没有封顶 —— 两个指标互相独立
assert density(8, strided(2)) > density(8, sliding_window(2))
for L_ in (16, 64, 256):
    assert max(row_counts(L_, strided(2))) > max(row_counts(L_, sliding_window(2)))
    assert max(row_counts(L_, sliding_window(2))) == 2, '窗口封顶，与 L 无关'

# 洞察 ②：选块 keep=1 时读取集合没有重叠 → 叠层也传不出去
assert receptive_field(8, block_select(2, 1), 7, 1) == 6
assert receptive_field(8, block_select(2, 1), 7, 4) == 6, '块边界挡住了信息传递'
# 而窗口有重叠，叠层能往前推
assert receptive_field(8, sliding_window(2), 7, 4) < receptive_field(8, sliding_window(2), 7, 1)

print('\n--- 窗口 w=4 的密度随 L 下降，单步代价恒定')
for L_ in (16, 64, 1024, 4096):
    print(f'L={L_:>5}：密度 {density(L_, sliding_window(4)) * 100:6.2f}%   单步≤{max(row_counts(L_, sliding_window(4)))}')

print('\n--- 叠层补偿的限度（w=4, L=4096, 看最后一个位置）')
for n in (1, 2, 8, 32, 61):
    print(f'{n:>3} 层 → 最早可达位置 {receptive_field(4096, sliding_window(4), 4095, n)}')
assert receptive_field(4096, sliding_window(4), 4095, 61) == 3912, '61 层也只倒推 184 个位置'
# 可达范围大致按 (w-1) × 层数 增长
assert 4095 - receptive_field(4096, sliding_window(4), 4095, 61) == 3 * 61
print('OK 06')
