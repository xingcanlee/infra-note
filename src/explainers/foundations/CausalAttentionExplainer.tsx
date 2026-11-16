import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import {
  DataFlowArrow,
  HeatmapMatrix,
  MetricRow,
  STAGE_W,
  TensorBlock,
  assertMaxHues,
} from '@/explainers/kit';

export interface CausalAttentionState {
  stepIndex: number;
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
const COL_IDX = ['t=0', 't=1', 't=2', 't=3'];
const DIM_COLS = ['d0', 'd1', 'd2', 'd3'];

const RAW_QK: (number | null)[][] = [
  [2.0, 0.0, 0.0, 0.0],
  [1.0, 1.0, 0.0, 0.0],
  [1.0, 2.0, 1.0, 2.0],
  [2.0, 1.0, 1.0, 2.0],
];

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
      state: {
        stepIndex: 0,
        centerTitle: '原始点积矩阵 Q K^T [4, 4]',
        centerTone: 'active',
        centerValues: RAW_QK,
        centerMasks: NO_MASKS,
        selectedCenter: new Set(),
        outputValues: EMPTY_OUT,
        outputSelected: new Set(),
        scaleFormula: '未缩放 (直接内积)',
        varianceText: 'Var = d_k (随维度膨胀)',
        maskCountText: '0 / 16 未来位置未遮蔽',
        focusRowText: 't=2 与未来 t=3 点积高达 2.0',
      },
      caption:
        '4 个词元经投影得到 $Q, K, V \\in \\mathbb{R}^{4 \\times 4}$。先算原始相似度矩阵 $Q K^\\top$：若不做缩放，独立向量内积的方差会随 $d_k$ 线性膨胀到 $d_k$ 倍，直接把 Softmax 推向饱和区。',
    },
    {
      state: {
        stepIndex: 1,
        centerTitle: '缩放分数 S = Q K^T / sqrt(4) [4, 4]',
        centerTone: 'active',
        centerValues: SCALED_S,
        centerMasks: NO_MASKS,
        selectedCenter: futureCell,
        outputValues: EMPTY_OUT,
        outputSelected: new Set(),
        scaleFormula: '/ sqrt(4) = x 0.5',
        varianceText: 'Var(q.k / sqrt(d_k)) = 1.0',
        maskCountText: '0 / 16 (t=2 仍可见 t=3)',
        focusRowText: 'S[2] = [0.5, 1.0, 0.5, 1.0]',
      },
      caption:
        '整体除以 $\\sqrt{d_k} = 2$ 后方差回归稳定的 $1.0$（对应 vLLM 中 self.scaling = $d_k^{-0.5}$）。但看第 2 行「垫」：$S[2, 3] = 1.00$ 说明此时仍能偷看未来词元「上」。',
    },
    {
      state: {
        stepIndex: 2,
        centerTitle: '因果掩码 S + M_triu [4, 4]',
        centerTone: 'highlight',
        centerValues: SCALED_S,
        centerMasks: CAUSAL_MASKS,
        selectedCenter: row2Focus,
        outputValues: EMPTY_OUT,
        outputSelected: new Set(),
        scaleFormula: 'strict triu(-inf)',
        varianceText: '保留当前及左侧因果历史',
        maskCountText: '6 / 16 未来单元置 -inf',
        focusRowText: 'S[2] -> [0.5, 1.0, 0.5, -inf]',
      },
      caption:
        '加上严格上三角因果掩码 $M_{\\text{triu}}$，把所有 $j > i$ 的 6 个未来单元设为 $-\\infty$（虚线格）。第 $t=2$ 行只保留 $[0.5, 1.0, 0.5, -\\infty]$，彻底切断未来信息泄露。',
    },
    {
      state: {
        stepIndex: 3,
        centerTitle: '逐行 Softmax 概率 P [4, 4]',
        centerTone: 'active',
        centerValues: PROBS_P,
        centerMasks: CAUSAL_MASKS,
        centerRowSums: [1.0, 1.0, 1.0, 1.0],
        selectedCenter: row2Focus,
        outputValues: EMPTY_OUT,
        outputSelected: new Set(),
        scaleFormula: 'exp(-inf) = 0.000',
        varianceText: '每行严格归一化至 1.00',
        maskCountText: '6 / 16 权重严格清零',
        focusRowText: 't=2 最强关注 t=1「坐在」(0.452)',
      },
      caption:
        '逐行执行 Softmax：$\\exp(-\\infty) = 0$ 使未来权重清零，$t=2$ 行得到 $[0.274, 0.452, 0.274, 0]$，最聚焦于动词「坐在」；$t=3$ 行则均衡关注句首「猫」（$0.311$）与自身「上」（$0.311$）。',
    },
    {
      state: {
        stepIndex: 4,
        centerTitle: '注意力权重矩阵 P [4, 4]',
        centerTone: 'active',
        centerValues: PROBS_P,
        centerMasks: CAUSAL_MASKS,
        centerRowSums: [1.0, 1.0, 1.0, 1.0],
        selectedCenter: row3Focus,
        outputValues: OUT_O,
        outputSelected: row3Focus,
        scaleFormula: 'O = P @ V',
        varianceText: '4 词元上下文向量融合完成',
        maskCountText: '复杂度 O(T^2): 长序列需 Flash/KV',
        focusRowText: 't=3 输出 [0.406, 0.283, 0.500, 0.406]',
      },
      caption:
        '最后由 $O = P \\cdot V$ 将各历史词元的值向量按权重聚合，写出输出矩阵 $O \\in \\mathbb{R}^{4 \\times 4}$。行末位置「上」的输出 $[0.406, 0.283, 0.500, 0.406]$ 已完整融入主语「猫」的语义。',
    },
  ];
}

export default function CausalAttentionExplainer({
  title = '图 1：4 词元因果自注意力计算全链路（QK^T / sqrt(d_k) -> Mask -> Softmax -> PV）',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildCausalAttentionSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="因果自注意力逐步交互推导">
      {(step) => {
        const s = step.state;
        const isStep4 = s.stepIndex === 4;
        const fmt = s.stepIndex >= 3 ? fmtProb : fmtScore;

        return (
          <Stage width={STAGE_W} height={378} label="4词元因果自注意力逐步推演">
            {/* Left inputs Q, K, V */}
            <TensorBlock
              x={14}
              y={36}
              w={58}
              h={44}
              tone="active"
              name="Q"
              shape="[4, 4]"
              active={s.stepIndex <= 1}
            />
            <TensorBlock
              x={14}
              y={122}
              w={58}
              h={44}
              tone="highlight"
              name="K^T"
              shape="[4, 4]"
              active={s.stepIndex <= 1}
            />
            <TensorBlock
              x={14}
              y={208}
              w={58}
              h={44}
              tone="done"
              name="V"
              shape="[4, 4]"
              active={isStep4}
            />

            <DataFlowArrow
              points={[
                [76, 58],
                [98, 108],
              ]}
              tone="active"
              active={s.stepIndex <= 1}
            />
            <DataFlowArrow
              points={[
                [76, 144],
                [98, 138],
              ]}
              tone="highlight"
              active={s.stepIndex <= 1}
            />

            {/* Center [4, 4] S / P Heatmap */}
            <HeatmapMatrix
              x={98}
              y={24}
              title={s.centerTitle}
              tone={s.centerTone}
              values={s.centerValues}
              masks={s.centerMasks}
              maskText="-inf"
              rowLabels={TOKENS}
              colLabels={COL_IDX}
              rowSums={s.centerRowSums?.map((v) => v.toFixed(2))}
              rowLabelW={34}
              cellW={42}
              cellH={38}
              gap={4}
              min={0}
              max={s.stepIndex === 0 ? 2.0 : 1.0}
              format={fmt}
              selected={s.selectedCenter}
              selectedTone="highlight"
              showLegend={false}
              fontSize={11}
            />

            <DataFlowArrow
              points={[
                [356, 146],
                [412, 146],
              ]}
              tone="done"
              active={isStep4}
              flow={isStep4}
              label="P @ V"
              labelPos={[384, 130]}
            />

            {/* Right [4, 4] Output O Heatmap */}
            <HeatmapMatrix
              x={418}
              y={24}
              title="输出向量 O = P @ V [4, 4]"
              tone="done"
              values={s.outputValues}
              rowLabels={TOKENS}
              colLabels={DIM_COLS}
              rowLabelW={34}
              cellW={48}
              cellH={38}
              gap={4}
              min={0}
              max={1.0}
              format={fmtProb}
              selected={s.outputSelected}
              selectedTone="done"
              showLegend={false}
              fontSize={11}
            />

            {/* Bottom Metric Row */}
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
    </Explainer>
  );
}
