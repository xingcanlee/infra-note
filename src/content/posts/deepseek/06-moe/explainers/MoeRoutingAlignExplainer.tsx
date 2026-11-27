import { useMemo } from 'react';
import { Stage, type Step, type Tone } from 'astro-wisp/explainers';
import { BeatExplainer } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import { SlotStrip } from '@/explainers/kit/PointerBoard';
import ProbabilityBars from '@/explainers/kit/ProbabilityBars';
import { assertMaxHues } from '@/explainers/kit/motion';

export interface MoeRoutingAlignState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
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
  blockStat: string;
}

const TOKEN_LABELS = ['$T_0$', '$T_1$', '$T_2$', '$T_3$'];
const EXPERT_LABELS = ['$E_0$', '$E_1$', '$E_2$', '$E_3$', '$E_4$', '$E_5$'];

const BASE_SCORES = [0.84, 0.72, 0.41, 0.56, 0.49, 0.36];

function fmt2(v: number | null): string {
  return v === null ? '—' : v.toFixed(0);
}

export function buildMoeRoutingAlignSteps(): Step<MoeRoutingAlignState>[] {
  const tones: Tone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones);

  return [
    {
      label: '组限热点拥堵',
      duration: 4600,
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 组限门控热点拥堵',
        formulaTex:
          '$g_{i,t} \\propto s_{i,t} \\cdot \\mathbb{I}(\\text{组 } 0\\text{ 保留}),\\; c = [4, 2, 2, 0, 0, 0]$',
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
        maxLoad: '4 ($E_0$)',
        paddingWaste: '未对齐',
        blockStat: '$b = [0, 0]$',
      },
      caption:
        'Node-Limited 路由先保留组 0（$E_0\\text{–}E_2$）并屏蔽组 1，再以原始分数 $s_{i,t}$ 选 Top-2；此时 4 个 token 全部命中 $E_0$ 造成热点拥堵。',
    },
    {
      label: '偏置选路加权',
      duration: 4600,
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · 偏置选路与无偏加权分离',
        formulaTex:
          '$\\text{Top-}2(s_{i,t} + b_i) \\Rightarrow \\{E_1, E_3\\},\\quad g_{i,t} \\propto s_{i,t}$',
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
        maxLoad: '2 (分散)',
        paddingWaste: '待重排',
        blockStat: '$[-0.24, +0.22]$',
      },
      caption:
        '无辅损路由仅在 Top-2 选路阶段叠加偏置 $s_{i,t}+b_i$（对 $E_0$ 降权、抬升 $E_3$），但门控权重 $g_{i,t}$ 仍只用原始分数 $s_{i,t}$ 归一化。',
    },
    {
      label: '符号反馈均衡',
      duration: 4600,
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · 免梯度符号规则均衡负载',
        formulaTex:
          '$b_i \\leftarrow b_i + \\gamma\\operatorname{sign}(\\bar{c} - c_i) \\;\\Rightarrow\\; c = [2, 2, 1, 1, 1, 1]$',
        scoresRaw: BASE_SCORES,
        bias: [-0.14, -0.07, 0.11, 0.18, 0.12, 0.17],
        selectedExperts: [0, 3],
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
        maxLoad: '2 (全员激活)',
        paddingWaste: '待按专家聚拢',
        blockStat: '$b_5: +0.17$',
      },
      caption:
        '按批内均值 $\\bar{c}=1.33$ 执行免梯度符号更新 $b_i \\leftarrow b_i + \\gamma\\operatorname{sign}(\\bar{c}-c_i)$，抬升空闲 $E_5$ 使其稳定分流，6 个专家全部进入均衡区间。',
    },
    {
      label: '分块填充对齐',
      duration: 4800,
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · 按专家编号重排并对齐分块',
        formulaTex:
          '$M_{\\text{pad}} = 6 \\times 4 = 24\\text{ 槽} \\quad (8\\text{ 有效} + 16\\text{ PAD},-1\\text{ 哨兵})$',
        scoresRaw: BASE_SCORES,
        bias: [-0.14, -0.07, 0.11, 0.18, 0.12, 0.17],
        selectedExperts: [0, 3],
        groupMask: [true, true, true, true, true, true],
        loadGrid: [
          [1, 0, 0, 1, 0, 0],
          [0, 1, 0, 0, 1, 0],
          [0, 0, 1, 0, 0, 1],
          [1, 1, 0, 0, 0, 0],
        ],
        expertCounts: [2, 2, 1, 1, 1, 1],
        focusArea: 'align',
        avgLoad: '8 有效槽',
        maxLoad: '6 块 × 4 槽',
        paddingWaste: '16/24 PAD',
        blockStat: '块大小 4',
      },
      caption:
        '按专家编号聚拢 8 条有效路由，并用 $-1$（PAD）补齐到分块大小 4；4 个 token 与 6 个专家共形成 6 块 24 槽，每块仅包含单一专家。',
    },
  ];
}

export default function MoeRoutingAlignExplainer({
  title = '图 3：DeepSeekMoE 无辅损偏置路由与块对齐机制',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildMoeRoutingAlignSteps(), []);

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={514}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, ctx) => {
        const s = step.state;
        const barItems = EXPERT_LABELS.map((lbl, idx) => {
          const biased = Math.max(0.05, Math.min(1.05, s.scoresRaw[idx] + s.bias[idx]));
          const isPicked = s.selectedExperts.includes(idx);
          const isMasked = !s.groupMask[idx];
          return {
            label: lbl,
            sublabel: isPicked
              ? 'Top-2'
              : `$b=${s.bias[idx] >= 0 ? '+' : ''}${s.bias[idx].toFixed(2)}$`,
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
        const unalignedSlots: {
          id: string;
          label: string;
          sub: string;
          tone: Tone;
          status: 'active' | 'selected';
        }[] = [];

        s.loadGrid.forEach((row, r) => {
          row.forEach((val, c) => {
            if (val === 1) {
              selectedSet.add(`${r},${c}`);
              unalignedSlots.push({
                id: `u-${unalignedSlots.length}`,
                label: `$T_${r}$`,
                sub: `$E_${c}$`,
                tone: c === 0 && s.stepIndex === 0 ? 'highlight' : c < 3 ? 'active' : 'done',
                status: c === 0 && s.stepIndex === 0 ? 'active' : 'selected',
              });
            }
          });
        });

        const expertBlocks = [
          {
            title: '块 0 · $E_0$（2 有效 + 2 PAD）',
            slots: [
              {
                id: 'b0-0',
                label: '$T_0$',
                sub: '$E_0$',
                tone: 'active' as const,
                status: 'active' as const,
              },
              {
                id: 'b0-1',
                label: '$T_3$',
                sub: '$E_0$',
                tone: 'active' as const,
                status: 'active' as const,
              },
              {
                id: 'b0-2',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b0-3',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: '块 1 · $E_1$（2 有效 + 2 PAD）',
            slots: [
              {
                id: 'b1-0',
                label: '$T_1$',
                sub: '$E_1$',
                tone: 'done' as const,
                status: 'selected' as const,
              },
              {
                id: 'b1-1',
                label: '$T_3$',
                sub: '$E_1$',
                tone: 'done' as const,
                status: 'selected' as const,
              },
              {
                id: 'b1-2',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b1-3',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: '块 2 · $E_2$（1 有效 + 3 PAD）',
            slots: [
              {
                id: 'b2-0',
                label: '$T_2$',
                sub: '$E_2$',
                tone: 'highlight' as const,
                status: 'active' as const,
              },
              {
                id: 'b2-1',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b2-2',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b2-3',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: '块 3 · $E_3$（1 有效 + 3 PAD）',
            slots: [
              {
                id: 'b3-0',
                label: '$T_0$',
                sub: '$E_3$',
                tone: 'active' as const,
                status: 'active' as const,
              },
              {
                id: 'b3-1',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b3-2',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b3-3',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: '块 4 · $E_4$（1 有效 + 3 PAD）',
            slots: [
              {
                id: 'b4-0',
                label: '$T_1$',
                sub: '$E_4$',
                tone: 'done' as const,
                status: 'selected' as const,
              },
              {
                id: 'b4-1',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b4-2',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b4-3',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
          {
            title: '块 5 · $E_5$（1 有效 + 3 PAD）',
            slots: [
              {
                id: 'b5-0',
                label: '$T_2$',
                sub: '$E_5$',
                tone: 'highlight' as const,
                status: 'active' as const,
              },
              {
                id: 'b5-1',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b5-2',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
              {
                id: 'b5-3',
                label: 'PAD',
                sub: '$-1$',
                tone: 'mask' as const,
                status: 'masked' as const,
              },
            ],
          },
        ];

        const isRouter = s.focusArea === 'router';
        const isMatrix = s.focusArea === 'matrix';
        const isAlign = s.focusArea === 'align';

        return (
          <Stage width={680} height={418} label={s.phaseLabel}>
            <ActiveFocusFrame
              x={8}
              y={10}
              w={358}
              h={180}
              tone={s.stepIndex === 0 ? 'highlight' : 'active'}
              label={s.stepIndex === 0 ? '组限热点拥堵' : '偏置选路与原始加权'}
              visible={isRouter}
            />
            <ProbabilityBars
              x={14}
              y={18}
              w={346}
              h={164}
              maxValue={1.1}
              items={barItems}
              revealedSeries={s.stepIndex === 0 ? 1 : 2}
              dimmed={isAlign}
              valueFormat={(v) => v.toFixed(2).replace(/^0(?=\.)/, '')}
              legend={[
                { label: '原始 $s$', tone: 'active' },
                { label: '选路 $s+b$', tone: 'highlight' },
              ]}
            />

            <DataFlowArrow
              points={[
                [362, 102],
                [386, 102],
              ]}
              active={isRouter || isMatrix}
              flow={isRouter || isMatrix}
              dotToken={ctx.dotToken}
              tone="active"
            />

            <ActiveFocusFrame
              x={376}
              y={10}
              w={296}
              h={180}
              tone="highlight"
              label="Batch 负载统计均衡"
              visible={isMatrix}
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
              showSelected={true}
              showSums={true}
              showMasks={true}
              dimmed={isAlign}
              rowLabels={TOKEN_LABELS}
              colLabels={EXPERT_LABELS}
              colSums={s.expertCounts.map((c) => `${c}`)}
              rowLabelW={34}
              title="4 Token × 6 Expert 命中负载 $c_i$"
            />

            <DataFlowArrow
              points={[
                [524, 186],
                [524, 202],
              ]}
              active={isAlign}
              flow={isAlign}
              dotToken={ctx.dotToken}
              tone="done"
              dashed={!isAlign}
            />

            <SectionBox
              x={8}
              y={202}
              w={664}
              h={152}
              tone={isAlign ? 'done' : 'neutral'}
              dashed={!isAlign}
              title="按专家分块对齐矩阵（block_size = 4 · 仅含同专家与 $-1$ 哨兵）"
            />
            <ActiveFocusFrame
              x={8}
              y={202}
              w={664}
              h={152}
              tone="done"
              label="按专家分块对齐"
              labelAlign="right"
              visible={isAlign}
            />
            {isAlign ? (
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
                slots={unalignedSlots}
                slotW={72}
                gap={9}
                slotH={42}
                title="重排前路由缓冲（按 Token 顺序）：8 条激活跨专家混排"
              />
            )}

            <MetricRow
              x={8}
              y={366}
              w={664}
              h={42}
              gap={10}
              revealed={true}
              metrics={[
                { label: '批均值 $\\bar{c}$', value: s.avgLoad, tone: 'neutral' },
                {
                  label: '峰值专家负载',
                  value: s.maxLoad,
                  tone: s.stepIndex === 0 ? 'highlight' : 'done',
                  active: true,
                },
                {
                  label: '分块与填充',
                  value: s.paddingWaste,
                  tone: isAlign ? 'done' : isMatrix ? 'active' : 'neutral',
                },
                { label: '偏置 / 块尺度', value: s.blockStat, tone: 'active' },
              ]}
            />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
