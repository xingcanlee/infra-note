import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues } from '@/explainers/kit/motion';

export type SinkhornHalfStep = 'col' | 'row';

export interface SinkhornSnapshot {
  k: number;
  halfStep: SinkhornHalfStep;
  matrix: [[number, number], [number, number]];
  colSums: [number, number];
  rowSums: [number, number];
  maxColErr: number;
  maxRowErr: number;
  maxErr: number;
}

export const SK_M0: readonly (readonly [number, number])[] = [
  [1.0, 3.0],
  [1.0, 1.0],
];

function colNormalize(
  m: [[number, number], [number, number]],
): [[number, number], [number, number]] {
  const c0 = m[0][0] + m[1][0];
  const c1 = m[0][1] + m[1][1];
  return [
    [m[0][0] / c0, m[0][1] / c1],
    [m[1][0] / c0, m[1][1] / c1],
  ];
}

function rowNormalize(
  m: [[number, number], [number, number]],
): [[number, number], [number, number]] {
  const r0 = m[0][0] + m[0][1];
  const r1 = m[1][0] + m[1][1];
  return [
    [m[0][0] / r0, m[0][1] / r0],
    [m[1][0] / r1, m[1][1] / r1],
  ];
}

export function runSinkhorn2x2(init: readonly (readonly number[])[], iters: number): number[][] {
  let m: [[number, number], [number, number]] = [
    [init[0][0], init[0][1]],
    [init[1][0], init[1][1]],
  ];
  for (let it = 0; it < iters; it++) {
    m = rowNormalize(colNormalize(m));
  }
  return m;
}

export function computeSinkhornSnapshot(k: number, halfStep: SinkhornHalfStep): SinkhornSnapshot {
  const clampedK = Math.max(0, Math.min(20, Math.round(k)));
  let m: [[number, number], [number, number]] = [
    [SK_M0[0][0], SK_M0[0][1]],
    [SK_M0[1][0], SK_M0[1][1]],
  ];

  if (clampedK > 0) {
    for (let it = 0; it < clampedK - 1; it++) {
      m = rowNormalize(colNormalize(m));
    }
    m = colNormalize(m);
    if (halfStep === 'row') {
      m = rowNormalize(m);
    }
  }

  const colSums: [number, number] = [m[0][0] + m[1][0], m[0][1] + m[1][1]];
  const rowSums: [number, number] = [m[0][0] + m[0][1], m[1][0] + m[1][1]];
  const maxColErr = Math.max(Math.abs(colSums[0] - 1), Math.abs(colSums[1] - 1));
  const maxRowErr = Math.max(Math.abs(rowSums[0] - 1), Math.abs(rowSums[1] - 1));

  return {
    k: clampedK,
    halfStep,
    matrix: m,
    colSums,
    rowSums,
    maxColErr,
    maxRowErr,
    maxErr: Math.max(maxColErr, maxRowErr),
  };
}

export const SK_M1_COL = computeSinkhornSnapshot(1, 'col').matrix;
export const SK_M1_ROW = computeSinkhornSnapshot(1, 'row').matrix;
export const SK_M20 = computeSinkhornSnapshot(20, 'row').matrix;

export const SINKHORN_TRAJECTORY_COL: readonly SinkhornSnapshot[] = Array.from(
  { length: 21 },
  (_, k) => computeSinkhornSnapshot(k, 'col'),
);
export const SINKHORN_TRAJECTORY_ROW: readonly SinkhornSnapshot[] = Array.from(
  { length: 21 },
  (_, k) => computeSinkhornSnapshot(k, 'row'),
);

export type MhcSinkhornPhase = 'init' | 'col_half' | 'row_full' | 'converged';

export interface MhcSinkhornStepState {
  phase: MhcSinkhornPhase;
  formulaTex: string;
}

export function buildMhcSinkhornSteps(): Step<MhcSinkhornStepState>[] {
  assertMaxHues(['active', 'done', 'highlight']);

  return [
    {
      label: '正矩阵起点',
      duration: 4200,
      state: {
        phase: 'init',
        formulaTex: '$\\mathbf{M}^{(0)} = \\begin{bmatrix}1 & 3\\\\ 1 & 1\\end{bmatrix} > 0$',
      },
      caption:
        'Sinkhorn-Knopp 从严格正矩阵出发，消除正负权重相消带来的幅值震荡，初始列和为 [2, 4]、行和为 [4, 2]。',
    },
    {
      label: '列归一半步',
      duration: 4200,
      state: {
        phase: 'col_half',
        formulaTex: '$\\mathcal{T}_c(\\mathbf{M}^{(0)}) = \\mathbf{M}^{(0)} \\oslash [2,\\, 4]$',
      },
      caption:
        '列归一半步把两列总和立即压平到 1.00，但行和暂时出现 [1.25, 0.75] 偏差，须交给行归一接力消除。',
    },
    {
      label: '行归一整步',
      duration: 4200,
      state: {
        phase: 'row_full',
        formulaTex: '$\\mathbf{M}^{(1)} = \\mathcal{T}_r\\mathcal{T}_c(\\mathbf{M}^{(0)})$',
      },
      caption:
        '随后除以行和 [1.25, 0.75] 完成第 1 轮整步，行和立刻对齐 1.00，列和偏差也迅速收拢至 0.067。',
    },
    {
      label: '20 轮双随机收敛',
      duration: 4400,
      state: {
        phase: 'converged',
        formulaTex: '$\\mathbf{M}^{(20)} \\to \\mathcal{M}^{\\mathrm{res}}$',
      },
      caption:
        '交替迭代至第 20 轮后行列残差趋近于零，矩阵收拢到对称双随机稳态 [0.366, 0.634; 0.634, 0.366]。',
    },
  ];
}
