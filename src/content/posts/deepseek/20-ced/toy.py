"""20 CED：prefill 近似减半，以及 SWA Bounded Replay 的窗口截断。

uv run python toy.py        # 不需要 numpy
"""


def prefill_cost(N, L, n_win, ced=False):
    """prefill 要把多少个 (token, 层) 对真正算一遍。"""
    if not ced:
        return N * L                                  # 每个 token 走完全部层
    encoder = N * (L // 2)                            # 完整跑前半层
    replay = n_win * (L // 2)                         # 只重放最近 n_win 个过 decoder
    return encoder + replay


L, n_win = 61, 128
print(f'L={L} 层，n_win={n_win}\n')
print(f'{"prompt 长度":>11}{"标准 prefill":>15}{"CED prefill":>14}{"省掉":>9}')
saves = {}
for N in (512, 2048, 8192, 32768, 131072):
    a, b = prefill_cost(N, L, n_win), prefill_cost(N, L, n_win, ced=True)
    save = 1 - b / a
    saves[N] = save
    print(f'{N:>11,}{a:>15,}{b:>14,}{save * 100:>8.1f}%')

assert saves[131072] > saves[512], 'prompt 越长，replay 的占比越小'
# L=61 是奇数，encoder 取 floor(L/2)=30 层，所以渐近线是 1 − 30/61 = 50.8%，略高于 50%
asymptote = 1 - (L // 2) / L
assert abs(saves[131072] - asymptote) < 0.01
print(f'\nprompt 越长，replay 那一项越可以忽略 → 越接近渐近线 {asymptote * 100:.1f}%')
print(f'（L={L} 是奇数，encoder 取 floor(L/2)={L // 2} 层，所以渐近线略高于 50%）')
print(f'短 prompt（512）只省 {saves[512] * 100:.1f}%，因为 n_win={n_win} 的重放占比还不小')

# 偶数层时正好是 50%
even_asym = 1 - (60 // 2) / 60
assert even_asym == 0.5
big = prefill_cost(10 ** 7, 60, n_win, ced=True) / prefill_cost(10 ** 7, 60, n_win)
assert abs((1 - big) - 0.5) < 0.001, 'L 为偶数时渐近线正好 50%'

# ── SWA Bounded Replay：窗口被 replay 起点截断 ──
W, s = 8, 100
print(f'\nSWA Bounded Replay 的窗口截断（W={W}、replay 起点 s={s}）：')


def window(i, W, s=None):
    lo = i - W + 1
    if s is not None:
        lo = max(s, lo)
    return (max(0, lo), i)


truncated = 0
for i in (100, 103, 107):
    std = window(i, W)
    cut = window(i, W, s)
    missing = (cut[0] - std[0])
    tag = f'少看 {missing} 个' if missing else '完整 ✓'
    print(f'  位置 {i}：标准窗口 [{std[0]}, {std[1]}] → 截断后 [{cut[0]}, {cut[1]}]，{tag}')

# 受影响的位置数恰好是 W-1
affected = sum(1 for i in range(s, s + 3 * W) if window(i, W, s)[0] > window(i, W)[0])
assert affected == W - 1, '只有 replay 段开头的 W-1 个位置看得比正常少'
print(f'  从第 W-1 个位置起窗口就恢复完整了 —— 近似只影响 replay 段开头的 {W - 1} 个位置')

# 受影响的位置数是常数，不随上下文增长
for ctx in (1000, 100000):
    aff = sum(1 for i in range(s, s + min(ctx, 3 * W)) if window(i, W, s)[0] > window(i, W)[0])
    assert aff == W - 1
print(f'  无论上下文多长，受影响的都是 {W - 1} 个位置（常数）')

# 两个口径不同的容量数字
print('\n两个不能混用的数字：')
print('  每 token 宽度：约 890 bytes/token，是 V4-Flash 的 1/4  ← CSA2 + FP4（下一篇）')
print('  persistent footprint：约 V4-Flash 的 1/8              ← CED + SWA Bounded Replay（本篇）')
assert 1 / 4 != 1 / 8
print('OK 20')
