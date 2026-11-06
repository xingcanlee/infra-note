# Wisp 架构

## 1. 技术栈（2026-11 锁定的大版本）

| 包 | 版本 | 用途 |
|---|---|---|
| astro | ^7.4 | 框架（要求 Node ≥ 22.23.4） |
| @astrojs/mdx | ^8 | MDX |
| @astrojs/react, react, react-dom | ^7 / ^19 | 交互组件 island |
| @astrojs/rss, @astrojs/sitemap | ^4 / ^3 | RSS、Sitemap |
| tailwindcss, @tailwindcss/vite, @tailwindcss/typography | ^4.3 / ^0.5 | 样式 |
| remark-math, rehype-katex, katex | ^6 / ^7 / ^0.19 | 公式 |
| pele | ^1.13（锁定次版本，布局输出可能随版本变化） | Mermaid → SVG |
| motion | ^14 | 交互组件动画 |
| @fontsource-variable/{inter,noto-sans-sc,jetbrains-mono} | ^5 | 字体 |
| github-slugger | ^2 | slug |
| 开发依赖：svgo、subset-font、playwright、vitest、tsx | | 图表流水线、测试 |

> 实施者注意：Astro 7 的 API 以官方文档为准（content layer、`astro.config` 中的 markdown 配置、`render()`）。本文档中的代码是意图示例，不是可以直接复制的 API 契约；遇到不一致时按官方文档实现，并在 PR 说明中注明。

## 2. 目录结构

```
astro-wisp/
├─ astro.config.ts
├─ design/palette.json              # 设计令牌唯一来源
├─ docs/                            # 设计文档
├─ scripts/
│  ├─ gen-tokens.ts                 # palette → tokens.css / pele.css / 图表色表
│  ├─ check-contrast.ts
│  └─ diagram/                      # 图表构建 CLI（见 diagrams.md）
├─ skills/wisp-diagram/             # 可分发的 Agent skill（见 diagrams.md §6）
├─ src/
│  ├─ wisp.config.ts                # 用户站点配置
│  ├─ content.config.ts
│  ├─ content/
│  │  ├─ posts/<slug>/index.mdx     # 每篇文章一个目录（也支持单文件 <slug>.md）
│  │  │            ├─ diagrams/     # 图表源文件和生成的 SVG
│  │  │            └─ images/
│  │  └─ pages/about.md
│  ├─ wisp/                         # 主题核心（日后抽包的边界）
│  │  ├─ config.ts                  # defineWispConfig + 类型 + 默认值
│  │  ├─ integration.ts             # Astro 集成：注册 remark 插件、发布图表源文件
│  │  ├─ plugins/
│  │  │  ├─ remark-pele.ts
│  │  │  ├─ remark-diagram.ts       # ![](./diagrams/x.excalidraw) → 内联 SVG + 下载链接
│  │  │  ├─ remark-reading-time.ts
│  │  │  └─ remark-has-math.ts
│  │  ├─ shiki.ts                   # 双主题配置 + transformers（行号、语言标签）
│  │  ├─ utils/{posts.ts,taxonomy.ts,date.ts}
│  │  ├─ components/                # .astro 组件
│  │  └─ styles/{tokens.css(生成),global.css,prose.css,code.css,pele.css(生成),diagram.css,katex.css}
│  ├─ explainers/                   # 交互讲解组件（见 explainers.md）
│  ├─ layouts/{Base.astro,Post.astro,Page.astro}
│  └─ pages/
└─ tests/
```

## 3. 内容模型

```ts
// src/content.config.ts（意图示例）
const posts = defineCollection({
  loader: glob({ pattern: ['**/index.{md,mdx}', '*.{md,mdx}'], base: './src/content/posts' }),
  schema: ({ image }) => z.object({
    title: z.string().max(80),
    description: z.string().max(200),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    category: z.string().optional(),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    cover: image().optional(),
    lang: z.string().optional(),
    toc: z.boolean().default(true),
  }),
});
```

- **id / slug**：目录形式 `posts/attention/index.mdx` 的 id 为 `attention`。URL 为 `/posts/<id>/`。
- **`getPosts()`**（`src/wisp/utils/posts.ts`）：唯一的取数入口。生产环境过滤 draft，按 pubDate 降序。所有页面都必须调用它，不能直接调用 `getCollection`。
- **标签和分类**：URL 段为 `slugify(name)`：小写，空格转 `-`，中文保留原样，由浏览器做 URL 编码。`wisp.config.ts` 中的 `taxonomy.slugMap` 可以覆盖。构建时如果检测到两个不同的名字产生同一个 slug，直接报错。

## 4. Markdown 管线

```
remark:  remark-math → remark-pele → remark-diagram → remark-reading-time → remark-has-math
rehype:  rehype-katex → (Shiki 内置高亮 + Wisp transformers) → rehype-heading-anchors
```

- **Astro 7 默认的 Markdown 处理器是 Sätteri**，它不运行 remark/rehype 插件。Wisp 在 integration 中显式设置 `markdown.processor = unified({...})`（来自 `@astrojs/markdown-remark`）。插件只能通过这个处理器注册，不能写在旧的 `markdown.remarkPlugins` 里。
- `remark-pele` 必须在 Shiki 之前处理 `mermaid` 代码块。remark 阶段天然早于高亮，满足这一要求。
- 插件由 `src/wisp/integration.ts` 统一注册。MDX 继承同一套 markdown 配置。
- **remark-pele**：`render(code)` → `<figure class="wisp-figure wisp-pele" role="img" aria-label="…"><div class="pele">SVG</div></figure>`。出错时，dev 环境退化为代码块并打印警告；`wisp.config.mermaid.strict=true` 时构建失败。aria-label 依次取 `accTitle`、`accDescr`、图类型名。
- **remark-reading-time**：统计 CJK 字符数 ÷ 350 + 西文词数 ÷ 200，代码块按 0.3 的权重计入，向上取整，最少 1 分钟。结果写入 `remarkPluginFrontmatter.readingTime`。
- **remark-has-math**：检测到 math 节点时写入 `hasMath: true`，Post 布局据此按需引入 `katex.css`。
- **TOC**：使用 `render()` 返回的 headings，取 depth 2–3；标题锚点 id 由 github-slugger 生成，支持中文。

## 5. 路由

| 路由 | 文件 | 说明 |
|---|---|---|
| `/` | `pages/index.astro` | 精选（featured，最多 `home.featuredCount` 篇）+ 最新列表第 1 页 |
| `/page/[n]/` | `pages/page/[page].astro` | 分页，每页 `home.pageSize` 篇 |
| `/posts/[...id]/` | `pages/posts/[...id].astro` | 详情页：TOC、上一篇/下一篇、更新时间 |
| `/archive/` | | 按年份分组 |
| `/tags/` `/tags/[tag]/` | | 标签列表（含文章数）、某标签下的文章 |
| `/categories/` `/categories/[cat]/` | | 同上 |
| `/about/` | | 渲染 `content/pages/about.md` |
| `/404` | | |
| `/rss.xml` | | 默认输出全文，`rss.fullText=false` 时只输出摘要 |
| `/sitemap-index.xml` | | 需要配置 `site` |
| `/diagrams/<post-id>/<file>` | 由集成发布 | 图表源文件下载，见 diagrams.md §5 |

## 6. 主题切换脚本

放在 `Base.astro` 的 `<head>` 中，`is:inline`，必须先于样式表执行：

```html
<script is:inline>
  (() => {
    const k = 'wisp-theme', s = localStorage.getItem(k) ?? 'system';
    const dark = s === 'dark' || (s === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePref = s;
  })();
</script>
```

ThemeToggle 组件负责切换三态、写入 localStorage，并在 `system` 模式下监听 `matchMedia` 的 change 事件。

## 7. 站点配置

```ts
// src/wisp.config.ts
export default defineWispConfig({
  site: { title: 'Wisp', description: '…', author: '…', lang: 'zh-CN', url: 'https://example.com' },
  nav: [{ label: '归档', href: '/archive/' }, { label: '标签', href: '/tags/' }, { label: '关于', href: '/about/' }],
  social: [{ kind: 'github', href: '…' }, { kind: 'rss', href: '/rss.xml' }],
  home: { featuredCount: 3, pageSize: 10 },
  features: { codeCopy: true, lineNumbers: true, math: true, mermaid: true, toc: true, diagramDownload: true },
  mermaid: { strict: false },
  rss: { fullText: true },
  taxonomy: { slugMap: {} },
});
```

`defineWispConfig` 用 zod 校验配置并深度合并默认值。`astro.config.ts` 从这里读取 `site.url`。

## 8. JS 预算

| 脚本 | 加载页面 | 大小 |
|---|---|---|
| 主题初始化（内联） | 全部 | < 0.5KB |
| ThemeToggle | 全部 | < 1KB |
| 代码复制 | 含代码块的文章 | < 1KB |
| TOC 当前章节高亮 | 文章页 | < 1KB |
| React + 讲解组件 | 只有用到交互组件的文章，`client:visible` | 约 60KB 起 |

## 9. 质量门禁

`pnpm check`：`astro check` + `tsc` + vitest + `scripts/check-contrast.ts` + `scripts/diagram lint`。
`pnpm build` 必须零警告通过；Lighthouse 中 a11y ≥ 95、performance ≥ 95（使用示例文章测试）。
