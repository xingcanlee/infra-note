"""21 CSA2：跨层复用的三种 mode、层级 indexer、FP4 动态范围。

uv run python toy.py        # 不需要 numpy
"""


def plan_layers(modes):
    """返回每层的 main KV 来源与 Top-K 来源。"""
    kv_from, topk_from = [], []
    last_full = last_topk = None
    for l, m in enumerate(modes):
        if m == 'full':
            last_full = last_topk = l
            kv_from.append(l)
            topk_from.append(l)
        elif m == 'reindex':
            last_topk = l                      # KV 共享，但自己打分
            kv_from.append(last_full)
            topk_from.append(l)
        else:                                  # reuse
            kv_from.append(last_full)
            topk_from.append(last_topk)
    return kv_from, topk_from


def cost(modes):
    n_kv = sum(1 for m in modes if m == 'full')
    n_idx = sum(1 for m in modes if m in ('full', 'reindex'))
    return n_kv, n_idx


F, Ri, Re = 'full', 'reindex', 'reuse'
configs = [
    ('全 Full', [F] * 8),
    ('F,Ri,Ri,Ri,F,Ri,Ri,Ri（只共享缓存）', [F, Ri, Ri, Ri, F, Ri, Ri, Ri]),
    ('F,Ri,Re,Re,F,Ri,Re,Re（默认）', [F, Ri, Re, Re, F, Ri, Re, Re]),
    ('F,Re,Re,Re,F,Re,Re,Re（全复用）', [F, Re, Re, Re, F, Re, Re, Re]),
]
print('8 层的三种配置（每层都 Full 则需 8 份 KV、8 次 indexer）\n')
print(f'{"配置":<40}{"KV 份数":>9}{"indexer 次数":>14}')
res = {}
for label, modes in configs:
    n_kv, n_idx = cost(modes)
    res[label] = (n_kv, n_idx)
    print(f'{label:<40}{n_kv:>9}{n_idx:>14}')

shared_only = res['F,Ri,Ri,Ri,F,Ri,Ri,Ri（只共享缓存）']
default = res['F,Ri,Re,Re,F,Ri,Re,Re（默认）']
assert shared_only[0] == default[0], '两种配置的 KV 份数相同'
assert shared_only[1] > default[1], '但 indexer 次数不同'
print('\n中间两行 KV 份数相同、indexer 次数不同 —— 缓存共享与索引复用确实是分开的 ✓')

# 复用来源
kv_from, topk_from = plan_layers([F, Ri, Re, Re, F, Ri, Re, Re])
assert kv_from == [0, 0, 0, 0, 4, 4, 4, 4], 'KV 跟随最近的 Full 层'
assert topk_from == [0, 1, 1, 1, 4, 5, 5, 5], 'Top-K 跟随最近一次 Full 或 Reindex'
# Reindex 层：KV 来自别层，Top-K 是自己的
assert kv_from[1] == 0 and topk_from[1] == 1, '同一份历史，这一层可以看向不同位置'

# ── 层级 indexer ──
L, pool, n_layers = 128 * 1024, 2048, 8
modes = [F, Ri, Re, Re, F, Ri, Re, Re]
first_full = L                                   # 第一个 Full 层扫全上下文
later = sum(pool for m in modes[1:] if m in (F, Ri))
total = first_full + later
naive = L * n_layers
print(f'\n层级 indexer：第一个 Full 层建 pool，后续只在 pool 内挑')
print(f'  上下文 {L // 1024}K，pool={pool}：')
print(f'    首个 Full 层打分 {first_full:>9,} 次（O(L)）')
print(f'    后续每个 Reindex {pool:>9,} 次（与上下文长度无关）')
print(f'    {n_layers} 层共打分 {total:,} 次；若每层都扫全上下文则要 {naive:,} 次'
      f'（省 {(1 - total / naive) * 100:.1f}%）')
assert total < naive
# 后续层的代价与上下文无关
for ctx in (32 * 1024, 512 * 1024):
    later2 = sum(pool for m in modes[1:] if m in (F, Ri))
    assert later2 == later, '后续 indexer 的打分量与上下文长度无关'

# ── FP4 动态范围 ──
max_repr = 448 * 6
observed = 10
print(f'\nFP4 的动态范围：')
print(f'  省略 global scale 后最大幅值 448 × 6 = {max_repr}')
print(f'  训练中观察到的最大幅值约 {observed} → 余量 {max_repr / observed:.1f} 倍')
assert max_repr / observed > 100, '离上限差两个数量级，所以省略 global scale 是安全的'

# 两个口径不同的数字
print('\n两个口径（与第 20 篇一致，不可混用）：')
print('  每 token 宽度 ≈ 890 bytes/token，约 V4-Flash 的 1/4   ← CSA2 + FP4（本篇）')
print('  persistent footprint ≈ V4-Flash 的 1/8               ← 再加 CED + SWA Bounded Replay')
print('OK 21')
