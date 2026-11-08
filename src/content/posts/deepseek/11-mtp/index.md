---
title: "11 MTP：顺序多 token 预测与推测解码"
description: "区分训练中的未来 token 监督和生成时的草稿、验证与接受。"
series:
  id: deepseek
  order: 11
pubDate: 2026-11-08
tags: [MTP, Speculative Decoding, Training]
category: AI Infra
toc: true
---

## 预测深度与序列位置

MTP 在主模型后增加顺序连接的预测模块。固定序列位置 $i$ 和预测深度 $k$，模块读入上一深度状态 $h_i^{k-1}$ 与新 token 的 embedding，融合后经过带因果 mask 的 Transformer block，预测更远的 token。沿预测深度滚动和沿序列轴移动是两个不同方向。

![MTP 的顺序条件与训练标签对齐](./diagrams/11-mtp.drawio "图 11：每个 MTP 深度读入一个已知或已接受 token，再预测下一个")

训练时新 token 来自真实文本；生成时它来自候选。MTP 的训练损失可以改善主模型，即使部署时不执行 MTP；推测解码还需要主模型验证、接受和拒绝后的校正。

## V3、V4 与 DSpark

V3 正式配置为一个额外预测层，损失分母仍按论文的 $T$ 约定；V4 沿用该策略。V4 固定模型定义中有 `MTPBlock` 和共享 embedding/head，但最小 `generate.py` 仍只调用主模型并采样一枚 token，不能仅凭模块存在声称已启用推测解码。V4.1 的 `self.mtp` 容器还可能装 `DSparkBlock`，字段名不代表算法相同。

## 来源

[DeepSeek-V3 §2.2、式 21–25](https://arxiv.org/html/2412.19437v2#S2.SS2)、[V4 §2.1](https://arxiv.org/html/2606.19348v1#S2.SS1)。论文报告的接受率和 TPS 保留原实验条件，本页没有复测。
