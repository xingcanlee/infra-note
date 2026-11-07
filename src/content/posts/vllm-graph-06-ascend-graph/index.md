---
title: "Ascend 图模式：NPUGraph、TorchAir 与 ACLGraph"
description: "按编译后端、vLLM 运行时和 ACL 层次区分 NPUGraph、TorchAir、npugraph_ex 与 ACLGraphWrapper。"
series:
  id: vllm-graph
  order: 8
pubDate: 2026-11-05
tags: [Ascend, ACLGraph, NPUGraph, vLLM]
category: AI Infra
toc: true
---

## 名称与层次

本文基于 vLLM Ascend 固定提交 `3b715ff` 的代码阅读，不是一次 NPU 推理验证。不同发行版可能调整包名、编译路径和配置默认值。

| 名称 | 所在层 | 负责什么 |
| --- | --- | --- |
| TorchAir | Ascend 的 PyTorch 图编译扩展。 | 提供相应编译后端和优化能力。 |
| `npugraphs` | 编译后端路线。 | 把 FX 计算下沉为 NPU 图相关执行路径。 |
| `npugraph_ex` | 面向推理的编译优化路线。 | 提供 FX 优化和缓存等能力，是否启用取决于模式和平台。 |
| `torch.npu.NPUGraph` | `torch_npu` 的设备图 API。 | 负责 NPU capture 和 replay 的包装。 |
| `ACLGraphWrapper` | vLLM Ascend 运行时包装器。 | 按模式和 batch key 管理实际图实例。 |
| `aclmdlRI` | 底层 ACL 运行时对象。 | 表示结束 capture 后交给运行时执行的对象。 |

![公共 PyTorch 前端连接 Ascend 编译后端、vLLM wrapper 与 ACL 运行时](./diagrams/06-ascend-stack.drawio "图 06-1：编译层与运行时图层")

可以按下面的层次阅读：

```text
Dynamo / FX
  → Ascend 编译后端
  → vLLM ACLGraphWrapper
  → torch.npu.NPUGraph
  → ACL 运行时执行对象
```

ACLGraph 是 vLLM Ascend 对这条运行时路径的称呼，不是和 NPUGraph 并列的另一种编译前端。不同路径不一定依次经过所有组件。

## 三条路径

| 路线 | 主要动作 | 不要据此推断 |
| --- | --- | --- |
| `npugraphs` | 接收 FX 并进入 NPU 图捕获与重放。 | 所有 vLLM 模式都会使用它。 |
| vLLM 的 `npugraph_ex` | 做 FX 优化、编译和缓存，再返回 callable 或相关产物。 | 它等同于外层 ACLGraph replay。 |
| TorchAir GE | 转换为 Ascend IR，交给 GE 编译和执行。 | GE 图执行就是 vLLM ACLGraph。 |

固定集成中，`force_eager=True` 可能表示编译后端不接管设备捕获，但外层 ACLGraph 仍然可以捕获和 replay。能否导入 `torchair` 也不能单独决定完整图路径。

## 模式与编译

| 请求模式 | 编译侧 | 运行时侧 |
| --- | --- | --- |
| `NONE` | 与关闭编译联动。 | 普通 Eager 执行。 |
| `PIECEWISE` | 使用基础 FX 优化，关闭 `npugraph_ex`。 | ACLGraph 分段执行。 |
| `FULL_AND_PIECEWISE` | 使用 piecewise 编译路径，关闭 `npugraph_ex`。 | 根据 batch 选择 FULL 或 PIECEWISE。 |
| `FULL` 或 `FULL_DECODE_ONLY` | 受支持平台上可能启用 `npugraph_ex`。 | ACLGraph 捕获或 replay 目标区域。 |

这是固定版本的阅读模型，不是所有版本的兼容矩阵。Ascend 上的 `NONE` 还可能联动关闭编译，不能照搬 CUDA 的“只编译、不使用设备图”对照实验。

## NPUGraph 生命周期

Ascend 和 CUDA 共享三个要求：

1. 准备稳定的输入、输出和相关工作区；
2. 在捕获前完成预热和初始化；
3. 让每轮新数据进入受支持的固定存储，再执行 replay。

底层对象不同：

| 平台 | 捕获结束后的对象关系 |
| --- | --- |
| CUDA | `cudaGraph_t` 通常实例化为 `cudaGraphExec_t`，再 launch。 |
| Ascend | 所查路径中，capture end 得到 `aclmdlRI`，随后由 ACL 运行时异步执行。 |

所查 `torch_npu` 源码中 `instantiate()` 是空实现。这只说明该包装层没有单独的实例化步骤，不能推断底层运行时不需要准备。

## FULL attention 的参数更新

decode 期间，上下文长度会增长，block table、position 和其他 attention 元数据也会变化。图中的任务关系可以保持不变，但每轮读取的参数必须更新。

固定地址的 Tensor 可以通过原地写入更新。对于以特定方式记录的任务，Ascend attention 后端还可能使用 task group，在 capture 时登记可更新的任务，运行时刷新契约允许变化的参数。

参数更新不是重新捕获整张图，也不能任意更换形状、地址或任务拓扑。必须同时满足：本轮 replay 读取前本轮参数已经对执行流可见，下一轮更新不能覆盖上一轮仍在使用的状态。

`ExternalEvent`、update stream 和 replay stream 用来表达这些依赖。不同路径可能先提交 replay，再用事件协调参数更新，不能只看两行 Python 的先后顺序判断安全性。

![Ascend 图捕获与每轮执行中的参数更新和 replay 依赖](./diagrams/06-npu-lifecycle.drawio "图 06-2：参数更新必须先于本轮读取可见")

## prefill、decode 与平台能力

| 路径 | 常见用途 | 需要满足的条件 |
| --- | --- | --- |
| PIECEWISE | prefill、混合 batch 或不能整段捕获的计算。 | 编译边界、分段输入输出和资源都可用。 |
| FULL decode | 规则、重复的 decode 工作。 | batch key、attention 更新和流依赖兼容。 |
| FULL prefill 或混合 batch | 平台明确支持时使用。 | attention 能力、参数更新、资源和配置同时满足。 |

不能只根据 `prefill` 或 `decode` 标签判断是否使用 FULL。上下文并行、encoder-decoder、workspace 和 stream 资源都可能收窄最终模式。

## 检查点

1. `NPUGraph` 和 `ACLGraphWrapper` 分别位于哪一层？
2. 为什么 `npugraph_ex` 不是 `ACLGraphWrapper` 的同义词？
3. `force_eager=True` 为什么不一定关闭外层 ACLGraph？
4. FULL attention 为什么需要更新参数和跨流依赖？
5. 没有 NPU 时，哪些结论只能写成“基于源码分析”？

## 参考资料

- [vLLM Ascend 图模式指南](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/docs/source/user_guide/feature_guide/graph_mode.md)
- [ACL 图设计](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/docs/source/developer_guide/Design_Documents/ACL_Graph.md)
- [编译接口](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/vllm_ascend/compilation/compiler_interface.py)
- [ACLGraphWrapper](https://github.com/vllm-project/vllm-ascend/blob/3b715ff78066d22b95be6f4a84e861a44930b25a/vllm_ascend/compilation/acl_graph.py)
- [TorchAir：NPUGraphs](https://www.hiascend.com/document/detail/zh/Pytorch/master/devguide/TorchAir/docs/zh/user_guide/torch_compile/compilation_backend/npugraphs.md)
