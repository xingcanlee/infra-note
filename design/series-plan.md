# 系列重写规划

本文是 `note` 下全部系列文章的重写蓝图。约定见 `design/writing-guide.md`，动画积木见 `design/explainer-kit.md`。

## 共用 toy 输入

两个系列共用一组小输入，使读者能横向对照：

- 序列：`["我", "在", "读", "注意力"]`，$L=4$
- 维度：$d=8$，$n_h=2$，$d_k=d_v=4$；压缩维 $d_c=3$，位置分支 $d_r=2$
- MoE：4 个路由专家 + 1 个共享专家，top-2
- 图模式：batch 候选桶 `[1, 2, 4, 8]`，实际 batch 3 → padding 到 4

所有数值例子优先用这组参数；需要更大规模时在文中写明换成了什么。

---

## 系列一：DeepSeek —— 从一次注意力到一个推理系统

原 17 篇按「论文一篇一文」排列，缺少零基础入口，且 kernel 与长上下文主题被排在末尾、与前面的稀疏注意力脱节。重排为 6 个阶段、20 篇，每阶段结束时读者手里都有一个能跑的 toy 实现。

### 阶段 0 · 坐标系（新增入口）

| 篇  | 标题                       | 交接点 / 解决的问题                                     | 主视图                 | 代码                      |
| --- | -------------------------- | ------------------------------------------------------- | ---------------------- | ------------------------- |
| 00  | 从一个 token 到一次前向    | 零基础入口：张量、矩阵乘、一层 Transformer 到底算了什么 | MatMul 动画 + 层结构图 | NumPy 单层前向            |
| 01  | 注意力从零推一遍           | 为什么要加权求和历史；因果掩码；softmax 的作用          | Attention 动画         | NumPy attention，逐步打印 |
| 02  | KV Cache：缓存什么、要多大 | decode 为什么重复计算；缓存的显存账本怎么算             | KV Cache 动画 + 账本图 | 带/不带 cache 的对照实现  |

阶段结束读者能回答：一次 decode 读了哪些数据，缓存大小的公式是什么。

### 阶段 1 · 压缩表示（在 head 维度上省）

| 篇  | 标题                   | 交接点                                       | 主视图                   | 代码                       |
| --- | ---------------------- | -------------------------------------------- | ------------------------ | -------------------------- |
| 03  | MQA 与 GQA：第一次妥协 | 02 的账本太大 → 让多个 Query head 共享 K/V   | 缓存宽度对照动画         | 三种共享方式的 toy 实现    |
| 04  | MLA：共享 latent       | GQA 牺牲了表达力 → 能不能压缩而不是共享      | MLA 数据流图（原 02 图） | V3 `model.py` 对照 + toy   |
| 05  | MLA 的两个技巧         | 解耦 RoPE 为什么必要；矩阵吸收把计算搬到哪里 | 矩阵吸收重排动画         | naive vs absorb 等价性验证 |

### 阶段 2 · 改变读取集合（在序列维度上省）

| 篇  | 标题                       | 交接点                                        | 主视图           | 代码                    |
| --- | -------------------------- | --------------------------------------------- | ---------------- | ----------------------- |
| 06  | 稀疏注意力地图             | 表示压完了 → 下一刀砍在「读哪些位置」上       | 掩码形状图谱动画 | mask 生成器（统一接口） |
| 07  | SWA：滑动窗口              | 最简单的固定模式                              | 窗口滑动动画     | 窗口 mask + 感受野计算  |
| 08  | NSA：压缩 + 选块 + 窗口    | 固定模式会漏掉远处的关键信息 → 可训练的三分支 | 三分支数据流图   | 三分支 toy 实现         |
| 09  | DSA：Lightning Indexer     | 选块的打分本身也要便宜                        | indexer 打分动画 | indexer + 稀疏 MLA toy  |
| 10  | CSA 与 CSA2：条件稀疏      | 把两篇原文合并，讲清两代的差异                | 对照结构图       | 两代实现差异对照        |
| 11  | HCA 与 CED：跨层与分层缓存 | 省到层与层之间                                | 层间缓存复用图   | 跨层缓存 toy            |
| 12  | 机制对照与 toy 验证        | 把 06–11 放回同一组输入上比较                 | 对照矩阵动画     | 统一 harness 跑全部机制 |

### 阶段 3 · 模型骨架

| 篇  | 标题           | 交接点                         | 主视图                 | 代码                          |
| --- | -------------- | ------------------------------ | ---------------------- | ----------------------------- |
| 13  | DeepSeekMoE    | 注意力省完了，FFN 才是参数大头 | 路由动画（token→专家） | Gate + Expert toy，含负载均衡 |
| 14  | MTP 与推测解码 | 一次只出一个 token 太慢        | 多头预测时序动画       | 草稿-验证 toy                 |

### 阶段 4 · 系统扩展

| 篇  | 标题         | 交接点             | 主视图 | 代码       |
| --- | ------------ | ------------------ | ------ | ---------- |
| 15  | Engram：记忆 | 把检索挂到主干上   | 结构图 | 接口级 toy |
| 16  | mHC：残差    | 残差流本身能不能改 | 结构图 | 接口级 toy |
| 17  | DSpark       | 草稿模块的工程化   | 结构图 | 接口级 toy |

### 阶段 5 · 落到 kernel 与全链路

| 篇  | 标题                  | 交接点                                    | 主视图            | 代码                    |
| --- | --------------------- | ----------------------------------------- | ----------------- | ----------------------- |
| 18  | FlashAttention        | 公式对了，为什么还慢：访存与在线 softmax  | 在线 softmax 动画 | 分块 + 在线 softmax toy |
| 19  | 一次 V3 decode 全链路 | 把 00–18 串成一条路径，并交接到 vLLM 系列 | 全链路图（可点）  | 串起来的 toy pipeline   |

19 篇结尾直接引到系列二：模型算什么已经清楚了，**运行时怎么把它提交到设备上**是另一层问题。

---

## 系列二：vLLM 图模式 —— 从一次提交到 CUDA Graph 与 ACLGraph

原 8 篇主线正确，但缺少 PyTorch 执行模型的零基础铺垫，`00` 承担了过多概念。扩为 9 篇。

| 篇  | 标题                   | 交接点 / 解决的问题                                | 主视图                       | 代码                       |
| --- | ---------------------- | -------------------------------------------------- | ---------------------------- | -------------------------- |
| 00  | 一次 decode 提交了什么 | 从 DeepSeek 系列接过来：计算很小，开销在哪         | 提交时间线动画（已有，重做） | 纯 Python 开销计数模拟     |
| 01  | PyTorch 是怎么执行的   | 零基础铺垫：Python → 算子分发 → stream → 异步执行  | 分发路径动画                 | CPU 上观察调用次数         |
| 02  | torch.compile 与 FX 图 | 把一串算子变成一张图；guards 与 graph break        | 编译栈图（已有，重做）       | 观察 graph break 的小例子  |
| 03  | CUDA Graph             | 编译图省 Python，设备图省提交                      | capture/replay 生命周期动画  | 伪设备 capture/replay 模拟 |
| 04  | 四条边界               | 动态 shape、通信、内存池、多流为什么会打断图       | 边界判定流程图               | 约束检查器 toy             |
| 05  | vLLM 选路              | descriptor → dispatcher → wrapper 三级如何决定模式 | 选路动画                     | 复刻 dispatcher 匹配逻辑   |
| 06  | 无设备练习             | 不装依赖怎么练桶匹配、padding、回退                | 桶选择动画（已有，重做）     | 完整练习题 + 参考实现      |
| 07  | Ascend 图模式          | 同一套抽象在另一个后端上长什么样                   | 两端对照图                   | 源码对照                   |
| 08  | 排错手册               | 日志说回退/捕获失败/变慢时，按什么顺序查           | 决策树                       | 日志样例与定位步骤         |

---

## 复用关系

动画积木被两个系列共用：

| 积木             | 用在                         |
| ---------------- | ---------------------------- |
| MatMul           | DS 00、DS 05（矩阵吸收）     |
| AttentionGrid    | DS 01、06–12（换 mask 即可） |
| KVCacheTable     | DS 02、03、04、11            |
| CacheWidthBars   | DS 02、03、04                |
| RoutingFlow      | DS 13、14                    |
| OnlineSoftmax    | DS 18                        |
| SubmitTimeline   | DS 19、vLLM 00、01、03       |
| BucketSelector   | vLLM 05、06                  |
| LifecycleMachine | vLLM 03、07                  |

这保证「风格统一」不靠人工对齐，而是同一组件在不同参数下的呈现。

## 进度

### 已完成

**约定与基础设施**

| 项                                           | 状态                                                               |
| -------------------------------------------- | ------------------------------------------------------------------ |
| 约定（writing-guide / 本文 / explainer-kit） | 完成                                                               |
| 动画积木 core（11 个模块 + 单测）            | 完成，144 个测试通过                                               |
| 动画积木 react（9 个场景）                   | 完成                                                               |
| toy 验证流水线                               | `scripts/verify_toys.py`，14 个 `toy.py` 全部通过，结论写成 assert |
| `pnpm check`                                 | 0 error / 0 warning / 0 hint；`pnpm build` 95 页；无死链           |

**DeepSeek 系列（13 篇）**

| 篇                         | 动画 / 图                      | toy |
| -------------------------- | ------------------------------ | --- |
| 00 从一个 token 到一次前向 | MatMul                         | ✓   |
| 01 注意力从零推一遍        | AttentionGrid                  | ✓   |
| 02 KV Cache                | KVCacheView + CacheBars        | ✓   |
| 03 MQA 与 GQA              | CacheBars + KVCacheView        | ✓   |
| 04 MLA                     | MLAFlow + CacheBars            | ✓   |
| 05 解耦 RoPE 与矩阵吸收    | AbsorbView ×2 + draw.io 结构图 | ✓   |
| 06 稀疏注意力地图          | MaskAtlas + AttentionGrid ×2   | ✓   |
| 07 SWA                     | AttentionGrid ×2               | ✓   |
| 08 NSA                     | BranchView                     | ✓   |
| 09 DSA                     | AttentionGrid（动态 top-k）    | ✓   |
| 10 CSA                     | BranchView                     | ✓   |
| 11 HCA                     | BranchView                     | ✓   |
| 13 DeepSeekMoE             | RoutingFlow                    | ✓   |
| index 路线图               | Mermaid 阶段图                 | —   |

**vLLM 系列（1 篇）**

| 篇                        | 动画              | toy |
| ------------------------- | ----------------- | --- |
| 00 一次 decode 提交了什么 | SubmitTimeline ×2 | ✓   |

### 全部完成

**DeepSeek 系列 20 篇**（00–19）+ index：阶段 0 坐标系、阶段 1 压缩表示、阶段 2 改变读取集合、
阶段 3 模型骨架、阶段 4 系统扩展、阶段 5 kernel 与全链路。

**vLLM 系列 9 篇**（00–08）+ index：两条车道 → 两种图 → 四条边界 → 选路与练习 → Ascend 与排错。
第 05 篇按真实源码重写了选路（`CudaGraphManager` / `BatchExecutionDescriptor` / `_is_compatible`
六项条件），并引用 vLLM 官方设计图。

**动画积木**：core 15 个模块（含 `submit`/`dispatch`/`specdec`/`online-softmax`/`branches`/`routing`/
`mla`/`absorb`/`masks`/`mask-atlas`/`kv-cache`/`cache-bars`/`attention`/`toy`），
React 12 个场景；**201 个单测**全部通过。

**toy 流水线**：26 个 `toy.py`，结论写成 `assert`，`uv run scripts/verify_toys.py` 一次跑完。

**质量门**：`pnpm check` 0 error / 0 warning / 0 hint；`pnpm build` 103 页；全站无死链。

### 全部完成，无遗留

**DeepSeek 系列 22 篇**（00–19 主线 + 20/21 的 V4.1 专题）+ index。
**vLLM 系列 9 篇**（00–08）+ index。

最后一轮补齐：18（FlashAttention，含在线 softmax 与 FA-4 的条件重缩放动画）、
19（全链路，把两个系列接起来）、20（CED + SWA Bounded Replay）、21（CSA2 + FP4，含跨层 mode 动画）。
旧版的 `05-csa`、`06-hca`、`10-deepseek-moe`、`11-mtp`、`12-engram`、`13-mhc`、`14-dspark`、
`17-flash-attention` 已删除（内容由新编号取代）。

| 项             | 数量                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| 文章           | 31（22 + 9），每篇都有图或动画、toy、代价与边界、自测、来源             |
| 动画积木 core  | 15 个模块                                                               |
| 动画积木 react | 15 个场景                                                               |
| 单测           | 215 全部通过                                                            |
| 可运行 toy     | 28 全部通过                                                             |
| draw.io 结构图 | 6 张（MLA 解耦 RoPE、NSA 三分支、DSA indexer、CSA 流水线、Ascend 两张） |
| 官方配图       | 2 张（vLLM `current_design` 与 `wrapper_flow`，Apache-2.0，已标注出处） |
| 质量门         | `pnpm check` 0 error / 0 warning / 0 hint；`pnpm build` 104 页；无死链  |

### 收尾时发现并修掉的一个真实缺陷

`vllm-graph/07-ascend/` 下同时存在旧的 `index.md` 和新写的 `index.mdx`，
**Astro 的内容加载器选了 `.md`**——也就是说站点一直在发布旧版 Ascend 文章
（标题还是「06 Ascend 图模式：从 TorchAir 到 ACLGraph」），而 `pnpm check` / `pnpm build`
全部通过、没有任何告警。

教训：**改写文章时如果换了扩展名（`.md` → `.mdx`），必须显式删除旧文件**；
构建成功不等于发布的是你写的那一版。排查办法是比对 `dist/**/index.html` 的 `<title>`
与源文件的 frontmatter，本轮已对全部 31 篇做过这项核对。

同时清理了该目录下两张属于旧文的 draw.io（`06-ascend-stack`、`06-npu-lifecycle`）：
它们断言了 `aclmdlRI`、GE 图引擎等本地快照中未核实的细节，与本站的证据等级要求不符，
因此删除而不是沿用。

### 视觉手段的分工（design/writing-guide.md §4.1）

- **动画**（15 个场景）：逐步累积、时间顺序、掩码随输入变化——动画才说得清的部分。
- **draw.io**（6 张）：机制的静态结构。论文里最抽象的 MLA / NSA / DSA / CSA 各配一张，
  补上动画讲不了的「整条数据流长什么样」。
- **Mermaid**（9 篇）：层次关系、判定流程这类用文字块就能画清楚的。
- **官方配图**（2 张）：vLLM 自己的设计图比重画更可信，直接引用并注明出处与许可证。

## 执行顺序

1. 约定与规划（本文 + `writing-guide.md`）
2. 动画积木（`src/explainers/`，含单测）—— 先做被复用最多的 AttentionGrid / KVCacheTable / SubmitTimeline
3. DeepSeek 系列 00 → 19
4. vLLM 系列 00 → 08
5. 两个系列的 index 页重写（路线图 + 阶段说明）
6. `pnpm check` 与全站链接核对
