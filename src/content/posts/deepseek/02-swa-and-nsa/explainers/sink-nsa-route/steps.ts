import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues } from '@/explainers/kit/motion';

export type SinkNsaMode = 'full_causal' | 'pure_swa' | 'sink_swa' | 'nsa_3branch';

export interface SinkNsaState {
  phase: SinkNsaMode;
  formulaTex: string;
  weightsQ7: readonly number[];
  windowMassPct: string;
  sinkMassPct: string;
  midFactMassPct: string;
}

/** 8-token 因果序列手算基础打分（与正文完全一致，index 0 由滑块 z_0 动态控制） */
export const BASE_REST_LOGITS: readonly number[] = [0.2, 0.1, 0.0, 1.0, 1.2, 1.5, 2.0];
export const RAW_LOGITS_Q7: readonly number[] = [6.0, ...BASE_REST_LOGITS];

/** NSA 中段关键事实位于 t_2（logit = 4.0），其余 8 槽共享同一 8-token 尺度 */
export const MID_FACT_LOGIT_T2 = 4.0;

export function softmaxMasked(logits: readonly number[], mask: readonly boolean[]): number[] {
  const exps = logits.map((v, i) => (mask[i] ? Math.exp(v) : 0));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

export const P_FULL = softmaxMasked(RAW_LOGITS_Q7, [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
]);

export const P_PURE_SWA = softmaxMasked(RAW_LOGITS_Q7, [
  false,
  false,
  false,
  false,
  false,
  true,
  true,
  true,
]);

export const P_SINK_SWA = softmaxMasked(RAW_LOGITS_Q7, [
  true,
  false,
  false,
  false,
  false,
  true,
  true,
  true,
]);

export interface SinkNsaSnapshot {
  weights: number[];
  mask: boolean[];
  sinkMass: number;
  midMass: number;
  windowMass: number;
  windowAmp: number;
  formulaTex: string;
  caption: string;
}

export function computeSinkNsaSnapshot(mode: SinkNsaMode, z0: number): SinkNsaSnapshot {
  const logits = [z0, ...BASE_REST_LOGITS];
  const pFull = softmaxMasked(logits, [true, true, true, true, true, true, true, true]);
  const fullWin = pFull[5] + pFull[6] + pFull[7];

  if (mode === 'full_causal') {
    const mask = [true, true, true, true, true, true, true, true];
    const sinkMass = pFull[0];
    const midMass = pFull[2];
    const windowMass = fullWin;
    return {
      weights: pFull,
      mask,
      sinkMass,
      midMass,
      windowMass,
      windowAmp: 1.0,
      formulaTex: `$z_0 = ${z0.toFixed(1)} \\Rightarrow p_0 = ${(sinkMass * 100).toFixed(2)}\\%,\\; W = ${(windowMass * 100).toFixed(2)}\\%$`,
      caption: `全量因果扫描全部 8 个位置 $t_0 \\dots t_7$：当 $z_0 = ${z0.toFixed(1)}$ 时，起始位 $t_0$ 吸收 ${(sinkMass * 100).toFixed(2)}% 权重，局部滑窗 $[t_5,t_6,t_7]$ 占 ${(windowMass * 100).toFixed(2)}%。`,
    };
  }

  if (mode === 'pure_swa') {
    const mask = [false, false, false, false, false, true, true, true];
    const weights = softmaxMasked(logits, mask);
    const windowMass = weights[5] + weights[6] + weights[7];
    const windowAmp = fullWin > 1e-6 ? windowMass / fullWin : 1.0;
    return {
      weights,
      mask,
      sinkMass: 0,
      midMass: 0,
      windowMass,
      windowAmp,
      formulaTex: `$t_0\\text{ 被丢弃} \\Rightarrow W\\text{ 权重 } ${(fullWin * 100).toFixed(2)}\\% \\to 100.00\\%\\;(${windowAmp.toFixed(1)}\\times)$`,
      caption: `纯滑窗直接裁剪 $t_0 \\dots t_4$，Softmax 分母失去 $e^{${z0.toFixed(1)}} \\approx ${Math.exp(z0).toFixed(1)}$ 后，滑窗 $[t_5,t_6,t_7]$ 权重被放大 ${windowAmp.toFixed(1)} 倍至 100.00%。`,
    };
  }

  if (mode === 'sink_swa') {
    const mask = [true, false, false, false, false, true, true, true];
    const weights = softmaxMasked(logits, mask);
    const sinkMass = weights[0];
    const windowMass = weights[5] + weights[6] + weights[7];
    const windowAmp = fullWin > 1e-6 ? windowMass / fullWin : 1.0;
    return {
      weights,
      mask,
      sinkMass,
      midMass: 0,
      windowMass,
      windowAmp,
      formulaTex: `$t_0\\text{ 吸收权重}\\;(z_0=${z0.toFixed(1)}) \\Rightarrow p_0=${(sinkMass * 100).toFixed(2)}\\%,\\; t_2=0\\%$`,
      caption: `L 型掩码保留 $t_0$ 与滑窗 $[t_5,t_6,t_7]$：起始位重新吸收 ${(sinkMass * 100).toFixed(2)}% 权重使滑窗回稳至 ${(windowMass * 100).toFixed(2)}%，但窗口外中段 $t_2$ 仍被静态遮蔽。`,
    };
  }

  // nsa_3branch：单尺度 8-token 三分支门控融合（cmp 粗块 + slc 中段召回 + win 局部滑窗）
  const nsaLogits = [z0, 0.2, MID_FACT_LOGIT_T2, 0.0, 1.0, 1.2, 1.5, 2.0];
  const pairScores = [
    Math.max(nsaLogits[0], nsaLogits[1]),
    Math.max(nsaLogits[2], nsaLogits[3]),
    Math.max(nsaLogits[4], nsaLogits[5]),
    Math.max(nsaLogits[6], nsaLogits[7]),
  ];
  const pPairs = softmaxMasked(pairScores, [true, true, true, true]);
  const pCmp = [
    pPairs[0] / 2,
    pPairs[0] / 2,
    pPairs[1] / 2,
    pPairs[1] / 2,
    pPairs[2] / 2,
    pPairs[2] / 2,
    pPairs[3] / 2,
    pPairs[3] / 2,
  ];
  const pSlc = softmaxMasked(nsaLogits, [false, false, true, true, false, false, false, false]);
  const pWin = softmaxMasked(nsaLogits, [false, false, false, false, false, true, true, true]);

  const gCmp = 0.25;
  const gSlc = 0.5;
  const gWin = 0.25;
  const weights = Array.from(
    { length: 8 },
    (_, i) => gCmp * pCmp[i] + gSlc * pSlc[i] + gWin * pWin[i],
  );
  const mask = [true, true, true, true, true, true, true, true];
  const sinkMass = weights[0];
  const midMass = weights[2];
  const windowMass = weights[5] + weights[6] + weights[7];
  return {
    weights,
    mask,
    sinkMass,
    midMass,
    windowMass,
    windowAmp: 1.0,
    formulaTex: `$\\mathbf{o}_7^* = 0.25\\,\\text{cmp} + 0.50\\,\\text{slc}[t_2,t_3] + 0.25\\,\\text{win}[t_5..t_7]\\;\\Rightarrow\\; p_2=${(midMass * 100).toFixed(1)}\\%$`,
    caption: `NSA 三分支协同工作：块压缩覆盖全局与 $t_0$（${(sinkMass * 100).toFixed(1)}%），块选择动态召回中段关键事实 $t_2$（${(midMass * 100).toFixed(1)}%），独立滑窗保持局部权重 ${(windowMass * 100).toFixed(1)}%。`,
  };
}

export const MODE_OPTIONS = [
  { id: 'full_causal' as const, label: '全量注意力' },
  { id: 'pure_swa' as const, label: '纯滑窗 SWA' },
  { id: 'sink_swa' as const, label: 'Sink + SWA' },
  { id: 'nsa_3branch' as const, label: 'NSA 三分支' },
] as const;

/** 保留供外部测试索引引用的 4 模式步骤构建函数 */
export function buildSinkNsaRouteSteps(): Step<SinkNsaState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return MODE_OPTIONS.map((opt) => {
    const snap = computeSinkNsaSnapshot(opt.id, 6.0);
    return {
      label: opt.label,
      duration: 4600,
      state: {
        phase: opt.id,
        formulaTex: snap.formulaTex,
        weightsQ7: snap.weights,
        windowMassPct: `${(snap.windowMass * 100).toFixed(2)}%`,
        sinkMassPct: `${(snap.sinkMass * 100).toFixed(2)}%`,
        midFactMassPct: `${(snap.midMass * 100).toFixed(2)}%`,
      },
      caption: snap.caption,
    };
  });
}
