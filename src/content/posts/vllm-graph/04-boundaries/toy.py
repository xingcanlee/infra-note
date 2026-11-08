"""04 四条边界：能不能进图的判定，以及分段与图桶的取舍。

纯 Python。示意判定器——真实判定由 attention 后端支持级别 + batch descriptor 共同完成。

uv run python toy.py
"""


def can_capture(op):
    """返回 (能否进图, 原因)。顺序与文章的判定流程一致。"""
    if op.get('dynamic_shape'):
        return False, '边界一：形状每轮都变（约束 9）'
    if op.get('sync'):
        return False, '边界二：同步点（约束 2）'
    if op.get('data_branch'):
        return False, '边界二：数据依赖的控制流（约束 4）'
    if op.get('unstable_alloc'):
        return False, '边界三：中间分配不稳定（约束 8）'
    if op.get('comm'):
        return False, '边界四：通信，需按部署验证（约束 6/10）'
    return True, ''


def split_into_segments(ops):
    """把能捕获的连续片段打包，过不去的单独提交 —— 这就是 piecewise。"""
    segments, cur = [], []
    for op in ops:
        ok, why = can_capture(op)
        if ok:
            cur.append(op)
        else:
            if cur:
                segments.append(('graph', cur, ''))
                cur = []
            segments.append(('eager', [op], why))
    if cur:
        segments.append(('graph', cur, ''))
    return segments


ops = [
    {'name': 'L0·norm'},
    {'name': 'L0·qkv'},
    {'name': 'L0·attn', 'dynamic_shape': True},
    {'name': 'L0·out'},
    {'name': 'L0·ffn'},
    {'name': 'L0·sample', 'data_branch': True},
    {'name': 'L0·allreduce', 'comm': True},
]

print('逐算子判定：')
for op in ops:
    ok, why = can_capture(op)
    print(f'  {op["name"]:<20} {"✓ 可捕获" if ok else "✗ " + why}')

segs = split_into_segments(ops)
n_graph = sum(1 for k, _, _ in segs if k == 'graph')
n_eager = sum(1 for k, _, _ in segs if k == 'eager')
print(f'\n分段结果：{n_graph} 段图 + {n_eager} 个图外算子 = {len(segs)} 次提交'
      f'（eager 需要 {len(ops)} 次）')
assert len(segs) < len(ops), '分段一定少于逐算子'

no_comm = [o for o in ops if not o.get('comm')]
s2 = split_into_segments(no_comm)
print(f'去掉通信后：{sum(1 for k,_,_ in s2 if k=="graph")} 段图 + '
      f'{sum(1 for k,_,_ in s2 if k=="eager")} 个图外算子 = {len(s2)} 次提交')

clean = [{'name': o['name']} for o in ops]
s3 = split_into_segments(clean)
print(f'全部边界都过得去时：{len(s3)} 次提交')
assert len(s3) == 1

# ── 桶的取舍 ──
def evaluate_buckets(buckets, lo=1, hi=64):
    real = padded = 0
    for b in range(lo, hi + 1):
        pick = next((x for x in buckets if b <= x), None)
        if pick is None:
            continue
        real += b
        padded += pick
    return (padded - real) / padded, len(buckets)


print('\n桶的取舍（batch 1..64）：')
schemes = [
    ('密桶 1..64 共 64 个   ', list(range(1, 65))),
    ('疏桶 1,2,4,8,16,32,64  ', [1, 2, 4, 8, 16, 32, 64]),
    ('混合 1,2,3,4,6,8,12,16,24,32,48,64', [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64]),
]
res = {}
for label, bk in schemes:
    waste, n = evaluate_buckets(bk)
    res[label.strip()] = waste
    print(f'  {label} 命中率 100.0%   padding 浪费 {waste * 100:4.1f}%   要捕获 {n:>2} 张图')

dense = res['密桶 1..64 共 64 个']
sparse = res['疏桶 1,2,4,8,16,32,64']
mixed = res['混合 1,2,3,4,6,8,12,16,24,32,48,64']
assert dense == 0.0, '密桶没有 padding 浪费，代价是 64 张图'
assert mixed < sparse, '小 batch 密、大 batch 疏，比均匀疏桶浪费更少'
print(f'\n混合桶用 12 张图拿到 {mixed * 100:.1f}% 浪费，均匀疏桶用 7 张图要浪费 {sparse * 100:.1f}%')
print('OK vllm-04')
