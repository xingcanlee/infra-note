# infra-note

基础设施技术笔记站点，使用 Astro 与 Wisp 主题。

## 约定

- 站点与主题配置在 `astro.config.ts`，主题来自 npm 包 `astro-wisp`。
- 文章放在 `src/content/posts/`，页面放在 `src/content/pages/`。
- 颜色覆盖使用 `design/palette.json`，通过 `wisp({ palette })` 生成 `--wisp-*` / `--wd-*` 令牌。
- 图表源文件和 `.wisp.svg` 产物与文章放在一起。
- 主题运行时位于 `node_modules/astro-wisp/`，升级使用 `pnpm up astro-wisp`。

## 常用命令

- `pnpm dev`
- `pnpm build`
- `pnpm diagram build|check|lint`
