"""02 torch.compile：guard 缓存、重编译上限、以及图桶为什么必要。

纯 Python，只模拟 Dynamo 的缓存/guard 逻辑，不模拟编译耗时或融合效果。

uv run python toy.py
"""


class FakeCompiler:
    """模拟 Dynamo：按 guard key 缓存编译结果，超过上限回退 eager。"""

    def __init__(self, recompile_limit=8, dynamic=False):
        self.cache, self.limit, self.dynamic = {}, recompile_limit, dynamic
        self.compiles = self.hits = self.eager_fallbacks = 0

    def key(self, shape):
        # dynamic=False：按完整 shape 特化；dynamic=True：batch 维变成符号
        return shape if not self.dynamic else ('*',) + tuple(shape[1:])

    def __call__(self, shape):
        k = self.key(shape)
        if k in self.cache:
            self.hits += 1
            return 'cached'
        if self.compiles >= self.limit:
            self.eager_fallbacks += 1          # 超过上限，放弃编译
            return 'eager-fallback'
        self.cache[k] = True
        self.compiles += 1
        return 'compiled'


def report(label, c):
    print(f'{label}\n  编译 {c.compiles} 次，命中 {c.hits} 次，回退 eager {c.eager_fallbacks} 次')
    return c


print('静态（dynamic=False），batch 依次为 1..12：')
c1 = FakeCompiler()
for b in range(1, 13):
    c1((b, 4096))
report('', c1)
assert c1.compiles == 8 and c1.eager_fallbacks == 4, '每个新 batch 都重编译，很快撞上默认上限 8'

print('\n静态，batch 只在 {1,2,4,8} 里取（图桶的做法），共 40 次调用：')
c2 = FakeCompiler()
buckets = [1, 2, 4, 8]


def to_bucket(b):
    for x in buckets:
        if b <= x:
            return x
    return buckets[-1]


for i in range(40):
    c2((to_bucket(i % 8 + 1), 4096))
report('', c2)
assert c2.compiles == 4 and c2.eager_fallbacks == 0
assert c2.hits / 40 >= 0.9, '预先限定形状后命中率 90%'

print('\n动态（dynamic=True），batch 依次为 1..12：')
c3 = FakeCompiler(dynamic=True)
for b in range(1, 13):
    c3((b, 4096))
report('', c3)
assert c3.compiles == 1 and c3.hits == 11, '一份动态 kernel 应付全部形状'

# 上限调小会更早回退
c4 = FakeCompiler(recompile_limit=2)
for b in range(1, 13):
    c4((b, 4096))
assert c4.compiles == 2 and c4.eager_fallbacks == 10
print(f'\n把 recompile_limit 改成 2：编译 {c4.compiles} 次后，剩下 {c4.eager_fallbacks} 次全部静默回退 eager')
print('（真实服务里的现象是：某些 batch 突然变慢，但不报错）')

# padding 到桶：代价是算了用不上的 token
print('\n图桶的代价——padding：')
total_real = total_padded = 0
for b in (1, 3, 5, 7):
    p = to_bucket(b)
    total_real += b
    total_padded += p
    print(f'  batch {b} → 桶 {p}，浪费 {p - b} 个位置')
waste = (total_padded - total_real) / total_padded
print(f'  合计浪费 {waste * 100:.1f}% 的计算')
assert 0 < waste < 0.5
print('OK vllm-02')
