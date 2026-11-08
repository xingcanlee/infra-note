---
title: "16 CSA2：跨层共享的是缓存和编号，不是 Query"
description: "沿 Full、Reindex、Reuse 三种层角色，理解 CSA2 的跨层 KV、索引复用与候选池。"
series:
  id: deepseek
  order: 16
pubDate: 2026-11-08
tags: [CSA2, KV Cache, Sparse Attention]
category: AI Infra
toc: true
---

CSA2 的关键变化在层轴：相邻层不必重复建立同样的全局 KV 和候选池，但每一层仍有自己的 Query 和主 attention 权重。

## 三种角色

```mermaid
flowchart LR
  F[Full 层] --> K[建立主 KV + index Key]
  K --> P[候选池]
  P --> R[Reindex 层<br/>复用缓存，更新 top-k]
  P --> U[Reuse 层<br/>复用缓存和编号]
  Q[本层 Query] --> R
  Q --> U
  R --> O[本层主 attention]
  U --> O
```

Full 创建主 KV、索引 Key 并完成首次选择；Reindex 复用缓存但用本层 Indexer 更新 top-k；Reuse 同时复用主 KV 和最新编号，却仍用自己的 Query 重新计算主 attention。共享数据、共享编号和本层权重是三件事。

![CSA2 的跨层共享、选择编号与层级候选池](./diagrams/16-csa2.drawio "图 16：Full 建缓存，Reindex 刷新编号，Reuse 重算主权重")

## 候选池不是免费计算

首次 Full 可按块内最大 index score 选择 $R$ 个块形成候选池；后续 Reindex 在池内重选 top-k。V4.1 报告中的 $b=8,R=2048,K=512$ 绑定具体配置，不能当作通用常数。参考实现可能先对更大范围执行 einsum 再 mask，候选池语义成立也不代表子集 FLOPs 已经兑现。

CED 改变全局 KV 的来源，CSA2 决定跨层共享，Bounded Replay 改变窗口状态持久化。它们解决不同问题，不能把三个倍率直接相乘。缓存字节还要加上索引、窗口、量化 scale 和状态。

参考 [V4.1 §2.3](https://arxiv.org/html/2609.19969v1#S2.SS3) 与固定 [`model.py`](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/314113f8a7dadb388215396ba5fbee2c610a04d6/inference/model.py)。
