---
title: "16 CSA2：跨层 KV 共享、索引复用与层级检索"
description: "按 Full、Reindex、Reuse 和候选池说明 V4.1 跨层缓存与选择。"
series:
  id: deepseek
  order: 16
pubDate: 2026-11-08
tags: [CSA2, KV Cache, Sparse Attention]
category: AI Infra
toc: true
---

## Full、Reindex、Reuse

CSA2 继续减少跨层重复缓存和检索。Full 创建主 KV 与索引 Key 并完成首次选择；Reindex 复用缓存但用本层 Indexer 更新 top-k；Reuse 同时复用主 KV 和最新编号，但仍用自己的核心 Query 重新计算主 attention 权重。共享数据、共享编号和本层 Query 是三件不同的事。

![CSA2 的跨层共享、选择编号与层级候选池](./diagrams/16-csa2.drawio "图 16：Full 建缓存，Reindex 刷新编号，Reuse 沿用编号但重新算主权重")

首次 Full 将位置分成块，按块内最大 index score 选 $R$ 个块形成候选池；后续 Reindex 只在池内重选 top-K。V4.1 发布预算为 $b=8,R=2048,K=512$，候选池最多 16384 个位置。参考实现可能先对全域做 einsum 再 mask，不能仅凭候选池语义证明子集计算量已经兑现。

## 配置与成本

encoder 的前两层纯 SWA，后续使用 $m=2$；decoder 全局主 KV 可用 $m=1$。固定 checkpoint 的 source layer IDs 决定 Full/Reindex，其余全局层是 Reuse，纯 SWA 层不能误称 Reuse。缓存字节还包括索引、窗口、量化 scale 和状态；论文的 global KV bytes/token 不等于整机显存。

CED 改变全局 KV 的来源，CSA2 决定跨层共享，Bounded Replay 改变窗口状态持久化，三者要分别解释。

## 来源

[V4.1 §2.3](https://arxiv.org/html/2609.19969v1#S2.SS3)、[固定 `model.py` revision 314113f](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/314113f8a7dadb388215396ba5fbee2c610a04d6/inference/model.py)。
