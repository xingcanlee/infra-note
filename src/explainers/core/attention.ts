/**
 * 注意力的分步时间线：打分 → 掩码 → softmax → 加权求和。
 *
 * 读取集合由 MaskFn 决定，因此同一个算法（和同一个画面组件）可以演示
 * 标准因果注意力、滑动窗口、选块、top-k 等全部变体，只需换一个 mask。
 */
import { cellId, formatNumber as f, type Timeline } from 'astro-wisp/explainers/core';
import { causal, type MaskFn } from './masks';

export type AttnPhase = 'intro' | 'score' | 'mask' | 'softmax' | 'aggregate' | 'output' | 'done';

export interface AttnState {
  tokens: string[];
  q: number[][];
  k: number[][];
  v: number[][];
  /** 缩放后的 logits；未计算为 null */
  scores: (number | null)[][];
  /** softmax 之后的权重；未计算为 null */
  weights: (number | null)[][];
  /** 输出行；未写回为 null */
  out: (number | null)[][];
  /** 读取集合：allowed[t][s] */
  allowed: boolean[][];
  /** 当前行 / 当前列 */
  t: number | null;
  s: number | null;
  /** 当前行正在累加的输出向量 */
  partial: (number | null)[];
  phase: AttnPhase;
  scale: number;
}

export interface AttnOptions {
  tokens: string[];
  q: number[][];
  k: number[][];
  v: number[][];
  /** 读取集合，默认因果 */
  mask?: MaskFn;
  /** 1/sqrt(d_k)，默认按 K 的宽度计算 */
  scale?: number;
}

const dot = (a: number[], b: number[]) => a.reduce((acc, x, i) => acc + x * b[i], 0);

/** 数值稳定的 softmax：先减去最大值。被掩盖的位置权重恒为 0。 */
export function maskedSoftmax(logits: Array<number | null>): Array<number | null> {
  const live = logits.filter((x): x is number => x !== null);
  if (live.length === 0) return logits.map(() => null);
  const m = Math.max(...live);
  const exps = logits.map((x) => (x === null ? null : Math.exp(x - m)));
  const sum = exps.reduce((acc: number, x) => acc + (x ?? 0), 0);
  return exps.map((x) => (x === null ? null : x / sum));
}

export function attention(opts: AttnOptions): Timeline<AttnState> {
  const { tokens, q, k, v } = opts;
  const mask = opts.mask ?? causal;
  const l = q.length;
  if (k.length !== l || v.length !== l) throw new Error(`Q/K/V 行数必须相同：${q.length}/${k.length}/${v.length}`);
  if (tokens.length !== l) throw new Error(`token 数（${tokens.length}）必须等于序列长度（${l}）`);
  const dk = k[0].length;
  const dv = v[0].length;
  const scale = opts.scale ?? 1 / Math.sqrt(dk);

  const allowed = Array.from({ length: l }, (_, t) => Array.from({ length: l }, (_, s) => mask(t, s, l)));
  const scores: (number | null)[][] = Array.from({ length: l }, () => Array(l).fill(null));
  const weights: (number | null)[][] = Array.from({ length: l }, () => Array(l).fill(null));
  const out: (number | null)[][] = Array.from({ length: l }, () => Array(dv).fill(null));
  let partial: (number | null)[] = Array(dv).fill(null);

  const snap = (phase: AttnPhase, t: number | null, s: number | null): AttnState => ({
    tokens,
    q,
    k,
    v,
    scores: scores.map((r) => r.slice()),
    weights: weights.map((r) => r.slice()),
    out: out.map((r) => r.slice()),
    allowed,
    t,
    s,
    partial: partial.slice(),
    phase,
    scale,
  });

  const tl: Timeline<AttnState> = [
    {
      state: snap('intro', null, null),
      caption: `序列长 ${l}，每个 head 维度 ${dk}。目标：为每个位置算出一个「读过历史之后」的新向量。`,
    },
  ];

  for (let t = 0; t < l; t++) {
    // ① 打分：当前 Query 与每个允许读取的 Key 做内积
    for (let s = 0; s <= t; s++) {
      if (!allowed[t][s]) {
        tl.push({
          state: snap('mask', t, s),
          caption: `位置 ${t}（${tokens[t]}）不读位置 ${s}（${tokens[s]}）：这个机制把它排除在读取集合外。`,
          focus: [cellId('scores', t, s)],
        });
        continue;
      }
      const raw = dot(q[t], k[s]);
      scores[t][s] = raw * scale;
      tl.push({
        state: snap('score', t, s),
        caption: `打分：q${t}·k${s} = ${f(raw)}，乘 1/√${dk} 得 ${f(scores[t][s]!)}。内积越大，说明「${tokens[t]}」越关注「${tokens[s]}」。`,
        focus: [cellId('q', t, 0), cellId('k', s, 0), cellId('scores', t, s)],
      });
    }

    // ② 归一化：同一行的分数变成和为 1 的权重
    const row = maskedSoftmax(scores[t]);
    for (let s = 0; s < l; s++) weights[t][s] = row[s];
    const kept = Array.from({ length: l }, (_, s) => s).filter((s) => weights[t][s] !== null);
    tl.push({
      state: snap('softmax', t, null),
      caption: `softmax：第 ${t} 行 ${kept.length} 个分数变成和为 1 的权重 [${kept.map((s) => f(weights[t][s]!)).join(', ')}]。权重只在读取集合内分配。`,
      focus: kept.map((s) => cellId('weights', t, s)),
    });

    // ③ 加权求和：按权重把 Value 累加起来
    partial = Array(dv).fill(0);
    for (const s of kept) {
      const w = weights[t][s]!;
      partial = partial.map((x, i) => (x ?? 0) + w * v[s][i]);
      tl.push({
        state: snap('aggregate', t, s),
        caption: `累加：权重 ${f(w)} × v${s} → 当前结果 [${partial.map((x) => f(x!)).join(', ')}]。`,
        focus: [cellId('weights', t, s), cellId('v', s, 0), cellId('out', t, 0)],
      });
    }

    for (let i = 0; i < dv; i++) out[t][i] = partial[i];
    partial = Array(dv).fill(null);
    tl.push({
      state: snap('output', t, null),
      caption: `写回：位置 ${t}（${tokens[t]}）的输出 = [${out[t].map((x) => f(x!)).join(', ')}]。它读的是 ${kept.length} 个历史位置。`,
      focus: Array.from({ length: dv }, (_, i) => cellId('out', t, i)),
    });
  }

  tl.push({
    state: snap('done', null, null),
    caption: `完成。注意：每一行都只在自己的读取集合内分配权重——改变这个集合，就是全部稀疏注意力的做法。`,
  });
  return tl;
}
