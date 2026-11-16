# 系列规划与交付总账

本文记录 `infra-note` 全站**四大递进系列**（共 `29` 篇文章：`4` 篇系列导览 + `25` 篇精讲正文章）的设计思路、四选一可视化路由与双硬件源码对照结构。写作细则见 `design/writing-guide.md`。

## 全站架构：四大递进系列与双硬件主线

站点将通用硬件、算子与分布式通信基础彻底从 DeepSeek 专题中解耦，形成**「异构硬件与量化基础 → 分布式并行与通信 → DeepSeek 模型架构演进 → vLLM 与昇腾运行时引擎」**四步递进路线。

每篇正文章遵循「开头导读 → 微例直觉与交互式/矢量可视化 → 一般原理与架构 → PyTorch / NumPy 核心参考实现 → NVIDIA GPU（`vLLM`/`FlashMLA`/`DeepEP`）与昇腾 NPU（`vllm-ascend`/CANN）源码对照 → 代价与边界 → 自测与衔接」。

首页 `summarizeSeries` 按系列内最新 `pubDate` 降序排列，时间锚定使首页按学习顺序精确呈现 **`foundations`（1）→ `distributed`（2）→ `deepseek`（3）→ `vllm`（4）**。

## 可复用组件工程（`src/explainers/kit` + `scripts/diagram_kit`）

- **交互式 SVG 套件（`src/explainers/kit/`）**：封装 `TensorBlock`（按维度比例与虚线切分）、`ByteLedgerBar`、`HeatmapMatrix`、`ProbabilityBars`、`SlotStrip`/`PointerArcs`、`SwimlaneTimeline`、`LogRooflineChart`、`DataFlowArrow`、`ActiveFocusFrame`、`MetricRow` 与 `SectionBox`，全站 `<= 3` 非 slate 色调，全部基于 `var(--wisp-*)` 语义令牌。
- **静态图生成器套件（`scripts/diagram_kit/`）**：封装 `DrawioCanvas`（`tensor_block`、`proportional_strip`、`heatmap_grid`、`swimlane_pair`、`horizontal_lanes`、`multi_lane_bus`）与 `ExcalidrawScene`（`bitfield_comparison`、`quadrant_cards`、`tap_contrast`），按系列通过 `scripts/diagrams/*.py` 确定性生成并经过 `lint --strict` 校验。

---

## 系列一：推理与异构硬件基础（`series.id = foundations`，`order: 1..6`，`pubDate: 2026-11-15`）

| `order` | 目录 / 篇目                | 可视化工具组合                | 核心讲解与硬件对照                                                 |
| :-----: | :------------------------- | :---------------------------- | :----------------------------------------------------------------- |
|   `1`   | `foundations/index.mdx`    | Mermaid                       | 全系列五章演进路线与 GPU SM vs 昇腾 AI Core 双线导览               |
|   `2`   | `01-hardware-and-roofline` | Explainer + Draw.io           | 单层前向张量维度、H800 vs 910B Roofline 及 SM / AI Core 硬件双泳道 |
|   `3`   | `02-attention-and-rope`    | Explainer                     | Causal $QK^\top$ 热力步进、RoPE 复平面旋转与 YaRN 频谱缩放         |
|   `4`   | `03-kv-cache-and-gqa`      | Explainer + Draw.io           | Decode KV Cache 增量步进、等宽比例 MHA/GQA/MQA 与 GPU vs `PA_NZ`   |
|   `5`   | `04-flash-attention`       | Explainer + Draw.io           | 单槽 Online Softmax Tiling、FlashMLA/FA4 与昇腾 Cube-Vector 乒乓   |
|   `6`   | `05-quantization`          | Explainer + Excalidraw + Merm | 离群值与 Hadamard 旋转 SQNR、位宽比例图与 GPU/ModelSlim 量化路由   |

---

## 系列二：分布式并行与跨卡通信（`series.id = distributed`，`order: 1..4`，`pubDate: 2026-11-14`）

| `order` | 目录 / 篇目                         | 可视化工具组合           | 核心讲解与硬件对照                                                 |
| :-----: | :---------------------------------- | :----------------------- | :----------------------------------------------------------------- |
|   `1`   | `distributed/index.mdx`             | Mermaid                  | 分布式互联、集合通信、混合并行与 PD 分离路线                       |
|   `2`   | `01-interconnects-and-collectives`  | Explainer + Draw.io+Merm | 4-Rank Ring ReduceScatter+AllGather、Scale-Up/Out 层级与 NCCL/HCCL |
|   `3`   | `02-parallelism-and-disaggregation` | Explainer + Draw.io      | Attention DP + MoE EP 动态路由、TP/SP/CP 张量切分与 PD 分离跨机 KV |
|   `4`   | `03-moe-comm-and-overlap`           | Explainer + Draw.io      | 严格毫秒比例 DBO 双微批重叠泳道与 DeepEP vs 昇腾 MC2 硬件对比      |

---

## 系列三：DeepSeek 架构演进（`series.id = deepseek`，`order: 1..11`，`pubDate: 2026-11-03..2026-11-13`）

| `order` | 目录 / 篇目                 | 可视化工具组合             | 核心讲解与硬件对照                                                  |
| :-----: | :-------------------------- | :------------------------- | :------------------------------------------------------------------ |
|   `1`   | `deepseek/index.mdx`        | Mermaid                    | DeepSeek V2 → V4.1 五代模型核心机制演进路线                         |
|   `2`   | `01-mla`                    | Explainer + Draw.io        | MLA 矩阵吸收（Absorb）全推导、按字节比例条与 GPU/昇腾运行时双泳道   |
|   `3`   | `02-swa-and-nsa`            | Explainer + Draw.io        | 滑窗 Sink 热力分布、NSA 三分支融合门控与 $G=16$ GQA 硬件对齐分块    |
|   `4`   | `03-dsa`                    | Explainer + Draw.io        | V3.2 闪电索引器、Top-K 稀疏收集、$656\text{B}/132\text{B}$ 字节对比 |
|   `5`   | `04-csa-and-hca`            | Explainer + Draw.io        | V4 $m=4$ 条件分组压缩 CSA 与跨层指针复用 HCA                        |
|   `6`   | `05-csa2-and-ced`           | Explainer + Draw.io        | V4.1 NVFP4 `288 B` CSA2、分层索引与上下文编码解码 CED 前缀重播      |
|   `7`   | `06-moe`                    | Explainer + Draw.io        | 无辅助损失动态偏置平衡、`moe_align_block_size` 与 GPU/昇腾 MoE 融合 |
|   `8`   | `07-engram`                 | Explainer+Draw.io+Exc+论文 | 多头奇素数哈希、上下文门控、$1d/4d$ 比例图、ShortConv 与异构预取    |
|   `9`   | `08-mhc`                    | Explainer + Draw.io        | Sinkhorn Birkhoff 双随机收敛（含行列和）、Mega-mHC 与 4 流残差总线  |
|  `10`   | `09-mtp-and-dspark`         | Explainer + Draw.io        | 无损拒绝采样分布守恒、MTP/DSpark 验证泳道与 vLLM/昇腾投机框架       |
|  `11`   | `10-architecture-synthesis` | Explainer + Draw.io        | V4.1 单 Token 6 步全解码、集群级 DBO 全流程（含 `μB1 Combine`）     |

---

## 系列四：vLLM 与昇腾推理引擎（`series.id = vllm`，`order: 1..8`，`pubDate: 2026-10-25..2026-11-01`）

| `order` | 目录 / 篇目                          | 可视化工具组合         | 核心讲解与硬件对照                                                  |
| :-----: | :----------------------------------- | :--------------------- | :------------------------------------------------------------------ |
|   `1`   | `vllm/index.mdx`                     | Mermaid                | vLLM V1 与 `vllm-ascend` 执行栈七章路线与快照基准                   |
|   `2`   | `01-paged-attention-and-scheduler`   | Explainer + Draw.io    | V1 统一 `token_budget`、Prefix Hash、`null_block` 映射与 PA 内核    |
|   `3`   | `02-async-execution-and-launch-wall` | Explainer + Draw.io    | CPU 发射队列、`.item()` `op5` 排水与 AsyncOutput/TaskQueue          |
|   `4`   | `03-torch-compile-and-piecewise`     | Mermaid + Draw.io      | `split_graph` 分段路由、FX 算子融合与 Inductor vs `npugraph_ex`     |
|   `5`   | `04-cuda-graph-and-boundaries`       | Explainer + Excalidraw | `0x7f00_1000` 固定地址重放、`B_cap` 填充与四象限静态图硬边界        |
|   `6`   | `05-runtime-dispatch-and-nesting`    | Explainer + Mermaid    | 多 Rank DP 集体决策防死锁与嵌套包装器/退化透传决策流                |
|   `7`   | `06-ascend-aclgraph-and-npugraph`    | Explainer + Draw.io    | `[17,33,45,58]` 分桶、参数热更新 `tiling_data`、`ExternalEvent`闭合 |
|   `8`   | `07-profiling-and-debugging`         | Explainer + Mermaid    | nsys / `torch_npu.profiler` 四类轨迹指纹与五维排障决策树            |

---

## 质量门与站点校验（`src/content.test.ts` 与 `explainers.test.ts`）

- **四选一可视化与零遗留**：全站 `29` 篇文章按需组合 `Mermaid`、`Draw.io`、`Excalidraw` 与交互式 `<Explainer>` 组件，所有 `diagrams/` 目录零孤立未引用文件，`pnpm diagram lint --strict` 与 `pnpm diagram build` 零告警通过。
- **交互组件与实现测试**：`src/explainers/__tests__/explainers.test.ts` 验证全部交互组件的步骤边界、公式配对与零硬编码 `#hex` SSR 渲染；全站无外部 `toy.py` 脚本，正文中均附 PyTorch/NumPy 参考实现与 `vllm` / `vllm-ascend` 源码对照。
- **写作与构建门禁**：`check_post.py --all --strict` 返回 `0 error / 0 warning / 0 info`；`pnpm format:check`、`pnpm check` 与 `pnpm build` 全部通过。
