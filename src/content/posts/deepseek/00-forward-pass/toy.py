"""00 从一个 token 到一次前向：一层 Transformer 的最小可运行实现。

uv run --with numpy python 00-forward-pass/toy.py
"""
import numpy as np

rng = np.random.default_rng(0)
L, d, d_ff = 4, 8, 16

x = rng.normal(size=(L, d))


def rms_norm(z, eps=1e-6):
    return z / np.sqrt((z ** 2).mean(axis=-1, keepdims=True) + eps)


def causal_softmax(scores):
    L_ = scores.shape[-1]
    scores = np.where(np.tril(np.ones((L_, L_))) == 1, scores, -np.inf)
    w = np.exp(scores - scores.max(-1, keepdims=True))
    return w / w.sum(-1, keepdims=True)


def attention(z, w_q, w_k, w_v, w_o):
    q, k, v = z @ w_q, z @ w_k, z @ w_v
    w = causal_softmax(q @ k.T / np.sqrt(d))
    return (w @ v) @ w_o


def ffn(z, w1, w2):
    return np.maximum(z @ w1, 0) @ w2


p = {n: rng.normal(size=s) * 0.1 for n, s in {
    'w_q': (d, d), 'w_k': (d, d), 'w_v': (d, d), 'w_o': (d, d),
    'w1': (d, d_ff), 'w2': (d_ff, d),
}.items()}

h = x + attention(rms_norm(x), p['w_q'], p['w_k'], p['w_v'], p['w_o'])
y = h + ffn(rms_norm(h), p['w1'], p['w2'])

print(x.shape, '->', y.shape)
assert y.shape == x.shape, '层的输入输出形状必须相同，几十层才能串起来'

zn = rms_norm(x)
w = causal_softmax((zn @ p['w_q']) @ (zn @ p['w_k']).T / np.sqrt(d))
print('注意力权重每行之和：', w.sum(axis=-1))
assert np.allclose(w.sum(axis=-1), 1.0), 'softmax 后每行权重之和必须为 1'
assert np.allclose(np.triu(w, 1), 0.0), '因果掩码下不能读未来'

print('OK 00')
