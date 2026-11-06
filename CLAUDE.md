# infra-note

基础设施技术笔记站点，使用 Astro 与 Wisp 主题。

## 约定

- 站点配置在 `src/wisp.config.ts`。
- 文章放在 `src/content/posts/`，页面放在 `src/content/pages/`。
- 颜色使用 `design/palette.json` 生成的 `--wisp-*` / `--wd-*` 令牌。
- 图表源文件和 `.wisp.svg` 产物与文章放在一起。
- 主题运行时位于 `src/wisp/`；修改后运行 `pnpm build` 检查。

## 常用命令

- `pnpm dev`
- `pnpm build`
- `pnpm diagram build|check|lint`
