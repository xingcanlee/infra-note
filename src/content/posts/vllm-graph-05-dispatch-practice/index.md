---
title: "无设备练习：图桶、padding 与运行时选路"
description: "用纯 Python 模拟图桶匹配、padding、FULL 与 PIECEWISE 回退，建立 vLLM 运行时选路的直觉。"
pubDate: 2026-11-05
tags: [vLLM, CUDA Graph, Python]
category: AI Infra
toc: true
---

## 练习范围

本篇只使用 Python 标准库，不调用 vLLM、CUDA Graph 或 ACLGraph。它模拟四件事：选择图桶、计算 padding、在 FULL 和 PIECEWISE 之间回退，以及理解固定缓冲区的引用关系。

不要把练习输出当作设备图或 vLLM 的执行证据。

## 图桶模拟器

把下面代码保存为 `graph_dispatch_demo.py`，使用 Python 3 运行。

```python
from bisect import bisect_left

BUCKETS = (1, 2, 4, 8)
FULL_KEYS = {1, 2, 4, 8}
PIECEWISE_KEYS = {1, 2, 4, 8}


def dispatch(num_tokens, uniform_decode, full_keys=FULL_KEYS):
    index = bisect_left(BUCKETS, num_tokens)
    if index == len(BUCKETS):
        return "NONE", num_tokens, 0

    padded = BUCKETS[index]
    if uniform_decode and padded in full_keys:
        mode = "FULL"
    elif padded in PIECEWISE_KEYS:
        mode = "PIECEWISE"
    else:
        return "NONE", num_tokens, 0

    return mode, padded, padded - num_tokens


for tokens, uniform in [(3, True), (6, True), (9, True), (6, False)]:
    print(tokens, uniform, "->", dispatch(tokens, uniform))

assert dispatch(3, True) == ("FULL", 4, 1)
assert dispatch(6, True) == ("FULL", 8, 2)
assert dispatch(9, True) == ("NONE", 9, 0)
assert dispatch(6, False) == ("PIECEWISE", 8, 2)
assert dispatch(6, True, full_keys={1, 2, 4}) == ("PIECEWISE", 8, 2)
```

预期输出：

```text
3 True -> ('FULL', 4, 1)
6 True -> ('FULL', 8, 2)
9 True -> ('NONE', 9, 0)
6 False -> ('PIECEWISE', 8, 2)
```

每行依次表示实际 token 数、是否满足 uniform decode、最终模式、执行 token 数和 padding 数。

## 四个案例

| 输入 | 选择过程 | 结果 |
| --- | --- | --- |
| 3 个 uniform decode token | 向上匹配到 4，FULL key 存在。 | `FULL`，补 1。 |
| 6 个 uniform decode token | 向上匹配到 8，FULL key 存在。 | `FULL`，补 2。 |
| 9 个 token | 超过最大桶 8。 | `NONE`，保持 9 个实际 token。 |
| 6 个非 uniform token | FULL 条件不满足，但 PIECEWISE key 存在。 | `PIECEWISE`，补 2。 |

从 `FULL_KEYS` 删除 8，6 个 uniform token 就会回退到 PIECEWISE。把 `BUCKETS` 增加到 16 并同步增加对应 key，9 个 token 就可以匹配 16 的桶。这些修改改变的是教学模型中的可用图集合；线上服务不会因为修改 Python 集合就动态完成设备捕获。

## padding 比例

如果 3 个 token 补到 4，额外槽位比例是 `1 / 3`。如果 6 个 token 补到 8，额外槽位比例是 `2 / 6`。

```text
额外槽位比例 = padding 数 / 实际 query token 数
```

这个比例只描述补齐的工作量，不等于延迟增加比例。attention 形状、kernel 选择、有效位置处理、通信和其他运行时开销都会影响时间。

真实实验还要固定同一批请求，比较精确桶和向上补齐桶，并检查最终模式和实际设备时间线。

## 固定引用

下面的例子不是设备指针模拟，只用来说明“修改原对象”和“让变量指向新对象”的差别。

```python
buffer = [0, 0]
reader = buffer

buffer[:] = [3, 3]       # 修改同一个列表。
assert reader == [3, 3]

buffer = [4, 4]          # 变量改为指向另一个列表。
assert reader == [3, 3]  # reader 仍引用原来的列表。
```

CUDA Graph 的静态输入有相似的使用要求：让新数值进入捕获时的那块存储。Tensor 的 `copy_` 原地写入和重新赋值不同。真实设备地址仍应通过 `data_ptr()` 等方式在硬件环境中检查。

## 证据边界

| 已知信息 | 可以下的结论 | 还不能下的结论 |
| --- | --- | --- |
| 编译缓存命中 | 找到可复用的编译产物。 | 本轮一定 replay 了设备图。 |
| 某个 key 捕获成功 | 这个 key 曾建立过设备图。 | 真实请求一定命中它。 |
| `Runtime Mode=FULL` | 本轮选择了 FULL 路径。 | wrapper 一定已经 replay。 |
| profiler 出现 graph launch | 采集范围内发生了图提交。 | 端到端一定更快。 |
| 一次运行更快 | 得到一个时间样本。 | 性能收益稳定且可复现。 |

## 检查点

1. 实际 token 数是 5，桶是 `[1, 2, 4, 8]`，uniform decode 为真，会补多少？
2. 8 的 FULL key 不存在，但 PIECEWISE key 存在，最终模式是什么？
3. 实际 token 数是 9，最大桶是 8，为什么不直接复用 8 的图？

## 有设备后的验证顺序

1. 记录模型、软件提交、runner、attention 后端、dtype、设备和固定输入。
2. 先确认普通 Eager 生成正确。
3. 比较只编译、PIECEWISE 和 FULL 的配置，保持其他变量不变。
4. 记录初始化、首轮和稳态结果，不要只记录一次总耗时。
5. 同时保存实际 batch、padding、Runtime Mode 和 profiler 时间线。

CUDA 可以使用 Nsight Systems，Ascend 可以使用 `torch_npu.profiler` 或 Ascend Profiling。采集 profiler 时应与正式计时分开，避免采集开销污染结果。

## 参考资料

- [vLLM 固定源码：dispatcher](https://github.com/vllm-project/vllm/blob/349b21487a607ed4912d71f5e8ba54b8e2ec3578/vllm/v1/cudagraph_dispatcher.py)
- [vLLM：CUDA Graphs 设计](https://docs.vllm.ai/en/latest/design/cuda_graphs/)
- [PyTorch：CUDA Graphs](https://docs.pytorch.org/docs/stable/notes/cuda.html#cuda-graphs)
