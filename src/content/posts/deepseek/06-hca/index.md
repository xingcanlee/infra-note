---
title: "06 HCA：重度压缩与逐层混合注意力"
description: "解释非重叠重压缩、全量摘要读取和 V4 的 CSA/HCA 逐层安排。"
series:
  id: deepseek
  order: 6
pubDate: 2026-11-08
tags: [HCA, Attention, KV Cache]
category: AI Infra
toc: true
---

## 高压缩和全量摘要

HCA（Heavily Compressed Attention）用较大的非重叠块生成摘要，直接读取全部已完成压缩条目，不再使用 Indexer 和 top-k。它仍保留原始局部窗口，并让摘要与窗口共同进入一次带 sink 的 softmax。

![HCA 的完成边界、压缩历史与局部窗口](./diagrams/06-hca.drawio "图 06：HCA 只读取已完成摘要，局部窗口保留最近 token 细节")

对块长 $m'$，query $t$ 的已完成摘要数为 $b_t=\lfloor(t+1)/m'\rfloor$。摘要池化仍对每个特征沿块内 token 轴做 softmax；不同特征可以有不同混合权重。未完成尾部不形成摘要，但增量 decode 要保留状态等待块完成。

## V4 层级安排

V4-Pro 与 V4-Flash 的 HCA 压缩率均为 128、窗口为 128，但主层数和层分配不同。Pro 主层 61 层，HCA 31、CSA 30；Flash 主层 43 层，HCA 20、CSA 21，并有 2 个纯 SWA 层。配置数组末尾的额外 0 是 MTP 层，不应计入主层。

HCA 的高压缩减少核心 attention 的平方项系数，但未消除压缩历史扫描，也不等于整层 cache 或端到端延迟按同倍率缩小。

## 来源

[DeepSeek-V4 §2.3.2、§4.2.1](https://arxiv.org/html/2606.19348v1#S2.SS3.SSS2)。固定配置和推理实现见 [V4-Pro config](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/b5968e9190ef611bbf34a7229255be88a0e937c1/config.json)。
