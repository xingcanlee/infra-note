---
title: "CUDA Graph：捕获、重放与固定地址"
description: "走完 CUDA Graph 的准备、预热、捕获、实例化和重放，理解为什么每轮必须写回固定设备地址。"
series:
  id: vllm-graph
  order: 5
pubDate: 2026-11-05
tags: [CUDA Graph, PyTorch, vLLM]
category: AI Infra
toc: true
---

## 生命周期

CUDA Graph 的重点不是记住 API 名称，而是理解一个事实：图重放会继续使用捕获时记录的设备地址。

![CUDA Graph 从准备、预热、捕获到重放的生命周期](./diagrams/02-cuda-lifecycle.drawio "图 02-1：启动时捕获，后续写入新数据并重放")

| 阶段 | 发生什么 | 结果 |
| --- | --- | --- |
| 准备 | 建立输入输出缓冲区，确定形状和执行路径。 | 适合捕获的稳定调用。 |
| 预热 | 提前运行几次，完成 kernel、workspace 和库状态初始化。 | 减少首次捕获时的未知动作。 |
| Capture | 记录 stream 上的 kernel、copy、参数和依赖。 | 图模板 `cudaGraph_t`。 |
| Instantiate | 为重复提交准备可执行对象。 | `cudaGraphExec_t`。 |
| Replay | 把可执行对象提交到 stream。 | 用当前缓冲区数据重新计算。 |

PyTorch 的 `torch.cuda.CUDAGraph` 封装了大部分底层步骤。通常使用 `torch.cuda.graph(...)` 就够了，不需要手动管理 CUDA 原生句柄。

## 固定地址

假设捕获时输入 Tensor 的设备地址是 A。图会保存“从 A 读取”的关系。下一轮想换输入时，要把新数值写入 A。

```python
static_x.copy_(new_x)  # 把新数值写入捕获时的地址 A。
static_x = new_x       # 只改变 Python 变量绑定，图仍然读取地址 A。
```

这条规则同样影响输出。图通常会把结果写入固定输出槽位。下一次 replay 可能覆盖上一轮结果。如果调用方还要保留旧结果，就要在图外复制，并保证复制与下一轮写入的顺序正确。

| 运行时变化 | 常见处理 |
| --- | --- |
| token、position 等数值变化 | 写回固定输入缓冲区。 |
| block table 等受支持的元数据变化 | 写入固定元数据缓冲区。 |
| 形状或 launch 配置变化 | 选择兼容的另一张图、padding，或回退。 |
| 权重、KV cache 或 workspace 地址变化 | 检查图是否仍然有效，不能直接假设可以复用。 |

## 捕获区域

捕获期间的 Python 代码会运行，用来向设备提交工作。之后调用 `graph.replay()` 时，执行的是已经记录的设备任务，不会重新执行那段 Python。

因此，下面这类逻辑不能直接依赖一张固定图处理所有情况：

- Python 需要先读取设备结果，再决定走哪个分支；
- 每轮需要改变算子序列或 launch 配置；
- 代码包含捕获期间不支持的同步或 API。

遇到捕获错误时，先检查 `.item()`、`.cpu()`、隐式同步、第三方库调用和不支持的算子。把 `capture_error_mode` 调成 `relaxed` 只会放宽部分检查，不能修复失效指针或错误依赖。

## 对应到 vLLM

vLLM 不会为每一个可能的 batch 临时创建一张图。它通常提前为有限的 batch key 准备图，运行时再完成下面的动作：

```text
调度器给出本轮工作
  → runner 写入 token、position 和 attention 元数据
  → dispatcher 选择兼容的图桶和运行时模式
  → wrapper 查找该 key 对应的图
  → replay，或调用原来的 callable
```

图固定的是地址、形状条件、launch 配置和依赖。每轮变化的是固定缓冲区中的内容。图桶、padding 和模式选择见 [vLLM 如何选图](../04-vllm-dispatch/)。

## 最小示例

下面的示例需要 NVIDIA GPU 和 CUDA 版 PyTorch。它只演示设备图，不调用 `torch.compile`。

```python
import torch


@torch.inference_mode()
def main():
    if not torch.cuda.is_available():
        raise SystemExit("An NVIDIA GPU and CUDA PyTorch are required.")

    static_x = torch.zeros(5, device="cuda")

    def f(x):
        return torch.relu(x * 2 + 1)

    side = torch.cuda.Stream()
    side.wait_stream(torch.cuda.current_stream())
    with torch.cuda.stream(side):
        for _ in range(3):
            f(static_x)
    torch.cuda.current_stream().wait_stream(side)

    graph = torch.cuda.CUDAGraph()
    with torch.cuda.graph(graph):
        static_y = f(static_x)

    x_ptr = static_x.data_ptr()
    y_ptr = static_y.data_ptr()
    for value in (3.0, 4.0):
        new_x = torch.full_like(static_x, value)
        static_x.copy_(new_x)
        graph.replay()
        torch.testing.assert_close(static_y, f(new_x))
        assert static_x.data_ptr() == x_ptr
        assert static_y.data_ptr() == y_ptr
        print(static_y.cpu().tolist())


if __name__ == "__main__":
    main()
```

按表达式推导，两次输出应分别是五个 `7.0` 和五个 `9.0`。这只是预期结果，真正的 capture、replay 和地址稳定性仍应在目标环境中执行并检查。

## 检查点

1. `capture`、`instantiate` 和 `replay` 分别做什么？
2. 为什么 `copy_` 能更新图读到的输入，而重新赋值不行？
3. 为什么预热要放在捕获前？
4. replay 时，Python 的动态分支会不会重新执行？
5. 如果本轮形状改变，为什么通常要换图、padding 或回退？

## 参考资料

- [PyTorch：CUDA Graphs 约束](https://docs.pytorch.org/docs/stable/notes/cuda.html#constraints)
- [PyTorch：图内存管理](https://docs.pytorch.org/docs/stable/notes/cuda.html#graph-memory-management)
- [PyTorch CUDAGraph.cpp](https://github.com/pytorch/pytorch/blob/38a18395b8448c37883900ecc61895ab707ea346/aten/src/ATen/cuda/CUDAGraph.cpp)
