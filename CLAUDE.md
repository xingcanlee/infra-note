# astro-wisp

Wisp —— 安静好读的技术博客主题（Astro 7 + Tailwind 4 + MDX + Pele + React islands）。

## 开工前必读
- `docs/README.md`：决策记录和环境前提
- `docs/tasks.md` §0：协作规则（文件所有权、不改 package.json、报告格式）
- 再按任务卡中“必读”列出的章节阅读其他文档

## 硬性规则
- 颜色只能来自 `design/palette.json` 生成的 CSS 变量（`--wisp-*`、图表中的 `--wd-*`）。禁止硬编码十六进制颜色，禁止 Tailwind 原始色阶，禁止 `dark:` 颜色变体。
- `src/wisp/styles/{tokens,pele}.css` 和 `diagram.css` 的映射部分是生成文件，修改后运行 `pnpm tokens` 重新生成。
- 所有页面都通过 `getPosts()` 取文章，不能直接调用 `getCollection('posts')`。
- 中文排版规则见 `docs/design-system.md` §2：禁止负字距，中文 `em` 不用斜体。
- 图表源文件 `.excalidraw`（JSON）和 `.drawio`（未压缩 XML）与文章放在一起，生成的 `.wisp.svg` 也要提交。
- Astro 7 的 API 以官方文档为准，docs 中的代码只表达意图。

## 常用命令
- `pnpm dev` / `pnpm build` / `pnpm check`
- `pnpm tokens`：根据 palette.json 重新生成令牌 CSS
- `pnpm diagram build|check|lint [--fix]`
- `pnpm exec vitest run <path>`

## Agent skills
- 写文章：`skills/wisp-writer/SKILL.md`（`uv run skills/wisp-writer/scripts/new_post.py` / `check_post.py`）
- 画图：`skills/wisp-diagram/SKILL.md`（`pnpm diagram ...` 或 `uv run skills/wisp-diagram/scripts/wisp_diagram.py ...`）
