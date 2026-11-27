import type { Step, Tone } from 'astro-wisp/explainers';
import { assertMaxHues } from '@/explainers/kit/motion';

export interface TokenItem {
  pos: number;
  text: string;
  id: number;
  role: 'context' | 'prefix3' | 'shared2' | 'target';
}

export interface HeadConfig {
  headIdx: 0 | 1 | 2 | 3;
  ngram: 2 | 3;
  lowerBound: number;
  prime: number;
  offset: number;
  tone: Tone;
}

export interface HeadLookup {
  headIdx: 0 | 1 | 2 | 3;
  ngram: 2 | 3;
  hashVal: number;
  prime: number;
  offset: number;
  remainder: number;
  slot: number;
  tone: Tone;
}

export interface ScenarioSpec {
  id: 'china' | 'new_chief' | 'poem';
  label: string;
  contextSnippet: string;
  prefixText: string;
  prefixId: number;
  h2: number;
  h3: number;
  prod2: number;
  slots: [number, number, number, number];
  alpha: number;
  gateTone: 'done' | 'highlight' | 'slate';
  collisionSummary: string;
  verdict: string;
}

export type EngramPhase = 'normalize' | 'xor' | 'lookup' | 'gate';

export interface EngramStepState {
  phase: EngramPhase;
  formulaTex: string;
  activeTokens: number[];
  h2: number;
  h3: number;
  prod0: number;
  prod1: number;
  prod2: number;
  activeSlots: [number, number, number, number];
  headLookups: HeadLookup[];
}

export const TOTAL_ROWS = 36;

export const ORDER_DEMO = {
  a: 12,
  b: 88,
  rawXor: 12 ^ 88,
  sameXor: 12 ^ 12,
  fwd: (88 * 3) ^ (12 * 7),
  rev: (12 * 3) ^ (88 * 7),
} as const;

export const TOKENS: readonly TokenItem[] = [
  { pos: 1, text: '北京', id: 14, role: 'context' },
  { pos: 2, text: '是', id: 9, role: 'context' },
  { pos: 3, text: '中国', id: 308, role: 'prefix3' },
  { pos: 4, text: '的', id: 12, role: 'shared2' },
  { pos: 5, text: '首', id: 88, role: 'target' },
];

export const MULTIPLIERS = [3, 7, 9] as const;

export const HEADS: readonly HeadConfig[] = [
  { headIdx: 0, ngram: 2, lowerBound: 4, prime: 5, offset: 0, tone: 'active' },
  { headIdx: 1, ngram: 2, lowerBound: 4, prime: 7, offset: 5, tone: 'active' },
  { headIdx: 2, ngram: 3, lowerBound: 4, prime: 11, offset: 12, tone: 'done' },
  { headIdx: 3, ngram: 3, lowerBound: 4, prime: 13, offset: 23, tone: 'done' },
];

export function computeRollingHash(idT: number, idPrev1: number, idPrev2: number) {
  const prod0 = idT * MULTIPLIERS[0];
  const prod1 = idPrev1 * MULTIPLIERS[1];
  const h2 = prod0 ^ prod1;
  const prod2 = idPrev2 * MULTIPLIERS[2];
  const h3 = h2 ^ prod2;
  return { prod0, prod1, h2, prod2, h3 };
}

export function computeSlots(h2: number, h3: number): HeadLookup[] {
  return HEADS.map((head) => {
    const hashVal = head.ngram === 2 ? h2 : h3;
    const remainder = hashVal % head.prime;
    return {
      headIdx: head.headIdx,
      ngram: head.ngram,
      hashVal,
      prime: head.prime,
      offset: head.offset,
      remainder,
      slot: remainder + head.offset,
      tone: head.tone,
    };
  });
}

const primaryHash = computeRollingHash(88, 12, 308);
const primaryLookups = computeSlots(primaryHash.h2, primaryHash.h3);

const altChiefHash = computeRollingHash(88, 12, 729);
const altChiefLookups = computeSlots(altChiefHash.h2, altChiefHash.h3);

const altPoemHash = computeRollingHash(88, 12, 502);
const altPoemLookups = computeSlots(altPoemHash.h2, altPoemHash.h3);

export const SCENARIOS: Record<ScenarioSpec['id'], ScenarioSpec> = {
  china: {
    id: 'china',
    label: '中国的首',
    contextSnippet: '北京是中国的首…',
    prefixText: '中国',
    prefixId: 308,
    h2: primaryHash.h2,
    h3: primaryHash.h3,
    prod2: primaryHash.prod2,
    slots: [
      primaryLookups[0].slot,
      primaryLookups[1].slot,
      primaryLookups[2].slot,
      primaryLookups[3].slot,
    ],
    alpha: 0.91,
    gateTone: 'done',
    collisionSummary: '四头行号 [3, 10, 16, 24] 零冲突精确命中',
    verdict: '语境指向静态地名实体，高门控放行完整记忆',
  },
  new_chief: {
    id: 'new_chief',
    label: '新任的首',
    contextSnippet: '新任的首席…',
    prefixText: '新任',
    prefixId: 729,
    h2: altChiefHash.h2,
    h3: altChiefHash.h3,
    prod2: altChiefHash.prod2,
    slots: [
      altChiefLookups[0].slot,
      altChiefLookups[1].slot,
      altChiefLookups[2].slot,
      altChiefLookups[3].slot,
    ],
    alpha: 0.42,
    gateTone: 'highlight',
    collisionSummary: '头 3 在行 24 同槽碰撞，头 2 错开至行 18',
    verdict: '局部碰撞混入杂音，上下文门控主动降权至 0.42',
  },
  poem: {
    id: 'poem',
    label: '唐诗的首',
    contextSnippet: '唐诗的首联…',
    prefixText: '唐诗',
    prefixId: 502,
    h2: altPoemHash.h2,
    h3: altPoemHash.h3,
    prod2: altPoemHash.prod2,
    slots: [
      altPoemLookups[0].slot,
      altPoemLookups[1].slot,
      altPoemLookups[2].slot,
      altPoemLookups[3].slot,
    ],
    alpha: 0.14,
    gateTone: 'slate',
    collisionSummary: '3-gram 落于行 13 与行 27，完全分离',
    verdict: '语境指向律诗结构而非地名实体，门控抑制静态向量',
  },
};

export function buildEngramHashSteps(): Step<EngramStepState>[] {
  assertMaxHues(['active', 'done', 'highlight']);

  const { prod0, prod1, h2, prod2, h3 } = primaryHash;
  const activeSlots: [number, number, number, number] = [
    primaryLookups[0].slot,
    primaryLookups[1].slot,
    primaryLookups[2].slot,
    primaryLookups[3].slot,
  ];
  const base: Omit<EngramStepState, 'phase' | 'formulaTex' | 'activeTokens'> = {
    h2,
    h3,
    prod0,
    prod1,
    prod2,
    activeSlots,
    headLookups: primaryLookups,
  };

  return [
    {
      label: '词表归一与后缀',
      duration: 4800,
      caption:
        '在线在 $t=5$ 将前文规范映射为词元 ID 序列 $[14, 9, 308, 12, 88]$，并截取后缀 2-gram $(12, 88)$ 与 3-gram $(308, 12, 88)$ 窗口。',
      state: {
        ...base,
        phase: 'normalize',
        formulaTex:
          '$t=5\\;(c_5=88) \\;\\Longrightarrow\\; \\text{2-gram}\\;(12,88),\\quad \\text{3-gram}\\;(308,12,88)$',
        activeTokens: [1, 2, 3, 4, 5],
      },
    },
    {
      label: '奇乘子滚动异或',
      duration: 5000,
      caption:
        '先按位置奇乘子 $[3, 7, 9]$ 打破交换律算得 2-gram 混合值 $g_2 = (88\\times 3)\\oplus(12\\times 7) = 348$；算 3-gram 时直接横向复用 $g_2$ 异或新词项 $308\\times 9 = 2772$ 得 $g_3 = 2952$。',
      state: {
        ...base,
        phase: 'xor',
        formulaTex:
          '$g_2 = 264 \\oplus 84 = 348 \\;\\longrightarrow\\; g_3 = g_2 \\oplus (308\\times 9) = 2952$',
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '素数取模查桶',
      duration: 5000,
      caption:
        '四个哈希头按互异素数 $p = [5, 7, 11, 13]$ 与前缀偏移 $[0, 5, 12, 23]$ 并行取模，一次落定 36 行扁平大表 $E$ 中的物理槽位 $[3, 10, 16, 24]$。',
      state: {
        ...base,
        phase: 'lookup',
        formulaTex:
          '$\\text{slot}_{n,j} = (g_n \\bmod p_{n,j}) + o_{n,j} \\;\\Rightarrow\\; [3, 10, 16, 24]$',
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '碰撞与门控融合',
      duration: 5200,
      caption:
        '对比“新任的首”（$g_3^{(B)} = 6397$）：头 3 同撞行 24，但头 2 错开到行 18 隔离；四路 Gather 拼接成 $\\mathbf{e}_t \\in \\mathbb{R}^{4d_h}$ 后由动态隐状态 $\\mathbf{h}_t$ 门控放行或降权。',
      state: {
        ...base,
        phase: 'gate',
        formulaTex:
          '$\\alpha_t = \\sigma\\!\\big(\\operatorname{sign}(z_t)\\sqrt{|z_t|}\\big) \\;\\Rightarrow\\; \\mathbf{u}_t = \\alpha_t W_V \\mathbf{e}_t$',
        activeTokens: [3, 4, 5],
      },
    },
  ];
}
