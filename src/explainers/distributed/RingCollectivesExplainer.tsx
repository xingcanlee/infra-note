import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  DataFlowArrow,
  MetricRow,
  SectionBox,
  SlotStrip,
  STAGE_W,
  assertMaxHues,
  type AnyTone,
  type MetricItem,
  type SlotItem,
} from '@/explainers/kit';

export interface RingEdge {
  from: 0 | 1 | 2 | 3;
  to: 0 | 1 | 2 | 3;
  label: string;
}

export interface RingCollectivesState {
  phase: string;
  subStep: string;
  /** Values [c0, c1, c2, c3] held by Ranks 0..3 after this step. */
  shards: [number[], number[], number[], number[]];
  /** Per-rank active shard index being accumulated/received this step. */
  activeIdx: [number, number, number, number];
  /** Per-rank indices that hold final global sums [6, 8, 6, 8]. */
  doneIndices: [number[], number[], number[], number[]];
  /** Active clockwise ring transfer labels. */
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

export function buildRingCollectivesSteps(): Step<RingCollectivesState>[] {
  const tones: AnyTone[] = ['active', 'done', 'highlight'];
  assertMaxHues(tones, 3);

  return [
    {
      state: {
        phase: 'ReduceScatter',
        subStep: '1 / 3',
        shards: [
          [1, 2, 0, 6],
          [4, 1, 2, 0],
          [0, 5, 1, 2],
          [2, 1, 4, 2],
        ],
        activeIdx: [3, 0, 1, 2],
        doneIndices: [[], [], [], []],
        transfers: ['c0: +1', 'c1: +1', 'c2: +1', 'c3: +2'],
        cumLatency: '1·(α + S/4·β)',
        treeCompare: 'Tree 需完整 S 发送',
        bwEfficiency: '100% 并发收发',
      },
      caption:
        'ReduceScatter 第 1 跳：初始各卡分片为 $[1,2,0,4]$、$[3,1,2,0]$、$[0,4,1,2]$、$[2,1,3,2]$；各 Rank 沿顺时针发送分片 $c_r$ 并累加到下游对应槽位，仅传输 $S/4$ 数据。',
    },
    {
      state: {
        phase: 'ReduceScatter',
        subStep: '2 / 3',
        shards: [
          [1, 2, 4, 6],
          [4, 1, 2, 6],
          [4, 5, 1, 2],
          [2, 6, 4, 2],
        ],
        activeIdx: [2, 3, 0, 1],
        doneIndices: [[], [], [], []],
        transfers: ['c3: +6', 'c0: +4', 'c1: +5', 'c2: +4'],
        cumLatency: '2·(α + S/4·β)',
        treeCompare: '2-hop 等长微块流水',
        bwEfficiency: '链路无空闲等待',
      },
      caption:
        'ReduceScatter 第 2 跳：每卡将上一跳刚累加好的部分和继续顺时针前推 1 跳；例如 R0 将 $c_3=6$ 发给 R1，同时从 R3 接收 $c_2=4$ 累加至 $[1,2,4,6]$。',
    },
    {
      state: {
        phase: 'ReduceScatter 完成',
        subStep: '3 / 3',
        shards: [
          [1, 8, 4, 6],
          [4, 1, 6, 6],
          [4, 5, 1, 8],
          [6, 6, 4, 2],
        ],
        activeIdx: [1, 2, 3, 0],
        doneIndices: [[1], [2], [3], [0]],
        transfers: ['c2: +4', 'c3: +6', 'c0: +4', 'c1: +6'],
        cumLatency: '3·α + 0.75·S·β',
        treeCompare: '等价 Tree 前半程',
        bwEfficiency: '4 卡各持 1 个全和',
      },
      caption:
        'ReduceScatter 第 3 跳完成：历经 $P-1=3$ 跳后，R0–R3 各自持有一个全局求和分片（$c_1=8,\\ c_2=6,\\ c_3=8,\\ c_0=6$），累计开销为 $3\\alpha + \\frac{3}{4}S\\beta$。',
    },
    {
      state: {
        phase: 'AllGather',
        subStep: '1 / 3',
        shards: [
          [6, 8, 4, 6],
          [4, 8, 6, 6],
          [4, 5, 6, 8],
          [6, 6, 4, 8],
        ],
        activeIdx: [0, 1, 2, 3],
        doneIndices: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ],
        transfers: ['c1=8', 'c2=6', 'c3=8', 'c0=6'],
        cumLatency: '4·α + 1.00·S·β',
        treeCompare: '无需加法纯覆写',
        bwEfficiency: '每卡 2/4 分片就绪',
      },
      caption:
        'AllGather 第 1 跳：各卡把 ReduceScatter 阶段得到的最终和分片顺时针广播给下一跳并直接覆写，每卡立即拥有 2 个完整分片。',
    },
    {
      state: {
        phase: 'AllGather',
        subStep: '2 / 3',
        shards: [
          [6, 8, 4, 8],
          [6, 8, 6, 6],
          [4, 8, 6, 8],
          [6, 6, 6, 8],
        ],
        activeIdx: [3, 0, 1, 2],
        doneIndices: [
          [0, 1, 3],
          [0, 1, 2],
          [1, 2, 3],
          [2, 3, 0],
        ],
        transfers: ['c0=6', 'c1=8', 'c2=6', 'c3=8'],
        cumLatency: '5·α + 1.25·S·β',
        treeCompare: '小消息 α 占比抬升',
        bwEfficiency: '每卡 3/4 分片就绪',
      },
      caption:
        'AllGather 第 2 跳：把刚收到的完备分片再前传 1 跳（例如 R0 向 R1 发送 $c_0=6$）；此时每张卡只剩最后 1 个分片尚未更新。',
    },
    {
      state: {
        phase: 'AllReduce 收敛',
        subStep: '3 / 3',
        shards: [
          [6, 8, 6, 8],
          [6, 8, 6, 8],
          [6, 8, 6, 8],
          [6, 8, 6, 8],
        ],
        activeIdx: [2, 3, 0, 1],
        doneIndices: [
          [0, 1, 2, 3],
          [0, 1, 2, 3],
          [0, 1, 2, 3],
          [0, 1, 2, 3],
        ],
        transfers: ['c3=8', 'c0=6', 'c1=8', 'c2=6'],
        cumLatency: '6·α + 1.50·S·β',
        treeCompare: 'vs Tree 4·α + 4·S·β',
        bwEfficiency: '75% = (P-1)/P 带宽效率',
      },
      caption:
        'AllGather 第 3 跳收敛：4 张卡均得到完整的全局归约向量 $[6, 8, 6, 8]$；大消息下 Ring 带宽项 $2\\frac{P-1}{P}S\\beta = 1.5S\\beta$ 远低于 Tree 的 $2(\\log_2 P)S\\beta = 4S\\beta$，但延迟项 $6\\alpha$ 随卡数线性增长。',
    },
  ];
}

function buildRankSlots(rank: 0 | 1 | 2 | 3, s: RingCollectivesState): SlotItem[] {
  const vals = s.shards[rank];
  const act = s.activeIdx[rank];
  const doneSet = new Set(s.doneIndices[rank]);
  const initVals = INIT_SHARDS[rank];

  return vals.map((v, idx) => {
    const isAct = act === idx;
    const isDone = doneSet.has(idx);
    const tone: AnyTone = isDone ? 'done' : isAct ? 'active' : 'neutral';
    const status = isAct ? 'active' : isDone ? 'selected' : 'normal';
    return {
      id: `r${rank}_c${idx}`,
      label: String(v),
      sub: `原${initVals[idx]}`,
      topTag: `c${idx}`,
      tone,
      status,
    };
  });
}

export default function RingCollectivesExplainer({
  title = '图 1：4 卡 Ring AllReduce（ReduceScatter + AllGather）分步推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildRingCollectivesSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="Ring AllReduce 环形集合通信推演" wide>
      {(step) => {
        const s = step.state;
        const isGather = s.phase.startsWith('AllGather') || s.phase.includes('收敛');
        const arrowTone: AnyTone = isGather ? 'done' : 'active';

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
          <Stage width={STAGE_W} height={382} label="4 卡环形集合通信分片状态机">
            <SectionBox
              x={12}
              y={10}
              w={STAGE_W - 24}
              h={292}
              title={`顺时针环拓扑 R0 -> R1 -> R2 -> R3 -> R0 · 当前: ${s.phase} (${s.subStep})`}
              tone="neutral"
              dashed
            />

            {/* Rank 0 (Top Left) */}
            <SectionBox
              x={28}
              y={42}
              w={228}
              h={98}
              title="Rank 0 (GPU/NPU 0)"
              tone={s.doneIndices[0].length === 4 ? 'done' : 'active'}
            />
            <SlotStrip
              x={40}
              y={78}
              slots={buildRankSlots(0, s)}
              slotW={46}
              slotH={44}
              gap={6}
              fontSize={12}
            />

            {/* Rank 1 (Top Right) */}
            <SectionBox
              x={424}
              y={42}
              w={228}
              h={98}
              title="Rank 1 (GPU/NPU 1)"
              tone={s.doneIndices[1].length === 4 ? 'done' : 'active'}
            />
            <SlotStrip
              x={436}
              y={78}
              slots={buildRankSlots(1, s)}
              slotW={46}
              slotH={44}
              gap={6}
              fontSize={12}
            />

            {/* Rank 3 (Bottom Left) */}
            <SectionBox
              x={28}
              y={190}
              w={228}
              h={98}
              title="Rank 3 (GPU/NPU 3)"
              tone={s.doneIndices[3].length === 4 ? 'done' : 'active'}
            />
            <SlotStrip
              x={40}
              y={226}
              slots={buildRankSlots(3, s)}
              slotW={46}
              slotH={44}
              gap={6}
              fontSize={12}
            />

            {/* Rank 2 (Bottom Right) */}
            <SectionBox
              x={424}
              y={190}
              w={228}
              h={98}
              title="Rank 2 (GPU/NPU 2)"
              tone={s.doneIndices[2].length === 4 ? 'done' : 'active'}
            />
            <SlotStrip
              x={436}
              y={226}
              slots={buildRankSlots(2, s)}
              slotW={46}
              slotH={44}
              gap={6}
              fontSize={12}
            />

            {/* Clockwise Ring DataFlowArrows */}
            <DataFlowArrow
              points={[
                [260, 91],
                [420, 91],
              ]}
              tone={arrowTone}
              active
              flow
              label={s.transfers[0]}
              strokeWidth={2}
            />
            <DataFlowArrow
              points={[
                [538, 142],
                [538, 188],
              ]}
              tone={arrowTone}
              active
              flow
              label={s.transfers[1]}
              strokeWidth={2}
            />
            <DataFlowArrow
              points={[
                [420, 239],
                [260, 239],
              ]}
              tone={arrowTone}
              active
              flow
              label={s.transfers[2]}
              strokeWidth={2}
            />
            <DataFlowArrow
              points={[
                [142, 188],
                [142, 142],
              ]}
              tone={arrowTone}
              active
              flow
              label={s.transfers[3]}
              strokeWidth={2}
            />

            <MetricRow x={12} y={318} w={STAGE_W - 24} h={50} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
