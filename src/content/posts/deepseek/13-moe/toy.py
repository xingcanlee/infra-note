"""13 DeepSeekMoE：路由、共享专家、bias 负载均衡。

uv run --with numpy python toy.py
"""
import numpy as np


def softmax(z):
    e = np.exp(z - z.max())
    return e / e.sum()


def moe_layer(x, gate_w, experts, shared, topk=2, bias=None, n_groups=1, topk_groups=1):
    n_experts = len(experts)
    scores = softmax(x @ gate_w)                       # gate：一个很小的线性层
    sel = scores + (bias if bias is not None else 0)   # bias 只影响「选谁」

    # ① 分组筛选：限制一个 token 的通信扇出
    if n_groups > 1:
        per = n_experts // n_groups
        g_score = [sel[g * per:(g + 1) * per].max() for g in range(n_groups)]
        kept = set(np.argsort(g_score)[::-1][:topk_groups])
        in_kept = np.array([(i // per) in kept for i in range(n_experts)])
        sel = np.where(in_kept, sel, -np.inf)

    # ② top-k
    chosen = np.sort(np.argsort(sel)[::-1][:topk])

    # ③ 权重用原始分数归一化（不含 bias）—— 关键
    w = scores[chosen] / scores[chosen].sum()

    # ④ 只跑被选中的专家
    y = sum(wi * experts[i](x) for wi, i in zip(w, chosen))
    return y + shared(x), chosen, w


rng = np.random.default_rng(0)
d, n_experts = 8, 6
gate_w = rng.normal(size=(d, n_experts))
experts = [(lambda x, i=i: np.full(d, float(i))) for i in range(n_experts)]
shared = lambda x: np.full(d, 100.0)

# 固定一个 token 的 gate 打分，便于复现
x = rng.normal(size=d)
scores = softmax(x @ gate_w)

_, c0, w0 = moe_layer(x, gate_w, experts, shared, topk=2)
print(f'不加 bias：token「读」选中专家 {c0}，权重 {w0.round(2)}')

bias = np.zeros(n_experts)
bias[1] = 5.0                      # 把专家 1 强行顶进 top-k
_, c1, w1 = moe_layer(x, gate_w, experts, shared, topk=2, bias=bias)
print(f'加 bias  ：token「读」选中专家 {c1}，权重 {w1.round(2)}')
assert 1 in c1 and 1 not in c0, 'bias 改变了选择'
idx = list(c1).index(1)
print(f'          专家 1 被 bias 顶进来了，但它的权重只有 {w1[idx]:.2f} —— bias 没有污染输出 ✓')
assert w1[idx] < 0.3, 'bias 不进入权重，所以它的权重仍然很小'
# 权重始终由原始分数决定
assert np.allclose(w1, scores[c1] / scores[c1].sum())
assert np.allclose(w0.sum(), 1.0) and np.allclose(w1.sum(), 1.0)

# 分组会缩小搜索空间
_, c_g1, _ = moe_layer(x, gate_w, experts, shared, topk=2, n_groups=2, topk_groups=1)
_, c_g2, _ = moe_layer(x, gate_w, experts, shared, topk=2, n_groups=2, topk_groups=2)
print(f'\n分组 2 保留 1 组：选中 {c_g1}')
print(f'分组 2 保留 2 组：选中 {c_g2}（等于不分组）')
assert list(c_g2) == list(c0), '保留全部组时等价于不分组'
assert all((i // 3) == (c_g1[0] // 3) for i in c_g1), '保留 1 组时，选中的专家必定同组'

# 激活比例：V3 671B 的真实配置
n_routed, n_act, n_shared_e = 256, 8, 1
ratio = (n_act + n_shared_e) / (n_routed + n_shared_e)
print(f'\n激活比例：V3 配置 ({n_routed} 选 {n_act} + {n_shared_e} 共享) = {ratio * 100:.2f}%')
assert abs(ratio - 9 / 257) < 1e-12
print(f'FLOPs 比：相对同参数量的稠密 FFN ≈ {ratio * 100:.1f}%')

# 671B / 37B 的公开口径与激活比例是两回事：前者含注意力、embedding 等
print(f'\n对照：V3 公布 671B 总参数、37B 激活 → {37 / 671 * 100:.1f}%'
      f'（这个比例含注意力与 embedding，不等于 MoE 层的 {ratio * 100:.1f}%）')
print('OK 13')
