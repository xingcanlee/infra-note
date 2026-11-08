---
title: "08 注意力机制对照：到底压缩了哪一条轴"
description: "用缓存、候选生成和主读取三本账，区分 MLA、NSA、DSA、CSA、HCA 与 SWA。"
series:
  id: deepseek
  order: 8
pubDate: 2026-11-08
tags: [Attention, MLA, NSA, DSA, KV Cache]
category: AI Infra
toc: true
---

比较注意力机制时，先固定同一个请求、层和可见前缀长度 $T$，再分别记录三件事：持久 cache 存了什么、候选如何生成、主 attention 实际读了什么。只报一个“压缩倍数”会丢掉关键差异。

![表示压缩、序列压缩和候选访问的统一比较](./diagrams/08-attention-comparison.drawio "图 08：不同机制改变的轴不同")

| 机制 | 改变的轴            | 候选生成                         | 主 attention 读取               |
| ---- | ------------------- | -------------------------------- | ------------------------------- |
| MLA  | 每 token 的表示宽度 | 无独立选择器                     | 全部可见位置的 latent/位置分支  |
| NSA  | 分支表示与读取组织  | 压缩分支形成块分数               | 压缩、选择、窗口三路分别归一化  |
| DSA  | 本次读取的候选集合  | Lightning Indexer + causal top-k | 候选集合内重新 softmax          |
| CSA  | 序列被摘要成条目    | 压缩条目 Indexer                 | top-k 摘要 + 原始窗口，共同分母 |
| HCA  | 摘要粒度            | 无 Indexer                       | 全部完成摘要 + 原始窗口         |
| SWA  | 原始可见窗口        | 无长历史选择器                   | 最近 $W$ 个原始位置             |

## 用三个问题快速定位

**缓存变小了吗？** 看每个历史位置保存的元素和字节，MLA 主要回答这个问题。**这一步少读了吗？** 看候选数量和主 attention 的 gather，DSA/CSA/SWA 主要回答这个问题。**这次提交更快了吗？** 还要看 kernel、padding、通信和调度，不能从前两项直接推导。

## 最容易犯的错

候选少不等于持久 cache 只有候选数；Indexer 分数不等于主 attention 权重；HCA 不是 CSA 的上游阶段；跨层复用也不能和序列压缩直接相乘。字节、FLOPs、访存和端到端延迟需要四张表分别记录。

继续回看 [DeepSeek-V2](https://arxiv.org/html/2405.04434v5#S2.SS1)、[NSA](https://arxiv.org/html/2502.11089v2#S3.SS3)、[V3.2](https://arxiv.org/html/2512.02556v1#S2.SS1) 与 [V4](https://arxiv.org/html/2606.19348v1#S2.SS3) 的版本边界。
