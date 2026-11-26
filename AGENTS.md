# infra-note

基础设施技术笔记站点，使用 Astro 7 与 `astro-wisp` 主题，覆盖 `foundations`、`distributed`、`deepseek`、`vllm`、`execgraph` 五大递进系列。

## 开工前必读

- `node_modules/astro-wisp/DESIGN.md`：**外观与视觉规范**（字体、配色、圆角、间距、组件样式、品牌原则）。站点不另写视觉规范，任何样式覆盖或交互组件开发先读它。
- [`design/writing-guide.md`](./design/writing-guide.md)：读者定位、行文脉络、十条文风硬规范、自然表达规则与业界共识术语表。
- [`design/diagram-workflow.md`](./design/diagram-workflow.md)：四选一可视化路由（Pele / `.drawio` / `.excalidraw` / `<Explainer>`）、Draw.io 论文配图规范与明暗 PNG 目视验收流程。
- [`design/series-plan.md`](./design/series-plan.md)：五大系列篇目规划、编号顺序与全站质量门总账。

## 仓库结构与硬性约定

- **配置与主题**：站点与主题配置在 `astro.config.ts`（`base: '/infra-note'`），主题运行时位于 `node_modules/astro-wisp/`。**禁止修改 `node_modules/astro-wisp/`**，升级主题使用 `pnpm up astro-wisp`。
- **内容组织与 Frontmatter**：文章放在 `src/content/posts/<series>/<slug>/index.mdx`，页面放在 `src/content/pages/`。`series` 必须使用单行 flow YAML（`series: { id: ..., order: N }`）；正文章节标题以两位数字开头（如 `05 MLA 的两个技巧`），主题会自动排成章节号，导览 `index.mdx` 置 `order: 1` 且不加编号前缀。
- **视觉与样式**：颜色覆盖使用 `design/palette.json`，通过 `wisp({ palette })` 生成 `--wisp-*` / `--wd-*` 令牌。覆盖样式或写讲解组件必须遵守 `DESIGN.md`：颜色只用令牌，禁止硬编码 `#hex`、渐变、阴影、毛玻璃；图标只用 Lucide，不用 emoji 或 Unicode 字符；圆角仅 3px / 4px；CSS 包在 `@layer utilities` 内。
- **静态图表**：按正文栏宽画（自然宽度 `640–700px`，`.drawio` 上限 `<= 704px`，优先纵向流程），严格遵循 `design/diagram-workflow.md` 的四选一路由。源文件（`.drawio` / `.excalidraw`）与 `.wisp.svg` 放在文章目录 `diagrams/` 下；改图后必须执行 `pnpm diagram lint --fix && pnpm diagram build && pnpm diagram lint --strict` 同步 `diagrams.manifest.json`，并导出明暗双主题 PNG 到系统临时目录目视确认无重叠（临时 PNG 不入库）。
- **交互讲解组件**：文章私有 `<Explainer>` 放在文章目录 `src/content/posts/<series>/<slug>/explainers/` 下，复用 `src/explainers/kit/`（如 `BeatExplainer`）与 `astro-wisp/explainers`。
- **双端源码与论文核验**：涉及 NVIDIA CUDA（`vLLM` / `FlashMLA` / `DeepEP`）与华为昇腾（`vllm-ascend` / `cann-runtime` / `torch_npu`）源码对照时，先到工作区 `../.tmp-research/repos/` 核实精确路径、符号与行为差异，不臆测源码，不虚构本地硬件实测数据。
- **自动质量门禁**：文风、术语、标题/句段长度、中文弯引号 `“”`（禁用直角引号 `「」『』`、感叹号、直译黑名单与生造压缩词）、链接可达性与组件 SSR 规范均由 `src/style.test.ts`、`src/content.test.ts`、`src/explainers/__tests__/explainers.test.ts` 与 `check_post.py` 自动检验。

## 常用命令与提交前门禁

环境要求：**Node ≥ 22.23.4**、**pnpm 12.18.0**、**uv**（运行 `wisp-writer` / `wisp-diagram` 脚本）。

- `pnpm dev` / `pnpm build` / `pnpm preview`
- `pnpm diagram build` / `pnpm diagram check` / `pnpm diagram lint [--fix]` / `pnpm diagram lint --strict`
- `pnpm lint` / `pnpm format` / `pnpm format:check` / `pnpm test`
- `pnpm check`（`astro check` + `tsc` + ESLint + Prettier + Vitest + `wisp diagram check`）
- `uv run node_modules/astro-wisp/skills/wisp-writer/scripts/check_post.py --all --strict`（本地联调未发版 `astro-wisp` 规则时，可改用 `../astro-wisp/packages/astro-wisp/skills/wisp-writer/scripts/check_post.py --all --strict --root .`）
