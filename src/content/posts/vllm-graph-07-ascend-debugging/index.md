---
title: "Ascend 配置与排错：无设备阅读指南"
description: "从软件层次、FULL decode 配置和故障现象出发，建立没有 NPU 也能执行的 Ascend 图模式排错路线。"
pubDate: 2026-11-05
tags: [Ascend, ACLGraph, vLLM, Debugging]
category: AI Infra
toc: true
---

## 软件层次

以下示例基于 vLLM Ascend 固定提交 `3b715ff`。它们是阅读材料，不是本机验证过的部署方案。部署前必须核对目标硬件、模型和完整软件组合。

| 层 | 负责什么 | 需要记录什么 |
| --- | --- | --- |
| PyTorch / `torch_npu` | 张量框架和 Ascend 设备适配。 | 两者版本和匹配关系。 |
| vLLM / vLLM Ascend | 推理引擎、runner 和平台插件。 | 发布版本或固定提交、runner、attention 后端。 |
| TorchAir / `npugraph_ex` | 编译扩展和相关优化。 | 实际安装包、版本和最终后端。 |
| CANN | 运行时、算子和工具链。 | 完整 CANN 版本。 |
| HDK、驱动、硬件 | 提供设备访问和底层支持。 | 设备型号、驱动和配套版本。 |

一个 Python 包能够导入，不代表整套运行时兼容。某个旧包名不存在，也不能单独否定新版本的图路径。先查 [Ascend 安装指南](https://docs.vllm.ai/projects/ascend/en/latest/installation.html)，再阅读对应版本的图模式文档。

## FULL decode 配置

下面只是普通 Python 字典，不会初始化 NPU：

```python
kwargs = {
    "model": "/path/to/supported-model",
    "max_model_len": 2048,
    "max_num_seqs": 16,
    "compilation_config": {
        "cudagraph_mode": "FULL_DECODE_ONLY",
    },
    "additional_config": {
        "ascend_compilation_config": {
            "enable_npugraph_ex": False,
            "enable_static_kernel": False,
            "enable_super_kernel": False,
        }
    },
}
```

按这个顺序理解：

1. `model` 指权重和模型配置的位置，必须选择当前版本支持的模型。
2. `max_model_len` 是允许的序列长度上限，不是本轮 query token 数。
3. `max_num_seqs` 是调度容量，不代表每轮一定有 16 个请求。
4. `FULL_DECODE_ONLY` 只请求为满足条件的 uniform decode 使用 FULL，prefill 和混合 batch 不在这条 FULL 路径中。
5. 关闭 `npugraph_ex`、static kernel 和 Super Kernel，是为了先观察基础 ACLGraph 路径，不等于关闭 FULL capture。

如果只想比较 `npugraph_ex`，保持模式、模型、并行度、输入和捕获尺寸不变，只改变 `enable_npugraph_ex`。一次改变多个变量，结果就很难解释。

## 优化选项

| 选项 | 固定版本中的关系 | 先检查什么 |
| --- | --- | --- |
| `enable_npugraph_ex` | 受支持硬件的 FULL 类路径可能启用，piecewise 类路径会关闭。 | 最终模式是否仍允许该优化。 |
| `enable_static_kernel` | 使用预编译的固定形状算子二进制。 | 算子支持、首次编译和缓存。 |
| `enable_super_kernel` | 依赖 static kernel；未显式指定时可能随之开启。 | 是否显式写出 `False` 以隔离变量。 |

“我只打开了 static kernel”不一定只改变一项行为。还要检查默认值继承、平台归一化和最终模式。

## 四道配置判断题

| 情境 | 应怎样理解 |
| --- | --- |
| `FULL_AND_PIECEWISE` 同时请求 `npugraph_ex` | 该编译路径会关闭 `npugraph_ex`，运行时仍可能让 decode 使用 FULL。 |
| `cudagraph_mode=NONE`，想测“只编译” | Ascend 该版本会联动关闭编译，不能直接当作通用 compile-only 对照组。 |
| `FULL_DECODE_ONLY` 下 prefill 没进入 FULL | 符合模式边界。应继续检查后续 uniform decode。 |
| 请求 FULL，最终日志为 PIECEWISE | 先查 attention 能力、平台调整和编译条件，再查目标图是否捕获。 |

XliteGraph 是另一条可选执行路径。首次学习不要同时启用它，否则很难区分 Xlite 的预算路由和 ACLGraph 的模式选择。

## 按现象排错

| 现象 | 先检查 | 为什么 |
| --- | --- | --- |
| Eager 也失败 | 安装组合、模型适配、普通算子和设备容量。 | 问题不局限于设备图。 |
| Eager 成功，capture 失败 | 捕获尺寸、算子支持、workspace 和 stream 资源。 | capture 增加了执行与资源约束。 |
| PIECEWISE 成功，只有 FULL 失败 | attention 整段捕获能力、参数更新和同步。 | FULL 纳入了更多路径。 |
| capture 成功，后续输出异常 | 输入地址、上下文长度、block table 和跨轮更新顺序。 | 可能读到了旧数据或被覆盖的存储。 |
| 图 replay 了，端到端变化很小 | 提交开销占比、padding、通信和采样。 | replay 不会自动改变主要瓶颈。 |

`block table` 是 KV cache 的块映射表，`workspace` 是算子临时工作区。stream 资源和模型权重、KV cache 占用的设备内存不是同一项资源。

错误码或短错误文本不能单独完成诊断。例如，出现 `207008` 或 `Alloc sq cq fail` 时，应结合 stream resource 文本、首个错误栈、HDK/CANN 版本和调用位置判断。

## 有设备后的验证路线

1. 记录硬件、驱动、CANN、PyTorch、`torch_npu`、vLLM 和 vLLM Ascend 的完整版本。
2. 使用支持的小模型和固定输入运行普通 Eager，确认基础生成正确。
3. 使用相同模型和负载尝试保守的图模式，记录最终模式、捕获 key 和 padding。
4. 按固定指南开启 `cudagraph_metrics=True` 和统计日志，确认 CLI 参数与实际版本一致。
5. 使用 `torch_npu.profiler`、Ascend Profiling 或 wrapper replay 分支证据确认实际重放。Runtime Mode 只表示选路。
6. 连续执行多轮 decode，检查参数更新和结果正确，再增加编译优化。

性能验证还要固定输出长度、并发和采样参数，分别记录初始化、首轮和稳态数据。一次成功生成不能证明性能收益，也不能替代结果正确性检查。

## 检查点

1. 为什么“能 import 一个包”不能证明部署兼容？
2. `max_model_len` 和本轮 query token 数有什么区别？
3. 为什么 `FULL_DECODE_ONLY` 下不能用 prefill 判断 FULL 失效？
4. Eager 成功但 FULL 失败时，为什么先检查 attention 和同步？
5. 哪些证据能证明 replay，哪些只能证明选路？

## 参考资料

- [图模式指南，固定提交 3b715ff](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/docs/source/user_guide/feature_guide/graph_mode.md)
- [ACL 图设计与 metrics 用法](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/docs/source/developer_guide/Design_Documents/ACL_Graph.md)
- [模式调整：platform.py](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/vllm_ascend/platform.py)
- [编译优化与缓存：compiler_interface.py](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/vllm_ascend/compilation/compiler_interface.py)
- [捕获和 replay：acl_graph.py](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/vllm_ascend/compilation/acl_graph.py)
- [参数更新：updatable_graph.py](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/vllm_ascend/compilation/updatable_graph.py)
