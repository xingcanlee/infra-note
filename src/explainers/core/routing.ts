/**
 * MoE 路由的分步时间线：打分 → 分组筛选 → top-k 选专家 → 归一化 → 加权合并（含共享专家）。
 *
 * 字段命名对齐 DeepSeek-V3 参考实现的 Gate（inference/model.py:535-598）：
 * score_func、bias、n_groups/topk_groups、topk、route_scale、n_shared_experts。
 *
 * 用在：DS 13（DeepSeekMoE）。
 */
import { formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';

export type RoutePhase = 'intro' | 'score' | 'bias' | 'group' | 'topk' | 'norm' | 'expert' | 'shared' | 'done';

export interface RouteState {
  tokens: string[];
  /** 当前 token 下标 */
  t: number;
  /** 每个专家的原始打分 */
  scores: number[];
  /** 加了 bias 之后用于选择的分数（仅影响选择，不影响权重） */
  selScores: (number | null)[];
  /** 每个专家所属的组 */
  group: number[];
  /** 被保留的组 */
  keptGroups: number[];
  /** 被选中的专家下标 */
  chosen: number[];
  /** 选中专家的归一化权重（与 chosen 对齐） */
  weights: (number | null)[];
  /** 已经完成计算的专家 */
  computed: number[];
  nShared: number;
  phase: RoutePhase;
  /** 这一轮激活了多少专家（含共享） */
  activated: number;
  nExperts: number;
}

export interface RouteOptions {
  tokens: string[];
  /** 每个 token 对每个专家的打分（L × nExperts） */
  logits: number[][];
  topk: number;
  /** 分组数；1 表示不分组 */
  nGroups?: number;
  /** 保留几个组 */
  topkGroups?: number;
  /** 每个专家的选择 bias（只影响选谁，不影响权重） */
  bias?: number[];
  /** 共享专家个数：每个 token 都要过 */
  nShared?: number;
  /** 'softmax' 或 'sigmoid' */
  scoreFunc?: 'softmax' | 'sigmoid';
  routeScale?: number;
}

const softmax = (z: number[]): number[] => {
  const m = Math.max(...z);
  const e = z.map((x) => Math.exp(x - m));
  const s = e.reduce((a, x) => a + x, 0);
  return e.map((x) => x / s);
};
const sigmoid = (z: number[]): number[] => z.map((x) => 1 / (1 + Math.exp(-x)));

export function routing(opts: RouteOptions): Timeline<RouteState> {
  const { tokens, logits, topk } = opts;
  const nExperts = logits[0].length;
  const nGroups = opts.nGroups ?? 1;
  const topkGroups = opts.topkGroups ?? nGroups;
  const bias = opts.bias ?? Array(nExperts).fill(0);
  const nShared = opts.nShared ?? 1;
  const scoreFunc = opts.scoreFunc ?? 'softmax';
  const routeScale = opts.routeScale ?? 1;
  if (nExperts % nGroups !== 0) throw new Error(`专家数（${nExperts}）必须能被组数（${nGroups}）整除`);
  if (topk > nExperts) throw new Error(`topk（${topk}）不能超过专家数（${nExperts}）`);

  const perGroup = nExperts / nGroups;
  const group = Array.from({ length: nExperts }, (_, i) => Math.floor(i / perGroup));

  const tl: Timeline<RouteState> = [];
  const mk = (over: Partial<RouteState> & { t: number; phase: RoutePhase; scores: number[] }): RouteState => ({
    tokens,
    selScores: Array(nExperts).fill(null),
    group,
    keptGroups: [],
    chosen: [],
    weights: [],
    computed: [],
    nShared,
    activated: 0,
    nExperts,
    ...over,
  });

  tl.push({
    state: mk({ t: 0, phase: 'intro', scores: Array(nExperts).fill(0) }),
    caption: `${nExperts} 个路由专家 + ${nShared} 个共享专家。每个 token 只激活 ${topk} 个路由专家——这就是 MoE 省计算的全部秘密：参数很多，但每个 token 只用一小部分。`,
  });

  for (let t = 0; t < tokens.length; t++) {
    const raw = scoreFunc === 'softmax' ? softmax(logits[t]) : sigmoid(logits[t]);

    tl.push({
      state: mk({ t, phase: 'score', scores: raw }),
      caption: `「${tokens[t]}」的 gate 打分（${scoreFunc}）：[${raw.map((x) => f(x)).join(', ')}]。分数由一个很小的线性层算出，代价远低于跑一个专家。`,
      focus: raw.map((_, i) => itemId('expert', i)),
    });

    // bias 只影响「选谁」，不影响最终权重 —— 这是负载均衡的关键设计
    const sel = raw.map((x, i) => x + bias[i]);
    const hasBias = bias.some((b) => b !== 0);
    if (hasBias) {
      tl.push({
        state: mk({ t, phase: 'bias', scores: raw, selScores: sel }),
        caption: `加上均衡 bias 后用于选择的分数：[${sel.map((x) => f(x)).join(', ')}]。bias 只改变「选谁」，不进入最终权重——所以均衡负载不会污染输出。`,
        focus: bias.map((b, i) => (b !== 0 ? itemId('expert', i) : '')).filter(Boolean),
      });
    }

    // 分组筛选：先淘汰整组，再在组内选
    let keptGroups = Array.from({ length: nGroups }, (_, g) => g);
    if (nGroups > 1 && topkGroups < nGroups) {
      const gScore = keptGroups.map((g) => {
        const inG = sel.filter((_, i) => group[i] === g);
        return { g, v: Math.max(...inG) };
      });
      gScore.sort((a, b) => (b.v !== a.v ? b.v - a.v : a.g - b.g));
      keptGroups = gScore.slice(0, topkGroups).map((x) => x.g).sort((a, b) => a - b);
      tl.push({
        state: mk({ t, phase: 'group', scores: raw, selScores: sel, keptGroups }),
        caption: `分组筛选：${nGroups} 组里保留 ${topkGroups} 组（第 ${keptGroups.join('、')} 组）。分组的目的是限制一个 token 会打到多少台机器上——跨机通信比计算贵。`,
        focus: keptGroups.flatMap((g) => group.map((gg, i) => (gg === g ? itemId('expert', i) : '')).filter(Boolean)),
      });
    }

    // top-k
    const cands = sel
      .map((v, i) => ({ i, v }))
      .filter((x) => keptGroups.includes(group[x.i]))
      .sort((a, b) => (b.v !== a.v ? b.v - a.v : a.i - b.i));
    const chosen = cands.slice(0, topk).map((x) => x.i).sort((a, b) => a - b);
    tl.push({
      state: mk({ t, phase: 'topk', scores: raw, selScores: sel, keptGroups, chosen }),
      caption: `选出 top-${topk}：专家 ${chosen.join('、')}。其余 ${nExperts - chosen.length} 个专家这一轮完全不参与计算——它们的参数在显存里，但不产生 FLOPs。`,
      focus: chosen.map((i) => itemId('expert', i)),
    });

    // 归一化：只在被选中的专家之间，用原始分数（不含 bias）
    const sum = chosen.reduce((a, i) => a + raw[i], 0);
    const weights = chosen.map((i) => (raw[i] / sum) * routeScale);
    tl.push({
      state: mk({ t, phase: 'norm', scores: raw, selScores: sel, keptGroups, chosen, weights }),
      caption: `归一化权重（用不含 bias 的原始分数）：[${weights.map((x) => f(x)).join(', ')}]${routeScale !== 1 ? `，再乘 route_scale=${routeScale}` : ''}。`,
      focus: chosen.map((i) => itemId('expert', i)),
    });

    const computed: number[] = [];
    for (const i of chosen) {
      computed.push(i);
      tl.push({
        state: mk({ t, phase: 'expert', scores: raw, selScores: sel, keptGroups, chosen, weights, computed: [...computed] }),
        caption: `专家 ${i} 处理「${tokens[t]}」，输出乘以权重 ${f(weights[chosen.indexOf(i)]!)} 后累加。`,
        focus: [itemId('expert', i)],
      });
    }

    tl.push({
      state: mk({
        t,
        phase: 'shared',
        scores: raw,
        selScores: sel,
        keptGroups,
        chosen,
        weights,
        computed: [...computed],
        activated: chosen.length + nShared,
      }),
      caption: `再加上 ${nShared} 个共享专家（每个 token 都过，不参与路由）。本轮共激活 ${chosen.length + nShared} / ${nExperts + nShared} 个专家。共享专家负责「人人都要的通用能力」，让路由专家可以专注分工。`,
      focus: Array.from({ length: nShared }, (_, i) => itemId('shared', i)),
    });
  }

  tl.push({
    state: mk({ t: tokens.length - 1, phase: 'done', scores: Array(nExperts).fill(0), activated: topk + nShared }),
    caption: `注意每个 token 选的专家可以完全不同——路由是逐 token 的。这带来一个系统问题：同一个 batch 里的 token 会散到不同专家上，负载可能极不均衡。`,
  });

  return tl;
}

/** 激活比例：MoE 的「参数多、计算少」用这个量化。 */
export function activationRatio(nExperts: number, topk: number, nShared = 0) {
  return (topk + nShared) / (nExperts + nShared);
}
