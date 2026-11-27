import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { BeatExplainer } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface OnlineSoftmaxState {
  stepIndex: number;
  formulaTex: string;
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

const ROW_LABELS = ['$r_0$', '$r_1$'];
const STAT_COLS = ['$m$', '$\\alpha$', '$l$'];
const OUT_COLS = ['$d_0$', '$d_1$'];

const S1_TILE: (number | null)[][] = [
  [1.0, 3.0],
  [4.0, 2.0],
];
const S2_TILE: (number | null)[][] = [
  [5.0, 2.0],
  [1.0, 2.0],
];
const P2_TILE: (number | null)[][] = [
  [1.0, 0.05],
  [0.05, 0.135],
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
const STAT_ROW0_MA = new Set(['0,0', '0,1']);
const STAT_L_COL = new Set(['0,2', '1,2']);

export function buildOnlineSoftmaxSteps(): Step<OnlineSoftmaxState>[] {
  const tones: AnyTone[] = ['q', 'k', 'v'];
  assertMaxHues(tones);

  return [
    {
      label: '载入 Tile 1 与统计',
      duration: 4600,
      state: {
        stepIndex: 0,
        formulaTex:
          '$S^{(1)} = [[1,3],[4,2]] \\implies m^{(1)}=[3,4],\\; l^{(1)}=[1.135,1.135],\\; \\tilde{O}^{(1)}$',
        k0Tone: 'k',
        k1Tone: 'mask',
        outHbmTone: 'mask',
        tileTitle: 'Tile 1 得分 $S^{(1)}$',
        tileTone: 'q',
        tileValues: S1_TILE,
        tileColLabels: ['$k_0$', '$k_1$'],
        tileSelected: ALL_2X2,
        statsValues: STATS_T1,
        statsTone: 'k',
        statsSelected: STAT_M_ALPHA,
        accTitle: '唯一 $\\tilde{O}^{(1)}$ (片上)',
        accTone: 'v',
        accValues: O_T1,
        accSelected: ALL_2X2,
        focusFrame: { x: 26, y: 176, w: 152, h: 136, label: 'Tile 1 入片上', tone: 'q' },
        phaseText: '1/4 Tile 1 统计累加',
        peakSramText: '$2\\times 2$ 分块驻留',
        rescaleText: '$m^{(1)}=[3.0, 4.0]$',
        accuracyText: '零 HBM 中间矩阵',
      },
      caption:
        '设 $B_r=2, B_c=2, N=4$：将 $Q_{0:2}$ 与第 1 块 $K_{0:2}, V_{0:2}$ 搬入片上 SRAM，算出局部得分 $S^{(1)}=[[1,3],[4,2]]$、最大值 $m^{(1)}=[3,4]$、分母 $l^{(1)}=[1.135,1.135]$，并将 $\\tilde{P}^{(1)}V_{0:2}$ 写入唯一累加器 $\\tilde{O}^{(1)}$。',
    },
    {
      label: '换入 Tile 2 更新最大值',
      duration: 4600,
      state: {
        stepIndex: 1,
        formulaTex:
          '$S^{(2)}_{0,0}=5.0 > 3.0 \\implies m^{(2)}=[5.0,4.0],\\; \\alpha=[e^{3-5},1]=[0.135,1.0]$',
        k0Tone: 'visited',
        k1Tone: 'k',
        outHbmTone: 'mask',
        tileTitle: 'Tile 2 覆盖 $S^{(2)}$',
        tileTone: 'q',
        tileValues: S2_TILE,
        tileColLabels: ['$k_2$', '$k_3$'],
        tileSelected: ROW0_2X2,
        statsValues: STATS_RESCALE,
        statsTone: 'k',
        statsSelected: STAT_ROW0_MA,
        accTitle: '唯一 $\\tilde{O}$ (待乘 $\\alpha$)',
        accTone: 'neutral',
        accValues: O_T1,
        accSelected: new Set(),
        focusFrame: {
          x: 213,
          y: 176,
          w: 208,
          h: 136,
          label: '$\\alpha = e^{m^{(1)}-m^{(2)}}$',
          tone: 'k',
        },
        phaseText: '2/4 换入 Tile 2',
        peakSramText: '原地覆盖 Tile 缓冲',
        rescaleText: '$\\alpha=[0.135, 1.0]$',
        accuracyText: '$r_0$ 最大值 $3\\to 5$',
      },
      caption:
        '换入第 2 块 $K_{2:4}, V_{2:4}$ 原地覆盖旧分块空间，算出 $S^{(2)}=[[5,2],[1,2]]$。第 0 行最大值从 $3$ 跃升至 $5$，求得重缩放系数 $\\alpha_0 = e^{3-5}=0.135$；第 1 行最大值未变，保持 $\\alpha_1 = 1.0$。',
    },
    {
      label: '重缩放 α 就地累加',
      duration: 4600,
      state: {
        stepIndex: 2,
        formulaTex:
          '$\\tilde{O} \\leftarrow \\operatorname{diag}(\\alpha)\\tilde{O} + \\tilde{P}^{(2)}V_{2:4},\\quad l=[1.203,1.320]$',
        k0Tone: 'visited',
        k1Tone: 'k',
        outHbmTone: 'mask',
        tileTitle: 'Tile 2 权重 $\\tilde{P}^{(2)}$',
        tileTone: 'k',
        tileValues: P2_TILE,
        tileColLabels: ['$k_2$', '$k_3$'],
        tileSelected: new Set(),
        statsValues: STATS_T2,
        statsTone: 'v',
        statsSelected: STAT_M_ALPHA,
        accTitle: '唯一 $\\tilde{O}$ (就地修正)',
        accTone: 'v',
        accValues: O_T2,
        accSelected: ALL_2X2,
        focusFrame: { x: 451, y: 176, w: 164, h: 136, label: '就地覆盖 $\\tilde{O}$', tone: 'v' },
        phaseText: '3/4 就地重缩放',
        peakSramText: '无额外 $\\tilde{O}$ 副本',
        rescaleText: '$l=[1.203, 1.320]$',
        accuracyText: '$\\alpha\\tilde{O} + \\tilde{P}^{(2)}V_2$',
      },
      caption:
        '片上唯一的 $\\tilde{O}$ 就地乘以 $\\alpha$ 并累加新块贡献：$\\tilde{O}^{(2)} = [[2.018, 1.470],[1.100, 0.862]]$，分母同步缩放并累加至 $l=[1.203, 1.320]$，全程复用同一块片上 SRAM 缓冲。',
    },
    {
      label: '尾声归一写回 HBM',
      duration: 4600,
      state: {
        stepIndex: 3,
        formulaTex:
          '$O = \\operatorname{diag}(l)^{-1}\\tilde{O} \\;\\longrightarrow\\; \\text{仅 1 次写回 HBM}$',
        k0Tone: 'visited',
        k1Tone: 'visited',
        outHbmTone: 'v',
        tileTitle: 'Tile 生命周期结束',
        tileTone: 'neutral',
        tileValues: P2_TILE,
        tileColLabels: ['$k_2$', '$k_3$'],
        tileSelected: new Set(),
        statsValues: STATS_T2,
        statsTone: 'v',
        statsSelected: STAT_L_COL,
        accTitle: '唯一 $O = \\tilde{O} / l$',
        accTone: 'v',
        accValues: O_FINAL,
        accSelected: ALL_2X2,
        focusFrame: { x: 554, y: 44, w: 102, h: 58, label: '1 次写回 HBM', tone: 'v' },
        phaseText: '4/4 尾声归一化',
        peakSramText: 'HBM 读写 $O(Nd)$',
        rescaleText: '$O = \\tilde{O} / l$',
        accuracyText: '误差 $2.22\\times 10^{-16}$',
      },
      caption:
        '遍历全部 $K/V$ 块后，在片上将唯一的 $\\tilde{O}$ 一次性除以 $l=[1.203, 1.320]$，得到最终输出 $[[1.677, 1.221],[0.833, 0.653]]$ 并单次写回 HBM；与完整 $[4,4]$ Softmax 数值误差仅 $2.22\\times 10^{-16}$。',
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
    <BeatExplainer
      title={title}
      label="Online Softmax 片上就地重缩放交互推演"
      steps={steps}
      stageMinHeight={508}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { dotToken }) => {
        const s = step.state;
        const isTile1 = s.stepIndex === 0;
        const isTile2 = s.stepIndex === 1 || s.stepIndex === 2;
        const isFinal = s.stepIndex === 3;

        return (
          <Stage width={STAGE_W} height={412} label="Online Softmax 片上单一累加器就地重缩放流程">
            <SectionBox
              x={16}
              y={10}
              w={648}
              h={106}
              title="HBM 全局显存 (分块按需流式读取，不写回 $[N, N]$ 矩阵)"
              tone="neutral"
            />

            <TensorBlock
              x={28}
              y={56}
              w={88}
              h={36}
              tone="q"
              texName="Q_{0:2}"
              texWidth={56}
              shape="$[2, d]$"
              active
            />
            <TensorBlock
              x={132}
              y={56}
              w={88}
              h={36}
              tone={s.k0Tone}
              texName="K_{0:2}"
              texWidth={56}
              shape="Tile 1"
              active={isTile1}
              muted={!isTile1}
            />
            <TensorBlock
              x={228}
              y={56}
              w={88}
              h={36}
              tone={s.k0Tone}
              texName="V_{0:2}"
              texWidth={56}
              shape="Tile 1"
              active={isTile1}
              muted={!isTile1}
            />
            <TensorBlock
              x={336}
              y={56}
              w={88}
              h={36}
              tone={s.k1Tone}
              texName="K_{2:4}"
              texWidth={56}
              shape="Tile 2"
              active={isTile2}
              muted={!isTile2}
              dashed={isTile1}
            />
            <TensorBlock
              x={432}
              y={56}
              w={88}
              h={36}
              tone={s.k1Tone}
              texName="V_{2:4}"
              texWidth={56}
              shape="Tile 2"
              active={isTile2}
              muted={!isTile2}
              dashed={isTile1}
            />
            <TensorBlock
              x={562}
              y={54}
              w={86}
              h={40}
              tone={s.outHbmTone}
              name="$O_{0:2}$"
              shape="最终输出"
              labelMode="inside"
              active={isFinal}
              dashed={!isFinal}
            />

            <SectionBox x={16} y={140} w={648} h={190} title="片上 SRAM / UB" tone="v" />

            <DataFlowArrow
              points={[
                [isTile1 ? 176 : 380, 96],
                [isTile1 ? 176 : 380, 122],
                [164, 122],
                [164, 174],
              ]}
              tone="k"
              active={!isFinal}
              muted={isFinal}
              flow={!isFinal}
              continuous
              draw={!isFinal}
              dotToken={!isFinal ? dotToken : 0}
            />

            <DataFlowArrow
              points={[
                [605, 174],
                [605, 104],
              ]}
              tone="v"
              active={isFinal}
              dashed={!isFinal}
              flow={isFinal}
              continuous
              draw={isFinal}
              dotToken={isFinal ? dotToken : 0}
            />

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
              showSelected={true}
              dimmed={isFinal}
              rowLabels={ROW_LABELS}
              colLabels={s.tileColLabels}
              rowLabelW={28}
              title={s.tileTitle}
              showLegend={false}
              fontSize={11}
            />

            <DataFlowArrow
              points={[
                [182, 262],
                [210, 262],
              ]}
              tone="k"
              active={s.stepIndex <= 2}
              flow={s.stepIndex <= 1}
              continuous
              draw={s.stepIndex <= 1}
              dotToken={s.stepIndex <= 1 ? dotToken : 0}
            />

            <HeatmapMatrix
              x={218}
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
              showSelected={true}
              rowLabels={ROW_LABELS}
              colLabels={STAT_COLS}
              rowLabelW={28}
              title={'在位状态 $(m, \\alpha, l)$'}
              showLegend={false}
              fontSize={11}
            />

            <DataFlowArrow
              points={[
                [425, 262],
                [448, 262],
              ]}
              tone="v"
              active={s.stepIndex === 0 || s.stepIndex >= 2}
              flow={s.stepIndex === 0 || s.stepIndex >= 2}
              continuous
              draw={s.stepIndex === 0 || s.stepIndex >= 2}
              dotToken={s.stepIndex === 0 || s.stepIndex >= 2 ? dotToken : 0}
            />

            <HeatmapMatrix
              x={456}
              y={188}
              values={s.accValues}
              tone={s.accTone}
              selectedTone="v"
              cellW={60}
              cellH={34}
              gap={4}
              min={0}
              max={2.2}
              format={fmtVal}
              selected={s.accSelected}
              showSelected={true}
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
              visible={true}
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
    </BeatExplainer>
  );
}
