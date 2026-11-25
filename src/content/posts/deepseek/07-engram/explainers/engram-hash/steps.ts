import type { Step, Tone } from 'astro-wisp/explainers';
export { MANIM_EASE, MORPH_SPRING, type BeatSpec } from '@/explainers/kit/motion';
import type { BeatSpec } from '@/explainers/kit/motion';

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
  slots: [number, number, number, number];
  alpha: number;
  gateTone: Tone;
  collisionSummary: string;
  verdict: string;
}

export type EngramPhase = 'suffix' | 'xor' | 'bucket' | 'lookup' | 'collision' | 'gather';

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

export const BEAT_SCHEDULES: Record<EngramPhase, readonly BeatSpec[]> = {
  suffix: [
    { at: 0, label: '读入词元' },
    { at: 550, label: '锚定 t=5' },
    { at: 1200, label: '截取 2-gram' },
    { at: 1950, label: '截取 3-gram' },
    { at: 2650, label: '窗口就绪' },
  ],
  xor: [
    { at: 0, label: '离线奇乘子' },
    { at: 650, label: '异或得 h₂' },
    { at: 1450, label: '按位异或' },
    { at: 2250, label: '复用 h₂' },
    { at: 2950, label: '累加得 h₃' },
  ],
  bucket: [
    { at: 0, label: '头 0 · 素数 5' },
    { at: 650, label: '头 1 · 素数 7' },
    { at: 1300, label: '头 2 · 素数 11' },
    { at: 1950, label: '头 3 · 素数 13' },
    { at: 2600, label: '拼成 36 行' },
  ],
  lookup: [
    { at: 0, label: '载入哈希值' },
    { at: 550, label: '聚光头 0 → 行 3' },
    { at: 1250, label: '聚光头 1 → 行 10' },
    { at: 1950, label: '聚光头 2 → 行 16' },
    { at: 2650, label: '聚光头 3 → 行 24' },
    { at: 3350, label: '全表落位 [3,10,16,24]' },
  ],
  collision: [
    { at: 0, label: '基准“中国的首”' },
    { at: 800, label: '引入“新任的首”' },
    { at: 1600, label: '头 2 错开隔离' },
    { at: 2400, label: '头 3 同槽碰撞' },
  ],
  gather: [
    { at: 0, label: '按行切片 Gather' },
    { at: 650, label: '四路汇流拼接' },
    { at: 1400, label: '注入门控单元' },
    { at: 1950, label: '动态门控输出' },
  ],
};

export const TOTAL_ROWS = 36;

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
  { headIdx: 1, ngram: 2, lowerBound: 6, prime: 7, offset: 5, tone: 'active' },
  { headIdx: 2, ngram: 3, lowerBound: 10, prime: 11, offset: 12, tone: 'done' },
  { headIdx: 3, ngram: 3, lowerBound: 12, prime: 13, offset: 23, tone: 'done' },
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
    slots: [
      primaryLookups[0].slot,
      primaryLookups[1].slot,
      primaryLookups[2].slot,
      primaryLookups[3].slot,
    ],
    alpha: 0.91,
    gateTone: 'done',
    collisionSummary: '四头行号 [3, 10, 16, 24] 零冲突精确命中',
    verdict: '上下文语义与“首都/静态实体”高度吻合，高门控注入完整记忆',
  },
  new_chief: {
    id: 'new_chief',
    label: '新任的首',
    contextSnippet: '新任的首席…',
    prefixText: '新任',
    prefixId: 729,
    h2: altChiefHash.h2,
    h3: altChiefHash.h3,
    slots: [
      altChiefLookups[0].slot,
      altChiefLookups[1].slot,
      altChiefLookups[2].slot,
      altChiefLookups[3].slot,
    ],
    alpha: 0.42,
    gateTone: 'highlight',
    collisionSummary: '头 3 在行 24 发生哈希碰撞，头 2 隔离到行 18（错开 2 行）',
    verdict: '局部碰撞导致静默向量混杂，上下文门控主动降权至 0.42 抑制杂音',
  },
  poem: {
    id: 'poem',
    label: '唐诗的首',
    contextSnippet: '唐诗的首联…',
    prefixText: '唐诗',
    prefixId: 502,
    h2: altPoemHash.h2,
    h3: altPoemHash.h3,
    slots: [
      altPoemLookups[0].slot,
      altPoemLookups[1].slot,
      altPoemLookups[2].slot,
      altPoemLookups[3].slot,
    ],
    alpha: 0.14,
    gateTone: 'slate',
    collisionSummary: '3-gram 命中行 13 与行 27，与“中国的首”完全分离',
    verdict: '语境指向律诗结构而非地名实体，门控衰减静态特征输出',
  },
};

export function toBinaryBits(value: number, width = 9): string {
  return value.toString(2).padStart(width, '0');
}

export function buildEngramHashSteps(): Step<EngramStepState>[] {
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
      label: '词缀窗口',
      duration: 4800,
      caption:
        '先把词元离线归并为规范 ID，在位置 $t = 5$（“首”，ID $88$）向回截取 2-gram 后缀 $(12, 88)$ 与 3-gram 后缀 $(308, 12, 88)$；前文“北京”“是”不参与当前查表。',
      state: {
        ...base,
        phase: 'suffix',
        formulaTex: '$t = 5 \\Rightarrow \\text{2-gram}(12, 88),\\; \\text{3-gram}(308, 12, 88)$',
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '滚动异或',
      duration: 5400,
      caption:
        "乘子是按层用 10007 × layer 离线生成、不参与训练的奇数常量（上界受 $\\lfloor (2^{63}-1)/V' \\rfloor$ 保护）；此处以缩放奇数 $(3, 7, 9)$ 区分词序算得 $h_2 = 348$，再复用 $h_2$ 异或 $2772$ 得 $h_3 = 2952$。",
      state: {
        ...base,
        phase: 'xor',
        formulaTex:
          '$h_2 = 264 \\oplus 84 = 348 \\;\\longrightarrow\\; h_3 = 348 \\oplus 2772 = 2952$',
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '素数建桶',
      duration: 4800,
      caption:
        '建表期跨层全局去重寻得四枚互异素数 $[5, 7, 11, 13]$，本层从 0 求前缀和得首址 $\\text{offsets} = [0, 5, 12, 23]$，拼成 $36$ 行扁平连续物理张量。',
      state: {
        ...base,
        phase: 'bucket',
        formulaTex:
          '$p = [5, 7, 11, 13] \\;\\Rightarrow\\; \\text{offsets} = [0, 5, 12, 23],\\; N_{\\text{rows}} = 36$',
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '偏移寻址',
      duration: 5600,
      caption:
        '各哈希头按 $\\text{slot}_{n,j} = (h_n \\bmod p_j) + \\text{offset}_j$ 并行取模偏移，一次落位到扁平表的第 $3, 10, 16, 24$ 物理行，无须重算或分支跳转。',
      state: {
        ...base,
        phase: 'lookup',
        formulaTex:
          '$\\text{slot}_j = (h \\bmod p_j) + \\text{offset}_j \\;\\Rightarrow\\; [3, 10, 16, 24]$',
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '局部碰撞',
      duration: 5000,
      caption:
        "对比“新任的首”（$h'_3 = 6397$）：头 3 对 $13$ 取模也落在第 $24$ 行发生同槽碰撞；但头 2 对 $11$ 取模落在第 $18$ 行，与“中国的首”的第 $16$ 行错开 $2$ 行。",
      state: {
        ...base,
        phase: 'collision',
        formulaTex:
          "$h'_3 = 6397 \\;\\Rightarrow\\; \\text{头 2 隔离 }(16 \\neq 18),\\; \\text{头 3 碰撞 }(24 = 24)$",
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '拼接门控',
      duration: 5000,
      caption:
        '按物理行号直接切片 Gather 并拼接为 $\\mathbf{e}_t \\in \\mathbb{R}^{4d_h}$（全程零矩阵乘），最后交由注意力隐状态 $h_t$ 计算门控（下方 $\\alpha_t$ 为语境对比示意值）。',
      state: {
        ...base,
        phase: 'gather',
        formulaTex:
          '$\\mathbf{e}_t = [e_3; e_{10}; e_{16}; e_{24}] \\;\\xrightarrow{\\;\\alpha_t(h_t, \\mathbf{e}_t)\\;}\\; \\tilde{\\mathbf{e}}_t$',
        activeTokens: [3, 4, 5],
      },
    },
  ];
}
