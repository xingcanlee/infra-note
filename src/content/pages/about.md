---
title: '关于'
description: '关于 infra-note：面向工程实践的大模型推理系统笔记，覆盖异构硬件基础、分布式并行通信、DeepSeek 架构演进与 vLLM / 昇腾运行时。'
---

`infra-note` 是一份关于大模型推理系统的工程笔记。读者只需具备 Python 编程基础即可起步；每一章从可手算的小例子出发，将公式推导、硬件约束与生产代码里的工程取舍串联起来，并同时对照 NVIDIA GPU 与华为昇腾 NPU 两套软硬件栈。

## 内容结构

全站按“单卡硬件与算子 → 多卡并行与通信 → DeepSeek 模型架构 → 推理引擎运行时 → 执行图与昇腾设备图”的顺序分为 5 个系列，共 35 篇文章（5 篇导览与 30 篇正文）：

1. **[推理与异构硬件基础](../posts/foundations/)**：单卡上的算力与显存带宽边界、GPU 与昇腾核内微架构差异、自注意力与旋转位置编码、KV Cache 压缩、FlashAttention 分块融合以及低比特量化。
2. **[分布式并行与跨卡通信](../posts/distributed/)**：当单卡装不下模型或扛不住并发时，跨卡互联拓扑、集合通信开销、混合并行切分、Prefill/Decode 分离（PD 分离）架构，以及 MoE 通信与计算重叠调度。
3. **[DeepSeek 架构演进](../posts/deepseek/)**：聚焦从 DeepSeek-V2 到 V4.1 的核心结构变化，涵盖多头潜在注意力（MLA）与稀疏注意力家族、细粒度 MoE 负载均衡、条件记忆查表、多流残差约束以及多 token 投机解码。
4. **[vLLM 与昇腾推理引擎](../posts/vllm/)**：把模型与通信逻辑放进真实生产运行时，拆解分页显存管理与连续批处理调度、主机异步发射开销、`torch.compile` 分段编译、静态图捕获边界、跨卡图模式共识以及通用性能排障方法。
5. **[执行图与昇腾 ACL Graph](../posts/aclgraph/)**：从异构算力流、`SQ/CQ` 硬件队列与 `Event`/`Notify` 同步原语起步，串联 `torch.compile` 编译期融合限界与 CUDA Graph 四大静态边界，深入昇腾 CANN Runtime 影子模型流、`TaskGrp` 局部刷新、条件子图流控以及 `vllm-ascend` 四层生产栈与线上排障。

按上述五个系列顺序阅读最连贯；若关注线上推理服务调优或昇腾图捕获机制，也可以直接从[vLLM 与昇腾推理引擎](../posts/vllm/)或[执行图与昇腾 ACL Graph](../posts/aclgraph/)切入，遇到算子或通信细节再回查前序基础系列。

## 代码与源码基准

正文中的数值验证脚本基于 Python（NumPy 与 PyTorch）编写，均可在普通 CPU 环境独立运行，方便边读边核对张量形状与中间结果。文中引用的生产实现、源码路径与行号均核验自对应上游仓库的固定提交：`cann/runtime`（`1954820a`）、`Ascend/pytorch`（`d09e29e4`）、`vllm`（`bb23c0a8`）、`vllm-ascend`（`3649b8ff`）、`DeepSeek-V3`（`9b4e9788`）、`FlashMLA`（`395cb3af`）、`DeepEP`（`f6aa38fe`）与 `Engram`（`fb7f84a2`）。涉及的论文实测加速比与硬件跑分均注明原始出处及测试条件。
