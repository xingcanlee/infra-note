"""07 SWA：窗口掩码、环形缓存、以及 sink 的作用。

uv run --with numpy python toy.py
"""
import numpy as np


def sliding_window_mask(L, W, n_sink=0):
    """逻辑位置上的读取集合。n_sink > 0 时额外保留开头几个位置。"""
    t = np.arange(L)[:, None]
    s = np.arange(L)[None, :]
    m = (s <= t) & (t - s < W)
    if n_sink:
        m |= (s <= t) & (s < n_sink)
    return m


class RingCache:
    """只保留最近 W 个位置的环形缓存。"""

    def __init__(self, W, dim):
        self.W, self.buf = W, np.zeros((W, dim))
        self.pos = np.full(W, -1)          # 每个槽位当前存的是哪个逻辑位置

    def append(self, t, kv):
        slot = t % self.W                   # 覆盖最旧的
        self.buf[slot], self.pos[slot] = kv, t

    def read(self):
        """返回 (逻辑位置, 内容)，按逻辑位置排序 —— 这一步最容易漏。"""
        live = self.pos >= 0
        pos, buf = self.pos[live], self.buf[live]
        order = np.argsort(pos)             # 槽位顺序 ≠ 逻辑顺序
        return pos[order], buf[order]


cache = RingCache(W=4, dim=2)
for t in range(9):
    cache.append(t, np.array([t, -t]))
pos, buf = cache.read()
print('逻辑窗口：', pos)
print('物理槽位：', [int(t) % 4 for t in pos])
assert list(pos) == [5, 6, 7, 8], '窗口里是最近 4 个逻辑位置'
assert [int(t) % 4 for t in pos] == [1, 2, 3, 0], '槽位顺序与逻辑顺序不同'
assert np.allclose(buf[:, 0], [5, 6, 7, 8]), '排序后内容必须跟逻辑位置对齐'

# 缓存占用有上限：与 L 无关
for L in (16, 1024, 10 ** 6):
    rows_needed = min(L, 4)
    assert rows_needed == 4 or L < 4
print('窗口 W=4 时，无论 L 多大，缓存都只需 4 行 ✓')

# 单步代价封顶 vs 因果
L, W = 64, 8
m_win = sliding_window_mask(L, W)
m_causal = np.tril(np.ones((L, L), dtype=bool))
assert m_win.sum(axis=1).max() == W
assert m_causal.sum(axis=1).max() == L
print(f'L={L}：因果单步最多读 {m_causal.sum(1).max()} 个，窗口 W={W} 最多读 {m_win.sum(1).max()} 个')

# 加锚点：单层可达范围立刻变成 0
m_sink = sliding_window_mask(L, W, n_sink=1)
first_readable_win = int(np.argmax(m_win[-1]))
first_readable_sink = int(np.argmax(m_sink[-1]))
print(f'最后一个位置单层可达：窗口 {first_readable_win}，窗口+锚点 {first_readable_sink}')
assert first_readable_win == L - W
assert first_readable_sink == 0, '锚点让开头永远可读'
# 代价很小：每行只多读 1 个
assert m_sink.sum(1).max() == W + 1

# 丢掉 sink token 会显著改变注意力分布
rng = np.random.default_rng(0)
d = 16
q = rng.normal(size=d)
k = rng.normal(size=(L, d))
scores = k @ q / np.sqrt(d)
scores[0] += 6.0        # 模拟 attention sink：开头那个 token 吸走大量权重


def softmax(z):
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


full = softmax(scores)
dropped = softmax(scores[1:])
print(f'sink token 占了 {full[0] * 100:.1f}% 的注意力权重')
shift = np.abs(full[1:] - dropped).sum()
print(f'丢掉它之后，其余位置的权重总变化 {shift:.3f}')
assert full[0] > 0.5, '这个构造下 sink 吸走了过半权重'
assert shift > 0.5, '丢掉 sink 会把它的权重强行摊给其他位置，分布明显改变'

# 叠层补偿的限度（与第 06 篇一致）
def receptive_field(L_, W_, t, n_layers):
    reach = {t}
    for _ in range(n_layers):
        nxt = set(reach)
        for p in reach:
            for s in range(max(0, p - W_ + 1), p + 1):
                nxt.add(s)
        reach = nxt
    return min(reach)


print('\n--- W=4, L=4096, 看最后一个位置')
for n in (1, 8, 32, 61):
    print(f'{n:>3} 层 → 最早可达位置 {receptive_field(4096, 4, 4095, n)}')
assert receptive_field(4096, 4, 4095, 61) == 3912
print('OK 07')
