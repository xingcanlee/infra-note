import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues } from '@/explainers/kit/motion';

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

export type ShortConvPhase = 'pad' | 'dilation' | 'scan' | 'tradeoff';

export interface ShortConvStepState {
  phase: ShortConvPhase;
  formulaTex: string;
  focusPos: number;
}

export const KERNEL_SIZE = 4;
export const DILATION_OPTIONS = [1, 4] as const;
export type DilationRate = (typeof DILATION_OPTIONS)[number];
export const MAX_LEFT_PAD = (KERNEL_SIZE - 1) * 4; // 12

// w[0] 乘当前位 x_t，w[3] 乘最远抽头 x_{t-3d}
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

export function computeDilatedConvAt(t: number, dilation: number = 4): ConvEvalResult {
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

export const ALL_CONV_RESULTS_D1: readonly ConvEvalResult[] = CONV_TOKENS.map((t) =>
  computeDilatedConvAt(t.pos, 1),
);
export const ALL_CONV_RESULTS_D4: readonly ConvEvalResult[] = CONV_TOKENS.map((t) =>
  computeDilatedConvAt(t.pos, 4),
);

export function buildShortConvSteps(): Step<ShortConvStepState>[] {
  assertMaxHues(['active', 'done', 'highlight']);

  return [
    {
      label: '因果左补零',
      duration: 4400,
      caption:
        '核长 $k=4$ 在左侧补 $(k-1)d$ 个 0 格，使位置 $t=0$ 仅访问当前词与历史补零区，不偷看未来词元。',
      state: {
        phase: 'pad',
        formulaTex: '$\\text{left\\_pad} = (k-1)d,\\; y_0 = w_0 u_0 = 0.50$',
        focusPos: 0,
      },
    },
    {
      label: '空洞感受野',
      duration: 4600,
      caption:
        '标准卷积 $d=1$ 感受野仅覆盖近邻 4 格；切换为 $d=4$ 后四根抽头跨距拉伸到 13 格，覆盖更长历史语境。',
      state: {
        phase: 'dilation',
        formulaTex:
          '$d \\in \\{1, 4\\} \\;\\Rightarrow\\; \\text{taps}(t) = [t-3d,\\; t-2d,\\; t-d,\\; t]$',
        focusPos: 9,
      },
    },
    {
      label: '加权求和扫描',
      duration: 4800,
      caption:
        '拖动位置滑块 $t=0..9$ 可实时观察四齿卷积核的加权连线、补零退出过程以及输出 $y_t$ 的逐格生成。',
      state: {
        phase: 'scan',
        formulaTex: '$y_t = \\sum_{i=0}^{3} w_i\\, u_{t - i d}$',
        focusPos: 9,
      },
    },
    {
      label: '无状态取舍',
      duration: 4800,
      caption:
        '推理解码时保留跨步历史抽头会迫使引擎为每个请求维护滑窗缓存，V4.1 因此移除短卷积以保持无状态。',
      state: {
        phase: 'tradeoff',
        formulaTex: '$[B, 4d, T] \\xrightarrow{[4d, 1, 4]} [B, 4d, T]$',
        focusPos: 9,
      },
    },
  ];
}
