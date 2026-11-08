"""06 无设备练习：把下面的 NotImplementedError 换成你的实现。

uv run python exercises.py

参考实现见同目录 toy.py（建议先自己写完再看）。
"""


def g(mode, tokens, reqs, utc=None, mql=None, loras=0, ub=1):
    return dict(cg_mode=mode, num_tokens=tokens, num_reqs=reqs, uniform_token_count=utc,
                max_query_len=mql, num_active_loras=loras, num_ubatches=ub)


def r(reqs, tokens, utc, mql=None, loras=0, ub=1):
    return dict(num_reqs=reqs, num_tokens=tokens, uniform_token_count=utc,
                max_query_len=mql, num_active_loras=loras, num_ubatches=ub)


# ── 练习一：六项兼容条件 ──
def is_compatible(desc, req):
    """1. utc 为 None 或相等；2. mql 为 None 或（req 的不为 None 且 desc 的 >= req 的）；
    3. num_reqs 为 None 或 >=；4. num_tokens >=；5. loras 相等；6. ubatches 相等。"""
    raise NotImplementedError('练习一')


# ── 练习二：按顺序找第一个兼容的，否则回退 ──
def dispatch(graphs, req):
    raise NotImplementedError('练习二')


# ── 练习三：padding 浪费（回退时为 0） ──
def padding_waste(desc, req):
    raise NotImplementedError('练习三')


# ── 练习五：贴着分布选桶 ──
def choose_buckets(workload, max_graphs=8):
    raise NotImplementedError('练习五')


GRAPHS = [g('FULL', t, t, utc=1, mql=1) for t in (1, 2, 4, 8)]
WORKLOAD = ([1] * 600 + [2] * 150 + [3] * 80 + [4] * 60
            + [8] * 50 + [16] * 30 + [32] * 20 + [64] * 10)

CHECKS = [
    ('一：容量够就命中', lambda: is_compatible(g('FULL', 8, 8, utc=1, mql=1), r(5, 5, 1, 1)) is True),
    ('一：容量不够不命中', lambda: is_compatible(g('FULL', 4, 4, utc=1, mql=1), r(5, 5, 1, 1)) is False),
    ('一：LoRA 必须相等', lambda: is_compatible(g('FULL', 8, 8, utc=1, mql=1), r(5, 5, 1, 1, loras=1)) is False),
    ('一：图有 mql 而调用方没跟踪 → 不匹配',
     lambda: is_compatible(g('FULL', 8, 8, utc=1, mql=4), r(1, 2, 1, None)) is False),
    ('二：命中第一个够大的（不是最大的）', lambda: dispatch(GRAPHS, r(3, 3, 1, 1))[1]['num_tokens'] == 4),
    ('二：都不兼容时回退 NONE', lambda: dispatch(GRAPHS, r(9, 9, 1, 1))[1]['cg_mode'] == 'NONE'),
    ('三：命中时 padding 正确', lambda: padding_waste(g('FULL', 8, 8, utc=1, mql=1), r(5, 5, 1, 1))[0] == 3),
    ('三：回退时 padding 为 0', lambda: padding_waste(g('NONE', 9, 9), r(9, 9, 1, 1))[0] == 0),
    ('五：桶数不超过上限', lambda: len(choose_buckets(WORKLOAD, 8)) <= 8),
    ('五：桶要覆盖最大 batch', lambda: max(choose_buckets(WORKLOAD, 8)) >= max(WORKLOAD)),
    ('五：桶要包含最常见的 batch=1', lambda: 1 in choose_buckets(WORKLOAD, 8)),
]

if __name__ == '__main__':
    done = 0
    for name, check in CHECKS:
        try:
            ok = check()
            print(f'{"  ok  " if ok else " FAIL "} {name}')
            done += bool(ok)
        except NotImplementedError as e:
            print(f' TODO  {name}  （{e}）')
        except Exception as e:
            print(f' FAIL  {name}  （{type(e).__name__}: {e}）')
    print(f'\n{done}/{len(CHECKS)} 通过')
