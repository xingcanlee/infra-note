---
title: "编译图入门：torch.compile、FX 与断图"
description: "在 CPU 上观察 torch.compile 生成的 FX 图，理解 guards、graph break，以及编译图与设备图的边界。"
pubDate: 2026-11-05
tags: [PyTorch, torch.compile, vLLM]
category: AI Infra
toc: true
---

## 四个角色

`torch.compile` 的第一步不是生成更快的代码，而是先尝试把 Python 函数中的张量计算表示成一张图。

```text
Python 函数或 nn.Module
  → Dynamo 追踪张量计算
  → FX Graph 保存算子和数据依赖
  → 编译后端优化并返回 callable
```

- **Dynamo**：观察 Python 执行，并把可表示的张量计算取出来。
- **FX Graph**：用节点和边表示输入、算子、属性和输出。
- **编译后端**：接收 FX 图，选择融合、代码生成或平台专用实现。
- **Callable**：编译后仍然可以像函数一样调用的对象。

这条链到 callable 就结束了。CUDA Graph 或 ACLGraph 还要在后面的运行时阶段捕获设备工作，编译完成不等于设备图已经存在。

![公共编译前端连接 NVIDIA 与 Ascend 后端，设备图属于后续运行时层](./diagrams/01-compile-stack.drawio "图 01-1：FX 编译图与平台后端")

## CPU 上观察 FX 图

准备支持 `torch.compile` 的 CPU 版 PyTorch，把下面代码保存为 `fx_compile_demo.py` 后运行。

```python
import torch


def f(x):
    return torch.relu(x * 2 + 1)


def inspect_backend(gm, example_inputs):
    print(gm.graph)
    gm.graph.lint()
    return gm.forward


compiled = torch.compile(
    f,
    backend=inspect_backend,
    fullgraph=True,
    dynamic=True,
)

for n in (2, 5):
    x = torch.randn(n, 4)
    torch.testing.assert_close(compiled(x), f(x))
    print("shape ok:", tuple(x.shape))
```

应看到一段 FX 节点，以及类似下面的输出：

```text
shape ok: (2, 4)
shape ok: (5, 4)
```

节点名称和符号维度数量会随 PyTorch 版本变化。这里的后端只打印图并返回 `gm.forward`，所以它不会进入 Inductor，也不会证明 CPU 上获得了加速。

把图简化成一条数据流：

```text
x → 乘 2 → 加 1 → ReLU → 输出
```

FX 记录的是操作和数据依赖。它不承诺最后一定生成三个 kernel，也不表示已经建立了某条设备 stream。

## FX 节点

| 字段或对象 | 先看什么 |
| --- | --- |
| `Graph` | 所有节点及其关系。 |
| `Node.op` | 节点类型，如 `placeholder`、`call_function`、`call_method` 和 `output`。 |
| `Node.target` | 调用的函数、方法、子模块或属性。 |
| `Node.args`、`Node.kwargs` | 输入来自哪些节点，以及使用了哪些常量。 |
| `GraphModule` | 把图包装成可以调用的模块。 |

如果一个节点的 `args` 引用了前一个节点，就表示它消费前一个节点的结果。这是数据依赖，不是设备执行顺序的完整描述。

## Guards 与断图

Dynamo 会记录“这张图成立的条件”，这些条件称为 guards。输入类型、dtype、设备、形状关系和某些对象身份都可能成为 guard。

```text
guards 通过  →  复用已有编译结果
guards 失败  →  可能重新取图并重新编译
```

`dynamic=True` 可以让部分维度使用符号表示，减少固定形状带来的重复编译，但它不会消除所有形状关系和后端限制。

如果 Python 代码包含无法安全表示的行为，Dynamo 可能发生 graph break。函数会被拆成多个可编译区域，中间保留普通 Python 执行。依赖 Tensor 数值的分支、不受支持的调用和某些副作用都可能触发断图。

`fullgraph=True` 要求整段函数一次取图成功。它适合用来暴露边界问题，但不表示设备图会覆盖整个模型。

定位断图、重新编译和 guards 时，可以打开日志：

```bash
TORCH_LOGS="graph_breaks,recompiles,guards" python fx_compile_demo.py
```

PowerShell：

```powershell
$env:TORCH_LOGS="graph_breaks,recompiles,guards"
python fx_compile_demo.py
```

## 放回 vLLM

![编译后端返回 callable，vLLM 再由 dispatcher 和 wrapper 进入设备图运行时](./diagrams/01-compile-backend-panorama.drawio "图 01-2：公共前端与平台后端")

在 NVIDIA 路径中，Inductor 可能选择布局、融合算子、生成 Triton 或 C++ 代码。Ascend 使用自己的编译路径。初次阅读只需抓住共同关系：FX 进入平台后端，后端返回 callable。

vLLM 还可能在 attention 自定义算子边界划分子图。主动划分和 Dynamo 因不支持某段 Python 而发生的 graph break，原因不同。

![dispatcher 选择运行时模式，wrapper 决定 replay、捕获或普通调用](./diagrams/01-graph-runtime-chain.drawio "图 01-3：vLLM 图调用链")

日志出现编译缓存命中时，只能确认编译产物可复用。还要继续检查本轮 batch key、运行时模式和 wrapper 分支，才能判断是否实际 replay。

## 检查点

1. Dynamo 和 FX 各自负责什么？
2. guard 失败为什么可能导致重新编译？
3. `fullgraph=True` 为什么不等于设备图覆盖完整模型？
4. 编译缓存命中后，为什么还要看 dispatcher 和 wrapper？

## 参考资料

- [PyTorch：TorchDynamo 概览](https://docs.pytorch.org/docs/stable/torch.compiler_dynamo_overview.html)
- [PyTorch：torch.fx](https://docs.pytorch.org/docs/stable/fx.html)
- [PyTorch：torch.compile](https://docs.pytorch.org/docs/stable/generated/torch.compile.html)
- [vLLM：torch.compile 集成](https://docs.vllm.ai/en/latest/design/torch_compile/)
