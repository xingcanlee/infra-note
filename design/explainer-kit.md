# 动画积木（explainer kit）

站点自己的交互讲解积木，建在主题的 `astro-wisp/explainers` 之上。目标是：**一个场景写一次，多篇文章换参数复用**。

## 分层

```
src/explainers/
├─ core/                     纯 TS，不 import react / DOM，必须有 *.test.ts
│  ├─ toy.ts                 全站共用的 toy 输入（TOKENS、DIMS、toyQKV）
│  ├─ masks.ts               读取集合 MaskFn：因果 / 窗口 / 选块 / 跨步 / top-k / 并集
│  ├─ attention.ts           注意力分步时间线（打分→掩码→softmax→加权求和）
│  ├─ kv-cache.ts            缓存方案账本 + 缓存增长时间线
│  └─ cache-bars.ts          四种缓存方案的宽度对照时间线
└─ react/
   ├─ primitives.tsx         Box / Arrow / Bar / Legend / Caption / Group
   ├─ AttentionGrid.tsx      注意力矩阵动画（换 mask 即换机制）
   ├─ KVCacheView.tsx        缓存增长动画 + 右侧账本
   └─ CacheBars.tsx          缓存宽度条形对照
```

规则（与 `design/writing-guide.md` §4.2 一致）：

1. 算法是纯函数 `(options) => Timeline<State>`，预先生成全部步骤，每步带完整句子的 caption。
2. 画面是 `(step) => SVG`，没有内部业务状态；只用 `Tone` 或 `var(--wisp-*)` 取色。
3. **文章目录里不放动画实现**，只写 `import` 和带参数的标签。
4. 新形状在第二篇文章用到时，提到 `react/primitives.tsx`，不在场景里复制。

## 在文章中使用

文件必须是 `.mdx`：

```mdx
import AttentionGrid from '../../../../explainers/react/AttentionGrid';
import { slidingWindow } from '../../../../explainers/core/masks';

<AttentionGrid client:visible />

<AttentionGrid client:visible mask={slidingWindow(2)} title="滑动窗口 w=2：每行最多读 2 个位置" />
```

## 现有积木

| 组件            | 关键参数                                              | 讲什么                                             | 用在              |
| --------------- | ----------------------------------------------------- | -------------------------------------------------- | ----------------- |
| `AttentionGrid` | `mask`、`tokens`、`q/k/v`、`showOutput`               | 一行 Query 如何在读取集合内分配权重并聚合 Value     | DS 01、06–12      |
| `KVCacheView`   | `cfg`（缓存方案）、`prefill`、`layers`                | prefill 建表、decode 读表再追加，右侧实时显存账本   | DS 02、03、04、11 |
| `CacheBars`     | `nH/dK/dV/nGroups/dC/dR`、`tokens`、`layers`          | MHA / GQA / MQA / MLA 的宽度与总账对照              | DS 02、03、04     |

## 计划中的积木

按文章进度补充，接口沿用同一套协议：

| 组件               | 讲什么                                      | 用在           |
| ------------------ | ------------------------------------------- | -------------- |
| `MatMulView`       | 矩阵乘逐元素累加（已有 `src/explainers/react/MatMul.tsx`，待并入本套命名） | DS 00、05      |
| `AbsorbView`       | MLA 矩阵吸收前后的计算顺序重排              | DS 05          |
| `RoutingFlow`      | token → gate 打分 → top-k 专家 → 合并       | DS 13、14      |
| `OnlineSoftmax`    | 分块遍历中维护 running max / sum            | DS 18          |
| `SubmitTimeline`   | CPU 提交与设备执行两条车道                  | DS 19、vLLM 00/01/03 |
| `BucketDispatch`   | batch → 图桶匹配 → padding → replay / 回退  | vLLM 05、06    |
| `LifecycleMachine` | 预热 → 捕获 → 重放 → 失效                   | vLLM 03、07    |

## 测试

```bash
pnpm test        # vitest run，只测 core
pnpm check       # astro check + tsc + vitest + 图表校验
```

core 的每个模块都要覆盖：边界输入报错、时间线首尾状态、步骤数与语义（如「每行权重和为 1」）、以及换参数后的不变量（如「窗口足够大时与因果等价」）。
