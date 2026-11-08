"""14 推测解码：输出不变，只变快。

uv run python toy.py        # 不需要 numpy
"""


def speculative_decode(truth, k, hits):
    """truth: 主模型真正会生成的序列。返回 (输出, 主模型前向次数)。"""
    out, forwards, hit_i = [], 0, 0
    while len(out) < len(truth):
        base = len(out)
        n = min(k, len(truth) - base)

        # ① 草稿：便宜地提出 n 个候选
        draft = []
        for j in range(n):
            ok = hits[hit_i % len(hits)]
            hit_i += 1
            draft.append(truth[base + j] if ok else f'？{base + j}')

        # ② 验证：主模型一次前向检查全部候选
        forwards += 1
        accepted = 0
        for j in range(n):
            if draft[j] == truth[base + j]:
                accepted += 1
            else:
                break

        # ③ 提交：接受的前缀 + 一个免费 token（全中→奖励；有拒→主模型的纠正）
        out.extend(truth[base:base + accepted])
        if len(out) < len(truth):
            out.append(truth[len(out)])
    return out, forwards


TRUTH = ['我', '在', '读', '注意力', '机', '制', '的', '笔', '记', '。']
print(f'目标序列 {len(TRUTH)} 个 token\n')
print(f'{"草稿质量":<16}{"前向次数":>9}{"前向效率":>10}{"输出是否正确":>14}')

cases = [
    ('全中 (p=1.0)', [True]),
    ('好 (p≈0.83)', [True, True, True, True, True, False]),
    ('一般 (p=0.5)', [True, False]),
    ('全错 (p=0.0)', [False]),
]
outs = []
for label, hits in cases:
    out, fwd = speculative_decode(TRUTH, k=2, hits=hits)
    ok = out == TRUTH
    outs.append(out)
    print(f'{label:<16}{fwd:>9}{len(TRUTH) / fwd:>9.2f}×{"✓" if ok else "✗":>12}')
    assert ok, '推测解码必须不改变输出'

print(f'{"不用推测解码":<16}{len(TRUTH):>9}{1.00:>9.2f}×{"✓":>12}')
assert all(o == outs[0] for o in outs), '四种草稿质量下的输出完全一致'
print('\n四种草稿质量下的输出完全一致 ✓ —— 推测解码不改变结果')

# 全错时不比普通 decode 慢
_, fwd_worst = speculative_decode(TRUTH, k=2, hits=[False])
assert fwd_worst == len(TRUTH), '最差情况退化成普通 decode，不会更慢'


def expected_tokens_per_round(p, k):
    """E = Σ_{j<k} p^j (1−p)(j+1) + p^k (k+1)"""
    e = sum((p ** j) * (1 - p) * (j + 1) for j in range(k))
    return e + (p ** k) * (k + 1)


print('\nV3 的配置（k=1）：')
for p in (0.85, 0.90):
    print(f'  接受率 {p * 100:.0f}% → 每轮期望 {expected_tokens_per_round(p, 1):.2f} 个 token')
print('  论文报告 1.8× TPS，与此一致')
assert abs(expected_tokens_per_round(0.85, 1) - 1.85) < 1e-12
assert abs(expected_tokens_per_round(0.90, 1) - 1.90) < 1e-12

# k 增大收益递减
print('\nk 增大时的收益递减（接受率固定 0.8）：')
prev = None
for k in (1, 2, 3, 4, 6, 8):
    e = expected_tokens_per_round(0.8, k)
    gain = '' if prev is None else f'（比 k={k - 1 if k <= 4 else "上一档"} 多 {e - prev:.3f}）'
    print(f'  k={k}：每轮期望 {e:.3f} 个 {gain}')
    prev = e
g1 = expected_tokens_per_round(0.8, 2) - expected_tokens_per_round(0.8, 1)
g2 = expected_tokens_per_round(0.8, 4) - expected_tokens_per_round(0.8, 3)
assert g2 < g1, '每多猜一个，边际收益按 p^k 衰减'
print(f'\n从 k=1 到 2 多拿 {g1:.3f} 个，从 k=3 到 4 只多拿 {g2:.3f} 个 —— 按 p^k 衰减')
print('OK 14')
