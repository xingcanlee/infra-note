---
title: "13 mHC：多流残差、双随机约束与 Single-Pass"
description: "从多流残差连接、Sinkhorn 双随机约束到 V4.1 Single-Pass 依赖变化。"
series:
  id: deepseek
  order: 13
pubDate: 2026-11-08
tags: [mHC, Residual, Transformer]
category: AI Infra
toc: true
---

## 多流残差

mHC 把单流隐藏状态扩展为 $G$ 条残差流。用行向量表示，更新为 $X_{l+1}=B_lX_l+C_l\mathcal F_l(A_lX_l)$：$A$ 将多流聚合成一个子层输入，$B$ 混合直接残差，$C$ 把子层输出写回各流。注意力或 MoE 仍只处理一条常规宽度的输入。

![mHC 的多流聚合、残差混合与输出回写](./diagrams/13-mhc.drawio "图 13：A 收流、B 混流、C 回写，重型子层不在每条流上重复执行")

系数由展平的 $GD$ 状态预测，输出 $G+G+G^2$ 个量。pre/post 用 sigmoid，residual logits 经过正值化和有限次 Sinkhorn 迭代逼近双随机矩阵。双随机约束只作用于直接残差混合，不是整个非线性网络梯度稳定性的证明。

## Single-Pass 与边界

V4 在 attention、FFN 两个子层分别计算本层 pre 系数；V4.1 Single-Pass 让当前子层使用上一子层的 pre 系数，同时预测下一子层系数。这改变了依赖关系，不是把原式简单代数重排。论文的读写量分析属于特定融合 kernel，不能改写为整个模型显存或延迟减半。

## 来源

[mHC 论文 §3–§4](https://arxiv.org/html/2512.24880v2#S3)、[V4 §2.2](https://arxiv.org/html/2606.19348v1#S2.SS2)、[V4.1 §2.4.1](https://arxiv.org/html/2609.19969v1#S2.SS4.SSS1)。
