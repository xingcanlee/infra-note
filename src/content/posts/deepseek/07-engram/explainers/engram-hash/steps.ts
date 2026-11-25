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

export interface NormalizeGroup {
  rawVariants: readonly string[];
  canonical: string;
  note: string;
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

export type EngramPhase =
  'normalize' | 'multipliers' | 'bucket' | 'suffix' | 'xor' | 'lookup' | 'collision' | 'gather';

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
  normalize: [
    { at: 0, label: '原始词表 129,280' },
    { at: 700, label: '规范化折叠变体' },
    { at: 1500, label: '压缩 23.43% 至 V′' },
    { at: 2350, label: '映射为规范 ID' },
  ],
  multipliers: [
    { at: 0, label: '直接异或丢词序' },
    { at: 800, label: '加位置乘子打破交换' },
    { at: 1650, label: '防 int64 溢出定半界' },
    { at: 2550, label: '按层抽样得奇乘子' },
  ],
  bucket: [
    { at: 0, label: '2-gram 从 4 顺延' },
    { at: 750, label: '命中 5 与 7 入 seen' },
    { at: 1550, label: '3-gram 跳过已用 5/7' },
    { at: 2350, label: '顺延命中 11 与 13' },
    { at: 3150, label: '前缀和拼成 36 行带' },
  ],
  suffix: [
    { at: 0, label: '读入规范序列' },
    { at: 550, label: '锚定 t=5' },
    { at: 1200, label: '截取 2-gram' },
    { at: 1950, label: '截取 3-gram' },
    { at: 2650, label: '窗口就绪' },
  ],
  xor: [
    { at: 0, label: '乘上位置奇乘子' },
    { at: 750, label: '2-gram 异或得 h₂' },
    { at: 1600, label: '横向复用 h₂ 结果' },
    { at: 2450, label: '异或前词得 h₃' },
  ],
  lookup: [
    { at: 0, label: '载入 h₂ 与 h₃' },
    { at: 600, label: '头 0 命中行 3' },
    { at: 1300, label: '头 1 命中行 10' },
    { at: 2000, label: '头 2 命中行 16' },
    { at: 2700, label: '头 3 命中行 24' },
    { at: 3400, label: '四槽并行就位' },
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

export const NORMALIZE_EXAMPLES: readonly NormalizeGroup[] = [
  {
    rawVariants: ['"Apple"', '"apple"', '" apple"'],
    canonical: '"apple"',
    note: '转小写 + 去首尾空白',
    tone: 'active',
  },
  {
    rawVariants: ['"\\t"', '"\\n"', '"  "'],
    canonical: '"␣"',
    note: '空白折叠（合并 163 变体）',
    tone: 'done',
  },
  {
    rawVariants: ['"A"', '"á"', '" ä"'],
    canonical: '"a"',
    note: 'NFD 去变音符（合并 54 变体）',
    tone: 'highlight',
  },
];

export const ORDER_DEMO = {
  a: 12,
  b: 88,
  rawXor: 12 ^ 88,
  sameXor: 12 ^ 12,
  fwd: (88 * 3) ^ (12 * 7),
  rev: (12 * 3) ^ (88 * 7),
} as const;

export const PRIME_SCAN_NUMS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

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
      label: '词表归一',
      duration: 5000,
      caption:
        "离线阶段用 CompressedTokenizer 把大小写、空白与变音符变体折叠到同一词形，将 129,280 词表压缩 23.43% 至 $V' \\approx 9.9 \\times 10^4$，推理时按原 ID 查表即得规范 ID $x'_t$。",
      state: {
        ...base,
        phase: 'normalize',
        formulaTex: "$V = 129{,}280 \\;\\xrightarrow{-23.43\\%}\\; V' \\approx 9.9 \\times 10^4$",
        activeTokens: [1, 2, 3, 4, 5],
      },
    },
    {
      label: '离线奇乘子',
      duration: 5400,
      caption:
        "直接异或满足交换律且同词归零；为锁死词序，按相对位置 $k$ 分配离线奇数常量 $m_k = 2r_k + 1$（上界受 $\\lfloor(2^{63}-1)/V'\\rfloor$ 保护，奇数保低位满秩），演示缩放为 $[3, 7, 9]$。",
      state: {
        ...base,
        phase: 'multipliers',
        formulaTex:
          "$m_k = 2r_k + 1 < \\lfloor (2^{63}-1)/V' \\rfloor,\\; \\text{RNG}(10007\\cdot l)$",
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '素数建桶',
      duration: 5600,
      caption:
        '两阶统一从下界 $4$ 出发：2-gram 顺延拿到素数 $5, 7$；3-gram 因全局 seen 去重跳过已占用的 $5, 7$，顺延拿到 $11, 13$，求前缀和拼成 $36$ 行一维扁平表。',
      state: {
        ...base,
        phase: 'bucket',
        formulaTex:
          '$p = [[5, 7], [11, 13]] \\;\\Rightarrow\\; \\text{offsets} = [0, 5, 12, 23],\\; N_{\\text{rows}} = 36$',
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '后缀窗口',
      duration: 4800,
      caption:
        '进入在线前向：在位置 $t = 5$（“首”，规范 ID $88$）向回截取 2-gram 后缀 $(12, 88)$ 与 3-gram 后缀 $(308, 12, 88)$；前文“北京”“是”不在当前窗口内。',
      state: {
        ...base,
        phase: 'suffix',
        formulaTex: '$t = 5 \\Rightarrow \\text{2-gram}(12, 88),\\; \\text{3-gram}(308, 12, 88)$',
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '滚动递推',
      duration: 5400,
      caption:
        '先算 2-gram 混合值 $h_2 = (88\\times 3) \\oplus (12\\times 7) = 348$；算 3-gram 时直接横向复用 $h_2$ 异或新词项 $308\\times 9 = 2772$，一次得出 $h_3 = 2952$。',
      state: {
        ...base,
        phase: 'xor',
        formulaTex:
          '$h_2 = 264 \\oplus 84 = 348 \\;\\longrightarrow\\; h_3 = h_2 \\oplus 2772 = 2952$',
        activeTokens: [3, 4, 5],
      },
    },
    {
      label: '偏移落位',
      duration: 5600,
      caption:
        '各哈希头按 $\\text{slot}_{n,j} = (h_n \\bmod p_j) + \\text{offset}_j$ 并行取模偏移，直接命中 36 行一维扁平表的第 $3, 10, 16, 24$ 物理槽位。',
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
        '按物理行号直接切片 Gather 并拼接为 $\\mathbf{e}_t \\in \\mathbb{R}^{4d_h}$（全程零矩阵乘），最后交由注意力隐状态 $\\mathbf{h}_t$ 计算门控（下方 $\\alpha_t$ 为语境对比示意值）。',
      state: {
        ...base,
        phase: 'gather',
        formulaTex:
          '$\\mathbf{e}_t = [e_3; e_{10}; e_{16}; e_{24}] \\;\\xrightarrow{\\;\\alpha_t(\\mathbf{h}_t, \\mathbf{e}_t)\\;}\\; \\tilde{\\mathbf{e}}_t$',
        activeTokens: [3, 4, 5],
      },
    },
  ];
}
