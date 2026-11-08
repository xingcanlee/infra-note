"""05 vLLM 选路：照抄 _is_compatible 的六项条件，看命中与回退。

对照 reference/vllm（commit cf5cea2d）的
vllm/v1/worker/gpu/cudagraph_utils.py:115-142。纯 Python。

uv run python toy.py
"""
import random


def g(mode, tokens, reqs, utc=None, mql=None, loras=0, ub=1):
    return dict(cg_mode=mode, num_tokens=tokens, num_reqs=reqs,
                uniform_token_count=utc, max_query_len=mql,
                num_active_loras=loras, num_ubatches=ub)


def r(reqs, tokens, utc, mql=None, loras=0, ub=1):
    return dict(num_reqs=reqs, num_tokens=tokens, uniform_token_count=utc,
                max_query_len=mql, num_active_loras=loras, num_ubatches=ub)


def is_compatible(desc, req):
    """照搬 _is_compatible 的六项条件。"""
    return all([
        desc['uniform_token_count'] is None
            or desc['uniform_token_count'] == req['uniform_token_count'],
        desc['max_query_len'] is None
            or (req['max_query_len'] is not None
                and desc['max_query_len'] >= req['max_query_len']),
        desc['num_reqs'] is None or desc['num_reqs'] >= req['num_reqs'],
        desc['num_tokens'] >= req['num_tokens'],
        desc['num_active_loras'] == req['num_active_loras'],   # 严格相等
        desc['num_ubatches'] == req['num_ubatches'],           # 严格相等
    ])


def dispatch(graphs, req):
    for i, d in enumerate(graphs):
        if is_compatible(d, req):
            return i, d
    return None, g('NONE', req['num_tokens'], req['num_reqs'])   # 回退 eager


GRAPHS = [
    g('FULL', 2, 2, utc=1, mql=1),
    g('FULL', 4, 4, utc=1, mql=1),
    g('FULL', 8, 8, utc=1, mql=1),
    g('PIECEWISE', 16, None, utc=None, mql=None),
]
print('候选图：FULL(2 tok/2 req)  FULL(4/4)  FULL(8/8)  PIECEWISE(16 tok, 不限请求)\n')

cases = [
    ('batch 3 请求 / 3 token / 统一   ', r(3, 3, 1, 1)),
    ('batch 5 请求 / 5 token / 统一   ', r(5, 5, 1, 1)),
    ('batch 12 请求 / 12 token / 统一 ', r(12, 12, 1, 1)),
    ('batch 40 请求 / 40 token / 统一 ', r(40, 40, 1, 1)),
    ('batch 3 请求 / 9 token / 非统一 ', r(3, 9, None)),
    ('batch 3 请求 / 3 token / LoRA=1', r(3, 3, 1, 1, loras=1)),
]
for label, req in cases:
    i, d = dispatch(GRAPHS, req)
    if i is None:
        print(f'{label} → 回退 eager（没有够大的桶或条件不符）')
    else:
        pad = d['num_tokens'] - req['num_tokens']
        print(f'{label} → 命中 图{i} {d["cg_mode"]}，padding {pad} token '
              f'({pad / d["num_tokens"] * 100:.1f}%)')

# 逐条断言
assert dispatch(GRAPHS, r(3, 3, 1, 1))[0] == 1, '命中第一个够大的桶，不是最大的'
assert dispatch(GRAPHS, r(40, 40, 1, 1))[0] is None, '超过最大桶 → 回退'
assert dispatch(GRAPHS, r(3, 9, None))[1]['cg_mode'] == 'PIECEWISE', 'decode 图要求统一批次'
assert dispatch(GRAPHS, r(3, 3, 1, 1, loras=1))[0] is None, 'LoRA 数必须严格相等'
# max_query_len：图有约束而调用方没跟踪 → 不匹配（源码注释明确要求）
assert not is_compatible(g('FULL', 8, 8, utc=1, mql=4), r(1, 2, 1, None))
assert is_compatible(g('FULL', 8, 8, utc=1, mql=4), r(1, 2, 1, 2))

# ── 一天的 batch 分布模拟 ──
random.seed(0)
N = 1000
batches = [random.randint(1, 10) for _ in range(N)]


def simulate(graphs):
    hit = 0
    waste = []
    for b in batches:
        i, d = dispatch(graphs, r(b, b, 1, 1))
        if i is not None:
            hit += 1
            waste.append((d['num_tokens'] - b) / d['num_tokens'])
    return hit, (sum(waste) / len(waste) if waste else 0.0)


print(f'\n一天的 batch 分布模拟（{N} 轮，batch 大小 1..10 均匀分布）：')
hit, w = simulate(GRAPHS)
print(f'  命中图：{hit} 轮（{hit / N * 100:.1f}%），平均 padding 浪费 {w * 100:.1f}%')
assert hit == N

small = [d for d in GRAPHS if d['num_tokens'] <= 4]
hit2, w2 = simulate(small)
print(f'  把最大的桶从 16 降到 4 之后：')
print(f'  命中图：{hit2} 轮（{hit2 / N * 100:.1f}%），回退 {N - hit2} 轮（{(N - hit2) / N * 100:.1f}%）')
assert hit2 < hit, '桶上限设小了，超出的部分全部静默回退'
print('\n回退是静默的：结果正确、不报错，只有吞吐曲线上一个说不清的凹陷。')
print('OK vllm-05')
