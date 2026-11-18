import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface OnlineSoftmaxState {
  stepIndex: number;
  k0Tone: AnyTone;
  k1Tone: AnyTone;
  outHbmTone: AnyTone;
  tileTitle: string;
  tileTone: AnyTone;
  tileValues: (number | null)[][];
  tileColLabels: string[];
  tileSelected: ReadonlySet<string>;
  statsValues: (number | null)[][];
  statsTone: AnyTone;
  statsSelected: ReadonlySet<string>;
  accTitle: string;
  accTone: AnyTone;
  accValues: (number | null)[][];
  accSelected: ReadonlySet<string>;
  focusFrame: { x: number; y: number; w: number; h: number; label: string; tone: AnyTone };
  phaseText: string;
  peakSramText: string;
  rescaleText: string;
  accuracyText: string;
}

const ROW_LABELS = ['r0', 'r1'];
const STAT_COLS = ['m', 'alpha', 'l'];
const OUT_COLS = ['d0', 'd1'];

const S1_TILE: (number | null)[][] = [
  [1.0, 3.0],
  [4.0, 2.0],
];
const P1_TILE: (number | null)[][] = [
  [0.135, 1.0],
  [1.0, 0.135],
];
const S2_TILE: (number | null)[][] = [
  [5.0, 2.0],
  [1.0, 2.0],
];

const STATS_INIT: (number | null)[][] = [
  [null, null, 0.0],
  [null, null, 0.0],
];
const STATS_T1: (number | null)[][] = [
  [3.0, 1.0, 1.135],
  [4.0, 1.0, 1.135],
];
const STATS_RESCALE: (number | null)[][] = [
  [5.0, 0.135, 1.135],
  [4.0, 1.0, 1.135],
];
const STATS_T2: (number | null)[][] = [
  [5.0, 0.135, 1.203],
  [4.0, 1.0, 1.32],
];

const O_NULL: (number | null)[][] = [
  [null, null],
  [null, null],
];
const O_T1: (number | null)[][] = [
  [0.135, 2.0],
  [1.0, 0.271],
];
const O_T2: (number | null)[][] = [
  [2.018, 1.47],
  [1.1, 0.862],
];
const O_FINAL: (number | null)[][] = [
  [1.677, 1.221],
  [0.833, 0.653],
];

function fmtVal(v: number): string {
  if (Math.abs(v) >= 10) return v.toFixed(1);
  if (Number.isInteger(v)) return v.toFixed(1);
  return v.toFixed(3);
}

const ALL_2X2 = new Set(['0,0', '0,1', '1,0', '1,1']);
const ROW0_2X2 = new Set(['0,0', '0,1']);
const STAT_M_ALPHA = new Set(['0,0', '0,1', '1,0', '1,1']);
const STAT_L_COL = new Set(['0,2', '1,2']);

export function buildOnlineSoftmaxSteps(): Step<OnlineSoftmaxState>[] {
  const tones: AnyTone[] = ['q', 'k', 'v'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        k0Tone: 'k',
        k1Tone: 'mask',
        outHbmTone: 'mask',
        tileTitle: 'S_tile (Tile 1)',
        tileTone: 'q',
        tileValues: S1_TILE,
        tileColLabels: ['k0', 'k1'],
        tileSelected: ALL_2X2,
        statsValues: STATS_INIT,
        statsTone: 'neutral',
        statsSelected: new Set(),
        accTitle: '唯一 O_tilde (待写)',
        accTone: 'neutral',
        accValues: O_NULL,
        accSelected: new Set(),
        focusFrame: { x: 26, y: 176, w: 172, h: 142, label: 'Tile 1 得分', tone: 'q' },
        phaseText: '1/5 载入 Tile 1',
        peakSramText: '2x2 分块 (片上驻留)',
        rescaleText: 'm=-inf, l=0',
        accuracyText: '零 HBM 中间矩阵',
      },
      caption:
        '设 $B_r=2, B_c=2, N=4$：仅将 $Q_{0:2}$ 与第 1 块 $K_{0:2}, V_{0:2}$ 搬入片上 SRAM，算出局部得分 $S^{(1)} = [[1,3],[4,2]]$。此时片上只分配唯一一份在位状态 $(m, l, \\tilde{O})$，不分配完整 $[4,4]$ 矩阵。',
    },
    {
      state: {
        stepIndex: 1,
        k0Tone: 'k',
        k1Tone: 'mask',
        outHbmTone: 'mask',
        tileTitle: 'P_tilde (Tile 1)',
        tileTone: 'k',
        tileValues: P1_TILE,
        tileColLabels: ['k0', 'k1'],
        tileSelected: ALL_2X2,
        statsValues: STATS_T1,
        statsTone: 'k',
        statsSelected: STAT_M_ALPHA,
        accTitle: '唯一 O_tilde (Tile 1)',
        accTone: 'v',
        accValues: O_T1,
        accSelected: ALL_2X2,
        focusFrame: { x: 434, y: 176, w: 204, h: 142, label: '写入唯一 O_tilde', tone: 'v' },
        phaseText: '2/5 首块累加',
        peakSramText: '1 份 O_tilde 缓冲',
        rescaleText: 'm=[3.0, 4.0]',
        accuracyText: 'l=[1.135, 1.135]',
      },
      caption:
        '由 $S^{(1)}$ 求得首块行最大 $m^{(1)}=[3.0, 4.0]$，算出未归一化权重 $\\tilde{P}^{(1)}=\\exp(S^{(1)}-m^{(1)})$ 与局部和 $l^{(1)}=[1.135, 1.135]$，并将 $\\tilde{P}^{(1)} V_{0:2}$ 写入片上唯一的 $\\tilde{O}$ 累加器。',
    },
    {
      state: {
        stepIndex: 2,
        k0Tone: 'visited',
        k1Tone: 'k',
        outHbmTone: 'mask',
        tileTitle: 'S_tile (Tile 2 覆盖)',
        tileTone: 'k',
        tileValues: S2_TILE,
        tileColLabels: ['k2', 'k3'],
        tileSelected: ROW0_2X2,
        statsValues: STATS_RESCALE,
        statsTone: 'k',
        statsSelected: STAT_M_ALPHA,
        accTitle: '唯一 O_tilde (待缩放)',
        accTone: 'neutral',
        accValues: O_T1,
        accSelected: new Set(),
        focusFrame: { x: 214, y: 176, w: 210, h: 142, label: 'r0 触发重缩放', tone: 'k' },
        phaseText: '3/5 载入 Tile 2',
        peakSramText: '原地覆盖 S_tile',
        rescaleText: 'alpha=[0.135, 1.0]',
        accuracyText: 'r0 最大值 3 -> 5',
      },
      caption:
        '换入第 2 块 $K_{2:4}, V_{2:4}$ 原地覆盖旧分块，得到 $S^{(2)}=[[5,2],[1,2]]$。第 0 行最大值从 $3$ 跳升到 $5$，旧状态必须乘缩放因子 $\\alpha_0 = \\exp(3-5)=0.135$；第 1 行最大值未超 $4$，保持 $\\alpha_1=1.0$。',
    },
    {
      state: {
        stepIndex: 3,
        k0Tone: 'visited',
        k1Tone: 'k',
        outHbmTone: 'mask',
        tileTitle: 'S_tile (Tile 2)',
        tileTone: 'q',
        tileValues: S2_TILE,
        tileColLabels: ['k2', 'k3'],
        tileSelected: new Set(),
        statsValues: STATS_T2,
        statsTone: 'v',
        statsSelected: STAT_L_COL,
        accTitle: '唯一 O_tilde (就地缩放+加)',
        accTone: 'v',
        accValues: O_T2,
        accSelected: ALL_2X2,
        focusFrame: { x: 434, y: 176, w: 204, h: 142, label: '就地覆盖 O_tilde', tone: 'v' },
        phaseText: '4/5 在位重缩放',
        peakSramText: '无额外 O 副本',
        rescaleText: 'l=[1.203, 1.320]',
        accuracyText: 'alpha*O + P2 V2',
      },
      caption:
        '片上唯一的 $\\tilde{O}$ 就地完成修正：$\\tilde{O} \\leftarrow \\text{diag}(\\alpha)\\tilde{O} + \\tilde{P}^{(2)}V_{2:4} = [[2.018, 1.470],[1.100, 0.862]]$，分母同步累加为 $l=[1.203, 1.320]$，全程复用同一份片上输出缓冲。',
    },
    {
      state: {
        stepIndex: 4,
        k0Tone: 'visited',
        k1Tone: 'visited',
        outHbmTone: 'v',
        tileTitle: 'Tile 生命周期结束',
        tileTone: 'neutral',
        tileValues: S2_TILE,
        tileColLabels: ['k2', 'k3'],
        tileSelected: new Set(),
        statsValues: STATS_T2,
        statsTone: 'v',
        statsSelected: new Set(),
        accTitle: '唯一 O = O_tilde / l',
        accTone: 'v',
        accValues: O_FINAL,
        accSelected: ALL_2X2,
        focusFrame: { x: 554, y: 42, w: 102, h: 62, label: '1次写回 HBM', tone: 'v' },
        phaseText: '5/5 尾声归一化',
        peakSramText: 'HBM 读写 O(N d)',
        rescaleText: 'O_tilde / l',
        accuracyText: '误差 2.22e-16',
      },
      caption:
        '遍历全部 $K/V$ 块后，在片上将唯一的 $\\tilde{O}$ 一次性除以 $l=[1.203, 1.320]$，得到最终结果 $[[1.677, 1.221],[0.833, 0.653]]$ 并单次写回 HBM；与完整 $[4,4]$ Softmax 数值误差仅 $2.22\\times 10^{-16}$。',
    },
  ];
}

export default function OnlineSoftmaxExplainer({
  title = '图 1：Online Softmax 片上单一累加器就地重缩放流程',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildOnlineSoftmaxSteps(), []);

  return (
    <Explainer title={title} steps={steps}>
      {(step) => {
        const s = step.state;
        return (
          <Stage width={STAGE_W} height={412} label={title}>
            <SectionBox
              x={16}
              y={10}
              w={648}
              h={106}
              title="HBM 全局显存 (分块按需流式读取，不写回 [N, N] 矩阵)"
              tone="neutral"
            />

            <TensorBlock x={28} y={56} w={88} h={36} tone="q" name="Q_0:2" shape="[2, d]" active />
            <TensorBlock
              x={132}
              y={56}
              w={88}
              h={36}
              tone={s.k0Tone}
              name="K_0:2"
              shape="Tile 1"
              active={s.stepIndex <= 1}
              muted={s.stepIndex >= 2}
            />
            <TensorBlock
              x={228}
              y={56}
              w={88}
              h={36}
              tone={s.k0Tone}
              name="V_0:2"
              shape="Tile 1"
              active={s.stepIndex <= 1}
              muted={s.stepIndex >= 2}
            />
            <TensorBlock
              x={336}
              y={56}
              w={88}
              h={36}
              tone={s.k1Tone}
              name="K_2:4"
              shape="Tile 2"
              active={s.stepIndex === 2 || s.stepIndex === 3}
              muted={s.stepIndex < 2 || s.stepIndex === 4}
              dashed={s.stepIndex < 2}
            />
            <TensorBlock
              x={432}
              y={56}
              w={88}
              h={36}
              tone={s.k1Tone}
              name="V_2:4"
              shape="Tile 2"
              active={s.stepIndex === 2 || s.stepIndex === 3}
              muted={s.stepIndex < 2 || s.stepIndex === 4}
              dashed={s.stepIndex < 2}
            />
            <TensorBlock
              x={562}
              y={54}
              w={86}
              h={40}
              tone={s.outHbmTone}
              name="O_0:2"
              shape="最终输出"
              labelMode="inside"
              active={s.stepIndex === 4}
              dashed={s.stepIndex < 4}
            />

            <DataFlowArrow
              points={[
                [s.stepIndex <= 1 ? 176 : 380, 112],
                [s.stepIndex <= 1 ? 176 : 380, 128],
                [156, 128],
                [156, 184],
              ]}
              tone="k"
              active={s.stepIndex < 4}
              flow
            />

            <DataFlowArrow
              points={[
                [605, 184],
                [605, 98],
              ]}
              tone="v"
              active={s.stepIndex === 4}
              dashed={s.stepIndex < 4}
              flow
            />

            <SectionBox x={16} y={140} w={648} h={190} title="片上 SRAM / UB" tone="v" />

            <HeatmapMatrix
              x={32}
              y={188}
              values={s.tileValues}
              tone={s.tileTone}
              selectedTone={s.tileTone}
              cellW={54}
              cellH={34}
              gap={4}
              min={0}
              max={5}
              format={fmtVal}
              selected={s.tileSelected}
              rowLabels={ROW_LABELS}
              colLabels={s.tileColLabels}
              rowLabelW={28}
              title={s.tileTitle}
              showLegend={false}
              fontSize={11}
            />

            <DataFlowArrow
              points={[
                [180, 262],
                [212, 262],
              ]}
              tone="k"
              active={s.stepIndex >= 1 && s.stepIndex <= 3}
              flow
            />

            <HeatmapMatrix
              x={216}
              y={188}
              values={s.statsValues}
              tone={s.statsTone}
              selectedTone="k"
              cellW={54}
              cellH={34}
              gap={4}
              min={0}
              max={5}
              format={fmtVal}
              selected={s.statsSelected}
              rowLabels={ROW_LABELS}
              colLabels={STAT_COLS}
              rowLabelW={28}
              title="在位状态 (m, alpha, l)"
              showLegend={false}
              fontSize={11}
            />

            <DataFlowArrow
              points={[
                [414, 262],
                [446, 262],
              ]}
              tone="v"
              active={s.stepIndex >= 1}
              flow
            />

            <HeatmapMatrix
              x={450}
              y={188}
              values={s.accValues}
              tone={s.accTone}
              selectedTone="v"
              cellW={62}
              cellH={34}
              gap={4}
              min={0}
              max={2.2}
              format={fmtVal}
              selected={s.accSelected}
              rowLabels={ROW_LABELS}
              colLabels={OUT_COLS}
              rowLabelW={28}
              title={s.accTitle}
              showLegend={false}
              fontSize={11}
            />

            <ActiveFocusFrame
              x={s.focusFrame.x}
              y={s.focusFrame.y}
              w={s.focusFrame.w}
              h={s.focusFrame.h}
              tone={s.focusFrame.tone}
              label={s.focusFrame.label}
              visible
            />

            <MetricRow
              x={16}
              y={342}
              w={648}
              h={54}
              metrics={[
                { label: '执行阶段', value: s.phaseText, tone: 'q' },
                { label: '片上内存模型', value: s.peakSramText, tone: 'v', active: true },
                { label: '重缩放系数/状态', value: s.rescaleText, tone: 'k' },
                { label: '与全量对齐误差', value: s.accuracyText, tone: 'v' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
