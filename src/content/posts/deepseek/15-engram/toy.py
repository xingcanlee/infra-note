# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""15 Engram：词表归一、多头质数哈希 O(1) 查表与上下文门控。

uv run --with numpy python toy.py
"""
import unicodedata
import numpy as np


# ① 词表投影压缩 P(x)：NFKC + 小写 + 空白合并，将同义表面形式映射到同一规范 ID
RAW_VOCAB = {
    0: '<pad>', 1: 'Beijing', 2: 'beijing', 3: ' ＢＥＩＪＩＮＧ ',
    4: '是', 5: '中国', 6: '的', 7: '首', 8: '公司', 9: '新任',
}


def build_projector(vocab: dict[int, str]):
    canon_map, proj = {}, np.zeros(max(vocab) + 1, dtype=np.int64)
    for tid, tok in vocab.items():
        key = ' '.join(unicodedata.normalize('NFKC', tok).lower().split())
        proj[tid] = canon_map.setdefault(key, len(canon_map))
    return proj, len(canon_map)


proj, compressed_v = build_projector(RAW_VOCAB)
assert proj[1] == proj[2] == proj[3], '不同大小写/全角/空白的同一词应压到同一规范 ID'
print(f'① 词表压缩：原始 {len(RAW_VOCAB)} 个表面 token → {compressed_v} 个规范 ID')


# ② 确定性多头质数哈希：与官方 engram_demo_v1.py / vLLM 一致（奇乘数异或 + 互异质数桶）
def is_prime(n: int) -> bool:
    return n > 1 and all(n % d != 0 for d in range(2, int(n ** 0.5) + 1))


def next_primes(start: int, count: int) -> list[int]:
    out, cand = [], max(2, start)
    while len(out) < count:
        if is_prime(cand):
            out.append(cand)
        cand += 1
    return out


def odd_multipliers(layer_id: int, max_ngram: int = 3) -> np.ndarray:
    rng = np.random.default_rng(10007 * layer_id)
    r = rng.integers(0, 1 << 62, size=max_ngram, dtype=np.int64).astype(np.uint64)
    return r * np.uint64(2) + np.uint64(1)


def engram_hash_indices(
    canon_ids: np.ndarray,
    bucket_primes: list[int],
    layer_id: int = 1,
    n_heads: int = 8,
) -> tuple[np.ndarray, int]:
    """返回形状 [T, 2 * n_heads] 的扁平表行号，以及每 token 发生的混合乘法次数。"""
    assert len(bucket_primes) == 2 * n_heads
    mults = odd_multipliers(layer_id, max_ngram=3)
    offsets = np.cumsum([0] + bucket_primes[:-1], dtype=np.uint64)

    x0 = canon_ids.astype(np.uint64)
    x1 = np.concatenate([np.zeros(1, dtype=np.uint64), x0[:-1]])
    x2 = np.concatenate([np.zeros(2, dtype=np.uint64), x0[:-2]])

    # 2-gram 与增量复用的 3-gram 奇乘数异或混合（整条路径无矩阵乘）
    h2 = (x0 * mults[0]) ^ (x1 * mults[1])
    h3 = h2 ^ (x2 * mults[2])
    ops_per_token = 3  # 固定 3 次 uint64 乘法 + 2 次异或 + 16 次取模

    cols = []
    for k in range(n_heads):
        p2 = np.uint64(bucket_primes[k])
        cols.append(offsets[k] + (h2 % p2))
    for k in range(n_heads):
        p3 = np.uint64(bucket_primes[n_heads + k])
        cols.append(offsets[n_heads + k] + (h3 % p3))
    return np.stack(cols, axis=-1).astype(np.int64), ops_per_token


small_primes = next_primes(2_000, 16)
large_primes = next_primes(200_000, 16)  # 表容量扩大约 100 倍

seq_beijing = proj[[1, 4, 5, 6, 7]]      # 「Beijing 是 中国 的 首」
seq_beijing_alt = proj[[3, 4, 5, 6, 7]]  # 「 ＢＥＩＪＩＮＧ  是 中国 的 首」
idx_small, ops_small = engram_hash_indices(seq_beijing, small_primes, layer_id=1)
idx_alt, _ = engram_hash_indices(seq_beijing_alt, small_primes, layer_id=1)
idx_large, ops_large = engram_hash_indices(seq_beijing, large_primes, layer_id=1)

assert np.array_equal(idx_small, idx_alt), '表面形式变化不应改变归一化后的查表地址'
assert idx_small.shape == idx_large.shape == (5, 16), '每 token 固定返回 16 个头行号'
assert ops_small == ops_large == 3, '表扩大 100 倍，每 token 哈希开销严格不变'

# 桶隔离：每个头生成的全局行号严格落在各自的 [offset_i, offset_{i+1}) 区间内
bounds = np.cumsum([0] + large_primes)
for head_i in range(16):
    col = idx_large[:, head_i]
    assert np.all((col >= bounds[head_i]) & (col < bounds[head_i + 1]))

print(f'② O(1) 查表验证：小表 {sum(small_primes):,} 行 vs 大表 {sum(large_primes):,} 行（约 100×）')
print(f'   每 token 读取行数：{idx_small.shape[1]} → {idx_large.shape[1]}（恒定），矩阵乘 FLOPs = 0')


# ③ 上下文感知门控：同一静态后缀「…的首」在不同语境下的门控开合
def rms_norm(x: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    return x / np.sqrt(np.mean(x * x, axis=-1, keepdims=True) + eps)


def context_gate(h_t: np.ndarray, k_t: np.ndarray) -> float:
    """RMSNorm 缩放点积 + 有符号开方（engram_demo_v1.py & vLLM 同款）+ Sigmoid。"""
    dot = float(np.sum(rms_norm(h_t) * rms_norm(k_t)) / np.sqrt(h_t.shape[-1]))
    squashed = np.sqrt(max(abs(dot), 1e-6)) * (1.0 if dot >= 0 else -1.0)
    return float(1.0 / (1.0 + np.exp(-squashed)))


rng = np.random.default_rng(42)
d_head, d_model = 8, 32
table = rng.normal(0, 0.2, size=(sum(small_primes), d_head))

# 两条句子末尾同为「…的 首」（2-gram 完全相同），查出的 2-gram 静态记忆相同
seq_ceo = proj[[8, 9, 6, 7]]  # 「公司 新任 的 首」（后续应为「席执行官」，而非「都」）
idx_cap = engram_hash_indices(seq_beijing, small_primes)[0][-1]
idx_ceo = engram_hash_indices(seq_ceo, small_primes)[0][-1]
assert np.array_equal(idx_cap[:8], idx_ceo[:8]), '末尾同为「的 首」，8 个 2-gram 头地址完全一致'

# 假设训练后，静态表在「的 首」处主要记住了高频搭配「首都」方向的 Key
e_cap = table[idx_cap].reshape(-1)  # [16 * d_head = 128]
W_K = rng.normal(0, 0.15, size=(d_model, e_cap.shape[0]))
k_capital = W_K @ e_cap

# 语境 A（「北京是中国的首」）的隐藏状态与「首都」方向一致；语境 B（「公司新任的首」）与之相反
h_capital_ctx = k_capital + rng.normal(0, 0.15, size=d_model)
h_ceo_ctx = -k_capital + rng.normal(0, 0.15, size=d_model)

alpha_cap = context_gate(h_capital_ctx, k_capital)
alpha_ceo = context_gate(h_ceo_ctx, k_capital)
print(f'③ 上下文门控（「…的首」静态记忆偏「首都」时）：')
print(f'   语境 A「北京是中国的首」 → α = {alpha_cap:.3f}（放行静态记忆）')
print(f'   语境 B「公司新任的首」   → α = {alpha_ceo:.3f}（抑制不匹配记忆）')
assert alpha_cap > 0.70 and alpha_ceo < 0.30, '门控应放行吻合语境、抑制冲突语境'
print('OK 15')
