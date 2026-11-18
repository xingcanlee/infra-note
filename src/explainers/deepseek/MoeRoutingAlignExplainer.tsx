import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  HeatmapMatrix,
  MetricRow,
  ProbabilityBars,
  SectionBox,
  SlotStrip,
  assertMaxHues,
} from '@/explainers/kit';

export interface MoeRoutingAlignState {
  stepIndex: number;
  phaseLabel: string;
  scoresRaw: number[];
  bias: number[];
  selectedExperts: number[];
  groupMask: boolean[];
  loadGrid: (number | null)[][];
  expertCounts: number[];
  focusArea: 'router' | 'matrix' | 'align';
  avgLoad: string;
  maxLoad: string;
  paddingWaste: string;
  biasRange: string;
}

const TOKEN_LABELS = ['T0', 'T1', 'T2', 'T3'];
const EXPERT_LABELS = ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'];

const BASE_SCORES = [0.84, 0.72, 0.41, 0.56, 0.49, 0.36];

function fmt2(v: number | null): string {
  return v === null ? '—' : v.toFixed(0);
}

export function buildMoeRoutingAlignSteps(): Step<MoeRoutingAlignState>[] {
  const tones: Tone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 组限门控与原始 Sigmoid 评分',
        scoresRaw: BASE_SCORES,
        bias: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        selectedExperts: [0, 1],
        groupMask: [true, true, true, false, false, false],
        loadGrid: [
          [1, 1, 0, null, null, null],
          [1, 0, 1, null, null, null],
          [1, 1, 0, null, null, null],
          [1, 0, 1, null, null, null],
        ],
        expertCounts: [4, 2, 2, 0, 0, 0],
        focusArea: 'router',
        avgLoad: '1.33',
        maxLoad: '4 (E0)',
        paddingWaste: '未对齐',
        biasRange: '[0.00, 0.00]',
      },
      caption:
        'Node-Limited 路由先按节点组聚合得分保留 Top-$M$ 组（组 0：E0–E2），再以原始 Sigmoid 分数 $s_{i,t}$ 选出 Top-$K$；此时冷门组被屏蔽，E0 产生 4/4 tokens 拥堵。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · 偏置选路与无偏加权分离',
        scoresRaw: BASE_SCORES,
        bias: [-0.24, -0.02, 0.06, 0.22, 0.18, 0.12],
        selectedExperts: [1, 3],
        groupMask: [true, true, true, true, true, true],
        loadGrid: [
          [0, 1, 0, 1, 0, 0],
          [1, 0, 0, 1, 0, 0],
          [0, 1, 0, 0, 1, 0],
          [1, 0, 1, 0, 0, 0],
        ],
        expertCounts: [2, 2, 1, 2, 1, 0],
        focusArea: 'router',
        avgLoad: '1.33',
        maxLoad: '2 (均衡)',
        paddingWaste: '待对齐',
        biasRange: '[-0.24, +0.22]',
      },
      caption:
        '无辅损路由仅在 Top-$K$ 选择阶段叠加偏置 $s_{i,t}+b_i$（E0 降权、E3 升权命中 Top-2），但合并权重 $w_{i,t}$ 仍严格 gather 未偏置的原始 $s_{i,t}$ 并归一化。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · 步间符号规则更新 Δb_i',
        scoresRaw: BASE_SCORES,
        bias: [-0.25, -0.03, 0.07, 0.21, 0.19, 0.13],
        selectedExperts: [1, 3],
        groupMask: [true, true, true, true, true, true],
        loadGrid: [
          [0, 1, 0, 1, 0, 0],
          [1, 0, 0, 1, 0, 0],
          [0, 1, 0, 0, 1, 0],
          [0, 0, 1, 0, 1, 0],
        ],
        expertCounts: [1, 2, 1, 2, 2, 0],
        focusArea: 'matrix',
        avgLoad: '1.33',
        maxLoad: '2 (收敛)',
        paddingWaste: '待对齐',
        biasRange: 'γ = 0.01',
      },
      caption:
        '批统计负载 $c_i$ 与均值 $\\bar{c}$ 对比后执行免梯度更新 $b_i \\leftarrow b_i + \\gamma\\operatorname{sign}(\\bar{c}-c_i)$：过载专家下调，空闲专家上调，主干梯度零干扰。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · 稳态跨卡均衡分发',
        scoresRaw: BASE_SCORES,
        bias: [-0.22, -0.02, 0.08, 0.19, 0.21, 0.18],
        selectedExperts: [1, 3],
        groupMask: [true, true, true, true, true, true],
        loadGrid: [
          [1, 0, 0, 1, 0, 0],
          [0, 1, 0, 0, 1, 0],
          [0, 0, 1, 0, 0, 1],
          [1, 1, 0, 0, 0, 0],
        ],
        expertCounts: [2, 2, 1, 1, 1, 1],
        focusArea: 'matrix',
        avgLoad: '1.33',
        maxLoad: '2 (最优)',
        paddingWaste: '按专家重排',
        biasRange: '[-0.22, +0.21]',
      },
      caption:
        '稳态下 8 次激活几乎均匀落入 6 个专家，All-to-All 通信尾延迟明显收敛，为后续本地 Grouped GEMM 提供平衡的批大小。',
    },
    {
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · moe_align_block_size 填充对齐',
        scoresRaw: BASE_SCORES,
        bias: [-0.22, -0.02, 0.08, 0.19, 0.21, 0.18],
        selectedExperts: [1, 3],
        groupMask: [true, true, true, true, true, true],
        loadGrid: [
          [1, 0, 0, 1, 0, 0],
          [0, 1, 0, 0, 1, 0],
          [0, 0, 1, 0, 0, 1],
          [1, 1, 0, 0, 0, 0],
        ],
        expertCounts: [2, 2, 1, 1, 1, 1],
        focusArea: 'align',
        avgLoad: '8 有效行',
        maxLoad: '6×block=4',
        paddingWaste: '16/24 PAD',
        biasRange: '对齐 16/64',
      },
      caption:
        '执行前调用 moe_align_block_size 按专家聚拢路由行并用 -1（PAD）补齐到 GEMM 块尺寸（此处以 block_size=4 示意 GPU/NPU 常见的 16 或 64 行分块，每个块仅包含单一专家；8 条有效行共占 6 块 24 槽，其中 16 个为 PAD 槽位）。',
    },
  ];
}

export default function MoeRoutingAlignExplainer({
  title = '图 1：DeepSeekMoE 无辅损偏置路由与 moe_align_block_size 块对齐',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildMoeRoutingAlignSteps(), []);

  return (
    <Explainer steps={steps} title={title} label={title}>
      {(step) => {
        const s = step.state;
        const barItems = EXPERT_LABELS.map((lbl, idx) => {
          const biased = Math.max(0.05, Math.min(1.05, s.scoresRaw[idx] + s.bias[idx]));
          const isPicked = s.selectedExperts.includes(idx);
          const isMasked = !s.groupMask[idx];
          return {
            label: lbl,
            sublabel: isPicked
              ? 'Top-K'
              : `b=${s.bias[idx] >= 0 ? '+' : ''}${s.bias[idx].toFixed(2)}`,
            masked: isMasked,
            bars: isMasked
              ? [
                  {
                    value: 0,
                    tone: 'mask' as const,
                  },
                ]
              : [
                  {
                    value: s.scoresRaw[idx],
                    tone: 'active' as const,
                    highlight: isPicked && s.stepIndex === 0,
                  },
                  {
                    value: biased,
                    tone: (isPicked ? 'done' : 'highlight') as Tone,
                    dashed: !isPicked,
                    highlight: isPicked && s.stepIndex >= 1,
                  },
                ],
          };
        });

        const selectedSet = new Set<string>();
        s.loadGrid.forEach((row, r) => {
          row.forEach((val, c) => {
            if (val === 1) selectedSet.add(`${r},${c}`);
          });
        });

        const expertBlocks = [
          {
            title: 'Block 0 · 仅 E0 (2+2 PAD)',
            slots: [
              {
                id: 'b0-0',
                label: 'T0',
                sub: 'E0',
                tone: 'active' as const,
                status: 'active' as const,
              },
              {
                id: 'b0-1',
                label: 'T3',
                sub: 'E0',
                tone: 'active' as const,
                status: 'active' as const,
              },
              {
                id: 'b0-2',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b0-3',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: 'Block 1 · 仅 E1 (2+2 PAD)',
            slots: [
              {
                id: 'b1-0',
                label: 'T1',
                sub: 'E1',
                tone: 'done' as const,
                status: 'selected' as const,
              },
              {
                id: 'b1-1',
                label: 'T3',
                sub: 'E1',
                tone: 'done' as const,
                status: 'selected' as const,
              },
              {
                id: 'b1-2',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b1-3',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: 'Block 2 · 仅 E2 (1+3 PAD)',
            slots: [
              {
                id: 'b2-0',
                label: 'T2',
                sub: 'E2',
                tone: 'highlight' as const,
                status: 'active' as const,
              },
              {
                id: 'b2-1',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b2-2',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b2-3',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: 'Block 3 · 仅 E3 (1+3 PAD)',
            slots: [
              {
                id: 'b3-0',
                label: 'T0',
                sub: 'E3',
                tone: 'active' as const,
                status: 'active' as const,
              },
              {
                id: 'b3-1',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b3-2',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b3-3',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: 'Block 4 · 仅 E4 (1+3 PAD)',
            slots: [
              {
                id: 'b4-0',
                label: 'T1',
                sub: 'E4',
                tone: 'done' as const,
                status: 'selected' as const,
              },
              {
                id: 'b4-1',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b4-2',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b4-3',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: 'Block 5 · 仅 E5 (1+3 PAD)',
            slots: [
              {
                id: 'b5-0',
                label: 'T2',
                sub: 'E5',
                tone: 'highlight' as const,
                status: 'active' as const,
              },
              {
                id: 'b5-1',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b5-2',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b5-3',
                label: 'PAD',
                sub: '-1',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
        ];

        const emptyAlignSlots = Array.from({ length: 8 }, (_, i) => ({
          id: `e${i}`,
          label: `R${i}`,
          sub: '待重排',
          tone: 'neutral' as const,
          status: 'normal' as const,
        }));

        return (
          <Stage width={680} height={418} label={s.phaseLabel}>
            <ActiveFocusFrame
              x={8}
              y={10}
              w={358}
              h={180}
              tone="active"
              label={s.stepIndex === 1 ? '偏置选路 / 原始加权' : 'token 0 打分对比'}
              visible={s.focusArea === 'router'}
            />
            <ProbabilityBars
              x={14}
              y={18}
              w={346}
              h={164}
              maxValue={1.1}
              items={barItems}
              valueFormat={(v) => v.toFixed(2).replace(/^0(?=\.)/, '')}
              legend={[
                { label: '原始 s', tone: 'active' },
                { label: '选路 s+b', tone: 'highlight' },
              ]}
            />

            <ActiveFocusFrame
              x={376}
              y={10}
              w={296}
              h={180}
              tone="highlight"
              label="Batch 负载统计"
              visible={s.focusArea === 'matrix'}
            />
            <HeatmapMatrix
              x={384}
              y={16}
              values={s.loadGrid}
              tone="active"
              cellW={35}
              cellH={25}
              gap={4}
              min={0}
              max={1}
              format={fmt2}
              selected={selectedSet}
              selectedTone="done"
              rowLabels={TOKEN_LABELS}
              colLabels={EXPERT_LABELS}
              colSums={s.expertCounts.map((c) => `c=${c}`)}
              rowLabelW={34}
              title="批内路由命中与负载 c_i"
            />

            <SectionBox
              x={8}
              y={202}
              w={664}
              h={152}
              tone={s.focusArea === 'align' ? 'done' : 'neutral'}
              dashed={s.focusArea !== 'align'}
              title="moe_align_block_size 分块矩阵（每块仅含同一专家与 -1 PAD 槽位，block_size=4 示意 16/64 分块）"
            />
            {s.stepIndex === 4 ? (
              expertBlocks.map((blk, bi) => (
                <SlotStrip
                  key={blk.title}
                  x={20 + (bi % 3) * 222}
                  y={bi < 3 ? 224 : 288}
                  slots={blk.slots}
                  slotW={46}
                  gap={4}
                  slotH={34}
                  title={blk.title}
                />
              ))
            ) : (
              <SlotStrip
                x={20}
                y={254}
                slots={emptyAlignSlots}
                slotW={72}
                gap={9}
                slotH={42}
                title="未对齐路由缓冲：8 条激活跨专家混排，待按专家编号重排补齐"
              />
            )}

            <MetricRow
              x={8}
              y={366}
              w={664}
              h={42}
              gap={10}
              metrics={[
                { label: '批均值 c_bar', value: s.avgLoad, tone: 'neutral' },
                {
                  label: '峰值专家负载',
                  value: s.maxLoad,
                  tone: s.stepIndex === 0 ? 'highlight' : 'done',
                  active: true,
                },
                {
                  label: '块填充率',
                  value: s.paddingWaste,
                  tone: s.stepIndex === 4 ? 'done' : 'neutral',
                },
                { label: '偏置更新幅度', value: s.biasRange, tone: 'active' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
