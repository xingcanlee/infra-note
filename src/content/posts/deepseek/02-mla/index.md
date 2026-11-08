---
title: "02 MLA：联合压缩、矩阵吸收与解耦 RoPE"
description: "从共享 latent、解耦 RoPE 和矩阵吸收推导 MLA 的缓存与计算路径。"
series:
  id: deepseek
  order: 2
pubDate: 2026-11-08
tags: [MLA, Attention, KV Cache]
category: AI Infra
toc: true
---

## 缓存瓶颈与联合压缩

MLA（Multi-head Latent Attention）把同一历史位置的多头内容 Key/Value 联合表示为一个低维 latent，并额外保存共享位置 Key。它仍然访问全部因果可见位置；latent 缩小的是每个位置的表示，不是序列长度。

![MLA 的共享 latent、解耦 RoPE 与两次矩阵吸收](./diagrams/02-mla.drawio "图 02：MLA 在保留多头权重的同时共享历史缓存")

对列向量，KV latent 与内容上投影可写为 $c_s^{KV}=W^{DKV}x_s$、$k_s^{C,h}=W_h^{UK}c_s^{KV}$、$v_s^{C,h}=W_h^{UV}c_s^{KV}$。Query 也可以经过低秩路径，但历史 Query 不进入 KV cache。

## 解耦 RoPE

若直接对内容分支做位置旋转，$R_t^\top R_s$ 会随历史位置变化，阻碍把内容上投影吸收到当前 Query。MLA 将内容分支与位置分支拆开：$q_t^h=[q_t^{C,h};q_t^{R,h}]$、$k_s^h=[k_s^{C,h};k_s^R]$，只有位置分支承担 RoPE。因此每 token、每层的吸收缓存是 $d_c+d_r$ 个元素。

## 两次吸收

Key 吸收把内容内积重排为 $\widetilde q_t^h=((W_h^{UK})^\top q_t^{C,h})$ 与 latent 的内积。Value 吸收先在 latent 空间聚合 $z_t^h=\sum_s\alpha_{t,s}^hc_s^{KV}$，再乘 $W_h^{UV}$。softmax 不被吸收到投影里，缩放仍由拼接后的 $d_n+d_r$ 决定。

浮点求和顺序可能带来末位误差；若路径含 RMSNorm，归一化不能当作固定线性变换。V3 固定实现的 `wq_a → q_norm → wq_b`、`wkv_a`、`kv_norm`、`wkv_b` 与 `kv_cache/pe_cache` 是代码对照入口。

## 来源

- [DeepSeek-V2 §2.1.1–§2.1.4、Table 1](https://arxiv.org/html/2405.04434v5#S2.SS1)
- [DeepSeek-V2 附录 C](https://arxiv.org/html/2405.04434v5#A3)
- [DeepSeek-V3 MLA 实现，固定提交 9b4e978](https://github.com/deepseek-ai/DeepSeek-V3/blob/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py#L396-L497)
