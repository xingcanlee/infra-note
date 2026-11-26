# 系列规划与交付总账

本文记录 `infra-note` 全站**六大递进系列**（共 `50` 篇文章：`6` 篇系列导览 + `44` 篇精讲正文章）的设计思路、四选一可视化路由与双硬件源码对照结构。写作细则见 `design/writing-guide.md`。

## 全站架构：六大递进系列与双硬件主线

站点将通用硬件、算子、分布式通信、通用推理引擎、昇腾插件拓展与执行图彻底拆分串联，形成**“异构硬件与量化基础 → 分布式并行与通信 → DeepSeek 模型架构演进 → vLLM 推理引擎 → vLLM-Ascend 昇腾插件与硬件拓展 → 推理执行图：CUDA Graph 与 ACL Graph”**六步递进路线。

每篇正文章遵循“问题切入 → 微型数字直觉与可视化 → 机制推导与架构 → Python 参考实现与源码对照 → 自然衔接与过渡”的问题流向，所有前提、硬件限制与演进取舍随上下文自然展开，不设教案八股栏目。

首页 `summarizeSeries` 按系列内最新 `pubDate` 降序排列，时间锚定使首页按学习顺序精确呈现 **`foundations`（1）→ `distributed`（2）→ `deepseek`（3）→ `vllm`（4）→ `vllm-ascend`（5）→ `execgraph`（6）**。

## 可复用组件与单源图表（文章就近 `explainers/` + `astro-wisp` + 单源 `.drawio`/`.excalidraw`）

- **交互式讲解架构**：`24` 枚文章专属 `<Explainer>` 组件已随文章就近存放在各自 `src/content/posts/<series>/<slug>/explainers/` 下，复用 `astro-wisp/explainers` 的新版外壳（顶部阶段标签、重播、自动演示与原生 `<dialog>` 全屏推演），其中 `07-engram`、`08-mhc`、`vllm` 与 `vllm-ascend`、`execgraph` 均采用模块化目录结构、`BeatExplainer` 节拍推演、`motion/react` 渐进推导及逻辑单测；存量共享原语保留在 `src/explainers/kit/` 供其余组件使用，全站 `<= 3` 非 slate 色调，全部基于 `var(--wisp-*)` 语义令牌。
- **静态图表工作流（`design/diagram-workflow.md`）**：流程、分层、双端对照与状态转换优先采用 Pele（Mermaid）；LLM 论文结构图、矩阵网格与等比时间线直接以未压缩 `.drawio` / `.excalidraw` 为唯一真相源，配合 `wisp diagram lint --fix`、`pnpm diagram build` 与明暗 PNG 目视验收交付。

---

## 系列一：推理与异构硬件基础（`series.id = foundations`，`order: 1..7`，`pubDate: 2026-11-15`）

| `order` | 目录 / 篇目                      | 可视化工具组合                | 核心讲解与硬件对照                                                 |
| :-----: | :------------------------------- | :---------------------------- | :----------------------------------------------------------------- |
|   `1`   | `foundations/index.mdx`          | Mermaid                       | 全系列六章演进路线与 GPU SM vs 昇腾 AI Core 双线导览               |
|   `2`   | `01-workload-and-roofline`       | Explainer + Draw.io (×2)      | 单层前向算子分类、算子融合减 HBM 往返与 H800 vs 910B Roofline 曲线 |
|   `3`   | `02-gpu-and-ascend-architecture` | Explainer (×3) + Draw.io (×2) | 全幅芯片嵌套地图、单核 SM/AI Core 硅片分布、延迟隐藏与矩阵几何重排 |
|   `4`   | `03-attention-and-rope`          | Explainer (×2) + Draw.io      | Causal $QK^\top$ 热力步进、RoPE 复平面旋转与 YaRN 频谱缩放         |
|   `5`   | `04-kv-cache-and-gqa`            | Explainer + Draw.io (×2)      | Decode KV Cache 增量步进、等宽比例 MHA/GQA/MQA 与 GPU vs `PA_NZ`   |
|   `6`   | `05-flash-attention`             | Explainer + Draw.io (×2)      | 单槽 Online Softmax Tiling、FlashMLA/FA4 与昇腾 Cube-Vector 乒乓   |
|   `7`   | `06-quantization`                | Draw.io + Excalidraw + Merm   | 离群值与 Hadamard 旋转 SQNR、位宽比例图与 GPU/ModelSlim 量化路由   |

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

| `order` | 目录 / 篇目                 | 可视化工具组合                        | 核心讲解与硬件对照                                                                                |
| :-----: | :-------------------------- | :------------------------------------ | :------------------------------------------------------------------------------------------------ |
|   `1`   | `deepseek/index.mdx`        | Mermaid                               | DeepSeek V2 → V4.1 五代模型核心机制演进路线                                                       |
|   `2`   | `01-mla`                    | Explainer + Draw.io                   | MLA 矩阵吸收（Absorb）全推导、按字节比例条与 GPU/昇腾运行时双泳道                                 |
|   `3`   | `02-swa-and-nsa`            | Explainer + Draw.io                   | 滑窗 Sink 热力分布、NSA 三分支融合门控与 $G=16$ GQA 硬件对齐分块                                  |
|   `4`   | `03-dsa`                    | Explainer + Draw.io                   | V3.2 闪电索引器、Top-K 稀疏收集、$656\text{B}/132\text{B}$ 字节对比                               |
|   `5`   | `04-csa-and-hca`            | Explainer + Draw.io                   | V4 $m=4$ 条件分组压缩 CSA 与跨层指针复用 HCA                                                      |
|   `6`   | `05-csa2-and-ced`           | Explainer + Draw.io                   | V4.1 NVFP4 `288 B` CSA2、分层索引与上下文编码解码 CED 前缀重播                                    |
|   `7`   | `06-moe`                    | Explainer + Draw.io                   | 无辅助损失动态偏置平衡、`moe_align_block_size` 与 GPU/昇腾 MoE 融合                               |
|   `8`   | `07-engram`                 | Explainer+Draw.io+Mermaid+论文        | 命名与 N-gram/卷积前置概念、互异质数建桶、$1d/4d$ 比例图、`vllm`/`vllm-ascend` 类图与调用链       |
|   `9`   | `08-mhc`                    | Explainer(×2)+Draw.io(×4)+Merm+论文图 | 三代残差对照、双子层微例、Sinkhorn 投影、论文 Fig.4/5/6/8、`vllm`/`vllm-ascend` V4.1 融合与 `10d` |
|  `10`   | `09-mtp-and-dspark`         | Explainer + Draw.io                   | 无损拒绝采样分布守恒、MTP/DSpark 验证泳道与 vLLM/昇腾投机框架                                     |
|  `11`   | `10-architecture-synthesis` | Explainer + Draw.io                   | V4.1 单 Token 6 步全解码、集群级 DBO 全流程（含 `μB1 Combine`）                                   |

---

## 系列四：vLLM 推理引擎：架构与核心组件（`series.id = vllm`，`order: 1..12`，`pubDate: 2026-10-25..2026-11-02`）

| `order` | 目录 / 篇目                                | 可视化工具组合      | 核心讲解内容                                                      |
| :-----: | :----------------------------------------- | :------------------ | :---------------------------------------------------------------- |
|   `1`   | `vllm/index.mdx`                           | Mermaid             | vLLM V1 自顶向下三层架构与十一章导览                              |
|   `2`   | `01-vllm-v1-architecture`                  | Explainer + Draw.io | V0 GIL 痛点、V1 三层进程边界、请求生命线与 `VllmConfig` 切分      |
|   `3`   | `02-runtime-topology-and-parallel-mapping` | Draw.io (×2) + Merm | 进程数公式、`DP×PP×PCP×TP` 5D 映射、`shm_broadcast` 与 DP 波次    |
|   `4`   | `03-paged-attention-and-block-kv-cache`    | Draw.io (×2) + Merm | 三类显存碎片、PagedAttention 寻址、链式 APC、逆序 LRU 与混合 KV   |
|   `5`   | `04-continuous-batching-and-scheduler`     | Explainer+Drawio+Mm | 四代批处理演进、统一 `token_budget`、`FCFS`/Priority 与重算抢占   |
|   `6`   | `05-worker-and-model-runner-v2`            | Explainer + Draw.io | Worker 冷启动显存探测、`prepare_inputs` 手算与 MRV2 五大重构      |
|   `7`   | `06-async-execution-and-launch-wall`       | Draw.io + Merm (×2) | CPU 发射队列、`.item()` 同步排空、跨步占位与 `AsyncOutput`        |
|   `8`   | `07-dp-coordination-and-kv-transfer`       | Draw.io + Mermaid   | MoE DP 集体裁决防死锁与 `KVConnectorBase_V1` 双角色 PD 传输协议   |
|   `9`   | `08-speculative-decoding-engine`           | Mermaid (×5)        | 五大 Speculator 家族、Triton `RejectionSampler`、融合图与回退对照 |
|  `10`   | `09-structured-outputs-and-parsing`        | Mermaid (×5)        | 异步 FSM 编译、Triton `Bitmask`、有序采样管线、思考预算与工具解析 |
|  `11`   | `10-launch-config-and-tuning`              | Mermaid (×4)        | CLI 到 `VllmConfig` 流向、`-O0..O3`、显存批预算耦合与启动模板     |
|  `12`   | `11-profiling-and-debugging`               | Draw.io + Mermaid   | `nsys` 采集陷阱、五类轨迹指纹、二分排障树与跨请求 KV 污染复现     |

---

## 系列五：vLLM-Ascend 昇腾插件与硬件拓展（`series.id = vllm-ascend`，`order: 1..8`，`pubDate: 2026-10-23..2026-10-24`）

| `order` | 目录 / 篇目                                      | 可视化工具组合      | 核心讲解内容                                                           |
| :-----: | :----------------------------------------------- | :------------------ | :--------------------------------------------------------------------- |
|   `1`   | `vllm-ascend/index.mdx`                          | Mermaid             | OOT 零分叉插件定位与昇腾七章硬件拓展导览                               |
|   `2`   | `01-oot-plugin-and-patch-architecture`           | Draw.io + Mermaid   | `entry_points`、`PrivateUse1`、六大 OOT 钩子与双进程 `patch/` 边界     |
|   `3`   | `02-hardware-abstraction-cpu-binding-and-memory` | Draw.io (×2)        | 四代昇腾规格与 `HardwareProfile`、ARM CPU 亲和性、`CaMem` 与 MC2       |
|   `4`   | `03-npu-worker-runner-and-kv-layout`             | Draw.io + Mermaid   | `NPUWorker`/MRV2、`AscendBlockTables`、`PA_NZ` 分形、PCP/DCP 与 KVPP   |
|   `5`   | `04-hccl-mc2-and-dynamic-eplb`                   | Draw.io + Mermaid   | 昇腾专属通信组、`HCCL_BUFFSIZE`、四路 MoE 通算融合与 `AscendEplbState` |
|   `6`   | `05-mooncake-pd-and-kv-pool`                     | Explainer + Draw.io | Mooncake Pull / Layerwise Push / D2RH、MemFabric 与分层 KV 卸载        |
|   `7`   | `06-quantization-custom-ops-and-tuning`          | Draw.io + Mermaid   | ModelSlim 量化、Triton/AscendC 自定义算子开发与 207008/507011 排障     |
|   `8`   | `07-ascend-launch-config-and-env`                | Mermaid (×4)        | 三层配置、PR #9064 `--additional-config`、`HCCL_BUFFSIZE` 与卡型基线   |

---

## 系列六：推理执行图：CUDA Graph 与 ACL Graph（`series.id = execgraph`，`order: 1..8`，`pubDate: 2026-10-15..2026-10-22`）

| `order` | 目录 / 篇目                                         | 可视化工具组合             | 核心讲解与硬件对照                                                                         |
| :-----: | :-------------------------------------------------- | :------------------------- | :----------------------------------------------------------------------------------------- |
|   `1`   | `execgraph/index.mdx`                               | Mermaid                    | 异步算力流 → 编译静态化 → GPU 与 NPU 对称执行图七章路线与上游源码快照基准                  |
|   `2`   | `01-heterogeneous-streams-and-events`               | Explainer+Draw.io+Mermaid  | 异步队列、硬件角色术语、`Pushbuffer` vs `SQ/CQ`、单流 FIFO、`Event`/`Notify` 同步          |
|   `3`   | `02-torch-compile-fundamentals`                     | Explainer+Draw.io+Merm+PNG | PyTorch 2 ASPLOS'24、`PEP 523`、`FX`、`Custom Op`、`SymInt`、分段切图与双端融合编译        |
|   `4`   | `03-cuda-graph-fundamentals`                        | Draw.io+Excalidraw+Mermaid | PyTorch/NVIDIA 官方实测、Stream Capture、四道硬边界、`global_graph_pool` 与条件节点        |
|   `5`   | `04-vllm-cudagraph-modes`                           | Mermaid + PNG              | `CUDAGraphMode` 五种模式、`AttentionCGSupport` 自动降级、三层同心包装与 `BreakableWrapper` |
|   `6`   | `05-acl-graph-architecture-and-capture`             | Explainer+Draw.io+Mermaid  | 影子模型流、`LogicSQ`、`comm.args` D2D 备份、`EndGraph` `Notify`、多流汇合与状态机         |
|   `7`   | `06-acl-graph-task-update-and-conditional-subgraph` | Explainer+Draw.io+Mermaid  | 变长 `Tiling`、`TaskGrp`/`TaskUpdate`、参数原地更新、`ExternalEvent`、`CondHandle` 与源码  |
|   `8`   | `07-acl-graph-fullstack-and-vllm-ascend`            | Draw.io+Mermaid+PNG        | `NPUPlatform` 模式限制、昇腾注意力分级、稀疏分桶/MTP 对齐、错误码 207008 与 507011         |

---

## 系列质量门与站点校验（`content.test.ts`、`style.test.ts` 与 `explainers.test.ts`）

- **四选一可视化与零遗留**：全站 `50` 篇文章按需组合 `Mermaid`、`Draw.io`、`Excalidraw` 与交互式 `<Explainer>` 组件，所有 `diagrams/` 目录零孤立未引用文件，`pnpm diagram lint --strict` 与 `pnpm diagram build` 零告警通过。
- **交互组件与风格门禁测试**：`src/explainers/__tests__/explainers.test.ts` 验证全部交互组件的步骤边界、公式配对与零硬编码 `#hex` SSR 渲染；`src/style.test.ts` 校验全站标题、小标题、句段长度、单段符号密度、直译黑名单与弯引号一致性；全站无外部 `toy.py` 脚本，正文中均附 PyTorch/NumPy/Python 参考实现与 `cann/runtime` / `torch_npu` / `vllm` / `vllm-ascend` 源码对照。
- **写作与构建门禁**：`check_post.py --all --strict` 返回 `0 error / 0 warning`；`pnpm format:check`、`pnpm check` 与 `pnpm build` 全部通过。
