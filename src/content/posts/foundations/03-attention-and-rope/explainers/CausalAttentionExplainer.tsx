import { useMemo } from 'react';
import { Stage, type Step, type Tone } from 'astro-wisp/explainers';
import { BeatExplainer } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow } from '@/explainers/kit/MetricRow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues } from '@/explainers/kit/motion';

export interface CausalAttentionState {
  stepIndex: number;
  formulaTex: string;
  centerTitle: string;
  centerTone: Tone;
  centerValues: (number | null)[][];
  centerMasks: boolean[][];
  centerRowSums?: number[];
  selectedCenter: ReadonlySet<string>;
  outputValues: (number | null)[][];
  outputSelected: ReadonlySet<string>;
  scaleFormula: string;
  varianceText: string;
  maskCountText: string;
  focusRowText: string;
}

const TOKENS = ['猫', '坐在', '垫', '上'];
const COL_IDX = ['$t=0$', '$t=1$', '$t=2$', '$t=3$'];
const DIM_COLS = ['$d_0$', '$d_1$', '$d_2$', '$d_3$'];

const SCALED_S: (number | null)[][] = [
  [1.0, 0.0, 0.0, 0.0],
  [0.5, 0.5, 0.0, 0.0],
  [0.5, 1.0, 0.5, 1.0],
  [1.0, 0.5, 0.5, 1.0],
];

const CAUSAL_MASKS: boolean[][] = [
  [false, true, true, true],
  [false, false, true, true],
  [false, false, false, true],
  [false, false, false, false],
];

const PROBS_P: (number | null)[][] = [
  [1.0, 0.0, 0.0, 0.0],
  [0.5, 0.5, 0.0, 0.0],
  [0.2741, 0.4519, 0.2741, 0.0],
  [0.3112, 0.1888, 0.1888, 0.3112],
];

const OUT_O: (number | null)[][] = [
  [1.0, 0.0, 0.5, 0.0],
  [0.5, 0.5, 0.25, 0.25],
  [0.4111, 0.5889, 0.4111, 0.2259],
  [0.4056, 0.2832, 0.5, 0.4056],
];

const EMPTY_OUT: (number | null)[][] = [
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
  [null, null, null, null],
];

const NO_MASKS: boolean[][] = [
  [false, false, false, false],
  [false, false, false, false],
  [false, false, false, false],
  [false, false, false, false],
];

function fmtScore(v: number | null): string {
  return v === null ? '--' : v.toFixed(2);
}

function fmtProb(v: number | null): string {
  return v === null ? '--' : v.toFixed(3);
}

export function buildCausalAttentionSteps(): Step<CausalAttentionState>[] {
  const tones: Tone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones);

  const row2Focus = new Set(['2,0', '2,1', '2,2', '2,3']);
  const futureCell = new Set(['2,3']);
  const row3Focus = new Set(['3,0', '3,1', '3,2', '3,3']);

  return [
    {
      label: '点积与尺度缩放',
      duration: 4600,
      state: {
        stepIndex: 0,
        formulaTex:
          '$S = QK^\\top / \\sqrt{4} = 0.5\\,QK^\\top \\in \\mathbb{R}^{4 \\times 4},\\; \\operatorname{Var}(S) = 1.0$',
        centerTitle: '缩放分数 $S = QK^\\top / \\sqrt{4}\\;[4, 4]$',
        centerTone: 'active',
        centerValues: SCALED_S,
        centerMasks: NO_MASKS,
        selectedCenter: futureCell,
        outputValues: EMPTY_OUT,
        outputSelected: new Set(),
        scaleFormula: '$/\\sqrt{4} = \\times 0.5$',
        varianceText: '$\\operatorname{Var}(S) = 1.0$',
        maskCountText: '0 / 16 ($t=2$ 可见 $t=3$)',
        focusRowText: '$S[2] = [0.5, 1.0, 0.5, 1.0]$',
      },
      caption:
        '4 个 token 经投影得到 $Q, K, V \\in \\mathbb{R}^{4 \\times 4}$。先计算点积并除以 $\\sqrt{d_k} = 2$，将方差从 $d_k$ 拉回稳定的 $1.0$；此时第 2 行“垫”上 $S[2, 3] = 1.00$ 仍能读取未来词“上”。',
    },
    {
      label: '上三角因果掩码',
      duration: 4600,
      state: {
        stepIndex: 1,
        formulaTex: '$S_{i,j} \\leftarrow -\\infty\\; (j > i),\\quad 6/16\\text{ 未来单元屏蔽}$',
        centerTitle: '因果掩码 $S + M_{\\text{triu}}\\;[4, 4]$',
        centerTone: 'highlight',
        centerValues: SCALED_S,
        centerMasks: CAUSAL_MASKS,
        selectedCenter: row2Focus,
        outputValues: EMPTY_OUT,
        outputSelected: new Set(),
        scaleFormula: '上三角置 $-\\infty$',
        varianceText: '保留当前及左侧因果历史',
        maskCountText: '6 / 16 未来单元置 $-\\infty$',
        focusRowText: '$S[2] \\to [0.5, 1.0, 0.5, -\\infty]$',
      },
      caption:
        '对主对角线上方（$j > i$）叠加因果掩码 $M_{\\text{triu}}$，把 6 个未来位置置为 $-\\infty$（虚线格）。第 $t=2$ 行仅保留 $[0.5, 1.0, 0.5, -\\infty]$，阻断未来信息泄露。',
    },
    {
      label: '行内 Softmax 归一',
      duration: 4600,
      state: {
        stepIndex: 2,
        formulaTex:
          '$P = \\operatorname{softmax}(S + M_{\\text{triu}}),\\; \\sum_j P_{i,j} = 1.00$',
        centerTitle: '逐行 Softmax 概率 $P\\;[4, 4]$',
        centerTone: 'active',
        centerValues: PROBS_P,
        centerMasks: CAUSAL_MASKS,
        centerRowSums: [1.0, 1.0, 1.0, 1.0],
        selectedCenter: row2Focus,
        outputValues: EMPTY_OUT,
        outputSelected: new Set(),
        scaleFormula: '$\\exp(-\\infty) = 0.000$',
        varianceText: '每行归一至 1.00',
        maskCountText: '6 / 16 权重归零',
        focusRowText: '$t=2$ 聚焦“坐在”(0.452)',
      },
      caption:
        '逐行执行 Softmax：$\\exp(-\\infty) = 0$ 使未来权重清零，$t=2$ 行得到 $[0.274, 0.452, 0.274, 0]$，最聚焦于动词“坐在”；$t=3$ 行则均衡关注句首“猫”（$0.311$）与自身“上”（$0.311$）。',
    },
    {
      label: '加权聚合输出',
      duration: 4600,
      state: {
        stepIndex: 3,
        formulaTex: '$O = P \\cdot V \\in \\mathbb{R}^{4 \\times 4},\\quad \\text{复杂度 } O(T^2)$',
        centerTitle: '注意力权重矩阵 $P\\;[4, 4]$',
        centerTone: 'active',
        centerValues: PROBS_P,
        centerMasks: CAUSAL_MASKS,
        centerRowSums: [1.0, 1.0, 1.0, 1.0],
        selectedCenter: row3Focus,
        outputValues: OUT_O,
        outputSelected: row3Focus,
        scaleFormula: '$O = P \\cdot V$',
        varianceText: '4 个 token 上下文融合完成',
        maskCountText: '复杂度 $O(T^2)$：需 Flash/KV',
        focusRowText: '$O_3$:[.41,.28,.50,.41]',
      },
      caption:
        '最后由 $O = P \\cdot V$ 将各历史 token 的值向量按权重聚合，写出输出矩阵 $O \\in \\mathbb{R}^{4 \\times 4}$。行末位置“上”的输出 $[0.406, 0.283, 0.500, 0.406]$ 已融入主语“猫”的语义。',
    },
  ];
}

export default function CausalAttentionExplainer({
  title = '图 1：4 个 token 因果自注意力计算全链路（$QK^\\top / \\sqrt{d_k} \\to \\text{Mask} \\to \\text{Softmax} \\to PV$）',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildCausalAttentionSteps(), []);

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label="因果自注意力逐步交互推导"
      stageMinHeight={474}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { dotToken }) => {
        const s = step.state;
        const isScoring = s.stepIndex === 0;
        const isOutput = s.stepIndex === 3;
        const fmt = s.stepIndex >= 2 ? fmtProb : fmtScore;

        return (
          <Stage width={STAGE_W} height={378} label="4 个 token 因果自注意力逐步推演">
            <TensorBlock
              x={12}
              y={36}
              w={56}
              h={44}
              tone="active"
              texName="Q"
              texWidth={46}
              shape="[4, 4]"
              active={isScoring}
              dimmed={isOutput}
            />
            <TensorBlock
              x={12}
              y={122}
              w={56}
              h={44}
              tone="highlight"
              texName={'K^\\top'}
              texWidth={46}
              shape="[4, 4]"
              active={isScoring}
              dimmed={isOutput}
            />
            <TensorBlock
              x={12}
              y={208}
              w={56}
              h={44}
              tone="done"
              texName="V"
              texWidth={46}
              shape="[4, 4]"
              active={isOutput}
              dimmed={!isOutput}
            />

            <DataFlowArrow
              points={[
                [68, 58],
                [104, 88],
              ]}
              tone="active"
              active={isScoring}
              flow={isScoring}
              continuous
              draw={isScoring}
              dotToken={isScoring ? dotToken : 0}
            />
            <DataFlowArrow
              points={[
                [68, 144],
                [104, 144],
              ]}
              tone="highlight"
              active={isScoring}
              flow={isScoring}
              continuous
              draw={isScoring}
              dotToken={isScoring ? dotToken : 0}
            />

            <HeatmapMatrix
              x={104}
              y={24}
              title={s.centerTitle}
              tone={s.centerTone}
              values={s.centerValues}
              masks={s.centerMasks}
              maskText="-∞"
              rowLabels={TOKENS}
              colLabels={COL_IDX}
              rowSums={s.centerRowSums?.map((v) => v.toFixed(2))}
              rowLabelW={32}
              cellW={42}
              cellH={38}
              gap={4}
              min={0}
              max={1.0}
              format={fmt}
              selected={s.selectedCenter}
              selectedTone="highlight"
              showSelected={true}
              showMasks={true}
              showSums={true}
              showLegend={false}
              fontSize={11}
            />

            <DataFlowArrow
              points={[
                [364, 152],
                [420, 152],
              ]}
              tone="done"
              active={isOutput}
              flow={isOutput}
              continuous
              draw={isOutput}
              dotToken={isOutput ? dotToken : 0}
              label={'$P \\cdot V$'}
              labelPos={[396, 137]}
            />

            <DataFlowArrow
              points={[
                [68, 240],
                [84, 240],
                [84, 282],
                [392, 282],
                [392, 174],
                [420, 174],
              ]}
              tone="done"
              active={isOutput}
              muted={!isOutput}
              flow={isOutput}
              continuous
              draw={isOutput}
              dotToken={isOutput ? dotToken : 0}
              label="加权值 $V$"
              labelPos={[238, 270]}
            />

            <HeatmapMatrix
              x={422}
              y={24}
              title={'输出向量 $O = P \\cdot V\\;[4, 4]$'}
              tone="done"
              values={s.outputValues}
              rowLabels={TOKENS}
              colLabels={DIM_COLS}
              rowLabelW={32}
              cellW={46}
              cellH={38}
              gap={4}
              min={0}
              max={1.0}
              format={fmtProb}
              selected={s.outputSelected}
              selectedTone="done"
              showSelected={isOutput}
              dimmed={!isOutput}
              showLegend={false}
              fontSize={11}
            />

            <MetricRow
              x={16}
              y={312}
              w={648}
              h={42}
              metrics={[
                { label: '核心算子', value: s.scaleFormula, tone: 'active', active: true },
                { label: '方差/分布', value: s.varianceText, tone: 'highlight' },
                { label: '因果约束', value: s.maskCountText, tone: 'neutral' },
                { label: '焦点观察', value: s.focusRowText, tone: 'done' },
              ]}
            />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
