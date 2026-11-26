# infra-note

## Project

基础设施技术笔记站点，使用 Astro 7 与 `astro-wisp` 主题（`base: '/infra-note'`），覆盖 `foundations`、`distributed`、`deepseek`、`vllm`、`vllm-ascend`、`execgraph` 六大递进系列。

开工前必读：

- `node_modules/astro-wisp/DESIGN.md`：**外观与视觉规范**（字体、配色、圆角、间距、组件样式、品牌原则）；站点不另写视觉规范，任何样式覆盖或交互组件开发先读它。
- [`design/writing-guide.md`](./design/writing-guide.md)：读者定位、行文脉络、十条文风硬规范、自然表达规则与业界共识术语表。
- [`design/diagram-workflow.md`](./design/diagram-workflow.md)：四选一可视化路由（Pele / `.drawio` / `.excalidraw` / `<Explainer>`）、Draw.io 论文配图规范与明暗 PNG 目视验收流程。
- [`design/series-plan.md`](./design/series-plan.md)：五大系列篇目规划、编号顺序与全站质量门总账。

## Commands（Agent 可直接运行，无需请示）

环境要求：**Node ≥ 22.23.4**、**pnpm 12.18.0**、**uv**（运行 `wisp-writer` / `wisp-diagram` 脚本）。

- 开发与构建：`pnpm dev` / `pnpm build` / `pnpm preview`
- 图表工具链：
  - `pnpm diagram lint <path> --fix` / `pnpm diagram build` / `pnpm diagram lint --strict` / `pnpm diagram check`
  - 明暗 PNG 导出到系统临时目录 `$TEMP`（用于目视验收）：
    `uv run node_modules/astro-wisp/skills/wisp-diagram/scripts/wisp_diagram.py export <svg> --theme light|dark -o <tmp.png>`
- 文风与全站门禁：
  - `pnpm format` / `pnpm format:check` / `pnpm lint` / `pnpm test`
  - `pnpm check`（`astro check` + `tsc` + ESLint + Prettier + Vitest + `wisp diagram check`）
  - `uv run node_modules/astro-wisp/skills/wisp-writer/scripts/check_post.py --all --strict`（本地联调未发版 `astro-wisp` 规则时可用 `../astro-wisp/packages/astro-wisp/skills/wisp-writer/scripts/check_post.py --all --strict --root .`）

## Ownership（路径所有权与隔离边界）

- `src/content/posts/<series>/<slug>/`：单篇文章独立所有权单元（`index.mdx`、`diagrams/`、`images/`、`explainers/`）；多篇并行或 `/swarm` 时按篇隔离，严禁跨篇越界改动。
- `src/content/pages/`：独立站点页面（如 `about.md`）。
- `src/explainers/kit/`：全站共享讲解原语（`BeatExplainer` 等）；影响多篇文章，多轨道模式下修改须经 `@coordinator` / `@verifier` 确认。
- `astro.config.ts`、`design/palette.json`、`design/*.md`、`src/content.test.ts`、`src/style.test.ts`、`src/explainers/__tests__/explainers.test.ts`：站点配置、设计规范与质量门禁；未经明确任务要求或 `@verifier` 确认不得改动或放宽检查。
- `diagrams.manifest.json`：由 `pnpm diagram build` 自动维护，禁止手改。
- `node_modules/astro-wisp/` 与 `../.tmp-research/`：**只读**外部依赖与上游源码/论文调研库（主题升级使用 `pnpm up astro-wisp`）。

## Hard Rules（内容、视觉与图表规范）

- **Frontmatter 与标题**：`series` 必须使用单行 flow YAML（`series: { id: ..., order: N }`）；正文章节标题以两位数字开头（如 `05 MLA 的两个技巧`），主题会自动排成章节号，导览 `index.mdx` 置 `order: 1` 且不加编号前缀。
- **视觉与样式**：颜色覆盖使用 `design/palette.json`（经 `wisp({ palette })` 生成 `--wisp-*` / `--wd-*` 令牌）；覆盖样式或写讲解组件遵守 `DESIGN.md`：颜色只用令牌，图标只用 Lucide，圆角仅 3px / 4px，CSS 包在 `@layer utilities` 内。
- **静态图表**：按正文栏宽画（自然宽度 `640–700px`，`.drawio` 上限 `<= 704px`，优先纵向流程），遵循 `design/diagram-workflow.md` 四选一路由。
- **交互讲解组件**：文章私有 `<Explainer>` 放在文章目录 `explainers/` 下，复用 `src/explainers/kit/` 与 `astro-wisp/explainers`。
- **双端源码与论文核验**：涉及 NVIDIA CUDA（`vLLM` / `FlashMLA` / `DeepEP`）与华为昇腾（`vllm-ascend` / `cann-runtime` / `torch_npu`）源码对照时，须先到 `../.tmp-research/repos/` 核实精确路径、符号与行为差异。
- **自动质量门禁**：文风、术语、标题/句段长度、全站中文弯引号 `“”`、链接可达性与组件 SSR 规范均由 `src/style.test.ts`、`src/content.test.ts`、`src/explainers/__tests__/explainers.test.ts` 与 `check_post.py` 自动检验。

## Done means（验收与证据标准）

- `pnpm format:check`、`pnpm check`、`uv run node_modules/astro-wisp/skills/wisp-writer/scripts/check_post.py --all --strict`、`pnpm build` 全部通过（`0 error / 0 warning`）。
- 凡新增或修改静态图（`.drawio` / `.excalidraw`），须通过 `pnpm diagram lint --strict` 且导出明暗双主题 PNG 到系统临时目录**目视确认无文字重叠、无截断、无箭头穿盒**（临时 PNG 不入库）。
- 报告与源码核验结论每条均附**仓库相对路径 + 1-based 行号**（本仓或 `../.tmp-research/repos/` 实际读取结果）及命令输出；未实测数据或未执行命令必须明写 `未实测`。
- `/swarm` 模式下：完成后向 `@verifier` 发送 `@verifier [done]`（≤ 15 行摘要：改动文件、执行命令及尾部输出、PNG 目视确认状态、标注 `未实测` 项）；连续受阻超过 2 次向 `@coordinator` 升级。

## Never（硬禁区）

- 禁止修改 `node_modules/astro-wisp/`、`../.tmp-research/` 或手改 `diagrams.manifest.json`。
- 禁止硬编码 `#hex`、渐变、阴影、毛玻璃、超过 `4px` 圆角、emoji / Unicode 图标；禁止在正文及视觉文本中使用直角引号 `「」『』`、感叹号、直译黑名单与生造压缩词。
- 禁止臆测 NVIDIA / 昇腾源码实现，禁止无真机编造实测吞吐或加速比，禁止将模拟算术输出称为“实测输出”。
- 禁止放宽或绕过 `style.test.ts`、`content.test.ts`、`explainers.test.ts` 与 `check_post.py` 门禁。
- 禁止越界修改工作区中不属于当前任务的其他未提交文章；未经明确指示，禁止 `git push`、部署或触碰 `.env*`。
