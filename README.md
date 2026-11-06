# infra-note

基于 Astro 与 Wisp 主题的基础设施技术笔记站点，文章位于 `src/content/posts/`。

## 开发

环境要求：Node.js ≥ 22.23.4、pnpm。

```bash
pnpm install
pnpm dev
pnpm build
```

## 内容

- 站点配置：`src/wisp.config.ts`
- 文章：`src/content/posts/`
- 页面：`src/content/pages/`
- 图表源文件和产物：与文章放在同一目录的 `diagrams/`
- 主题调色板：`design/palette.json`

生成或检查图表：

```bash
pnpm diagram build
pnpm diagram check
```

图片默认会在正文宽度内缩放；点击图片、Mermaid 或 SVG 图表可以打开 Lightbox 放大查看。
