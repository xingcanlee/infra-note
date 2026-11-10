---
title: 'vLLM 图模式：从一次提交到 CUDA Graph 与 ACLGraph'
description: '面向零基础开发者：先搞清楚一个算子怎么被提交到设备，再理解编译图、设备图和 vLLM 的选路。'
series:
  id: vllm-graph
  order: 1
pubDate: 2026-11-08
tags: [vLLM, CUDA Graph, ACLGraph, Ascend]
category: AI Infra
featured: true
toc: true
---

DeepSeek 系列回答的是「模型要算什么」。这套笔记回答下一个问题：**算的东西少了，时间就会同比减少吗？**

不会。每个算子都要由 CPU 提交给设备，而提交的次数不随算子变小而减少。于是在 decode 阶段——每轮只处理一个 token、每个算子都很小——时间大量花在提交而不是计算上。图模式就是为这件事存在的。

**不需要 GPU/NPU，也不需要安装 CUDA、CANN 或 PyTorch。** 所有练习都在 CPU 上用纯 Python 完成。

## 这套笔记怎么读

一条链，每篇承接上一篇留下的缺口：

```mermaid
flowchart LR
  A["00-01<br/>两条车道<br/>提交与执行"] --> B["02-03<br/>两种图<br/>编译图与设备图"]
  B --> C["04<br/>四条边界<br/>什么会打断图"]
  C --> D["05-06<br/>vLLM 选路<br/>与无设备练习"]
  D --> E["07-08<br/>Ascend<br/>与排错"]
```

## 目录

| 篇                                                      | 解决的问题                                       |
| ------------------------------------------------------- | ------------------------------------------------ |
| [00 · 一次 decode 提交了什么](./00-inference-overhead/) | 设备计算很小、时间却花掉了——两条车道分开看       |
| [01 · PyTorch 是怎么执行的](./01-pytorch-execution/)    | dispatcher、异步队列、同步点；提交开销到底是什么 |
| [02 · torch.compile](./02-compile-graphs/)              | Dynamo 抓图、guards、graph break；算子怎么变少   |
| [03 · CUDA Graph](./03-cuda-graph/)                     | capture / replay、固定地址、官方约束清单         |
| [04 · 四条边界](./04-boundaries/)                       | 动态 shape、同步与控制流、内存池、多流与通信     |
| [05 · vLLM 选路](./05-dispatch/)                        | 描述符与六项兼容检查；回退为什么是静默的         |
| [06 · 无设备练习](./06-practice/)                       | 六道练习：自己写一遍选路、设计图桶、诊断回退     |
| [07 · Ascend 图模式](./07-ascend/)                      | ACLGraph / NPUGraph / TorchAir 各在哪一层        |
| [08 · 排错](./08-debugging/)                            | 变慢了、没走图、结果不对——按什么顺序查           |

## 三条阅读路线

- **第一次读**：00 → 01 → 03 → 05。这四篇给出完整骨架。
- **只想知道为什么没变快**：00 → 05 → 08。
- **要动手**：00 → 01 → 03 → 04 → 06（练习）→ 08。

## 三个必须分开的概念

读这一块资料时最容易出的错，是把下面三件事混成「图模式」一个词：

| 概念       | 记录的对象                         | 解决的开销               | 哪一篇 |
| ---------- | ---------------------------------- | ------------------------ | ------ |
| **eager**  | 无                                 | —                        | 01     |
| **编译图** | 算子与数据依赖（FX graph）         | Python 解释与 dispatcher | 02     |
| **设备图** | 固定地址、shape、stream 的设备工作 | kernel 提交次数          | 03     |

**两者正交**：编译图可以产生更快的 callable，但不等于已经捕获了设备图；设备图可以包住 eager 产生的固定工作，也不等于做了编译优化。可以叠加，也可以只用一个。

## 统一术语

| 词         | 本系列中的含义                                      |
| ---------- | --------------------------------------------------- |
| eager      | 每轮由框架逐个执行算子                              |
| 编译图     | FX / 后端表示的算子与数据依赖                       |
| 设备图     | 固定地址、shape、stream 的可重放设备工作            |
| descriptor | 描述本轮 batch、attention 与 cache 状态的运行时输入 |
| 图桶       | 一组固定 shape / 地址约束的图实例                   |
| replay     | 提交已经捕获的设备工作                              |
| fallback   | 不满足约束时回到普通或分段执行                      |
| 同步点     | CPU 必须等设备算完才能继续的位置                    |

## 每篇的固定结构

与 DeepSeek 系列一致：**先看一个例子 → 图或动画 → 机制 → 代码实现 → 代价与边界 → 自测 → 来源**。每篇目录下有一个 `toy.py`，结论写成 `assert`：

```bash
uv run python toy.py                   # 单篇，纯 Python
uv run scripts/verify_toys.py          # 全部
```

动画来自站点共用的积木 `src/explainers/`（与 DeepSeek 系列同一套，配色和交互一致）。

## 证据等级

| 来源                  | 能证明什么                     |
| --------------------- | ------------------------------ |
| 源码（带行号）        | 字段、调用顺序、分支条件       |
| 日志                  | 某条路径被选中、某个图被捕获   |
| 排程模型（本站 toy）  | 哪一段开销被消掉了，结构性结论 |
| profiler + 可重复对照 | **只有它能证明时间收益**       |

**本机没有 GPU/NPU**，因此本系列不运行任何设备捕获，也不给端到端加速数字。文中的时间线是示意模型，`exec` 与 `launch_cost` 是示意参数，不对应任何真实硬件。

一个贯穿全系列的结论：**图模式不是无条件更快**。只有当提交开销确实暴露在关键路径上时它才有收益；算子足够大、batch 足够大时，它可能毫无帮助甚至略有损失（第 00 篇给了可复现的例子）。

## 版本边界

源码行号按本地快照：vLLM commit `cf5cea2d`、vLLM-Ascend commit `28e9e97b`。vLLM、PyTorch、CANN、驱动与模型 backend 的兼容性必须按目标部署重新核对；本系列的结论不随上游主干自动更新。

## 参考入口

- [vLLM 仓库](https://github.com/vllm-project/vllm) · [CUDA Graphs 设计文档](https://github.com/vllm-project/vllm/blob/main/docs/design/cuda_graphs.md) · [torch.compile 设计文档](https://github.com/vllm-project/vllm/blob/main/docs/design/torch_compile.md)
- [vLLM-Ascend 仓库](https://github.com/vllm-project/vllm-ascend)
- [PyTorch CUDA semantics](https://docs.pytorch.org/docs/stable/notes/cuda.html) · [Ascend CANN 文档](https://www.hiascend.com/document)
