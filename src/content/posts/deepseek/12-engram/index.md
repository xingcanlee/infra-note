---
title: "12 Engram：条件记忆、N-gram 检索与 V4.1 集成"
description: "解释压缩 token 地址、多头哈希、上下文门控，以及 V4.1 移除短卷积的边界。"
series:
  id: deepseek
  order: 12
pubDate: 2026-11-08
tags: [Engram, Hashing, Memory]
category: AI Infra
toc: true
---

## 条件记忆与 KV cache 的区别

Engram 根据 token ID 的短 N-gram 生成地址，从跨请求共享的参数表读取 embedding，再由当前隐藏状态控制注入强度。KV cache 保存请求历史激活；Engram 表是模型参数，两者生命周期不同。Engram 不是把整个前缀变成查表，也不替代全局注意力。

![Engram 先确定哈希地址，再按上下文门控注入](./diagrams/12-engram.drawio "图 12：地址由 token 短序列决定，注入强度由当前残差流决定")

原始研究先压缩词表，再构造后缀 N-gram。多头哈希把不同阶数映射到有限桶表，多个头降低单次碰撞的影响但不保证无碰撞。地址可复现依赖 tokenizer、Unicode 归一化、乘子和素数分配顺序。

## 门控与版本边界

查表向量先投影成 Key/Value，归一化隐藏状态与 Key 点积得到门控分数。原论文使用 sigmoid 点积；官方 demo 与 V4.1 还使用带符号平方根的代码变体。原始 Engram 有短卷积；V4.1 明确移除卷积并直接把门控 Value 加回残差流。V4 只把 Engram 列为后续探索，不能说 V4 已集成；V4.1-Flash 才有明确发布集成。

V4.1 的 24 个地址、6144 维查表表示和多流配置来自固定 revision，不是所有 Engram 研究的常数。主机卸载、RDMA、FP8 和优化器 balancing 也必须按报告与代码分别核对。

## 来源

[Engram 原始论文](https://arxiv.org/html/2601.07372v1)、[V4.1 §2.4.2](https://arxiv.org/html/2609.19969v1#S2.SS4.SSS2)、[V4.1 固定 `engram.py`](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/314113f8a7dadb388215396ba5fbee2c610a04d6/inference/engram.py)。
