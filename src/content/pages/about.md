---
title: '关于'
description: '关于 infra-note：面向零基础开发者的异构硬件、分布式通信、DeepSeek 模型演进与 vLLM / 昇腾推理引擎实战笔记。'
---

`infra-note` 是一份面向会写 Python、不默认熟悉深度学习缩写或硬件行话的 LLM 推理系统笔记：全站坚持**先给可手算的微型具体数字与高密度算法可视化、再推正式公式、最后落到 PyTorch / NumPy 参考实现与 NVIDIA GPU（`vLLM` / `FlashMLA` / `DeepEP`）/ 华为昇腾 NPU（`vllm-ascend` / CANN）双仓真实源码对照**。

## 四大递进系列（共 29 篇）

站点按**「通用硬件与算子底座 → 多卡并行与通信 → 纯 DeepSeek 架构创新 → 推理引擎运行时」**划分为 4 条互相衔接的系列（`4` 篇系列导览 + `25` 篇精讲正文章）：

1. **[推理与异构硬件基础（01–05 + 导览）](../posts/foundations/)**：从单层前向、Roofline 带宽墙及 **NVIDIA SM vs 昇腾 DaVinci AI Core（Cube/Vector/UB/FRACTAL_NZ）** 出发，系统拆解 Attention / RoPE、KV Cache 与 MQA/GQA、FlashAttention / FlashMLA 与昇腾融合注意力，以及 INT8 / FP8 细粒度缩放 / MXFP4 与昇腾 ModelSlim / PDMix 量化差异。
2. **[分布式并行与跨卡通信（01–03 + 导览）](../posts/distributed/)**：拆解 $\alpha\text{-}\beta$ 通信模型、Ring/Tree 集合通信与 **NVLink/NCCL vs 昇腾 HCCS/UB/HCCL** 互连差异，推导 TP / SP / CP / Attention DP + MoE EP 混合并行与 PD 分离跨机 KV 传输，并深入 **DeepEP 双模式/v2、昇腾 HCCL MC2/FlashComm 与双微批重叠（DBO）**。
3. **[DeepSeek 架构演进（01–10 + 导览）](../posts/deepseek/)**：纯粹聚焦 DeepSeek 模型本身的架构突破——从 MLA 矩阵吸收、NSA、DSA、CSA/HCA 与 V4.1 CSA2 + CED，推进到 DeepSeekMoE、Engram、mHC / Mega-mHC、MTP / DSpark，最后串成 V2–V4.1 单步全链路与 NVIDIA / 昇腾全栈对照。
4. **[vLLM 与昇腾推理引擎（01–07 + 导览）](../posts/vllm/)**：把前序模型与通信机制拉进生产调度与编译栈——拆解 PagedAttention 与连续批处理、异步发射墙、`torch.compile` 分段编译、CUDA Graph 四道边界、运行时模式分派与 DP 降级、昇腾 `ACLGraph` / `npugraph_ex` / `UpdatableGraph`，直到 Profiler 轨迹指纹识别与五维排障。

建议零基础读者按「`foundations` → `distributed` → `deepseek` → `vllm`」顺序通读；如专注在线服务调优，也可从[分布式并行与跨卡通信](../posts/distributed/)或[vLLM 与昇腾推理引擎](../posts/vllm/)切入，再回查硬件与量化前置章。

## 代码参考与双硬件源码快照

- **PyTorch / NumPy 核心参考实现**：全站 `25` 篇正文章均直接在文内给出精炼可复现的张量演算与形状验证代码，不再孤立维护外部 `toy` 脚本，读者无需 GPU/NPU 机器即可对照微例逐行推导。
- **严谨的上游代码与论文锚定**：双硬件生产级源码对照全部核验自仓库外快照目录——上游 `vllm`（`bb23c0a8`）、`vllm-ascend`（`3649b8ff`）、`DeepSeek-V3`（`9b4e9788`）、`FlashMLA`（`395cb3af`）、`DeepEP`（`f6aa38fe`）与 `Engram`（`fb7f84a2`）。论文实测数据与技术报告数字一律标注原始测试条件，不编造本地芯片实测。

## 高密度可视化架构（四选一路由与复用组件库）

全站摒弃“只有圆角方框 + 公式”的静态套话，每张图均按算法结构在**四类表现工具**间精准路由，并基于通用可复用组件库生成，统一适配 Wisp 浅色/深色双主题（单图 `<= 3` 种非 slate 色调）：

- **交互式分步 SVG 组件（`src/explainers/kit` + `<Explainer>`）**：用于矩阵变换、因果/稀疏注意力掩码与数值热力图、离群值分布、多步指针寻址及时间步演化，通过张量长宽比例块、二维热力矩阵与 `4–6` 步离散步进揭示每帧活跃数据流。
- **静态系统架构图（`scripts/diagram_kit.DrawioCanvas` → `.drawio` / `.wisp.svg`）**：用于复杂模型数据流、张量/流水并行切分与 GPU/NPU 双泳道硬件布局，严格对齐 `8px` 网格与按比例字节块。
- **局部直觉与字段对照（`scripts/diagram_kit.ExcalidrawScene` → `.excalidraw` / `.wisp.svg`）**：用于比特位宽对比、四象限静态边界归纳与少跳卷积抽头示意。
- **控制流与排障路由（`Mermaid`）**：用于系列学习路线、运行时包装层递归分发与生产环境故障树诊断。
