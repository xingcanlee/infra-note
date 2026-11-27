import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues } from '@/explainers/kit/motion';

export type DsaPhase = 'raw_dot' | 'relu_zero' | 'weighted_sum' | 'sparse_gather';

export type DsaGatherMode = 'top2' | 'top3' | 'all';

export interface DsaIndexState {
  phase: DsaPhase;
  formulaTex: string;
  selectedSlots: readonly number[];
}

/** 8 槽位微型手算（单一尺度）：H^I=2 个索引头，w=[1.0, 0.5] */
export const HEAD0_DOT: readonly number[] = [-1.2, 3.2, 0.4, 4.1, -0.8, 2.0, -0.5, 3.8];
export const HEAD1_DOT: readonly number[] = [-0.4, 1.2, -0.6, 2.0, -1.5, 1.2, 0.4, 1.0];
export const W_HEAD: readonly [number, number] = [1.0, 0.5];

export const RELU_HEAD0: readonly number[] = HEAD0_DOT.map((v) => Math.max(0, v));
export const RELU_HEAD1: readonly number[] = HEAD1_DOT.map((v) => Math.max(0, v));
export const INDEX_SCORES: readonly number[] = RELU_HEAD0.map((v, i) =>
  Number((W_HEAD[0] * v + W_HEAD[1] * RELU_HEAD1[i]).toFixed(1)),
); // [0.0, 3.8, 0.4, 5.1, 0.0, 2.6, 0.2, 4.3]

export const TOPK_2_SLOTS: readonly number[] = [3, 7];
export const TOPK_3_SLOTS: readonly number[] = [1, 3, 7];
export const ALL_SLOTS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];

export const GATHER_MODE_SPECS: Record<
  DsaGatherMode,
  { id: DsaGatherMode; label: string; slots: readonly number[]; summary: string }
> = {
  top2: {
    id: 'top2',
    label: 'Top-2',
    slots: TOPK_2_SLOTS,
    summary: '仅从 8 槽中 Gather 最高分 2 槽 {s_3, s_7}（读取 25.0% 历史槽位）',
  },
  top3: {
    id: 'top3',
    label: 'Top-3',
    slots: TOPK_3_SLOTS,
    summary: 'Gather 前 3 高分槽位 {s_1, s_3, s_7}（读取 37.5% 历史槽位，跳过其余 5 槽）',
  },
  all: {
    id: 'all',
    label: '全量',
    slots: ALL_SLOTS,
    summary: '退化为稠密全量扫描全部 8 个历史槽位（读取 100.0%，无稀疏跳过）',
  },
};

export function buildDsaLightningIndexSteps(): Step<DsaIndexState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: '双头原始点积',
      duration: 4600,
      state: {
        phase: 'raw_dot',
        formulaTex:
          '$H^I = 2:\\; q_{7,0}^I\\cdot k_s^I = [-1.2, 3.2, 0.4, 4.1, -0.8, 2.0, -0.5, 3.8],\\; w = [1.0, 0.5]$',
        selectedSlots: [],
      },
      caption:
        '两个索引头共享同一套 8 槽历史键，各自算得原始点积打分，其中负相关槽位 $s_0, s_4, s_6$ 位于零线以下。',
    },
    {
      label: 'ReLU 负分归零',
      duration: 4600,
      state: {
        phase: 'relu_zero',
        formulaTex:
          '$\\operatorname{ReLU}(q_{7,0}^I\\cdot k_s^I) = [0, 3.2, 0.4, 4.1, 0, 2.0, 0, 3.8],\\; \\operatorname{ReLU}(q_{7,1}^I\\cdot k_s^I) = [0, 1.2, 0, 2.0, 0, 1.2, 0.4, 1.0]$',
        selectedSlots: [],
      },
      caption:
        'ReLU 激活直接把所有负点积归零，免去全局 Softmax 指数和归约，保留纯粹的非负相关性强度。',
    },
    {
      label: '加权求和索引分',
      duration: 4600,
      state: {
        phase: 'weighted_sum',
        formulaTex:
          '$I_{7,s} = 1.0\\operatorname{ReLU}(h_0) + 0.5\\operatorname{ReLU}(h_1) = [0.0, 3.8, 0.4, 5.1, 0.0, 2.6, 0.2, 4.3]$',
        selectedSlots: [],
      },
      caption:
        '按动态头权重 $w = [1.0, 0.5]$ 对两路非负激活直接线性求和，得到 8 个历史槽位的统一索引分 $I_{7,s}$。',
    },
    {
      label: '稀疏 Gather',
      duration: 4800,
      state: {
        phase: 'sparse_gather',
        formulaTex:
          '$\\operatorname{Top-}3(I_{7,:}) = \\{s_1, s_3, s_7\\} \\;\\Longrightarrow\\; \\text{主注意力仅 Gather } 3/8\\text{ 槽位}$',
        selectedSlots: TOPK_3_SLOTS,
      },
      caption:
        '对 8 槽索引分排序后，主注意力只沿选中槽位拉取数据；切换下方分段控件可对比 Top-2、Top-3 与全量读取路径。',
    },
  ];
}
