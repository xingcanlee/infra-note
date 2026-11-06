# 配置参考

站点配置位于 `src/wisp.config.ts`，通过 `defineWispConfig()` 导出。它用 zod 校验并与默认值深度合并：

- 没有写的字段使用默认值。
- 对象逐字段合并，只覆盖你写的字段。
- 数组（`nav`、`social`）整体替换默认值，不会合并。
- 类型不符或超出范围时，启动和构建会报错，并指出字段路径，例如 `home.pageSize: ...`。

```ts
// src/wisp.config.ts
import { defineWispConfig } from './wisp/config';

export default defineWispConfig({
  site: {
    title: '我的博客',
    description: '记录学习笔记',
    author: '张三',
    lang: 'zh-CN',
    url: 'https://blog.example.com',
  },
  nav: [
    { label: '归档', href: '/archive/' },
    { label: '关于', href: '/about/' },
  ],
  social: [
    { kind: 'github', href: 'https://github.com/example' },
    { kind: 'rss', href: '/rss.xml' },
  ],
  home: { featuredCount: 3, pageSize: 10 },
  features: { mermaid: true, diagramDownload: true },
  rss: { fullText: true },
});
```

## site

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `site.title` | string | `Wisp` | 站点标题，用于页头和 RSS 频道名 |
| `site.description` | string | `安静好读的技术博客` | 站点描述，用于首页和 RSS |
| `site.author` | string | `""` | 作者名 |
| `site.lang` | string | `zh-CN` | 站点语言，默认写入 `<html lang>` |
| `site.url` | string | `https://example.com` | 正式站点地址。Astro 的 `site`，用于 Sitemap、RSS、绝对链接，以及 draw.io 的“在线打开”链接。**发布前必须修改** |

## nav

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `nav` | `{ label: string; href: string }[]` | 归档 `/archive/`、标签 `/tags/`、关于 `/about/` | 顶部导航。整体替换 |

## social

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `social` | `{ kind, href, label? }[]` | `[{ kind: 'rss', href: '/rss.xml' }]` | 页脚的社交链接（为空数组时不显示）。整体替换 |

`kind` 只能是：`github`、`x`、`mastodon`、`bluesky`、`email`、`rss`、`link`。`label` 可选，用于无障碍名称。

## home

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `home.featuredCount` | 整数 ≥ 0 | `3` | 首页精选区最多显示的文章数（`featured: true` 的文章） |
| `home.pageSize` | 整数 ≥ 1 | `10` | 列表页每页文章数 |

## features

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `features.codeCopy` | boolean | `true` | 代码块右上角显示复制按钮 |
| `features.lineNumbers` | boolean | `true` | 代码块显示行号 |
| `features.math` | boolean | `true` | 启用 KaTeX 公式（`remark-math` 与 `rehype-katex`） |
| `features.mermaid` | boolean | `true` | 构建期用 Pele 渲染 `mermaid` 代码块。关闭后它们作为普通代码块显示 |
| `features.toc` | boolean | `true` | 文章页显示目录。文章 frontmatter 的 `toc: false` 可以单独关闭某篇 |
| `features.diagramDownload` | boolean | `true` | 图表显示源文件下载链接，并在构建时复制源文件到 `dist/diagrams/` |

## mermaid

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `mermaid.strict` | boolean | `false` | `false`：渲染失败时开发环境显示代码块并警告。`true`：渲染失败时构建失败 |

## rss

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `rss.fullText` | boolean | `true` | `true` 时 `/rss.xml` 输出全文；`false` 时只输出摘要。含交互组件的文章无法在 RSS 中渲染，两种设置下都会降级为摘要加原文链接 |

## taxonomy

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `taxonomy.slugMap` | `Record<string, string>` | `{}` | 把标签或分类名映射为指定的 URL 段，例如 `{ "机器学习": "ml" }` |

标签和分类的 URL 段默认由名字生成：小写，空格转 `-`，中文保留，浏览器会做 URL 编码。如果两个不同的名字生成了相同的 URL 段，构建会报错，此时请用 `slugMap` 区分它们。

## 与 Astro 配置的关系

`astro.config.ts` 从 `wisp.config.ts` 读取 `site.url` 作为 Astro 的 `site`，并把主题集成传入 `wisp(config)`。Astro 自身的其他配置（如 `base`）仍写在 `astro.config.ts` 中。
