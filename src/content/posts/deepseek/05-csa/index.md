---
title: "05 CSA：重叠压缩与块级稀疏选择"
description: "沿一次前向跟踪重叠压缩、索引 top-k、窗口合并与 sink 分母。"
series:
  id: deepseek
  order: 5
pubDate: 2026-11-08
tags: [CSA, Sparse Attention, KV Cache]
category: AI Infra
toc: true
---

## 从 token 压缩到压缩条目

CSA（Compressed Sparse Attention）把 DSA 的选择单位从原始 token 改成压缩条目。V4 的压缩率 $m=4$，重叠压缩同时读取当前块的 a 流和上一块的 b 流，形成一条主压缩 KV；Indexer 从压缩 Key 中选 top-k，核心 attention 再把选中条目与原始窗口拼接。

![CSA 的重叠压缩、块选择与窗口合流](./diagrams/05-csa.drawio "图 05：CSA 只在完成的压缩条目上选择，并与局部窗口共同归一化")

压缩权重沿 token 轴对每个特征归一化，不是简单平均。条目只有在当前块最后一个 token 可见时才进入 cache；尾部不足一个块时保留 `kv_state`、`score_state` 与下一次重叠压缩需要的上一完整块。

## Indexer 与核心读取

Indexer 使用独立的压缩 Key，先 mask 未完成块再 top-k。核心 Query 在选中压缩条目与窗口条目上计算自己的 logits，加入 sink 后只做一次联合 softmax。窗口和压缩条目覆盖同一原始 token 时也不去重，因为它们是两种不同分辨率的候选。

Pro 与 Flash 的 hidden、head、窗口和输出分组不同，不能把某一 checkpoint 的形状套到另一版本。公开 demo 的 quant/dequant 只是数值模拟，不能直接当作生产 cache 字节布局。

## 来源

- [DeepSeek-V4 §2.3.1、Figure 3](https://arxiv.org/html/2606.19348v1#S2.SS3.SSS1)
- [§4.2.1 Model Setups](https://arxiv.org/html/2606.19348v1#S4.SS2.SSS1)
- [V4-Pro inference，revision b5968e9](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/tree/b5968e9190ef611bbf34a7229255be88a0e937c1/inference)
