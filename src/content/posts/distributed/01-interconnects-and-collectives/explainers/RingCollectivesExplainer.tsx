import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, RADIUS_SM } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox, type MetricItem } from '@/explainers/kit/MetricRow';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import {
  MORPH_SPRING,
  STAGE_W,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
  type AnyTone,
} from '@/explainers/kit/motion';

export interface RingCollectivesState {
  phase: string;
  subStep: string;
  formulaTex: string;
  streaming: boolean;
  arrowTone: AnyTone;
  /** Values [c0, c1, c2, c3] held by Ranks 0..3. */
  shards: [number[], number[], number[], number[]];
  /** Per-rank chunk completion progress [0..1] for smooth fill morphing. */
  fillRatios: [number[], number[], number[], number[]];
  /** Per-rank active shard index being accumulated/received this step (-1 = none). */
  activeIdx: [number, number, number, number];
  /** Per-rank indices that hold final global sums [6, 8, 6, 8]. */
  doneIndices: [number[], number[], number[], number[]];
  /** Clockwise ring transfer labels. */
  transfers: [string, string, string, string];
  cumLatency: string;
  treeCompare: string;
  bwEfficiency: string;
}

const INIT_SHARDS: [number[], number[], number[], number[]] = [
  [1, 2, 0, 4],
  [3, 1, 2, 0],
  [0, 4, 1, 2],
  [2, 1, 3, 2],
];

const SHARDS_RS_DONE: [number[], number[], number[], number[]] = [
  [1, 8, 4, 6],
  [4, 1, 6, 6],
  [4, 5, 1, 8],
  [6, 6, 4, 2],
];

const SHARDS_AG_MID: [number[], number[], number[], number[]] = [
  [6, 8, 4, 8],
  [6, 8, 6, 6],
  [4, 8, 6, 8],
  [6, 6, 6, 8],
];

const SHARDS_FINAL: [number[], number[], number[], number[]] = [
  [6, 8, 6, 8],
  [6, 8, 6, 8],
  [6, 8, 6, 8],
  [6, 8, 6, 8],
];

export function buildRingCollectivesSteps(): Step<RingCollectivesState>[] {
  const tones: AnyTone[] = ['active', 'done', 'highlight'];
  assertMaxHues(tones, 3);

  return [
    {
      label: '初始分片',
      duration: 4600,
      state: {
        phase: '初始分片',
        subStep: '0 / 6 跳',
        formulaTex: '$T_{\\text{Ring}}(P,S) = 2(P-1)\\alpha + 2\\frac{P-1}{P}S\\beta,\\; P=4$',
        streaming: false,
        arrowTone: 'active',
        shards: INIT_SHARDS,
        fillRatios: [
          [0.25, 0.25, 0.25, 0.25],
          [0.25, 0.25, 0.25, 0.25],
          [0.25, 0.25, 0.25, 0.25],
          [0.25, 0.25, 0.25, 0.25],
        ],
        activeIdx: [-1, -1, -1, -1],
        doneIndices: [[], [], [], []],
        transfers: ['$c_0: S/4$', '$c_1: S/4$', '$c_2: S/4$', '$c_3: S/4$'],
        cumLatency: '$0$',
        treeCompare: 'Tree: $4\\alpha + 4S\\beta$',
        bwEfficiency: '每卡均分 4 个 $S/4$ 块',
      },
      caption:
        '初始分片：4 张卡各自持有长为 $S$ 的局部梯度向量（$[1,2,0,4]$、$[3,1,2,0]$、$[0,4,1,2]$、$[2,1,3,2]$），并按卡数均分为 $c_0\\text{–}c_3$ 四个 $S/4$ 微块，准备沿顺时针环网启动。',
    },
    {
      label: 'Reduce-Scatter 归约',
      duration: 4800,
      state: {
        phase: 'ReduceScatter',
        subStep: '3 跳累加',
        formulaTex:
          '$t_{\\text{RS}} = 3\\alpha + \\frac{3}{4}S\\beta \\;\\Longrightarrow\\; \\text{每卡持 1 个全和}$',
        streaming: true,
        arrowTone: 'active',
        shards: SHARDS_RS_DONE,
        fillRatios: [
          [0.25, 1, 0.5, 0.75],
          [0.75, 0.25, 1, 0.75],
          [0.5, 0.75, 0.25, 1],
          [1, 0.75, 0.5, 0.25],
        ],
        activeIdx: [1, 2, 3, 0],
        doneIndices: [[1], [2], [3], [0]],
        transfers: ['$c_2 \\to +4$', '$c_3 \\to +6$', '$c_0 \\to +4$', '$c_1 \\to +6$'],
        cumLatency: '$3\\alpha + 0.75S\\beta$',
        treeCompare: 'Tree 前半程 $2\\alpha + 2S\\beta$',
        bwEfficiency: '4 卡各持 1 个全和',
      },
      caption:
        'Reduce-Scatter 归约：经历 $P-1=3$ 跳顺时针接力，每跳仅传输 $S/4$ 数据并与本地对应分片累加；结束时 $R_0\\text{–}R_3$ 各自收敛出 1 个完整全局和（$c_1=8, c_2=6, c_3=8, c_0=6$）。',
    },
    {
      label: 'AllGather 广播',
      duration: 4800,
      state: {
        phase: 'AllGather',
        subStep: '第 2 跳广播',
        formulaTex:
          '$t_{\\text{AG}} = 2\\alpha + \\frac{2}{4}S\\beta \\;(\\text{纯覆写无加法},\\; 3/4\\text{ 就绪})$',
        streaming: true,
        arrowTone: 'done',
        shards: SHARDS_AG_MID,
        fillRatios: [
          [1, 1, 0.5, 1],
          [1, 1, 1, 0.75],
          [0.5, 1, 1, 1],
          [1, 0.75, 1, 1],
        ],
        activeIdx: [3, 0, 1, 2],
        doneIndices: [
          [0, 1, 3],
          [0, 1, 2],
          [1, 2, 3],
          [2, 3, 0],
        ],
        transfers: ['$c_0=6$', '$c_1=8$', '$c_2=6$', '$c_3=8$'],
        cumLatency: '$5\\alpha + 1.25S\\beta$',
        treeCompare: '无加法纯覆写接力',
        bwEfficiency: '每卡 3/4 分片就绪',
      },
      caption:
        'AllGather 广播：各卡把刚算出的完整求和分片沿环继续顺时针推送并直接覆写下游槽位，无需再做加法归约；第 2 跳后每张卡已集齐 3 个全局和分片。',
    },
    {
      label: '全局一致收敛',
      duration: 4800,
      state: {
        phase: 'AllReduce 收敛',
        subStep: '6 跳完成',
        formulaTex: '$T_{\\text{Ring}} = 6\\alpha + 1.50S\\beta \\;\\;(\\text{75\\% 带宽效率})$',
        streaming: true,
        arrowTone: 'done',
        shards: SHARDS_FINAL,
        fillRatios: [
          [1, 1, 1, 1],
          [1, 1, 1, 1],
          [1, 1, 1, 1],
          [1, 1, 1, 1],
        ],
        activeIdx: [2, 3, 0, 1],
        doneIndices: [
          [0, 1, 2, 3],
          [0, 1, 2, 3],
          [0, 1, 2, 3],
          [0, 1, 2, 3],
        ],
        transfers: ['$c_3=8$', '$c_0=6$', '$c_1=8$', '$c_2=6$'],
        cumLatency: '$6\\alpha + 1.50S\\beta$',
        treeCompare: 'vs Tree $4\\alpha + 4S\\beta$',
        bwEfficiency: '75% ($\\frac{P-1}{P}$) 带宽效率',
      },
      caption:
        '全局一致收敛：第 6 跳补齐每卡最后 1 块分片，4 张卡全部对齐 $[6,8,6,8]$；大消息下 Ring 带宽项 $1.50S\\beta$ 显著优于 Tree 的 $4S\\beta$，小消息下延迟项 $6\\alpha$ 随卡数线性放大。',
    },
  ];
}

const RANK_POSITIONS: ReadonlyArray<{
  rank: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  title: string;
}> = [
  { rank: 0, x: 28, y: 40, title: 'Rank 0 (GPU/NPU 0)' },
  { rank: 1, x: 424, y: 40, title: 'Rank 1 (GPU/NPU 1)' },
  { rank: 2, x: 424, y: 190, title: 'Rank 2 (GPU/NPU 2)' },
  { rank: 3, x: 28, y: 190, title: 'Rank 3 (GPU/NPU 3)' },
];

function RankChunkGrid({
  rank,
  x,
  y,
  state,
}: {
  rank: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  state: RingCollectivesState;
}) {
  const vals = state.shards[rank];
  const ratios = state.fillRatios[rank];
  const act = state.activeIdx[rank];
  const doneSet = new Set(state.doneIndices[rank]);
  const initVals = INIT_SHARDS[rank];
  const cardW = 46;
  const cardH = 54;
  const gap = 6;
  const fillMaxH = 14;

  return (
    <g>
      {vals.map((val, idx) => {
        const cx = x + idx * (cardW + gap);
        const isDone = doneSet.has(idx);
        const isAct = act === idx;
        const tone: AnyTone = isDone ? 'done' : isAct ? 'active' : 'neutral';
        const stroke = resolveToneStroke(tone);
        const fill = resolveToneFill(tone);
        const ratio = ratios[idx] ?? 0.25;
        const barW = Math.max(4, Math.round((cardW - 8) * ratio));

        return (
          <g key={`r${rank}-c${idx}`}>
            <SvgRichLabel
              x={cx + cardW / 2}
              y={y - 9}
              width={cardW + 4}
              height={16}
              text={`$c_${idx}$`}
              fontSize={10}
              color="var(--wisp-muted)"
              family="mono"
            />
            <motion.rect
              initial={false}
              animate={{
                fillOpacity: isDone || isAct ? 1 : 0.72,
                strokeWidth: isAct ? 2 : isDone ? 1.5 : 1,
              }}
              transition={MORPH_SPRING}
              x={cx}
              y={y}
              width={cardW}
              height={cardH}
              rx={RADIUS_SM}
              fill={fill}
              stroke={stroke}
            />
            <text
              x={cx + cardW / 2}
              y={y + 15}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-fg)',
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 13,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {val}
            </text>
            <text
              x={cx + cardW / 2}
              y={y + 30}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {`原${initVals[idx]}`}
            </text>
            {/* Chunk fill progress track + smooth morph bar */}
            <rect
              x={cx + 4}
              y={y + cardH - fillMaxH + 3}
              width={cardW - 8}
              height={7}
              rx={RADIUS_SM}
              fill="var(--wisp-bg)"
              stroke="var(--wisp-border)"
              strokeWidth={0.75}
            />
            <motion.rect
              initial={false}
              animate={{ width: barW }}
              transition={MORPH_SPRING}
              x={cx + 4}
              y={y + cardH - fillMaxH + 3}
              height={7}
              rx={RADIUS_SM}
              fill={stroke}
              fillOpacity={0.82}
            />
          </g>
        );
      })}
    </g>
  );
}

export default function RingCollectivesExplainer({
  title = '图 1：4 卡 Ring AllReduce（ReduceScatter + AllGather）分步推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildRingCollectivesSteps(), []);

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label="Ring AllReduce 环形集合通信推演"
      wide
      stageMinHeight={478}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { dotToken }) => {
        const s = step.state;
        const arrowTone = s.arrowTone;

        const metrics: MetricItem[] = [
          {
            label: '当前阶段',
            value: `${s.phase} · ${s.subStep}`,
            tone: arrowTone,
            active: true,
          },
          {
            label: 'Ring 累计延迟',
            value: s.cumLatency,
            tone: 'highlight',
          },
          {
            label: 'Tree 延迟参照 (P=4)',
            value: s.treeCompare,
            tone: 'neutral',
          },
          {
            label: '算法带宽效率',
            value: s.bwEfficiency,
            tone: 'done',
          },
        ];

        return (
          <Stage width={STAGE_W} height={386} label="4 卡环形集合通信分片状态机">
            <SectionBox
              x={12}
              y={10}
              w={STAGE_W - 24}
              h={296}
              title={`顺时针环拓扑 $R_0 \\to R_1 \\to R_2 \\to R_3 \\to R_0$ · ${s.phase} (${s.subStep})`}
              tone="neutral"
              dashed
            />

            {RANK_POSITIONS.map((rp) => {
              const allDone = s.doneIndices[rp.rank].length === 4;
              return (
                <g key={`rank-${rp.rank}`}>
                  <SectionBox
                    x={rp.x}
                    y={rp.y}
                    w={228}
                    h={102}
                    title={rp.title}
                    tone={allDone ? 'done' : s.streaming ? 'active' : 'neutral'}
                  />
                  <RankChunkGrid rank={rp.rank} x={rp.x + 12} y={rp.y + 40} state={s} />
                </g>
              );
            })}

            {/* Clockwise Ring DataFlowArrows */}
            <DataFlowArrow
              points={[
                [260, 91],
                [420, 91],
              ]}
              tone={arrowTone}
              active={s.streaming}
              flow={s.streaming}
              continuous={true}
              visible={true}
              draw={s.streaming}
              dotToken={s.streaming ? dotToken : 0}
              label={s.transfers[0]}
              strokeWidth={2}
            />
            <DataFlowArrow
              points={[
                [538, 144],
                [538, 188],
              ]}
              tone={arrowTone}
              active={s.streaming}
              flow={s.streaming}
              continuous={true}
              visible={true}
              draw={s.streaming}
              dotToken={s.streaming ? dotToken : 0}
              label={s.transfers[1]}
              strokeWidth={2}
            />
            <DataFlowArrow
              points={[
                [420, 241],
                [260, 241],
              ]}
              tone={arrowTone}
              active={s.streaming}
              flow={s.streaming}
              continuous={true}
              visible={true}
              draw={s.streaming}
              dotToken={s.streaming ? dotToken : 0}
              label={s.transfers[2]}
              strokeWidth={2}
            />
            <DataFlowArrow
              points={[
                [142, 188],
                [142, 144],
              ]}
              tone={arrowTone}
              active={s.streaming}
              flow={s.streaming}
              continuous={true}
              visible={true}
              draw={s.streaming}
              dotToken={s.streaming ? dotToken : 0}
              label={s.transfers[3]}
              strokeWidth={2}
            />

            <MetricRow x={12} y={322} w={STAGE_W - 24} h={50} metrics={metrics} />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
