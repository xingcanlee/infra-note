/**
 * 在线 softmax：分块遍历时维护 running max 与 running sum，不物化整行分数。
 *
 * 标准形式（FlashAttention）：
 *   m_j = max(m_{j-1}, rowmax(S_j))
 *   ℓ_j = e^{m_{j-1}-m_j} ℓ_{j-1} + rowsum(e^{S_j-m_j})
 *   O_j = e^{m_{j-1}-m_j} O_{j-1} + e^{S_j-m_j} V_j
 *
 * FlashAttention-4 的 conditional rescaling（§3.1.4 式 (6)）：只有当 m_j−m_{j−1} > τ
 * 时才对 O 重缩放，否则沿用旧的 m_{j−1} 做指数。论文取 τ = log2(256) = 8（以 2 为底）。
 *
 * 用在：DS 18。
 */
import { formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';

export type OSPhase = 'intro' | 'block' | 'rescale' | 'skip' | 'normalize' | 'done';

export interface OSState {
  /** 全部分数（只用于画图；算法本身从不物化整行） */
  scores: number[];
  /** 分块大小 */
  blockSize: number;
  /** 当前处理到第几块 */
  block: number;
  /** running max / running sum / 未归一化输出 */
  m: number;
  l: number;
  o: number;
  /** 上一块的 m，用于显示是否发生 rescale */
  prevM: number;
  /** 已处理的分数个数 */
  seen: number;
  /** 本步是否做了 rescale */
  rescaled: boolean;
  /** 累计 rescale 次数与跳过次数 */
  nRescale: number;
  nSkip: number;
  /** 是否启用 FA4 的条件重缩放 */
  conditional: boolean;
  tau: number;
  /** 最终结果（归一化后）；未完成为 null */
  result: number | null;
  phase: OSPhase;
}

export interface OSOptions {
  scores: number[];
  /** 对应的 V（一维标量，便于演示加权求和） */
  values: number[];
  blockSize: number;
  /** 启用 FA4 的条件重缩放 */
  conditional?: boolean;
  /** 阈值，论文取 log2(256) = 8 */
  tau?: number;
}

export function onlineSoftmax(opts: OSOptions): Timeline<OSState> {
  const { scores, values, blockSize } = opts;
  const conditional = opts.conditional ?? false;
  const tau = opts.tau ?? 8;
  if (scores.length !== values.length)
    throw new Error(`分数与 V 的长度必须相同：${scores.length}/${values.length}`);
  if (blockSize < 1) throw new Error('块大小必须 ≥ 1');

  let m = -Infinity;
  let l = 0;
  let o = 0;
  let nRescale = 0;
  let nSkip = 0;

  const snap = (over: Partial<OSState> & { phase: OSPhase }): OSState => ({
    scores,
    blockSize,
    block: 0,
    m,
    l,
    o,
    prevM: m,
    seen: 0,
    rescaled: false,
    nRescale,
    nSkip,
    conditional,
    tau,
    result: null,
    ...over,
  });

  const nBlocks = Math.ceil(scores.length / blockSize);
  const tl: Timeline<OSState> = [
    {
      state: snap({ phase: 'intro' }),
      caption: `${scores.length} 个分数，按 ${blockSize} 个一块分成 ${nBlocks} 块。全程只保留 3 个标量（m、ℓ、O）——**不物化整行分数**，这就是 FlashAttention 省显存的根源。`,
    },
  ];

  for (let b = 0; b < nBlocks; b++) {
    const s = scores.slice(b * blockSize, (b + 1) * blockSize);
    const v = values.slice(b * blockSize, (b + 1) * blockSize);
    const prevM = m;
    const blockMax = Math.max(...s);
    const newM = Math.max(prevM, blockMax);

    // 是否需要对已有的 O / ℓ 重缩放
    const grew = prevM === -Infinity ? Infinity : newM - prevM;
    const doRescale = !conditional || grew > tau || prevM === -Infinity;

    if (doRescale) {
      const scale = prevM === -Infinity ? 0 : Math.exp(prevM - newM);
      l = scale * l + s.reduce((a, x) => a + Math.exp(x - newM), 0);
      o = scale * o + s.reduce((a, x, i) => a + Math.exp(x - newM) * v[i], 0);
      m = newM;
      nRescale++;
    } else {
      // 不重缩放：沿用旧的 m 做指数，O 和 ℓ 直接累加
      l = l + s.reduce((a, x) => a + Math.exp(x - prevM), 0);
      o = o + s.reduce((a, x, i) => a + Math.exp(x - prevM) * v[i], 0);
      nSkip++;
    }

    tl.push({
      state: snap({
        phase: doRescale ? 'rescale' : 'skip',
        block: b,
        prevM,
        seen: Math.min((b + 1) * blockSize, scores.length),
        rescaled: doRescale,
      }),
      caption: doRescale
        ? `第 ${b} 块：块内最大值 ${f(blockMax)}，running max ${prevM === -Infinity ? '−∞' : f(prevM)} → ${f(m)}。${prevM === -Infinity ? '第一块，直接累加。' : `最大值涨了 ${f(grew)}，**对已有的 O 和 ℓ 重缩放** e^{${f(prevM)}−${f(m)}}。`} 现在 ℓ=${f(l)}、O=${f(o)}。`
        : `第 ${b} 块：块内最大值 ${f(blockMax)}，running max 只涨了 ${f(grew)} ≤ τ=${tau} → **跳过重缩放**，沿用旧的 m 做指数直接累加。省下一轮向量乘。`,
      focus: s.map((_, i) => itemId('score', b * blockSize + i)),
    });
  }

  const result = o / l;
  tl.push({
    state: snap({ phase: 'normalize', seen: scores.length, result }),
    caption: `最后一次性归一化：Output = O / ℓ = ${f(o)} / ${f(l)} = ${f(result)}。注意除法只做一次，不是每块都做。`,
  });

  tl.push({
    state: snap({ phase: 'done', seen: scores.length, result }),
    caption: conditional
      ? `完成。${nRescale} 次重缩放、${nSkip} 次跳过——跳过的那些省掉了对整个 O 向量的乘法，而结果与标准形式在容差内相同。`
      : `完成。全程 ${nRescale} 次重缩放。峰值只存了 3 个标量，而朴素实现要存全部 ${scores.length} 个分数。`,
  });

  return tl;
}

/** 朴素 softmax 加权求和，用于核对在线版本的正确性。 */
export function referenceSoftmaxDot(scores: number[], values: number[]): number {
  const m = Math.max(...scores);
  const e = scores.map((x) => Math.exp(x - m));
  const sum = e.reduce((a, x) => a + x, 0);
  return e.reduce((a, x, i) => a + x * values[i], 0) / sum;
}
