# 引用迁移清单

本文逐篇记录原 `## 来源` 条目、正文依赖与迁移动作。正文引用位置以标题和原句短引为准；未列出的事实性句子见末尾候选清单。

## src/content/posts/deepseek/00-forward-pass/index.mdx

| 原来源条目（逐字）                                                                                                                                               | 类型                         | 正文依赖位置                                                                                                                                                                                                       | 计划动作                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762)（Transformer 层结构）                                                                              | paper                        | “开头：读完你能回答：一个 token 在模型里是什么形状的数据、矩阵乘到底在算什么、一层 Transformer 的输入和输出为什么形状相同。后面所有篇（MLA、稀疏注意力、MoE）改的都是这一层里的某一步，所以这里的形状必须先对上。” | cite at the claim; definition at end                        |
| [RMSNorm](https://arxiv.org/abs/1910.07467)                                                                                                                      | paper                        | “代码实现：\| `rms_norm` \| `model.py:270-293`（`RMSNorm`） \| 多一个可学习的 `weight`，调用 `F.rms_norm` \|”                                                                                                      | cite at the claim; definition at end                        |
| [DeepSeek-V3 参考实现](https://github.com/deepseek-ai/DeepSeek-V3/blob/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py)（本篇引用的行号按此 commit） | source code at pinned commit | “代码实现：## 代码实现”                                                                                                                                                                                            | cite at the claim; definition at end                        |
| 下一篇：[01 · 注意力从零推一遍](../01-attention/)——把 `attention` 的 5 行拆成 5 步，并解释为什么要加权求和。                                                     | navigation link              | no specific claim                                                                                                                                                                                                  | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 真实实现把同样的步骤写成了带并行切分和量化的版本。对照 DeepSeek-V3 的参考实现（commit `9b4e9788`）：
- 超参的默认值在 `inference/model.py:20-94` 的 `ModelArgs` 里：`dim=2048`、`n_heads=16`、`n_layers=27`、`inter_dim=10944`。注意这是**参考脚本的 dataclass 默认值**，不是已发布权重的配置；真实模型的尺寸要读对应权重目录里的配置文件。

## src/content/posts/deepseek/01-attention/index.mdx

| 原来源条目（逐字）                                                                                                                                       | 类型            | 正文依赖位置                                                                                                                    | 计划动作                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) §3.2.1（缩放点积注意力）、§3.2.2（多头）                                                   | paper           | “多头：同时问几个问题：### 多头：同时问几个问题”                                                                                | cite at the claim; definition at end                        |
| [DeepSeek-V3 参考实现 `model.py`](https://github.com/deepseek-ai/DeepSeek-V3/blob/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py#L479-L492) | other remark    | “真实实现在哪：DeepSeek-V3 参考实现（commit `9b4e9788`）里没有「朴素注意力」这个类——它直接是 MLA。可以对照的是同样四步的位置：” | cite at the claim; definition at end                        |
| 下一篇：[02 · KV Cache：缓存什么、要多大](../02-kv-cache/)——消掉重复计算，然后算一笔显存账。                                                             | navigation link | no specific claim                                                                                                               | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 四步合起来写成矩阵形式，就是你在论文里看到的那一行：
- DeepSeek-V3 参考实现（commit `9b4e9788`）里没有「朴素注意力」这个类——它直接是 MLA。可以对照的是同样四步的位置：

## src/content/posts/deepseek/02-kv-cache/index.mdx

| 原来源条目（逐字）                                                                                                                                                                   | 类型            | 正文依赖位置                                                                                                                                         | 计划动作                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DeepSeek-V3 参考实现 `model.py`](https://github.com/deepseek-ai/DeepSeek-V3/blob/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py#L439-L444)（缓存 buffer 的声明与写入） | other remark    | “真实实现在哪：DeepSeek-V3 参考实现（commit `9b4e9788`）把缓存声明为固定大小的 buffer，按位置切片写入——不是 Python list：”                           | cite at the claim; definition at end                        |
| [vLLM PagedAttention 论文](https://arxiv.org/abs/2309.06180)（缓存的空间管理，本系列不展开）                                                                                         | paper           | “真实实现在哪：\| absorb 分支缓存 \| `model.py:442-444` \| `kv_cache: (max_batch, max_seq_len, kv_lora_rank)`、`pe_cache: (…, qk_rope_head_dim)` \|” | keep as general reading                                     |
| 下一篇：[03 · MQA 与 GQA：第一次妥协](../03-mqa-gqa/)——公式里的 $n_h$ 是第一个被动的因子。                                                                                           | navigation link | no specific claim                                                                                                                                    | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 接下来十几篇的工作，本质上都是在这个公式的某个因子上做手脚。下面的动画把四种缓存方案放在同一配置下对照。现在只看第一条（MHA），后面两篇会逐条解释其余三条怎么来的：
- title="图 02-2：同一配置下四种缓存方案的宽度（后三条是第 03、04 篇的内容）"
- DeepSeek-V3 参考实现（commit `9b4e9788`）把缓存声明为固定大小的 buffer，按位置切片写入——不是 Python list：

## src/content/posts/deepseek/03-mqa-gqa/index.mdx

| 原来源条目（逐字）                                                                                                           | 类型            | 正文依赖位置                                                                                                                    | 计划动作                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [GQA: Training Generalized Multi-Query Transformer Models](https://arxiv.org/abs/2305.13245)（GQA 的提出与 uptraining 方法） | paper           | “开头：读完你能回答：MQA 和 GQA 分别把 $n_h$ 变成了什么、为什么它们必然损失表达力、以及为什么这个损失正好是 MLA 想绕开的东西。” | cite at the claim; definition at end                        |
| [Fast Transformer Decoding: One Write-Head is All You Need](https://arxiv.org/abs/1911.02150)（MQA）                         | paper           | “开头：读完你能回答：MQA 和 GQA 分别把 $n_h$ 变成了什么、为什么它们必然损失表达力、以及为什么这个损失正好是 MLA 想绕开的东西。” | cite at the claim; definition at end                        |
| [DeepSeek-V2 §2.1](https://arxiv.org/html/2405.04434v5#S2.SS1)（把 MHA/GQA/MQA 与 MLA 放在同一张表里对照）                   | paper           | “开头：读完你能回答：MQA 和 GQA 分别把 $n_h$ 变成了什么、为什么它们必然损失表达力、以及为什么这个损失正好是 MLA 想绕开的东西。” | cite at the claim; definition at end                        |
| 下一篇：[04 · MLA：共享 latent](../04-mla/)——不再存 K 和 V，改存一个所有 head 共享的低维向量。                               | navigation link | no specific claim                                                                                                               | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 把这三条和 MLA 放在同一配置下对照（$n_h=8$，$d_k=d_v=128$，GQA 取 $g=2$）：
- DeepSeek-V3 的参考实现里**没有 GQA/MQA 分支**——它直接用 MLA。想读 GQA 的实现，vLLM 的注意力后端里有现成的对照（本地快照 commit `cf5cea2d`）：GQA 在 kernel 里通常不真的做 `repeat`，而是让多个 Query head 直接索引同一份 K/V，省掉那次显存复制。

## src/content/posts/deepseek/04-mla/index.mdx

| 原来源条目（逐字）                                                                                                                                       | 类型                         | 正文依赖位置                                                                                                                                                                    | 计划动作                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DeepSeek-V2 技术报告 §2.1.1–§2.1.4、Table 1](https://arxiv.org/html/2405.04434v5#S2.SS1)（MLA 的提出与缓存对照）                                        | paper                        | “开头：MLA（Multi-head Latent Attention）的做法是换掉被缓存的对象。一句话：**缓存一份所有 head 共享的低维向量，读取时再用每个 head 自己的矩阵把它展开成那个 head 的 K 和 V。**” | cite at the claim; definition at end                        |
| [DeepSeek-V3 技术报告](https://arxiv.org/abs/2412.19437)                                                                                                 | paper                        | no specific claim                                                                                                                                                               | keep as general reading                                     |
| [DeepSeek-V3 参考实现 `model.py`](https://github.com/deepseek-ai/DeepSeek-V3/blob/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py#L424-L497) | other remark                 | “真实配置下的账：DeepSeek-V3 671B 的配置（`inference/configs/config_671B.json`）：”                                                                                             | cite at the claim; definition at end                        |
| 配置数字来自本地快照 `reference/DeepSeek-V3/inference/configs/config_671B.json`（commit `9b4e978`）                                                      | source code at pinned commit | “开头：读完你能回答：MLA 和 MQA 共享的东西有什么本质不同、为什么「压缩」在这里不等于「有损」、以及 V3 真实配置下 71 倍的差距是怎么算出来的。”                                   | cite at the claim; definition at end                        |
| 下一篇：[05 · MLA 的两个技巧](../05-mla-absorb/)——解耦 RoPE 为什么必需，以及上投影的计算怎么被吸收掉。                                                   | navigation link              | no specific claim                                                                                                                                                               | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 读完你能回答：MLA 和 MQA 共享的东西有什么本质不同、为什么「压缩」在这里不等于「有损」、以及 V3 真实配置下 71 倍的差距是怎么算出来的。
- DeepSeek-V3 671B 的配置（`inference/configs/config_671B.json`）：
- 论文给的是元素数口径。DeepSeek-V2 技术报告 Table 1 把 MLA 写成 $(d_c + d_h^R)\,l \approx \tfrac{9}{2}d_h l$，并在表注里说明：
- 四种方案放在一起看（$n_h=8$ 的小配置，所以倍数不如 V3 那么夸张——倍数随 head 数增长）：
- DeepSeek-V3 参考实现（commit `9b4e9788`，`inference/model.py`）：

## src/content/posts/deepseek/05-mla-absorb/index.mdx

| 原来源条目（逐字）                                                                                                                                                         | 类型            | 正文依赖位置                                                                                                                                                                                                   | 计划动作                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DeepSeek-V2 技术报告 §2.1.3（解耦 RoPE）、附录 C](https://arxiv.org/html/2405.04434v5#S2.SS1)                                                                             | paper           | no specific claim                                                                                                                                                                                              | cite at the claim; definition at end                        |
| [RoFormer: Enhanced Transformer with Rotary Position Embedding](https://arxiv.org/abs/2104.09864)（RoPE 原文）                                                             | paper           | “开头：这两个问题的答案是耦合的：**正因为位置编码被单独拎出去，上投影的计算才可以被「吸收」掉。** 读完你能回答解耦 RoPE 到底在解耦什么、矩阵吸收为什么是恒等变形而不是近似、以及为什么 softmax 不能一起吸收。” | cite at the claim; definition at end                        |
| [YaRN: Efficient Context Window Extension](https://arxiv.org/abs/2309.00071)（V3 的频率修正所用方法）                                                                      | paper           | “吸收前后的计算顺序：mode="absorb"”                                                                                                                                                                            | cite at the claim; definition at end                        |
| [DeepSeek-V3 参考实现 `model.py`](https://github.com/deepseek-ai/DeepSeek-V3/blob/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py#L476-L495)（两条路径的对照） | other remark    | “真实实现在哪：DeepSeek-V3 参考实现（commit `9b4e9788`）把两条路径都写了出来，由 `attn_impl` 选择：”                                                                                                           | cite at the claim; definition at end                        |
| 下一篇：[06 · 稀疏注意力地图](../06-sparse-map/)——表示已经压到底了，下一刀砍在「要读哪些位置」上。                                                                         | navigation link | no specific claim                                                                                                                                                                                              | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- DeepSeek-V3 参考实现（commit `9b4e9788`）把两条路径都写了出来，由 `attn_impl` 选择：

## src/content/posts/deepseek/06-sparse-map/index.mdx

| 原来源条目（逐字）                                                                                                          | 类型                         | 正文依赖位置                                                                                                                                                  | 计划动作                                                    |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Longformer](https://arxiv.org/abs/2004.05150)、[BigBird](https://arxiv.org/abs/2007.14062)（窗口 + 全局 + 随机的早期组合） | paper                        | no specific claim                                                                                                                                             | keep as general reading                                     |
| [Efficient Streaming LM with Attention Sinks](https://arxiv.org/abs/2309.17453)（前缀锚点为什么必要）                       | paper                        | no specific claim                                                                                                                                             | keep as general reading                                     |
| [Native Sparse Attention (NSA)](https://arxiv.org/abs/2502.11089)（下一步要讲的三分支）                                     | paper                        | no specific claim                                                                                                                                             | keep as general reading                                     |
| 本站实现：`src/explainers/core/masks.ts`（掩码与三个指标，含单测）                                                          | source code at pinned commit | “统一接口：把读取集合写成一个函数，所有机制就能共用同一套代码、同一个动画、同一组指标。本站的定义在 `src/explainers/core/masks.ts`，文章与动画用的是同一份：” | cite at the claim; definition at end                        |
| 下一篇：[07 · SWA：滑动窗口](../07-swa/)——先把最简单的固定模式讲透，它是所有多分支机制的底座。                              | navigation link              | no specific claim                                                                                                                                             | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 这一篇不讲某个具体机制，而是搭一个坐标系：**所有稀疏注意力都在改「位置 $t$ 允许读哪些 $s$」，区别只在改法**。读完你能用三个指标分类任何一篇稀疏注意力论文，并预判它的代价落在哪里。

## src/content/posts/deepseek/07-swa/index.mdx

| 原来源条目（逐字）                                                                                                                      | 类型                         | 正文依赖位置                                                                                                                                                                                                                                             | 计划动作                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Longformer](https://arxiv.org/abs/2004.05150)（滑动窗口 + 全局注意力的早期系统化）                                                     | paper                        | “开头：滑动窗口（Sliding Window Attention）的规则一句话说完：**只读最近 $W$ 个位置**。它简单到可以手写，却是后面所有多分支机制的底座——NSA、CSA 里都有一条窗口分支。读完你能回答：窗口为什么能让每步代价封顶、它丢了什么、为什么几乎没有模型敢单独用它。” | keep as general reading                                     |
| [Mistral 7B](https://arxiv.org/abs/2310.06825)（窗口注意力与环形缓存的工程实现）                                                        | paper                        | no specific claim                                                                                                                                                                                                                                        | cite at the claim; definition at end                        |
| [Efficient Streaming Language Models with Attention Sinks](https://arxiv.org/abs/2309.17453)（StreamingLLM：sink token 现象与保留策略） | paper                        | “补救一：前缀锚点：mask="sink"”                                                                                                                                                                                                                          | cite at the claim; definition at end                        |
| 本站实现：`src/explainers/core/masks.ts` 的 `slidingWindow` / `windowWithSink` / `receptiveField`                                       | source code at pinned commit | “代码实现：## 代码实现”                                                                                                                                                                                                                                  | keep as general reading                                     |
| 下一篇：[08 · NSA](../08-nsa/)——窗口负责近处，另外两条分支负责把远处拉回来。                                                            | navigation link              | no specific claim                                                                                                                                                                                                                                        | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

无明显候选。

## src/content/posts/deepseek/08-nsa/index.mdx

| 原来源条目（逐字）                                                                                                                                                                      | 类型            | 正文依赖位置                                                                                                                                                                                                                         | 计划动作                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| [Native Sparse Attention](https://arxiv.org/abs/2502.11089) §3.2（门控融合）、§3.3.1（压缩）、§3.3.2（选块与打分复用）、§3.3.3（窗口）、§3.4（kernel 与 GQA 分组）、§5.2 表 4（访存量） | paper           | “开头：NSA（Native Sparse Attention）的回答是三条分支分工：**窗口管近处，压缩管全局概览，选块把真正相关的远处拉回来**。读完你能回答：三条分支各读什么、选块的打分从哪来（这是最漂亮的一步）、以及「原生可训练」为什么不是一句口号。” | cite at the claim; definition at end                        |
| 超参数来自论文 §4.1：$l=32$、$d=16$、$l'=64$、$n=16$、$w=512$                                                                                                                           | paper           | no specific claim                                                                                                                                                                                                                    | cite at the claim; definition at end                        |
| 下一篇：[09 · DSA](../09-dsa/)——如果不能白捡打分，就得把打分本身做得足够便宜。                                                                                                          | navigation link | no specific claim                                                                                                                                                                                                                    | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 论文先把三条分支写成同一个模板：每条分支把完整的 K/V 映射成一组更紧凑的 K/V，再各自算一遍注意力，最后按 gate 求和（§3.2 式 (5)）：
- 三条分支**各有自己的 K/V 投影**，不是共用一份。论文的理由是：共用会让局部分支「抄近路」，并造成梯度互相干扰（§3.3.3）。
- $\varphi$ 是一个**可学习的 MLP**（带块内位置编码），不是简单的平均池化。论文取 $l=32$、$d=16$——注意 $d<l$，相邻块有一半重叠，这是为了减轻「信息被块边界切碎」。
- 论文取 $l'=64$、$n=16$，其中有 **1 个起始块和 2 个局部块是固定激活的**（算在这 16 个里）。固定起始块就是第 07 篇的 attention sink，固定局部块保证当前位置附近一定被覆盖。
- 论文取 $w=512$。就是第 07 篇的滑动窗口，原封不动。
- 常见做法是：先按全注意力训练，推理时再加稀疏（事后稀疏化）。论文指出这有问题（§2.2）：
- 一处要诚实的地方：top-$n$ 的排序本身不可导。论文没有声称对离散 rank 做了梯度处理，可引用的准确表述是「稀疏结构参与端到端训练，参数与稀疏路径共同优化」——离散选择的梯度细节论文中未展开。
- 论文 §5.2 Table 4 按「decode 时要加载多少 KV」对照（单位是等效 token 数）：
- **这张表的「预期加速」是在「decode 受显存带宽限制」这个假设下由访存量推出的估算，不是端到端实测**。论文另外用 Triton kernel 实测了前向/反向：64k 时前向最多 9.0×、反向 6.0×（§5.1 图 6）。
- 1. 三条分支为什么不共用同一份 K/V？论文给的两个理由是什么？

## src/content/posts/deepseek/09-dsa/index.mdx

| 原来源条目（逐字）                                                                                                                                                                                                      | 类型            | 正文依赖位置                                                                                                                                                                                                     | 计划动作                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DeepSeek-V3.2](https://arxiv.org/abs/2512.02556) §2.1（DSA 与 Lightning Indexer，式 (1)–(2)）、§2.1.1（两阶段训练，式 (3)–(4)）、§2.3（复杂度与推理成本）、图 2（在 MLA 下实例化）、附录 A 图 7（MLA 的 MHA/MQA 模式） | paper           | “开头：DSA（DeepSeek Sparse Attention）的回答不是消除这个 $O(L^2)$，而是**让它的常数小到可以忽略**。读完你能回答：Lightning Indexer 便宜在哪三处、为什么稀疏作用在 latent 上、以及 indexer 是怎么被训练出来的。” | cite at the claim; definition at end                        |
| [NSA](https://arxiv.org/abs/2502.11089)（上一篇；两种打分策略的对照）                                                                                                                                                   | navigation link | no specific claim                                                                                                                                                                                                | keep because it carries series explanation                  |
| 下一篇：[10 · CSA](../10-csa/)——V4 把「先压缩，再在压缩条目上做 DSA」合成了一个机制。                                                                                                                                   | navigation link | no specific claim                                                                                                                                                                                                | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 论文的说法是：indexer 仍是 $O(L^2)$，但因为 head 数小且用 FP8，其计算量远小于 V3.1-Terminus 的 MLA（§2.3）。
- $k$ 的取值是固定的 **2048**（§2.1.1 稀疏训练阶段），不随上下文长度变化。在 128K 上下文下这意味着每个 query 只读约 1.6% 的历史（这个比例是由论文配置推算的，不是论文直接报告的指标）。
- 而且论文在 kernel 层采用 MLA 的 **MQA mode**：每个 latent 在一个 query token 的**所有 query head 之间共享**（§2.1）。于是 top-$k$ 选择也是所有 head 共用一套。
- indexer 要学会「预测主注意力会关注哪里」。论文分两阶段（§2.1.1）：
- 配置：learning rate $10^{-3}$，1000 步，每步 16 条 128K 序列，共 2.1B tokens。
- 配置：learning rate $7.3\times10^{-6}$，$k=2048$，15000 步，每步 480 条 128K 序列，共 943.7B tokens。
- 严格说这不是标准的 teacher-student 蒸馏，论文也没这么称呼它；准确的描述是「把稠密主注意力的聚合分布作为 KL 目标」。
- **① 衡量 indexer 挑得准不准。** 脚本按论文 §2.1.1 的 KL 目标真的把 indexer 训练了 400 步（梯度手写，因为 $\partial\,\mathbb{D}_{\mathrm{KL}}(p\|\mathrm{Softmax}(I))/\partial I = \mathrm{Softmax}(I) - p$，只有一行）。用「真实注意力权重的 top-k」当参考答案：

## src/content/posts/deepseek/10-csa/index.mdx

| 原来源条目（逐字）                                                                                                                                                                                                                             | 类型                          | 正文依赖位置                                                                                                                                                                                                                                   | 计划动作                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DeepSeek-V4](https://arxiv.org/abs/2606.19348) §2.3（CSA 与 HCA 总览）、§2.3.1（压缩与稀疏选择，式 (9)–(19)）、§2.3.3（窗口分支、RMSNorm、部分 RoPE、attention sink 式 (27)）、§2.3.4（混合精度 KV）、§4.2.1（超参数）、§1 与图 1（整体效率） | paper                         | “开头：CSA（Compressed Sparse Attention，DeepSeek-V4）的思路是把两件事叠起来：**先把序列压短 $m$ 倍，再在压短后的序列上做 DSA**。读完你能回答：两级省法为什么是相乘的、压缩为什么要做成重叠的、以及为什么压缩之后反而必须额外挂一条滑动窗口。” | cite at the claim; definition at end                        |
| 图 3「Core architectures of CSA」是论文中对应本篇机制的结构图                                                                                                                                                                                  | figure attribution or license | “先看一个例子：title="图 10-1：CSA 的两条分支——压缩后的稀疏主分支，加一条未压缩的窗口"”                                                                                                                                                        | keep as attribution                                         |
| 上一篇：[09 · DSA](../09-dsa/)（CSA 的稀疏部分就是 DSA）                                                                                                                                                                                       | navigation link               | no specific claim                                                                                                                                                                                                                              | drop because it is navigation already provided by the theme |
| 下一篇：[11 · HCA](../11-hca/)——同一篇论文里的另一种选择：压得更狠，但不做稀疏。                                                                                                                                                               | navigation link               | no specific claim                                                                                                                                                                                                                              | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 论文先从 hidden state $H\in\mathbb{R}^{n\times d}$ 产出两套 KV 和两套压缩权重（§2.3.1 式 (9)–(10)）：
- 因为 $c\,n_h$ 很大（$c=512$、$n_h$ 到 128），直接投影回 $d$ 维的输出矩阵会非常大。论文把 $n_h$ 个 head 分成 $g$ 组，每组从 $c(n_h/g)$ 维投到 $d_g$ 维，再把 $g\,d_g$ 维拼起来投回 $d$ 维（§2.3.1「Grouped Output Projection」）。这是纯粹的参数量控制。
- 所以 CSA 必须额外生成最近 $n_{\text{win}}$ 个 token 的**未压缩** KV，和压缩 KV 一起进入 core attention。论文取 $n_{\text{win}}=128$。
- 论文在 §2.3.3 还列了三件事，都值得注意：
- 这一步很妙：分母多了一项，**每个 head 的注意力权重之和可以小于 1，甚至接近 0**。回想第 07 篇说的——attention sink 现象的一种解释是「softmax 强制权重和为 1，用不掉的权重得有地方去」。V4 的做法是直接给它一个官方的泄洪口，而不是让它去挤占真实 token。
- 论文 §4.2.1 给出的配置：
- KV 存储用混合精度：**RoPE 的那 64 维用 BF16，其余维度用 FP8**，论文称相对纯 BF16 让 KV cache 几乎减半（§2.3.4）。

## src/content/posts/deepseek/11-hca/index.mdx

| 原来源条目（逐字）                                                                                                                    | 类型                          | 正文依赖位置                                                                                                                                                                       | 计划动作                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DeepSeek-V4](https://arxiv.org/abs/2606.19348) §2.3.2（HCA，式 (20)–(26)）、§2.3.3（窗口分支等共用组件）、§4.2.1（超参数与层级排布） | paper                         | “开头：V4 同时还有另一种注意力，配方正好相反：**重压缩 + 不做稀疏**。HCA（Heavily Compressed Attention）把每 $m'=128$ 个 token 压成一个条目，然后对**全部**压缩条目做密集注意力。” | cite at the claim; definition at end                        |
| 图 4「Core architectures of HCA」是论文中对应本篇机制的结构图                                                                         | figure attribution or license | “先看一个例子：title="图 11-1：HCA——压缩条目很少，所以可以全部读；窗口分支照旧补洞"”                                                                                               | keep as attribution                                         |
| 上一篇：[10 · CSA](../10-csa/)（另一种配方）                                                                                          | navigation link               | no specific claim                                                                                                                                                                  | drop because it is navigation already provided by the theme |
| 下一篇：[12 · 机制对照](../12-comparison/)——把 06–11 放回同一组输入上横向比较。                                                       | navigation link               | no specific claim                                                                                                                                                                  | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 为什么 HCA 不需要重叠？一个合理的理解是：重叠是为了减轻块边界把信息切碎，而 $m'=128$ 这么大的块里，边界效应相对块内信息量本来就小；而且 HCA 读**全部**条目，不像 CSA 那样可能因为选择而漏掉边界附近的块。论文没有直接解释这一点，这里只能作为对照观察，不是论文结论。
- 论文 §4.2.1 给出的（也只给出了这些）：
- **论文没有给出交错的精确周期、层号列表或 CSA:HCA 的数量比例**——只说了「interleaved」。想知道确切排布只能等开源实现，不能从论文推断。
- 为什么前两层特殊？论文没有解释。可以观察到的是：前两层离输入最近，此时 hidden state 还很「局部」，用纯 SWA（Flash）或纯 HCA（Pro）而不是带选择的 CSA，或许与此有关——但这是推测，不是论文结论。
- 2. HCA 的压缩为什么比 CSA 简单（少了哪两样东西）？本篇给的解释是论文结论还是观察？

## src/content/posts/deepseek/12-comparison/index.mdx

| 原来源条目（逐字）                                                                                                                                        | 类型            | 正文依赖位置      | 计划动作                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------- | ----------------------------------------------------------- |
| 本篇不引用新的论文结论；机制定义见 [07 · SWA](../07-swa/)、[08 · NSA](../08-nsa/)、[09 · DSA](../09-dsa/)、[10 · CSA](../10-csa/)、[11 · HCA](../11-hca/) | paper           | no specific claim | keep as general reading                                     |
| 形状指标的实现：`src/explainers/core/masks.ts`（含单测）                                                                                                  | other remark    | no specific claim | keep as general reading                                     |
| 下一篇：[13 · DeepSeekMoE](../13-moe/)——注意力这条线到此为止，接下来是参数大头 FFN。                                                                      | navigation link | no specific claim | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 这一节比结果本身更重要。**上面的数字不能用来给论文里的机制排名**，原因如下：
- 1. **压缩用的是均值池化，不是论文里可学习的压缩。** NSA 的 $\varphi$ 是带位置编码的 MLP，CSA/HCA 的压缩权重是 softmax 加权且**训练出来的**。均值池化是其中最差的一种特例。所以 **CSA 和 HCA 那两行是下界，系统性地低估了它们**——真实的压缩会保留块内的主导信号，而不是把它平均掉。
- 2. **这些机制是和模型一起训练的。** 表里把稀疏机制套在一个没有为它训练过的随机权重上，等于第 08 篇说的「事后稀疏化」。NSA 论文整节在论证这样做不公平。
- 5. 所有数字都来自本地 CPU 上的一次 toy 运行，不是任何论文的复现，也不涉及性能。
- **这个 harness 的正确用法**：理解「覆盖率」和「输出保真度」为什么会分离、看清每种机制的失败长什么样。要比较机制的真实能力，必须各自训练后在相同任务上评测——那是论文做的事。

## src/content/posts/deepseek/13-moe/index.mdx

| 原来源条目（逐字）                                                                                                                                       | 类型                         | 正文依赖位置                                                                                                                                                                           | 计划动作                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [DeepSeekMoE: Towards Ultimate Expert Specialization](https://arxiv.org/abs/2401.06066)（细粒度专家 + 共享专家）                                         | paper                        | “开头：读完你能回答：MoE 为什么能「参数多、计算少」、共享专家解决什么问题、以及 DeepSeek 为什么要用 bias 而不是辅助损失做负载均衡。”                                                   | cite at the claim; definition at end       |
| [DeepSeek-V3 技术报告](https://arxiv.org/abs/2412.19437)（无辅助损失负载均衡）                                                                           | paper                        | no specific claim                                                                                                                                                                      | cite at the claim; definition at end       |
| [DeepSeek-V3 参考实现 `model.py`](https://github.com/deepseek-ai/DeepSeek-V3/blob/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py#L535-L693) | other remark                 | “真实实现在哪：DeepSeek-V3 参考实现（commit `9b4e9788`，`inference/model.py`）：”                                                                                                      | cite at the claim; definition at end       |
| 配置来自本地快照 `reference/DeepSeek-V3/inference/configs/config_671B.json`（commit `9b4e978`）                                                          | source code at pinned commit | “分组：为什么还要限制组数：V3 的配置里有 `n_expert_groups` 和 `n_limited_groups`。专家分布在多台机器上，一个 token 如果打到很多个组，就要和很多台机器通信——**跨机通信比计算贵得多**。” | cite at the claim; definition at end       |
| 下一篇：[MTP 与推测解码](../11-mtp/)（尚未按本系列约定重写）——参数的问题解决了，但一次只出一个 token 还是太慢。                                          | navigation link              | no specific claim                                                                                                                                                                      | keep because it carries series explanation |

### 正文候选（本篇）

- V3 的配置里有 `n_expert_groups` 和 `n_limited_groups`。专家分布在多台机器上，一个 token 如果打到很多个组，就要和很多台机器通信——**跨机通信比计算贵得多**。
- DeepSeek-V3 参考实现（commit `9b4e9788`，`inference/model.py`）：
- 671B 的配置（`configs/config_671B.json`）：

## src/content/posts/deepseek/14-mtp/index.mdx

| 原来源条目（逐字）                                                                                                                                                                         | 类型                         | 正文依赖位置                                                                                                           | 计划动作                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DeepSeek-V3 技术报告](https://arxiv.org/abs/2412.19437) §2.2（MTP 模块与训练目标，式 (21)–(25)）、§4.2（$D=1$、$\lambda$ 的分阶段取值）、§4.5.1 表 4（消融）、§5.4.3（接受率与 1.8× TPS） | paper                        | “开头：读完你能回答：MTP 模块长什么样、它在训练和推理时扮演的两个完全不同的角色、以及为什么推测解码**不会改变输出**。” | cite at the claim; definition at end                        |
| [Better & Faster Large Language Models via Multi-token Prediction](https://arxiv.org/abs/2404.19737)（论文对比的并行预测做法）                                                             | paper                        | no specific claim                                                                                                      | cite at the claim; definition at end                        |
| `reference/DeepSeek-V3/README_WEIGHTS.md:6,13,55-56`（MTP 模块在权重里的组织，commit `9b4e978`）                                                                                           | source code at pinned commit | “代码实现：## 代码实现”                                                                                                | cite at the claim; definition at end                        |
| 上一篇：[13 · DeepSeekMoE](../13-moe/)                                                                                                                                                     | navigation link              | no specific claim                                                                                                      | drop because it is navigation already provided by the theme |
| 下一篇：[Engram](../12-engram/)（尚未按本系列约定重写）——在 MoE 之外再开一条稀疏的轴。                                                                                                     | navigation link              | no specific claim                                                                                                      | keep because it carries series explanation                  |

### 正文候选（本篇）

- 论文明确对比了另一种做法（Gloeckle et al.）：用 $D$ 个**独立的输出头并行**预测 $D$ 个未来 token。DeepSeek-V3 选择顺序预测，理由是**在每个预测深度保留完整的因果链**（§2.2、图 3）。
- 论文在 §2.2「MTP in Inference」明确说：推理时可以**直接丢弃** MTP 模块，主模型独立正常运行；也可以留着做推测解码。
- $p=0.85$ 时是 1.85，$p=0.90$ 时是 1.90。**和论文的 1.8× 对得上**——这说明那个 1.8× 基本就是「接受率直接转化成的前向效率」，没有额外的隐藏开销，也没有被低估。
- 注意论文只说了「various generation topics」，没有给出主题列表、采样参数或硬件条件。接受率依赖具体内容：代码和格式化文本通常好猜，开放式创作难猜。
- 3. MTP 在训练和推理时分别扮演什么角色？论文的消融实验（表 4）为什么能说明它改善的是**主模型本身**？

## src/content/posts/deepseek/15-engram/index.mdx

| 原来源条目（逐字）                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 类型                          | 正文依赖位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 计划动作                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 论文：[Conditional Memory via Scalable Lookup](https://arxiv.org/abs/2601.07372)（arXiv 2601.07372，DeepSeek-AI 与北大，2026-01）。§2.1–2.4（模块结构与式 (1)–(6)）、§2.5（Zipf、All-to-All、预取）、§3.1–3.2（U 型分配与幂律，式 (7)）、§4.1–4.2 表 1（27B 对照）、§5.1–5.2 表 2（长上下文）、§6.1–6.5（LogitLens/CKA、层消融、敏感性、系统实测、门控可视化）、附录 A 表 5（超参）与附录 C（tokenizer 压缩）。代码仓库 [deepseek-ai/Engram](https://github.com/deepseek-ai/Engram)。 | paper                         | “开头：Engram（[Conditional Memory via Scalable Lookup](https://arxiv.org/abs/2601.07372)，DeepSeek，2026-01）问的是另一个问题：**有没有一类知识，根本不需要「计算」，只需要「查」？**”                                                                                                                                                                                                                                                                                                | cite at the claim; definition at end                        |
| 图 15-1、15-4–15-8 取自论文图 1、7、3、4、5、2（[HTML 版](https://arxiv.org/html/2601.07372v1)）；论文采用 CC BY 4.0 许可，图表保留原始出处标注。                                                                                                                                                                                                                                                                                                                                     | figure attribution or license | “机制：整体结构如图 15-1（论文图 1）：Engram 作为旁路模块部署在个别层上，取回的静态记忆经门控融合到动态 hidden state，输入 embedding 与输出 un-embedding 保持原样。”                                                                                                                                                                                                                                                                                                                   | keep as attribution                                         |
| vLLM（commit `2173d712`）：`vllm/models/deepseek_v41/common/engram.py`（全部模块）、`nvidia/model.py`（335-347 构造、568-584 注入点、1000-1043 哈希入口）、`nvidia/ops/engram_host_table.py`（host-NUMA cuMem）、`nvidia/ops/engram_peer.py`（对称内存 peer 交换）、`nvidia/specialized_decode/engram/prefetch.py`（解码预取）、`vllm/config/engram.py`（EngramConfig）。                                                                                                             | source code at pinned commit  | “vLLM 里的 Engram 实现：配置分两层：checkpoint 的 `config.json` 带 `engram_layer_ids`、`engram_num_embeddings`、`engram_max_ngram_size`、`engram_n_heads`、`engram_head_dim`、`engram_compressed_vocab_size` 等（`EngramLayout` 读取，engram.py:221-227）；引擎侧的 `--engram-config` 控制**存储**——`cpu_offload`（**默认 True**，表放 pinned 主机内存走 UVA）、`dp_shared_memory`（DP 副本共享一张主机表，默认自动开）、`embedding_across_dp`、`use_thp`（config/engram.py:37-62）。” | cite at the claim; definition at end                        |
| vllm-ascend（commit `c116bebb`）：`vllm_ascend/models/deepseek_v41/engram/`（common、hash_state、embedding、layer、parallel、npu、model_state）、`vllm_ascend/models/deepseek_v41/model.py`（1042-1624 初始化与重叠）、`vllm_ascend/ascend_config.py`（multistream_engram_overlap 与 dp_shared_memory 默认）、`vllm_ascend/worker/worker.py`（DP×PCP 组）、`vllm_ascend/patch/platform/patch_engram_config.py`。                                                                      | source code at pinned commit  | “vLLM 里的 Engram 实现：配置分两层：checkpoint 的 `config.json` 带 `engram_layer_ids`、`engram_num_embeddings`、`engram_max_ngram_size`、`engram_n_heads`、`engram_head_dim`、`engram_compressed_vocab_size` 等（`EngramLayout` 读取，engram.py:221-227）；引擎侧的 `--engram-config` 控制**存储**——`cpu_offload`（**默认 True**，表放 pinned 主机内存走 UVA）、`dp_shared_memory`（DP 副本共享一张主机表，默认自动开）、`embedding_across_dp`、`use_thp`（config/engram.py:37-62）。” | cite at the claim; definition at end                        |
| 图 15-2/15-3/15-11 的质数、乘数、中间哈希与行号按 vLLM 的哈希算法（质数桶 + 逐层种子乘数 + rolling 异或）对「张仲景」离线实算，示例表每桶 100003 行。                                                                                                                                                                                                                                                                                                                                 | other remark                  | “开头：读完你能回答：conditional memory 和 conditional computation 的区别、N-gram 哈希查表为什么是 $O(1)$ 且不增加 FLOPs、U 型曲线说明了什么。顺着理论往下，本篇还会读 vLLM 的实现（`vllm/models/deepseek_v41/common/engram.py`，commit `2173d712`）——Engram 部署在 V4.1 的哪些层、哈希与门控 kernel 如何实现、百亿参数的表如何驻留主机内存；最后对照 vllm-ascend（commit `c116bebb`）在 NPU 上改了哪些地方。”                                                                         | cite at the claim; definition at end                        |
| 上一篇：[14 · MTP 与推测解码](../14-mtp/)                                                                                                                                                                                                                                                                                                                                                                                                                                             | navigation link               | no specific claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | drop because it is navigation already provided by the theme |
| 下一篇：[16 · mHC](../16-mhc/)——Engram 所注入的多分支残差流，正是下一篇的主角。                                                                                                                                                                                                                                                                                                                                                                                                       | navigation link               | no specific claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | keep because it carries series explanation                  |

### 正文候选（本篇）

- Engram（[Conditional Memory via Scalable Lookup](https://arxiv.org/abs/2601.07372)，DeepSeek，2026-01）问的是另一个问题：**有没有一类知识，根本不需要「计算」，只需要「查」？**
- 读完你能回答：conditional memory 和 conditional computation 的区别、N-gram 哈希查表为什么是 $O(1)$ 且不增加 FLOPs、U 型曲线说明了什么。顺着理论往下，本篇还会读 vLLM 的实现（`vllm/models/deepseek_v41/common/engram.py`，commit `2173d712`）——Engram 部署在 V4.1 的哪些层、哈希与门控 kernel 如何实现、百亿参数的表如何驻留主机内存；最后对照 vllm-ascend（commit `c116bebb`）在 NPU 上改了哪些地方。
- 但标准 Transformer 没有「表」这个东西，它只能把这类局部模式**用深度和计算重建出来**。论文的 Table 3 给了个实例：识别「Diana, Princess of Wales」这个实体，模型要用掉前 6 层——第 1–2 层只解析出「Wales」，第 4–5 层才是「Princess of Wales（不特指）」，到第 6 层才组合成黛安娜本人。这些层本可以省下来做更高级的推理。
- 整体结构如图 15-1（论文图 1）：Engram 作为旁路模块部署在个别层上，取回的静态记忆经门控融合到动态 hidden state，输入 embedding 与输出 un-embedding 保持原样。
- alt="论文图 1：Engram 模块结构——N-gram 哈希取回静态 embedding，与 hidden state 做缩放点积门控后加回残差流；模块仅部署在特定层"
- caption="图 15-1：Engram 架构总览（论文图 1）"
- 其中 $x_t$ 是位置 $t$ 的原始 token id；$\mathcal{P}$ 是把归一化后写法相同的 token 折到同一个 id 的投影；$x'_t$ 是折叠后的**压缩 id**；$g_{t,n}$ 是以 $t$ 结尾、长度为 $n$ 的**后缀 N-gram**，阶数 $n$ 取 $2$ 到 $N$（论文取 $N=3$）。
- 论文说 128k 的 tokenizer 经此压缩后有效词表减少 23.43%（§2.2、附录 C）。合并最多的是空白变体（163 个 token 折成一类）、大小写与变音符号（「A、a、á、ä、ą…」54 个折成「a」）。这一步是为了让「Beijing」「beijing」「BEIJING」命中同一行。
- 其中 $k\in\{1,\dots,K\}$ 是**哈希头**编号（论文取 $K=8$）；$\varphi_{n,k}$ 是第 $(n,k)$ 个确定性的 multiplicative-XOR 哈希；$z_{t,n,k}$ 是它算出的**行号**；$\mathbf{E}_{n,k}[z]$ 表示取表中第 $z$ 行的 embedding 向量；$\mathbf{e}_t$ 是把 $(N-1)\times K$ 共 16 行拼接后的**记忆向量**。
- 每个 $(n,k)$ 对应一张**质数大小**的表 $\mathbf{E}_{n,k}$。多头的作用是缓解哈希冲突：单个哈希撞了，其他头大概率没撞。（论文没有给出哈希的乘数与异或常数，也没解释表为什么取质数；图 15-2 左列给出了 vLLM 的初始化方式，桶构建细节见图 15-11。）
- **右栏是 decode 时逐 token 的执行**：压缩 id 组成 2/3-gram，rolling XOR 累乘得哈希，取模加偏移得 16 个行号。「张仲景」正是论文图 7 里高门控的例子，数值全部实算：
- 论文的主干不是单流残差，而是 mHC 多分支（$M=4$，膨胀率 4，§2.4）。Engram 的接法做了一个参数共享的折中：
- **表和 $\mathbf{W}\_V$ 全分支共享，$\mathbf{W}\_K^{(m)}$ 每分支一份**：$m\in\{1,\dots,M\}$ 是 mHC 分支编号，$\alpha_t^{(m)}$ 与 $\mathbf{u}_t^{(m)}$ 分别是第 $m$ 条分支的门控标量与门控值——4 个门各自决定这条记忆对第 $m$ 条残差分支是否有用，但取回的内容只有一份。论文还说这 $M+1$ 组投影可以拼成**一个稠密 FP8 GEMM**，对 GPU 友好；这个设计在 vLLM 里原样出现（一个 `wkv` 矩阵）。
- 论文图 7 将 Engram-27B 的门控标注回原文：英文里「Alexander the Great」「the Milky Way」「By the way」这类多词实体和固定搭配处显著激活，中文里「四大发明」「张仲景」这类成语与历史人名处显著激活。门控确实在「局部静态模式完成时」激活——这正是设计意图的直接证据。
- alt="论文图 7：门控 α 的可视化，深红表示强激活；实体与固定搭配处呈现强激活，如 Alexander the Great、Princess of Wales、四大发明、张仲景"
- caption="图 15-4：门控在实体与固定搭配处激活（论文图 7）"
- 论文把「MoE 和 Engram 各分多少」形式化成 Sparsity Allocation 问题（§3.1）。定义总参数 $P_{\rm tot}$、每 token 激活参数 $P_{\rm act}$（决定 FLOPs），稀疏预算是两者之差：
- $\rho=1$ 是纯 MoE。**固定 $P\_{\rm tot}$ 和 $P\_{\rm act}$**（也就是固定参数量和 FLOPs）扫描 $\rho$，validation loss 呈 **U 型**（图 15-5，论文图 3 左半）：纯 MoE 端 1.7248（10B 档，$C=6\times10^{20}$），$\rho\approx80\%$ 处最低 1.7109（$\Delta=0.0139$）；降到 $\rho\approx40\%$ 才退回纯 MoE 水平。最优点在 $\rho\approx75\%$–$80\%$ 且跨计算档位稳定——即**约 20%–25% 的稀疏预算给 Engram**。
- alt="论文图 3 左：两个计算档位下 loss 对分配比 ρ 都呈 U 型，纯 MoE 都不是最优；右：固定 3B 骨干只扫表槽数，loss 呈 log-linear 下降，且同预算下优于 OverEncoding"
- caption="图 15-5：稀疏分配的 U 型曲线与 Engram 自身的幂律（论文图 3）"
- Engram-27B 最反直觉的结果是**推理类任务的提升大于知识类任务**（BBH +5.0 > MMLU +3.0）。论文的解释（§6.1）是：查表替代了早期层的「特征拼装」，等效于把网络加深。
- alt="论文图 4：左，逐层 LogitLens KL 散度，Engram 在前几层就明显更低；右，CKA 相似度热图与对齐曲线，Engram 的浅层对齐 MoE 的深层"
- caption="图 15-6：Engram 加速预测收敛、等效加深（论文图 4）"
- alt="论文图 5：左，单模块插入层从 1 扫到 12，第 2 层最优、越深越差；右侧标记为各组件消融，多分支融合、门控与 tokenizer 压缩的损失最大"
- caption="图 15-7：层敏感性与组件消融（论文图 5）"
- 论文的主实验（§4.1–4.2，表 1）设计得很干净：30 层、hidden 2560、MLA + mHC 骨干，Muon 优化器，262B token，全部模型同数据同课程、激活参数严格一致。
- 将局部依赖委托给查表的另一个推论：**注意力容量得以专注于全局上下文**。长上下文扩展（YaRN 到 32k，表 2）里，同预训练 loss 的对照下 Engram-27B 的 Multi-Query NIAH 从 84.2 提升至 97.0、Variable Tracking 从 77.0 提升至 87.2；甚至只用 82% 预训练算力的 Engram-27B（41k 步）就能匹配基线的 LongPPL 并超过 RULER。论文据此强调：长上下文能力不只取决于注意力机制本身，还取决于骨干的注意力容量是否已被局部模式占用。
- alt="论文图 2：训练时表按 GPU 切片、All-to-All 收集行；推理时表 offload 至主机内存，利用确定性地址异步预取，与前面层的计算重叠"
- caption="图 15-8：训练的 All-to-All 与推理的预取重叠（论文图 2）"
- 论文的实测（§6.4，表 4，nano-vLLM 骨架、H800、512 条序列）：在 4B 稠密骨干的第 2 块处引入一个 **100B 参数**的 Engram 层、整表驻留主机 DRAM，吞吐 9031.6→8858.3 tok/s（−1.9%）；8B 骨干 6315.5→6140.0（−2.8%）。且这是**全部读取都经由 PCIe** 的保守设定——未利用 Zipf 缓存。论文据此主张「每步通信量正比于激活行数而非表大小」。
- DeepSeek-V4.1 把 Engram 带进了生产：vLLM 的 `vllm/models/deepseek_v41/` 下有一个 1891 行的 `common/engram.py`，NVIDIA 侧另有 `nvidia/ops/engram_host_table.py`（主机表）、`nvidia/ops/engram_peer.py`（peer 交换）和 `nvidia/specialized_decode/engram/prefetch.py`（解码预取）。以下行号均指本机 checkout（commit `2173d712`）。
- 配置分两层：checkpoint 的 `config.json` 带 `engram_layer_ids`、`engram_num_embeddings`、`engram_max_ngram_size`、`engram_n_heads`、`engram_head_dim`、`engram_compressed_vocab_size` 等（`EngramLayout` 读取，engram.py:221-227）；引擎侧的 `--engram-config` 控制**存储**——`cpu_offload`（**默认 True**，表放 pinned 主机内存走 UVA）、`dp_shared_memory`（DP 副本共享一张主机表，默认自动开）、`embedding_across_dp`、`use_thp`（config/engram.py:37-62）。
- 层号是 0 起的 **1 和 14**（model.py:1002 的注释；对应论文 1 起数的第 2、15 层）。构造时按 `layer_id in engram_layout.layer_ids` 决定（model.py:335-347）。
- 桶的分配（`EngramLayout.__init__`，engram.py:230-246）：每个 $(n,\text{head})$ 从 `engram_vocab_size−1` 起找一个**没用过的质数**作为桶大小，桶与桶用累加偏移隔开。论文的 226 万/桶（27B）与 724 万/桶（40B）就是这个数的两档。构建过程见图 15-11：
- 乘数（`compute_hash_multipliers`，engram.py:189-208）**按 (layer, lookback) 取随机奇数**，种子 `10007 × layer_id`——确定到所有 rank 一致，不用广播。注意一个实现细节：同阶的 8 个头**共用乘数、靠不同的质数桶区分**，与论文「K 个独立哈希头」的表述略有出入。
- **门控与论文的差别**。`_fused_engram_post_wkv_kernel`（1395-1421）把 RMSNorm、门控、残差相加全部融在一个 Triton kernel 里：
- 与式 (4) 相比有三处不同：点积先乘**每分支的逐维 `q_weight/k_weight`**（mHC 式 (6) 的门控强化）；两侧各自乘 RMS（等价于归一化点积）；**signed-sqrt 后才过 sigmoid**——注释说明这是与训练 kernel 对齐的，论文公式没有写这一步。更明显的差别是：**式 (5) 的卷积支路在 vLLM 中不存在**——在整个 `deepseek_v41` 目录中检索不到 engram 相关的 Conv/SiLU，输出即为 `hidden + gate·value`。发布的 V4.1 checkpoint 只保留了门控值支路（模型权重里也只有 `embed`、`wkv`、`q_weight`、`k_weight`）。
- vllm-ascend 没有复用上游的实现，而是自建了一个包 `vllm_ascend/models/deepseek_v41/engram/`（commit `c116bebb`）：`common.py`（门控数学与 Quarot 旋转）、`hash_state.py`（哈希状态）、`embedding.py`（表存储/查表/加载）、`layer.py`（`AscendEngram`）、`parallel.py`（EDP 交换）、`npu.py`（host 注册与 UVA 查表）、`model_state.py`（V2 runner 侧状态）。
- 3. 门控 $\alpha_t$ 解决什么问题？去掉它会怎样（想想「首席执行官」）？论文图 7 的可视化说明了什么？
- 6. 对照式 (4)：vLLM 的门控 kernel 多了哪三处？哪条论文里的支路在实现里整个不见了？

## src/content/posts/deepseek/16-mhc/index.mdx

| 原来源条目（逐字）                                                                                                                                                                                                                                                                                       | 类型            | 正文依赖位置                                                                                                                                                                                                                 | 计划动作                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [mHC: Manifold-Constrained Hyper-Connections](https://arxiv.org/abs/2512.24880) §1（式 (1)–(4)：标准残差、HC、展开式）、§3（式 (5)：HC 的系数参数化）、§4.1（式 (6)：Birkhoff polytope 与非扩张）、§4.2（式 (7)–(9)：参数化与 Sinkhorn-Knopp）、§4.3.1（kernel 融合与 I/O）、§3.2 表 2（I/O 与通信代价） | paper           | “先看一个例子：虚线那条就是麻烦的来源：标准残差里它是一个加号（系数恒为 1），这里变成了一个 $4\times4$ 的矩阵。”                                                                                                             | cite at the claim; definition at end                        |
| [DeepSeek-V4](https://arxiv.org/abs/2606.19348) §2.2（V4 中 $n_{\rm hc}=4$、$t_{\max}=20$）、§3.4.2（6.7% wall-time 开销）                                                                                                                                                                               | paper           | “开头：Hyper-Connections 的想法是把这一条流加宽成 $n$ 条。而 mHC（DeepSeek-V4 用的版本，$n=4$）要解决的是加宽之后冒出来的问题。读完你能回答：加宽为什么会破坏恒等映射、双随机矩阵为什么能修好它、以及这个修复的代价是什么。” | cite at the claim; definition at end                        |
| 上一篇：[15 · Engram](../15-engram/)                                                                                                                                                                                                                                                                     | navigation link | no specific claim                                                                                                                                                                                                            | drop because it is navigation already provided by the theme |
| 下一篇：[17 · DSpark](../17-dspark/)——草稿模块本身也可以重新设计。                                                                                                                                                                                                                                       | navigation link | no specific claim                                                                                                                                                                                                            | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 论文用一组 kernel 融合把这件事压下来（§4.3.1）：把除以 RMSNorm 范数的操作重排到矩阵乘之后、把两次扫描与反向矩阵乘融合、把 Sinkhorn 迭代放进单个 kernel（反向时在片上重算迭代而不是保存）。
- 最终论文报告 mHC 的 wall-time 开销约为 overlapped 1F1B pipeline stage 的 **6.7%**（V4 §3.4.2）。

## src/content/posts/deepseek/17-dspark/index.mdx

| 原来源条目（逐字）                                                                                                                                                                                                   | 类型            | 正文依赖位置                                                                                                                                                  | 计划动作                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DSpark](https://arxiv.org/abs/2607.05147) §2.1 式 (1)（延迟公式）、§3.1 式 (4)–(5)（半自回归草稿器与低秩 Markov head，$r=256$）、§3.2.1 式 (7)–(8)（置信度头与解析监督标签）、摘要（60%–85%，MTP-1 基线、吞吐匹配） | paper           | “开头：DSpark 给出的答案是三个，而且它们互相牵制。读完你能回答：延迟公式里的三个杠杆、「半自回归」是在平衡什么、以及为什么验证长度应该**每个请求各不相同**。” | cite at the claim; definition at end                        |
| 上一篇：[16 · mHC](../16-mhc/)                                                                                                                                                                                       | navigation link | no specific claim                                                                                                                                             | drop because it is navigation already provided by the theme |
| 下一篇：[18 · FlashAttention](../18-flash-attention/)——前面都在改算什么，最后一篇改怎么算。                                                                                                                          | navigation link | no specific claim                                                                                                                                             | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 论文把推测解码的每 token 延迟写成（§2.1 式 (1)）：
- 论文也给了 RNN head，但因为实现复杂度和部署性质，**默认用 Markov head**（§3.1）。

## src/content/posts/deepseek/18-flash-attention/index.mdx

| 原来源条目（逐字）                                                                                                                                                                                                                                              | 类型                         | 正文依赖位置                                                                                                                                                                                       | 计划动作                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [FlashAttention](https://arxiv.org/abs/2205.14135)（分块与在线 softmax 的原始工作）                                                                                                                                                                             | paper                        | “开头：回到第 01 篇那个朴素实现：它先算出完整的 $L\times L$ 分数矩阵，再 softmax，再乘 V。$L=4096$ 时这个矩阵有 1678 万个元素，要写进显存再读回来。**而注意力的算术量其实不大——时间花在搬运上。**” | cite at the claim; definition at end                        |
| [FlashAttention-4](https://arxiv.org/abs/2603.05451) §2.2（Blackwell 的单元失衡数字、TMEM、2-CTA）、§3.1.2（ping-pong pipeline）、§3.1.3 式 (4)–(5)（模拟指数，表 2 的误差）、§3.1.4 式 (6)（条件重缩放）、§3.2.3（2-CTA backward）、§5（benchmark 条件与结果） | paper                        | “开头：读完你能回答：在线 softmax 怎么做到不物化分数矩阵、为什么它在数学上是精确的、以及 FA-4 为什么要在 Blackwell 上用加法去模拟指数函数。”                                                       | cite at the claim; definition at end                        |
| 本站实现：`src/explainers/core/online-softmax.ts`（含单测，动画与文章共用）                                                                                                                                                                                     | source code at pinned commit | “先看一个例子：注意底部那三个盒子：无论序列多长，**内存里只有 $m$、$\ell$、$O$ 三个标量**（真实实现里 $O$ 是一个 $d$ 维向量）。朴素实现要存 $L$ 个分数，这里是 $O(1)$。”                           | cite at the claim; definition at end                        |
| 上一篇：[17 · DSpark](../17-dspark/)                                                                                                                                                                                                                            | navigation link              | no specific claim                                                                                                                                                                                  | drop because it is navigation already provided by the theme |
| 下一篇：[19 · 一次 decode 的全链路](../19-full-path/)——把 00–18 串成一条路径。                                                                                                                                                                                  | navigation link              | no specific claim                                                                                                                                                                                  | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 论文的 roofline（表 1）把这件事量化了：$M=N=d=128$ 的前向，MMA 要 1024 cycles，而 **exp 也要 1024 cycles**——指数运算和矩阵乘一样贵。
- 代价是精度：论文报告 **3 阶多项式在 99% 的输入上误差不超过 1 个 BF16 ULP**（表 2）。
- 最大值涨得不多时**跳过重缩放**，沿用旧的 $m_{j-1}$ 做指数直接累加。论文取 $\tau=\log_2(256)=8$（以 2 为底）。

## src/content/posts/deepseek/19-full-path/index.mdx

| 原来源条目（逐字）                                                      | 类型                         | 正文依赖位置                                                                                                            | 计划动作                                                    |
| ----------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 本篇是对第 00–18 篇的综合，不引入新的论文结论；各机制的出处见对应篇目   | paper                        | no specific claim                                                                                                       | keep as general reading                                     |
| 结构参数来自 `reference/DeepSeek-V3/inference/configs/config_671B.json` | source code at pinned commit | “一组可比较的数字：\| KV cache：MHA → MLA \| 每 token 每层元素数 \| 40960 → 576（**71.1×**） \| 第 04 篇，V3 config \|” | cite at the claim; definition at end                        |
| 上一篇：[18 · FlashAttention](../18-flash-attention/)                   | navigation link              | no specific claim                                                                                                       | drop because it is navigation already provided by the theme |
| 下一套笔记：[vLLM 图模式](../../vllm-graph/)                            | navigation link              | no specific claim                                                                                                       | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

无明显候选。

## src/content/posts/deepseek/20-ced/index.mdx

| 原来源条目（逐字）                                                                                                                                                                              | 类型            | 正文依赖位置                                                                                                                                                                       | 计划动作                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DeepSeek-V4.1-Flash](https://arxiv.org/abs/2609.19969) §2.2（CED 与式 (1)、prefill 复杂度）、§3.2.1（两层存储与 TTL）、§3.2.2（SWA Bounded Replay 与窗口截断）、§2.1 与图 1(b)（整体容量数字） | paper           | “开头：第 19 篇把 00–18 串完了，但那条链假设的是「一段 prompt，然后一路 decode」。**agent workflow 不是这样的**：每调用一次工具，就有一段新内容拼进上下文，然后又是一次 prefill。” | cite at the claim; definition at end                        |
| 上一篇：[19 · 一次 decode 的全链路](../19-full-path/)                                                                                                                                           | navigation link | no specific claim                                                                                                                                                                  | drop because it is navigation already provided by the theme |
| 下一篇：[21 · CSA2](../21-csa2/)——沿第三个维度压缩：层。                                                                                                                                        | navigation link | no specific claim                                                                                                                                                                  | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- > 本篇按 [DeepSeek-V4.1-Flash](https://arxiv.org/abs/2609.19969) 写。上一个阶段讲的 CSA/HCA 是 V4 的设计，**V4.1-Flash 用的是纯 CSA2**（下一篇），两者不要混。
- 论文给出的复杂度（$N\gg n_{\rm win}$）：
- 论文说这个近似重建对回答质量只有 negligible impact（§3.2.2），但**没有给出量化的质量对照**。
- 最后那段量化了这个近似的范围：**只有 replay 段开头的 $W-1$ 个位置看得比正常少**，再往后窗口就完整了。受影响的位置数是常数，不随上下文增长——这解释了为什么论文敢说影响 negligible。

## src/content/posts/deepseek/21-csa2/index.mdx

| 原来源条目（逐字）                                                                                                                                                                                                                                                                              | 类型            | 正文依赖位置                                                                                   | 计划动作                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [DeepSeek-V4.1-Flash](https://arxiv.org/abs/2609.19969) §2.1（纯 CSA2 概览）、§2.3（相对 CSA 的简化与三维压缩）、§2.3.1（Full / Reindex / Reuse 三种 mode）、§2.3.2 与图 5（Hierarchical Sparse Indexer）、§2.4.4（MXFP4 / E2M1 / E4M3 与动态范围）、摘要与图 1(b)（890 bytes/token、1/4、1/8） | paper           | “开头：**剩下两个都在这一篇**：层数和每个数占几个字节。CSA2 跨层共享 KV，FP4 量化压字节宽度。” | cite at the claim; definition at end                        |
| 上一篇：[20 · CED](../20-ced/)                                                                                                                                                                                                                                                                  | navigation link | no specific claim                                                                              | drop because it is navigation already provided by the theme |
| 回到 [系列首页](../)，或转向 [vLLM 图模式系列](../../vllm-graph/)                                                                                                                                                                                                                               | navigation link | no specific claim                                                                              | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 动画里默认的配置 `Full, Reindex, Reuse, Reuse, Full, Reindex, Reuse, Reuse` 就是这个取舍的体现：
- 第一条值得一提：第 10 篇讲过重叠是为了「减轻块边界把信息切碎」。CSA2 去掉它，说明在 V4.1 的配置下这个收益不足以抵消复杂度——**论文没有给出去掉重叠的消融对照**，这是我们无法核实的部分。
- 论文没有给出独立的百分比精度下降数字，只说 marginal / no measurable decrease。

## src/content/posts/vllm-graph/00-inference-overhead/index.mdx

| 原来源条目（逐字）                                                                                                          | 类型                         | 正文依赖位置            | 计划动作                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------- | ------------------------------------------ |
| [vLLM CUDA Graphs 设计文档](https://github.com/vllm-project/vllm/blob/main/docs/design/cuda_graphs.md)                      | official docs                | “代码实现：## 代码实现” | cite at the claim; definition at end       |
| [vLLM torch.compile 设计文档](https://github.com/vllm-project/vllm/blob/main/docs/design/torch_compile.md)                  | official docs                | “代码实现：## 代码实现” | cite at the claim; definition at end       |
| [PyTorch CUDA Graph 文档](https://docs.pytorch.org/docs/stable/notes/cuda.html#cuda-graphs)                                 | official docs                | “代码实现：## 代码实现” | cite at the claim; definition at end       |
| 源码行号按本地快照 `reference/vllm`（commit `cf5cea2d`）                                                                    | source code at pinned commit | “代码实现：## 代码实现” | cite at the claim; definition at end       |
| 下一篇：[编译图](../02-compile-graphs/)（尚未按本系列约定重写）——「一个算子被提交」之前，torch.compile 先决定了有哪些算子。 | navigation link              | no specific claim       | keep because it carries series explanation |

### 正文候选（本篇）

- vLLM 里对应的概念（本地快照 commit `cf5cea2d`）：

## src/content/posts/vllm-graph/01-pytorch-execution/index.mdx

| 原来源条目（逐字）                                                                                        | 类型            | 正文依赖位置                                                                                       | 计划动作                                                    |
| --------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [PyTorch CUDA semantics（异步执行与 stream）](https://docs.pytorch.org/docs/stable/notes/cuda.html)       | official docs   | “代码实现：## 代码实现”                                                                            | cite at the claim; definition at end                        |
| [PyTorch dispatcher 介绍](https://blog.ezyang.com/2020/09/lets-talk-about-the-pytorch-dispatcher/)        | other remark    | “这三层分别对应什么优化：\| Python 解释 + dispatcher 查表 \| **torch.compile**（编译图） \| 02 \|” | cite at the claim; definition at end                        |
| 上一篇：[00 · 一次 decode 提交了什么](../00-inference-overhead/)                                          | navigation link | no specific claim                                                                                  | drop because it is navigation already provided by the theme |
| 下一篇：[编译图](../02-compile-graphs/)（尚未按本系列约定重写）——torch.compile 怎么把一串算子变成一张图。 | navigation link | no specific claim                                                                                  | keep because it carries series explanation                  |

### 正文候选（本篇）

- | 官方异步语义说明 | [PyTorch CUDA semantics](https://docs.pytorch.org/docs/stable/notes/cuda.html) |
- | 官方 dispatcher 说明 | [Let's talk about the PyTorch dispatcher](https://blog.ezyang.com/2020/09/lets-talk-about-the-pytorch-dispatcher/) |

## src/content/posts/vllm-graph/02-compile-graphs/index.mdx

| 原来源条目（逐字）                                                                                                                                                                                                                                                                                        | 类型            | 正文依赖位置                                                                                            | 计划动作                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Dynamo Overview](https://docs.pytorch.org/docs/stable/user_guide/torch_compiler/torch.compiler_dynamo_overview.html)、[Dynamo Core Concepts](https://docs.pytorch.org/docs/stable/user_guide/torch_compiler/compile/programming_model.dynamo_core_concepts.html)（FX graph、guards、graph break 的定义） | official docs   | “guards：这张图什么时候还能用：\| `True` \| 一开始就尽量生成动态 kernel；官方不建议把它当作通用优化 \|” | cite at the claim; definition at end                        |
| [Common Graph Breaks](https://docs.pytorch.org/docs/main/user_guide/torch_compiler/compile/programming_model.common_graph_breaks.html)（官方的常见原因清单）                                                                                                                                              | official docs   | “guards：这张图什么时候还能用：\| `True` \| 一开始就尽量生成动态 kernel；官方不建议把它当作通用优化 \|” | cite at the claim; definition at end                        |
| [torch.compile API](https://docs.pytorch.org/docs/stable/generated/torch.compile.html)（`dynamic`、`mode`、`recompile_limit`）                                                                                                                                                                            | official docs   | “guards：这张图什么时候还能用：\| `True` \| 一开始就尽量生成动态 kernel；官方不建议把它当作通用优化 \|” | cite at the claim; definition at end                        |
| [Dynamic Shapes Core Concepts](https://docs.pytorch.org/docs/main/user_guide/torch_compiler/compile/dynamic_shapes_core_concepts.html)、[Dealing with Recompilations](https://docs.pytorch.org/docs/stable/user_guide/torch_compiler/compile/programming_model.recompilation.html)                        | official docs   | “guards：这张图什么时候还能用：\| `True` \| 一开始就尽量生成动态 kernel；官方不建议把它当作通用优化 \|” | cite at the claim; definition at end                        |
| 上一篇：[01 · PyTorch 是怎么执行的](../01-pytorch-execution/)                                                                                                                                                                                                                                             | navigation link | no specific claim                                                                                       | drop because it is navigation already provided by the theme |
| 下一篇：[03 · CUDA Graph](../03-cuda-graph/)（尚未按本系列约定重写）——把提交次数也降下来。                                                                                                                                                                                                                | navigation link | no specific claim                                                                                       | keep because it carries series explanation                  |

### 正文候选（本篇）

- 官方列出的常见原因：
- **`reduce-overhead` 就是「编译图 + 设备图一起上」。** 注意官方的限定：目前只保证 CUDA-only、且不修改输入的图。有两个 mode 名字里直接带 `cudagraphs`，正说明这两件事在实现上是可分开开关的。
- **编译图减少的是「有哪些算子」，设备图减少的是「提交几次」。** 这就是为什么 vLLM 的配置里 `CompilationMode` 和 `CUDAGraphMode` 是两个独立的枚举——它们真的是两件事。
- vLLM 的编译配置（本地快照 commit `cf5cea2d`）：

## src/content/posts/vllm-graph/03-cuda-graph/index.mdx

| 原来源条目（逐字）                                                                                                                                                         | 类型            | 正文依赖位置                                                                                                                                  | 计划动作                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [PyTorch CUDA semantics — CUDA Graphs](https://docs.pytorch.org/docs/stable/notes/cuda.html)（约束与非约束清单、图内存管理、跨捕获共享内存池）                             | official docs   | “开头：读完你能回答：capture / instantiate / replay 各做什么、为什么「固定地址」是整件事的核心约束、以及官方列出的那些约束背后是同一个原因。” | cite at the claim; definition at end                        |
| [torch.cuda.graph API](https://docs.pytorch.org/docs/stable/generated/torch.cuda.graph.html)（`capture_error_mode`）                                                       | official docs   | “开头：读完你能回答：capture / instantiate / replay 各做什么、为什么「固定地址」是整件事的核心约束、以及官方列出的那些约束背后是同一个原因。” | cite at the claim; definition at end                        |
| [CUDA Programming Guide — CUDA Graphs](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/cuda-graphs.html)（stream capture、instantiation、execution） | official docs   | “开头：读完你能回答：capture / instantiate / replay 各做什么、为什么「固定地址」是整件事的核心约束、以及官方列出的那些约束背后是同一个原因。” | cite at the claim; definition at end                        |
| 上一篇：[02 · torch.compile](../02-compile-graphs/)                                                                                                                        | navigation link | no specific claim                                                                                                                             | drop because it is navigation already provided by the theme |
| 下一篇：[边界](../04-boundaries/)（尚未按本系列约定重写）——动态 shape、通信、内存池、多流各自卡在哪一条约束上。                                                            | navigation link | no specific claim                                                                                                                             | keep because it carries series explanation                  |

### 正文候选（本篇）

- 读完你能回答：capture / instantiate / replay 各做什么、为什么「固定地址」是整件事的核心约束、以及官方列出的那些约束背后是同一个原因。
- 于是每次 replay 必须读写**相同的（虚拟）内存地址**——这是官方明确列出的约束。实际后果：
- vLLM 的封装（本地快照 commit `cf5cea2d`）：

## src/content/posts/vllm-graph/04-boundaries/index.mdx

| 原来源条目（逐字）                                                                                                             | 类型                         | 正文依赖位置                                                                                             | 计划动作                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [PyTorch CUDA semantics — Constraints](https://docs.pytorch.org/docs/stable/notes/cuda.html)（四条边界对应的官方约束）         | official docs                | “边界二：同步与数据依赖的控制流：3. **`torch.cond()`**：官方唯一允许在图内做 GPU 数据控制流的高阶算子。” | cite at the claim; definition at end                        |
| [vLLM CUDA Graphs 设计文档](https://github.com/vllm-project/vllm/blob/main/docs/design/cuda_graphs.md)（为什么排除 attention） | official docs                | “边界二：同步与数据依赖的控制流：3. **`torch.cond()`**：官方唯一允许在图内做 GPU 数据控制流的高阶算子。” | cite at the claim; definition at end                        |
| 源码行号按本地快照 `reference/vllm`（commit `cf5cea2d`）                                                                       | source code at pinned commit | “边界二：同步与数据依赖的控制流：3. **`torch.cond()`**：官方唯一允许在图内做 GPU 数据控制流的高阶算子。” | keep as snapshot note                                       |
| 上一篇：[03 · CUDA Graph](../03-cuda-graph/)                                                                                   | navigation link              | no specific claim                                                                                        | drop because it is navigation already provided by the theme |
| 下一篇：[vLLM 选路](../05-dispatch/)（尚未按本系列约定重写）——运行时怎么在这些约束里选出本轮该走哪条路。                       | navigation link              | no specific claim                                                                                        | keep because it carries series explanation                  |

### 正文候选（本篇）

- 3. **`torch.cond()`**：官方唯一允许在图内做 GPU 数据控制流的高阶算子。
- **结论：通信要不要进图，必须按具体部署验证，不能照搬别人的配置。** 这是本系列最该保守对待的一条。

## src/content/posts/vllm-graph/05-dispatch/index.mdx

| 原来源条目（逐字）                                                                                                                                                 | 类型                          | 正文依赖位置                                                                                                                                 | 计划动作                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 源码行号按本地快照 `reference/vllm`（commit `cf5cea2d`）                                                                                                           | source code at pinned commit  | “开头：读完你能照着源码说出完整的匹配条件、解释为什么有的条件是「容量 ≥」而有的必须「严格相等」、以及回退为什么是性能问题里最难发现的一类。” | cite at the claim; definition at end                        |
| [vLLM CUDA Graphs 设计文档](https://github.com/vllm-project/vllm/blob/main/docs/design/cuda_graphs.md)（最小可容纳桶的匹配、eager 回退、嵌套 wrapper 设计）        | official docs                 | “开头：读完你能照着源码说出完整的匹配条件、解释为什么有的条件是「容量 ≥」而有的必须「严格相等」、以及回退为什么是性能问题里最难发现的一类。” | cite at the claim; definition at end                        |
| **图 05-3、05-4 来自 vLLM 官方文档**：`docs/assets/design/cuda_graphs/current_design.png` 与 `wrapper_flow.png`，原样引用未作修改；vLLM 以 Apache License 2.0 发布 | figure attribution or license | “先看一个例子：<BucketDispatch client:visible title="图 05-1：逐个检查候选图的六项条件，命中第一个装得下的" />”                              | keep as attribution                                         |
| 上一篇：[04 · 四条边界](../04-boundaries/)                                                                                                                         | navigation link               | no specific claim                                                                                                                            | drop because it is navigation already provided by the theme |
| 下一篇：[无设备练习](../06-practice/)（尚未按本系列约定重写）——把这套匹配逻辑自己写一遍。                                                                          | navigation link               | no specific claim                                                                                                                            | keep because it carries series explanation                  |

### 正文候选（本篇）

- 读完你能照着源码说出完整的匹配条件、解释为什么有的条件是「容量 ≥」而有的必须「严格相等」、以及回退为什么是性能问题里最难发现的一类。
- 第 2 条还有一个细节值得注意：源码注释写着「a caller that does not track max_query_len must not match one that does」。也就是说，如果图声明了 query 长度上界，而调用方传的是 `None`（没跟踪），**不能匹配**——宁可保守回退，也不赌。
- ![vLLM 当前的 CUDA Graph 设计：dispatch 由 runtime_mode 加 BatchDescriptor 显式决定，FULL wrapper 包在整个模型外，PIECEWISE wrapper 包在每个编译片段上](./images/vllm-current-design.webp '图 05-3：vLLM 官方的 CUDA Graph 设计图（来自 vLLM docs/design/cuda_graphs.md）')
- 官方文档给的答案是**嵌套**：在整个模型外面包一个 `FULL` 模式的 wrapper，同时在编译出的每个片段里各包一个 `PIECEWISE` 模式的 wrapper。然后：
- 官方文档还给了一张 wrapper 内部的流程图：

## src/content/posts/vllm-graph/06-practice/index.mdx

| 原来源条目（逐字）                                                                                           | 类型                         | 正文依赖位置                                                                                       | 计划动作                                                    |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 匹配逻辑对照本地快照 `reference/vllm`（commit `cf5cea2d`）的 `vllm/v1/worker/gpu/cudagraph_utils.py:115-142` | source code at pinned commit | “为什么值得自己写一遍：读源码时很容易产生「我懂了」的错觉。但下面这些问题，不自己写一遍很难答对：” | cite at the claim; definition at end                        |
| 上一篇：[05 · vLLM 选路](../05-dispatch/)                                                                    | navigation link              | no specific claim                                                                                  | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 读源码时很容易产生「我懂了」的错觉。但下面这些问题，不自己写一遍很难答对：
- **陷阱**：第 2 条不是简单的 `>=`。源码注释写着「a caller that does not track max_query_len must not match one that does」——图有约束而调用方传 `None` 时，**不能匹配**。
- **陷阱**：是「第一个够大的」，不是「最接近的」，也不是「最大的」。所以候选的顺序会影响 padding——这正是源码把 decode 图插到队首的原因。
- 做完这六题，你已经能读懂 vLLM 里和图模式相关的大部分配置与日志了。剩下两篇：

## src/content/posts/vllm-graph/07-ascend/index.mdx

| 原来源条目（逐字）                                                                                                                                        | 类型                         | 正文依赖位置                                                                                                                                    | 计划动作                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `vllm_ascend/compilation/acl_graph.py:55-92`（`ACLGraphEntry` 在 55-63，`ACLGraphWrapper` 在 66 起；工作流与缓冲区说明见其 docstring；commit `28e9e97b`） | source code at pinned commit | “开头：> 本篇按本地快照 commit `28e9e97b` 的 vLLM-Ascend 代码写。**本机没有 NPU，也没有安装 CANN**，所有结论都来自静态源码阅读，没有运行验证。” | cite at the claim; definition at end                        |
| `vllm_ascend/platform.py:242-246`（`get_static_graph_wrapper_cls`；commit `28e9e97b`）                                                                    | source code at pinned commit | “开头：> 本篇按本地快照 commit `28e9e97b` 的 vLLM-Ascend 代码写。**本机没有 NPU，也没有安装 CANN**，所有结论都来自静态源码阅读，没有运行验证。” | cite at the claim; definition at end                        |
| `vllm_ascend/compilation/compiler_interface.py:199-263`（npugraph_ex → torchair 回退、编译缓存；commit `28e9e97b`）                                       | source code at pinned commit | “开头：> 本篇按本地快照 commit `28e9e97b` 的 vLLM-Ascend 代码写。**本机没有 NPU，也没有安装 CANN**，所有结论都来自静态源码阅读，没有运行验证。” | cite at the claim; definition at end                        |
| 行号按本地快照 `reference/vllm-ascend`（commit `28e9e97b`）、`reference/vllm`（commit `cf5cea2d`）                                                        | source code at pinned commit | “开头：> 本篇按本地快照 commit `28e9e97b` 的 vLLM-Ascend 代码写。**本机没有 NPU，也没有安装 CANN**，所有结论都来自静态源码阅读，没有运行验证。” | keep as snapshot note                                       |
| [vLLM-Ascend 仓库](https://github.com/vllm-project/vllm-ascend) · [Ascend CANN 文档](https://www.hiascend.com/document)                                   | official docs                | “开头：> 本篇按本地快照 commit `28e9e97b` 的 vLLM-Ascend 代码写。**本机没有 NPU，也没有安装 CANN**，所有结论都来自静态源码阅读，没有运行验证。” | keep as general reading                                     |
| 上一篇：[06 · 无设备练习](../06-practice/)                                                                                                                | navigation link              | no specific claim                                                                                                                               | drop because it is navigation already provided by the theme |
| 下一篇：[08 · 排错](../08-debugging/)——把前面七篇的判断串成一条排查路径。                                                                                 | navigation link              | no specific claim                                                                                                                               | keep because it carries series explanation                  |

### 正文候选（本篇）

- 这类细节说明一件事：**编译缓存不是全有或全无的**。如果你发现某些图每次启动都要重编译，可能不是配置问题，而是它命中了这类不可缓存的情形。

## src/content/posts/vllm-graph/08-debugging/index.mdx

| 原来源条目（逐字）                                                                                                                           | 类型                         | 正文依赖位置                                  | 计划动作                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| 日志与入口：`vllm/compilation/cuda_graph.py:272`、`vllm/v1/worker/gpu/model_runner.py:1132-1175`、`vllm_ascend/compilation/acl_graph.py:190` | source code at pinned commit | “§1 第一步：确认在走哪条路：对应的源码位置：” | cite at the claim; definition at end                        |
| 运行时统计：`vllm/v1/worker/gpu/cudagraph_utils.py:93-102`（`make_cudagraph_stats`）                                                         | source code at pinned commit | “§1 第一步：确认在走哪条路：对应的源码位置：” | cite at the claim; definition at end                        |
| 兼容条件：`vllm/v1/worker/gpu/cudagraph_utils.py:115-142`                                                                                    | source code at pinned commit | “§1 第一步：确认在走哪条路：对应的源码位置：” | cite at the claim; definition at end                        |
| 行号按本地快照 `reference/vllm`（`cf5cea2d`）与 `reference/vllm-ascend`（`28e9e97b`）                                                        | source code at pinned commit | “§1 第一步：确认在走哪条路：对应的源码位置：” | keep as snapshot note                                       |
| 上一篇：[07 · Ascend 图模式](../07-ascend/)                                                                                                  | navigation link              | no specific claim                             | drop because it is navigation already provided by the theme |
| 回到 [系列首页](../)                                                                                                                         | navigation link              | no specific claim                             | drop because it is navigation already provided by the theme |

### 正文候选（本篇）

- 对应的源码位置：

## 缺失元数据

以下条目已经从本地快照核实，并在上面的来源表补上 commit；路径与行号用 `git show <commit>:<path>` 检查过：

- `deepseek/04-mla`、`deepseek/13-moe`、`deepseek/19-full-path`：`reference/DeepSeek-V3/inference/configs/config_671B.json`，commit `9b4e978`。
- `deepseek/14-mtp`：`reference/DeepSeek-V3/README_WEIGHTS.md:6,13,55-56`，commit `9b4e978`。
- `vllm-graph/07-ascend`：`reference/vllm-ascend` commit `28e9e97b` 的三个路径与行号均存在。
- `vllm-graph/08-debugging`：`reference/vllm` commit `cf5cea2d` 与 `reference/vllm-ascend` commit `28e9e97b` 的具体路径与行号均存在。

以下条目仍缺少可从本工作区建立的版本信息，因此保留原状：

- `deepseek/06-sparse-map`、`deepseek/07-swa`、`deepseek/12-comparison`：`src/explainers/core/masks.ts` 是本站实现，没有 sibling snapshot。
- `deepseek/18-flash-attention`：`src/explainers/core/online-softmax.ts` 是本站实现，没有 sibling snapshot。
- `deepseek/15-engram`：图 15-2/15-3/15-11 的离线哈希计算没有可复核的外部快照；当前 `reference/vllm`（HEAD `7c35455`）也不含该 Engram 实现。

## 跨篇候选索引

以下是正文中带外部 inline link 或显式提及外部证据、但迁移前尚未有脚注的句子；仅记录供作者复核，不在本轮补造来源。

- `src/content/posts/deepseek/00-forward-pass/index.mdx:131` — 真实实现把同样的步骤写成了带并行切分和量化的版本。对照 DeepSeek-V3 的参考实现（commit `9b4e9788`）：
- `src/content/posts/deepseek/00-forward-pass/index.mdx:140` — 超参的默认值在 `inference/model.py:20-94` 的 `ModelArgs` 里：`dim=2048`、`n_heads=16`、`n_layers=27`、`inter_dim=10944`。注意这是**参考脚本的 dataclass 默认值**，不是已发布权重的配置；真实模型的尺寸要读对应权重目录里的配置文件。
- `src/content/posts/deepseek/01-attention/index.mdx:88` — 四步合起来写成矩阵形式，就是你在论文里看到的那一行：
- `src/content/posts/deepseek/01-attention/index.mdx:158` — DeepSeek-V3 参考实现（commit `9b4e9788`）里没有「朴素注意力」这个类——它直接是 MLA。可以对照的是同样四步的位置：
- `src/content/posts/deepseek/02-kv-cache/index.mdx:73` — 接下来十几篇的工作，本质上都是在这个公式的某个因子上做手脚。下面的动画把四种缓存方案放在同一配置下对照。现在只看第一条（MHA），后面两篇会逐条解释其余三条怎么来的：
- `src/content/posts/deepseek/02-kv-cache/index.mdx:162` — DeepSeek-V3 参考实现（commit `9b4e9788`）把缓存声明为固定大小的 buffer，按位置切片写入——不是 Python list：
- `src/content/posts/deepseek/03-mqa-gqa/index.mdx:63` — 把这三条和 MLA 放在同一配置下对照（$n_h=8$，$d_k=d_v=128$，GQA 取 $g=2$）：
- `src/content/posts/deepseek/03-mqa-gqa/index.mdx:181` — DeepSeek-V3 的参考实现里**没有 GQA/MQA 分支**——它直接用 MLA。想读 GQA 的实现，vLLM 的注意力后端里有现成的对照（本地快照 commit `cf5cea2d`）：GQA 在 kernel 里通常不真的做 `repeat`，而是让多个 Query head 直接索引同一份 K/V，省掉那次显存复制。
- `src/content/posts/deepseek/04-mla/index.mdx:95` — DeepSeek-V3 671B 的配置（`inference/configs/config_671B.json`）：
- `src/content/posts/deepseek/04-mla/index.mdx:129` — 论文给的是元素数口径。DeepSeek-V2 技术报告 Table 1 把 MLA 写成 $(d_c + d_h^R)\,l \approx \tfrac{9}{2}d_h l$，并在表注里说明：
- `src/content/posts/deepseek/04-mla/index.mdx:137` — 四种方案放在一起看（$n_h=8$ 的小配置，所以倍数不如 V3 那么夸张——倍数随 head 数增长）：
- `src/content/posts/deepseek/04-mla/index.mdx:203` — DeepSeek-V3 参考实现（commit `9b4e9788`，`inference/model.py`）：
- `src/content/posts/deepseek/05-mla-absorb/index.mdx:182` — DeepSeek-V3 参考实现（commit `9b4e9788`）把两条路径都写了出来，由 `attn_impl` 选择：
- `src/content/posts/deepseek/06-sparse-map/index.mdx:14` — 这一篇不讲某个具体机制，而是搭一个坐标系：**所有稀疏注意力都在改「位置 $t$ 允许读哪些 $s$」，区别只在改法**。读完你能用三个指标分类任何一篇稀疏注意力论文，并预判它的代价落在哪里。
- `src/content/posts/deepseek/08-nsa/index.mdx:27` — 论文先把三条分支写成同一个模板：每条分支把完整的 K/V 映射成一组更紧凑的 K/V，再各自算一遍注意力，最后按 gate 求和（§3.2 式 (5)）：
- `src/content/posts/deepseek/08-nsa/index.mdx:36` — 三条分支**各有自己的 K/V 投影**，不是共用一份。论文的理由是：共用会让局部分支「抄近路」，并造成梯度互相干扰（§3.3.3）。
- `src/content/posts/deepseek/08-nsa/index.mdx:46` — $\varphi$ 是一个**可学习的 MLP**（带块内位置编码），不是简单的平均池化。论文取 $l=32$、$d=16$——注意 $d<l$，相邻块有一半重叠，这是为了减轻「信息被块边界切碎」。
- `src/content/posts/deepseek/08-nsa/index.mdx:75` — 论文取 $l'=64$、$n=16$，其中有 **1 个起始块和 2 个局部块是固定激活的**（算在这 16 个里）。固定起始块就是第 07 篇的 attention sink，固定局部块保证当前位置附近一定被覆盖。
- `src/content/posts/deepseek/08-nsa/index.mdx:85` — 论文取 $w=512$。就是第 07 篇的滑动窗口，原封不动。
- `src/content/posts/deepseek/08-nsa/index.mdx:102` — 常见做法是：先按全注意力训练，推理时再加稀疏（事后稀疏化）。论文指出这有问题（§2.2）：
- `src/content/posts/deepseek/08-nsa/index.mdx:109` — 一处要诚实的地方：top-$n$ 的排序本身不可导。论文没有声称对离散 rank 做了梯度处理，可引用的准确表述是「稀疏结构参与端到端训练，参数与稀疏路径共同优化」——离散选择的梯度细节论文中未展开。
- `src/content/posts/deepseek/08-nsa/index.mdx:167` — 论文 §5.2 Table 4 按「decode 时要加载多少 KV」对照（单位是等效 token 数）：
- `src/content/posts/deepseek/08-nsa/index.mdx:178` — **这张表的「预期加速」是在「decode 受显存带宽限制」这个假设下由访存量推出的估算，不是端到端实测**。论文另外用 Triton kernel 实测了前向/反向：64k 时前向最多 9.0×、反向 6.0×（§5.1 图 6）。
- `src/content/posts/deepseek/09-dsa/index.mdx:67` — 论文的说法是：indexer 仍是 $O(L^2)$，但因为 head 数小且用 FP8，其计算量远小于 V3.1-Terminus 的 MLA（§2.3）。
- `src/content/posts/deepseek/09-dsa/index.mdx:71` — $k$ 的取值是固定的 **2048**（§2.1.1 稀疏训练阶段），不随上下文长度变化。在 128K 上下文下这意味着每个 query 只读约 1.6% 的历史（这个比例是由论文配置推算的，不是论文直接报告的指标）。
- `src/content/posts/deepseek/09-dsa/index.mdx:77` — 而且论文在 kernel 层采用 MLA 的 **MQA mode**：每个 latent 在一个 query token 的**所有 query head 之间共享**（§2.1）。于是 top-$k$ 选择也是所有 head 共用一套。
- `src/content/posts/deepseek/09-dsa/index.mdx:83` — indexer 要学会「预测主注意力会关注哪里」。论文分两阶段（§2.1.1）：
- `src/content/posts/deepseek/09-dsa/index.mdx:91` — 配置：learning rate $10^{-3}$，1000 步，每步 16 条 128K 序列，共 2.1B tokens。
- `src/content/posts/deepseek/09-dsa/index.mdx:99` — 配置：learning rate $7.3\times10^{-6}$，$k=2048$，15000 步，每步 480 条 128K 序列，共 943.7B tokens。
- `src/content/posts/deepseek/09-dsa/index.mdx:106` — 严格说这不是标准的 teacher-student 蒸馏，论文也没这么称呼它；准确的描述是「把稠密主注意力的聚合分布作为 KL 目标」。
- `src/content/posts/deepseek/09-dsa/index.mdx:129` — **① 衡量 indexer 挑得准不准。** 脚本按论文 §2.1.1 的 KL 目标真的把 indexer 训练了 400 步（梯度手写，因为 $\partial\,\mathbb{D}_{\mathrm{KL}}(p\|\mathrm{Softmax}(I))/\partial I = \mathrm{Softmax}(I) - p$，只有一行）。用「真实注意力权重的 top-k」当参考答案：
- `src/content/posts/deepseek/10-csa/index.mdx:52` — 论文先从 hidden state $H\in\mathbb{R}^{n\times d}$ 产出两套 KV 和两套压缩权重（§2.3.1 式 (9)–(10)）：
- `src/content/posts/deepseek/10-csa/index.mdx:111` — 因为 $c\,n_h$ 很大（$c=512$、$n_h$ 到 128），直接投影回 $d$ 维的输出矩阵会非常大。论文把 $n_h$ 个 head 分成 $g$ 组，每组从 $c(n_h/g)$ 维投到 $d_g$ 维，再把 $g\,d_g$ 维拼起来投回 $d$ 维（§2.3.1「Grouped Output Projection」）。这是纯粹的参数量控制。
- `src/content/posts/deepseek/10-csa/index.mdx:119` — 所以 CSA 必须额外生成最近 $n_{\text{win}}$ 个 token 的**未压缩** KV，和压缩 KV 一起进入 core attention。论文取 $n_{\text{win}}=128$。
- `src/content/posts/deepseek/10-csa/index.mdx:125` — 论文在 §2.3.3 还列了三件事，都值得注意：
- `src/content/posts/deepseek/10-csa/index.mdx:135` — 这一步很妙：分母多了一项，**每个 head 的注意力权重之和可以小于 1，甚至接近 0**。回想第 07 篇说的——attention sink 现象的一种解释是「softmax 强制权重和为 1，用不掉的权重得有地方去」。V4 的做法是直接给它一个官方的泄洪口，而不是让它去挤占真实 token。
- `src/content/posts/deepseek/10-csa/index.mdx:139` — 论文 §4.2.1 给出的配置：
- `src/content/posts/deepseek/10-csa/index.mdx:154` — KV 存储用混合精度：**RoPE 的那 64 维用 BF16，其余维度用 FP8**，论文称相对纯 BF16 让 KV cache 几乎减半（§2.3.4）。
- `src/content/posts/deepseek/11-hca/index.mdx:106` — 论文 §4.2.1 给出的（也只给出了这些）：
- `src/content/posts/deepseek/11-hca/index.mdx:122` — **论文没有给出交错的精确周期、层号列表或 CSA:HCA 的数量比例**——只说了「interleaved」。想知道确切排布只能等开源实现，不能从论文推断。
- `src/content/posts/deepseek/12-comparison/index.mdx:121` — 这一节比结果本身更重要。**上面的数字不能用来给论文里的机制排名**，原因如下：
- `src/content/posts/deepseek/12-comparison/index.mdx:123` — 1. **压缩用的是均值池化，不是论文里可学习的压缩。** NSA 的 $\varphi$ 是带位置编码的 MLP，CSA/HCA 的压缩权重是 softmax 加权且**训练出来的**。均值池化是其中最差的一种特例。所以 **CSA 和 HCA 那两行是下界，系统性地低估了它们**——真实的压缩会保留块内的主导信号，而不是把它平均掉。
- `src/content/posts/deepseek/12-comparison/index.mdx:124` — 2. **这些机制是和模型一起训练的。** 表里把稀疏机制套在一个没有为它训练过的随机权重上，等于第 08 篇说的「事后稀疏化」。NSA 论文整节在论证这样做不公平。
- `src/content/posts/deepseek/12-comparison/index.mdx:127` — 5. 所有数字都来自本地 CPU 上的一次 toy 运行，不是任何论文的复现，也不涉及性能。
- `src/content/posts/deepseek/12-comparison/index.mdx:129` — **这个 harness 的正确用法**：理解「覆盖率」和「输出保真度」为什么会分离、看清每种机制的失败长什么样。要比较机制的真实能力，必须各自训练后在相同任务上评测——那是论文做的事。
- `src/content/posts/deepseek/13-moe/index.mdx:71` — V3 的配置里有 `n_expert_groups` 和 `n_limited_groups`。专家分布在多台机器上，一个 token 如果打到很多个组，就要和很多台机器通信——**跨机通信比计算贵得多**。
- `src/content/posts/deepseek/13-moe/index.mdx:128` — DeepSeek-V3 参考实现（commit `9b4e9788`，`inference/model.py`）：
- `src/content/posts/deepseek/13-moe/index.mdx:145` — 671B 的配置（`configs/config_671B.json`）：
- `src/content/posts/deepseek/14-mtp/index.mdx:66` — 论文明确对比了另一种做法（Gloeckle et al.）：用 $D$ 个**独立的输出头并行**预测 $D$ 个未来 token。DeepSeek-V3 选择顺序预测，理由是**在每个预测深度保留完整的因果链**（§2.2、图 3）。
- `src/content/posts/deepseek/14-mtp/index.mdx:92` — 论文在 §2.2「MTP in Inference」明确说：推理时可以**直接丢弃** MTP 模块，主模型独立正常运行；也可以留着做推测解码。
- `src/content/posts/deepseek/14-mtp/index.mdx:108` — $p=0.85$ 时是 1.85，$p=0.90$ 时是 1.90。**和论文的 1.8× 对得上**——这说明那个 1.8× 基本就是「接受率直接转化成的前向效率」，没有额外的隐藏开销，也没有被低估。
- `src/content/posts/deepseek/14-mtp/index.mdx:110` — 注意论文只说了「various generation topics」，没有给出主题列表、采样参数或硬件条件。接受率依赖具体内容：代码和格式化文本通常好猜，开放式创作难猜。
- `src/content/posts/deepseek/15-engram/index.mdx:21` — 但标准 Transformer 没有「表」这个东西，它只能把这类局部模式**用深度和计算重建出来**。论文的 Table 3 给了个实例：识别「Diana, Princess of Wales」这个实体，模型要用掉前 6 层——第 1–2 层只解析出「Wales」，第 4–5 层才是「Princess of Wales（不特指）」，到第 6 层才组合成黛安娜本人。这些层本可以省下来做更高级的推理。
- `src/content/posts/deepseek/15-engram/index.mdx:39` — 整体结构如图 15-1（论文图 1）：Engram 作为旁路模块部署在个别层上，取回的静态记忆经门控融合到动态 hidden state，输入 embedding 与输出 un-embedding 保持原样。
- `src/content/posts/deepseek/15-engram/index.mdx:69` — 其中 $x_t$ 是位置 $t$ 的原始 token id；$\mathcal{P}$ 是把归一化后写法相同的 token 折到同一个 id 的投影；$x'_t$ 是折叠后的**压缩 id**；$g_{t,n}$ 是以 $t$ 结尾、长度为 $n$ 的**后缀 N-gram**，阶数 $n$ 取 $2$ 到 $N$（论文取 $N=3$）。
- `src/content/posts/deepseek/15-engram/index.mdx:71` — 论文说 128k 的 tokenizer 经此压缩后有效词表减少 23.43%（§2.2、附录 C）。合并最多的是空白变体（163 个 token 折成一类）、大小写与变音符号（「A、a、á、ä、ą…」54 个折成「a」）。这一步是为了让「Beijing」「beijing」「BEIJING」命中同一行。
- `src/content/posts/deepseek/15-engram/index.mdx:83` — 其中 $k\in\{1,\dots,K\}$ 是**哈希头**编号（论文取 $K=8$）；$\varphi_{n,k}$ 是第 $(n,k)$ 个确定性的 multiplicative-XOR 哈希；$z_{t,n,k}$ 是它算出的**行号**；$\mathbf{E}_{n,k}[z]$ 表示取表中第 $z$ 行的 embedding 向量；$\mathbf{e}_t$ 是把 $(N-1)\times K$ 共 16 行拼接后的**记忆向量**。
- `src/content/posts/deepseek/15-engram/index.mdx:85` — 每个 $(n,k)$ 对应一张**质数大小**的表 $\mathbf{E}_{n,k}$。多头的作用是缓解哈希冲突：单个哈希撞了，其他头大概率没撞。（论文没有给出哈希的乘数与异或常数，也没解释表为什么取质数；图 15-2 左列给出了 vLLM 的初始化方式，桶构建细节见图 15-11。）
- `src/content/posts/deepseek/15-engram/index.mdx:111` — **右栏是 decode 时逐 token 的执行**：压缩 id 组成 2/3-gram，rolling XOR 累乘得哈希，取模加偏移得 16 个行号。「张仲景」正是论文图 7 里高门控的例子，数值全部实算：
- `src/content/posts/deepseek/15-engram/index.mdx:121` — 论文的主干不是单流残差，而是 mHC 多分支（$M=4$，膨胀率 4，§2.4）。Engram 的接法做了一个参数共享的折中：
- `src/content/posts/deepseek/15-engram/index.mdx:129` — **表和 $\mathbf{W}\_V$ 全分支共享，$\mathbf{W}\_K^{(m)}$ 每分支一份**：$m\in\{1,\dots,M\}$ 是 mHC 分支编号，$\alpha_t^{(m)}$ 与 $\mathbf{u}_t^{(m)}$ 分别是第 $m$ 条分支的门控标量与门控值——4 个门各自决定这条记忆对第 $m$ 条残差分支是否有用，但取回的内容只有一份。论文还说这 $M+1$ 组投影可以拼成**一个稠密 FP8 GEMM**，对 GPU 友好；这个设计在 vLLM 里原样出现（一个 `wkv` 矩阵）。
- `src/content/posts/deepseek/15-engram/index.mdx:133` — 论文图 7 将 Engram-27B 的门控标注回原文：英文里「Alexander the Great」「the Milky Way」「By the way」这类多词实体和固定搭配处显著激活，中文里「四大发明」「张仲景」这类成语与历史人名处显著激活。门控确实在「局部静态模式完成时」激活——这正是设计意图的直接证据。
- `src/content/posts/deepseek/15-engram/index.mdx:143` — 论文把「MoE 和 Engram 各分多少」形式化成 Sparsity Allocation 问题（§3.1）。定义总参数 $P_{\rm tot}$、每 token 激活参数 $P_{\rm act}$（决定 FLOPs），稀疏预算是两者之差：
- `src/content/posts/deepseek/15-engram/index.mdx:155` — $\rho=1$ 是纯 MoE。**固定 $P\_{\rm tot}$ 和 $P\_{\rm act}$**（也就是固定参数量和 FLOPs）扫描 $\rho$，validation loss 呈 **U 型**（图 15-5，论文图 3 左半）：纯 MoE 端 1.7248（10B 档，$C=6\times10^{20}$），$\rho\approx80\%$ 处最低 1.7109（$\Delta=0.0139$）；降到 $\rho\approx40\%$ 才退回纯 MoE 水平。最优点在 $\rho\approx75\%$–$80\%$ 且跨计算档位稳定——即**约 20%–25% 的稀疏预算给 Engram**。
- `src/content/posts/deepseek/15-engram/index.mdx:175` — Engram-27B 最反直觉的结果是**推理类任务的提升大于知识类任务**（BBH +5.0 > MMLU +3.0）。论文的解释（§6.1）是：查表替代了早期层的「特征拼装」，等效于把网络加深。
- `src/content/posts/deepseek/15-engram/index.mdx:202` — 论文的主实验（§4.1–4.2，表 1）设计得很干净：30 层、hidden 2560、MLA + mHC 骨干，Muon 优化器，262B token，全部模型同数据同课程、激活参数严格一致。
- `src/content/posts/deepseek/15-engram/index.mdx:228` — 将局部依赖委托给查表的另一个推论：**注意力容量得以专注于全局上下文**。长上下文扩展（YaRN 到 32k，表 2）里，同预训练 loss 的对照下 Engram-27B 的 Multi-Query NIAH 从 84.2 提升至 97.0、Variable Tracking 从 77.0 提升至 87.2；甚至只用 82% 预训练算力的 Engram-27B（41k 步）就能匹配基线的 LongPPL 并超过 RULER。论文据此强调：长上下文能力不只取决于注意力机制本身，还取决于骨干的注意力容量是否已被局部模式占用。
- `src/content/posts/deepseek/15-engram/index.mdx:247` — 论文的实测（§6.4，表 4，nano-vLLM 骨架、H800、512 条序列）：在 4B 稠密骨干的第 2 块处引入一个 **100B 参数**的 Engram 层、整表驻留主机 DRAM，吞吐 9031.6→8858.3 tok/s（−1.9%）；8B 骨干 6315.5→6140.0（−2.8%）。且这是**全部读取都经由 PCIe** 的保守设定——未利用 Zipf 缓存。论文据此主张「每步通信量正比于激活行数而非表大小」。
- `src/content/posts/deepseek/15-engram/index.mdx:253` — DeepSeek-V4.1 把 Engram 带进了生产：vLLM 的 `vllm/models/deepseek_v41/` 下有一个 1891 行的 `common/engram.py`，NVIDIA 侧另有 `nvidia/ops/engram_host_table.py`（主机表）、`nvidia/ops/engram_peer.py`（peer 交换）和 `nvidia/specialized_decode/engram/prefetch.py`（解码预取）。以下行号均指本机 checkout（commit `2173d712`）。
- `src/content/posts/deepseek/15-engram/index.mdx:255` — 配置分两层：checkpoint 的 `config.json` 带 `engram_layer_ids`、`engram_num_embeddings`、`engram_max_ngram_size`、`engram_n_heads`、`engram_head_dim`、`engram_compressed_vocab_size` 等（`EngramLayout` 读取，engram.py:221-227）；引擎侧的 `--engram-config` 控制**存储**——`cpu_offload`（**默认 True**，表放 pinned 主机内存走 UVA）、`dp_shared_memory`（DP 副本共享一张主机表，默认自动开）、`embedding_across_dp`、`use_thp`（config/engram.py:37-62）。
- `src/content/posts/deepseek/15-engram/index.mdx:259` — 层号是 0 起的 **1 和 14**（model.py:1002 的注释；对应论文 1 起数的第 2、15 层）。构造时按 `layer_id in engram_layout.layer_ids` 决定（model.py:335-347）。
- `src/content/posts/deepseek/15-engram/index.mdx:352` — 桶的分配（`EngramLayout.__init__`，engram.py:230-246）：每个 $(n,\text{head})$ 从 `engram_vocab_size−1` 起找一个**没用过的质数**作为桶大小，桶与桶用累加偏移隔开。论文的 226 万/桶（27B）与 724 万/桶（40B）就是这个数的两档。构建过程见图 15-11：
- `src/content/posts/deepseek/15-engram/index.mdx:356` — 乘数（`compute_hash_multipliers`，engram.py:189-208）**按 (layer, lookback) 取随机奇数**，种子 `10007 × layer_id`——确定到所有 rank 一致，不用广播。注意一个实现细节：同阶的 8 个头**共用乘数、靠不同的质数桶区分**，与论文「K 个独立哈希头」的表述略有出入。
- `src/content/posts/deepseek/15-engram/index.mdx:410` — **门控与论文的差别**。`_fused_engram_post_wkv_kernel`（1395-1421）把 RMSNorm、门控、残差相加全部融在一个 Triton kernel 里：
- `src/content/posts/deepseek/15-engram/index.mdx:421` — 与式 (4) 相比有三处不同：点积先乘**每分支的逐维 `q_weight/k_weight`**（mHC 式 (6) 的门控强化）；两侧各自乘 RMS（等价于归一化点积）；**signed-sqrt 后才过 sigmoid**——注释说明这是与训练 kernel 对齐的，论文公式没有写这一步。更明显的差别是：**式 (5) 的卷积支路在 vLLM 中不存在**——在整个 `deepseek_v41` 目录中检索不到 engram 相关的 Conv/SiLU，输出即为 `hidden + gate·value`。发布的 V4.1 checkpoint 只保留了门控值支路（模型权重里也只有 `embed`、`wkv`、`q_weight`、`k_weight`）。
- `src/content/posts/deepseek/15-engram/index.mdx:443` — vllm-ascend 没有复用上游的实现，而是自建了一个包 `vllm_ascend/models/deepseek_v41/engram/`（commit `c116bebb`）：`common.py`（门控数学与 Quarot 旋转）、`hash_state.py`（哈希状态）、`embedding.py`（表存储/查表/加载）、`layer.py`（`AscendEngram`）、`parallel.py`（EDP 交换）、`npu.py`（host 注册与 UVA 查表）、`model_state.py`（V2 runner 侧状态）。
- `src/content/posts/deepseek/16-mhc/index.mdx:147` — 论文用一组 kernel 融合把这件事压下来（§4.3.1）：把除以 RMSNorm 范数的操作重排到矩阵乘之后、把两次扫描与反向矩阵乘融合、把 Sinkhorn 迭代放进单个 kernel（反向时在片上重算迭代而不是保存）。
- `src/content/posts/deepseek/16-mhc/index.mdx:157` — 最终论文报告 mHC 的 wall-time 开销约为 overlapped 1F1B pipeline stage 的 **6.7%**（V4 §3.4.2）。
- `src/content/posts/deepseek/17-dspark/index.mdx:11` — 论文把推测解码的每 token 延迟写成（§2.1 式 (1)）：
- `src/content/posts/deepseek/17-dspark/index.mdx:83` — 论文也给了 RNN head，但因为实现复杂度和部署性质，**默认用 Markov head**（§3.1）。
- `src/content/posts/deepseek/18-flash-attention/index.mdx:79` — 论文的 roofline（表 1）把这件事量化了：$M=N=d=128$ 的前向，MMA 要 1024 cycles，而 **exp 也要 1024 cycles**——指数运算和矩阵乘一样贵。
- `src/content/posts/deepseek/18-flash-attention/index.mdx:92` — 代价是精度：论文报告 **3 阶多项式在 99% 的输入上误差不超过 1 个 BF16 ULP**（表 2）。
- `src/content/posts/deepseek/18-flash-attention/index.mdx:109` — 最大值涨得不多时**跳过重缩放**，沿用旧的 $m_{j-1}$ 做指数直接累加。论文取 $\tau=\log_2(256)=8$（以 2 为底）。
- `src/content/posts/deepseek/20-ced/index.mdx:9` — > 本篇按 [DeepSeek-V4.1-Flash](https://arxiv.org/abs/2609.19969) 写。上一个阶段讲的 CSA/HCA 是 V4 的设计，**V4.1-Flash 用的是纯 CSA2**（下一篇），两者不要混。
- `src/content/posts/deepseek/20-ced/index.mdx:43` — 论文给出的复杂度（$N\gg n_{\rm win}$）：
- `src/content/posts/deepseek/20-ced/index.mdx:71` — 论文说这个近似重建对回答质量只有 negligible impact（§3.2.2），但**没有给出量化的质量对照**。
- `src/content/posts/deepseek/20-ced/index.mdx:132` — 最后那段量化了这个近似的范围：**只有 replay 段开头的 $W-1$ 个位置看得比正常少**，再往后窗口就完整了。受影响的位置数是常数，不随上下文增长——这解释了为什么论文敢说影响 negligible。
- `src/content/posts/deepseek/21-csa2/index.mdx:50` — 动画里默认的配置 `Full, Reindex, Reuse, Reuse, Full, Reindex, Reuse, Reuse` 就是这个取舍的体现：
- `src/content/posts/deepseek/21-csa2/index.mdx:70` — 第一条值得一提：第 10 篇讲过重叠是为了「减轻块边界把信息切碎」。CSA2 去掉它，说明在 V4.1 的配置下这个收益不足以抵消复杂度——**论文没有给出去掉重叠的消融对照**，这是我们无法核实的部分。
- `src/content/posts/deepseek/21-csa2/index.mdx:104` — 论文没有给出独立的百分比精度下降数字，只说 marginal / no measurable decrease。
- `src/content/posts/vllm-graph/00-inference-overhead/index.mdx:129` — vLLM 里对应的概念（本地快照 commit `cf5cea2d`）：
- `src/content/posts/vllm-graph/01-pytorch-execution/index.mdx:165` — | 官方异步语义说明 | [PyTorch CUDA semantics](https://docs.pytorch.org/docs/stable/notes/cuda.html) |
- `src/content/posts/vllm-graph/01-pytorch-execution/index.mdx:166` — | 官方 dispatcher 说明 | [Let's talk about the PyTorch dispatcher](https://blog.ezyang.com/2020/09/lets-talk-about-the-pytorch-dispatcher/) |
- `src/content/posts/vllm-graph/02-compile-graphs/index.mdx:73` — 官方列出的常见原因：
- `src/content/posts/vllm-graph/02-compile-graphs/index.mdx:106` — **`reduce-overhead` 就是「编译图 + 设备图一起上」。** 注意官方的限定：目前只保证 CUDA-only、且不修改输入的图。有两个 mode 名字里直接带 `cudagraphs`，正说明这两件事在实现上是可分开开关的。
- `src/content/posts/vllm-graph/02-compile-graphs/index.mdx:147` — **编译图减少的是「有哪些算子」，设备图减少的是「提交几次」。** 这就是为什么 vLLM 的配置里 `CompilationMode` 和 `CUDAGraphMode` 是两个独立的枚举——它们真的是两件事。
- `src/content/posts/vllm-graph/02-compile-graphs/index.mdx:209` — vLLM 的编译配置（本地快照 commit `cf5cea2d`）：
- `src/content/posts/vllm-graph/03-cuda-graph/index.mdx:73` — 于是每次 replay 必须读写**相同的（虚拟）内存地址**——这是官方明确列出的约束。实际后果：
- `src/content/posts/vllm-graph/03-cuda-graph/index.mdx:193` — vLLM 的封装（本地快照 commit `cf5cea2d`）：
- `src/content/posts/vllm-graph/04-boundaries/index.mdx:71` — 3. **`torch.cond()`**：官方唯一允许在图内做 GPU 数据控制流的高阶算子。
- `src/content/posts/vllm-graph/04-boundaries/index.mdx:91` — **结论：通信要不要进图，必须按具体部署验证，不能照搬别人的配置。** 这是本系列最该保守对待的一条。
- `src/content/posts/vllm-graph/05-dispatch/index.mdx:7` — 读完你能照着源码说出完整的匹配条件、解释为什么有的条件是「容量 ≥」而有的必须「严格相等」、以及回退为什么是性能问题里最难发现的一类。
- `src/content/posts/vllm-graph/05-dispatch/index.mdx:81` — 第 2 条还有一个细节值得注意：源码注释写着「a caller that does not track max_query_len must not match one that does」。也就是说，如果图声明了 query 长度上界，而调用方传的是 `None`（没跟踪），**不能匹配**——宁可保守回退，也不赌。
- `src/content/posts/vllm-graph/05-dispatch/index.mdx:134` — ![vLLM 当前的 CUDA Graph 设计：dispatch 由 runtime_mode 加 BatchDescriptor 显式决定，FULL wrapper 包在整个模型外，PIECEWISE wrapper 包在每个编译片段上](./images/vllm-current-design.webp '图 05-3：vLLM 官方的 CUDA Graph 设计图（来自 vLLM docs/design/cuda_graphs.md）')
- `src/content/posts/vllm-graph/05-dispatch/index.mdx:146` — 官方文档给的答案是**嵌套**：在整个模型外面包一个 `FULL` 模式的 wrapper，同时在编译出的每个片段里各包一个 `PIECEWISE` 模式的 wrapper。然后：
- `src/content/posts/vllm-graph/05-dispatch/index.mdx:156` — 官方文档还给了一张 wrapper 内部的流程图：
- `src/content/posts/vllm-graph/06-practice/index.mdx:41` — **陷阱**：第 2 条不是简单的 `>=`。源码注释写着「a caller that does not track max_query_len must not match one that does」——图有约束而调用方传 `None` 时，**不能匹配**。
- `src/content/posts/vllm-graph/06-practice/index.mdx:51` — **陷阱**：是「第一个够大的」，不是「最接近的」，也不是「最大的」。所以候选的顺序会影响 padding——这正是源码把 decode 图插到队首的原因。
- `src/content/posts/vllm-graph/07-ascend/index.mdx:124` — 这类细节说明一件事：**编译缓存不是全有或全无的**。如果你发现某些图每次启动都要重编译，可能不是配置问题，而是它命中了这类不可缓存的情形。
- `src/content/posts/vllm-graph/08-debugging/index.mdx:29` — 对应的源码位置：
