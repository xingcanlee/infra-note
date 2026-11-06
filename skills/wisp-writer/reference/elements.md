# 元素写法

每种元素何时用、怎么写。展示用的完整例子见 `src/content/posts/kitchen-sink/index.mdx`。

## 公式

主题用 KaTeX（`features.math`）。

- **行内** `$...$`：变量、符号、简短表达式，如 `$d_k = 64$`、`$O(n^2)$`。`$` 紧贴内容，不留空格。
- **块级** `$$...$$`：关键公式、推导。`$$` 各占一行，公式前后空一行：

  ```markdown
  $$
  \operatorname{Attention}(Q, K, V) = \operatorname{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right)V
  $$
  ```
- **对齐**用 `aligned` 环境，在 `=` 前加 `&`，行尾 `\\`：

  ```markdown
  $$
  \begin{aligned}
  S &= QK^\top / \sqrt{d_k} \\
  A &= \operatorname{softmax}(S)
  \end{aligned}
  $$
  ```
- **矩阵**用 `bmatrix`（方括号）或 `pmatrix`（圆括号），全文统一：`\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}`。
- 函数名用 `\operatorname{softmax}`，文字下标用 `\text{model}`，向量与矩阵的写法全文一致。
- 公式后用文字解释每个符号，不要让读者自己去猜。
- 货币符号 `$` 写成 `\$`，避免被当作公式。

## 代码块

围栏后必须写语言标识（Shiki 支持的名字：`python`、`typescript`、`bash`、`json`、`c`、`cpp`、`diff`……）。纯文本用 `text`。命令行用 `bash`。

````markdown
```python
def add(a: int, b: int) -> int:
    return a + b
```
````

- 默认有行号和复制按钮（由站点配置控制）。
- **meta（写在语言后面）**
  - **折叠是长代码块的可选行为**，由 `features.codeFold` 控制（默认开启：超过 `maxLines`=24 行的块自动折叠，只显示前 `previewLines`=12 行，需要 JS）。一般不用管，让默认行为生效即可。
  - ` ```ts nofold `：强制不折叠，适合必须一眼看完的长代码。
  - ` ```ts fold `：强制折叠（超过预览行数时）。
  - ` ```ts fold=8 `：折叠并只预览 8 行。
  - 实现与解析见 `src/wisp/shiki.ts` 的 `parseFoldMeta`；如果站点关闭了 `codeFold`，这些 meta 会被忽略。
- **diff**：语言写 `diff`，以 `+` / `-` 开头的行被标为增删：

  ````markdown
  ```diff
  - const title = post.data.title;
  + const title = post.data.title.trim();
  ```
  ````
- **在其他语言中标注增删**：行尾加注释标记 `[!code ++]` 或 `[!code --]`，标记会被去掉，该行获得增删样式：

  ````markdown
  ```ts
  const a = 1;
  const b = 2; // [!code ++]
  const c = 3; // [!code --]
  ```
  ````
  注释符号随语言选择（`//`、`#`、`/* */`）。
- 示例代码保持最小可运行，长度控制在约 40 行内；更长的放在仓库里并链接。
- 代码里的注释用与正文相同的语言。

## Mermaid

用于流程图、时序图、状态图、类图、甘特图、饼图。构建期渲染为内联 SVG，自动适配明暗主题。

````markdown
```mermaid
flowchart LR
    A["输入序列 X"] --> B["线性投影"]
    B --> C["逐行 softmax"]
```
````

- **选型**：流程用 `flowchart`，交互顺序用 `sequenceDiagram`，状态迁移用 `stateDiagram-v2`，类与关系用 `classDiagram`，时间线用 `gantt`，占比用 `pie`。
- **标签**：节点文字用双引号包起来 `A["..."]`（含括号、冒号、中文标点时必须）；**每个节点不超过约 12 个汉字**，更长的信息放进正文；一个图不超过约 12 个节点。
- 方向：横向 `LR` 适合短链路，纵向 `TD` 适合层级。移动端上宽图会缩小，宽度优先控制。
- 不要用 `style`、`classDef` 或 `%%{init}%%` 指定颜色，主题会统一处理。
- 概念示意、需要手绘感或精确排版的图，不用 Mermaid，改用 Excalidraw/draw.io。

## Excalidraw / draw.io 图表

绘制与构建交给 **wisp-diagram skill**，本文只说明在文章里怎么引用。

标准图片语法，引用**源文件**（不是 `.wisp.svg`）：

```markdown
![自注意力计算流程](./diagrams/attention-flow.excalidraw "图 1：自注意力")
![Transformer Block 的残差结构](./diagrams/transformer-block.drawio#page=encoder "图 2：编码器")
```

- **alt 必填**，写图要表达的结论，会成为屏幕阅读器读到的名称。不要只写“图 1”。
- 引号里的 title 是图注（`<figcaption>`）。格式 `图 N：说明`，N 在文章内从 1 递增；正文里要提到（“如图 1 所示”）。
- `#page=<名称或序号>` 选择 draw.io 的页面，默认第一页，序号从 1 开始。
- **路径约定**：源文件放在文章目录的 `diagrams/` 下，文件名 kebab-case；生成的同名 `.wisp.svg` 放在旁边并一起提交。多篇文章共用的图放 `src/content/shared/diagrams/`，用相对路径引用，如 `../../shared/diagrams/transformer-block.drawio`。
- 引用前文件必须已经存在；`.wisp.svg` 没有生成时 check_post.py 给出 warning，提示运行 wisp-diagram 的构建。
- 同一篇文章尽量只用一种图表风格；Excalidraw 不超过约 12 个节点。
- MDX 里需要突破正文宽度时可用组件，写法见 `docs/guide/diagrams.md`：`<Diagram src="..." alt="..." caption="..." wide />`，同样要 `import`、同样必须有 alt。

## 交互组件（MDX）

只有 `.mdx` 能用。先在文件头（frontmatter 之后）`import`，再在正文中使用，并加 `client:visible`（进入视口后才加载）：

```mdx
import MatMul from '@/explainers/react/MatMul';

<MatMul client:visible a={[[1,2],[3,4]]} b={[[5,6],[7,8]]} />
```

- 现有组件：`MatMul`（`a: number[][]`、`b: number[][]`、`title?: string`）。最新列表见 `docs/guide/explainers.md`。
- 组件前用一句话交代它演示什么、怎么操作（播放/步进）；不依赖交互也能读懂文章。
- 每篇文章的交互组件控制在 1 到 3 个。
- 需要的算法没有现成组件时：说明需要新增组件（算法写在 `src/explainers/core/`、渲染在 `src/explainers/react/`，见 `docs/guide/explainers.md`），这是代码改动，先向用户说明，不要在写文章时顺手创建。

## 图片

- 标准语法：`![alt](./images/photo.jpg "可选图注")`，图片放在文章目录的 `images/` 下。alt 必填，描述内容而不是文件名；纯装饰图不应出现在技术文章里。
- 需要图注、突破正文宽度或使用优化后的图片时，在 MDX 中用 `Figure` 组件：

  ```mdx
  import Figure from '@/wisp/components/Figure.astro';
  import photo from './images/photo.jpg';

  <Figure src={photo} alt="描述" caption="图 3：说明" wide />
  ```
- 截图尽量裁剪到相关区域；大图在提交前压缩。不要引用无法确认版权的图片。
- 示意图优先自己画（wisp-diagram），不要截取论文或他人文章中的图。

## 表格

标准 GFM 语法，第二行 `|---|---|` 分隔，不需要对齐空格。何时使用见 style-guide。

```markdown
| 算法 | 时间复杂度 | 说明 |
|---|---|---|
| 朴素三重循环 | $O(n^3)$ | 最容易理解 |
| 分块 | $O(n^3)$ | 缓存友好 |
```

- 单元格内可以用行内代码和行内公式；管道符 `|` 要写成 `\|`。
- 数值列统一小数位。宽表格在移动端会横向滚动，列数控制在 5 列以内。

## 任务列表

```markdown
- [x] 已完成
- [ ] 待办
```

只用于路线图、清单、检查表这类“状态”内容，不要拿它当普通列表。

## 其他

- **引用块** `>`、**脚注** `[^1]`、**分隔线** `---` 的使用时机见 style-guide。正文里的 `---` 分隔线很少需要，章节划分用 h2。
- **HTML**：除非 MDX 组件需要，不写原始 HTML；不写 `style=`，不写十六进制颜色。
- **注释**：`.md` 用 `<!-- ... -->`；`.mdx` 必须用 `{/* ... */}`，MDX 不支持 HTML 注释，写了会导致构建失败。
