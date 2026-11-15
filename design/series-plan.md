# 系列规划与交付总账

本文记录 `infra-note` 全站**四大递进系列**（共 `29` 篇文章：`4` 篇系列导览 + `25` 篇精讲正文章）的设计思路、双硬件对照主线与实际交付结构。写作细则见 `design/writing-guide.md`。

## 全站架构：四大递进系列与双硬件主线

站点将通用硬件、算子与分布式通信基础彻底从 DeepSeek 专题中解耦，形成**「异构硬件与量化基础 → 分布式并行与通信 → DeepSeek 模型架构演进 → vLLM 与昇腾运行时引擎」**四步递进路线，每篇正文章遵循「直觉微型数字算例 → 语义矢量图（walkthrough / arch / runtime）→ 一般公式 → 纯 NumPy `toy.py` → `vLLM` 与 `vllm-ascend` 双仓源码对照 → 代价与边界 → 自测」。

首页 `summarizeSeries` 按系列内最新 `pubDate` 降序排列，时间锚定使首页按学习顺序精确呈现 **`foundations`（1）→ `distributed`（2）→ `deepseek`（3）→ `vllm`（4）**。

---

## 系列一：推理与异构硬件基础（`series.id = foundations`，`order: 1..6`，`pubDate: 2026-11-15`）

| `order` | 目录 / 篇目                |  图表格式  | 解决的核心问题                                                    | 核心 `toy.py` 验证                                   |
| :-----: | :------------------------- | :--------: | :---------------------------------------------------------------- | :--------------------------------------------------- |
|   `1`   | `foundations/index.mdx`    | Excalidraw | 全系列导览：GPU SM vs 昇腾 AI Core 双路线与前置知识总图           | —                                                    |
|   `2`   | `01-hardware-and-roofline` | Excalidraw | 单层前向、NVIDIA SM vs 昇腾 Cube/Vector/UB/NZ 与 Roofline 拐点    | 4D 前向验证 + GPU vs NPU Roofline 及 CV 重叠模拟     |
|   `3`   | `02-attention-and-rope`    |   drawio   | 因果自注意力、RoPE 复数旋转、YaRN 外推与昇腾 RoPE 缓存布局        | 注意力权重 + RoPE 相对位置性质与 YaRN 缩放           |
|   `4`   | `03-kv-cache-and-gqa`      |   drawio   | Decode 增量 KV Cache 账本、MQA/GQA 妥协与昇腾 `TND`/`PA_NZ` 布局  | 有/无 KV Cache 等价性 + MHA/MQA/GQA 显存对比         |
|   `5`   | `04-flash-attention`       |   drawio   | Tiling 分块、Online Softmax、FA-4、FlashMLA 与昇腾 UB 融合注意力  | 分块在线 Softmax / Split-KV / FMA `exp2` 高精度等价  |
|   `6`   | `05-quantization`          | Excalidraw | INT8/FP8/MXFP4 位宽、离群值旋转、1×128 分块与昇腾 ModelSlim/PDMix | 带离群通道矩阵下多种量化方案 SQNR / 误差与压缩率对比 |

---

## 系列二：分布式并行与跨卡通信（`series.id = distributed`，`order: 1..4`，`pubDate: 2026-11-14`）

| `order` | 目录 / 篇目                         |  图表格式  | 解决的核心问题                                                     | 核心 `toy.py` 验证                                 |
| :-----: | :---------------------------------- | :--------: | :----------------------------------------------------------------- | :------------------------------------------------- |
|   `1`   | `distributed/index.mdx`             | Excalidraw | 分布式路线图：多卡互联、集合通信、并行切分与 PD 分离全景           | —                                                  |
|   `2`   | `01-interconnects-and-collectives`  | Excalidraw | $\alpha\text{-}\beta$ 模型、Ring/Tree、NVLink/NCCL vs HCCS/UB/HCCL | 4-rank 集合通信恒等式 + Ring/Tree/P2P 拐点建模     |
|   `3`   | `02-parallelism-and-disaggregation` | Excalidraw | TP/SP/CP/PP、`Attention DP + MoE EP` 与 PD 分离跨机 KV 传输        | 2-rank TP/SP 等价性 + DP+EP 省显存与 PD 带宽核算   |
|   `4`   | `03-moe-comm-and-overlap`           | Excalidraw | DeepEP HT/LL/v2、昇腾 MC2/FlashComm 与双微批 DBO/TBO 流水线重叠    | 4-rank EP 前向等价性 + Prefill/Decode DBO 时延模拟 |

---

## 系列三：DeepSeek 架构演进（`series.id = deepseek`，`order: 1..11`，`pubDate: 2026-11-03..2026-11-13`）

| `order` | 目录 / 篇目                 |  图表格式  | 解决的核心问题                                     | 核心 `toy.py` 验证                                |
| :-----: | :-------------------------- | :--------: | :------------------------------------------------- | :------------------------------------------------ |
|   `1`   | `deepseek/index.mdx`        | Excalidraw | 纯 DeepSeek 模型架构五代演进路线图与上下游衔接     | —                                                 |
|   `2`   | `01-mla`                    |   drawio   | MLA 低秩联合压缩、解耦 RoPE 与矩阵吸收（Absorb）   | Naive 解压 vs 矩阵吸收等价性与 KV 压缩倍率        |
|   `3`   | `02-swa-and-nsa`            |   drawio   | 滑动窗口、Attention Sink 与 NSA 三分支硬件对齐     | 滑窗/汇聚点掩码与 NSA 压缩/选块/滑窗门控融合      |
|   `4`   | `03-dsa`                    |   drawio   | DSA 闪电索引器、动态 Top-K 与稀疏 FlashMLA         | Lightning Indexer 打分 + Top-K 稀疏注意力精度对照 |
|   `5`   | `04-csa-and-hca`            |   drawio   | DeepSeek-V4 条件稀疏 CSA（$m=4$）与跨层共享 HCA    | 多位置共享 latent 与跨层 KV 复用访存折算          |
|   `6`   | `05-csa2-and-ced`           |   drawio   | V4.1 三维压缩 CSA2（288 B NVFP4）与 CED            | 逆 RoPE 复算与多轮前缀 CED 编码/重播误差检查      |
|   `7`   | `06-moe`                    |   drawio   | DeepSeekMoE 细粒度专家、无损路由偏置与 `dsv4_topk` | Top-K 门控路由、无辅助损失偏置收敛与分块对齐 GEMM |
|   `8`   | `07-engram`                 |   drawio   | Engram 条件记忆：多头质数哈希 $O(1)$ 查表与门控    | 奇乘数哈希寻址、上下文消歧门控与异构预取模拟      |
|   `9`   | `08-mhc`                    |   drawio   | 流形受限超连接 mHC：Birkhoff 多面体与 Mega-mHC     | 20/30 层连乘 Amax 对比 + Single-Pass 访存减半模拟 |
|  `10`   | `09-mtp-and-dspark`         |   drawio   | 无损拒绝采样、V3 因果 MTP 与 V4.1 DSpark           | 草稿-验证无损分布等价性 + DSpark 动态加速模拟     |
|  `11`   | `10-architecture-synthesis` |   drawio   | V2→V4.1 五代全链路汇总与 NVIDIA / 昇腾全栈对照     | V4.1 完整解码块恒等性验证 + 4 层双微批 DBO 重叠   |

---

## 系列四：vLLM 与昇腾推理引擎（`series.id = vllm`，`order: 1..8`，`pubDate: 2026-10-25..2026-11-01`）

| `order` | 目录 / 篇目                          | 图表格式 | 解决的核心问题                                              | 核心 `toy.py` 验证                                |
| :-----: | :----------------------------------- | :------: | :---------------------------------------------------------- | :------------------------------------------------ |
|   `1`   | `vllm/index.mdx`                     |  drawio  | 全系列执行栈路线图、双仓库基准与离线验证说明                | —                                                 |
|   `2`   | `01-paged-attention-and-scheduler`   |  drawio  | PagedAttention 物理页表、Prefix Caching 与抢占              | 物理块池、前缀哈希命中率、抢占与利用率对比        |
|   `3`   | `02-async-execution-and-launch-wall` |  drawio  | 发射墙、`.item()` 排水与 CUDA AsyncOutput vs CANN TaskQueue | 双流离散事件队列与 Async Scheduling + Graph 加速  |
|   `4`   | `03-torch-compile-and-piecewise`     |  drawio  | Dynamo/Inductor 融合与 `split_graph` 按算子切分             | FX DAG 切图 + Inductor 融合访存与启动次数对照     |
|   `5`   | `04-cuda-graph-and-boundaries`       |  drawio  | Stream Capture 原理与地址/形状/同步/多流图池边界            | `B_cap` 重放、4 类边界违规诊断与图池内存复用      |
|   `6`   | `05-runtime-dispatch-and-nesting`    |  drawio  | `AttentionCGSupport`、`BatchExecutionDescriptor` 与 DP 对齐 | 启动期降级、四场景选档、`NONE` 透传与 DP 共识模拟 |
|   `7`   | `06-ascend-aclgraph-and-npugraph`    |  drawio  | 昇腾 CANN 墙、`AscendCompiler`、`UpdatableGraph` 与事件     | 静态图参数热更新与 `ExternalEvent` 跨流闭合模拟   |
|   `8`   | `07-profiling-and-debugging`         |  drawio  | `nsys`/`torch_npu.profiler` 指纹识别与五维源码级故障排障树  | 四类 Profiler 指纹分类器 + `B=4 → B=2` 脏尾复现   |

---

## 质量门与站点校验（`src/content.test.ts`）

- **图表**：全站共 `29` 篇文章对应 `82` 份 Wisp 源文件（24 篇正文 × 3 张 + `deepseek/07-engram` 6 张 + 4 篇导览路线图），其中新建与重写文章（`foundations/index, 01, 05`、`distributed/*`、`deepseek/index`，共 `18` 份）采用 `.excalidraw`，其余保留章节（`64` 份）采用未压缩 `.drawio`；单篇文章内部严格保持同一画风，`pnpm diagram lint --strict` 与 `pnpm diagram build` 零告警通过，产物为 `.wisp.svg` 与 `diagrams.manifest.json`。
- **可执行脚本**：全站共 `25` 份纯 NumPy `toy.py`（均不超过 `150` 行），通过 `uv run scripts/verify_toys.py` 统一校验。
- **写作与结构单测**：`check_post.py --all --strict` 要求全部 `29` 篇文章 `0 error / 0 warning / 0 hint`；`src/content.test.ts` 通过 Vitest 校验四大系列连续编号与首页排序、文件互斥、单篇图表画风一致、无遗留/禁忌 MDX 写法与全站内部路由可达。
