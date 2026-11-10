/**
 * 注意力「读取集合」的统一表示。
 *
 * 稀疏注意力的各种变体（滑动窗口、选块、indexer top-k……）在这一层只有一个区别：
 * 位置 t 允许读取哪些位置 s。把它统一成 MaskFn 之后，同一个动画、同一段 toy 代码
 * 就能对照全部机制（见 design/series-plan.md 阶段 2）。
 */

/** 位置 t 是否允许读取位置 s（L 为当前序列长度）。true = 可读。 */
export type MaskFn = (t: number, s: number, l: number) => boolean;

export interface MaskSpec {
  /** 稳定 id，供文章与动画引用 */
  id: string;
  /** 展示名 */
  name: string;
  /** 一句话说明它改了哪条轴 */
  describe: string;
  fn: MaskFn;
}

/** 因果掩码：只能读自己和左边。所有自回归模型的基线。 */
export const causal: MaskFn = (t, s) => s <= t;

/**
 * 滑动窗口：只读最近 w 个位置（含自己）。
 * w = 3、t = 5 时可读 {3, 4, 5}。
 */
export const slidingWindow =
  (w: number): MaskFn =>
  (t, s) =>
    s <= t && t - s < w;

/**
 * 窗口 + 前缀锚点：窗口之外再保留最靠前的 nSink 个位置。
 * 对应「attention sink」类做法：开头几个 token 的分数通常不能丢。
 */
export const windowWithSink =
  (w: number, nSink = 1): MaskFn =>
  (t, s) =>
    s <= t && (t - s < w || s < nSink);

/**
 * 分块选取：把序列切成大小为 blockSize 的块，只读最近 keep 个块（含当前块）。
 * NSA / CSA 的「选块」分支在 toy 规模下的形状。
 */
export const blockSelect =
  (blockSize: number, keep: number): MaskFn =>
  (t, s) => {
    if (s > t) return false;
    const bt = Math.floor(t / blockSize);
    const bs = Math.floor(s / blockSize);
    return bt - bs < keep;
  };

/**
 * 跨步（dilated）：每 stride 个位置读一个，另外总是读当前位置。
 * 用于说明「均匀稀疏」与「按内容选择」的差别。
 */
export const strided =
  (stride: number): MaskFn =>
  (t, s) =>
    s <= t && (s % stride === 0 || s === t);

/**
 * 按打分取 top-k：由外部给出打分函数（如 DSA 的 lightning indexer），
 * 每个 t 只读分数最高的 k 个历史位置，并总是保留当前位置。
 *
 * 打分相同时取较小的 s，保证结果可复现。
 */
export function topKByScore(score: (t: number, s: number) => number, k: number): MaskFn {
  const cache = new Map<string, Set<number>>();
  return (t, s, l) => {
    if (s > t) return false;
    if (s === t) return true;
    const key = `${t}|${l}`;
    let keep = cache.get(key);
    if (!keep) {
      const cands: Array<{ s: number; v: number }> = [];
      for (let i = 0; i < t; i++) cands.push({ s: i, v: score(t, i) });
      cands.sort((a, b) => (b.v !== a.v ? b.v - a.v : a.s - b.s));
      keep = new Set(cands.slice(0, k).map((c) => c.s));
      cache.set(key, keep);
    }
    return keep.has(s);
  };
}

/** 两个读取集合的并集：NSA 之类的多分支机制由若干分支并起来。 */
export const union =
  (...fns: MaskFn[]): MaskFn =>
  (t, s, l) =>
    fns.some((f) => f(t, s, l));

/** 展开成 L × L 的布尔矩阵。 */
export function maskMatrix(l: number, fn: MaskFn): boolean[][] {
  return Array.from({ length: l }, (_, t) => Array.from({ length: l }, (_, s) => fn(t, s, l)));
}

/** 可读格子数 / 因果可读格子数。因果基线为 1。 */
export function maskDensity(l: number, fn: MaskFn): number {
  let kept = 0;
  const total = (l * (l + 1)) / 2;
  for (let t = 0; t < l; t++) for (let s = 0; s <= t; s++) if (fn(t, s, l)) kept++;
  return kept / total;
}

/** 每一行（每个 t）实际读取的位置数。用于说明「每步代价是否随 L 增长」。 */
export function rowCounts(l: number, fn: MaskFn): number[] {
  return Array.from({ length: l }, (_, t) => {
    let n = 0;
    for (let s = 0; s <= t; s++) if (fn(t, s, l)) n++;
    return n;
  });
}

/**
 * 感受野：在 nLayers 层之后，位置 t 能间接看到的最早位置。
 *
 * 窗口注意力单层只看 w 个位置，但多层叠加后信息可以逐层往前传递；
 * 这个函数用可达性（BFS）算出真实的间接可见范围，而不是用 w × nLayers 估算。
 */
export function receptiveField(l: number, fn: MaskFn, t: number, nLayers: number): number {
  let reach = new Set<number>([t]);
  for (let layer = 0; layer < nLayers; layer++) {
    const next = new Set<number>(reach);
    for (const p of reach) for (let s = 0; s <= p; s++) if (fn(p, s, l)) next.add(s);
    reach = next;
  }
  return Math.min(...reach);
}

/**
 * 本系列反复用到的几种读取集合，供对照动画与表格直接遍历。
 *
 * 读取集合本身与序列长度无关（MaskFn 自己接收 l），因此这里不需要 l；
 * 保留参数只是为了调用处读起来和 maskDensity(l, …) 一致。
 */
export function maskCatalog(_l?: number): MaskSpec[] {
  return [
    {
      id: 'causal',
      name: '因果（全读）',
      describe: '读完左边所有位置，每步代价随 L 线性增长',
      fn: causal,
    },
    {
      id: 'swa',
      name: '滑动窗口 w=2',
      describe: '只读最近 2 个位置，每步代价与 L 无关',
      fn: slidingWindow(2),
    },
    {
      id: 'sink',
      name: '窗口 + 锚点',
      describe: '窗口之外保留开头 1 个位置',
      fn: windowWithSink(2, 1),
    },
    {
      id: 'block',
      name: '选块 2×1',
      describe: '按块粒度选择，缓存与计算都按块对齐',
      fn: blockSelect(2, 1),
    },
    { id: 'strided', name: '跨步 2', describe: '均匀抽样，不看内容', fn: strided(2) },
    {
      id: 'topk',
      name: 'top-k 打分 k=1',
      describe: '按打分选最相关的 1 个历史位置，形状随输入变化',
      fn: topKByScore((t, s) => ((t * 3 + s * 5) % 7) / 7, 1),
    },
    {
      id: 'nsa',
      name: '多分支并集',
      describe: '窗口分支 + 选块分支并起来，兼顾近处与远处',
      fn: union(slidingWindow(2), blockSelect(2, 2)),
    },
  ];
}
