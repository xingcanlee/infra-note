# 交互式讲解组件（Explainers）

用于演示算法原理、矩阵乘、注意力机制、LLM 推理过程等。使用 React 19 + Motion，以 Astro island 的形式嵌入 MDX。

## 1. 分层

```
src/explainers/
├─ core/                        # 纯 TS，不能 import react 或 DOM
│  ├─ timeline.ts               # Step<S> = { state: S; caption: string; focus?: string[] }
│  ├─ format.ts                 # 数字、矩阵格式化
│  └─ algorithms/
│     ├─ matmul.ts              # (A, B) => Step<MatMulState>[]
│     ├─ attention.ts
│     └─ sort.ts
├─ react/
│  ├─ Player.tsx                # 通用播放器：播放/暂停/单步/进度/速度/键盘/aria-live
│  ├─ usePlayer.ts
│  ├─ primitives/               # Matrix.tsx、Cell.tsx、Arrow.tsx、Label.tsx（SVG 原语，只用 --wisp-* 变量）
│  ├─ MatMul.tsx
│  └─ Attention.tsx
└─ explainers.css
```

规则：

1. **算法是 `(input) => Step[]` 形式的纯函数**，预先生成全部步骤。每一步都附带一句中文 caption，例如“C[1][0] = 3×5 + 4×7 = 43”。这些函数必须有 vitest 单测。
2. **渲染器是 `(step) => SVG`**，没有内部业务状态。动画由 Motion 在相邻状态之间做插值，高频变化的属性用 motion value 直接改 DOM，不触发 React 重渲染。
3. **颜色**：只能使用 `var(--wisp-sem-*)` / `var(--wisp-hue-*)` / `var(--wisp-*)`，例如矩阵 A 用 `--wisp-sem-q`。禁止写十六进制颜色。
4. **尺寸**：SVG 使用 viewBox，宽度 100%，放在 `.wisp-wide` 容器里。移动端需要能看清（每个单元格至少 28px）。

## 2. Player 交互约定

| 操作 | 鼠标 | 键盘（Player 获得焦点时） |
|---|---|---|
| 播放 / 暂停 | ▶ 按钮 | Space |
| 上一步 / 下一步 | ◀ ▶ 按钮 | ← / → |
| 第一步 / 最后一步 | | Home / End |
| 拖动进度 | range 滑块 | |
| 速度 | 0.5× / 1× / 2× | |

- caption 区域设置 `aria-live="polite"`。
- 在 `prefers-reduced-motion` 下，不自动播放、不做插值，直接切换到下一步的状态。
- **SSR**：Astro 会把第一步渲染成静态 HTML（React 服务端渲染），没有 JS 时显示第一步加上 caption。
- 使用 `client:visible` 进行 hydration。

## 3. MDX 用法

```mdx
import MatMul from '@/explainers/react/MatMul';

<MatMul client:visible a={[[1, 2], [3, 4]]} b={[[5, 6], [7, 8]]} />
```

## 4. 首批组件（MVP 只做 MatMul，其余列入后续）

| 组件 | 内容 | 阶段 |
|---|---|---|
| MatMul | 逐元素累加，同时高亮 A 的一行和 B 的一列 | MVP |
| Attention | QKᵀ → scale → mask → softmax → ·V，可切换 causal mask | v0.2 |
| Sort | 冒泡、快排对比 | v0.2 |
| KVCache | 逐 token 生成时 cache 的增长 | v0.3 |

## 5. 性能边界

SVG 元素数量控制在 2000 以内。超过时（大型 heatmap 等）改用 `<canvas>`，并由该组件自己读取 CSS 变量（`getComputedStyle`），在 `data-theme` 变化时重绘（用 MutationObserver 监听）。
