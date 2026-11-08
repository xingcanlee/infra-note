---
title: "13 mHC：多流残差把稳定性变成显式约束"
description: "沿 A 聚合、B 混流、C 回写的路径，理解多流残差、双随机矩阵与 Single-Pass。"
series:
  id: deepseek
  order: 13
pubDate: 2026-11-08
tags: [mHC, Residual, Transformer]
category: AI Infra
toc: true
---

mHC（Manifold-Constrained Hyper-Connections）把单条 hidden stream 扩展成 $G$ 条残差流，但重型 attention 或 MoE 子层仍只执行一次。多流的作用在残差连接和信息混合，而不是复制整个模型。

## 一层如何更新

用行向量表示，多流更新为

$$X_{l+1}=B_lX_l+C_l\mathcal F_l(A_lX_l).$$

$A$ 把多流聚合成子层输入，$\mathcal F$ 执行一次 attention/FFN，$C$ 把结果写回各流，$B$ 混合直接残差。系数由当前状态预测，不能把它们当成固定超参数。

![mHC 的多流聚合、残差混合与输出回写](./diagrams/13-mhc.drawio "图 13：A 收流、B 混流、C 回写，重型子层只执行一次")

## 双随机约束做什么

residual logits 经过正值化和有限次 Sinkhorn 迭代，逼近双随机矩阵，使直接残差混合的行列总量受控。这个约束作用在 $B$ 的参数化上，不是整个非线性网络“梯度稳定”的数学证明。

V4 在 attention、FFN 子层分别计算本层 pre 系数；V4.1 Single-Pass 让当前子层使用上一子层的 pre 系数，同时预测下一子层系数。它改变的是依赖关系和融合机会，不是把原公式简单重排。

论文的读写量分析属于特定融合 kernel。没有对应设备和 profiler 时，不应把某个子层的中间量减少写成整个模型显存或延迟减半。

参考 [mHC 论文 §3–§4](https://arxiv.org/html/2512.24880v2#S3)、[V4 §2.2](https://arxiv.org/html/2606.19348v1#S2.SS2) 与 [V4.1 §2.4.1](https://arxiv.org/html/2609.19969v1#S2.SS4.SSS1)。
