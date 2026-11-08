"""03 CUDA Graph：固定地址、CPU 工作被跳过、形状不能变。

纯 Python。只演示约束的语义，不模拟真实 CUDA 行为。
重点：② ③ ④ 三个错误都 **不会报错**。

uv run python toy.py
"""


class FakeGraph:
    """记录「对哪些地址做哪些操作」，replay 时只重放设备操作。"""

    def __init__(self):
        self.recorded = []       # [(op_name, in_addr, out_addr)]
        self.shapes = {}
        self.skipped_cpu = 0

    def capture(self, ops):
        for op in ops:
            if op['kind'] == 'cpu':
                self.skipped_cpu += 1
                continue                       # 约束 7：CPU 工作不会被捕获
            if op.get('sync'):
                raise RuntimeError('捕获期间禁止同步操作（约束 2）')
            self.recorded.append((op['name'], op['in'], op['out']))
            self.shapes[op['in']] = op['shape']

    def replay(self, memory):
        for name, src, dst in self.recorded:
            memory[dst] = f'{name}({memory[src]})'   # 永远读写同一批地址


# 「显存」：地址 → 内容
memory = {'addr_in': None, 'addr_out': None}
ops = [
    {'kind': 'dev', 'name': 'f', 'in': 'addr_in', 'out': 'addr_out', 'shape': (8, 4096)},
]

g = FakeGraph()
g.capture(ops)

# ① 正确做法：copy_ 进固定缓冲区
print('① 固定地址：用 copy_ 写进静态缓冲区')
memory['addr_in'] = '第一轮数据'
g.replay(memory)
memory['addr_in'] = '第二轮数据'          # 相当于 static_in.copy_(x)
g.replay(memory)
print(f'   replay 后 out = {memory["addr_out"]}   ✓ 正确')
assert memory['addr_out'] == 'f(第二轮数据)'

# ② 最常见的 bug：给 Python 名字重新赋值
print('\n② 重新赋值（最常见的 bug）：static_in = new_tensor')
memory2 = {'addr_in': '第一轮数据', 'addr_out': None}
g.replay(memory2)
_rebound = '第二轮数据'                   # 相当于 static_in = new_tensor：图里的指针没变
g.replay(memory2)
print(f'   replay 后 out = {memory2["addr_out"]}   ✗ 错误，而且没有任何报错')
assert memory2['addr_out'] == 'f(第一轮数据)', '图读的还是老地址'

# ③ CPU 工作被跳过（约束 7）
print('\n③ CPU 工作被跳过（约束 7）')
counter = {'n': 0}
ops_with_cpu = [
    {'kind': 'dev', 'name': 'f', 'in': 'addr_in', 'out': 'addr_out', 'shape': (8, 4096)},
    {'kind': 'cpu', 'name': 'counter += 1'},
]
g2 = FakeGraph()
counter['n'] += 1                          # 捕获时这行真的执行了一次
g2.capture(ops_with_cpu)
print(f'   捕获时 counter = {counter["n"]}；', end='')
for _ in range(3):
    g2.replay(memory)                      # replay 不会执行 CPU 工作
print(f'replay 3 次后 counter 仍然 = {counter["n"]}')
print('   —— 被捕获代码里的 Python 逻辑一次都没执行')
assert counter['n'] == 1 and g2.skipped_cpu == 1

# ④ 形状变了（约束 9）
print('\n④ 形状变了（约束 9）')
print(f'   捕获时 shape={g.shapes["addr_in"]}，replay 时传入 (16, 4096)')
print('   —— 真实 CUDA 不会检查，直接按旧形状读内存')
assert g.shapes['addr_in'] == (8, 4096)

# ⑤ 同步点在捕获时就会被拒绝（约束 2，这个会报错）
print('\n⑤ 同步点（约束 2）：这一条是会报错的')
g3 = FakeGraph()
try:
    g3.capture([{'kind': 'dev', 'name': 'item', 'in': 'addr_out', 'out': 'host',
                 'shape': (1,), 'sync': True}])
    raise AssertionError('应该报错')
except RuntimeError as e:
    print(f'   RuntimeError: {e}')

print('\n小结：约束 2 会报错；约束 7、8、9 静默出错 —— 后者才是真正危险的。')
print('OK vllm-03')
