---
title: '关于'
description: '面向工程实践的大模型推理系统笔记：涵盖异构硬件基础、分布式并行通信、DeepSeek 架构演进与 vLLM / 昇腾运行时。'
---

`infra-note` 是一份关于大模型推理系统的工程笔记。读者具备 Python 基础即可起步。每一章都从可手算的小例子出发，串联公式推导、硬件约束与工程取舍，并对照 NVIDIA GPU 与华为昇腾 NPU 两套软硬件栈。

## 内容结构

全站按六个系列递进展开：单卡硬件与算子、多卡并行与通信、DeepSeek 模型架构、vLLM 推理引擎、vLLM-Ascend 昇腾拓展与推理执行图。全站共 46 篇文章，含 6 篇导览与 40 篇正文：

1. **[推理与异构硬件基础](../posts/foundations/)**：单卡算力与带宽瓶颈、GPU 与昇腾微架构、自注意力、KV 压缩、FlashAttention 与量化。
2. **[分布式并行与跨卡通信](../posts/distributed/)**：多卡互连拓扑、集合通信开销、混合并行切分、PD 分离与 MoE 通算重叠。
3. **[DeepSeek 架构演进](../posts/deepseek/)**：从 V2 到 V4.1 的 MLA 与稀疏注意力、细粒度 MoE、Engram、mHC 与 DSpark。
4. **[vLLM 推理引擎：架构与核心组件](../posts/vllm/)**：V1 进程架构、并行拓扑、PagedAttention、连续批调度、ModelRunner V2 与 PD 协议。
5. **[vLLM-Ascend 昇腾插件与硬件拓展](../posts/vllm-ascend/)**：OOT 插件、ARM 绑核、`PA_NZ`、KVPP、MC2、Mooncake 与自定义算子。
6. **[推理执行图：CUDA Graph 与 ACL Graph](../posts/execgraph/)**：异步队列、编译分段、CUDA/ACL Graph 与 vLLM 模式编排。

按上述六个系列顺序阅读最连贯。若专注推理引擎或硬件插件，也可直接切入[vLLM 推理引擎](../posts/vllm/)、[vLLM-Ascend 昇腾插件](../posts/vllm-ascend/)或[推理执行图：CUDA Graph 与 ACL Graph](../posts/execgraph/)。遇到算子或通信细节，再按需回查前序基础系列。

## 代码与源码基准

正文中的数值验证脚本使用 Python（NumPy 与 PyTorch）编写，均可在普通 CPU 环境独立运行，方便边读边核对张量形状与中间结果。论文实测加速比与硬件跑分均注明原始出处及测试条件。

文中引用的源码路径与行号均核验自下列上游仓库的固定提交：

| 上游仓库                          | 核验提交                | 说明                           |
| --------------------------------- | ----------------------- | ------------------------------ |
| `vllm` / `vllm-ascend`            | `99b0b0b0` / `b776261e` | GPU 与昇腾推理引擎主仓         |
| `cann/runtime` / `Ascend/pytorch` | `1954820a` / `d09e29e4` | 昇腾图捕获运行时与 `torch_npu` |
| `DeepSeek-V3` / `FlashMLA`        | `9b4e9788` / `395cb3af` | 模型参考实现与 Hopper/昇腾算子 |
| `DeepEP` / `Engram`               | `f6aa38fe` / `fb7f84a2` | MoE 跨卡通信与条件记忆参考实现 |
