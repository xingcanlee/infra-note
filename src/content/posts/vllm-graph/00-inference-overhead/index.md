---
title: "图模式入门：推理流程与提交开销"
description: "从 prefill、decode 和 kernel 提交开始，理解设备图如何减少大模型推理中的重复提交开销。"
series:
  id: vllm-graph
  order: 2
pubDate: 2026-11-05
tags: [vLLM, CUDA Graph, ACLGraph]
category: AI Infra
featured: true
toc: true
---

## 推理过程

模型不会一次性生成整段回答，而是先处理输入，再逐步生成输出 token。

- **Prefill**：处理 prompt 中已有的 token，建立 KV cache，并为第一个输出 token 准备结果。
- **Decode**：每轮读取已有的 KV cache，计算下一个 token。普通自回归解码中，每个活跃请求每轮通常只增加一个 query token。
- **KV cache**：保存历史位置的 Key 和 Value，后续 decode 读取它们，避免重新计算整段历史。

例如，三个请求已经有很长的上下文，本轮可能只需要计算三个新 token。计算量不一定大，但这三个请求会重复经历准备参数、调用算子和提交设备工作的流程。

![工作先提交、kernel 后执行，设备图将多次提交合并为一次 graph launch](./diagrams/00-inference-timeline.drawio "图 00-1：工作先提交，设备图减少重复提交与等待")

这里要区分两个数量：**并发数**是同时活跃的请求数，**batch** 是本轮实际合并执行的工作。调度器可以把 prefill、decode 或不同长度的请求放进同一个 batch，所以两者不能直接画等号。

## CPU 与设备

CPU 运行框架代码，准备输入和元数据，再把设备工作提交到 GPU 或 NPU。下面五个词足够支撑本系列的阅读。

| 词 | 含义 |
| --- | --- |
| 算子 | 框架中的张量操作，例如矩阵乘法、ReLU 或 attention。 |
| Kernel | 在设备上实际执行的函数。一个算子可能对应多个 kernel。 |
| Launch | CPU 把一个设备任务提交出去的动作。 |
| Stream | 设备工作队列，同一 stream 中的任务遵循已经建立的顺序。 |
| Buffer | 保存输入、输出或中间结果的设备存储。 |

普通 Eager 执行会反复分发算子和提交 kernel。kernel 很短时，设备可能已经完成当前任务，但 CPU 还没有准备好下一项。时间线中的空隙就是提交开销可能暴露出来的地方。

设备图先记录一段 kernel、copy、参数和依赖。重放时，CPU 用一次 graph launch 提交这段已记录的工作。设备仍然执行原来的计算，设备图主要减少框架分发和驱动提交的重复工作。

因此，设备图不保证所有模型都变快。计算本身很重、padding 很多、通信占主要时间，或图的准备成本无法摊薄时，收益可能很小。

## 三层图

本系列会反复使用下面三层概念。

| 层次 | 代表 | 解决的问题 |
| --- | --- | --- |
| 编译图 | FX、`torch.compile` | 表示算子和数据依赖，便于融合、代码生成和其他编译优化。 |
| 设备图 | CUDA Graph、NPUGraph、ACLGraph | 记录已经确定的设备工作，减少重复提交。 |
| 运行时模式 | vLLM 的 `NONE`、`PIECEWISE`、`FULL` | 根据本轮 batch 选择普通执行、分段设备图或完整目标区域设备图。 |

![编译图和设备图可以分别使用，也可以叠加](./diagrams/00-execution-modes.drawio "图 00-2：编译图和设备图属于不同层次")

例如，编译器可以把“乘法、加法、ReLU”优化成更少的 kernel。设备图则记录最终需要提交的 kernel 序列。`torch.compile(fullgraph=True)` 的 `fullgraph` 描述编译取图是否允许断图；vLLM 的 `FULL` 描述设备图覆盖范围。两个 `FULL` 不在同一层。

## 捕获与重放

以常规 stream capture 为例，图通常会固定以下内容：

- kernel 序列、launch 配置和设备依赖；
- 输入、输出、权重和 workspace 的相关设备地址；
- 与这张图匹配的形状、布局和 batch 条件。

重放时可以改变缓冲区里的数值。新的 token 和 position 可以写入捕获时使用的输入缓冲区，再由图读取。

```text
static_input.copy_(new_input)  →  原地址中的数值改变
static_input = new_input       →  Python 变量改了指向，图中的地址没有改变
```

如果本轮形状或 launch 配置不兼容，框架不能只替换输入数值。vLLM 通常会选择另一张图、把工作 padding 到已捕获的桶，或者回退到 `NONE`。

Python 中依赖设备数值的分支、CPU 同步和不受支持的算子也可能阻止捕获。编译取图与 CUDA Graph 的地址约束分别见后续章节。

## 适用负载

下面的负载更适合尝试设备图：

- decode 轮数多，且常见 batch 形状集中；
- 每轮设备计算较短，CPU 提交开销占比明显；
- padding 较少，图池和 workspace 不会明显挤压 KV cache。

可以用一个粗略模型理解准备成本的摊销：

```text
重复轮数 ×（每轮节省的提交时间 − padding 代价） > 预热与捕获成本
```

这只是帮助建立直觉的模型，不是计时公式。真实判断要看同一负载下的重复测量、设备时间线、padding、显存和端到端指标。

## 检查点

1. prefill 和 decode 的主要工作有什么不同？
2. 一个算子、一个 kernel 和一次 launch 分别是什么？
3. 编译图与设备图各自改变了什么？
4. 为什么把 Python 变量重新绑定到新 Tensor 不足以更新图的输入？
5. `Runtime Mode=FULL` 能否单独证明设备已经 replay？

## 参考资料

- [PyTorch：Accelerating PyTorch with CUDA Graphs](https://pytorch.org/blog/accelerating-pytorch-with-cuda-graphs/)
- [PyTorch：CUDA Graphs](https://docs.pytorch.org/docs/stable/notes/cuda.html#cuda-graphs)
- [vLLM：CUDA Graphs 设计](https://docs.vllm.ai/en/latest/design/cuda_graphs/)
