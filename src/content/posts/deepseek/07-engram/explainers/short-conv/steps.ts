import type { Step, Tone } from 'astro-wisp/explainers';
export { MANIM_EASE, MORPH_SPRING, type BeatSpec } from '@/explainers/kit/motion';
import type { BeatSpec } from '@/explainers/kit/motion';

export interface ConvToken {
  pos: number;
  text: string;
  xVal: number;
  inPrefix5: boolean;
}

export interface ConvTap {
  tapIdx: 0 | 1 | 2 | 3;
  srcPos: number;
  tokenText: string;
  xVal: number;
  weight: number;
  term: number;
  isPad: boolean;
}

export interface ConvEvalResult {
  pos: number;
  tokenText: string;
  xAtPos: number;
  taps: readonly ConvTap[];
  y: number;
  siluY: number;
  out: number;
}

export type ShortConvPhase = 'pad' | 'dilation' | 'early' | 'full' | 'tradeoff';

export interface ShortConvStepState {
  phase: ShortConvPhase;
  formulaTex: string;
  focusPos: number;
}

export const KERNEL_SIZE = 4;
export const DILATION = 3;
export const LEFT_PAD = (KERNEL_SIZE - 1) * DILATION; // 9

// w[0] 乘当前位 x_t，w[3] 乘最远抽头 x_{t-9}；PyTorch nn.Conv1d 从左到右排为 [w_3, w_2, w_1, w_0]
export const WEIGHTS: readonly [number, number, number, number] = [0.5, 0.25, -0.5, 1.0];

export const CONV_TOKENS: readonly ConvToken[] = [
  { pos: 0, text: '北京', xVal: 1, inPrefix5: true },
  { pos: 1, text: '是', xVal: 2, inPrefix5: true },
  { pos: 2, text: '中国', xVal: 4, inPrefix5: true },
  { pos: 3, text: '的', xVal: 3, inPrefix5: true },
  { pos: 4, text: '首', xVal: 1, inPrefix5: true },
  { pos: 5, text: '都', xVal: 2, inPrefix5: false },
  { pos: 6, text: '拥有', xVal: 4, inPrefix5: false },
  { pos: 7, text: '悠久', xVal: 0, inPrefix5: false },
  { pos: 8, text: '的', xVal: 2, inPrefix5: false },
  { pos: 9, text: '历史', xVal: 5, inPrefix5: false },
];

export const PROBE_POSITIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function silu(v: number): number {
  return v / (1 + Math.exp(-v));
}

export function computeDilatedConvAt(t: number, dilation = DILATION): ConvEvalResult {
  const cur = CONV_TOKENS[t];
  const taps: ConvTap[] = ([0, 1, 2, 3] as const).map((tapIdx) => {
    const srcPos = t - tapIdx * dilation;
    const isPad = srcPos < 0;
    const xVal = isPad ? 0 : CONV_TOKENS[srcPos].xVal;
    const tokenText = isPad ? '补0' : CONV_TOKENS[srcPos].text;
    const weight = WEIGHTS[tapIdx];
    return {
      tapIdx,
      srcPos,
      tokenText,
      xVal,
      weight,
      term: weight * xVal,
      isPad,
    };
  });
  const y = taps.reduce((acc, item) => acc + item.term, 0);
  const siluY = silu(y);
  return {
    pos: t,
    tokenText: cur.text,
    xAtPos: cur.xVal,
    taps,
    y,
    siluY,
    out: cur.xVal + siluY,
  };
}

export const ALL_CONV_RESULTS: readonly ConvEvalResult[] = CONV_TOKENS.map((t) =>
  computeDilatedConvAt(t.pos),
);

export const BEAT_SCHEDULES: Record<ShortConvPhase, readonly BeatSpec[]> = {
  pad: [
    { at: 0, label: '承接前文 10 词激活' },
    { at: 700, label: '左侧展开 9 个独立 0' },
    { at: 1550, label: '刚性 4 齿核落位 t=0' },
    { at: 2400, label: '算出首个输出 y₀=0.50' },
  ],
  dilation: [
    { at: 0, label: '连续核 δ=1 紧邻 4 齿' },
    { at: 850, label: '横向拉伸为空洞 δ=3' },
    { at: 1750, label: '齿距 3 格对齐 3-gram' },
    { at: 2600, label: '对照 PyTorch 核顺序' },
  ],
  early: [
    { at: 0, label: '扫至 t=0 “北京” → 0.50' },
    { at: 700, label: '扫至 t=1 “是” → 1.00' },
    { at: 1400, label: '扫至 t=2 “中国” → 2.00' },
    { at: 2100, label: '扫至 t=3 “的” → 1.75' },
    { at: 2800, label: '扫至 t=4 “首” → 1.00' },
  ],
  full: [
    { at: 0, label: '扫至 t=5 “都” → 2.00' },
    { at: 650, label: '扫至 t=6 “拥有” → 2.25' },
    { at: 1300, label: '扫至 t=7 “悠久” → -0.75' },
    { at: 1950, label: '扫至 t=8 “的” → -0.50' },
    { at: 2600, label: '扫至 t=9 “历史” → 3.00' },
    { at: 3300, label: 'SiLU 激活回写残差' },
  ],
  tradeoff: [
    { at: 0, label: '任意位置滑动核验' },
    { at: 750, label: 'Depthwise 分组压缩参数' },
    { at: 1550, label: 'Decode 须存跨步滑窗' },
    { at: 2400, label: 'V4.1 移除卷积保持无状态' },
  ],
};

export function tapTone(tapIdx: 0 | 1 | 2 | 3, isPad: boolean): Tone {
  if (isPad) return 'slate';
  return tapIdx === 0 ? 'active' : 'done';
}

export function buildShortConvSteps(): Step<ShortConvStepState>[] {
  return [
    {
      label: '因果左补零',
      duration: 4800,
      caption:
        '把前文“北京 是 中国 的 首”续写为 10 词序列“北京 是 中国 的 首 都 拥有 悠久 的 历史”（位置 0 到 9）；为不偷看未来词元，在最左侧补 $(k-1)\\delta = 9$ 个独立 0 格，四齿卷积核从 $t=0$ 起步。',
      state: {
        phase: 'pad',
        formulaTex: '$\\text{left\\_pad} = (k-1)\\delta = 3 \\times 3 = 9,\\; y_0 = 0.50$',
        focusPos: 0,
      },
    },
    {
      label: '空洞拉伸',
      duration: 5000,
      caption:
        '连续核（$\\delta=1$）四齿紧邻，相邻窗口高度重叠；把步幅拉成 $\\delta=3$ 后齿距 3 格，刚好对齐 3-gram 边界。手算 $w_0$ 乘 $u_t$，PyTorch 核张量 $[4d, 1, 4]$ 从左到右存为 $[w_3, w_2, w_1, w_0]$。',
      state: {
        phase: 'dilation',
        formulaTex:
          '$\\delta: 1 \\to 3 \\;\\Longrightarrow\\; \\text{taps}(t) = [t-9,\\; t-6,\\; t-3,\\; t]$',
        focusPos: 9,
      },
    },
    {
      label: '扫过前 5 词',
      duration: 5200,
      caption:
        '刚性四齿卷积核逐格向右平移扫过前 5 词“北京 是 中国 的 首”（$t=0 \\to 4$），依次写入 $y_0=0.50,\\; y_1=1.00,\\; y_2=2.00,\\; y_3=1.75,\\; y_4=1.00$，历史抽头正逐步离开左补 0 区。',
      state: {
        phase: 'early',
        formulaTex: '$y_{0..4} = [0.50,\\; 1.00,\\; 2.00,\\; 1.75,\\; 1.00]$',
        focusPos: 4,
      },
    },
    {
      label: '扫至句尾',
      duration: 5400,
      caption:
        '继续向右逐格扫过 $t=5 \\to 9$，到 $t=9$（“历史”）时四根齿针全部落入实词 $u_9, u_6, u_3, u_0$，算出 $y_9 = 3.00$；经 SiLU 激活（$\\approx 2.86$）加回门控残差得 $7.86$。',
      state: {
        phase: 'full',
        formulaTex: '$y_9 = 2.5 + 1.0 - 1.5 + 1.0 = 3.00 \\;\\xrightarrow{\\text{SiLU}}\\; 2.86$',
        focusPos: 9,
      },
    },
    {
      label: '自由滑窗与取舍',
      duration: 5000,
      caption:
        '可切换 $t=0..9$ 任意位置让刚性卷积核滑窗核验输出。训练端输入 $[B, 4d, T]$ 配合 $[4d, 1, 4]$ 核把单流参数压到 $4d$，但推理端须维护跨步滑窗状态，V4.1 因此移除短卷积。',
      state: {
        phase: 'tradeoff',
        formulaTex:
          '$[B, 4d, T] \\xrightarrow{[4d, 1, 4]} [B, 4d, T],\\quad \\text{V4.1: 无状态移除}$',
        focusPos: 9,
      },
    },
  ];
}
