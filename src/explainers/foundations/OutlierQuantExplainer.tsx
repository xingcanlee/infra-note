import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow } from '@/explainers/kit/MetricRow';
import ProbabilityBars, { type ProbBarSeriesItem } from '@/explainers/kit/ProbabilityBars';
import { STAGE_W, assertMaxHues, resolveToneStroke, type AnyTone } from '@/explainers/kit/motion';

export interface OutlierQuantState {
  stepIndex: number;
  matrixTitle: string;
  matrixTone: AnyTone;
  selectedTone: AnyTone;
  matrixMin: number;
  matrixMax: number;
  matrixValues: (number | null)[][];
  selectedCells: ReadonlySet<string>;
  softSelectedCells: ReadonlySet<string>;
  isIntMode: boolean;
  bars: ProbBarSeriesItem[];
  focusRect: { x: number; y: number; w: number; h: number; label: string; tone: AnyTone };
  granularityText: string;
  peakImpactText: string;
  zeroCollapseText: string;
  sqnrText: string;
}

const ROW_LABELS = ['t0', 't1', 't2', 't3'];
const COL_LABELS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

const RAW_X: number[][] = [
  [0.42, -0.04, 0.31, 12.4, -0.45, 0.03, 0.19, -0.28],
  [-0.03, 0.37, -0.02, -11.8, 0.22, -0.48, -0.04, 0.35],
  [0.25, -0.39, 0.04, 10.9, -0.03, 0.41, 0.46, -0.02],
  [-0.44, 0.02, -0.29, -12.4, 0.33, -0.04, -0.36, 0.49],
];

const INT8_PT_Q: number[][] = [
  [4, 0, 3, 127, -5, 0, 2, -3],
  [0, 4, 0, -121, 2, -5, 0, 4],
  [3, -4, 0, 112, 0, 4, 5, 0],
  [-5, 0, -3, -127, 3, 0, -4, 5],
];

const SMOOTH_HAD_REC: number[][] = [
  [0.41, -0.04, 0.32, 12.41, -0.45, 0.03, 0.19, -0.28],
  [-0.03, 0.37, -0.02, -11.8, 0.22, -0.48, -0.05, 0.35],
  [0.26, -0.39, 0.04, 10.92, -0.03, 0.41, 0.46, -0.02],
  [-0.44, 0.02, -0.29, -12.4, 0.33, -0.04, -0.37, 0.49],
];

const FP8_1X8_REC: number[][] = [
  [0.42, -0.04, 0.3, 12.4, -0.44, 0.03, 0.19, -0.28],
  [-0.03, 0.37, -0.02, -11.8, 0.21, -0.47, -0.04, 0.34],
  [0.24, -0.39, 0.04, 10.9, -0.03, 0.39, 0.44, -0.02],
  [-0.44, 0.02, -0.28, -12.4, 0.33, -0.04, -0.36, 0.5],
];

const MXFP4_SH_REC: number[][] = [
  [0.62, -0.09, 0.44, 13.03, -0.62, 0.09, 0.27, -0.44],
  [-0.18, 0.35, 0.0, -11.68, 0.35, -0.53, -0.18, 0.35],
  [0.4, -0.49, -0.13, 11.01, -0.04, 0.49, 0.49, -0.04],
  [-0.66, -0.04, -0.31, -12.8, 0.4, -0.04, -0.31, 0.66],
];

const COL3_CELLS = new Set(['0,3', '1,3', '2,3', '3,3']);
const ZERO_BIN_CELLS = new Set([
  '0,1',
  '0,5',
  '1,0',
  '1,2',
  '1,6',
  '2,2',
  '2,4',
  '2,7',
  '3,1',
  '3,5',
]);
const ALL_NORMAL_CELLS = new Set(
  [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 4, 5, 6, 7].map((c) => `${r},${c}`)),
);

function makeBars(highlightIdx: number): ProbBarSeriesItem[] {
  const specs: { label: string; value: number; tone: AnyTone }[] = [
    { label: 'INT8', value: 20.25, tone: 'grad' },
    { label: 'Sm+Had', value: 39.69, tone: 'v' },
    { label: 'FP8', value: 32.11, tone: 'k' },
    { label: 'FP4', value: 0.0, tone: 'grad' },
    { label: 'MX+Sm', value: 8.6, tone: 'k' },
  ];
  return specs.map((sp, i) => ({
    label: sp.label,
    bars: [
      {
        value: sp.value,
        tone: highlightIdx >= 0 && i !== highlightIdx ? 'neutral' : sp.tone,
        highlight: i === highlightIdx,
        faded: highlightIdx >= 0 && i !== highlightIdx,
      },
    ],
  }));
}

function fmtFloat(v: number): string {
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function fmtInt(v: number): string {
  return String(Math.round(v));
}

function fmtDb(v: number): string {
  return v.toFixed(1);
}

export function buildOutlierQuantSteps(): Step<OutlierQuantState>[] {
  const tones: AnyTone[] = ['grad', 'k', 'v'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        matrixTitle: '原始 BF16 激活 X [4, 8] (c3 离群峰值)',
        matrixTone: 'neutral',
        selectedTone: 'grad',
        matrixMin: -12.5,
        matrixMax: 12.5,
        matrixValues: RAW_X,
        selectedCells: COL3_CELLS,
        softSelectedCells: new Set(),
        isIntMode: false,
        bars: makeBars(-1),
        focusRect: { x: 165, y: 70, w: 42, h: 149, label: '', tone: 'grad' },
        granularityText: 'BF16 (1+8+7)',
        peakImpactText: 'c3 = +-12.4 (25x 正常)',
        zeroCollapseText: '正常值 +-0.02..0.49',
        sqnrText: '原始参考基线',
      },
      caption:
        'LLM 激活中常见固定通道离群值（此处列 c3 达 $\\pm 12.4$，其余 7 个正常通道仅在 $\\pm 0.02 \\sim \\pm 0.49$ 之间）：该列仅占 1 维，却决定了全张量极大值。',
    },
    {
      state: {
        stepIndex: 1,
        matrixTitle: 'Per-Tensor INT8 定点整数 q (10/28 归零)',
        matrixTone: 'grad',
        selectedTone: 'grad',
        matrixMin: -127,
        matrixMax: 127,
        matrixValues: INT8_PT_Q,
        selectedCells: ZERO_BIN_CELLS,
        softSelectedCells: COL3_CELLS,
        isIntMode: true,
        bars: makeBars(0),
        focusRect: { x: 14, y: 16, w: 360, h: 212, label: '标红格全部归 0', tone: 'grad' },
        granularityText: 'Per-Tensor INT8',
        peakImpactText: '步长 s = 0.0976',
        zeroCollapseText: '10/28 正常格归零',
        sqnrText: '20.25 dB (精度受损)',
      },
      caption:
        '做 Per-Tensor INT8 时，全张量被迫按 $12.4 / 127 = 0.0976$ 放缩：28 个正常元素里有多达 10 个直接掉进 0 桶，其余也只挤在 $-5 \\sim +5$，浪费了 $96\\%$ 的 INT8 刻度。',
    },
    {
      state: {
        stepIndex: 2,
        matrixTitle: 'SmoothQuant + Hadamard-8 反量化恢复',
        matrixTone: 'v',
        selectedTone: 'v',
        matrixMin: -12.5,
        matrixMax: 12.5,
        matrixValues: SMOOTH_HAD_REC,
        selectedCells: ALL_NORMAL_CELLS,
        softSelectedCells: new Set(),
        isIntMode: false,
        bars: makeBars(1),
        focusRect: { x: 392, y: 16, w: 274, h: 218, label: 'SQNR 跃升至 39.69 dB', tone: 'v' },
        granularityText: '平滑 s3=5.08 + H8',
        peakImpactText: '旋转峰值 1.35 (s=0.011)',
        zeroCollapseText: '0/28 零桶截断',
        sqnrText: '39.69 dB (+19.44 dB)',
      },
      caption:
        '先用 SmoothQuant 把 c3 除以 $s_3=5.083$（等价迁移给权重），再乘正交 Hadamard 矩阵将能量打散：旋转后最大幅值降至 $1.354$、步长缩至 $0.0107$，正常通道 SQNR 从 $20.25\\;\\text{dB}$ 跃升至 $39.69\\;\\text{dB}$。',
    },
    {
      state: {
        stepIndex: 3,
        matrixTitle: 'FP8 E4M3 细粒度块缩放 (原生抗离群)',
        matrixTone: 'k',
        selectedTone: 'k',
        matrixMin: -12.5,
        matrixMax: 12.5,
        matrixValues: FP8_1X8_REC,
        selectedCells: COL3_CELLS,
        softSelectedCells: new Set(),
        isIntMode: false,
        bars: makeBars(2),
        focusRect: { x: 392, y: 16, w: 274, h: 218, label: 'FP8 免旋转 32.11 dB', tone: 'k' },
        granularityText: 'E4M3 1x8 (DeepSeek 1x128)',
        peakImpactText: '非均匀浮点 4-bit 指数',
        zeroCollapseText: '0/28 零桶截断',
        sqnrText: '32.11 dB / 29.38 GEMM',
      },
      caption:
        'FP8（E4M3）自带 4 bit 指数带来的对数动态范围，即使不做离线旋转也能同时罩住 $\\pm 12.4$ 与 $\\pm 0.02$：本例恢复至 $32.11\\;\\text{dB}$，DeepSeek-V3 则直接以 $1\\times 128$ 激活与 $128\\times 128$ 权重分块实现无平滑原生 FP8 GEMM（$[64,128]$ 输出 SQNR 达 $29.38\\;\\text{dB}$）。',
    },
    {
      state: {
        stepIndex: 4,
        matrixTitle: 'MXFP4 E2M1 + E8M0 (分组微缩放+平滑旋转)',
        matrixTone: 'k',
        selectedTone: 'k',
        matrixMin: -13.1,
        matrixMax: 13.1,
        matrixValues: MXFP4_SH_REC,
        selectedCells: new Set(['0,4', '0,5', '0,6', '0,7', '1,4', '1,5', '1,6', '1,7']),
        softSelectedCells: new Set(),
        isIntMode: false,
        bars: makeBars(4),
        focusRect: { x: 392, y: 16, w: 274, h: 218, label: 'FP4 0dB -> MX+Sm 8.6dB', tone: 'k' },
        granularityText: 'E2M1x32 + E8M0 共享指数',
        peakImpactText: '无微缩放 FP4 跌至 0 dB',
        zeroCollapseText: '[64,128] GEMM 达 25.24 dB',
        sqnrText: '8.60 dB / 25.24 GEMM',
      },
      caption:
        '进入 4 bit E2M1 后仅剩 15 个非均匀刻度：未分级 FP4 的正常通道直接归零（$0.00\\;\\text{dB}$）；依赖 OCP MXFP4（每 32 元素配 1 B E8M0 指数块）叠加平滑旋转后，单张量回升到 $8.60\\;\\text{dB}$，而真实 $[64,128]$ GEMM 输出更从 $15.10$ 拉高到 $25.24\\;\\text{dB}$。',
    },
  ];
}

export default function OutlierQuantExplainer({
  title = '图 2：离群通道零桶截断与旋转 / 块缩放 SQNR 恢复对比',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildOutlierQuantSteps(), []);

  return (
    <Explainer title={title} steps={steps}>
      {(step) => {
        const s = step.state;
        return (
          <Stage width={STAGE_W} height={330} label={title}>
            <HeatmapMatrix
              x={16}
              y={34}
              values={s.matrixValues}
              tone={s.matrixTone}
              selectedTone={s.selectedTone}
              cellW={38}
              cellH={34}
              gap={3}
              min={s.matrixMin}
              max={s.matrixMax}
              format={s.isIntMode ? fmtInt : fmtFloat}
              selected={s.selectedCells}
              softSelected={s.softSelectedCells}
              rowLabels={ROW_LABELS}
              colLabels={COL_LABELS}
              rowLabelW={28}
              title={s.matrixTitle}
              showLegend={false}
              fontSize={10.5}
            />

            <ProbabilityBars
              x={396}
              y={34}
              w={268}
              h={194}
              items={s.bars}
              maxValue={45}
              title="正常通道 SQNR (dB)"
              valueFormat={fmtDb}
              refLine={{ value: 30, label: '30 dB 稳健线', tone: 'v' }}
            />

            <ActiveFocusFrame
              x={s.focusRect.x}
              y={s.focusRect.y}
              w={s.focusRect.w}
              h={s.focusRect.h}
              tone={s.focusRect.tone}
              label={s.focusRect.label || undefined}
              visible
            />

            {s.stepIndex === 0 && (
              <g>
                <line
                  x1={186}
                  y1={219}
                  x2={186}
                  y2={227}
                  stroke={resolveToneStroke('grad')}
                  strokeWidth={1.5}
                />
                <rect
                  x={118}
                  y={227}
                  width={136}
                  height={18}
                  rx={3}
                  fill="var(--wisp-bg)"
                  stroke={resolveToneStroke('grad')}
                  strokeWidth={1}
                />
                <text
                  x={186}
                  y={236}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: resolveToneStroke('grad'),
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 10.5,
                    fontWeight: 600,
                  }}
                >
                  离群通道 c3 (+-12.4)
                </text>
              </g>
            )}

            <MetricRow
              x={16}
              y={260}
              w={648}
              h={54}
              metrics={[
                { label: '量化格式 / 粒度', value: s.granularityText, tone: 'k' },
                { label: '尺度受离群值支配', value: s.peakImpactText, tone: 'grad' },
                { label: '正常通道状态', value: s.zeroCollapseText, tone: 'v' },
                { label: '正常通道 SQNR', value: s.sqnrText, tone: 'v', active: true },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
