---
title: '关于'
description: '关于 infra-note：一份记录 LLM 推理基础设施的学习笔记。'
---

infra-note 是一份围绕 LLM 推理基础设施的技术笔记：关注模型如何被编译成计算图、如何下沉到内核与设备执行，以及运行时怎样调度、缓存和排错。

目前有两条主线：vLLM 图模式系列从 CUDA Graph 讲到 Ascend ACLGraph，DeepSeek 系列从 Attention/KV Cache 讲到 MLA、稀疏注意力、MoE 与推测解码。文章按问题、数据流、源码证据和边界组织，便于从概念一路读到实现。

## 阅读路线

推荐先读 vLLM 系列的 00、05、01，建立请求、图桶与回退的直觉；再从 DeepSeek 系列 01、02、08 开始，理解 Attention、MLA 和稀疏读取的关系。没有设备时，可以阅读 Mermaid、draw.io 和纯 Python 练习，跳过需要 GPU/NPU 的捕获、重放与性能验证。

## 内容边界

文中的源码分析固定在文章注明的提交附近，不代表当前版本的完整兼容矩阵。工作目录下与本仓库同级的 `reference/` 保存 vLLM、vLLM-Ascend、DeepSeek 及相关内核的本地浅克隆，只用于阅读和定位源码，不参与站点编译，也不在本机安装依赖。没有 GPU 或 NPU 时，捕获、重放和性能收益只能作为机制分析，不能替代目标硬件上的正确性检查与 profiler 证据。

## 图表

图表源文件与生成的 Wisp SVG 保存在对应文章目录中。draw.io 源文件可以下载后继续编辑，SVG 版本用于站点内的主题化展示。
