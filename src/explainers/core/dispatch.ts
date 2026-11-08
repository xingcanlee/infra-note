/**
 * 图桶选路：把一个 batch 匹配到已捕获的某张图，匹配不上就回退 eager。
 *
 * 匹配条件照搬 vLLM 本地快照（commit cf5cea2d）的
 * `vllm/v1/worker/gpu/cudagraph_utils.py:_is_compatible`：
 *
 *   (desc.uniformTokenCount === null || desc.uniformTokenCount === uniformTokenCount)
 *   && (desc.maxQueryLen === null || (maxQueryLen !== null && desc.maxQueryLen >= maxQueryLen))
 *   && (desc.numReqs === null || desc.numReqs >= numReqs)
 *   && desc.numTokens >= numTokens
 *   && desc.numActiveLoras === numActiveLoras
 *   && desc.numUbatches === numUbatches
 *
 * 注意不对称：token 与 req 是「图的容量 ≥ 本轮需要」（所以要 padding），
 * 而 LoRA 数和 ubatch 数必须 **严格相等**。
 *
 * 用在：vLLM 05、06。
 */
import { formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';

export type CgMode = 'NONE' | 'PIECEWISE' | 'FULL';

/** 一张已捕获的图（对应 BatchExecutionDescriptor）。 */
export interface GraphDesc {
  cgMode: CgMode;
  numTokens: number;
  /** null 表示不限制请求数（PIECEWISE 图） */
  numReqs: number | null;
  /** null 表示不限制每请求 token 数（PIECEWISE 图） */
  uniformTokenCount?: number | null;
  /** null 表示图不约束 query 长度 */
  maxQueryLen?: number | null;
  numActiveLoras?: number;
  numUbatches?: number;
}

/** 本轮要跑的 batch。 */
export interface BatchReq {
  numReqs: number;
  numTokens: number;
  /** 所有请求 token 数相同时为该值，否则 null（非统一批次） */
  uniformTokenCount: number | null;
  maxQueryLen?: number | null;
  numActiveLoras?: number;
  numUbatches?: number;
}

export interface CheckResult {
  ok: boolean;
  /** 逐条检查的结果，顺序与源码一致 */
  checks: Array<{ name: string; ok: boolean; detail: string }>;
}

export function isCompatible(desc: GraphDesc, req: BatchReq): CheckResult {
  const dUtc = desc.uniformTokenCount ?? null;
  const dMql = desc.maxQueryLen ?? null;
  const dLora = desc.numActiveLoras ?? 0;
  const dUb = desc.numUbatches ?? 1;
  const rMql = req.maxQueryLen ?? null;
  const rLora = req.numActiveLoras ?? 0;
  const rUb = req.numUbatches ?? 1;

  const checks = [
    {
      name: '每请求 token 数',
      ok: dUtc === null || dUtc === req.uniformTokenCount,
      detail: dUtc === null ? '图不限制（PIECEWISE）' : `图要求恰好 ${dUtc}，本轮 ${req.uniformTokenCount ?? '非统一'}`,
    },
    {
      name: 'query 长度上界',
      ok: dMql === null || (rMql !== null && dMql >= rMql),
      detail: dMql === null ? '图不约束' : `图上界 ${dMql}，本轮 ${rMql ?? '未跟踪'}`,
    },
    {
      name: '请求数容量',
      ok: desc.numReqs === null || desc.numReqs >= req.numReqs,
      detail: desc.numReqs === null ? '图不限制' : `图容量 ${desc.numReqs} ≥ 本轮 ${req.numReqs}？`,
    },
    {
      name: 'token 容量',
      ok: desc.numTokens >= req.numTokens,
      detail: `图容量 ${desc.numTokens} ≥ 本轮 ${req.numTokens}？`,
    },
    {
      name: 'LoRA 数（必须相等）',
      ok: dLora === rLora,
      detail: `图 ${dLora} == 本轮 ${rLora}？`,
    },
    {
      name: 'ubatch 数（必须相等）',
      ok: dUb === rUb,
      detail: `图 ${dUb} == 本轮 ${rUb}？`,
    },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

/** 回退用的 eager 描述符。 */
export const eagerDesc = (req: BatchReq): GraphDesc => ({
  cgMode: 'NONE',
  numTokens: req.numTokens,
  numReqs: req.numReqs,
  numActiveLoras: req.numActiveLoras ?? 0,
  numUbatches: req.numUbatches ?? 1,
});

/** 在候选图里按顺序找第一个兼容的；找不到返回 eager。 */
export function dispatch(graphs: GraphDesc[], req: BatchReq): { desc: GraphDesc; matchedIndex: number | null } {
  for (let i = 0; i < graphs.length; i++) {
    if (isCompatible(graphs[i], req).ok) return { desc: graphs[i], matchedIndex: i };
  }
  return { desc: eagerDesc(req), matchedIndex: null };
}

/** padding 浪费：图的容量减去本轮实际需要。 */
export function padding(desc: GraphDesc, req: BatchReq) {
  return {
    tokens: Math.max(0, desc.numTokens - req.numTokens),
    reqs: desc.numReqs === null ? 0 : Math.max(0, desc.numReqs - req.numReqs),
  };
}

// ───────────────────────── 分步时间线 ─────────────────────────

export interface DispatchState {
  graphs: GraphDesc[];
  req: BatchReq;
  /** 已检查到第几个候选 */
  examined: number;
  /** 当前正在检查的候选 */
  cur: number | null;
  /** 当前候选的逐条检查结果 */
  checks: CheckResult['checks'] | null;
  /** 命中的候选下标 */
  matched: number | null;
  /** 是否已回退 eager */
  fellBack: boolean;
  padTokens: number;
  phase: 'intro' | 'check' | 'matched' | 'fallback';
}

export function dispatchFlow(graphs: GraphDesc[], req: BatchReq): Timeline<DispatchState> {
  const snap = (over: Partial<DispatchState> & { phase: DispatchState['phase'] }): DispatchState => ({
    graphs,
    req,
    examined: 0,
    cur: null,
    checks: null,
    matched: null,
    fellBack: false,
    padTokens: 0,
    ...over,
  });

  const tl: Timeline<DispatchState> = [
    {
      state: snap({ phase: 'intro' }),
      caption: `本轮：${req.numReqs} 个请求、${req.numTokens} 个 token${req.uniformTokenCount !== null ? `、每请求 ${req.uniformTokenCount} 个 token（统一批次）` : '、长度不统一'}。按顺序找第一张能装下它的图。`,
    },
  ];

  for (let i = 0; i < graphs.length; i++) {
    const r = isCompatible(graphs[i], req);
    const g = graphs[i];
    const failed = r.checks.find((c) => !c.ok);
    if (r.ok) {
      const pad = padding(g, req);
      tl.push({
        state: snap({ phase: 'matched', examined: i + 1, cur: i, checks: r.checks, matched: i, padTokens: pad.tokens }),
        caption: `候选 ${i}（${g.cgMode}，容量 ${g.numTokens} token）：六项全过 → 命中。本轮 ${req.numTokens} 个 token 要 padding 到 ${g.numTokens}，浪费 ${pad.tokens} 个（${f((pad.tokens / g.numTokens) * 100, 1)}%）。`,
        focus: [itemId('graph', i)],
      });
      return tl;
    }
    tl.push({
      state: snap({ phase: 'check', examined: i + 1, cur: i, checks: r.checks }),
      caption: `候选 ${i}（${g.cgMode}，容量 ${g.numTokens} token）：「${failed!.name}」不通过——${failed!.detail} 继续看下一个。`,
      focus: [itemId('graph', i)],
    });
  }

  tl.push({
    state: snap({ phase: 'fallback', examined: graphs.length, fellBack: true }),
    caption: `所有候选都不兼容 → 回退 eager（cg_mode = NONE）。注意这是**静默**发生的：结果仍然正确，只是这一轮没有用上图，变慢了。`,
  });
  return tl;
}
