---
title: "CUDA Graph 的边界：流、内存池与分段捕获"
description: "从预热、内存生命周期、多流通信和动态边界出发，判断完整模型中哪些区域适合进入 CUDA Graph。"
series:
  id: vllm-graph
  order: 6
pubDate: 2026-11-05
tags: [CUDA Graph, PyTorch, vLLM]
category: AI Infra
toc: true
---

## 捕获边界

优先把下面条件稳定的计算区域放进图：

- 输入形状和存储地址稳定；
- kernel 序列和 launch 配置稳定；
- 图内任务之间的依赖可以明确表达；
- 区域不需要 CPU 读取设备结果来决定下一步。

不满足条件的动态前处理、采样、分支或不支持的算子，可以留在图外。

```text
图外：准备动态输入
  → 图内：稳定的模型计算块
  → 图外：采样、分支和结果处理
```

部分捕获提高了兼容性，但一轮执行可能需要多次 graph launch 和边界处理。PIECEWISE 和 FULL 的差异不是“有没有图”，而是“哪些计算进入同一段设备图”。

## 预热

第一次执行算子可能加载 kernel、创建 workspace、选择算法或初始化库状态。把这些动作留到 capture 期间，容易得到不可捕获或不可重复的调用。

PyTorch 手工捕获示例会使用旁路流预热，再与当前流建立依赖：

```python
side = torch.cuda.Stream()
side.wait_stream(torch.cuda.current_stream())
with torch.cuda.stream(side):
    for _ in range(3):
        run_block(static_input)
torch.cuda.current_stream().wait_stream(side)
```

第一个 `wait_stream` 让旁路流看到已经准备好的输入，第二个让后续使用者等到预热完成。它建立的是设备执行依赖，不等于 CPU 一直阻塞等待。

vLLM 会管理自己的预热流和捕获流程。不要因为用户代码没有创建旁路流，就直接判断框架没有正确预热。

## 三类内存

“捕获期间不能分配内存”这个说法不够准确。PyTorch 可以把捕获期分配路由到图私有内存池，并管理临时存储的复用。排错时要把下面三类存储分开看。

| 存储 | 需要保证什么 |
| --- | --- |
| 图外输入、权重、KV cache | 地址有效，所有权和生命周期足够长。 |
| 图内临时分配 | 遵守图池和框架生命周期规则，不能随意跨图使用。 |
| 图输出槽位 | 可能被下一轮 replay 或共享池中的另一张图覆盖。 |

所以要同时检查 `data_ptr()` 和存储生命周期。Python 对象还存在，不代表底层地址仍然适合这张图。多个图显式共享内存池也不代表它们可以任意并发使用。

## 多流与通信

同一 stream 内的提交顺序可以表达先后关系。跨 stream 则需要 event、wait 或等价机制。多流 capture 还要求参与的 stream 按 CUDA 规则加入捕获，并在结束前正确汇合。

检查时分成两层：

- **图内依赖**：生产者是否先于消费者完成，参与捕获的 stream 是否正确关联。
- **跨轮依赖**：本轮更新是否早于本轮读取，下一轮写入是否会覆盖上一轮仍在使用的数据。

通信库还必须支持 graph capture，并保证各 rank 的 collective 次序匹配。一个 rank 走图，另一个 rank 走不同的通信顺序，可能造成等待或挂起。

## 按现象排错

| 现象 | 先检查 |
| --- | --- |
| capture 报 `operation not permitted` | 同步、设备查询、不支持的 API 和第三方调用。 |
| 换输入后结果不变 | 新数据是否写入原地址，而不是重新绑定变量。 |
| 只有部分 shape 失败 | 是否有对应捕获桶，launch 配置是否兼容。 |
| 多流时偶发错误或挂起 | event、wait、跨轮依赖和数据生命周期。 |
| 图内存明显增加 | 桶数量、workspace、共享池规则和图生命周期。 |

在有设备的环境中，按下面顺序恢复复杂度：

1. 单流、单 shape、单算子；
2. 单流、多个 shape；
3. 多流和跨流依赖；
4. 通信；
5. 完整模型。

每次只增加一个因素，并记录首次出错的位置。这样才能区分算子不支持、地址失效和依赖错误。

## PIECEWISE 与 FULL

vLLM 的 PIECEWISE 通常按编译边界把模型拆成多个可捕获区域，attention 等边界保留在图外。源码中还可能出现 breakable capture，用于处理中断捕获边界。

它们都可能让一部分工作留在图外，但不能因此认为它们使用相同的编译切图、缓冲区或错误恢复机制。阅读源码时，要分别跟踪：谁划分边界、谁准备输入输出、谁创建图、谁决定 replay。

## 检查点

1. 为什么要在 capture 前预热？
2. 图外输入、图内临时分配和图输出槽位分别由谁管理？
3. 跨 stream 的依赖为什么不能只看 Python 代码顺序？
4. 为什么要从单流单 shape 开始恢复完整模型？
5. PIECEWISE 和 breakable capture 为什么不能只按“部分进图”来判断相同？

## 参考资料

- [PyTorch：CUDA Graphs 约束](https://docs.pytorch.org/docs/stable/notes/cuda.html#constraints)
- [PyTorch：图内存管理](https://docs.pytorch.org/docs/stable/notes/cuda.html#graph-memory-management)
- [PyTorch：make_graphed_callables](https://docs.pytorch.org/docs/stable/generated/torch.cuda.make_graphed_callables.html)
- [vLLM：torch.compile 与分段捕获](https://docs.vllm.ai/en/latest/design/torch_compile/)
