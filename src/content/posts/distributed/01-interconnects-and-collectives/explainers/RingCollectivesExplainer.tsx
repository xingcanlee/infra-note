import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { BeatExplainer, defaultBeats, type BeatSpec } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox, type MetricItem } from '@/explainers/kit/MetricRow';
import { SlotStrip, type SlotItem } from '@/explainers/kit/PointerBoard';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface RingCollectivesState {
  phase: string;
  subStep: string;
  formulaTex: string;
  beats: BeatSpec[];
  /** Values [c0, c1, c2, c3] held by Ranks 0..3 before and after this step. */
  prevShards: [number[], number[], number[], number[]];
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

const SHARDS_STEP_0: [number[], number[], number[], number[]] = [
  [1, 2, 0, 6],
  [4, 1, 2, 0],
  [0, 5, 1, 2],
  [2, 1, 4, 2],
];

const SHARDS_STEP_1: [number[], number[], number[], number[]] = [
  [1, 2, 4, 6],
  [4, 1, 2, 6],
  [4, 5, 1, 2],
  [2, 6, 4, 2],
];

const SHARDS_STEP_2: [number[], number[], number[], number[]] = [
  [1, 8, 4, 6],
  [4, 1, 6, 6],
  [4, 5, 1, 8],
  [6, 6, 4, 2],
];

const SHARDS_STEP_3: [number[], number[], number[], number[]] = [
  [6, 8, 4, 6],
  [4, 8, 6, 6],
  [4, 5, 6, 8],
  [6, 6, 4, 8],
];

const SHARDS_STEP_4: [number[], number[], number[], number[]] = [
  [6, 8, 4, 8],
  [6, 8, 6, 6],
  [4, 8, 6, 8],
  [6, 6, 6, 8],
];

const SHARDS_STEP_5: [number[], number[], number[], number[]] = [
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
      label: '散播 1/3',
      duration: 4600,
      state: {
        phase: 'ReduceScatter',
        subStep: '1 / 3',
        formulaTex: '$t_1 = \\alpha + \\frac{S}{4}\\beta \\;\\;(\\text{顺时针推送 } c_r)$',
        beats: defaultBeats([
          '读取各卡初始分片',
          '沿环顺时针发起首跳',
          '接收分片累加部分和',
          '记录 1-hop 通信开销',
        ]),
        prevShards: INIT_SHARDS,
        shards: SHARDS_STEP_0,
        activeIdx: [3, 0, 1, 2],
        doneIndices: [[], [], [], []],
        transfers: ['$c_0: +1$', '$c_1: +1$', '$c_2: +1$', '$c_3: +2$'],
        cumLatency: '$1\\cdot(\\alpha + \\frac{S}{4}\\beta)$',
        treeCompare: 'Tree 需完整 $S$ 发送',
        bwEfficiency: '100% 并发收发',
      },
      caption:
        'ReduceScatter 第 1 跳：初始各卡分片为 $[1,2,0,4]$、$[3,1,2,0]$、$[0,4,1,2]$、$[2,1,3,2]$；各 Rank 沿顺时针发送分片 $c_r$ 并累加到下游对应槽位，仅传输 $S/4$ 数据。',
    },
    {
      label: '散播 2/3',
      duration: 4600,
      state: {
        phase: 'ReduceScatter',
        subStep: '2 / 3',
        formulaTex: '$t_2 = 2(\\alpha + \\frac{S}{4}\\beta) \\;\\;(\\text{部分和连续接力})$',
        beats: defaultBeats([
          '检视第 1 跳部分和',
          '将部分和再推 1 跳',
          '刷新下游 2/4 累加槽',
          '确认无链路空闲等待',
        ]),
        prevShards: SHARDS_STEP_0,
        shards: SHARDS_STEP_1,
        activeIdx: [2, 3, 0, 1],
        doneIndices: [[], [], [], []],
        transfers: ['$c_3: +6$', '$c_0: +4$', '$c_1: +5$', '$c_2: +4$'],
        cumLatency: '$2\\cdot(\\alpha + \\frac{S}{4}\\beta)$',
        treeCompare: '2-hop 等长微块流水',
        bwEfficiency: '链路无空闲等待',
      },
      caption:
        'ReduceScatter 第 2 跳：每卡将上一跳刚累加好的部分和继续顺时针前推 1 跳；例如 R0 将 $c_3=6$ 发给 R1，同时从 R3 接收 $c_2=4$ 累加至 $[1,2,4,6]$。',
    },
    {
      label: '散播 3/3',
      duration: 4600,
      state: {
        phase: 'ReduceScatter 完成',
        subStep: '3 / 3',
        formulaTex:
          '$t_3 = 3\\alpha + \\frac{3}{4}S\\beta \\;\\Longrightarrow\\; \\text{各持 1 个全和}$',
        beats: defaultBeats([
          '读取上跳半累加和',
          '顺时针递送终局分量',
          '四卡各点亮 1 个全和',
          '确认 ReduceScatter 收官',
        ]),
        prevShards: SHARDS_STEP_1,
        shards: SHARDS_STEP_2,
        activeIdx: [1, 2, 3, 0],
        doneIndices: [[1], [2], [3], [0]],
        transfers: ['$c_2: +4$', '$c_3: +6$', '$c_0: +4$', '$c_1: +6$'],
        cumLatency: '$3\\alpha + 0.75S\\beta$',
        treeCompare: '等价 Tree 前半程',
        bwEfficiency: '4 卡各持 1 个全和',
      },
      caption:
        'ReduceScatter 第 3 跳完成：历经 $P-1=3$ 跳后，R0–R3 各自持有一个全局求和分片（$c_1=8,\\ c_2=6,\\ c_3=8,\\ c_0=6$），累计开销为 $3\\alpha + \\frac{3}{4}S\\beta$。',
    },
    {
      label: '收集 1/3',
      duration: 4600,
      state: {
        phase: 'AllGather',
        subStep: '1 / 3',
        formulaTex: '$t_4 = 4\\alpha + 1.00S\\beta \\;\\;(\\text{全和覆写传递})$',
        beats: defaultBeats([
          '锁定各卡已就绪全和',
          '顺时针放送完整分片',
          '下游直接覆写至 2/4',
          '对比无加法纯拷贝',
        ]),
        prevShards: SHARDS_STEP_2,
        shards: SHARDS_STEP_3,
        activeIdx: [0, 1, 2, 3],
        doneIndices: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ],
        transfers: ['$c_1=8$', '$c_2=6$', '$c_3=8$', '$c_0=6$'],
        cumLatency: '$4\\alpha + 1.00S\\beta$',
        treeCompare: '无需加法纯覆写',
        bwEfficiency: '每卡 2/4 分片就绪',
      },
      caption:
        'AllGather 第 1 跳：各卡把 ReduceScatter 阶段得到的最终和分片顺时针广播给下一跳并直接覆写，每卡立即拥有 2 个完整分片。',
    },
    {
      label: '收集 2/3',
      duration: 4600,
      state: {
        phase: 'AllGather',
        subStep: '2 / 3',
        formulaTex: '$t_5 = 5\\alpha + 1.25S\\beta \\;\\;(\\text{每卡 3/4 就绪})$',
        beats: defaultBeats([
          '读取上跳广播的完备和',
          '继续顺时针转发给下家',
          '每卡点亮 3/4 全和槽',
          '观察延迟系数线性累加',
        ]),
        prevShards: SHARDS_STEP_3,
        shards: SHARDS_STEP_4,
        activeIdx: [3, 0, 1, 2],
        doneIndices: [
          [0, 1, 3],
          [0, 1, 2],
          [1, 2, 3],
          [2, 3, 0],
        ],
        transfers: ['$c_0=6$', '$c_1=8$', '$c_2=6$', '$c_3=8$'],
        cumLatency: '$5\\alpha + 1.25S\\beta$',
        treeCompare: '小消息 $\\alpha$ 占比抬升',
        bwEfficiency: '每卡 3/4 分片就绪',
      },
      caption:
        'AllGather 第 2 跳：把刚收到的完备分片再前传 1 跳（例如 R0 向 R1 发送 $c_0=6$）；此时每张卡只剩最后 1 个分片尚未更新。',
    },
    {
      label: '全局收敛',
      duration: 4600,
      state: {
        phase: 'AllReduce 收敛',
        subStep: '3 / 3',
        formulaTex: '$T_{\\text{Ring}} = 6\\alpha + 1.50S\\beta \\;\\;(\\text{75\\% 带宽利用率})$',
        beats: defaultBeats([
          '等待最后 1 跳广播',
          '补齐每卡第 4 块分片',
          '4 卡同时对齐 [6,8,6,8]',
          '核对 α 与 β 总开销',
        ]),
        prevShards: SHARDS_STEP_4,
        shards: SHARDS_STEP_5,
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
        'AllGather 第 3 跳收敛：4 张卡均得到完整的全局归约向量 $[6, 8, 6, 8]$；大消息下 Ring 带宽项 $2\\frac{P-1}{P}S\\beta = 1.5S\\beta$ 远低于 Tree 的 $2(\\log_2 P)S\\beta = 4S\\beta$，但延迟项 $6\\alpha$ 随卡数线性增长。',
    },
  ];
}

function buildRankSlots(rank: 0 | 1 | 2 | 3, s: RingCollectivesState, beat: number): SlotItem[] {
  const showUpdated = beat >= 2;
  const vals = showUpdated ? s.shards[rank] : s.prevShards[rank];
  const act = s.activeIdx[rank];
  const doneSet = new Set(s.doneIndices[rank]);
  const initVals = INIT_SHARDS[rank];

  return vals.map((v, idx) => {
    const isAct = showUpdated && act === idx;
    const isDone = showUpdated ? doneSet.has(idx) : false;
    const tone: AnyTone = isDone ? 'done' : isAct ? 'active' : 'neutral';
    const status = isAct ? 'active' : isDone ? 'selected' : 'normal';
    return {
      id: `r${rank}_c${idx}`,
      label: String(v),
      sub: `原${initVals[idx]}`,
      topTag: `$c_${idx}$`,
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
    <BeatExplainer
      steps={steps}
      title={title}
      label="Ring AllReduce 环形集合通信推演"
      wide
      stageMinHeight={478}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        const isGather = s.phase.startsWith('AllGather') || s.phase.includes('收敛');
        const arrowTone: AnyTone = isGather ? 'done' : 'active';
        const showArrows = beat >= 1;

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
              title={`顺时针环拓扑 $R_0 \\to R_1 \\to R_2 \\to R_3 \\to R_0$ · 当前: ${s.phase} (${s.subStep})`}
              tone="neutral"
              dashed
            />

            {/* Rank 0 (Top Left) */}
            <SectionBox
              x={28}
              y={42}
              w={228}
              h={100}
              title="Rank 0 (GPU/NPU 0)"
              tone={beat >= 2 && s.doneIndices[0].length === 4 ? 'done' : 'active'}
            />
            <SlotStrip
              x={40}
              y={84}
              slots={buildRankSlots(0, s, beat)}
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
              h={100}
              title="Rank 1 (GPU/NPU 1)"
              tone={beat >= 2 && s.doneIndices[1].length === 4 ? 'done' : 'active'}
            />
            <SlotStrip
              x={436}
              y={84}
              slots={buildRankSlots(1, s, beat)}
              slotW={46}
              slotH={44}
              gap={6}
              fontSize={12}
            />

            {/* Rank 3 (Bottom Left) */}
            <SectionBox
              x={28}
              y={192}
              w={228}
              h={100}
              title="Rank 3 (GPU/NPU 3)"
              tone={beat >= 2 && s.doneIndices[3].length === 4 ? 'done' : 'active'}
            />
            <SlotStrip
              x={40}
              y={234}
              slots={buildRankSlots(3, s, beat)}
              slotW={46}
              slotH={44}
              gap={6}
              fontSize={12}
            />

            {/* Rank 2 (Bottom Right) */}
            <SectionBox
              x={424}
              y={192}
              w={228}
              h={100}
              title="Rank 2 (GPU/NPU 2)"
              tone={beat >= 2 && s.doneIndices[2].length === 4 ? 'done' : 'active'}
            />
            <SlotStrip
              x={436}
              y={234}
              slots={buildRankSlots(2, s, beat)}
              slotW={46}
              slotH={44}
              gap={6}
              fontSize={12}
            />

            {/* Clockwise Ring DataFlowArrows */}
            <DataFlowArrow
              points={[
                [260, 92],
                [420, 92],
              ]}
              tone={arrowTone}
              active={showArrows}
              flow={showArrows}
              visible={showArrows}
              draw={showArrows}
              dotToken={showArrows ? dotToken : 0}
              label={s.transfers[0]}
              strokeWidth={2}
            />
            <DataFlowArrow
              points={[
                [538, 144],
                [538, 190],
              ]}
              tone={arrowTone}
              active={showArrows}
              flow={showArrows}
              visible={showArrows}
              draw={showArrows}
              dotToken={showArrows ? dotToken : 0}
              label={s.transfers[1]}
              strokeWidth={2}
            />
            <DataFlowArrow
              points={[
                [420, 242],
                [260, 242],
              ]}
              tone={arrowTone}
              active={showArrows}
              flow={showArrows}
              visible={showArrows}
              draw={showArrows}
              dotToken={showArrows ? dotToken : 0}
              label={s.transfers[2]}
              strokeWidth={2}
            />
            <DataFlowArrow
              points={[
                [142, 190],
                [142, 144],
              ]}
              tone={arrowTone}
              active={showArrows}
              flow={showArrows}
              visible={showArrows}
              draw={showArrows}
              dotToken={showArrows ? dotToken : 0}
              label={s.transfers[3]}
              strokeWidth={2}
            />

            <MetricRow
              x={12}
              y={318}
              w={STAGE_W - 24}
              h={50}
              revealed={beat >= 3}
              metrics={metrics}
            />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
