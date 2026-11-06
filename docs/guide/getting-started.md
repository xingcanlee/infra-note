# 快速开始

本文介绍如何在本地运行 Wisp、创建第一篇文章并构建站点。

## 环境要求

- **Node.js ≥ 22.23.4**（Astro 7 的要求，低于此版本会安装失败）
- **pnpm**（本项目使用 pnpm，锁文件为 `pnpm-lock.yaml`）

## 方式一：用模板创建新站点

```bash
npm create astro@latest -- --template xingcanlee/astro-wisp
cd <你的项目名>
pnpm install
pnpm dev
```

## 方式二：克隆仓库

```bash
git clone https://github.com/xingcanlee/astro-wisp.git
cd astro-wisp
pnpm install
pnpm dev
```

开发服务器默认运行在 <http://localhost:4321>。修改 `src/` 下的文件会自动刷新页面。

## 第一次修改

1. **站点信息**：编辑 `src/wisp.config.ts` 中的 `site`，把 `url` 改成你的正式域名，`title`、`author` 改成你自己的。`url` 用于 Sitemap、RSS 和部署后的绝对链接，详见 [部署](./deployment.md)。
2. **导航**：修改 `nav` 数组，它整体替换默认导航。
3. **写一篇文章**：在 `src/content/posts/` 下新建目录，参见 [写作指南](./writing.md)。
4. **关于页**：编辑 `src/content/pages/about.md`。

完整配置项见 [配置参考](./configuration.md)。

## 构建与预览

```bash
pnpm build      # 生成静态站点到 dist/
pnpm preview    # 在本地预览 dist/
```

`pnpm build` 应当零警告通过。发布前可以运行质量门禁：

```bash
pnpm check
```

`pnpm check` 包括 `astro check`、TypeScript 检查、单元测试和对比度检查。图表是否与源文件一致，用 `pnpm diagram check` 单独校验。

## 可选：图表工具

只使用 Mermaid 图表时不需要额外工具。需要在本地**生成** Excalidraw 或 draw.io 图表（`pnpm diagram build`、`pnpm diagram export`）时，还需要：

- **Playwright Chromium**：Excalidraw 导出和 draw.io 的 browser 方式。安装依赖后执行 `pnpm exec playwright install chromium`。
- **draw.io**（可选）：draw.io desktop CLI 或 Docker 镜像。不装时会回退到 browser 方式。

执行 `pnpm diagram probe` 可以查看当前可用的导出方式。CI 只运行 `pnpm diagram check`，不需要这些工具。详见 [图表指南](./diagrams.md)。

## 下一步

- [写作指南](./writing.md)：frontmatter、Markdown 与 MDX、公式、代码、中文写作建议
- [图表指南](./diagrams.md)：三类图表、引用语法、源文件下载
- [交互组件](./explainers.md)：在文章中使用交互讲解
- [部署](./deployment.md)：发布到静态托管平台
