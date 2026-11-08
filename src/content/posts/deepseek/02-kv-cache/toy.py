"""02 KV Cache：有无缓存的等价性与调用次数对照。

uv run --with numpy python 02-kv-cache/toy.py
"""
import numpy as np

rng = np.random.default_rng(0)
d, d_k, n_layers = 8, 4, 2
W = [{n: rng.normal(size=(d, d_k)) * 0.3 for n in 'qkv'} for _ in range(n_layers)]

kv_calls = 0


def softmax(z):
    z = z - z.max(-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(-1, keepdims=True)


def layer(x_hist, w, cache=None):
    """x_hist: (t+1, d)。返回最后一个位置的输出。"""
    global kv_calls
    if cache is None:                       # 无缓存：每轮重算全部历史的 K/V
        k, v = x_hist @ w['k'], x_hist @ w['v']
        kv_calls += len(x_hist)
    else:                                   # 有缓存：只算最后一个位置
        x_new = x_hist[-1:]
        cache['k'].append(x_new @ w['k'])
        cache['v'].append(x_new @ w['v'])
        kv_calls += 1
        k, v = np.concatenate(cache['k']), np.concatenate(cache['v'])
    q = x_hist[-1:] @ w['q']                # Query 只要当前位置
    return softmax(q @ k.T / np.sqrt(d_k)) @ v


def run(n_tokens, use_cache):
    global kv_calls
    kv_calls = 0
    rng2 = np.random.default_rng(42)
    x = rng2.normal(size=(n_tokens, d))
    caches = [{'k': [], 'v': []} for _ in range(n_layers)] if use_cache else None
    outs = []
    for t in range(n_tokens):
        h = x[: t + 1]
        for li in range(n_layers):
            o = layer(h, W[li], caches[li] if caches else None)
        outs.append(o)
    return np.concatenate(outs), kv_calls


n = 64
out_no, calls_no = run(n, use_cache=False)
out_yes, calls_yes = run(n, use_cache=True)

print('输出是否相同：', np.allclose(out_no, out_yes))
print(f'K/V 投影次数：无缓存 {calls_no}，有缓存 {calls_yes}')
print(f'理论值：无缓存 n(n+1)/2×层数 = {n * (n + 1) // 2 * n_layers}，有缓存 n×层数 = {n * n_layers}')

assert np.allclose(out_no, out_yes), '缓存不是近似，结果必须逐位相同'
assert calls_no == n * (n + 1) // 2 * n_layers
assert calls_yes == n * n_layers


def cache_bytes(n_h, d_k_, d_v, tokens, layers, dtype_bytes=2):
    return n_h * (d_k_ + d_v) * tokens * layers * dtype_bytes


gib = 1024 ** 3
mha_4k = cache_bytes(128, 128, 128, 4096, 61)
mha_128k = cache_bytes(128, 128, 128, 128 * 1024, 61)
print(f'MHA 账本：4096 token → {mha_4k / gib:.2f} GiB；128K token → {mha_128k / gib:.2f} GiB')
assert mha_128k == mha_4k * 32, '缓存随长度线性增长：32 倍长度就是 32 倍缓存'
print('OK 02')
