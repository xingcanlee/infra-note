"""06 无设备练习的参考实现。

对照 reference/vllm（commit cf5cea2d）的 cudagraph_utils.py:115-142。纯 Python。

uv run python toy.py
"""


def g(mode, tokens, reqs, utc=None, mql=None, loras=0, ub=1):
    return dict(cg_mode=mode, num_tokens=tokens, num_reqs=reqs, uniform_token_count=utc,
                max_query_len=mql, num_active_loras=loras, num_ubatches=ub)


def r(reqs, tokens, utc, mql=None, loras=0, ub=1):
    return dict(num_reqs=reqs, num_tokens=tokens, uniform_token_count=utc,
                max_query_len=mql, num_active_loras=loras, num_ubatches=ub)


# ── 练习一 ──
def is_compatible(desc, req):
    return all([
        desc['uniform_token_count'] is None
            or desc['uniform_token_count'] == req['uniform_token_count'],
        desc['max_query_len'] is None
            or (req['max_query_len'] is not None
                and desc['max_query_len'] >= req['max_query_len']),
        desc['num_reqs'] is None or desc['num_reqs'] >= req['num_reqs'],
        desc['num_tokens'] >= req['num_tokens'],
        desc['num_active_loras'] == req['num_active_loras'],
        desc['num_ubatches'] == req['num_ubatches'],
    ])


# ── 练习二 ──
def dispatch(graphs, req):
    for i, d in enumerate(graphs):
        if is_compatible(d, req):
            return i, d
    return None, g('NONE', req['num_tokens'], req['num_reqs'],
                   loras=req['num_active_loras'], ub=req['num_ubatches'])


# ── 练习三 ──
def padding_waste(desc, req):
    if desc['cg_mode'] == 'NONE':
        return 0, 0.0          # eager 按真实形状跑，没有 padding
    pad = desc['num_tokens'] - req['num_tokens']
    return pad, pad / desc['num_tokens']


GRAPHS = [g('FULL', t, t, utc=1, mql=1) for t in (1, 2, 4, 8)]

print('练习一～三：')
for req, label in [(r(5, 5, 1, 1), 'batch 5/5 统一'), (r(9, 9, 1, 1), 'batch 9/9 统一')]:
    i, d = dispatch(GRAPHS, req)
    pad, frac = padding_waste(d, req)
    if i is None:
        print(f'  {label} → 回退 eager，padding {pad}（eager 按真实形状跑）')
    else:
        print(f'  {label} → 命中 FULL({d["num_tokens"]})，padding {pad} token ({frac * 100:.1f}%)')
assert dispatch(GRAPHS, r(5, 5, 1, 1))[1]['num_tokens'] == 8
assert padding_waste(dispatch(GRAPHS, r(9, 9, 1, 1))[1], r(9, 9, 1, 1)) == (0, 0.0)
# max_query_len 的陷阱
assert not is_compatible(g('FULL', 8, 8, utc=1, mql=4), r(1, 2, 1, None))

# ── 练习四：三种回退，都不报错 ──
print('\n练习四：三种回退，没有一个报错')
for label, req in [('4a token 容量不够  ', r(9, 9, 1, 1)),
                   ('4b LoRA 数不等     ', r(2, 2, 1, 1, loras=1)),
                   ('4c 非统一批次      ', r(2, 5, None))]:
    i, d = dispatch(GRAPHS, req)
    print(f'  {label} → {d["cg_mode"]}')
    assert i is None and d['cg_mode'] == 'NONE'

# ── 练习五：设计桶 ──
WORKLOAD = ([1] * 600 + [2] * 150 + [3] * 80 + [4] * 60
            + [8] * 50 + [16] * 30 + [32] * 20 + [64] * 10)


def evaluate(buckets, workload):
    graphs = [g('FULL', b, b, utc=1, mql=1) for b in sorted(buckets)]
    hit, waste = 0, []
    for b in workload:
        i, d = dispatch(graphs, r(b, b, 1, 1))
        if i is not None:
            hit += 1
            waste.append((d['num_tokens'] - b) / d['num_tokens'])
    return hit / len(workload), (sum(waste) / len(waste) if waste else 0.0), len(buckets)


def choose_buckets(workload, max_graphs=8):
    """贴着分布选桶：取出现最多的几个 batch 大小，并保证覆盖最大值。"""
    from collections import Counter
    common = [b for b, _ in Counter(workload).most_common(max_graphs - 1)]
    picks = sorted(set(common) | {max(workload)})
    return picks[:max_graphs]


print('\n练习五：')
print(f'workload：{len(WORKLOAD)} 轮，60% 是 batch=1，长尾到 64\n')
print(f'{"方案":<30}{"图数":>5}{"命中率":>9}{"平均 padding 浪费":>18}')
schemes = [
    ('均匀 [8,16,24,32,40,48,56,64]', [8, 16, 24, 32, 40, 48, 56, 64]),
    ('2 的幂 [1,2,4,8,16,32,64]', [1, 2, 4, 8, 16, 32, 64]),
    ('贴着分布 ' + str(choose_buckets(WORKLOAD)), choose_buckets(WORKLOAD)),
]
res = {}
for label, bk in schemes:
    rate, waste, n = evaluate(bk, WORKLOAD)
    res[label] = waste
    print(f'{label:<30}{n:>5}{rate * 100:>8.1f}%{waste * 100:>17.1f}%')

uniform_w = res[schemes[0][0]]
pow2_w = res[schemes[1][0]]
fit_w = res[schemes[2][0]]
assert uniform_w > pow2_w > fit_w, '贴着分布选桶最省；均匀分桶最差'
print(f'\n均匀分桶最差：60% 的请求是 batch=1 却被 padding 到 8，白算 87.5%')

# ── 练习六：从日志诊断 ──
print('\n练习六：')
LOG = [
    (1041, r(3, 3, 1, 1), 'FULL(4)'),
    (1042, r(3, 3, 1, 1, loras=1), 'NONE'),
    (1043, r(5, 37, None), 'PIECEWISE(64)'),
    (1044, r(9, 9, 1, 1), 'NONE'),
]
reasons = {
    1042: '条件 5：LoRA 数不等（图捕获时 loras=0，本轮 loras=1）',
    1044: '条件 4：token 容量不够（最大的桶是 8，本轮 9）',
}
for it, req, observed in LOG:
    if observed == 'NONE':
        print(f'  iter {it} → {reasons[it]}')
        assert dispatch(GRAPHS, req)[0] is None
print('OK vllm-06')
