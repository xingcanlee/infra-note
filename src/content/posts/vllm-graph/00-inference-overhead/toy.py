"""00 一次 decode 提交了什么：CPU 提交与设备执行两条车道。

和文章里的动画是同一个模型（TS 版在 src/explainers/core/submit.ts，带单测）。
注意：这是排程模型，不是性能模拟器；exec / launch_cost 是示意参数。

uv run python toy.py        # 不需要 numpy
"""


def decode_layer_ops(n_layers=2):
    ops = []
    for i in range(n_layers):
        ops += [
            {'name': f'L{i}·norm', 'exec': 0.3, 'break': False},
            {'name': f'L{i}·qkv', 'exec': 0.8, 'break': False},
            {'name': f'L{i}·attn', 'exec': 1.0, 'break': True},   # 图捕获不了
            {'name': f'L{i}·out', 'exec': 0.6, 'break': False},
            {'name': f'L{i}·ffn', 'exec': 1.2, 'break': False},
        ]
    return ops


def plan(ops, mode, launch_cost=1.0, graph_launch=1.2):
    """把算子分组成若干次提交，再把 CPU 与设备两条车道排出来。"""
    if mode == 'eager':
        groups = [([i], 'op') for i in range(len(ops))]
    elif mode == 'full':
        assert not any(o['break'] for o in ops), 'full 要求所有算子都能被捕获'
        groups = [(list(range(len(ops))), 'graph')]
    else:                                        # piecewise：在 break 处切开
        groups, cur = [], []
        for i, o in enumerate(ops):
            if o['break']:
                if cur:
                    groups.append((cur, 'graph'))
                groups.append(([i], 'op'))
                cur = []
            else:
                cur.append(i)
        if cur:
            groups.append((cur, 'graph'))

    cpu = dev = 0.0
    out = []
    for idx, kind in groups:
        cpu_end = cpu + (graph_launch if kind == 'graph' else launch_cost)
        dev_start = max(dev, cpu_end)            # 设备不能早于提交完成
        dev_end = dev_start + sum(ops[i]['exec'] for i in idx)
        out.append((idx, kind, cpu, cpu_end, dev_start, dev_end))
        cpu, dev = cpu_end, dev_end
    return out


def stats(sched, ops):
    cpu_total = sum(c1 - c0 for _, _, c0, c1, _, _ in sched)
    dev_total = sum(o['exec'] for o in ops)
    wall = sched[-1][5]
    bubble, prev = 0.0, 0.0
    for _, _, _, _, d0, d1 in sched:
        bubble += max(0.0, d0 - prev)
        prev = d1
    return len(sched), cpu_total, dev_total, wall, bubble


ops = decode_layer_ops(2)
clean = [dict(o, **{'break': False}) for o in ops]

for lc in (1.0, 0.2):
    print(f'\n=== 每次逐算子提交花 {lc}，一次图 replay 花 1.2'
          f'（{len(ops)} 个算子，设备合计 {sum(o["exec"] for o in ops):.1f}）')
    print(f'{"模式":<11}{"提交":>5}{"CPU":>7}{"墙钟":>8}{"设备空闲":>12}')
    rows = {}
    for mode, oo in (('eager', ops), ('piecewise', ops), ('full', clean)):
        n, cpu, dev, wall, bub = stats(plan(oo, mode, lc), oo)
        rows[mode] = (n, cpu, wall, bub)
        print(f'{mode:<11}{n:>5}{cpu:>7.1f}{wall:>8.1f}{bub:>8.1f} ({bub / wall * 100:4.1f}%)')
    if lc == 1.0:
        assert rows['eager'][0] == 10 and rows['piecewise'][0] == 5 and rows['full'][0] == 1
        assert abs(rows['eager'][2] - 11.2) < 1e-9
        assert abs(rows['piecewise'][2] - 9.1) < 1e-9
        assert abs(rows['full'][2] - 9.0) < 1e-9
        # 图模式省的是空闲，不是计算
        assert rows['full'][3] < rows['eager'][3]
    else:
        # 提交便宜时 eager 反而最快
        assert rows['eager'][2] < rows['full'][2], '提交便宜时图模式失去收益'

# 设备干活总量与模式无关
d1 = sum(o['exec'] for o in ops)
for mode, oo in (('eager', ops), ('piecewise', ops), ('full', clean)):
    assert abs(stats(plan(oo, mode), oo)[2] - d1) < 1e-9, '图模式不改变计算量'

# 下界：设备工作量 + 第一次提交
n, cpu, dev, wall, bub = stats(plan(clean, 'full'), clean)
assert abs(wall - (dev + 1.2)) < 1e-9, '墙钟下界 = 设备工作量 + 第一次提交'
print(f'\nfull 模式的墙钟 {wall:.1f} = 设备工作量 {dev:.1f} + 第一次提交 1.2（第一次提交无法被掩盖）')

# 算子越大，提交开销占比越低
big = [dict(o, **{'exec': o['exec'] * 10}) for o in ops]
_, _, _, w_big, b_big = stats(plan(big, 'eager'), big)
_, _, _, w_sm, b_sm = stats(plan(ops, 'eager'), ops)
print(f'算子放大 10 倍后，eager 的空闲占比从 {b_sm / w_sm * 100:.1f}% 降到 {b_big / w_big * 100:.1f}%')
assert b_big / w_big < b_sm / w_sm, '大 batch / 大算子会掩盖提交开销'
print('OK vllm-00')
