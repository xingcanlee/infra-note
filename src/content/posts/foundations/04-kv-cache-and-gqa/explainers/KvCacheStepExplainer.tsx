import { useMemo, useState } from 'react';
import { RichText, Stage, type Step } from 'astro-wisp/explainers';
import { BeatExplainer, LabSegmented } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow } from '@/explainers/kit/MetricRow';
import { SlotStrip, type SlotItem } from '@/explainers/kit/PointerBoard';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export type KvCacheMode = 'cache' | 'nocache';

export interface KvCacheStepState {
  stepIndex: number;
  t: number;
  formulaTex: string;
  matrixValues: (number | null)[][];
  matrixMasks: boolean[][];
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

function makeSlots(prefix: 'k' | 'v', filledCount: number, recomputeAll: boolean): SlotItem[] {
  const activeIdx = filledCount - 1;
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

function lowerTriangleSet(rows: number): ReadonlySet<string> {
  const s = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r; c++) s.add(`${r},${c}`);
  }
  return s;
}

export function buildKvCacheStepSteps(): Step<KvCacheStepState>[] {
  const tones: AnyTone[] = ['q', 'k', 'v'];
  assertMaxHues(tones);

  return [
    {
      label: 't=1 入槽',
      duration: 4600,
      state: {
        stepIndex: 0,
        t: 1,
        formulaTex: '$t=1:\\; \\text{Write}(k_1,v_1) \\to \\text{Slot }1,\\; 1\\text{ 次点积}$',
        matrixValues: makeValues(1),
        matrixMasks: makeMasks(1),
      },
      caption:
        '第 1 步（$t=1$）：生成首个 token，投影出 $Q_1, k_1, v_1 \\in \\mathbb{R}^{1 \\times d}$，将 $k_1, v_1$ 写入槽 1；注意力仅计算第 1 行 $1$ 次点积。切换上方无 Cache 模式可对照全前缀重算行为。',
    },
    {
      label: 't=2 复用',
      duration: 4600,
      state: {
        stepIndex: 1,
        t: 2,
        formulaTex:
          '$t=2:\\; \\text{Append }(k_2,v_2),\\; \\text{Reuse } K_1,\\; \\text{仅算第 2 行}$',
        matrixValues: makeValues(2),
        matrixMasks: makeMasks(2),
      },
      caption:
        '第 2 步（$t=2$）：启用 KV Cache 时仅计算 $Q_2, k_2, v_2$ 并追加到第 2 槽，历史槽 1 直接复用；若关闭缓存，则必须在第 2 步重算全部 $2$ 组键值并丢弃第 1 行输出。',
    },
    {
      label: 't=3 GEMV',
      duration: 4600,
      state: {
        stepIndex: 2,
        t: 3,
        formulaTex:
          '$t=3:\\; Q_3 K_{1:3}^\\top \\Rightarrow \\text{累计 }3\\text{ vs }6\\;(\\text{省 }50\\%)$',
        matrixValues: makeValues(3),
        matrixMasks: makeMasks(3),
      },
      caption:
        '第 3 步（$t=3$）：前两步历史行已定型，$Q_3 [1,d]$ 只需与 $K_{1:3} [3,d]$ 做单行 GEMV；累计 KV 投影次数降为无缓存的一半（$3$ vs $6$）。',
    },
    {
      label: 't=4 成链',
      duration: 4600,
      state: {
        stepIndex: 3,
        t: 4,
        formulaTex: '$t=4:\\; \\sum KV = 4\\text{ vs }10\\; (O(T^3) \\to O(T^2))$',
        matrixValues: makeValues(4),
        matrixMasks: makeMasks(4),
      },
      caption:
        '第 4 步（$t=4$）：追加 $k_4, v_4$ 后缓存扩至 $[4, d]$；4 步累计仅算 $4$ 次 KV 投影，而无缓存路径仅本步就要重算 $[4,d]$ 全三角 $10$ 格并丢弃前 3 行，复杂度由 $O(T^3)$ 降至 $O(T^2)$。',
    },
  ];
}

export default function KvCacheStepExplainer({
  title = '图 1：Decode 阶段 KV Cache 增量追加与免重算收益（$t=1\\dots 4$）',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildKvCacheStepSteps(), []);
  const [cacheMode, setCacheMode] = useState<KvCacheMode>('cache');

  return (
    <BeatExplainer
      title={title}
      label="Decode 阶段 KV Cache 增量追加交互推导"
      steps={steps}
      stageMinHeight={486}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={cacheMode}
    >
      {(step, { dotToken }) => {
        const s = step.state;
        const t = s.t;
        const isNoCache = cacheMode === 'nocache';
        const triCells = (t * (t + 1)) / 2;
        const savedPct =
          t === 1 ? '基线 (0%)' : `已省 ${(((triCells - t) / triCells) * 100).toFixed(1)}%`;

        const qTitle = isNoCache ? `$Q_{1:${t}}$` : `$Q_${t}$`;
        const qShape = isNoCache ? `$[${t}, d]$ 重算` : '$[1, d]$';
        const kvTitle = isNoCache ? `$K_{1:${t}}, V_{1:${t}}$` : `$k_${t}, v_${t}$`;
        const kvShape = isNoCache ? '全量重算' : `追加槽 ${t}`;
        const outTitle = isNoCache ? `$O_{1:${t}}$` : `$O_${t}$`;
        const outShape = isNoCache
          ? t > 1
            ? `$[${t}, d]$ 丢${t - 1}留1`
            : '$[1, d]$'
          : `$[1, d] \\cdot t=${t}$`;
        const outTone: AnyTone = isNoCache ? 'k' : 'v';

        const kSlots = makeSlots('k', t, isNoCache);
        const vSlots = makeSlots('v', t, isNoCache);
        const selectedCells = isNoCache ? lowerTriangleSet(t) : rowSet(t - 1);
        const softSelectedCells = isNoCache ? new Set<string>() : priorSet(t - 1);

        const qH = isNoCache ? 36 + (t - 1) * 5 : 42;
        const outH = isNoCache ? 44 + (t - 1) * 6 : 52;

        const focusRect = isNoCache
          ? {
              x: 266,
              y: 20,
              w: 254,
              h: 198,
              label: `全三角重算 ${triCells} 格`,
              tone: 'k' as AnyTone,
            }
          : t === 1
            ? { x: 16, y: 94, w: 224, h: 144, label: '写入 Slot 1', tone: 'k' as AnyTone }
            : t < 4
              ? { x: 266, y: 20, w: 254, h: 198, label: `仅算第 ${t} 行`, tone: 'q' as AnyTone }
              : { x: 544, y: 84, w: 120, h: 72, label: '$O_4\\;[1, d]$', tone: 'v' as AnyTone };

        const statusEq = isNoCache
          ? `$t=${t}:\\; \\text{无 Cache 本步算 } ${t}\\text{ KV},\\; \\text{累计 } ${triCells}\\text{ 次}$`
          : `$t=${t}:\\; \\text{Cache 本步仅算 } 1\\text{ KV},\\; \\text{累计 } ${t}\\text{ vs }${triCells}$`;

        return (
          <>
            <div className="wisp-lab__controls" style={{ marginBottom: '0.35rem' }}>
              <div className="wisp-lab__controls-main">
                <LabSegmented
                  ariaLabel="KV Cache 模式切换"
                  value={cacheMode}
                  onChange={setCacheMode}
                  options={[
                    { id: 'cache', label: '启用 KV Cache' },
                    { id: 'nocache', label: '无 Cache 全重算' },
                  ]}
                />
              </div>
              <div className="wisp-lab__eq">
                <RichText text={statusEq} />
              </div>
            </div>

            <Stage width={STAGE_W} height={336} label="Decode 阶段 KV Cache 增量追加与免重算收益">
              <TensorBlock
                x={22}
                y={24}
                w={100}
                h={qH}
                tone="q"
                name={qTitle}
                shape={qShape}
                labelMode="inside"
                active
              />
              <TensorBlock
                x={134}
                y={24}
                w={100}
                h={qH}
                tone="k"
                name={kvTitle}
                shape={kvShape}
                labelMode="inside"
                active
              />

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
                flow
                continuous
                draw
                dotToken={dotToken}
              />

              <DataFlowArrow
                points={[
                  [184, 24 + qH],
                  [184, 98],
                ]}
                tone="k"
                active
                flow
                continuous
                draw
                dotToken={dotToken}
              />

              <SlotStrip
                x={22}
                y={104}
                slots={kSlots}
                slotW={50}
                slotH={36}
                gap={4}
                title="$K$ Cache $[t, d]$"
              />

              <SlotStrip
                x={22}
                y={172}
                slots={vSlots}
                slotW={50}
                slotH={36}
                gap={4}
                title="$V$ Cache $[t, d]$"
              />

              <DataFlowArrow
                points={[
                  [236, 138],
                  [272, 138],
                ]}
                tone="k"
                active
                flow
                continuous
                draw
                dotToken={dotToken}
              />

              <HeatmapMatrix
                x={276}
                y={28}
                values={s.matrixValues}
                tone={isNoCache ? 'k' : 'q'}
                selectedTone={isNoCache ? 'k' : 'q'}
                cellW={46}
                cellH={32}
                gap={4}
                min={0}
                max={1}
                format={fmtProb}
                masks={s.matrixMasks}
                maskText="--"
                selected={selectedCells}
                softSelected={softSelectedCells}
                showSelected={true}
                rowLabels={ROW_LABELS}
                colLabels={COL_LABELS}
                rowLabelW={40}
                title={
                  isNoCache
                    ? `无 Cache 全三角重算 (${triCells} 格)`
                    : t === 1
                      ? '注意力权重矩阵 (单行增量)'
                      : `注意力权重矩阵 (复用 $k_{1:${t - 1}}$)`
                }
                showLegend={false}
                fontSize={11}
              />

              <DataFlowArrow
                points={[
                  [518, 120],
                  [548, 120],
                ]}
                tone={outTone}
                active
                flow
                continuous
                draw
                dotToken={dotToken}
              />

              <DataFlowArrow
                points={[
                  [126, 226],
                  [126, 246],
                  [604, 246],
                  [604, 94 + outH],
                ]}
                tone="v"
                active={!isNoCache}
                dashed={isNoCache}
                flow
                continuous
                draw
                dotToken={dotToken}
              />

              <TensorBlock
                x={552}
                y={94}
                w={104}
                h={outH}
                tone={outTone}
                name={outTitle}
                shape={outShape}
                labelMode="inside"
                active
              />

              <ActiveFocusFrame
                x={focusRect.x}
                y={focusRect.y}
                w={focusRect.w}
                h={focusRect.h}
                tone={focusRect.tone}
                label={focusRect.label}
                visible={true}
              />

              <MetricRow
                x={18}
                y={266}
                w={644}
                h={54}
                metrics={[
                  { label: '当前上下文', value: `$t = ${t}\\;(${t}/4)$`, tone: 'q' },
                  {
                    label: '本步核心计算',
                    value: isNoCache ? `${t} KV / ${triCells} 格` : `1 KV / ${t} 点积`,
                    tone: 'k',
                  },
                  {
                    label: '累计 KV 投影',
                    value: isNoCache ? `累计 ${triCells} 次` : `${t} vs 无Cache ${triCells}`,
                    tone: isNoCache ? 'k' : 'v',
                    active: true,
                  },
                  {
                    label: '免重算收益',
                    value: isNoCache ? '无缓存 (重算全前缀)' : savedPct,
                    tone: isNoCache ? 'neutral' : 'v',
                  },
                ]}
              />
            </Stage>
          </>
        );
      }}
    </BeatExplainer>
  );
}
