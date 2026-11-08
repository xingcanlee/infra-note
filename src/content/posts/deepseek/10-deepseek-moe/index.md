---
title: "10 DeepSeekMoE：细粒度专家、路由与负载均衡"
description: "从细粒度专家、共享专家和路由权重讲到 V2、V3、V4 的差异。"
series:
  id: deepseek
  order: 10
pubDate: 2026-11-08
tags: [MoE, DeepSeek, Inference]
category: AI Infra
toc: true
---

## 从 dense FFN 到细粒度专家

MoE 的变化发生在 FFN 子层。每个 token 经过共享专家，并额外选择少量路由专家。细粒度设计把一个宽专家拆成更多窄专家，在近似固定激活计算下增加组合空间；共享专家承担反复出现的通用变换。

![MoE 的专家选择与实际路由权重](./diagrams/10-deepseek-moe.drawio "图 10：偏置只改变 top-k 选择，实际权重来自未加偏置的原分数")

V3 的路由器先算 sigmoid 原始分数，再把偏置加入选择分数做 top-k；选中后从未加偏置的原分数取值、归一化并乘 `route_scale`。共享专家不参与这个分母，而是直接相加。

## 版本边界

V2 使用 softmax、设备受限路由和多类辅助均衡损失；V3 使用 sigmoid、负载反馈 bias、节点/分组约束和很小的序列均衡损失；V4 改用 $\sqrt{\operatorname{Softplus}}$ 分数，并在前几层使用 token ID Hash 路由；V4.1-Flash 的固定代码使用模态相关偏置和内容路由。不能把后一版本的路由规则反套前一版本。

路由专家数量、共享专家数量、top-k 和中间维度都必须绑定具体 checkpoint。固定 inference 代码能核对推理语义，但不能替代训练期 bias 更新、辅助损失和生产专家并行调度。

## 来源

[DeepSeekMoE §3](https://arxiv.org/html/2401.06066v1#S3)、[DeepSeek-V2 §2.2](https://arxiv.org/html/2405.04434v5#S2.SS2)、[DeepSeek-V3 §2.1.2](https://arxiv.org/html/2412.19437v2#S2.SS1.SSS2)、[DeepSeek-V4 §2.1](https://arxiv.org/html/2606.19348v1#S2.SS1)。
