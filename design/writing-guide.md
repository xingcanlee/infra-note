# 写作与设计约定（infra-note）

所有系列文章共用这一份约定。新增或修改文章前先读本文，完成写作后按文末检查表与自动化脚本核验。

## 1. 读者与目标

**读者**：会写 Python、不默认学过深度学习理论、手头没有 GPU/NPU 机器也能阅读复现的开发者。可能听过 Attention 但未手推过，可能调用过 vLLM 但未跟踪过调度与图捕获代码。

**目标**：读者读完一章后，能用自己的话讲清这一机制**改了什么、为什么必须改、硬件收益与工程代价各是什么**，并能在仓库对应提交与行号里找到准确落点。

两条硬性要求同时成立：

- **零基础可入**：禁止不作解释直接抛出陌生缩写、张量下标或密集公式。每个新符号与新术语必须在首次出现前或出现处用通俗语言说明含义与张量形状，并先行给出可手算的微型具体数字例子。
- **深度不打折**：该推导的公式完整写出，该对照的上游文件、类名与行号如实核验；不使用「速度很快」「显存大幅下降」等无条件数字的模糊表述。

## 2. 单章固定骨架

| 顺序 | 章节职责                               | 内容要求                                                                                                                                     |
| :--: | :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
|  1   | **开头导读**                           | 承接上一章遗留的具体缺口，用 3–4 条列出本章能够回答的工程问题                                                                                |
|  2   | **先看一个例子**                       | 用小到可手算的具体数字与维度走查，按场景配合交互式 `<Explainer>` 或静态示意图直观暴露问题与机制                                              |
|  3   | **一般原理与架构**                     | 定义全部符号后再展开正式公式或状态机推导，配合 `Draw.io` 架构图或 `<Explainer>` 分步动画                                                     |
|  4   | **PyTorch / NumPy 核心实现与数值验证** | 在正文中直接给出精炼可复现的 PyTorch 或 NumPy 核心实现与形状断言（不单独维护外部 `toy.py` 文件，正文中不写 `toy.py` 字样或链接）             |
|  5   | **NVIDIA GPU 与昇腾 NPU 源码实现对照** | 结合锁定上游快照（`.tmp-research/repos/` 中的 `vllm` / `FlashMLA` / `DeepEP` 与 `vllm-ascend` / CANN）给出真实路径、类名、核心代码片段与差异 |
|  6   | **代价与边界**                         | 说明失效条件、精度/显存/复杂度权衡以及论文或社区方案的前提限制                                                                               |
|  7   | **自测与跨章衔接**                     | 提供思考题（带 `<details><summary>参考答案</summary>`）与 1 个参数/算子改动推导实验，并在末尾桥接到下一章链接                                |
|  8   | **脚注来源**                           | 全篇遵循 GFM 脚注 `[^key]`，在末尾按首次出现顺序写清论文 arXiv 锚点、源码永久链接与许可证信息                                                |

## 3. 串联与链接规范

- **Frontmatter 单行映射**：所有系列文章统一采用单行 flow YAML：`series: { id: foundations | distributed | deepseek | vllm, order: N }`（兼顾 Astro 内容集合校验与 `check_post.py` 解析器）；编号章节标题统一以两位数字开头（`01 ...`、`02 ...`），导览 `index.mdx` 置 `order: 1` 且不加数字前缀。
- **标签收敛**：使用全站统一的规范 `tags`（禁止同义大小写/连字符变体）。
- **相对链接可达**：同系列章间跳转用 `../02-.../`，跨系列用 `../../distributed/` 或 `../../deepseek/01-mla/`；导览 `index.mdx` 指向子章节用 `./01-.../`；独立页面 `about.md` 指向文章用 `../posts/<series>/`，确保 `base: '/infra-note'` 下零死链。
- **MDX 洁净度**：禁止 HTML 注释 `<!-- ... -->`、禁止裸 `<https://...>` 自动链接、禁止引用 `toy.py` 或 `file://` 本地文件链接、正文中数学公式一律用 `$...$` / `$$...$$`（禁用 `\(...\)` / `\[...\]`）；中文正文按主题约定使用全角标点，段落控制在 `300` 字以内。

## 4. 四选一可视化路由与可复用组件体系

拒绝“只有圆角方框 + 公式”的低信息密度图；单篇文章内鼓励按场景混用下列四类工具，图号从 `图 1：` 起按正文出现顺序连续递增：

1. **简单控制流 / 模块调用 / 排障决策树 → `Mermaid`**
   - 写法：` ```mermaid caption="图 N：..." `，节点文字用双引号包裹 `A["..."]`。
   - 约束：不超过 `12` 个节点，单节点不超过 `12` 个汉字，禁止手写 `style`、`classDef` 或 `%%{init}%%`。
2. **复杂模型架构 / 分布式切分 / 静态硬件双泳道 → `Draw.io`（`scripts/diagram_kit.DrawioCanvas`）**
   - 写法：由 `scripts/diagrams/<slice>.py` 调用 `DrawioCanvas` 生成未压缩 `.drawio` 并编译 `.wisp.svg`，文章中用 `![alt](./diagrams/foo.drawio '图 N：说明')` 引用。
   - 约束：画布宽度 `<= 688px`，坐标严格落在 `8px` 网格上，字号仅用 `12 / 14 / 18`，单图非中性（slate）色调 `<= 3` 种，不在画布内重复写图标题；张量块长宽与字节严格按真实比例绘制，切分处画虚线。
3. **局部直觉对比 / `<= 3` 跳指针映射 / 位宽字段对照 → `Excalidraw`（`scripts/diagram_kit.ExcalidrawScene`）**
   - 写法：调用 `ExcalidrawScene` 生成骨架并用 `wisp_diagram.py new --build` 编译 `.excalidraw` + `.wisp.svg`。
   - 约束：公式用 Unicode（`×`、`√d`、`α`），节点数 `<= 12`，单图 `<= 3` 种非 slate 色调。
4. **矩阵变换、注意力/稀疏掩码、数值热力分布、离群值、`> 3` 次指针寻址或时间步演化 → 交互式 SVG `<Explainer>`（`src/explainers/kit/`）**
   - 写法：在 `src/explainers/<series>/*Explainer.tsx` 中复用 `@/explainers/kit` 的共享原语（`TensorBlock`、`ByteLedgerBar`、`HeatmapMatrix`、`ProbabilityBars`、`SlotStrip`/`PointerArcs`、`SwimlaneTimeline`、`LogRooflineChart`、`DataFlowArrow`、`ActiveFocusFrame`、`MetricRow`、`SectionBox`）构建 `4–6` 步离散状态切换组件，在 `.mdx` 中导入并挂载 `<FooExplainer client:visible title="图 N：..." />`。
   - 硬性视觉约束：颜色只能使用 `var(--wisp-*)` 语义令牌与 `kit` 色调（单图调用 `assertMaxHues` 确保非 slate 色调 `<= 3` 种），禁止硬编码 `#hex`、渐变、阴影与 emoji/Unicode 播放符；固定背景网格，逐帧高亮当前活跃张量与流向。
5. **第三方论文图与视觉检查**：
   - 仅保留验证为 CC BY 4.0 或 Apache-2.0 的一手论文图至文章 `images/` 目录并完整署名；新图或改图后须渲染明暗双主题并实测验证无文字重叠、无裁切与高对比度。

## 5. 代码与证据分级

- **可复现参考实现**：正文中提供自包含 PyTorch 或 NumPy 核心代码与形状/数值断言，无硬件设备也可理解核心张量变换。
- **双仓源码对照不臆测**：NVIDIA CUDA（`vLLM` / `FlashMLA` / `DeepEP`）与华为昇腾（`vllm-ascend` / CANN）源码引用必须先到 `.tmp-research/repos/` 核实精确路径、符号与行为差异；若某一端暂无对应算子或走不同抽象，必须如实标出。
- **不虚构实测数据**：不在无设备环境下编造本地硬件实测吞吐或加速比；论文数据与模拟器数字明确区分。

## 6. 提交前检查表

- [ ] `pnpm diagram lint --strict` 报告 `0 error / 0 warning`
- [ ] `uv run node_modules/astro-wisp/skills/wisp-writer/scripts/check_post.py --all --strict` 返回 `0 error / 0 warning / 0 info`
- [ ] `pnpm format:check && pnpm check`（`astro check`、`tsc`、`eslint`、`prettier`、`vitest run`（含 `content.test.ts` 与 `explainers.test.ts`）、`wisp diagram check`）全通过
- [ ] `pnpm build` 生成静态产物且无死链或 `.md`/`.mdx` 冲突
