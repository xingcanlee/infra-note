import { useMemo } from 'react';
import { Stage, type Step, type Tone } from 'astro-wisp/explainers';
import { BeatExplainer, SvgBeatGroup, defaultBeats, type BeatSpec } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow } from '@/explainers/kit/MetricRow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues } from '@/explainers/kit/motion';

export interface CausalAttentionState {
  stepIndex: number;
  formulaTex: string;
  beats: BeatSpec[];
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
      label: '点积打分',
      duration: 4600,
      state: {
        stepIndex: 0,
        formulaTex:
          '$A = QK^\\top \\in \\mathbb{R}^{4 \\times 4},\\; \\operatorname{Var}(q\\cdot k) = d_k$',
        beats: defaultBeats([
          '输入 Q/K/V 投影张量',
          '经内积连线生成 QKᵀ 热力矩阵',
          '检查方差随 d_k 膨胀',
          '总结未缩放点积状态',
        ]),
        centerTitle: '原始点积矩阵 $QK^\\top\\;[4, 4]$',
        centerTone: 'active',
        centerValues: RAW_QK,
        centerMasks: NO_MASKS,
        selectedCenter: new Set(),
        outputValues: EMPTY_OUT,
        outputSelected: new Set(),
        scaleFormula: '未缩放 (直接内积)',
        varianceText: '$\\operatorname{Var} = d_k$ (随维度膨胀)',
        maskCountText: '0 / 16 未来位置未遮蔽',
        focusRowText: '$t=2$ 与未来 $t=3$ 点积 2.0',
      },
      caption:
        '4 个 token 经投影得到 $Q, K, V \\in \\mathbb{R}^{4 \\times 4}$。先算原始相似度矩阵 $Q K^\\top$：若不做缩放，独立向量内积的方差会随 $d_k$ 线性膨胀到 $d_k$ 倍，把 Softmax 推向饱和区。',
    },
    {
      label: '尺度缩放',
      duration: 4600,
      state: {
        stepIndex: 1,
        formulaTex: '$S = QK^\\top / \\sqrt{4} = 0.5\\,QK^\\top,\\; \\operatorname{Var}(S) = 1.0$',
        beats: defaultBeats([
          '锁定原始 Q/K 输入向量',
          '全体元素除以 √d_k = 2',
          '高亮未遮蔽的未来格 S[2,3]',
          '确认单元方差收敛至 1.0',
        ]),
        centerTitle: '缩放分数 $S = QK^\\top / \\sqrt{4}\\;[4, 4]$',
        centerTone: 'active',
        centerValues: SCALED_S,
        centerMasks: NO_MASKS,
        selectedCenter: futureCell,
        outputValues: EMPTY_OUT,
        outputSelected: new Set(),
        scaleFormula: '$/\\sqrt{4} = \\times 0.5$',
        varianceText: '$\\operatorname{Var}(q\\cdot k / \\sqrt{d_k}) = 1.0$',
        maskCountText: '0 / 16 ($t=2$ 可见 $t=3$)',
        focusRowText: '$S[2] = [0.5, 1.0, 0.5, 1.0]$',
      },
      caption:
        '整体除以 $\\sqrt{d_k} = 2$ 后方差回归稳定的 $1.0$（对应 vLLM 中 self.scaling $= d_k^{-0.5}$）。第 2 行“垫”上 $S[2, 3] = 1.00$，表明此时仍能读取未来 token“上”。',
    },
    {
      label: '因果掩码',
      duration: 4600,
      state: {
        stepIndex: 2,
        formulaTex: '$S_{i,j} \\leftarrow -\\infty\\; (j > i),\\quad 6/16\\text{ 未来单元屏蔽}$',
        beats: defaultBeats([
          '读取缩放后矩阵 S[4,4]',
          '对 j > i 上三角叠加 -∞ 掩码',
          '聚焦 t=2 行仅保留左侧历史',
          '锁定因果防泄露约束',
        ]),
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
        '加上上三角因果掩码 $M_{\\text{triu}}$，把所有 $j > i$ 的 6 个未来单元设为 $-\\infty$（虚线格）。第 $t=2$ 行只保留 $[0.5, 1.0, 0.5, -\\infty]$，阻断未来信息泄露。',
    },
    {
      label: 'Softmax 归一',
      duration: 4600,
      state: {
        stepIndex: 3,
        formulaTex:
          '$P = \\operatorname{softmax}(S + M_{\\text{triu}}),\\; \\sum_j P_{i,j} = 1.00$',
        beats: defaultBeats([
          '输入因果掩码得分行',
          '指数化并清零 -∞ 未来项',
          '对齐右侧行和为 1.00',
          '聚焦“垫”对“坐在”的注意力',
        ]),
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
      label: '聚合输出',
      duration: 4600,
      state: {
        stepIndex: 4,
        formulaTex: '$O = P \\cdot V \\in \\mathbb{R}^{4 \\times 4},\\quad \\text{复杂度 } O(T^2)$',
        beats: defaultBeats([
          '激活左下 V 矩阵与概率 P',
          '沿 P*V 与 V->O 双路径聚合',
          '填满右侧输出矩阵 O[4,4]',
          '点出 O(T^2) 开销引发下一章优化',
        ]),
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
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        const isStep4 = s.stepIndex === 4;
        const fmt = s.stepIndex >= 3 ? fmtProb : fmtScore;

        return (
          <Stage width={STAGE_W} height={378} label="4 个 token 因果自注意力逐步推演">
            {/* Left inputs Q, K, V */}
            <TensorBlock
              x={12}
              y={36}
              w={56}
              h={44}
              tone="active"
              texName="Q"
              texWidth={46}
              shape="[4, 4]"
              active={s.stepIndex <= 1}
              dimmed={isStep4 && beat < 1}
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
              active={s.stepIndex <= 1}
              dimmed={isStep4 && beat < 1}
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
              active={isStep4}
              dimmed={!isStep4 && beat < 2}
            />

            <DataFlowArrow
              points={[
                [68, 58],
                [104, 88],
              ]}
              tone="active"
              active={s.stepIndex <= 1}
              visible={beat >= 1 || !isStep4}
              draw={beat >= 1 && s.stepIndex <= 1}
              dotToken={beat >= 1 && s.stepIndex <= 1 ? dotToken : 0}
            />
            <DataFlowArrow
              points={[
                [68, 144],
                [104, 144],
              ]}
              tone="highlight"
              active={s.stepIndex <= 1}
              visible={beat >= 1 || !isStep4}
              draw={beat >= 1 && s.stepIndex <= 1}
              dotToken={beat >= 1 && s.stepIndex <= 1 ? dotToken : 0}
            />

            {/* Center [4, 4] S / P Heatmap */}
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
              max={s.stepIndex === 0 ? 2.0 : 1.0}
              format={fmt}
              selected={s.selectedCenter}
              selectedTone="highlight"
              showSelected={beat >= 1}
              showMasks={s.stepIndex === 2 ? beat >= 1 : true}
              showSums={beat >= 1}
              showLegend={false}
              fontSize={11}
            />

            <DataFlowArrow
              points={[
                [364, 152],
                [420, 152],
              ]}
              tone="done"
              active={isStep4}
              flow={isStep4 && beat >= 1}
              visible={!isStep4 || beat >= 1}
              draw={isStep4 && beat >= 1}
              dotToken={isStep4 && beat >= 1 ? dotToken : 0}
              label={'$P \\cdot V$'}
              labelPos={[396, 137]}
            />

            {isStep4 && (
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
                active
                flow={beat >= 1}
                visible={beat >= 1}
                draw={beat >= 1}
                dotToken={beat >= 1 ? dotToken : 0}
                label="加权值 $V$"
                labelPos={[238, 270]}
              />
            )}

            {/* Right [4, 4] Output O Heatmap */}
            <SvgBeatGroup dimmed={!isStep4 || beat < 2}>
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
                showSelected={beat >= 2}
                showLegend={false}
                fontSize={11}
              />
            </SvgBeatGroup>

            {/* Bottom Metric Row */}
            <MetricRow
              x={16}
              y={312}
              w={648}
              h={42}
              revealed={beat >= 3}
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
