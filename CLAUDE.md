# infra-note

基础设施技术笔记站点，使用 Astro 与 Wisp 主题。

## 约定

- **外观规范先读 `node_modules/astro-wisp/DESIGN.md`**（字体、配色、圆角、间距、组件样式、品牌原则）。站点不另写视觉规范；覆盖样式或写讲解组件时遵守它：颜色只用令牌、图标只用 Lucide（不用 emoji / Unicode 字符）、圆角 3px / 4px。
- 文章标题以编号开头（如「05 MLA 的两个技巧」）时，主题会把编号排成章节号；图表按正文栏宽度画（自然宽度 640–700px，流程从上到下），更宽会被缩小。
- 站点与主题配置在 `astro.config.ts`，主题来自 npm 包 `astro-wisp`。
- 文章放在 `src/content/posts/`，页面放在 `src/content/pages/`。
- 颜色覆盖使用 `design/palette.json`，通过 `wisp({ palette })` 生成 `--wisp-*` / `--wd-*` 令牌。
- 图表源文件和 `.wisp.svg` 产物与文章放在一起。
- 主题运行时位于 `node_modules/astro-wisp/`，升级使用 `pnpm up astro-wisp`。

## 常用命令

- `pnpm dev`
- `pnpm build`
- `pnpm check`（类型 + ESLint + Prettier + Vitest + 图表清单）
- `pnpm lint` / `pnpm format` / `pnpm format:check`
- `pnpm diagram build|check|lint`
