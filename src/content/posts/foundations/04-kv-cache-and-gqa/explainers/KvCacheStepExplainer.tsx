import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { BeatExplainer, defaultBeats, type BeatSpec } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow } from '@/explainers/kit/MetricRow';
import { SlotStrip, type SlotItem } from '@/explainers/kit/PointerBoard';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface KvCacheStepState {
  stepIndex: number;
  formulaTex: string;
  beats: BeatSpec[];
  qTitle: string;
  qShape: string;
  kvTitle: string;
  kvShape: string;
  outTitle: string;
  outShape: string;
  outTone: AnyTone;
  kSlots: SlotItem[];
  vSlots: SlotItem[];
  matrixTitle: string;
  matrixTone: AnyTone;
  selectedTone: AnyTone;
  matrixValues: (number | null)[][];
  matrixMasks: boolean[][];
  selectedCells: ReadonlySet<string>;
  softSelectedCells: ReadonlySet<string>;
  seqLenText: string;
  stepWorkText: string;
  cumKvProjText: string;
  savingText: string;
  focusRect: { x: number; y: number; w: number; h: number; label: string; tone: AnyTone };
}

const ROW_LABELS = ['$t=1$', '$t=2$', '$t=3$', '$t=4$'];
const COL_LABELS = ['$k_1$', '$k_2$', '$k_3$', '$k_4$'];

const PROBS_ROWS: (number | null)[][] = [
  [1.0, null, null, null],
  [0.5, 0.5, null, null],
  [0.274, 0.452, 0.274, null],
  [0.311, 0.189, 0.189, 0.311],
];

function fmtProb(v: number): string {
  return v.toFixed(2);
}

function makeSlots(
  prefix: 'k' | 'v',
  filledCount: number,
  activeIdx: number,
  recomputeAll: boolean,
): SlotItem[] {
  return [0, 1, 2, 3].map((idx) => {
    const texLbl = `$${prefix}_${idx + 1}$`;
    if (idx >= filledCount) {
      return {
        id: `${prefix}-${idx}`,
        label: texLbl,
        sub: '空槽',
        status: 'empty',
      };
    }
    if (recomputeAll) {
      return {
        id: `${prefix}-${idx}`,
        label: texLbl,
        sub: '重算',
        tone: 'k',
        status: 'active',
      };
    }
    if (idx === activeIdx) {
      return {
        id: `${prefix}-${idx}`,
        label: texLbl,
        sub: '追加',
        tone: prefix,
        status: 'selected',
      };
    }
    return {
      id: `${prefix}-${idx}`,
      label: texLbl,
      sub: '命中',
      tone: 'visited',
      status: 'normal',
    };
  });
}

function makeMasks(visibleRows: number): boolean[][] {
  return [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => r >= visibleRows || c > r));
}

function makeValues(visibleRows: number): (number | null)[][] {
  return [0, 1, 2, 3].map((r) =>
    [0, 1, 2, 3].map((c) => (r < visibleRows && c <= r ? PROBS_ROWS[r][c] : null)),
  );
}

function rowSet(r: number): ReadonlySet<string> {
  const s = new Set<string>();
  for (let c = 0; c <= r; c++) s.add(`${r},${c}`);
  return s;
}

function priorSet(upToRow: number): ReadonlySet<string> {
  const s = new Set<string>();
  for (let r = 0; r < upToRow; r++) {
    for (let c = 0; c <= r; c++) s.add(`${r},${c}`);
  }
  return s;
}

function allLowerSet(): ReadonlySet<string> {
  const s = new Set<string>();
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c <= r; c++) s.add(`${r},${c}`);
  }
  return s;
}

export function buildKvCacheStepSteps(): Step<KvCacheStepState>[] {
  const tones: AnyTone[] = ['q', 'k', 'v'];
  assertMaxHues(tones);

  return [
    {
      label: '第 1 步入槽',
      duration: 4600,
      state: {
        stepIndex: 0,
        formulaTex: '$t=1:\\; \\text{Write}(k_1,v_1) \\to \\text{Slot }1,\\; 1\\text{ 次点积}$',
        beats: defaultBeats([
          '投影首个 Q1 与 k1, v1',
          '向下写入 KV 槽 1 并喂入矩阵',
          '聚合写出 O1 [1,d] 并框定槽 1',
          '记录基线步零节省基准',
        ]),
        qTitle: '$Q_1$',
        qShape: '$[1, d]$',
        kvTitle: '$k_1, v_1$',
        kvShape: '写入槽 1',
        outTitle: '$O_1$',
        outShape: '$[1, d] \\cdot t=1$',
        outTone: 'v',
        kSlots: makeSlots('k', 1, 0, false),
        vSlots: makeSlots('v', 1, 0, false),
        matrixTitle: '注意力权重矩阵 (单行增量)',
        matrixTone: 'q',
        selectedTone: 'q',
        matrixValues: makeValues(1),
        matrixMasks: makeMasks(1),
        selectedCells: rowSet(0),
        softSelectedCells: new Set(),
        seqLenText: '$t = 1\\;(1/4)$',
        stepWorkText: '1 KV / 1 点积',
        cumKvProjText: '1 vs 无Cache 1',
        savingText: '基线步 (0%)',
        focusRect: { x: 16, y: 94, w: 224, h: 144, label: '写入 Slot 1', tone: 'k' },
      },
      caption:
        '第 1 步（$t=1$）：生成单个新 token，投影出 $Q_1, k_1, v_1 \\in \\mathbb{R}^{1 \\times d}$，将 $k_1, v_1$ 写入 KV Cache 第 1 槽位；注意力仅计算第 1 行 $1$ 次点积。',
    },
    {
      label: '第 2 步复用',
      duration: 4600,
      state: {
        stepIndex: 1,
        formulaTex:
          '$t=2:\\; \\text{Append }(k_2,v_2),\\; \\text{Reuse } K_{1},\\; \\text{仅算第 2 行}$',
        beats: defaultBeats([
          '仅投影当前步 Q2 与 k2, v2',
          '追加槽 2 并复用历史槽 1',
          '仅点亮第 2 行算出 O2',
          '核算累计节省 33.3%',
        ]),
        qTitle: '$Q_2$',
        qShape: '$[1, d]$',
        kvTitle: '$k_2, v_2$',
        kvShape: '追加槽 2',
        outTitle: '$O_2$',
        outShape: '$[1, d] \\cdot t=2$',
        outTone: 'v',
        kSlots: makeSlots('k', 2, 1, false),
        vSlots: makeSlots('v', 2, 1, false),
        matrixTitle: '注意力权重矩阵 (复用 $k_1$)',
        matrixTone: 'q',
        selectedTone: 'q',
        matrixValues: makeValues(2),
        matrixMasks: makeMasks(2),
        selectedCells: rowSet(1),
        softSelectedCells: priorSet(1),
        seqLenText: '$t = 2\\;(2/4)$',
        stepWorkText: '1 KV / 2 点积',
        cumKvProjText: '2 vs 无Cache 3',
        savingText: '已省 33.3% KV',
        focusRect: { x: 266, y: 20, w: 254, h: 198, label: '仅算第 2 行', tone: 'q' },
      },
      caption:
        '第 2 步（$t=2$）：仅对新 token 计算 $Q_2, k_2, v_2$ 并追加到第 2 槽位；第 1 槽位 $k_1, v_1$ 直接复用不重算，注意力只需读取 $K_{1:2}$ 计算第 2 行（$2$ 次点积）。',
    },
    {
      label: '第 3 步 GEMV',
      duration: 4600,
      state: {
        stepIndex: 2,
        formulaTex: '$t=3:\\; Q_3 K_{1:3}^\\top \\Rightarrow 3\\text{ vs }6\\; (\\text{省 }50\\%)$',
        beats: defaultBeats([
          '投影单步 Q3 与 k3, v3',
          '追加槽 3 并读出 K_{1:3} 全向量',
          '框出第 3 行 GEMV 产出 O3',
          '确认投影量减半 (50%)',
        ]),
        qTitle: '$Q_3$',
        qShape: '$[1, d]$',
        kvTitle: '$k_3, v_3$',
        kvShape: '追加槽 3',
        outTitle: '$O_3$',
        outShape: '$[1, d] \\cdot t=3$',
        outTone: 'v',
        kSlots: makeSlots('k', 3, 2, false),
        vSlots: makeSlots('v', 3, 2, false),
        matrixTitle: '注意力权重矩阵 (复用 $k_{1:2}$)',
        matrixTone: 'q',
        selectedTone: 'q',
        matrixValues: makeValues(3),
        matrixMasks: makeMasks(3),
        selectedCells: rowSet(2),
        softSelectedCells: priorSet(2),
        seqLenText: '$t = 3\\;(3/4)$',
        stepWorkText: '1 KV / 3 点积',
        cumKvProjText: '3 vs 无Cache 6',
        savingText: '已省 50.0% KV',
        focusRect: { x: 266, y: 20, w: 254, h: 198, label: '仅算第 3 行', tone: 'q' },
      },
      caption:
        '第 3 步（$t=3$）：前 2 步的历史行已定型且无需再输出，$Q_3 [1, d]$ 与扩展后的 $K_{1:3} [3, d]$ 做 GEMV（General Matrix-Vector Multiply，矩阵向量乘），累计 KV 投影次数降为无缓存的一半（$3$ vs $6$）。',
    },
    {
      label: '第 4 步成链',
      duration: 4600,
      state: {
        stepIndex: 3,
        formulaTex: '$t=4:\\; \\sum KV = 4\\text{ vs }10\\; (O(T^3) \\to O(T^2))$',
        beats: defaultBeats([
          '输入 Q4 与末位增量 k4, v4',
          '落盘槽 4 并聚焦单行第 4 行',
          '写出单步特征 O4 [1,d]',
          '统计节省 60% KV 计算',
        ]),
        qTitle: '$Q_4$',
        qShape: '$[1, d]$',
        kvTitle: '$k_4, v_4$',
        kvShape: '追加槽 4',
        outTitle: '$O_4$',
        outShape: '$[1, d] \\cdot t=4$',
        outTone: 'v',
        kSlots: makeSlots('k', 4, 3, false),
        vSlots: makeSlots('v', 4, 3, false),
        matrixTitle: '注意力权重矩阵 (复用 $k_{1:3}$)',
        matrixTone: 'q',
        selectedTone: 'q',
        matrixValues: makeValues(4),
        matrixMasks: makeMasks(4),
        selectedCells: rowSet(3),
        softSelectedCells: priorSet(3),
        seqLenText: '$t = 4\\;(4/4)$',
        stepWorkText: '1 KV / 4 点积',
        cumKvProjText: '4 vs 无Cache 10',
        savingText: '已省 60.0% KV',
        focusRect: { x: 544, y: 84, w: 120, h: 72, label: '$O_4\\;[1, d]$', tone: 'v' },
      },
      caption:
        '第 4 步（$t=4$）：新写入 $k_4, v_4$ 后缓存增至 $[4, d]$；4 步累计仅执行 $4$ 次 token KV 投影和 $10$ 次点积，而计算复杂度随序列总长 $T$ 从无缓存的 $O(T^3)$ 降至 $O(T^2)$。',
    },
    {
      label: '无缓存对照',
      duration: 4600,
      state: {
        stepIndex: 4,
        formulaTex: '$\\text{No Cache}:\\; \\text{重算 } [4,d]\\; Q/K/V\\text{ 与 }10\\text{ 格}$',
        beats: defaultBeats([
          '退回全量 Q_{1:4} 与 K/V_{1:4}',
          '全部 4 个槽位被迫红色重算',
          '下三角 10 格满算且前 3 行丢弃',
          '量化长序列 S=2048 差距',
        ]),
        qTitle: '$Q_{1:4}$',
        qShape: '$[4, d]$ 重算',
        kvTitle: '$K_{1:4}, V_{1:4}$',
        kvShape: '全量重算',
        outTitle: '$O_{1:4}$',
        outShape: '$[4, d]$ 丢3留1',
        outTone: 'k',
        kSlots: makeSlots('k', 4, 3, true),
        vSlots: makeSlots('v', 4, 3, true),
        matrixTitle: '无 Cache 单步重算 (10 格)',
        matrixTone: 'k',
        selectedTone: 'k',
        matrixValues: makeValues(4),
        matrixMasks: makeMasks(4),
        selectedCells: allLowerSet(),
        softSelectedCells: new Set(),
        seqLenText: '$T = 4$ 累计对照',
        stepWorkText: '单步 4 KV / 10 格',
        cumKvProjText: '4 vs 10 (省 $2.5\\times$)',
        savingText: '$S=2048$ 省 $1024\\times$',
        focusRect: { x: 266, y: 20, w: 254, h: 198, label: '单步重算下三角', tone: 'k' },
      },
      caption:
        '若关闭 KV Cache，仅在 $t=4$ 这一步就必须重算全部 $[4, d]$ 的 $Q/K/V$ 与下三角 $10$ 格（前 3 行算完即丢弃）。开启缓存大幅节省计算量，同时将 Decode 推向读取 $K_{1:t}, V_{1:t}$ 的 HBM 带宽瓶颈。',
    },
  ];
}

export default function KvCacheStepExplainer({
  title = '图 1：Decode 阶段 KV Cache 增量追加与免重算收益（$t=1\\dots 4$）',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildKvCacheStepSteps(), []);

  return (
    <BeatExplainer
      title={title}
      label="Decode 阶段 KV Cache 增量追加交互推导"
      steps={steps}
      stageMinHeight={448}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        const slotRevCount = s.stepIndex < 4 && beat === 0 ? s.stepIndex : 4;

        return (
          <Stage width={STAGE_W} height={336} label="Decode 阶段 KV Cache 增量追加与免重算收益">
            <TensorBlock
              x={22}
              y={24}
              w={100}
              h={42}
              tone="q"
              name={s.qTitle}
              shape={s.qShape}
              labelMode="inside"
              active
            />
            <TensorBlock
              x={134}
              y={24}
              w={100}
              h={42}
              tone="k"
              name={s.kvTitle}
              shape={s.kvShape}
              labelMode="inside"
              active
            />

            {/* Top overhead Q_t -> HeatmapMatrix arrow */}
            <DataFlowArrow
              points={[
                [72, 24],
                [72, 10],
                [254, 10],
                [254, 76],
                [272, 76],
              ]}
              tone="q"
              active
              flow={beat >= 1}
              visible={beat >= 1}
              draw={beat >= 1}
              dotToken={beat >= 1 ? dotToken : 0}
            />

            {/* Downward k_t, v_t -> Cache append arrow */}
            <DataFlowArrow
              points={[
                [184, 66],
                [184, 98],
              ]}
              tone="k"
              active
              visible={beat >= 1}
              draw={beat >= 1}
              dotToken={beat >= 1 ? dotToken : 0}
            />

            <SlotStrip
              x={22}
              y={104}
              slots={s.kSlots}
              slotW={50}
              slotH={36}
              gap={4}
              revealedCount={slotRevCount}
              title="$K$ Cache $[t, d]$"
            />

            <SlotStrip
              x={22}
              y={172}
              slots={s.vSlots}
              slotW={50}
              slotH={36}
              gap={4}
              revealedCount={slotRevCount}
              title="$V$ Cache $[t, d]$"
            />

            <DataFlowArrow
              points={[
                [236, 138],
                [272, 138],
              ]}
              tone="k"
              active
              flow={beat >= 1}
              visible={beat >= 1}
              draw={beat >= 1}
              dotToken={beat >= 1 ? dotToken : 0}
            />

            <HeatmapMatrix
              x={276}
              y={28}
              values={s.matrixValues}
              tone={s.matrixTone}
              selectedTone={s.selectedTone}
              cellW={46}
              cellH={32}
              gap={4}
              min={0}
              max={1}
              format={fmtProb}
              masks={s.matrixMasks}
              maskText="--"
              selected={s.selectedCells}
              softSelected={s.softSelectedCells}
              showSelected={beat >= 1}
              dimmed={beat < 1}
              rowLabels={ROW_LABELS}
              colLabels={COL_LABELS}
              rowLabelW={40}
              title={s.matrixTitle}
              showLegend={false}
              fontSize={11}
            />

            <DataFlowArrow
              points={[
                [518, 120],
                [548, 120],
              ]}
              tone={s.outTone}
              active
              flow={beat >= 2}
              visible={beat >= 2}
              draw={beat >= 2}
              dotToken={beat >= 2 ? dotToken : 0}
            />

            <DataFlowArrow
              points={[
                [126, 226],
                [126, 246],
                [604, 246],
                [604, 150],
              ]}
              tone="v"
              active={s.stepIndex < 4}
              dashed={s.stepIndex === 4}
              flow={beat >= 2}
              visible={beat >= 2}
              draw={beat >= 2}
              dotToken={beat >= 2 ? dotToken : 0}
            />

            <TensorBlock
              x={552}
              y={94}
              w={104}
              h={52}
              tone={s.outTone}
              name={s.outTitle}
              shape={s.outShape}
              labelMode="inside"
              active
              visible={beat >= 2}
            />

            <ActiveFocusFrame
              x={s.focusRect.x}
              y={s.focusRect.y}
              w={s.focusRect.w}
              h={s.focusRect.h}
              tone={s.focusRect.tone}
              label={s.focusRect.label}
              visible={beat >= 2}
            />

            <MetricRow
              x={18}
              y={266}
              w={644}
              h={54}
              revealed={beat >= 3}
              metrics={[
                { label: '当前上下文', value: s.seqLenText, tone: 'q' },
                { label: '本步核心计算', value: s.stepWorkText, tone: 'k' },
                { label: '累计 KV 投影', value: s.cumKvProjText, tone: 'v', active: true },
                { label: '免重算收益', value: s.savingText, tone: 'v' },
              ]}
            />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
