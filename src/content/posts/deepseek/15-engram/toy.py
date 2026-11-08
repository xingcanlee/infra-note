"""15 Engram：N-gram 哈希查表是 O(1)，扩容不增加 FLOPs。

uv run python toy.py        # 不需要 numpy
"""

PRIME = 1099511628211
OFFSET = 1469598103934665603
MASK = 0xFFFFFFFFFFFFFFFF


def ngram_keys(ids, t, max_n=3, n_heads=8, table_sizes=None):
    """后缀 N-gram → 多头哈希 → 行号。确定性，无矩阵乘。"""
    rows = []
    for n in range(2, max_n + 1):
        if t - n + 1 < 0:
            rows.extend([(n, k, 0) for k in range(n_heads)])
            continue
        g = tuple(ids[t - n + 1:t + 1])
        for k in range(n_heads):
            h = OFFSET ^ (k * PRIME)                       # 每个头一个不同的种子
            for x in g:
                h = ((h ^ x) * PRIME) & MASK
            rows.append((n, k, h % table_sizes[(n, k)]))    # ← O(1)，与表大小无关
    return rows


def canonical(tok):
    """tokenizer 压缩的简化版：大小写归一 + 全角转半角。"""
    return tok.lower().replace('Ａ', 'a').replace('　', ' ').strip()


VOCAB = {}


def to_id(tok):
    c = canonical(tok)
    return VOCAB.setdefault(c, len(VOCAB) + 1)


MAX_N, K = 3, 4
SIZES = {(n, k): 2003 for n in range(2, MAX_N + 1) for k in range(K)}

toks = ['the', 'capital', 'of', 'china', 'is']
ids = [to_id(t) for t in toks]
print(f"序列 'the capital of china is' → token ids {ids}\n")

rows = ngram_keys(ids, 4, MAX_N, K, SIZES)
print(f'位置 4 取回的行（max_n={MAX_N}, K={K}）：')
for n, k, row in rows[:2]:
    print(f'  n={n} head={k} → 行 {row:>4} / {SIZES[(n, k)]}')
print(f'  ...共 {len(rows)} 行，每个位置固定取 {len(rows)} 行')
assert len(rows) == (MAX_N - 1) * K

# 确定性：同样的 N-gram 在别处也命中同一行
other = [to_id(t) for t in ['x', 'y', 'of', 'china', 'is']]
rows2 = ngram_keys(other, 4, MAX_N, K, SIZES)
same_n2 = [r for r in rows if r[0] == 2] == [r for r in rows2 if r[0] == 2]
print(f'\n同样的 N-gram 在不同位置命中同一行 {"✓" if same_n2 else "✗"}（确定性）')
assert same_n2

# tokenizer 压缩：不同写法命中同一行
upper = [to_id(t) for t in ['THE', 'Capital', 'OF', 'China', 'IS']]
assert upper == ids, '大小写不同的写法折叠成同一组 id'
print('大小写/全角不同的写法命中同一行 ✓（tokenizer 压缩）')

# 扩容不增加计算
print('\n表扩容对计算量的影响：')
for size in (2003, 2000003):
    sizes = {(n, k): size for n in range(2, MAX_N + 1) for k in range(K)}
    rs = ngram_keys(ids, 4, MAX_N, K, sizes)
    print(f'  表 {size:>9,} 行 → 每 token 查 {len(rs)} 行，0 次乘加')
    assert len(rs) == (MAX_N - 1) * K
print('  表扩大 1000 倍，每 token 的查表工作量完全不变 ✓')

print('\n对照 MoE（第 13 篇）：')
print('  专家从 64 扩到 256，激活仍是 8 个 → FLOPs 不变，但 256 份专家参数都要在显存里')
print('  Engram 表扩大               → FLOPs 不变，且长尾部分可以放主机内存 / NVMe')

# 稀疏预算分配（论文 §3.1，10B 档）
print('\n稀疏预算分配（论文 §3.1，10B 档）：')
pure_moe, best = 1.7248, 1.7109
print(f'  ρ=100%（纯 MoE）  loss {pure_moe}')
print(f'  ρ≈80%（最优）     loss {best}   ← 低 {pure_moe - best:.4f}')
assert abs((pure_moe - best) - 0.0139) < 1e-9

# iso-parameter / iso-FLOPs 对照（论文 §4.1 表 1）
moe = dict(total=26.7, act=3.8, mmlu=57.4, bbh=50.9, pile=1.960)
eng = dict(total=26.7, act=3.8, mmlu=60.4, bbh=55.9, pile=1.950)
assert moe['total'] == eng['total'] and moe['act'] == eng['act'], 'iso-parameter 且 iso-FLOPs'
assert eng['mmlu'] - moe['mmlu'] == 3.0 and eng['bbh'] - moe['bbh'] == 5.0
print(f'\n27B 对照（同参数、同激活）：MMLU {moe["mmlu"]} → {eng["mmlu"]}（+{eng["mmlu"] - moe["mmlu"]:.1f}），'
      f'BBH {moe["bbh"]} → {eng["bbh"]}（+{eng["bbh"] - moe["bbh"]:.1f}）')
print('OK 15')
