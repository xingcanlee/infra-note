---
title: "DeepSeek 模型架构与关键技术"
description: "按注意力、专家、记忆、残差与生成路径组织 DeepSeek 01–17 专题，保留论文、源码 revision 与实验边界。"
series:
  id: deepseek
  order: 1
pubDate: 2026-11-08
tags: [DeepSeek, Attention, MoE, AI Infra]
category: AI Infra
featured: true
toc: true
---

## 阅读路线

这组文章先从标准注意力、KV cache 和 MLA 建立符号，再进入 NSA、DSA、CSA、HCA、SWA 的访问与压缩差异；随后补齐 FlashAttention、MoE、mHC、MTP，最后阅读 V4.1 的 CED、CSA2、Engram 与 DSpark。09 是代码与实验核对页，可在前两阶段随读。

| 章号 | 文章 |
| --- | --- |
| 01 | [基础与符号：从标准注意力到 KV Cache](./01-attention-kv-cache/) — 标准注意力、因果 mask、GQA/MQA 与 KV cache 的统一符号。 |
| 02 | [MLA：联合压缩、矩阵吸收与解耦 RoPE](./02-mla/) — 从共享 latent、解耦 RoPE 和矩阵吸收推导 MLA 的缓存与计算路径。 |
| 03 | [NSA：压缩、选块与窗口的三分支注意力](./03-nsa/) — 解释压缩、选择和滑动窗口三条分支，以及分支内 softmax 与门控融合。 |
| 04 | [DSA：Lightning Indexer 与稀疏 MLA](./04-dsa/) — 说明 Lightning Indexer 如何先选位置，再由主 MLA 在候选集合内重新归一化。 |
| 05 | [CSA：重叠压缩与块级稀疏选择](./05-csa/) — 沿一次前向跟踪重叠压缩、索引 top-k、窗口合并与 sink 分母。 |
| 06 | [HCA：重度压缩与逐层混合注意力](./06-hca/) — 解释非重叠重压缩、全量摘要读取和 V4 的 CSA/HCA 逐层安排。 |
| 07 | [SWA：固定窗口局部注意力与层内组合](./07-swa/) — 从逻辑窗口、环形槽位到窗口和压缩条目的共同 softmax。 |
| 08 | [MLA、NSA、DSA、CSA、HCA、SWA 对照与常见误解](./08-attention-comparison/) — 用统一账本区分表示压缩、序列压缩、候选选择和局部窗口。 |
| 09 | [代码与实验：原始脚本、验证结果与实现边界](./09-experiments/) — 按命题、输入、脚本和预期结果核对注意力机制，明确 toy 与生产实现边界。 |
| 10 | [DeepSeekMoE：细粒度专家、路由与负载均衡](./10-deepseek-moe/) — 从细粒度专家、共享专家和路由权重讲到 V2、V3、V4 的差异。 |
| 11 | [MTP：顺序多 token 预测与推测解码](./11-mtp/) — 区分训练中的未来 token 监督和生成时的草稿、验证与接受。 |
| 12 | [Engram：条件记忆、N-gram 检索与 V4.1 集成](./12-engram/) — 解释压缩 token 地址、多头哈希、上下文门控，以及 V4.1 移除短卷积的边界。 |
| 13 | [mHC：多流残差、双随机约束与 Single-Pass](./13-mhc/) — 从多流残差连接、Sinkhorn 双随机约束到 V4.1 Single-Pass 依赖变化。 |
| 14 | [DSpark：半自回归草稿与置信度调度](./14-dspark/) — 跟踪并行草稿、Markov head、条件接受概率和硬件感知验证长度。 |
| 15 | [CED：因果编码解码、全局 KV 与窗口重放](./15-ced/) — 区分 encoder 来源的全局 KV、decoder 局部 SWA 和 bounded replay 的近似。 |
| 16 | [CSA2：跨层 KV 共享、索引复用与层级检索](./16-csa2/) — 按 Full、Reindex、Reuse 和候选池说明 V4.1 跨层缓存与选择。 |
| 17 | [FlashAttention：分块精确注意力、在线 softmax 与 GPU 实现](./17-flash-attention/) — 从在线 softmax 状态推导分块前向、反向重算和 FA1–FA4 的 GPU 调度。 |

## 版本边界

目录同时涉及 DeepSeekMoE、V2、V3、V3.2、V4 和 V4.1-Flash。V2 的 MLA/MoE、V3 的 MTP 与无辅助损失路由、V3.2 的 DSA、V4 的 CSA/HCA/SWA/mHC，以及 V4.1 的 CED/CSA2/Engram/DSpark 必须按各页列出的论文版本与官方源码 revision 阅读。论文结果、固定代码语义、教学 toy 数值和生产性能不是同一种证据。

当前整理日期为 2026-11-08。正文不把未运行的真实权重、GPU kernel 或生产服务结果写成本地测量；低精度模拟、mask 与 cache buffer 也不单独证明真实字节数或吞吐。

## 统一图示约定

所有专题图使用 Wisp 调色板、8px 网格、12/14/18px 字号和未压缩 draw.io XML；正文引用 `.drawio` 源文件，站点构建时使用同名 `.wisp.svg`。蓝色表示计算或当前路径，绿色表示数据与缓存，橙色表示选择和调度，紫色表示融合或参数；实线表示数据流，虚线表示索引或控制。图注说明教学数值、坐标和版本边界。

## 引用约定

正文先说明对象和问题，再按计算依赖引入公式，最后列出论文、固定源码和实现边界。章节之间的链接只表达阅读关系，不把一个机制的术语套到另一个机制上。