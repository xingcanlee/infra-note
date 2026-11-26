import type { Step } from 'astro-wisp/explainers';
import { type BeatSpec, assertMaxHues } from '@/explainers/kit/motion';
export { MANIM_EASE, MORPH_SPRING, type BeatSpec } from '@/explainers/kit/motion';

export type MhcSinkhornPhase =
  'expand' | 'single_layer' | 'exp_init' | 'col_norm' | 'row_norm' | 'multi_layer';

export type StabilityMode = 'hc' | 'sinkhorn_5' | 'sinkhorn_20';

export interface MhcSinkhornState {
  phase: MhcSinkhornPhase;
  formulaTex: string;
  inputStreams: readonly number[];
  preWeights: readonly number[];
  resMatrix: readonly (readonly number[])[];
  hRes: readonly number[];
  hIn: number;
  fDelta: number;
  postWeights: readonly number[];
  hPost: readonly number[];
  outputStreams: readonly number[];
  sinkhornMatrix: readonly (readonly number[])[];
  colSums: readonly number[];
  rowSums: readonly number[];
  highlightRow?: number;
  highlightCol?: number;
}

export const INPUT_STREAMS: readonly number[] = [10, 20, 30, 40];
export const PRE_WEIGHTS: readonly number[] = [0.5, 0.2, 0.2, 0.1];
export const POST_WEIGHTS: readonly number[] = [1.2, 0.8, 0.5, 1.5];
export const RES_MATRIX: readonly (readonly number[])[] = [
  [0.5, 0.2, 0.2, 0.1],
  [0.2, 0.4, 0.2, 0.2],
  [0.2, 0.2, 0.4, 0.2],
  [0.1, 0.2, 0.2, 0.5],
];
export const F_DELTA = 4.0;

export function matVecMul(mat: readonly (readonly number[])[], vec: readonly number[]): number[] {
  return mat.map((row) => row.reduce((acc, val, idx) => acc + val * vec[idx], 0));
}

export function dotVec(a: readonly number[], b: readonly number[]): number {
  return a.reduce((acc, val, idx) => acc + val * b[idx], 0);
}

export function runSinkhorn2x2(init: readonly (readonly number[])[], iters: number): number[][] {
  let m = init.map((r) => [...r]);
  for (let it = 0; it < iters; it++) {
    const cSums = [0, 1].map((c) => m[0][c] + m[1][c]);
    m = m.map((r) => r.map((v, c) => v / cSums[c]));
    const rSums = m.map((r) => r[0] + r[1]);
    m = m.map((r) => r.map((v) => v / rSums[m.indexOf(r)]));
  }
  return m;
}

export const H_RES = matVecMul(RES_MATRIX, INPUT_STREAMS);
export const H_IN = dotVec(PRE_WEIGHTS, INPUT_STREAMS);
export const H_POST = POST_WEIGHTS.map((w) => Number((w * F_DELTA).toFixed(2)));
export const OUTPUT_STREAMS = H_RES.map((v, i) => Number((v + H_POST[i]).toFixed(2)));

export const SK_M0: readonly (readonly number[])[] = [
  [1.0, 3.0],
  [1.0, 1.0],
];
export const SK_M1_COL: readonly (readonly number[])[] = [
  [0.5, 0.75],
  [0.5, 0.25],
];
export const SK_M1_ROW: readonly (readonly number[])[] = [
  [0.4, 0.6],
  [2 / 3, 1 / 3],
];
export const SK_M20 = runSinkhorn2x2(SK_M0, 20);

export interface ModeCompareSpec {
  id: StabilityMode;
  label: string;
  badge: string;
  gainText: string;
  rowSumRange: string;
  colSumRange: string;
  barPct: number;
  summary: string;
  matrix60: readonly (readonly number[])[];
  curveNormY: readonly number[];
}

export const STABILITY_MODES: Record<StabilityMode, ModeCompareSpec> = {
  hc: {
    id: 'hc',
    label: '无约束 HC',
    badge: '60 层连乘失控',
    gainText: '~3000×（峰值 +509.1）',
    rowSumRange: '-498 ~ +509',
    colSumRange: '-259 ~ -219',
    barPct: 100,
    summary: '无约束正负权重（如 -5.58 与 +6.77）经 60 子层连乘后剧烈震荡，引发训练损失尖峰。',
    matrix60: [
      [-132.8, -112.2, -117.0, -113.3],
      [-129.3, -109.3, -113.9, -110.3],
      [142.3, 120.2, 125.3, 121.3],
      [-139.3, -117.8, -122.6, -118.7],
    ],
    curveNormY: [0.02, 0.14, 0.32, 0.56, 0.79, 0.96],
  },
  sinkhorn_5: {
    id: 'sinkhorn_5',
    label: 'mHC (5 轮 Sinkhorn)',
    badge: '投影尚未完全对齐',
    gainText: '约 2.8×（残留漂移）',
    rowSumRange: '1.00 ~ 1.00',
    colSumRange: '0.78 ~ 1.23',
    barPct: 36,
    summary: '只迭代 5 轮时行和已近 1，但列和仍有约 0.2 偏差，穿过 60 子层后误差会逐步累积。',
    matrix60: [
      [0.19, 0.28, 0.22, 0.31],
      [0.21, 0.29, 0.2, 0.3],
      [0.18, 0.27, 0.24, 0.31],
      [0.2, 0.26, 0.23, 0.31],
    ],
    curveNormY: [0.02, 0.05, 0.09, 0.13, 0.16, 0.19],
  },
  sinkhorn_20: {
    id: 'sinkhorn_20',
    label: 'mHC (20 轮 Sinkhorn)',
    badge: 'Birkhoff 乘法封闭',
    gainText: '≤ 1.6×（行和 1.00）',
    rowSumRange: '1.00 ~ 1.01',
    colSumRange: '0.89 ~ 1.11',
    barPct: 14,
    summary:
      '20 轮 FP32 交替归一使混合矩阵稳定落在双随机流形内，连乘 60 子层仍维持均值与梯度守恒。',
    matrix60: [
      [0.24, 0.26, 0.23, 0.27],
      [0.23, 0.25, 0.26, 0.27],
      [0.21, 0.25, 0.27, 0.28],
      [0.21, 0.27, 0.24, 0.29],
    ],
    curveNormY: [0.02, 0.03, 0.04, 0.05, 0.055, 0.06],
  },
};

export const BEAT_SCHEDULES: Record<MhcSinkhornPhase, readonly BeatSpec[]> = {
  expand: [
    { at: 0, label: '单流输入扩展为四条并行流' },
    { at: 750, label: '主干 Res 4×4 跨流混合' },
    { at: 1550, label: '旁路 Pre 4→1 压回算子计算' },
    { at: 2350, label: 'Post 1→4 写回各流相加' },
  ],
  single_layer: [
    { at: 0, label: '亮出四流初值 [10,20,30,40]' },
    { at: 750, label: 'Pre 加权算得 19.0 → 增量 +4.0' },
    { at: 1550, label: 'Res 4×4 混合保住总和 100.0' },
    { at: 2350, label: '各流加上 Post 增量得终态输出' },
  ],
  exp_init: [
    { at: 0, label: '取无约束实数打分矩阵' },
    { at: 750, label: '逐元素 exp 映射为正矩阵' },
    { at: 1550, label: '统计初始列和 [2.00, 4.00]' },
    { at: 2350, label: '对照 Softmax 与全正守恒边界' },
  ],
  col_norm: [
    { at: 0, label: '读取初始矩阵 M(0)' },
    { at: 750, label: '第 0 列同除列和 2.0' },
    { at: 1550, label: '第 1 列同除列和 4.0' },
    { at: 2350, label: '列和对齐 1.00，观察行和失衡' },
  ],
  row_norm: [
    { at: 0, label: '锁定当前行和 [1.25, 0.75]' },
    { at: 750, label: '逐行归一化对齐行和 1.00' },
    { at: 1550, label: '列和迅速收拢至 [1.07, 0.93]' },
    { at: 2350, label: '20 轮交替后收敛到双随机稳态' },
  ],
  multi_layer: [
    { at: 0, label: '绘制 60 子层连乘增益曲线' },
    { at: 750, label: '展开第 60 子层复合矩阵热力图' },
    { at: 1550, label: '聚焦前向行和与反向列和极值' },
    { at: 2350, label: '切换方案对照稳定与发散边界' },
  ],
};

export function buildMhcSinkhornSteps(): Step<MhcSinkhornState>[] {
  assertMaxHues(['active', 'done', 'error']);

  return [
    {
      label: '四流扩展',
      duration: 4200,
      state: {
        phase: 'expand',
        formulaTex:
          '$\\mathbf{X}_{l+1} = \\mathcal{H}_l^{\\mathrm{res}}\\mathbf{X}_l + \\mathcal{H}_l^{\\mathrm{post}\\,\\top}\\mathcal{F}_l(\\mathcal{H}_l^{\\mathrm{pre}}\\mathbf{X}_l)$',
        inputStreams: INPUT_STREAMS,
        preWeights: PRE_WEIGHTS,
        resMatrix: RES_MATRIX,
        hRes: H_RES,
        hIn: H_IN,
        fDelta: F_DELTA,
        postWeights: POST_WEIGHTS,
        hPost: H_POST,
        outputStreams: OUTPUT_STREAMS,
        sinkhornMatrix: SK_M0,
        colSums: [2.0, 4.0],
        rowSums: [4.0, 2.0],
      },
      caption:
        '超连接保持算子内部宽度 d 不变，只在层间把残差扩成 4 条并行流 [4, d]：主干 Res 负责 4×4 跨流混合，旁路 Pre 压成 [1, d] 喂给算子，再由 Post 写回四流相加。',
    },
    {
      label: '单层手算',
      duration: 4300,
      state: {
        phase: 'single_layer',
        formulaTex: '$h_l^{\\mathrm{in}} = 19.0,\\; \\sum \\mathbf{H}_l^{\\mathrm{res}} = 100.0$',
        inputStreams: INPUT_STREAMS,
        preWeights: PRE_WEIGHTS,
        resMatrix: RES_MATRIX,
        hRes: H_RES,
        hIn: H_IN,
        fDelta: F_DELTA,
        postWeights: POST_WEIGHTS,
        hPost: H_POST,
        outputStreams: OUTPUT_STREAMS,
        sinkhornMatrix: SK_M0,
        colSums: [2.0, 4.0],
        rowSums: [4.0, 2.0],
      },
      caption:
        '代入初值 [10, 20, 30, 40]：Pre 按权重算得 19.0 并由算子给出增量 4.0；双随机矩阵 Res 将四流混成 [19, 24, 26, 31]（总和守恒 100.0），逐流加上 Post 增量得 [23.8, 27.2, 28.0, 37.0]。',
    },
    {
      label: '指数转正',
      duration: 4200,
      state: {
        phase: 'exp_init',
        formulaTex: '$\\mathbf{M}^{(0)} = \\exp(\\tilde{\\mathcal{H}}_l^{\\mathrm{res}}) > 0$',
        inputStreams: INPUT_STREAMS,
        preWeights: PRE_WEIGHTS,
        resMatrix: RES_MATRIX,
        hRes: H_RES,
        hIn: H_IN,
        fDelta: F_DELTA,
        postWeights: POST_WEIGHTS,
        hPost: H_POST,
        outputStreams: OUTPUT_STREAMS,
        sinkhornMatrix: SK_M0,
        colSums: [2.0, 4.0],
        rowSums: [4.0, 2.0],
      },
      caption:
        '要让模型学出双随机混合矩阵，Sinkhorn 先对无约束实数打分逐元素取指数，得到严格为正的起始矩阵，从源头堵死正负大权重互相抵消放大的可能。',
    },
    {
      label: '列和归一',
      duration: 4200,
      state: {
        phase: 'col_norm',
        formulaTex: '$\\mathcal{T}_c(\\mathbf{M}^{(0)}) = \\mathbf{M}^{(0)} \\oslash [2,\\, 4]$',
        inputStreams: INPUT_STREAMS,
        preWeights: PRE_WEIGHTS,
        resMatrix: RES_MATRIX,
        hRes: H_RES,
        hIn: H_IN,
        fDelta: F_DELTA,
        postWeights: POST_WEIGHTS,
        hPost: H_POST,
        outputStreams: OUTPUT_STREAMS,
        sinkhornMatrix: SK_M1_COL,
        colSums: [1.0, 1.0],
        rowSums: [1.25, 0.75],
        highlightCol: 1,
      },
      caption:
        '第一步列归一化依次对两列除以列和 2.0 与 4.0，立刻把每列总和压平到 1.00，同时两行和暂为 1.25 与 0.75。',
    },
    {
      label: '行和收敛',
      duration: 4300,
      state: {
        phase: 'row_norm',
        formulaTex:
          '$\\mathcal{T}_r\\mathcal{T}_c(\\mathbf{M}^{(0)}) \\xrightarrow{t_{\\max}=20} \\mathcal{M}^{\\mathrm{res}}$',
        inputStreams: INPUT_STREAMS,
        preWeights: PRE_WEIGHTS,
        resMatrix: RES_MATRIX,
        hRes: H_RES,
        hIn: H_IN,
        fDelta: F_DELTA,
        postWeights: POST_WEIGHTS,
        hPost: H_POST,
        outputStreams: OUTPUT_STREAMS,
        sinkhornMatrix: SK_M1_ROW,
        colSums: [1.07, 0.93],
        rowSums: [1.0, 1.0],
        highlightRow: 0,
      },
      caption:
        '紧接着除以行和 [1.25, 0.75]，行和立即对齐 1.00，列和收拢到 [1.07, 0.93]；重复交替 20 轮后，行列和同时收敛到 1.00（即 0.37 与 0.63 对称稳态）。',
    },
    {
      label: '连乘对比',
      duration: 4500,
      state: {
        phase: 'multi_layer',
        formulaTex:
          '$\\left\\|\\prod_{i=1}^{60} \\mathcal{H}_{61-i}^{\\mathrm{res}}\\right\\|_\\infty \\le 1.6\\times$',
        inputStreams: INPUT_STREAMS,
        preWeights: PRE_WEIGHTS,
        resMatrix: RES_MATRIX,
        hRes: H_RES,
        hIn: H_IN,
        fDelta: F_DELTA,
        postWeights: POST_WEIGHTS,
        hPost: H_POST,
        outputStreams: OUTPUT_STREAMS,
        sinkhornMatrix: SK_M20,
        colSums: [1.0, 1.0],
        rowSums: [1.0, 1.0],
      },
      caption:
        '双随机流形对矩阵乘法封闭且谱范数不超过 1。下方可切换无约束 HC 与不同 Sinkhorn 迭代轮次，对比 60 个子层连乘后的增益曲线与复合矩阵极值。',
    },
  ];
}
