# infra-note

基于 Astro 与 `astro-wisp` 主题的基础设施技术笔记站点，文章位于 `src/content/posts/`。

## 开发

环境要求：Node.js ≥ 22.23.4、pnpm。

```bash
pnpm install
pnpm dev
pnpm build
```

## 内容

- 站点与主题配置：`astro.config.ts`
- 文章：`src/content/posts/`
- 页面：`src/content/pages/`
- 图表源文件和产物：与文章放在同一目录的 `diagrams/`
- 主题调色板覆盖：`design/palette.json`

生成或检查图表：

```bash
pnpm diagram build
pnpm diagram check
```

`astro-wisp` 负责页面、布局、Markdown 管线和图表处理；点击图片、Mermaid 或 SVG 图表可以打开 Lightbox 放大查看。
