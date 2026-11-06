# Wisp 设计文档

> Wisp —— 安静好读的技术博客主题。

| 文档 | 内容 |
|---|---|
| [design-system.md](./design-system.md) | 全局视觉规范：色彩令牌、中文排版、间距、组件外观 |
| [architecture.md](./architecture.md) | 技术栈、目录结构、内容模型、Markdown 管线、路由、配置 |
| [diagrams.md](./diagrams.md) | 图表体系：Pele / Excalidraw / draw.io、可移植 SVG 规范、源文件存放与下载、wisp-diagram skill |
| [explainers.md](./explainers.md) | React 交互式讲解组件（算法、矩阵乘、LLM 原理） |
| [tasks.md](./tasks.md) | 任务拆分、依赖关系、模型分配、验收标准 |

令牌的唯一事实来源：[`../design/palette.json`](../design/palette.json)。

## 命名

| 维度 | 名称 |
|---|---|
| 品牌 | Wisp |
| 仓库 / 模板 | `astro-wisp` |
| npm（远期） | `astro-wisp`（发布前确认可用） |
| 创建命令 | `npm create astro@latest -- --template xingcanlee/astro-wisp` |

## 决策记录（ADR 摘要）

| # | 决策 | 理由 |
|---|---|---|
| D1 | Astro 7.x + Tailwind CSS 4.x + MDX | 内容型站点、islands 架构默认零 JS |
| D2 | 先以模板形式分发，npm 集成包延后 | 包形态需要虚拟模块和覆盖机制，成本高；模板目录先按 `src/wisp/` 隔离，为日后抽包做准备 |
| D3 | 所有颜色来自 `design/palette.json`，生成 CSS 变量 | 页面、Shiki、KaTeX、Pele、Excalidraw、draw.io、交互组件共用一套令牌，切换主题无需重绘 |
| D4 | 主题使用 `<html data-theme>` 加 head 内联脚本 | 首屏不闪烁；三态：light / dark / system |
| D5 | Mermaid 在构建期用 Pele 渲染为内联 SVG | 零运行时；通过 CSS 变量适配主题。已知差异：布局与 Mermaid.js 不同 |
| D6 | 中文字体：Noto Sans SC Variable（OFL）按 unicode-range 分片自托管 + Inter + JetBrains Mono | 跨平台一致、授权干净；用 `@fontsource-variable/*` 实现分片 |
| D7 | 交互组件使用 React 19 + Motion；算法核心写成框架无关的 TS | 生态和 AI 代码生成质量最好；Solid 2 仍是 RC，且 Astro 集成只支持 1.x |
| D8 | 图表同时支持两种风格：Excalidraw（手绘）和 draw.io（几何），共用调色板 | 概念图和结构图各取所长；用同一套 lint |
| D9 | 图表产物是可移植 SVG：自带浅/深色默认值，在 Wisp 页面内被令牌覆盖 | 同一张 SVG 在博客、GitHub、其他平台都能直接用 |
| D10 | 图表源文件与文章放在一起，构建时发布到可下载 URL | 读者可以下载原文件二次编辑 |
| D11 | 不启用 ClientRouter（View Transitions） | 避免脚本重复执行和主题状态问题；MVP 不需要 |
| D12 | 文档放在仓库内 `docs/`，Agent 实施前必须阅读 | 设计随代码一起版本化 |

## 环境前提

- **Node ≥ 22.23.4**（astro@7 的 `engines` 要求）。本机当前为 22.23.0，**需要先升级**。
- 包管理器：pnpm。
- 图表构建（仅作者本地需要，CI 不需要）：Playwright Chromium（Excalidraw 导出），draw.io desktop CLI 或 Docker（draw.io 导出）。
