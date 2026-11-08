"""03 MQA 与 GQA：同一份代码，只改 n_kv_heads。

uv run --with numpy python toy.py
"""
import numpy as np


def attention(x, w_q, w_k, w_v, n_heads, n_kv_heads):
    """n_kv_heads = n_heads → MHA；= 1 → MQA；介于之间 → GQA。

    返回 (输出, 缓存里真正要存的 K 形状, V 形状)。
    """
    L, d = x.shape
    d_h = d // n_heads
    assert n_heads % n_kv_heads == 0, 'head 数必须能被 K/V 份数整除'
    rep = n_heads // n_kv_heads

    q = (x @ w_q).reshape(L, n_heads, d_h)
    k_cached = (x @ w_k).reshape(L, n_kv_heads, d_h)   # ← 缓存的就是它
    v_cached = (x @ w_v).reshape(L, n_kv_heads, d_h)

    k = np.repeat(k_cached, rep, axis=1)    # 共享 = 读出后再广播，不占缓存
    v = np.repeat(v_cached, rep, axis=1)

    scores = np.einsum('thd,shd->hts', q, k) / np.sqrt(d_h)
    mask = np.tril(np.ones((L, L), dtype=bool))
    scores = np.where(mask, scores, -np.inf)
    w = np.exp(scores - scores.max(-1, keepdims=True))
    w /= w.sum(-1, keepdims=True)
    out = np.einsum('hts,shd->thd', w, v)
    return out.reshape(L, d), k_cached.shape, v_cached.shape


rng = np.random.default_rng(0)
L, n_heads, d_h = 6, 8, 128
d = n_heads * d_h
x = rng.normal(size=(L, d))
w_q = rng.normal(size=(d, d)) * 0.02
w_k = rng.normal(size=(d, d)) * 0.02
w_v = rng.normal(size=(d, d)) * 0.02

print(f'{"方案":<6}{"n_kv_heads":>12}{"每 token 每层":>16}{"相对 MHA":>12}')
base = None
outs = {}
for name, n_kv in [('MHA', 8), ('GQA', 2), ('MQA', 1)]:
    # K/V 投影按份数裁剪：只保留前 n_kv 份对应的列
    cols = n_kv * d_h
    out, ks, vs = attention(x, w_q, w_k[:, :cols], w_v[:, :cols], n_heads, n_kv)
    per_token = 2 * n_kv * d_h
    base = base or per_token
    print(f'{name:<6}{n_kv:>12}{per_token:>14} 个数{per_token / base * 100:>10.1f}%')
    outs[name] = out
    assert ks == (L, n_kv, d_h) and vs == (L, n_kv, d_h)

# MHA 的缓存宽度是 MQA 的 n_heads 倍
assert 2 * 8 * d_h == (2 * 1 * d_h) * n_heads

# 共享会改变输出：三种方案不是等价变换
assert not np.allclose(outs['MHA'], outs['MQA']), 'MQA 牺牲了表达力，输出必然不同于 MHA'

# 但注意力分布仍可因 head 而异：同组两个 head 的权重不相同
d_hh = d // n_heads
q = (x @ w_q).reshape(L, n_heads, d_hh)
k1 = np.repeat((x @ w_k[:, :d_hh]).reshape(L, 1, d_hh), n_heads, axis=1)  # MQA：一份 K
sc = np.einsum('thd,shd->hts', q, k1) / np.sqrt(d_hh)
sc = np.where(np.tril(np.ones((L, L), dtype=bool)), sc, -np.inf)
w = np.exp(sc - sc.max(-1, keepdims=True))
w /= w.sum(-1, keepdims=True)
assert not np.allclose(w[0], w[1]), '即使共用同一份 K，不同 head 的 Query 仍给出不同的注意力分布'
print('\nMQA 下 head0 与 head1 在位置 5 的权重：')
print(' head0', w[0, 5].round(3))
print(' head1', w[1, 5].round(3))
print('OK 03')
