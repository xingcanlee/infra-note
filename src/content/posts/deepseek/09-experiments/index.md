---
title: "09 代码与实验：原始脚本、验证结果与实现边界"
description: "按命题、输入、脚本和预期结果核对注意力机制，明确 toy 与生产实现边界。"
series:
  id: deepseek
  order: 9
pubDate: 2026-11-08
tags: [Python, NumPy, PyTorch, Attention]
category: AI Infra
toc: true
---

## 先选命题，再固定输入

代码实验页的目的不是重新宣称生产性能，而是把机制转成可检查的命题。MLA 检查展开与吸收，NSA 检查分支和梯度，DSA 检查先 mask 再 top-k 与集合内重新归一化，CSA/HCA/SWA 检查块边界、窗口和 sink，配置审计检查主层与 MTP 尾项。

![从可复现算术到实现证据的边界](./diagrams/09-experiments.drawio "图 09：toy 算术、源码映射和生产性能证据属于不同层次")

## 结果与边界

已记录的 CPU 检查包括 MLA 双路径一致、NSA 因果边界和梯度、DSA top-k `[2,4,0]` 与集合内 softmax、CSA 输出 `[3.2559816,2.1547523]`、HCA 输出 `[5.7637277369,1.8359762490]`、SWA 环槽与 sink 分母，以及 V4 Pro/Flash 层分配审计。这些都是给定输入上的结果，不是 checkpoint 输出。

脚本依赖与运行环境需要固定。教学实现省略量化、张量并行、分页 cache、padding batch、融合 kernel 和真实权重；公开源码能证明类、字段和调用语义，不能自动证明完整训练循环、生产调度或 GPU 吞吐。

## 来源

代码与实验页对应的固定提交、脚本清单和复现边界见 DeepSeek parent page 下的 09 页面；新增专题的结论应回到各自论文和固定源码核对。
