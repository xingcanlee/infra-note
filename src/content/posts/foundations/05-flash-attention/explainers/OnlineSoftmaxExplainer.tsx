import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { BeatExplainer, SvgBeatGroup, defaultBeats, type BeatSpec } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface OnlineSoftmaxState {
  stepIndex: number;
  formulaTex: string;
  beats: BeatSpec[];
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
const P1_TILE: (number | null)[][] = [
  [0.135, 1.0],
  [1.0, 0.135],
];
const S2_TILE: (number | null)[][] = [
  [5.0, 2.0],
  [1.0, 2.0],
];
const P2_TILE: (number | null)[][] = [
  [1.0, 0.05],
  [0.05, 0.135],
];

const STATS_INIT: (number | null)[][] = [
  [null, null, 0.0],
  [null, null, 0.0],
];
const STATS_M1: (number | null)[][] = [
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
const STAT_M_COL = new Set(['0,0', '1,0']);
const STAT_ROW0_MA = new Set(['0,0', '0,1']);
const STAT_L_COL = new Set(['0,2', '1,2']);

export function buildOnlineSoftmaxSteps(): Step<OnlineSoftmaxState>[] {
  const tones: AnyTone[] = ['q', 'k', 'v'];
  assertMaxHues(tones);

  return [
    {
      label: '载入 Tile 1',
      duration: 4600,
      state: {
        stepIndex: 0,
        formulaTex: '$S^{(1)} = Q_{0:2} K_{0:2}^\\top = [[1,3],[4,2]],\\quad (m=-\\infty, l=0)$',
        beats: defaultBeats([
          '锁定 HBM 中 Q 与 Tile 1 (K,V)',
          '将分块流式装入片上 SRAM',
          '框出局部得分矩阵 S^(1)',
          '确认零 HBM 中间矩阵落回',
        ]),
        k0Tone: 'k',
        k1Tone: 'mask',
        outHbmTone: 'mask',
        tileTitle: 'Tile 1 得分 $S^{(1)}$',
        tileTone: 'q',
        tileValues: S1_TILE,
        tileColLabels: ['$k_0$', '$k_1$'],
        tileSelected: ALL_2X2,
        statsValues: STATS_INIT,
        statsTone: 'neutral',
        statsSelected: new Set(),
        accTitle: '唯一 $\\tilde{O}$ (待写)',
        accTone: 'neutral',
        accValues: O_NULL,
        accSelected: new Set(),
        focusFrame: { x: 26, y: 176, w: 152, h: 136, label: 'Tile 1 得分 $S^{(1)}$', tone: 'q' },
        phaseText: '1/7 载入 Tile 1',
        peakSramText: '$2\\times 2$ 分块驻留',
        rescaleText: '$m=-\\infty,\\; l=0$',
        accuracyText: '零 HBM 中间矩阵',
      },
      caption:
        '设 $B_r=2, B_c=2, N=4$：仅将 $Q_{0:2}$ 与第 1 块 $K_{0:2}, V_{0:2}$ 搬入片上 SRAM，算出局部得分 $S^{(1)} = [[1,3],[4,2]]$。此时片上仅分配唯一一份在位状态 $(m, l, \\tilde{O})$，不向 HBM 写回完整 $[4,4]$ 矩阵。',
    },
    {
      label: '首块统计',
      duration: 4600,
      state: {
        stepIndex: 1,
        formulaTex:
          '$m^{(1)} = [3.0, 4.0],\\; \\tilde{P}^{(1)} = \\exp(S^{(1)}-m^{(1)}),\\; l^{(1)}=[1.135,1.135]$',
        beats: defaultBeats([
          '输入片上 Tile 1 得分矩阵',
          '水平推进算出局部权重 P̃^(1)',
          '聚焦更新在位最大值 m^(1) 与 l^(1)',
          '锁定行最大统计归约',
        ]),
        k0Tone: 'k',
        k1Tone: 'mask',
        outHbmTone: 'mask',
        tileTitle: '局部权重 $\\tilde{P}^{(1)}$',
        tileTone: 'k',
        tileValues: P1_TILE,
        tileColLabels: ['$k_0$', '$k_1$'],
        tileSelected: ALL_2X2,
        statsValues: STATS_M1,
        statsTone: 'k',
        statsSelected: STAT_M_COL,
        accTitle: '唯一 $\\tilde{O}$ (待写)',
        accTone: 'neutral',
        accValues: O_NULL,
        accSelected: new Set(),
        focusFrame: {
          x: 213,
          y: 176,
          w: 208,
          h: 136,
          label: '更新 $m^{(1)}, l^{(1)}$',
          tone: 'k',
        },
        phaseText: '2/7 首块统计',
        peakSramText: '片上行最大归约',
        rescaleText: '$m^{(1)}=[3.0, 4.0]$',
        accuracyText: '$l^{(1)}=[1.135, 1.135]$',
      },
      caption:
        '由 $S^{(1)}$ 求得首块行最大 $m^{(1)}=[3.0, 4.0]$，算出未归一化局部权重 $\\tilde{P}^{(1)}=\\exp(S^{(1)}-m^{(1)})=[[0.135, 1.0],[1.0, 0.135]]$，并把行和归约进分母 $l^{(1)}=[1.135, 1.135]$。',
    },
    {
      label: '首块累加',
      duration: 4600,
      state: {
        stepIndex: 2,
        formulaTex:
          '$\\tilde{O}^{(1)} = \\tilde{P}^{(1)} V_{0:2} = [[0.135, 2.000],\\,[1.000, 0.271]]$',
        beats: defaultBeats([
          '锚定局部权重与分母状态 l^(1)',
          '沿片上通道推进累加计算',
          '写入片上唯一累加器 Õ^(1)',
          '核对单份 SRAM 累加状态',
        ]),
        k0Tone: 'k',
        k1Tone: 'mask',
        outHbmTone: 'mask',
        tileTitle: '局部权重 $\\tilde{P}^{(1)}$',
        tileTone: 'k',
        tileValues: P1_TILE,
        tileColLabels: ['$k_0$', '$k_1$'],
        tileSelected: new Set(),
        statsValues: STATS_M1,
        statsTone: 'k',
        statsSelected: STAT_L_COL,
        accTitle: '唯一 $\\tilde{O}^{(1)}$ (片上)',
        accTone: 'v',
        accValues: O_T1,
        accSelected: ALL_2X2,
        focusFrame: { x: 451, y: 176, w: 164, h: 136, label: '写入唯一 $\\tilde{O}$', tone: 'v' },
        phaseText: '3/7 首块累加',
        peakSramText: '1 份 $\\tilde{O}$ 缓冲',
        rescaleText: '$\\alpha = [1.0, 1.0]$',
        accuracyText: '$\\tilde{O}^{(1)} = \\tilde{P}^{(1)}V_{0:2}$',
      },
      caption:
        '将 $\\tilde{P}^{(1)} V_{0:2}$ 写入片上唯一的 $\\tilde{O}$ 累加器（未除以 $l^{(1)}$），得到 $\\tilde{O}^{(1)} = [[0.135, 2.000],[1.000, 0.271]]$，随即释放第 1 块 $K_{0:2}, V_{0:2}$ 的片上缓冲。',
    },
    {
      label: '换入 Tile 2',
      duration: 4600,
      state: {
        stepIndex: 3,
        formulaTex:
          '$S^{(2)} = Q_{0:2} K_{2:4}^\\top = [[5,2],[1,2]],\\quad r_0\\text{ 峰值 } 3.0 \\to 5.0$',
        beats: defaultBeats([
          '释放 Tile 1 并选中 Tile 2',
          '原地覆盖写入片上 SRAM 分块',
          '标亮 r0 新峰值 5.0 > 3.0',
          '提醒旧累加基数待缩放',
        ]),
        k0Tone: 'visited',
        k1Tone: 'k',
        outHbmTone: 'mask',
        tileTitle: 'Tile 2 覆盖 $S^{(2)}$',
        tileTone: 'q',
        tileValues: S2_TILE,
        tileColLabels: ['$k_2$', '$k_3$'],
        tileSelected: ROW0_2X2,
        statsValues: STATS_M1,
        statsTone: 'neutral',
        statsSelected: new Set(),
        accTitle: '唯一 $\\tilde{O}$ (待缩放)',
        accTone: 'neutral',
        accValues: O_T1,
        accSelected: new Set(),
        focusFrame: { x: 26, y: 176, w: 152, h: 136, label: 'Tile 2 覆盖 $S^{(2)}$', tone: 'q' },
        phaseText: '4/7 换入 Tile 2',
        peakSramText: '原地覆盖 Tile 缓冲',
        rescaleText: '$S^{(2)}_{0,0}=5.0 > 3.0$',
        accuracyText: '$r_0$ 最大值跃升',
      },
      caption:
        '换入第 2 块 $K_{2:4}, V_{2:4}$ 原地覆盖旧分块空间，算出 $S^{(2)}=[[5,2],[1,2]]$。此时第 0 行出现更大的峰值 $5.0$（超过历史 $m_0^{(1)}=3.0$），意味着旧累加器 $\\tilde{O}_0$ 与 $l_0$ 的指数基数需要修正。',
    },
    {
      label: '重缩放 α',
      duration: 4600,
      state: {
        stepIndex: 4,
        formulaTex: '$\\alpha = \\exp(m^{(1)} - m^{(2)}) = [e^{3-5}, e^{4-4}] = [0.135, 1.0]$',
        beats: defaultBeats([
          '固定 Tile 2 局部变量 P̃^(2)',
          '推演 r0 新行最大值 m0: 3->5',
          '计算指数矫正系数 α = [0.135, 1.0]',
          '确认指数基数对齐完成',
        ]),
        k0Tone: 'visited',
        k1Tone: 'k',
        outHbmTone: 'mask',
        tileTitle: 'Tile 2 权重 $\\tilde{P}^{(2)}$',
        tileTone: 'k',
        tileValues: P2_TILE,
        tileColLabels: ['$k_2$', '$k_3$'],
        tileSelected: ROW0_2X2,
        statsValues: STATS_RESCALE,
        statsTone: 'k',
        statsSelected: STAT_ROW0_MA,
        accTitle: '唯一 $\\tilde{O}$ (待缩放)',
        accTone: 'neutral',
        accValues: O_T1,
        accSelected: new Set(),
        focusFrame: {
          x: 213,
          y: 176,
          w: 208,
          h: 136,
          label: '$\\alpha = e^{m^{(1)}-m^{(2)}}$ 重缩放',
          tone: 'k',
        },
        phaseText: '5/7 计算重缩放 $\\alpha$',
        peakSramText: '指数对齐新峰值',
        rescaleText: '$\\alpha=[0.135, 1.0]$',
        accuracyText: '$r_0: 3 \\to 5$',
      },
      caption:
        '更新 $m^{(2)} = \\max(m^{(1)}, \\operatorname{rowmax}(S^{(2)})) = [5.0, 4.0]$：第 0 行最大值从 $3$ 跳升到 $5$，算得重缩放因子 $\\alpha_0 = e^{3-5} = 0.135$；第 1 行最大值未超 $4$，保持 $\\alpha_1 = 1.0$。',
    },
    {
      label: '就地修正',
      duration: 4600,
      state: {
        stepIndex: 5,
        formulaTex:
          '$\\tilde{O} \\leftarrow \\operatorname{diag}(\\alpha)\\tilde{O} + \\tilde{P}^{(2)}V_{2:4},\\quad l=[1.203,1.320]$',
        beats: defaultBeats([
          '锁定重缩放系数与新权重 P̃^(2)',
          '同步缩放旧分母与累加器通道',
          '原地覆盖唯一缓冲得出 Õ^(2)',
          '核对零副本 SRAM 内存消耗',
        ]),
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
        phaseText: '6/7 在位重缩放',
        peakSramText: '无额外 $\\tilde{O}$ 副本',
        rescaleText: '$l=[1.203, 1.320]$',
        accuracyText: '$\\alpha\\tilde{O} + \\tilde{P}^{(2)}V_2$',
      },
      caption:
        '片上唯一的 $\\tilde{O}$ 就地完成缩放累加：$\\tilde{O} \\leftarrow \\operatorname{diag}(\\alpha)\\tilde{O} + \\tilde{P}^{(2)}V_{2:4} = [[2.018, 1.470],[1.100, 0.862]]$，分母同步缩放并累加至 $l=[1.203, 1.320]$，全程复用同一块 SRAM。',
    },
    {
      label: '尾声归一',
      duration: 4600,
      state: {
        stepIndex: 6,
        formulaTex:
          '$O = \\operatorname{diag}(l)^{-1}\\tilde{O} \\;\\longrightarrow\\; \\text{仅 1 次写回 HBM}$',
        beats: defaultBeats([
          '用终局分母 l 一次性除尽 Õ',
          '算出最终注意力输出矩阵 O',
          '触发向上箭头单次写回 HBM',
          '对齐数值精度误差 2.22e-16',
        ]),
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
        phaseText: '7/7 尾声归一化',
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
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        const isTile1 = s.stepIndex <= 2;
        const isTile2 = s.stepIndex >= 3 && s.stepIndex <= 5;
        const isFinal = s.stepIndex === 6;

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

            {/* Vertical HBM <-> SRAM DataFlowArrows rendered above SectionBox */}
            <DataFlowArrow
              points={[
                [isTile1 ? 176 : 380, 96],
                [isTile1 ? 176 : 380, 122],
                [164, 122],
                [164, 174],
              ]}
              tone="k"
              active={!isFinal}
              flow={!isFinal && beat >= 1}
              visible={!isFinal ? beat >= 1 : true}
              draw={!isFinal && beat >= 1}
              dotToken={!isFinal && beat >= 1 ? dotToken : 0}
            />

            <DataFlowArrow
              points={[
                [605, 174],
                [605, 104],
              ]}
              tone="v"
              active={isFinal}
              dashed={!isFinal}
              flow={isFinal && beat >= 2}
              visible={isFinal ? beat >= 2 : true}
              draw={isFinal && beat >= 2}
              dotToken={isFinal && beat >= 2 ? dotToken : 0}
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
              showSelected={beat >= 1}
              dimmed={beat < 1 && (s.stepIndex === 0 || s.stepIndex === 3)}
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
              active={s.stepIndex >= 1 && s.stepIndex <= 5}
              flow={(s.stepIndex === 1 || s.stepIndex === 4) && beat >= 1}
              visible={beat >= 1 || s.stepIndex === 0}
              draw={s.stepIndex >= 1 && beat >= 1}
              dotToken={(s.stepIndex === 1 || s.stepIndex === 4) && beat >= 1 ? dotToken : 0}
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
              showSelected={beat >= 1}
              dimmed={beat < 1 && (s.stepIndex === 1 || s.stepIndex === 4)}
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
              active={s.stepIndex === 2 || s.stepIndex >= 5}
              flow={(s.stepIndex === 2 || s.stepIndex === 5) && beat >= 1}
              visible={beat >= 1 || s.stepIndex <= 1}
              draw={(s.stepIndex === 2 || s.stepIndex >= 5) && beat >= 1}
              dotToken={(s.stepIndex === 2 || s.stepIndex === 5) && beat >= 1 ? dotToken : 0}
            />

            <SvgBeatGroup dimmed={beat < 2 && (s.stepIndex === 2 || s.stepIndex >= 5)}>
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
                showSelected={beat >= 2}
                rowLabels={ROW_LABELS}
                colLabels={OUT_COLS}
                rowLabelW={28}
                title={s.accTitle}
                showLegend={false}
                fontSize={11}
              />
            </SvgBeatGroup>

            <ActiveFocusFrame
              x={s.focusFrame.x}
              y={s.focusFrame.y}
              w={s.focusFrame.w}
              h={s.focusFrame.h}
              tone={s.focusFrame.tone}
              label={s.focusFrame.label}
              visible={beat >= 2}
            />

            <MetricRow
              x={16}
              y={342}
              w={648}
              h={54}
              revealed={beat >= 3}
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
