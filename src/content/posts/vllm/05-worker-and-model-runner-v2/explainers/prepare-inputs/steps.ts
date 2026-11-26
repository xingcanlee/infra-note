import type { Step, Tone } from 'astro-wisp/explainers';
export { MANIM_EASE, MORPH_SPRING, type BeatSpec } from '@/explainers/kit/motion';
import type { BeatSpec } from '@/explainers/kit/motion';

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

export type PrepareInputsPhase =
  'init' | 'step1_tokens' | 'step1_slots' | 'staged_write' | 'step2_mixed' | 'mrv2_async';

export interface PrepareInputsStepState {
  phase: PrepareInputsPhase;
  formulaTex: string;
  trace: StepTrace;
  blockTable: readonly (readonly number[])[];
}

export const BEAT_SCHEDULES: Record<PrepareInputsPhase, readonly BeatSpec[]> = {
  init: [
    { at: 0, label: '分配永久行槽位' },
    { at: 850, label: '填入全量词元表' },
    { at: 1750, label: '保留 0 号空块' },
    { at: 2650, label: '登记初始块表' },
  ],
  step1_tokens: [
    { at: 0, label: '配额切分 3+2+5' },
    { at: 800, label: '生成 req_indices' },
    { at: 1700, label: '推算 positions' },
    { at: 2650, label: '展平 token_indices' },
    { at: 3500, label: '统计前缀起止位置' },
  ],
  step1_slots: [
    { at: 0, label: '按位置折算逻辑块列' },
    { at: 850, label: '查表取出物理块号' },
    { at: 1750, label: '取模计算块内偏移' },
    { at: 2650, label: '合成 slot_mapping' },
  ],
  staged_write: [
    { at: 0, label: 'CPU 暂存两条差量' },
    { at: 850, label: '打包紧凑差量缓冲' },
    { at: 1750, label: '单次 H2D 异步拷贝' },
    { at: 2650, label: '单 Kernel 原地写回' },
  ],
  step2_mixed: [
    { at: 0, label: '显存接力已采样词元' },
    { at: 850, label: '请求 2 续传尾部 3 词元' },
    { at: 1750, label: '复用或落入新物理块' },
    { at: 2650, label: '生成 Step 2 槽位映射' },
  ],
  mrv2_async: [
    { at: 0, label: '非锁页 CPU 状态写入' },
    { at: 850, label: '临时锁页隔离读写' },
    { at: 1750, label: 'GPU 按映射 Gather' },
    { at: 2650, label: 'Triton 并行组装就绪' },
  ],
};

export function buildPrepareInputsSteps(): Step<PrepareInputsStepState>[] {
  return [
    {
      label: '永久行初始化',
      duration: 4800,
      caption:
        'RequestState 在 $[4, 12]$ 常驻张量中为三条请求分配永久行 $0, 1, 2$ 并写入全量提示词；BlockTables 在 $[4, 6]$ 中保留 $0$ 号空块，写入初始物理块 $[1,2], [3], [4,5,6]$。',
      state: {
        phase: 'init',
        formulaTex: '$M = 12,\\; B = 2,\\; K = M / B = 6,\\; \\text{null\\_block} = 0$',
        trace: TRACE_STEP1,
        blockTable: BLOCK_TABLE_STEP1,
      },
    },
    {
      label: 'Step 1 词元定位',
      duration: 5400,
      caption:
        '首步配额 $10$ 切出 $[3, 2, 5]$，生成请求索引与位置向量 $\\text{positions} = [0,1,2,0,1,0,1,2,3,4]$；再按 $r \\cdot 12 + p$ 算得扁平下标，读出首步全部十个输入词元。',
      state: {
        phase: 'step1_tokens',
        formulaTex:
          '$\\text{token\\_idx} = r \\cdot M + p \\;\\Rightarrow\\; [0,1,2,12,13,24,25,26,27,28]$',
        trace: TRACE_STEP1,
        blockTable: BLOCK_TABLE_STEP1,
      },
    },
    {
      label: 'Step 1 槽位映射',
      duration: 5000,
      caption:
        '每个词元按 $\\lfloor p / 2 \\rfloor$ 定位块表列并查出物理块号 $[1,1,2,3,3,4,4,5,5,6]$，再与块内偏移 $p \\bmod 2$ 合成物理槽位 $[2,3,4,6,7,8,9,10,11,12]$。',
      state: {
        phase: 'step1_slots',
        formulaTex:
          '$\\text{slot} = \\text{block}[r,\\, \\lfloor p/2 \\rfloor] \\times 2 + (p \\bmod 2) \\;\\Rightarrow\\; [2,3,4,6,7,8,9,10,11,12]$',
        trace: TRACE_STEP1,
        blockTable: BLOCK_TABLE_STEP1,
      },
    },
    {
      label: 'StagedWrite 差量',
      duration: 5000,
      caption:
        '步间无需重传整张块表：CPU 仅暂存两条稀疏写入 $(1, 1, [7])$ 与 $(2, 3, [8])$，打包为连续差量缓冲后经一次异步拷贝和单个 Triton Kernel 原地写入显存。',
      state: {
        phase: 'staged_write',
        formulaTex:
          '$\\text{diff} = \\{(1,1,[7]),\\;(2,3,[8])\\} \\;\\xrightarrow{2\\text{ elems vs }24}\\; \\text{single H2D + apply}$',
        trace: TRACE_STEP1,
        blockTable: BLOCK_TABLE_STEP2,
      },
    },
    {
      label: 'Step 2 混批续推',
      duration: 5200,
      caption:
        '请求 $0, 1$ 进入解码，直接从显存接力刚采样的 $T_{0,3}, T_{1,2}$；请求 $2$ 续传最后三个提示词，组合成新位置 $[3, 2, 5, 6, 7]$ 与槽位 $[5, 14, 13, 16, 17]$。',
      state: {
        phase: 'step2_mixed',
        formulaTex:
          '$\\text{q\\_loc} = [0,1,2,5],\\; \\text{seq\\_lens} = [4,3,8],\\; \\text{slot} = [5,14,13,16,17]$',
        trace: TRACE_STEP2,
        blockTable: BLOCK_TABLE_STEP2,
      },
    },
    {
      label: '无锁异步与 Gather',
      duration: 5000,
      caption:
        'ModelRunner V2 用非锁页 CPU 数组配合临时锁页副本隔离读写竞争，摘掉 V1 的异步阻塞锁；随后 Triton Kernel 按请求映射并行完成元数据组装与采样。',
      state: {
        phase: 'mrv2_async',
        formulaTex:
          '$\\text{states}_{\\text{pageable}} \\xrightarrow{\\text{.pin\\_memory()}} \\text{tmp}_{\\text{pinned}} \\xrightarrow{\\text{non\\_blocking}} \\text{GPU Gather}$',
        trace: TRACE_STEP2,
        blockTable: BLOCK_TABLE_STEP2,
      },
    },
  ];
}
