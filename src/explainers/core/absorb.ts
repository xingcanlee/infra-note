/**
 * 矩阵吸收：同一个打分 q^T W^UK c 的两种计算顺序，以及各自的乘法次数。
 *
 * naive  ：先把 latent 展开成 K（每个历史位置一次 d_k×d_c 的矩阵向量乘），再和 q 做内积。
 * absorb ：先把 W^UK 乘进 q（每步一次，与历史长度无关），再直接和 latent 做内积。
 *
 * 两者数学上恒等，差别只在「每个历史位置要做多少乘法」以及「要不要物化 K」。
 *
 * 用在：DS 05。
 */
import { cellId, formatNumber as f, type Timeline } from 'astro-wisp/explainers/core';

export type AbsorbMode = 'naive' | 'absorb';
export type AbsorbPhase = 'intro' | 'expand' | 'dot' | 'fold' | 'score' | 'done';

export interface AbsorbState {
  mode: AbsorbMode;
  /** 当前 Query（d_k 维，内容分支） */
  q: number[];
  /** 吸收后的 Query（d_c 维）；absorb 模式下算出后才有值 */
  qTilde: (number | null)[];
  /** 上投影矩阵 W^UK（d_k × d_c） */
  wUk: number[][];
  /** 历史 latent（L × d_c），缓存里真正存着的东西 */
  c: number[][];
  /** naive 模式下临时展开出来的 K（L × d_k）；未展开为 null */
  k: (number | null)[][];
  /** 打分结果（L），未算为 null */
  scores: (number | null)[];
  /** 当前处理的历史位置 */
  s: number | null;
  phase: AbsorbPhase;
  /** 到这一步为止的乘法次数 */
  mults: number;
  /** 这条路径每个历史位置的乘法次数（用于说明随 L 的增长） */
  perToken: number;
  /** 是否需要在显存里物化出 K */
  materializesK: boolean;
}

export interface AbsorbOptions {
  mode: AbsorbMode;
  q: number[];
  wUk: number[][];
  c: number[][];
}

const dot = (a: number[], b: number[]) => a.reduce((acc, x, i) => acc + x * b[i], 0);
const matvec = (m: number[][], x: number[]) => m.map((row) => dot(row, x));
/** W^UK^T q：把上投影矩阵「折」进 Query。 */
const foldIntoQuery = (wUk: number[][], q: number[]): number[] => {
  const dC = wUk[0].length;
  return Array.from({ length: dC }, (_, j) => wUk.reduce((acc, row, i) => acc + row[j] * q[i], 0));
};

export function absorbFlow(opts: AbsorbOptions): Timeline<AbsorbState> {
  const { mode, q, wUk, c } = opts;
  const l = c.length;
  const dK = wUk.length;
  const dC = wUk[0].length;
  if (q.length !== dK) throw new Error(`Query 维度（${q.length}）必须等于 W^UK 的行数（${dK}）`);
  if (c[0].length !== dC)
    throw new Error(`latent 维度（${c[0].length}）必须等于 W^UK 的列数（${dC}）`);

  const k: (number | null)[][] = Array.from({ length: l }, () => Array(dK).fill(null));
  const scores: (number | null)[] = Array(l).fill(null);
  let qTilde: (number | null)[] = Array(dC).fill(null);
  let mults = 0;

  // naive：每个历史位置 d_k×d_c（展开 K）+ d_k（内积）
  // absorb：每个历史位置只有 d_c（内积）；折叠 Query 是每步一次的固定成本
  const perToken = mode === 'naive' ? dK * dC + dK : dC;

  const snap = (phase: AbsorbPhase, s: number | null): AbsorbState => ({
    mode,
    q,
    qTilde: qTilde.slice(),
    wUk,
    c: c.map((r) => r.slice()),
    k: k.map((r) => r.slice()),
    scores: scores.slice(),
    s,
    phase,
    mults,
    perToken,
    materializesK: mode === 'naive',
  });

  const tl: Timeline<AbsorbState> = [
    {
      state: snap('intro', null),
      caption:
        mode === 'naive'
          ? `朴素顺序：对每个历史位置，先用 W^UK 把 ${dC} 维 latent 展开成 ${dK} 维 Key，再与 Query 做内积。每个位置 ${perToken} 次乘法。`
          : `吸收顺序：先把 W^UK 折进 Query（一次性），得到 ${dC} 维的 q̃，然后直接与 latent 做内积。每个位置只要 ${perToken} 次乘法。`,
    },
  ];

  if (mode === 'absorb') {
    // 折叠：q̃ = W^UK^T q，与历史长度无关，每步只做一次
    const qt = foldIntoQuery(wUk, q);
    qTilde = qt;
    mults += dK * dC;
    tl.push({
      state: snap('fold', null),
      caption: `折叠：q̃ = (W^UK)ᵀ q = [${qt.map((x) => f(x)).join(', ')}]。这 ${dK * dC} 次乘法与历史有多长无关——只做一次，不随 L 增长。`,
      focus: Array.from({ length: dC }, (_, i) => cellId('qt', 0, i)),
    });
  }

  for (let s = 0; s < l; s++) {
    if (mode === 'naive') {
      const ks = matvec(wUk, c[s]);
      k[s] = ks;
      mults += dK * dC;
      tl.push({
        state: snap('expand', s),
        caption: `展开：k${s} = W^UK · c${s} = [${ks.map((x) => f(x)).join(', ')}]。这一步要为每个历史位置各做 ${dK * dC} 次乘法，而且结果得占显存。`,
        focus: [
          ...Array.from({ length: dC }, (_, i) => cellId('c', s, i)),
          ...Array.from({ length: dK }, (_, i) => cellId('k', s, i)),
        ],
      });

      const e = dot(q, ks);
      scores[s] = e;
      mults += dK;
      tl.push({
        state: snap('dot', s),
        caption: `打分：qᵀk${s} = ${f(e)}（${dK} 次乘法）。累计 ${mults} 次乘法。`,
        focus: [cellId('scores', 0, s)],
      });
    } else {
      const e = dot(
        qTilde.map((x) => x!),
        c[s],
      );
      scores[s] = e;
      mults += dC;
      tl.push({
        state: snap('dot', s),
        caption: `打分：q̃ᵀc${s} = ${f(e)}（只要 ${dC} 次乘法，而且读的是窄的 latent）。累计 ${mults} 次乘法。缓存里的 K 从未被展开。`,
        focus: [...Array.from({ length: dC }, (_, i) => cellId('c', s, i)), cellId('scores', 0, s)],
      });
    }
  }

  tl.push({
    state: snap('done', null),
    caption:
      mode === 'naive'
        ? `朴素顺序合计 ${mults} 次乘法，并且物化了 ${l}×${dK} 个 Key 元素。历史越长，这两项都线性增长。`
        : `吸收顺序合计 ${mults} 次乘法，没有物化任何 Key。两条路径的打分结果完全相同——这是同一个式子的两种结合方式。`,
  });

  return tl;
}

/** 两种顺序的乘法次数对照（用于文章表格与自测）。 */
export function absorbCost(l: number, dK: number, dC: number) {
  return {
    naive: l * (dK * dC + dK),
    absorb: dK * dC + l * dC,
    /** naive 要物化的 K 元素个数 */
    naiveKElems: l * dK,
  };
}
