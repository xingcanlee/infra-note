import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  ByteLedgerBar,
  DataFlowArrow,
  MetricRow,
  TensorBlock,
  assertMaxHues,
} from '@/explainers/kit';

export interface V41LayerStepState {
  stepIndex: number;
  phaseLabel: string;
  activeStage: number;
  tensorShape: string;
  hbmStageBytes: string;
  commPath: string;
  totalBudget: string;
}

const STAGE_DEFS = [
  {
    name: '1. mHC Pre-Mix',
    shape: '[B,4,H]->[B,H]',
    detail: 'Mega-mHC 读一次',
    tone: 'done' as Tone,
  },
  {
    name: '2. CSA2 / HCA',
    shape: '288 B/tok KV',
    detail: 'Indexer+Sparse MLA',
    tone: 'active' as Tone,
  },
  {
    name: '3. Async Engram',
    shape: 'e_t [B, 1280]',
    detail: 'L1,14 Gate 注入',
    tone: 'highlight' as Tone,
  },
  {
    name: '4. DeepSeekMoE',
    shape: 'Top-8 + 1 Shared',
    detail: 'DeepEP/MC2 + GMM',
    tone: 'active' as Tone,
  },
  {
    name: '5. mHC Post-Mix',
    shape: '[B,H]->[B,4,H]',
    detail: 'Shifted 融合下层',
    tone: 'done' as Tone,
  },
  {
    name: '6. DSpark Draft',
    shape: '3-Layer SWA+r256',
    detail: '单轮并行预测 K 词',
    tone: 'highlight' as Tone,
  },
];

const STAGE_POS: { x: number; y: number }[] = [
  { x: 24, y: 44 },
  { x: 254, y: 44 },
  { x: 484, y: 44 },
  { x: 24, y: 176 },
  { x: 254, y: 176 },
  { x: 484, y: 176 },
];

export function buildV41LayerStepSteps(): Step<V41LayerStepState>[] {
  const tones: Tone[] = ['done', 'active', 'highlight'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · mHC Pre-Mix 与 Shifted RMSNorm 融合坍缩',
        activeStage: 0,
        tensorShape: '[B, 4, H] -> [B, H]',
        hbmStageBytes: '10d (Single-Pass)',
        commPath: '片内寄存器 / 零跨卡',
        totalBudget: '仅搬运一次残差流',
      },
      caption:
        '从 4 流 Hyper-Connections 残差出发，mhc_shifted_post_pre_deep_gemm / npu_hc_pre_v3 以双随机矩阵聚合为单流 [B, H] BF16 激活并完成下一层 Attention RMSNorm。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · CSA2 / HCA 稀疏注意力与 288 B/token Paged Gather',
        activeStage: 1,
        tensorShape: 'KV Cache: 288 B/tok',
        hbmStageBytes: '288 B × Top-K_idx',
        commPath: 'SP All-Gather / GEMM-RS',
        totalBudget: '较 V2 降低 ~98% 访存',
      },
      caption:
        'DeepSeek-V4.1 经 NSA/Lightning Indexer 筛选 Top-K 关键页，每 token 仅拉取压缩到 288 字节的 Paged KV 条目进入 Sparse MLA 计算，显著压缩长上下文 HBM 带宽瓶颈。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · Host DDR 异步 Engram 预取就绪与 Signed-Sqrt 门控注入',
        activeStage: 2,
        tensorShape: 'e_t [B,1280] -> [B,4,H]',
        hbmStageBytes: 'PCIe/HCCS 异步隐藏',
        commPath: 'DP Symmetric/Peer Mem',
        totalBudget: 'L1 & L14 边界注入',
      },
      caption:
        '在层边界处（第 1、14 层）等待背景流预取完成，wkv 投影成 K(4d)/V(1d) 并以无状态 Signed-Sqrt 门控 $\\alpha_t$ 写入 4 条残差流，完全避开主计算流同步停顿。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · DeepSeekMoE Top-8 路由、Dispatch/GMM/Combine 与共享专家重叠',
        activeStage: 3,
        tensorShape: '1 Shared + 8/256 Routed',
        hbmStageBytes: '权重+A2A (FP8/MXFP4)',
        commPath: 'DeepEP LL / MC2 Fused',
        totalBudget: '主导层内算力与通信',
      },
      caption:
        'FFN 侧采用无辅损偏置路由选中 Top-8 细粒度专家，与常驻共享专家并行执行；GPU 走 DeepEP + DeepGEMM 分块计算，昇腾 NPU 走 npu_moe_distribute_dispatch_v2 / AscendMoERunner。',
    },
    {
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · mHC Post-Mix 写回 4 路流并预备下一子层',
        activeStage: 4,
        tensorShape: '[B, H] -> [B, 4, H]',
        hbmStageBytes: '归约与下层 Pre 合并',
        commPath: '可延迟至下层边界融合',
        totalBudget: '30层连乘 Amax <= 1.6',
      },
      caption:
        '若下一层非 Engram 边界，MoE 输出先挂起至下一层 mhc_shifted_post_pre 与 TP/SP All-Reduce 协同完成写回，同时完成下层系数计算。',
    },
    {
      state: {
        stepIndex: 5,
        phaseLabel: 'Step 6 · 顶层隐状态送入 DSpark 1-Pass SWA + r=256 Markov 起草',
        activeStage: 5,
        tensorShape: 'Aux -> K=4..5 Draft',
        hbmStageBytes: '3层轻量 Draft + W1/W2',
        commPath: 'LMHead Vocab-Shard',
        totalBudget: '单轮投机吞吐 ×3~5',
      },
      caption:
        '全骨干完成后抽取目标辅助层特征送入 DeepseekV41DSparkModel，在单次 3 层 SWA 并行前向与 $r=256$ Markov 链后一次吐出多步候选 token，闭环下一次验证步。',
    },
  ];
}

export default function V41LayerStepExplainer({
  title = '图 1：DeepSeek-V4.1 单 Token 解码六阶段全景与字节账本追踪',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildV41LayerStepSteps(), []);

  return (
    <Explainer steps={steps} title={title} label={title}>
      {(step) => {
        const s = step.state;
        const activePos = STAGE_POS[s.activeStage];

        const ledgerSegments = [
          {
            value: 10,
            label: 'mHC Pre',
            tone: (s.activeStage >= 0 ? 'done' : 'neutral') as Tone,
            active: s.activeStage === 0,
          },
          {
            value: 18,
            label: 'KV Gather',
            tone: (s.activeStage >= 1 ? 'active' : 'neutral') as Tone,
            active: s.activeStage === 1,
          },
          {
            value: 12,
            label: 'Engram',
            tone: (s.activeStage >= 2 ? 'highlight' : 'neutral') as Tone,
            active: s.activeStage === 2,
          },
          {
            value: 38,
            label: 'MoE 权重+A2A',
            tone: (s.activeStage >= 3 ? 'active' : 'neutral') as Tone,
            active: s.activeStage === 3,
          },
          {
            value: 10,
            label: 'Post-Mix',
            tone: (s.activeStage >= 4 ? 'done' : 'neutral') as Tone,
            active: s.activeStage === 4,
          },
          {
            value: 12,
            label: 'DSpark',
            tone: (s.activeStage >= 5 ? 'highlight' : 'neutral') as Tone,
            active: s.activeStage === 5,
          },
        ];

        const stageWeights = [10, 28, 40, 78, 88, 100];
        const donePct = stageWeights[s.activeStage];

        return (
          <Stage width={680} height={394} label={s.phaseLabel}>
            <ActiveFocusFrame
              x={activePos.x - 8}
              y={activePos.y - 32}
              w={188}
              h={108}
              tone={STAGE_DEFS[s.activeStage].tone}
              label="当前执行阶段"
              visible={true}
            />

            {STAGE_DEFS.map((st, idx) => {
              const pos = STAGE_POS[idx];
              const isDone = idx <= s.activeStage;
              return (
                <TensorBlock
                  key={st.name}
                  x={pos.x}
                  y={pos.y}
                  w={172}
                  h={40}
                  tone={isDone ? st.tone : 'neutral'}
                  name={st.name}
                  shape={st.shape}
                  detail={st.detail}
                  active={idx === s.activeStage}
                  muted={!isDone}
                  dashed={!isDone}
                />
              );
            })}

            <DataFlowArrow
              points={[
                [196, 64],
                [254, 64],
              ]}
              tone="active"
              active={s.activeStage >= 1}
              flow={s.activeStage === 1}
            />
            <DataFlowArrow
              points={[
                [426, 64],
                [484, 64],
              ]}
              tone="highlight"
              active={s.activeStage >= 2}
              flow={s.activeStage === 2}
            />
            <DataFlowArrow
              points={[
                [570, 118],
                [570, 128],
                [110, 128],
                [110, 142],
              ]}
              tone="active"
              active={s.activeStage >= 3}
              flow={s.activeStage === 3}
            />
            <DataFlowArrow
              points={[
                [196, 196],
                [254, 196],
              ]}
              tone="done"
              active={s.activeStage >= 4}
              flow={s.activeStage === 4}
            />
            <DataFlowArrow
              points={[
                [426, 196],
                [484, 196],
              ]}
              tone="highlight"
              active={s.activeStage >= 5}
              flow={s.activeStage === 5}
            />

            <ByteLedgerBar
              x={16}
              y={282}
              w={648}
              h={28}
              title="单 Token Decode 搬运与执行账本构成（比例示意）"
              totalLabel={`已推进 ${donePct}%`}
              segments={ledgerSegments}
            />

            <MetricRow
              x={16}
              y={334}
              w={648}
              h={44}
              gap={10}
              metrics={[
                {
                  label: '当前张量形状',
                  value: s.tensorShape,
                  tone: STAGE_DEFS[s.activeStage].tone,
                  active: true,
                },
                { label: '访存特征', value: s.hbmStageBytes, tone: 'active' },
                { label: '集合通信 / 协同', value: s.commPath, tone: 'highlight' },
                { label: '架构收益', value: s.totalBudget, tone: 'done' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
