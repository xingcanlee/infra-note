"""08 NSA：三条分支与「白捡的块分数」。

uv run --with numpy python toy.py
"""
import numpy as np


def softmax(z):
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


def nsa_branches(q, k, v, l=4, d=2, l_blk=4, n_sel=2, w=4, phi=None):
    """返回三条分支各自的输出、读取量、块分数与选中的块。"""
    L = len(k)
    t = L - 1
    phi = phi or (lambda blk: blk.mean(axis=0))      # toy 用均值代替可学习 MLP
    scale = np.sqrt(q.shape[-1])

    # ① 压缩：每 l 个 token 压成一个，stride = d（d < l 所以相邻块重叠）
    starts = [i * d for i in range(max(0, (t - l) // d + 1))]
    k_cmp = np.array([phi(k[s:s + l]) for s in starts])
    v_cmp = np.array([phi(v[s:s + l]) for s in starts])
    p_cmp = softmax(k_cmp @ q / scale)               # ← 这个 softmax 要用两次
    o_cmp = p_cmp @ v_cmp

    # ② 选块：直接复用 p_cmp 当块分数，不另算
    n_blocks = (t + l_blk) // l_blk
    blk_score = np.zeros(n_blocks)
    for bi, s in enumerate(starts):
        blk_score[min(s // l_blk, n_blocks - 1)] += p_cmp[bi]
    fixed = blk_score.copy()
    blk_score[0] += 1e9                              # 固定激活：起始块（attention sink）
    blk_score[t // l_blk] += 1e9                     # 固定激活：当前局部块
    chosen = np.sort(np.argsort(blk_score)[::-1][:n_sel])
    idx = np.concatenate([np.arange(b * l_blk, min((b + 1) * l_blk, t + 1)) for b in chosen])
    o_slc = softmax(k[idx] @ q / scale) @ v[idx]

    # ③ 窗口
    widx = np.arange(max(0, t - w + 1), t + 1)
    o_win = softmax(k[widx] @ q / scale) @ v[widx]

    return (o_cmp, o_slc, o_win), (len(starts), len(idx), len(widx)), fixed, chosen, idx, widx


rng = np.random.default_rng(0)
L, dk = 32, 8
q = rng.normal(size=dk)
k = rng.normal(size=(L, dk))
v = rng.normal(size=(L, dk))

outs, counts, blk_score, chosen, idx, widx = nsa_branches(q, k, v)
n_cmp, n_slc, n_win = counts
print(f'压缩分支：读 {n_cmp} 个压缩条目（由 {L} 个 token 压成）')
print(f'选块分支：读 {n_slc} 个原始 token（{len(chosen)} 个块 × 4）')
print(f'窗口分支：读 {n_win} 个原始 token')

g = np.array([0.3, 0.5, 0.2])
merged = sum(gi * o for gi, o in zip(g, outs))
print(f'门控合并：g = {g}，三条分支输出加权求和')
assert merged.shape == (dk,)

print(f'\n选块分支挑中的块 = {chosen}，其中块 0 是固定激活的起始块')
assert 0 in chosen, '起始块固定激活'
assert (L - 1) // 4 in chosen or len(chosen) < 2, '当前局部块固定激活'
print('块分数完全来自压缩分支的 softmax —— 没有额外的打分计算 ✓')
assert abs(blk_score.sum() - 1.0) < 1e-9, '块分数就是压缩分支 softmax 的重新分配，总和为 1'

# 合并覆盖：窗口够不到开头，压缩/选块补上
covered = set(idx) | set(widx)
assert 0 in covered, '合并后能覆盖到序列开头'
assert 0 not in set(widx), '窗口单独够不到开头'
print(f'\n合并覆盖 {len(covered)} / {L} 个原始位置；窗口单独只覆盖 {len(widx)} 个')

# 论文 §5.2 表 4：按访存量推算的预期加速
print('\n--- 论文表 4（decode 的 KV 访存量，等效 token 数）')
for ctx, nsa_load, speedup in [(8192, 2048, 4.0), (16384, 2560, 6.4), (32768, 3584, 9.1), (65536, 5632, 11.6)]:
    print(f'{ctx:>6}：全注意力 {ctx:>6}   NSA {nsa_load:>5}   预期 {ctx / nsa_load:>5.1f}×（论文写 {speedup}×）')
    assert abs(ctx / nsa_load - speedup) < 0.1, '论文的预期加速就是访存量之比'

# 压缩分支没有封顶：按 1/d 增长
l_, d_ = 32, 16
for s in (8192, 65536):
    n = (s - l_) // d_
    print(f'上下文 {s:>6}：压缩分支要读 {n:>5} 个条目（按 1/{d_} 增长，没有封顶）')
assert (65536 - l_) // d_ > (8192 - l_) // d_
print('OK 08')
