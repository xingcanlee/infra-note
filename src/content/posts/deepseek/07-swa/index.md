---
title: "07 SWA：固定窗口局部注意力与层内组合"
description: "从逻辑窗口、环形槽位到窗口和压缩条目的共同 softmax。"
series:
  id: deepseek
  order: 7
pubDate: 2026-11-08
tags: [SWA, Attention, KV Cache]
category: AI Infra
toc: true
---

## 逻辑窗口与物理槽位

SWA（Sliding Window Attention）限制当前层直接读取的原始位置。窗口宽度 $W$ 时，位置 $t$ 的可见集合是 $\{\max(0,t-W+1),\ldots,t\}$，包含当前位置。纯 SWA 只能直接读取窗口内历史；多层传播或其他压缩层仍可能携带更早信息。

![SWA 的逻辑窗口、环形槽位与共同分母](./diagrams/07-swa.drawio "图 07：窗口索引恢复逻辑顺序，窗口与压缩条目共同归一化")

decode 时位置 $t$ 写入槽位 $t\bmod W$，读取必须把逻辑位置映射回物理槽位。例如 $W=4,t=8$，逻辑位置 $[5,6,7,8]$ 对应槽位 $[1,2,3,0]$。槽号是地址，不是 token 位置。

## 与压缩候选共同 softmax

CSA/HCA 层把压缩条目和窗口条目拼成候选列表，二者共享一个 sink-inclusive 分母。sink 只增加分母，没有 Value；候选权重和可以小于 1。窗口与压缩条目不按覆盖的原始位置去重。

这与 NSA 的独立分支 softmax、门控融合不同。SWA 的窗口宽度也不是整模上下文上限。V4.1 的 Bounded Replay 则是用窗口重放近似重建状态，不能反向改写 V4 的精确环形窗口定义。

## 来源

[V4 §2.3.3 与 §4.2.1](https://arxiv.org/html/2606.19348v1#S2.SS3.SSS3)，以及 V4-Pro 固定 `model.py/kernel.py`。本页公式和 toy 检查不构成 GPU 性能证据。
