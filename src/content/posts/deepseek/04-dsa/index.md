---
title: "04 DSA：Lightning Indexer 与稀疏 MLA"
description: "说明 Lightning Indexer 如何先选位置，再由主 MLA 在候选集合内重新归一化。"
series:
  id: deepseek
  order: 4
pubDate: 2026-11-08
tags: [DSA, Sparse Attention, MLA]
category: AI Infra
toc: true
---

## Indexer 与主 MLA 分工

DSA（DeepSeek Sparse Attention）在 MLA 表示上增加 Lightning Indexer。Indexer 用独立 Query/Key 路径为历史位置打分，先屏蔽未来再做 causal top-k；主 MLA 根据位置集合读取 latent 和位置 Key，并在选中集合内重新计算 logits、softmax 与 PV。

![DSA 共享选择集合但为各主 head 重新归一化](./diagrams/04-dsa.drawio "图 04：Indexer 只选择位置，主 MLA 各自计算集合内权重")

索引分数 $I_{t,s}=\sum_jw_{t,j}^I\operatorname{ReLU}(q_{t,j}^I\cdot k_s^I)$ 不是概率，也不能直接当作主注意力权重。主 MLA 的 $e_{t,s}^h$ 来自另一条投影路径；同一集合给不同主 head 的结果可以不同。

## 两阶段训练与复杂度

dense warm-up 冻结主模型、训练 indexer；sparse training 打开 top-k，让主模型适应稀疏访问。top-k 的离散下标本身没有普通反向梯度，Indexer 通过独立 KL 目标学习，主模型通过 LM loss 学习。

主注意力从全历史变成约 $O(TK)$ 的候选计算，但 indexer 仍扫描历史，整体不是线性注意力。未选 latent 仍要保留，因为下一次 Query 可能选择它；必须有真正的 sparse gather/kernel 才可能把候选减少转成端到端收益。

## 来源与版本

- [DeepSeek-V3.2 §2.1–§2.3](https://arxiv.org/html/2512.02556v1#S2.SS1)
- [V3.2-Exp inference，固定 revision 87e509a](https://github.com/deepseek-ai/DeepSeek-V3.2-Exp/tree/87e509a2e5a100d221c97df52c6e8be7835f0057/inference)

论文成本与 H800 结果保持原实验口径；本页没有加载真实权重或测量 GPU 性能。
