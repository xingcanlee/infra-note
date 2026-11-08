"""01 注意力从零推一遍：四步逐个验证。

uv run --with numpy python 01-attention/toy.py
"""
import numpy as np

tokens = ['我', '在', '读', '注意力']
q = np.array([[1, 2, 0, -1], [3, -2, 1, 0], [-1, 1, 2, 3], [0, -1, -2, 1]], dtype=float)
k = np.array([[-2, 1, 3, 0], [1, 0, -1, 2], [2, 3, 0, -2], [-1, -2, 1, 1]], dtype=float)
v = np.array([[0, 3, -1, 2], [1, -1, 2, 0], [3, 0, 1, -2], [-2, 2, 0, 3]], dtype=float)
L, d_k = q.shape

# ① 打分
scores = q @ k.T / np.sqrt(d_k)
print('① 原始分数 e[2][0] =', scores[2, 0])
assert scores[2, 0] == 4.5, '正文手算：q2·k0 = 9，除以 √4 得 4.5'

# ② 因果掩码
mask = np.tril(np.ones((L, L), dtype=bool))
scores = np.where(mask, scores, -np.inf)

# ③ softmax（先减行最大值）
shifted = scores - scores.max(axis=-1, keepdims=True)
w = np.exp(shifted)
w /= w.sum(axis=-1, keepdims=True)
print('③ 每行权重之和 =', w.sum(axis=-1))
print('③ 位置 3 的权重 =', w[3].round(3))
assert np.allclose(w.sum(-1), 1.0)
assert np.allclose(np.triu(w, 1), 0.0), '未来位置的权重必须是 0'

# ④ 加权求和
out = w @ v
print('④ 输出形状 =', out.shape)
print('④ 位置 0 的输出 =', out[0])
assert np.allclose(out[0], v[0]), '位置 0 只能读自己，输出必然等于 v0'

# 掩码换一种形状，机制就换一种（与 src/explainers/core/masks.ts 同一套定义）
def causal(t, s, L):
    return s <= t


def sliding_window(w):
    return lambda t, s, L: s <= t and t - s < w


def block_select(size, keep):
    return lambda t, s, L: s <= t and t // size - s // size < keep


def to_matrix(fn, L):
    return np.array([[fn(t, s, L) for s in range(L)] for t in range(L)])


assert to_matrix(causal, 4).sum() == 10
assert to_matrix(sliding_window(2), 4).sum(axis=1).max() == 2, '窗口把每行的读取数封顶'
print('OK 01')
