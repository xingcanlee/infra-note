---
title: "14 DSpark：半自回归草稿与置信度调度"
description: "跟踪并行草稿、Markov head、条件接受概率和硬件感知验证长度。"
series:
  id: deepseek
  order: 14
pubDate: 2026-11-08
tags: [DSpark, Speculative Decoding, Inference]
category: AI Infra
toc: true
---

## 半自回归草稿

DSpark 把一次草稿拆成并行主干与顺序输出头。目标模型提供锚点和上下文特征，草稿主干一次处理候选位置；Markov head 再依赖前一个实际采样 token 逐位置修正 logits。它不是完全并行生成，也不是把 DSA 的稀疏注意力换个名字。

![DSpark 的并行主干、顺序 head 与置信度调度](./diagrams/14-dspark.drawio "图 14：重型主干并行，轻量 head 保留相邻 token 依赖")

confidence head 预测条件接受概率 $c_k$，前缀通过概率为 $a_j=\prod_{i=1}^jc_i$。调度器要同时考虑预期推进量和目标引擎 SPS；验证更多候选可能提高推进量，也可能降低 batch 吞吐。置信度不是目标模型对已采 token 的 softmax 概率，真实接受仍需目标模型校验和拒绝后的采样校正。

## 生产边界

论文的硬件感知异步调度、校准和生产吞吐属于特定系统。公开 DeepSpec 的静态阈值评估器、V4.1 的 `DSparkBlock` 和普通生成入口覆盖范围不同，不能据此声称完整生产验证链已经运行。

## 来源

[DSpark 论文 §2–§5](https://arxiv.org/html/2607.05147v1#S2)、[DeepSpec 固定源码](https://github.com/deepseek-ai/DeepSpec/tree/005e03b81cec38b7da6399833d609ee89a2587f2)。
