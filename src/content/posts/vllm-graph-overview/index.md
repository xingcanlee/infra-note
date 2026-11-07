---
title: "vLLM 图模式入门：CUDA Graph 与 Ascend ACLGraph"
description: "从普通执行开始，逐步理解编译图、CUDA Graph、vLLM 运行时选路和 Ascend ACLGraph。"
series:
  id: vllm-graph
  order: 1
pubDate: 2026-11-06
tags: [vLLM, CUDA Graph, ACLGraph, Ascend]
category: AI Infra
featured: true
toc: true
---

这是一套面向初学者的 vLLM 图模式入门。不需要先拥有 GPU 或 NPU，可以先用 CPU 和纯 Python 建立概念，再把这些概念映射到 CUDA Graph、Ascend ACLGraph，以及 vLLM 的运行时选路。

读完基础路线后，你应该能回答四个问题：

- 一次大模型推理为什么会受到 CPU 提交开销影响？
- `torch.compile` 的编译图和 CUDA Graph、ACLGraph 的设备图有什么区别？
- vLLM 为什么要准备多个图桶，并在运行时选择 `FULL`、`PIECEWISE` 或 `NONE`？
- 日志显示“编译成功”或“选择 FULL”时，哪些结论可以下，哪些结论还需要 profiler 证明？

## 执行链

```text
Python / 模型代码
  → 编译器取出可优化的计算图
  → 编译后端返回可调用实现
  → 运行时为稳定的工作路径捕获设备图
  → vLLM 根据本轮 batch 选择图桶并 replay
```

这不是每次都完整经过的固定流水线。编译图和设备图可以单独使用，也可以叠加。设备图只负责重复提交已经确定的设备工作，不会自动改变模型的数学计算。

## 基本术语

| 词 | 在本文中的含义 |
| --- | --- |
| Eager | 每轮由框架逐步执行模型计算。 |
| Kernel | 在 GPU 或 NPU 上实际执行的设备函数。 |
| Launch | CPU 把一个设备任务提交给 GPU 或 NPU 的动作。 |
| Batch | 调度器在这一轮合并执行的工作，不等于同时活跃的请求数。 |
| Replay | 把已经捕获的设备图再次提交执行。 |

大模型推理还会遇到 `prefill`、`decode` 和 KV cache。第 00 篇会用一条请求的生命周期解释它们，不要求先了解 attention 的实现细节。

## 阅读路线

建议不要从 Ascend 的底层接口开始，先完成没有设备也能验证的部分，再阅读平台实现。

### 零设备入门

1. [00 · 图模式入门：推理流程与提交开销](../vllm-graph-00-inference-overhead/)：理解 prefill、decode、batch、提交开销和三类图。
2. [05 · 无设备练习：图桶、padding 与运行时选路](../vllm-graph-05-dispatch-practice/)：用纯 Python 练习图桶、padding 和模式回退。
3. [01 · 编译图入门：torch.compile、FX 与断图](../vllm-graph-01-compile-graphs/)：在 CPU 上观察 FX 图，确认编译图不是设备图。

完成这三步后，你应能看懂“本轮工作 → 选择图桶 → 回退普通执行”的基本决策。

### CUDA Graph

4. [02 · CUDA Graph：捕获、重放与固定地址](../vllm-graph-02-cuda-graph/)：理解 capture、instantiate、replay，以及为什么要向固定地址写入新数据。
5. [03 · CUDA Graph 的边界：流、内存池与分段捕获](../vllm-graph-03-cuda-boundaries/)：补充流、内存池、通信和分段捕获。

### vLLM 与 Ascend

6. [04 · vLLM 如何选图：模式、图桶与运行时分发](../vllm-graph-04-vllm-dispatch/)：把前面的概念对应到 `BatchDescriptor`、dispatcher、图桶和 padding。
7. [06 · Ascend 图模式：NPUGraph、TorchAir 与 ACLGraph](../vllm-graph-06-ascend-graph/)：区分 `NPUGraph`、TorchAir、`npugraph_ex` 和 `ACLGraphWrapper` 所在的层次。
8. [07 · Ascend 配置与排错：无设备阅读指南](../vllm-graph-07-ascend-debugging/)：学习如何从配置、日志和故障现象定位检查范围。

## 三个容易混淆的区别

### 编译图与设备图

`torch.compile` 取出 FX 图，交给后端做融合、代码生成或其他优化。CUDA Graph 和 ACLGraph 记录的是已经确定的设备工作及其依赖，重点是减少重复提交。前者关注“怎样实现计算”，后者关注“怎样再次提交计算”。

### 运行时模式与图实例

`FULL`、`PIECEWISE` 和 `NONE` 描述本轮采用哪条执行路径。图桶和 `BatchDescriptor` 决定这条路径能否处理当前 batch。dispatcher 选出 key 后，wrapper 才会查找已有图、执行 replay，或进入普通调用。

### 地址与输入数值

捕获时，图会记录设备地址、形状、launch 配置和任务依赖。运行时可以把新 token、position 或 attention 元数据写入受支持的固定缓冲区，再重放同一张图。重新给 Python 变量赋值，不会改变图里保存的设备地址。

## 日志证据

| 看到的信号 | 可以说明 | 不能单独说明 |
| --- | --- | --- |
| 编译缓存命中 | 找到了可复用的编译产物。 | 本轮一定 replay 了设备图。 |
| 某个 key 捕获成功 | 这个 key 曾建立过设备图。 | 真实请求一定命中这个 key。 |
| `Runtime Mode=FULL` | dispatcher 选择了 FULL 路径。 | wrapper 已经执行 replay，或端到端一定更快。 |
| profiler 出现 graph launch | 采集范围内发生了图提交。 | 相比 Eager 一定有稳定收益。 |

要判断性能，至少固定模型、软件版本、输入、输出长度、并发和采样参数，并同时记录初始化、首轮和稳态结果。图模式减少的是一类提交开销；padding、通信、采样和显存占用可能成为新的主要因素。

## 环境边界

| 内容 | 是否需要 GPU 或 NPU |
| --- | --- |
| 阅读 00、04、06、07 篇 | 不需要。 |
| 运行 05 篇纯 Python 示例 | 不需要。 |
| 运行 01 篇 CPU 取图示例 | 需要支持 `torch.compile` 的 CPU 版 PyTorch。 |
| 执行 CUDA Graph 或 ACLGraph capture、replay | 需要匹配的软件、驱动和 GPU 或 NPU。 |
| 判断真实性能收益 | 需要设备 profiler 和可重复的对照实验。 |

本系列不是安装兼容矩阵，也不是性能基准。部署前请按目标硬件核对模型、vLLM、平台插件、PyTorch、`torch_npu`、CANN 和驱动版本。

## 源码范围

章节中的源码分析固定在文章中注明的提交附近。固定提交用于解释代码行为，不代表当前版本或所有硬件的兼容性。

- [vLLM 349b214](https://github.com/vllm-project/vllm/tree/349b21487a607ed4912d71f5e8ba54b8e2ec3578)：运行时模式、`BatchDescriptor`、dispatcher 和 V1 执行路径。
- [vLLM Ascend 3b715ff](https://github.com/vllm-project/vllm-ascend/tree/3b715ff78066d22b95be6f4a84e861a44930b25a)：模式归一化、编译接口、ACLGraph 和参数更新。
- [PyTorch CUDA Graph 文档](https://docs.pytorch.org/docs/stable/notes/cuda.html#cuda-graphs)：捕获、地址约束和图内存管理。
- [PyTorch CUDA Graph 博客](https://pytorch.org/blog/accelerating-pytorch-with-cuda-graphs/)：从提交开销角度理解设备图的收益来源。
- [`NPUGraph.cpp`](https://github.com/Ascend/pytorch/blob/10e2cc06ffd0474d8edbfc3b54cb1776196fa668/torch_npu/csrc/core/npu/NPUGraph.cpp)：NPU 捕获对象、图池和底层重放接口。

## 图表

本系列的 draw.io 源文件与主题化 `.wisp.svg` 产物保存在各文章的 `diagrams/` 目录中。图中的时间线和数据流是机制示意，不是某次部署的性能测量。需要理解多卡执行时，可继续阅读 rank、通信组和各卡数据分工相关的资料。
