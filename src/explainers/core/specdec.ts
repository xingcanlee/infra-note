/**
 * 推测解码：草稿模块一次提出若干 token，主模型一次性验证，从第一个不匹配处截断。
 *
 * 关键性质（本模块用断言保证）：无论草稿质量如何，**输出分布与逐个生成完全相同**，
 * 因为被接受的 token 必须与主模型自己会产生的 token 一致。草稿只影响速度。
 *
 * 用在：DS 14（MTP）、DS 17（DSpark）。
 */
import { formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';

export type SpecPhase = 'intro' | 'draft' | 'verify' | 'accept' | 'reject' | 'commit' | 'done';

export interface SpecState {
  /** 已确定的输出 */
  committed: string[];
  /** 本轮草稿提出的 token */
  draft: string[];
  /** 主模型在同样位置会产生的 token（验证依据） */
  truth: string[];
  /** 本轮已验证到第几个（-1 表示还没开始） */
  verified: number;
  /** 本轮接受了几个 */
  accepted: number;
  /** 第一个被拒的位置；null 表示全接受 */
  rejectedAt: number | null;
  /** 第几轮 */
  round: number;
  phase: SpecPhase;
  /** 累计：主模型前向次数、产出 token 数 */
  forwards: number;
  produced: number;
  /** 不用推测解码时，产出同样多 token 需要的前向次数 */
  baselineForwards: number;
}

export interface SpecOptions {
  /** 主模型「真正」会生成的序列 */
  truth: string[];
  /** 草稿模块每轮提出几个 */
  k: number;
  /**
   * 草稿在第 i 个位置是否猜对。长度不足时循环使用。
   * 用显式数组而不是随机数，保证文章、动画、toy 三处数字一致。
   */
  hits: boolean[];
}

export function specDecode(opts: SpecOptions): Timeline<SpecState> {
  const { truth, k, hits } = opts;
  if (k < 1) throw new Error('每轮草稿数必须 ≥ 1');
  if (hits.length === 0) throw new Error('必须给出草稿命中序列');

  const committed: string[] = [];
  let round = 0;
  let forwards = 0;
  let hitIdx = 0;

  const snap = (over: Partial<SpecState> & { phase: SpecPhase }): SpecState => ({
    committed: [...committed],
    draft: [],
    truth,
    verified: -1,
    accepted: 0,
    rejectedAt: null,
    round,
    forwards,
    produced: committed.length,
    baselineForwards: committed.length,
    ...over,
  });

  const tl: Timeline<SpecState> = [
    {
      state: snap({ phase: 'intro' }),
      caption: `目标序列共 ${truth.length} 个 token。不用推测解码的话，要跑 ${truth.length} 次主模型前向——每次只出 1 个 token。`,
    },
  ];

  while (committed.length < truth.length) {
    round++;
    const base = committed.length;

    // ① 草稿：提出 k 个（不超过剩余长度）
    const n = Math.min(k, truth.length - base);
    const draft: string[] = [];
    for (let j = 0; j < n; j++) {
      const ok = hits[hitIdx % hits.length];
      hitIdx++;
      draft.push(ok ? truth[base + j] : `？${base + j}`); // 猜错时给一个不同的 token
    }
    tl.push({
      state: snap({ phase: 'draft', draft }),
      caption: `第 ${round} 轮 · 草稿：轻量模块一口气提出 ${n} 个候选 [${draft.join(', ')}]。这一步比跑主模型便宜得多。`,
      focus: draft.map((_, j) => itemId('draft', j)),
    });

    // ② 验证：主模型一次前向就能对全部候选打分
    forwards++;
    let accepted = 0;
    let rejectedAt: number | null = null;
    for (let j = 0; j < n; j++) {
      if (draft[j] === truth[base + j]) accepted++;
      else {
        rejectedAt = j;
        break;
      }
    }
    tl.push({
      state: snap({ phase: 'verify', draft, verified: n - 1, accepted, rejectedAt, forwards }),
      caption: `第 ${round} 轮 · 验证：主模型**一次**前向就能检查全部 ${n} 个候选——因为它们可以作为一个序列并行打分。这是推测解码成立的前提。`,
    });

    if (rejectedAt === null) {
      for (let j = 0; j < n; j++) committed.push(truth[base + j]);
      // 奖励 token：验证这一轮时，主模型也算出了「最后一个被接受的 token 之后」的分布，
      // 所以全中时可以额外白拿一个。
      let bonus = 0;
      if (committed.length < truth.length) {
        committed.push(truth[committed.length]);
        bonus = 1;
      }
      tl.push({
        state: snap({ phase: 'accept', draft, accepted, forwards }),
        caption: `全部 ${n} 个被接受${bonus ? `，而且主模型在同一次前向里已经算出了下一个 token「${truth[base + n]}」——**白拿一个**` : ''}：这一轮产出 ${n + bonus} 个 token。累计 ${committed.length}/${truth.length}。`,
        focus: draft.map((_, j) => itemId('draft', j)),
      });
    } else {
      // 接受前缀，并用主模型自己的结果纠正第一个错的（这一步是免费的，验证时已经算出来了）
      for (let j = 0; j < rejectedAt; j++) committed.push(truth[base + j]);
      committed.push(truth[base + rejectedAt]);
      tl.push({
        state: snap({ phase: 'reject', draft, accepted, rejectedAt, forwards }),
        caption: `第 ${rejectedAt} 个候选「${draft[rejectedAt]}」与主模型的结果不符 → 从这里截断。前 ${rejectedAt} 个被接受，再**免费**补上主模型自己算出的「${truth[base + rejectedAt]}」，这一轮共产出 ${rejectedAt + 1} 个。`,
        focus: [itemId('draft', rejectedAt)],
      });
    }
  }

  tl.push({
    state: snap({ phase: 'done', forwards }),
    caption: `完成：${truth.length} 个 token 只用了 ${forwards} 次主模型前向（逐个生成要 ${truth.length} 次），相当于 ${f(truth.length / forwards, 2)}× 的前向效率。输出与逐个生成**完全相同**——推测解码不改变结果，只改变速度。`,
  });

  return tl;
}

/**
 * 期望每轮产出的 token 数：接受率 p、每轮草稿 k 个。
 *
 *   E = Σ_{j=0}^{k-1} p^j (1−p)(j+1)  +  p^k (k+1)
 *
 * 前一项是「前 j 个接受、第 j+1 个被拒」——此时主模型补上一个，共 j+1 个；
 * 后一项是全中，此时还能白拿一个奖励 token，共 k+1 个。
 * 因此 p=0 时每轮仍有 1 个，p=1 时为 k+1。
 */
export function expectedTokensPerRound(p: number, k: number): number {
  let e = 0;
  for (let j = 0; j < k; j++) e += Math.pow(p, j) * (1 - p) * (j + 1);
  e += Math.pow(p, k) * (k + 1);
  return e;
}
