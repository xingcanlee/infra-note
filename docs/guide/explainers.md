# 交互讲解组件

交互讲解组件用于逐步演示算法和数学过程，例如矩阵乘法每一步的乘加。它们是 React 组件，以 Astro island 的形式嵌入 MDX，只在用到的文章中加载。

## 一、在文章中使用

在 `.mdx` 文件中导入组件，并传入参数。`client:visible` 表示进入视口后才加载和水合：

```mdx
import MatMul from '@/explainers/react/MatMul';

<MatMul client:visible a={[[1,2],[3,4]]} b={[[5,6],[7,8]]} />
```

| 组件 | 参数 | 说明 |
|---|---|---|
| `MatMul` | `a: number[][]`、`b: number[][]`、`title?: string` | 矩阵乘法逐元素演示，高亮 A 的一行和 B 的一列 |

只有 `.mdx` 文件可以使用组件，`.md` 文件请改名为 `.mdx`。

### 操作方式

| 操作 | 鼠标 | 键盘（播放器获得焦点时） |
|---|---|---|
| 播放 / 暂停 | ▶ 按钮 | Space |
| 上一步 / 下一步 | ◀ ▶ 按钮 | ← / → |
| 第一步 / 最后一步 | — | Home / End |
| 拖动进度 | 进度条 | — |
| 速度 | 0.5× / 1× / 2× | — |

- 每一步都有一句中文说明，位于 `aria-live="polite"` 区域，屏幕阅读器会读出。
- 开启系统的“减少动态效果”（`prefers-reduced-motion`）后，不会自动播放，也不做插值动画。
- 没有 JavaScript 时，页面显示第一步的静态内容。

## 二、现有组件的结构

```text
src/explainers/
├─ core/                        # 纯 TypeScript，不能导入 react 或访问 DOM
│  ├─ timeline.ts               # Step<S> = { state, caption, focus? }
│  ├─ format.ts                 # 数字格式化
│  └─ algorithms/matmul.ts      # matmul(a, b) → Timeline<MatMulState>
├─ react/
│  ├─ Player.tsx                # 通用播放器：控制条、键盘、aria-live
│  ├─ usePlayer.ts              # 播放状态与定时器
│  ├─ primitives/               # Matrix、Cell、Label 等 SVG 原语
│  └─ MatMul.tsx                # 组件：算法 + Player + 渲染
└─ explainers.css
```

## 三、新增一个讲解组件

新增组件分三步：算法放在 `core/`，渲染放在 `react/`，样式用令牌变量。

### 1. 写算法（core）

算法是纯函数，输入参数，返回预先生成的全部步骤：

```ts
// src/explainers/core/algorithms/my-algo.ts
import type { Timeline } from '../timeline';

export interface MyState { /* 某一步的数据快照 */ }

export function myAlgo(input: number[]): Timeline<MyState> {
  // 每一步：state（这一步的完整状态）、caption（中文说明）、focus（可选，需要高亮的元素 id）
  return [{ state: { /* ... */ }, caption: '第一步：……' }];
}
```

规则：

- 每一步都要有 `caption`，写完整的中文句子，包含具体数字，例如 `C[1][0] = 3×5 + 4×7 = 43`。
- 算法只依赖数据，不依赖 React 或 DOM。
- 为算法写 vitest 单元测试，放在同目录，例如 `matmul.test.ts`。运行 `pnpm exec vitest run src/explainers`。

### 2. 写渲染器（react）

渲染器接收单个步骤并输出 SVG，自身没有业务状态。外层用 `Player` 包裹：

```tsx
// src/explainers/react/MyAlgo.tsx
import { myAlgo, type MyState } from '../core/algorithms/my-algo';
import Player from './Player';

export default function MyAlgo({ input }: { input: number[] }) {
  const steps = myAlgo(input);
  return (
    <Player steps={steps} label="我的算法演示">
      {(step) => (
        <svg viewBox="0 0 640 240" width="100%" role="img" aria-label={step.caption}>
          {/* 根据 step.state 与 step.focus 绘制 */}
        </svg>
      )}
    </Player>
  );
}
```

规则：

- `Player` 的 `steps` 与 `label` 必需；`children` 是 `(step, index) => ReactNode`。
- SVG 使用 `viewBox`，宽度 `100%`，放进 `.wisp-wide` 容器，以便在移动端缩放。
- 每个单元格在移动端至少 28px。
- 相邻状态之间的动画可以用 Motion 实现。高频变化的属性用 motion value 直接修改 DOM，避免每帧重渲染 React。
- 默认 SVG 元素数量应控制在 2000 以内。超出时改用 `<canvas>`。

### 3. 颜色和样式

- 颜色只能使用令牌变量：`var(--wisp-sem-q)`、`var(--wisp-hue-*)`、`var(--wisp-*)` 等。例如矩阵 A 用 `--wisp-sem-q`（Q 的语义色）。
- **禁止写十六进制颜色**，也不要用 Tailwind 原始色阶或 `dark:` 颜色变体。深浅色切换由令牌自动完成。
- 组件样式写在 `src/explainers/explainers.css` 中，同样只引用变量。
- 语义色的含义见 [图表指南](./diagrams.md) 和 `design/palette.json`。

### 4. 在文章中使用

```mdx
import MyAlgo from '@/explainers/react/MyAlgo';

<MyAlgo client:visible input={[3, 1, 2]} />
```

## 四、约定小结

| 层 | 允许 | 禁止 |
|---|---|---|
| `core/` | 纯 TS、类型、算术 | React、DOM、颜色、Motion |
| `react/` | React、Motion、SVG、令牌变量 | 业务算法（应放 core）、十六进制颜色 |
| 文章 | `client:visible` 导入组件 | 在 `.md` 中使用组件 |

## 五、路线图

目前只内置 `MatMul`。计划中的组件包括 `Attention`（注意力计算和因果掩码）、`Sort`（排序算法对比）和 `KVCache`（推理时缓存增长）。它们尚未实现。
