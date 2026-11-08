---
title: "01 基础与符号：从标准注意力到 KV Cache"
description: "标准注意力、因果 mask、GQA/MQA 与 KV cache 的统一符号。"
series:
  id: deepseek
  order: 1
pubDate: 2026-11-08
tags: [Attention, KV Cache, Transformer]
category: AI Infra
toc: true
---

## 一次注意力读出什么

固定一个 Query 位置，因果注意力只允许读取自己及更早的 Key。对 Query、Key 的缩放点积做 softmax，再用所得权重聚合 Value。一个教学例子取 $q=1$、$k_0=0,k_1=\ln3$、$v_0=[2,0]^\top,v_1=[0,4]^\top$，得到 $\alpha=(1/4,3/4)$ 与 $o=[0.5,3]^\top$。Query 与 Key 决定读多少，Value 决定读出的内容。

## 矩阵形式与因果边界

对 $S$ 个 Query 和 $T$ 个缓存位置，核心链是 $Q[S,d_k]K^\top[d_k,T]\to E[S,T]\to P[S,T]\to PV[S,d_v]$。mask 必须按每行 Query 的绝对位置使用；本次输入的局部位置 $r$ 对应绝对位置 $P+r$。未来位置不能进入 softmax 分母，数组预留槽位也不能改变这个语义。

![因果 mask、softmax 权重与 KV cache 追加的关系](./diagrams/01-attention-kv-cache.drawio "图 01：因果注意力把 Query 的读取范围与缓存追加分开")

## K/V 共享与缓存

MHA 为每个 Query head 保存独立 K/V；GQA 让一组 Query heads 共享 K/V；MQA 让所有 Query heads 共享一组 K/V。共享的是被读取的 K/V，不是 Query 或最终输出。常规 decode 每步增加一个 Query token，历史 K/V 保留在 cache 中，避免重新投影整段前缀。

缓存元素数量和一次 Query 的访问位置数是不同指标。MLA 会缩小每个位置的表示，DSA 会缩小一次读取的候选集合，SWA 会限制可直接访问的窗口，不能用一个“压缩倍数”替代三者。

## RMSNorm、RoPE 与代码轴

RMSNorm 依赖当前向量的均方根，不能随意吸收到固定线性矩阵。RoPE 使用绝对位置旋转 Q/K，批量实现还要对齐 batch、位置、head、缓存位置等轴。`einsum` 中的字母只在本表达式内有效，不能把代码字母直接当成数学下标。

## 来源与边界

标准 MHA、低秩表示与 RoPE 见 [DeepSeek-V2 §2.1](https://arxiv.org/html/2405.04434v5#S2.SS1)。本页只建立符号和缓存语义，不代表任何特定 checkpoint 的完整实现或性能测量。
