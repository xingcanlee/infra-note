---
title: "03 NSA：压缩、选块与窗口的三分支注意力"
description: "解释压缩、选择和滑动窗口三条分支，以及分支内 softmax 与门控融合。"
series:
  id: deepseek
  order: 3
pubDate: 2026-11-08
tags: [NSA, Sparse Attention, Attention]
category: AI Infra
toc: true
---

## 三条读取分支

NSA（Native Sparse Attention）同时读取压缩概览、少量原始 token 块和最近窗口。三条分支各自构造 K/V、各自做 softmax 与 PV，最后由 sigmoid 门值融合；把三类候选拼起来只做一次 softmax 会得到不同模型。

![NSA 的压缩、选择、窗口三分支与门控融合](./diagrams/03-nsa.drawio "图 03：NSA 先形成三类输出，再按门值融合")

压缩块 $C_i=[i\delta,i\delta+l)$ 可以重叠，选择块 $S_j=[jL,(j+1)L)$ 通常不重叠。压缩概率按空间重叠关系形成块排名，再在 GQA 组内汇总并选 top-$n$。选中块只决定原始 token 的读取区域，选择分支仍用原始 token K/V 重新打分和归一化。

## 因果与联合输出

压缩块必须完整可见；选择块可以包含未完成尾部，但 gather 地址合法不等于未来 token 可见，仍需因果 mask。窗口读取最近 $w$ 个 token，包含当前位置。每条分支得到 $d_v$ 维输出后，$o_t^h=\sum_c g_t^co_t^{c,h}$，门值不要求跨分支和为 1。

论文配置和教学实现需分开。压缩分支仍可能随序列增长，top-k 只限制本次主读取，不能据此声称整个机制变成线性注意力。动态稀疏 kernel 的吞吐不能由逐 token Python gather 推断。

## 来源

[NSA §3.1–§3.4](https://arxiv.org/html/2502.11089v2#S3.SS1) 规定分支、重叠评分、组内选择和 kernel 设计。本文的零基区间和空前缀处理属于教学约定，必须与实现一起核对。
