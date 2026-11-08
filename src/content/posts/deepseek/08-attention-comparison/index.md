---
title: "08 MLA、NSA、DSA、CSA、HCA、SWA 对照与常见误解"
description: "用统一账本区分表示压缩、序列压缩、候选选择和局部窗口。"
series:
  id: deepseek
  order: 8
pubDate: 2026-11-08
tags: [Attention, MLA, NSA, DSA]
category: AI Infra
toc: true
---

## 一份统一账本

比较注意力机制时，固定请求、层和可见前缀长度 $T$，分别记录持久 cache、候选生成扫描量和主 attention 实际读取量。MLA 改变每个 token 的表示宽度；SWA 限制局部访问；NSA 用压缩分支产生块重要性；DSA 用独立 Indexer 选原始 token；CSA/HCA 沿序列轴压缩后再读取。

![表示压缩、序列压缩和候选访问的统一比较](./diagrams/08-attention-comparison.drawio "图 08：不同机制改变的轴不同，不能用一个压缩倍数概括")

| 机制 | 长历史表示 | 候选生成 | 主候选 |
| --- | --- | --- | --- |
| MLA | 每 token latent 与位置 Key | 无独立选择器 | 全部可见 token |
| NSA | 原始 K/V 与压缩 K/V | 压缩分支形成块分数 | 三分支候选分别归一化 |
| DSA | MLA cache 加 index Key | Lightning Indexer 扫描历史 | top-K token latent |
| CSA | 压缩条目、索引 Key、窗口 | 扫描约 $T/4$ 条目 | top-K 压缩块加窗口 |
| HCA | 非重叠摘要加窗口 | 无 Indexer | 全部完成摘要加窗口 |
| SWA | 最近 $W$ 条原文 | 无长历史选择器 | 窗口 |

## 常见误解

候选少不等于持久 cache 只有候选数；选择分数不等于主 attention 权重；HCA 不是 CSA 的上游；V4.1 CSA2 引入层轴复用，不能把它和序列压缩相乘。元素数、字节、FLOPs、访存和端到端延迟也必须分开。

来源可回查 [DeepSeek-V2](https://arxiv.org/html/2405.04434v5#S2.SS1)、[NSA](https://arxiv.org/html/2502.11089v2#S3.SS3)、[V3.2](https://arxiv.org/html/2512.02556v1#S2.SS1) 与 [V4](https://arxiv.org/html/2606.19348v1#S2.SS3)。
