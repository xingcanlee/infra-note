---
title: "17 FlashAttention：分块精确注意力、在线 softmax 与 GPU 实现"
description: "从在线 softmax 状态推导分块前向、反向重算和 FA1–FA4 的 GPU 调度。"
series:
  id: deepseek
  order: 17
pubDate: 2026-11-08
tags: [FlashAttention, CUDA, Attention]
category: AI Infra
toc: true
---

## 为什么只保存三种状态

FlashAttention 在给定 mask、scale 和 dropout 语义下计算同一个 attention，但不把完整分数矩阵和概率矩阵写回 HBM。对一行分数，保留最大值 $m$、相对指数和 $\ell$、以及 Value 加权分子 $u$：$m=\max s_j$，$\ell=\sum e^{s_j-m}$，$u=\sum e^{s_j-m}v_j$。

![FlashAttention 的在线 softmax 与 tile 数据流](./diagrams/17-flash-attention.drawio "图 17：每个 tile 更新最大值、分母和未归一化分子，最终结果与整行 softmax 一致")

新块到来时 $m'=\max(m,\max s)$、$\alpha=e^{m-m'}$，然后 $\ell'=\alpha\ell+\sum e^{s-m'}$、$u'=\alpha u+\sum e^{s-m'}v$。旧分母和旧分子必须使用同一个缩放。全块结束后 $O=u/\ell$、$LSE=m+\log\ell$。

## 前向、反向与 GPU 版本

Query tile 保存逐行状态，Key/Value tile 循环更新；因果边界可以跳过完全在未来的 tile。反向只保存 O 与 LSE，重算 QK、mask 和概率块，再计算 dQ、dK、dV。dropout 路径还需重现相同 RNG 状态，不能只说重新设置 seed。

FA1 结合分块、在线 softmax 和反向重算；FA2 延迟归一化并调整 CTA/warp 分工；FA3 面向 Hopper 使用 TMA、WGMMA 和 warp specialization；FA4 面向 Blackwell 继续处理 TMEM、指数和归约成本。论文算法、源码分派和具体 GPU 配置需分层说明。

## 与 DeepSeek kernel 的连接

给定稀疏候选后，V4.1 sparse attention kernel 仍用 `scores_max_prev`、`scores_max`、`scores_scale`、`sum_exp`、`acc_o` 维护同一在线状态，并在分母加入 attention sink。它优化的是给定访问集合的 attention，不因此变成全历史 dense attention。

## 来源

- [FlashAttention](https://arxiv.org/abs/2205.14135v2)
- [FlashAttention-2](https://tridao.me/publications/flash2/flash2.pdf)
- [FlashAttention-3](https://arxiv.org/abs/2407.08608v2)
- [FlashAttention-4](https://arxiv.org/abs/2603.05451v1)
- [flash-attention 固定提交](https://github.com/Dao-AILab/flash-attention/tree/54b044c8cf897dfcc2577a665559d1bfda0bfc80)
