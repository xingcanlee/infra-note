"""01 PyTorch 的异步执行：提交只入队，同步才等待。

纯 Python，不需要 PyTorch、不需要 GPU。
与文章里的动画是同一个排程模型（TS 版在 src/explainers/core/submit.ts，带单测）。

uv run python toy.py
"""


class FakeDevice:
    """用时间戳模拟异步队列：提交只入队，同步才等。"""

    def __init__(self):
        self.queue_end = 0.0     # 设备上已排到的时间点
        self.cpu = 0.0           # CPU 当前时间点
        self.bubble = 0.0        # 设备空闲累计
        self._prev_end = 0.0

    def launch(self, exec_time, launch_cost=0.2):
        self.cpu += launch_cost                       # CPU 提交的固定开销
        start = max(self.queue_end, self.cpu)         # 设备不能早于提交完成
        self.bubble += max(0.0, start - self._prev_end)
        self.queue_end = start + exec_time
        self._prev_end = self.queue_end
        return start, self.queue_end

    def synchronize(self):
        self.cpu = max(self.cpu, self.queue_end)      # ← CPU 被钉住


def decode_layer_ops(n_layers=2, scale=1.0):
    ops = []
    for i in range(n_layers):
        for name, ex in (('norm', 0.3), ('qkv', 0.8), ('attn', 1.0), ('out', 0.6), ('ffn', 1.2)):
            ops.append({'name': f'L{i}·{name}', 'exec': ex * scale})
    return ops


def run(ops, sync_after=(), launch_cost=0.2):
    d = FakeDevice()
    for i, o in enumerate(ops):
        d.launch(o['exec'], launch_cost)
        if i in sync_after:
            d.synchronize()
    wall = d.queue_end
    return wall, d.bubble


ops = decode_layer_ops(2)
cases = [
    ('none', '不打断：    ', ()),
    ('one', '一个同步点：', (4,)),
    ('all', '每步都同步：', tuple(range(len(ops)))),
]
results = {}
for key, label, sync in cases:
    wall, bub = run(ops, sync)
    results[key] = (wall, bub)
    print(f'{label} 墙钟 {wall:4.1f}   设备空闲 {bub:4.1f} ({bub / wall * 100:4.1f}%)')

no_sync, one_sync, all_sync = results['none'], results['one'], results['all']
assert abs(no_sync[0] - 8.0) < 1e-9
assert one_sync[0] > no_sync[0], '同步点让墙钟变长'
assert all_sync[1] > one_sync[1] > no_sync[1], '同步点越多，空闲越多'
# 一个同步点就让空闲占比翻倍；每步都同步则完全失去流水线
assert no_sync[1] / no_sync[0] < 0.03
assert one_sync[1] / one_sync[0] > no_sync[1] / no_sync[0] * 1.8
assert all_sync[1] / all_sync[0] > 0.2

print('\n算子放大 6 倍（模拟 prefill / 大 batch）：')
big = decode_layer_ops(2, scale=6)
w_big, b_big = run(big)
print(f'不打断：     墙钟 {w_big:4.1f}  设备空闲 {b_big:4.1f} ({b_big / w_big * 100:4.1f}%)')
w_big_s, b_big_s = run(big, (4,))
print(f'同一个同步点只让空闲从 {b_big / w_big * 100:.1f}% 涨到 {b_big_s / w_big_s * 100:.1f}% '
      f'—— 算子够大时，同步点也被掩盖了')
# 算子大时，同步点的相对代价小得多
small_penalty = one_sync[1] / one_sync[0] - no_sync[1] / no_sync[0]
big_penalty = b_big_s / w_big_s - b_big / w_big
assert big_penalty < small_penalty, '算子越大，同步点的相对代价越小'

# 提交越便宜，一切开销都被掩盖
w_cheap, b_cheap = run(ops, (), launch_cost=0.01)
print(f'\n提交开销降到 0.01：墙钟 {w_cheap:.2f}，设备空闲占 {b_cheap / w_cheap * 100:.2f}%')
assert b_cheap / w_cheap < 0.01, '提交足够便宜时没有空闲可省——图模式也就没有收益'
print('OK vllm-01')
