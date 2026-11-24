import { useMemo } from 'react';
import { Stage, type Step, type Tone } from 'astro-wisp/explainers';
import { BeatExplainer, SvgBeatGroup, defaultBeats, type BeatSpec } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import { SlotStrip } from '@/explainers/kit/PointerBoard';
import ProbabilityBars from '@/explainers/kit/ProbabilityBars';
import { assertMaxHues } from '@/explainers/kit/motion';

export interface MoeRoutingAlignState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
  beats: BeatSpec[];
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
      label: '组限评分',
      duration: 4600,
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 组限门控与原始 Sigmoid 评分',
        formulaTex:
          '$g_{i,t} = s_{i,t} \\cdot \\mathbb{I}(\\text{组 } 0\\text{ 保留}),\\; E_0\\text{ 命中 }4/4$',
        beats: defaultBeats([
          '屏蔽组 1 冷门专家',
          '比较组 0 原始分数',
          '批内负载向 E0 聚拢',
          '暴露热点拥堵',
        ]),
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
        biasRange: '$[0.00, 0.00]$',
      },
      caption:
        'Node-Limited 路由先按节点组聚合得分保留 Top-$M$ 组（组 0：$E_0\\text{–}E_2$），再以原始 Sigmoid 分数 $s_{i,t}$ 选出 Top-$K$；此时冷门组被屏蔽，$E_0$ 产生 4/4 tokens 拥堵。',
    },
    {
      label: '偏置分离',
      duration: 4600,
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · 偏置选路与无偏加权分离',
        formulaTex:
          '$\\text{Top-}K(s_{i,t} + b_i) \\Rightarrow \\{E_1, E_3\\},\\quad w_{i,t} \\propto s_{i,t}$',
        beats: defaultBeats([
          '放开全组与偏置 b',
          '叠加 s+b 选出 E1/E3',
          '跨专家打散命中矩阵',
          '权重仍取原始 s',
        ]),
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
        biasRange: '$[-0.24, +0.22]$',
      },
      caption:
        '无辅损路由仅在 Top-$K$ 选择阶段叠加偏置 $s_{i,t}+b_i$（$E_0$ 降权、$E_3$ 升权命中 Top-2），但合并权重 $w_{i,t}$ 仍直接 gather 未偏置的原始 $s_{i,t}$ 并归一化。',
    },
    {
      label: '首轮反馈',
      duration: 4600,
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · 第 1 轮符号规则更新',
        formulaTex:
          '$b_i \\leftarrow b_i + \\gamma\\operatorname{sign}(\\bar{c} - c_i),\\; \\gamma = 0.01$',
        beats: defaultBeats([
          '读取上轮负载 c_i',
          '按符号微调偏置 b_i',
          '重排批内分配矩阵',
          'E5 仍待抬升',
        ]),
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
        maxLoad: '2 ($E_5$ 仍 0)',
        paddingWaste: '待对齐',
        biasRange: '$\\gamma = 0.01$',
      },
      caption:
        '第 1 轮批统计负载 $c_i$ 与均值 $\\bar{c}=1.33$ 对比后执行免梯度更新 $b_i \\leftarrow b_i + \\gamma\\operatorname{sign}(\\bar{c}-c_i)$：过载专家下调，空闲专家 $E_5$（$c_5=0$）偏置继续抬升。',
    },
    {
      label: '激活冷门',
      duration: 4600,
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · 数轮反馈激活冷门专家 E5',
        formulaTex: '$b_5 \\uparrow +0.16,\\; T_0\\text{ 选路 }\\{E_0, E_3\\},\\; c=[1,2,1,1,2,1]$',
        beats: defaultBeats([
          '持续加权偏置 b_5',
          'T0 首选回落 E0/E3',
          '矩阵首次点亮 E5 列',
          '收敛到均匀区间',
        ]),
        scoresRaw: BASE_SCORES,
        bias: [-0.15, -0.06, 0.1, 0.17, 0.13, 0.16],
        selectedExperts: [0, 3],
        groupMask: [true, true, true, true, true, true],
        loadGrid: [
          [1, 0, 0, 1, 0, 0],
          [0, 1, 0, 0, 1, 0],
          [0, 0, 1, 0, 0, 1],
          [0, 1, 0, 0, 1, 0],
        ],
        expertCounts: [1, 2, 1, 1, 2, 1],
        focusArea: 'matrix',
        avgLoad: '1.33',
        maxLoad: '2 (冷门激活)',
        paddingWaste: '待对齐',
        biasRange: '$b_5: +0.13\\to+0.16$',
      },
      caption:
        '多轮正反馈后，$b_5$ 推升至 $+0.16$ 使 $E_5$ 越过门限接管 $T_2$，$T_0$ 的首选则在偏置纠偏下落在 $(E_0, E_3)$，6 位专家全部进入活跃区。',
    },
    {
      label: '稳态均衡',
      duration: 4600,
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · 稳态跨卡均衡分发',
        formulaTex:
          '$b \\leftarrow b + 0.01\\operatorname{sign}(\\bar{c}-c) \\Rightarrow c = [2,2,1,1,1,1]$',
        beats: defaultBeats([
          '沿符号规则微调 b',
          '确认 T0..T3 新命中',
          '各列计数压至 1..2',
          '准备按专家重排',
        ]),
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
        maxLoad: '2 (稳态)',
        paddingWaste: '按专家重排',
        biasRange: '$[-0.14, +0.18]$',
      },
      caption:
        '稳态下 8 次激活几乎均匀落入 6 个专家（负载 $[2,2,1,1,1,1]$），All-to-All 通信尾延迟明显收敛，为后续本地 Grouped GEMM 提供平衡的批大小。',
    },
    {
      label: '分块填充',
      duration: 4800,
      state: {
        stepIndex: 5,
        phaseLabel: 'Step 6 · moe_align_block_size 填充对齐',
        formulaTex: '$M_{\\text{pad}} = 6 \\times 4 = 24,\\quad 8\\text{ 有效} + 16\\text{ PAD}$',
        beats: defaultBeats([
          '锁定稳态路由矩阵',
          '装填上排 Block 0..2',
          '补齐下排 Block 3..5',
          '汇总填充开销',
        ]),
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
        avgLoad: '8 有效行',
        maxLoad: '$6\\times \\text{block}=4$',
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
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={514}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat }) => {
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

        const isAlign = s.focusArea === 'align';
        const showBiasBars = s.stepIndex === 0 ? 1 : beat >= 1 ? 2 : 1;

        return (
          <Stage width={680} height={418} label={s.phaseLabel}>
            <ActiveFocusFrame
              x={8}
              y={10}
              w={358}
              h={180}
              tone="active"
              label={s.stepIndex === 1 ? '偏置选路 / 原始加权' : 'T0 门控打分对比'}
              visible={s.focusArea === 'router' && beat >= 1}
            />
            <ProbabilityBars
              x={14}
              y={18}
              w={346}
              h={164}
              maxValue={1.1}
              items={barItems}
              revealedSeries={showBiasBars}
              dimmed={isAlign}
              valueFormat={(v) => v.toFixed(2).replace(/^0(?=\.)/, '')}
              legend={[
                { label: '原始 $s$', tone: 'active' },
                { label: '选路 $s+b$', tone: 'highlight' },
              ]}
            />

            <ActiveFocusFrame
              x={376}
              y={10}
              w={296}
              h={180}
              tone="highlight"
              label="Batch 负载统计"
              visible={s.focusArea === 'matrix' && beat >= 2}
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
              showSelected={s.focusArea === 'matrix' ? beat >= 2 : beat >= 2}
              showSums={beat >= 2}
              showMasks={beat >= 0}
              dimmed={isAlign && beat >= 1}
              rowLabels={TOKEN_LABELS}
              colLabels={EXPERT_LABELS}
              colSums={s.expertCounts.map((c) => `c=${c}`)}
              rowLabelW={34}
              title="批内路由命中与负载 $c_i$"
            />

            <SectionBox
              x={8}
              y={202}
              w={664}
              h={152}
              tone={isAlign ? 'done' : 'neutral'}
              dashed={!isAlign}
              dimmed={s.stepIndex < 5 && beat < 2}
              title="moe_align_block_size 分块矩阵（仅含同专家与 -1 PAD 槽，示意 block_size=4）"
            />
            <ActiveFocusFrame
              x={8}
              y={202}
              w={664}
              h={152}
              tone="done"
              label="moe_align_block_size 分块对齐"
              labelAlign="right"
              visible={isAlign && beat >= 1}
            />
            {s.stepIndex === 5 ? (
              expertBlocks.map((blk, bi) => (
                <SvgBeatGroup key={blk.title} visible={bi < 3 ? beat >= 1 : beat >= 2}>
                  <SlotStrip
                    x={20 + (bi % 3) * 222}
                    y={bi < 3 ? 224 : 288}
                    slots={blk.slots}
                    slotW={46}
                    gap={4}
                    slotH={34}
                    title={blk.title}
                  />
                </SvgBeatGroup>
              ))
            ) : (
              <SlotStrip
                x={20}
                y={254}
                slots={emptyAlignSlots}
                slotW={72}
                gap={9}
                slotH={42}
                dimmed={beat < 2}
                title="未对齐路由缓冲：8 条激活跨专家混排，待按专家编号重排补齐"
              />
            )}

            <MetricRow
              x={8}
              y={366}
              w={664}
              h={42}
              gap={10}
              revealed={beat >= 3}
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
                  tone: s.stepIndex === 5 ? 'done' : s.stepIndex === 4 ? 'active' : 'neutral',
                },
                { label: '偏置更新幅度', value: s.biasRange, tone: 'active' },
              ]}
            />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
