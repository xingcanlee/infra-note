---
title: "15 CED：因果编码解码、全局 KV 与窗口重放"
description: "区分 encoder 来源的全局 KV、decoder 局部 SWA 和 bounded replay 的近似。"
series:
  id: deepseek
  order: 15
pubDate: 2026-11-08
tags: [CED, KV Cache, Prefill]
category: AI Infra
toc: true
---

## CED 的三个状态来源

CED（Causal Encoder-Decoder）把长 prompt 的大部分全局 KV 生成提前到因果 encoder 的最终状态。V4.1-Flash 前 20 层是因果 encoder，后 20 层是 decoder；encoder 仍遵守因果约束。decoder 全局 KV 可由 $H_{20}$ 通过各 Full 源层自己的投影产生，但局部 SWA KV 仍需按 decoder 层计算。

![CED 的全局 KV 来源与窗口 bounded replay](./diagrams/15-ced.drawio "图 15：全局历史来自 encoder 末状态，局部窗口仍由 decoder 重建")

长 prompt 的简化 token-layer 账本从 $NL$ 变为 $NL/2+WL/2$，其中 $W=128$ 的 decoder replay 只表达工作量近似，不是端到端时延保证。首次 decode 前要重建局部 SWA；cache 命中且缺少 encoder/decoder 局部状态时，按状态生命周期执行相应 replay。

## Replay 是近似

跨层局部依赖会累积，最后 $W$ 个位置的 bounded replay 不能严格还原完整 prompt 的高层状态。报告的影响很小是实验结论，不能改写为数学等价。全局 KV、持久化 cache、活跃窗口状态和 host DRAM 池也要分别计数。

公开最小 inference 主要展示参考算子与层循环，不完整展示报告中的 CED prefill 提前结束和生产 replay 路径。阅读代码时要保留这个版本边界。

## 来源

[V4.1 技术报告 §2.1–§3.2.2](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/314113f8a7dadb388215396ba5fbee2c610a04d6/DeepSeek_V41_Tech_Report.pdf)、[固定 inference](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/tree/314113f8a7dadb388215396ba5fbee2c610a04d6/inference)。
