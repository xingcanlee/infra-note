---
title: "07 SWA：窗口是逻辑位置，环形槽只是地址"
description: "从滑动窗口的可见集合到环形缓存槽位，说明窗口与压缩候选如何共享分母。"
series:
  id: deepseek
  order: 7
pubDate: 2026-11-08
tags: [SWA, Attention, KV Cache]
category: AI Infra
toc: true
---

SWA（Sliding Window Attention）把一个层能直接读取的原始 token 限制在最近 $W$ 个。它是序列访问策略，不是把模型上下文长度改成 $W$。

## 先写逻辑集合

位置 $t$ 的可见窗口是

$$\{\max(0,t-W+1),\ldots,t\}.$$

如果 $W=4,t=8$，逻辑位置是 $[5,6,7,8]$。采用环形 buffer 后，它们可能落在槽位 $[1,2,3,0]$；槽位是地址，不能直接当作位置排序或 mask。

![SWA 的逻辑窗口、环形槽位与共同分母](./diagrams/07-swa.drawio "图 07：先恢复逻辑顺序，再和压缩候选共同归一化")

```mermaid
flowchart LR
  T[绝对位置 t] --> L[逻辑窗口<br/>max(0,t-W+1)…t]
  L --> R[环形槽位映射]
  R --> K[按位置排序 / mask]
  K --> S[与摘要候选共同 softmax]
  S --> O[输出]
```

## 层间传播与 sink

纯 SWA 只读窗口内的 K/V；多层传播、摘要层或 encoder 状态可以把更早信息间接带回来。因此“窗口宽度”不等于“模型能记住的总上下文”。在 CSA/HCA 层，窗口条目和压缩条目使用同一个 sink-inclusive 分母，窗口权重和可以小于 1。

这和 NSA 的独立分支 softmax + 门控融合不同。也不要把 V4.1 的 bounded replay 反推成 V4 的窗口定义：前者是为了恢复局部状态的近似流程，后者是每层的候选语义。

## 读实现时的检查清单

先用绝对 position 算 mask，再把 position 映射到物理槽位；检查 wrap-around 后是否仍按逻辑顺序归约；最后确认 padding、完成边界和 sink 分母都没有混用。参考 [V4 §2.3.3 与 §4.2.1](https://arxiv.org/html/2606.19348v1#S2.SS3.SSS3)。
