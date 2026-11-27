import type { Step, Tone } from 'astro-wisp/explainers';
export { MANIM_EASE, MORPH_SPRING } from '@/explainers/kit/motion';

export const MAX_NUM_REQS = 4;
export const MAX_MODEL_LEN = 12;
export const BLOCK_SIZE = 2;
export const MAX_NUM_BLOCKS = MAX_MODEL_LEN / BLOCK_SIZE; // 6
export const TOKEN_BUDGET = 10;

export interface ReqSpec {
  reqIdx: number;
  label: string;
  promptLen: number;
  tone: Tone;
  tokens: readonly string[];
}

export const REQUESTS: readonly ReqSpec[] = [
  {
    reqIdx: 0,
    label: '请求 0',
    promptLen: 3,
    tone: 'active',
    tokens: ['T0,0', 'T0,1', 'T0,2', 'T0,3'],
  },
  {
    reqIdx: 1,
    label: '请求 1',
    promptLen: 2,
    tone: 'done',
    tokens: ['T1,0', 'T1,1', 'T1,2'],
  },
  {
    reqIdx: 2,
    label: '请求 2',
    promptLen: 8,
    tone: 'highlight',
    tokens: ['T2,0', 'T2,1', 'T2,2', 'T2,3', 'T2,4', 'T2,5', 'T2,6', 'T2,7'],
  },
];

export interface StagedDiffEntry {
  row: number;
  start: number;
  values: readonly number[];
  tone: Tone;
  reason: string;
}

export interface StepTrace {
  scheduledCounts: readonly number[];
  computedBefore: readonly number[];
  reqIndices: readonly number[];
  positions: readonly number[];
  tokenIndices: readonly number[];
  inputLabels: readonly string[];
  blockTableIndices: readonly number[];
  blockNumbers: readonly number[];
  blockOffsets: readonly number[];
  slotMapping: readonly number[];
  queryStartLoc: readonly number[];
  seqLens: readonly number[];
}

export function buildStepTrace(
  scheduledCounts: readonly number[],
  computedBefore: readonly number[],
  blockTable: readonly (readonly number[])[],
): StepTrace {
  const reqIndices: number[] = [];
  const positions: number[] = [];
  const tokenIndices: number[] = [];
  const inputLabels: string[] = [];
  const blockTableIndices: number[] = [];
  const blockNumbers: number[] = [];
  const blockOffsets: number[] = [];
  const slotMapping: number[] = [];
  const queryStartLoc: number[] = [0];
  const seqLens: number[] = [];

  for (let r = 0; r < scheduledCounts.length; r++) {
    const count = scheduledCounts[r];
    const base = computedBefore[r];
    queryStartLoc.push(queryStartLoc[queryStartLoc.length - 1] + count);
    seqLens.push(base + count);
    for (let k = 0; k < count; k++) {
      const pos = base + k;
      const btCol = Math.floor(pos / BLOCK_SIZE);
      const btIdx = r * MAX_NUM_BLOCKS + btCol;
      const blkNum = blockTable[r][btCol];
      const offset = pos % BLOCK_SIZE;
      reqIndices.push(r);
      positions.push(pos);
      tokenIndices.push(r * MAX_MODEL_LEN + pos);
      inputLabels.push(REQUESTS[r].tokens[pos] ?? `T${r},${pos}`);
      blockTableIndices.push(btIdx);
      blockNumbers.push(blkNum);
      blockOffsets.push(offset);
      slotMapping.push(blkNum * BLOCK_SIZE + offset);
    }
  }

  return {
    scheduledCounts,
    computedBefore,
    reqIndices,
    positions,
    tokenIndices,
    inputLabels,
    blockTableIndices,
    blockNumbers,
    blockOffsets,
    slotMapping,
    queryStartLoc,
    seqLens,
  };
}

export const BLOCK_TABLE_STEP1: readonly (readonly number[])[] = [
  [1, 2, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0],
  [4, 5, 6, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
];

export const STAGED_DIFFS_STEP2: readonly StagedDiffEntry[] = [
  {
    row: 1,
    start: 1,
    values: [7],
    tone: 'done',
    reason: '请求 1 新采样 1 个词元，越过块 3 上限，增量追加物理块 7',
  },
  {
    row: 2,
    start: 3,
    values: [8],
    tone: 'highlight',
    reason: '请求 2 续传剩余 3 个提示词，pos=6,7 落入新物理块 8',
  },
];

export const BLOCK_TABLE_STEP2: readonly (readonly number[])[] = [
  [1, 2, 0, 0, 0, 0],
  [3, 7, 0, 0, 0, 0],
  [4, 5, 6, 8, 0, 0],
  [0, 0, 0, 0, 0, 0],
];

export const TRACE_STEP1 = buildStepTrace([3, 2, 5], [0, 0, 0], BLOCK_TABLE_STEP1);
export const TRACE_STEP2 = buildStepTrace([1, 1, 3], [3, 2, 5], BLOCK_TABLE_STEP2);

export type PrepareInputsPhase = 'init' | 'step1_map' | 'staged_write' | 'async_gather';

export interface PrepareInputsStepState {
  phase: PrepareInputsPhase;
  stepTag: string;
  formulaTex: string;
  trace: StepTrace;
  blockTable: readonly (readonly number[])[];
  h2dActive: boolean;
  h2dLabel: string;
  h2dTone: Tone;
  showDiffHighlight: boolean;
  asyncStatus: string;
}

export function buildPrepareInputsSteps(): Step<PrepareInputsStepState>[] {
  return [
    {
      label: '永久行初始化',
      duration: 4800,
      caption:
        'RequestState 在 $[4, 12]$ 常驻张量中为三条请求分配永久行 $0, 1, 2$ 并写入提示词；BlockTables 在 $[4, 6]$ 中保留 $0$ 号空块，登记初始物理块 $[1,2], [3], [4,5,6]$。',
      state: {
        phase: 'init',
        stepTag: '永久行常驻 · 零重排',
        formulaTex: '$M = 12,\\; B = 2,\\; K = M / B = 6,\\; \\text{null\\_block} = 0$',
        trace: TRACE_STEP1,
        blockTable: BLOCK_TABLE_STEP1,
        h2dActive: false,
        h2dLabel: '永久行对齐',
        h2dTone: 'active',
        showDiffHighlight: false,
        asyncStatus: '待配额调度',
      },
    },
    {
      label: '词元与槽位映射',
      duration: 5000,
      caption:
        '首步配额 $10$ 切出 $[3,2,5]$，按 $r \\cdot 12 + p$ 算得扁平下标 $[0,1,2,12,13,24,25,26,27,28]$；查块表列 $\\lfloor p/2 \\rfloor$ 并叠加偏移 $p \\bmod 2$，合成槽位 $[2,3,4,6,7,8,9,10,11,12]$。',
      state: {
        phase: 'step1_map',
        stepTag: 'Step 1 · 10 词元扁平映射',
        formulaTex:
          '$\\text{idx}=r\\cdot 12+p,\\; \\text{slot}=\\text{blk}[r,\\lfloor p/2\\rfloor]\\cdot 2+(p\\bmod 2)$',
        trace: TRACE_STEP1,
        blockTable: BLOCK_TABLE_STEP1,
        h2dActive: true,
        h2dLabel: '初始 H2D',
        h2dTone: 'active',
        showDiffHighlight: false,
        asyncStatus: 'Step 1 映射完成',
      },
    },
    {
      label: 'StagedWrite 差量 H2D',
      duration: 5000,
      caption:
        '步间无需重传整张 $[4,6]$ 块表：CPU 仅暂存两条稀疏差量 $(1,1,[7])$ 与 $(2,3,[8])$，打包后经单次异步 H2D 拷贝与 Triton Kernel 原地写入显存，其余槽位零改写。',
      state: {
        phase: 'staged_write',
        stepTag: 'StagedWrite · 2 vs 24 差量',
        formulaTex:
          '$\\text{diff} = \\{(1,1,[7]),\\;(2,3,[8])\\} \\;\\xrightarrow{2\\text{ elems vs }24}\\; \\text{single H2D + apply}$',
        trace: TRACE_STEP1,
        blockTable: BLOCK_TABLE_STEP2,
        h2dActive: true,
        h2dLabel: '差量 H2D (2B)',
        h2dTone: 'highlight',
        showDiffHighlight: true,
        asyncStatus: '原地写入 B7 / B8',
      },
    },
    {
      label: '无锁异步 Gather',
      duration: 5000,
      caption:
        'MRV2 将持久状态放在非锁页 CPU 数组，步进时生成临时 .pin_memory() 副本经 non_blocking H2D 隔离读写竞争；Triton Kernel 按 idx_mapping=[0,1,2] 并行 Gather 出 Step 2 混批槽位 $[5,14,13,16,17]$。',
      state: {
        phase: 'async_gather',
        stepTag: 'Step 2 · 无锁异步 Gather',
        formulaTex:
          '$\\text{states}_{\\text{page}} \\xrightarrow{\\text{pin\\_memory}} \\text{tmp}_{\\text{pin}} \\xrightarrow{\\text{H2D}} \\text{Gather } [5,14,13,16,17]$',
        trace: TRACE_STEP2,
        blockTable: BLOCK_TABLE_STEP2,
        h2dActive: true,
        h2dLabel: '无锁异步流',
        h2dTone: 'done',
        showDiffHighlight: true,
        asyncStatus: 'Triton Gather + Gumbel',
      },
    },
  ];
}
