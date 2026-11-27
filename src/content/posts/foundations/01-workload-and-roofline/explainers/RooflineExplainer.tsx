import { useMemo, useState } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { InteractiveExplainer, LabSegmented, LabSlider } from '@/explainers/kit';
import LogRooflineChart from '@/explainers/kit/LogRooflineChart';
import { MetricRow } from '@/explainers/kit/MetricRow';
import SwimlaneTimeline, {
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit/SwimlaneTimeline';
import {
  RADIUS_SM,
  STAGE_W,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
  useDiagramMotion,
} from '@/explainers/kit/motion';

const BATCH_STOPS = [1, 4, 16, 64, 128, 256, 512] as const;

const D_MODEL = 4096;
const D_FF = 11008;
const H800_BW = 3350; // GB/s (3.35 TB/s)
const H800_PEAK = 990; // TFLOPS
const NPU_BW = 1600; // GB/s (1.60 TB/s)
const NPU_PEAK = 320; // TFLOPS

const CHART_X = 16;
const CHART_Y = 10;
const CHART_W = 648;
const CHART_H = 228;
const X_RANGE: readonly [number, number] = [0.5, 1024];
const Y_RANGE: readonly [number, number] = [1, 2048];

export type CvScheduleMode = 'serial' | 'overlap';

export interface RooflineState {
  batch: number;
  cvMode: CvScheduleMode;
  ai: number;
  h800Perf: number;
  npuPerf: number;
  formulaTex: string;
}

function computeSwigluMetrics(batch: number): { ai: number; h800Perf: number; npuPerf: number } {
  const weightElems = 3 * D_MODEL * D_FF;
  const actElemsPerTok = 4 * D_MODEL + 2 * D_FF;
  const ai = (3 * batch * D_MODEL * D_FF) / (weightElems + batch * actElemsPerTok);
  const h800Perf = Math.min(H800_PEAK, (ai * H800_BW) / 1000);
  const npuPerf = Math.min(NPU_PEAK, (ai * NPU_BW) / 1000);
  return { ai, h800Perf, npuPerf };
}

function buildCvTimeline(cvMode: CvScheduleMode): {
  lanes: TimelineLane[];
  syncEvents: TimelineSyncEvent[];
  totalTime: number;
} {
  if (cvMode === 'serial') {
    return {
      totalTime: 27,
      lanes: [
        {
          id: 'cube',
          title: 'Cube Unit',
          subtitle: 'GEMM 矩阵乘',
          blocks: [
            { start: 0, dur: 9, label: 'Tile0 GEMM', tone: 'activation' },
            {
              start: 9,
              dur: 4.5,
              label: '空等 Vector',
              tone: 'neutral',
              kind: 'bubble',
              dashed: true,
            },
            { start: 13.5, dur: 9, label: 'Tile1 GEMM', tone: 'activation' },
            {
              start: 22.5,
              dur: 4.5,
              label: '空等 Vector',
              tone: 'neutral',
              kind: 'bubble',
              dashed: true,
            },
          ],
        },
        {
          id: 'vector',
          title: 'Vector Unit',
          subtitle: 'Norm / SiLU',
          blocks: [
            {
              start: 0,
              dur: 9,
              label: '空等 Cube',
              tone: 'neutral',
              kind: 'bubble',
              dashed: true,
            },
            { start: 9, dur: 4.5, label: 'Tile0 Vec', tone: 'highlight' },
            {
              start: 13.5,
              dur: 9,
              label: '空等 Cube',
              tone: 'neutral',
              kind: 'bubble',
              dashed: true,
            },
            { start: 22.5, dur: 4.5, label: 'Tile1 Vec', tone: 'highlight' },
          ],
        },
      ],
      syncEvents: [
        {
          fromLane: 0,
          at: 9,
          toLane: 1,
          toAt: 9,
          label: '串行等待',
          tone: 'neutral',
          dashed: true,
        },
        { fromLane: 1, at: 13.5, toLane: 0, toAt: 13.5, tone: 'neutral', dashed: true },
      ],
    };
  }

  return {
    totalTime: 22.5,
    lanes: [
      {
        id: 'cube',
        title: 'Cube Unit',
        subtitle: 'GEMM 连续打满',
        blocks: [
          { start: 0, dur: 9, label: 'Tile0 GEMM', tone: 'activation', active: true },
          {
            start: 9,
            dur: 0.01,
            label: '空等 Vector',
            tone: 'neutral',
            kind: 'bubble',
            visible: false,
          },
          { start: 9, dur: 9, label: 'Tile1 GEMM', tone: 'activation', active: true },
          {
            start: 18,
            dur: 0.01,
            label: '空等 Vector',
            tone: 'neutral',
            kind: 'bubble',
            visible: false,
          },
        ],
      },
      {
        id: 'vector',
        title: 'Vector Unit',
        subtitle: '与下一块重叠',
        blocks: [
          { start: 0, dur: 9, label: '空等 Cube', tone: 'neutral', dashed: true, visible: false },
          { start: 9, dur: 4.5, label: 'Tile0 Vec', tone: 'highlight', active: true },
          {
            start: 13.5,
            dur: 4.5,
            label: '空等 Cube',
            tone: 'neutral',
            kind: 'bubble',
            dashed: true,
          },
          { start: 18, dur: 4.5, label: 'Tile1 Vec', tone: 'highlight', active: true },
        ],
      },
    ],
    syncEvents: [
      {
        fromLane: 0,
        at: 9,
        toLane: 1,
        toAt: 9,
        label: 'CV 并行流水',
        tone: 'activation',
        active: true,
      },
    ],
  };
}

function buildStateFor(batch: number, cvMode: CvScheduleMode): RooflineState {
  const { ai, h800Perf, npuPerf } = computeSwigluMetrics(batch);
  const h800Pct = ((h800Perf / H800_PEAK) * 100).toFixed(1);
  const npuPct = ((npuPerf / NPU_PEAK) * 100).toFixed(1);
  const cvSuffix =
    cvMode === 'overlap' ? '\\;(\\text{CV 重叠 }1.50\\times)' : '\\;(\\text{CV 串行})';
  return {
    batch,
    cvMode,
    ai,
    h800Perf,
    npuPerf,
    formulaTex: `$M=${batch}:\\; I=${ai.toFixed(1)}\\;\\text{FLOP/B},\\; \\text{H800 }${h800Pct}\\%,\\; \\text{910B }${npuPct}\\%${cvSuffix}$`,
  };
}

export function buildRooflineSteps(): Step<RooflineState>[] {
  assertMaxHues(['active', 'activation', 'highlight']);
  return [
    {
      label: 'M=1 访存墙',
      duration: 4600,
      state: buildStateFor(1, 'serial'),
      caption:
        '单请求 Decode ($M=1$) 算术强度 $I=1.0\\;\\text{FLOP/B}$，双平台受限于 HBM 带宽斜坡。',
    },
    {
      label: 'M=64 斜坡攀升',
      duration: 4600,
      state: buildStateFor(64, 'serial'),
      caption: '批大小增至 $M=64$，权重被 64 个 token 摊分复用，$I=62.9\\;\\text{FLOP/B}$。',
    },
    {
      label: 'M=256 拐点分化',
      duration: 4600,
      state: buildStateFor(256, 'serial'),
      caption: '$M=256$ 时 $I=238.7$ 落于 $200$ 与 $295.5$ 之间，昇腾 910B 率先触达算力平台。',
    },
    {
      label: 'M=512 算力封顶',
      duration: 4600,
      state: buildStateFor(512, 'overlap'),
      caption:
        '$M=512$ 时双平台全部跨越拐点进入算力平台，启用异步 CV 流水将总跨度压至 $22.5\\;\\mu\\text{s}$。',
    },
  ];
}

export default function RooflineExplainer({
  title = '图 4：双硬件对数 Roofline 拐点、Decode/Prefill 状态迁移与 Cube/Vector 重叠',
}: {
  title?: string;
}) {
  assertMaxHues(['active', 'activation', 'highlight']);
  const { stepTransition } = useDiagramMotion();
  const [batchIdx, setBatchIdx] = useState(0);
  const [cvMode, setCvMode] = useState<CvScheduleMode>('serial');

  const batch = BATCH_STOPS[batchIdx] ?? 1;
  const { ai, h800Perf, npuPerf } = useMemo(() => computeSwigluMetrics(batch), [batch]);
  const timeline = useMemo(() => buildCvTimeline(cvMode), [cvMode]);

  const h800Bound = ai < 295.5 ? '带宽斜坡' : '算力平台';
  const npuBound = ai < 200.0 ? '带宽斜坡' : '算力平台';
  const regimeLabel =
    ai < 200
      ? `双侧带宽墙 ($M=${batch}$)`
      : ai < 295.5
        ? `拐点分化 ($M=${batch}$)`
        : `双侧算力墙 ($M=${batch}$)`;

  const formulaTex = `$M=${batch}:\\; I=${ai.toFixed(1)}\\;\\text{FLOP/B}\\;\\Longrightarrow\\;\\text{H800 }${h800Perf.toFixed(1)}\\text{ TF},\\;\\text{910B }${npuPerf.toFixed(1)}\\text{ TF}$`;

  const caption =
    ai < 200
      ? `当前并发 $M=${batch}$，SwiGLU 权重被 ${batch} 个 token 复用，算术强度 $I=${ai.toFixed(2)}\\;\\text{FLOP/B}$ 仍位于两道硬件拐点左侧，H800（${((h800Perf / H800_PEAK) * 100).toFixed(1)}%）与昇腾 910B 剖面（${((npuPerf / NPU_PEAK) * 100).toFixed(1)}%）均受限于 HBM 带宽；${cvMode === 'overlap' ? 'CV 流水重叠将两块执行跨度由 $27.0\\;\\mu\\text{s}$ 压至 $22.5\\;\\mu\\text{s}$。' : '当前为 CV 串行基线（$27.0\\;\\mu\\text{s}$），可切换流水重叠消除空等气泡。'}`
      : ai < 295.5
        ? `当前并发 $M=${batch}$，算术强度 $I=${ai.toFixed(2)}\\;\\text{FLOP/B}$ 落入 $200.0$ 与 $295.5$ 两道拐点之间：昇腾 910B 剖面率先跨过 $I^*=200$ 封顶 $320\\;\\text{TF}$，H800 仍在带宽斜坡运行于 ${h800Perf.toFixed(1)}\\;\\text{TF}$。`
        : `当前并发 $M=${batch}$，算术强度 $I=${ai.toFixed(2)}\\;\\text{FLOP/B}$ 超过双平台拐点，H800（$990\\;\\text{TF}$）与昇腾 910B 剖面（$320\\;\\text{TF}$）均稳定进入水平算力平台；${cvMode === 'overlap' ? '异步 CV 双流水把 Vector 归约掩盖在下一块 Cube GEMM 后，重叠区提速 $1.50\\times$。' : '建议切换到流水重叠观察 Cube 与 Vector 如何并行消除气泡。'}`;

  // 与 LogRooflineChart 完全一致的对数坐标映射，驱动工作点平滑滑行
  const plotLeft = CHART_X + 46;
  const plotTop = CHART_Y + 14;
  const plotW = CHART_W - 62;
  const plotH = CHART_H - 50;
  const lx0 = Math.log10(X_RANGE[0]);
  const lx1 = Math.log10(X_RANGE[1]);
  const ly0 = Math.log10(Y_RANGE[0]);
  const ly1 = Math.log10(Y_RANGE[1]);
  const toPx = (v: number) =>
    plotLeft + ((Math.log10(Math.max(X_RANGE[0], v)) - lx0) / (lx1 - lx0)) * plotW;
  const toPy = (v: number) =>
    plotTop +
    plotH -
    ((Math.log10(Math.max(Y_RANGE[0], Math.min(Y_RANGE[1], v))) - ly0) / (ly1 - ly0)) * plotH;

  const curX = toPx(ai);
  const h800Y = toPy(h800Perf);
  const npuY = toPy(npuPerf);
  const labelRightSide = curX < plotLeft + plotW - 130;

  return (
    <InteractiveExplainer
      title={title}
      label="对数 Roofline 曲线与 CV 流水重叠交互"
      stageMinHeight={520}
      formula={formulaTex}
      caption={caption}
      onReset={() => {
        setBatchIdx(0);
        setCvMode('serial');
      }}
      controls={
        <>
          <LabSlider
            label="并发规模 M"
            min={0}
            max={BATCH_STOPS.length - 1}
            step={1}
            value={batchIdx}
            valueText={`M = ${batch}`}
            onChange={setBatchIdx}
          />
          <LabSegmented
            ariaLabel="昇腾 Cube/Vector 调度模式"
            value={cvMode}
            onChange={setCvMode}
            options={[
              { id: 'serial', label: 'Cube/Vector 串行' },
              { id: 'overlap', label: '流水重叠' },
            ]}
          />
        </>
      }
    >
      <Stage width={STAGE_W} height={466} label="H800 与昇腾 910B 剖面对数 Roofline 及 CV 重叠">
        <LogRooflineChart
          x={CHART_X}
          y={CHART_Y}
          w={CHART_W}
          h={CHART_H}
          xRange={X_RANGE}
          yRange={Y_RANGE}
          xTicks={[1, 4, 16, 64, 256, 1024]}
          yTicks={[1, 4, 16, 64, 256, 1024]}
          xAxisLabel={'算术强度 $I$ ($\\text{FLOP/Byte}$, 对数刻度)'}
          yAxisLabel="TFLOPS"
          drawCeilings={false}
          showRidges={true}
          showActivePoints={true}
          ceilings={[
            {
              bw: H800_BW,
              peak: H800_PEAK,
              label: 'NVIDIA H800 (990 TF, 3.35 TB/s)',
              tone: 'active',
            },
            {
              bw: NPU_BW,
              peak: NPU_PEAK,
              label: '昇腾 910B 剖面 (320 TF, 1.60 TB/s)',
              tone: 'activation',
              dashed: true,
            },
          ]}
          ridgeMarkers={[
            { ai: 200, label: '昇腾 $I^*=200$', tone: 'activation', side: 'left' },
            { ai: 295.5, label: 'H800 $I^*=295.5$', tone: 'active', side: 'right' },
          ]}
          points={[]}
        />

        {/* 当前 AI 垂线与双硬件平滑滑行工作点 */}
        <motion.line
          initial={false}
          animate={{ x1: curX, x2: curX }}
          transition={stepTransition}
          y1={plotTop + 4}
          y2={plotTop + plotH}
          stroke="var(--wisp-sem-highlight)"
          strokeWidth={1.25}
          strokeDasharray="3 3"
          strokeOpacity={0.75}
        />

        <motion.g initial={false} animate={{ x: curX, y: h800Y }} transition={stepTransition}>
          <circle
            cx={0}
            cy={0}
            r={6}
            fill={resolveToneFill('active')}
            stroke={resolveToneStroke('active')}
            strokeWidth={2}
          />
          <rect
            x={labelRightSide ? 10 : -118}
            y={-10}
            width={108}
            height={18}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
            fillOpacity={0.94}
            stroke={resolveToneStroke('active')}
            strokeWidth={1}
          />
          <text
            x={labelRightSide ? 16 : -112}
            y={-1}
            dominantBaseline="central"
            style={{
              fill: resolveToneStroke('active'),
              fontFamily: 'var(--wisp-font-mono)',
              fontSize: 10.5,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {`H800 ${h800Perf.toFixed(1)} TF`}
          </text>
        </motion.g>

        <motion.g initial={false} animate={{ x: curX, y: npuY }} transition={stepTransition}>
          <circle
            cx={0}
            cy={0}
            r={6}
            fill={resolveToneFill('activation')}
            stroke={resolveToneStroke('activation')}
            strokeWidth={2}
          />
          <rect
            x={labelRightSide ? 10 : -118}
            y={Math.abs(h800Y - npuY) < 22 ? 10 : -9}
            width={108}
            height={18}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
            fillOpacity={0.94}
            stroke={resolveToneStroke('activation')}
            strokeWidth={1}
          />
          <text
            x={labelRightSide ? 16 : -112}
            y={Math.abs(h800Y - npuY) < 22 ? 19 : 0}
            dominantBaseline="central"
            style={{
              fill: resolveToneStroke('activation'),
              fontFamily: 'var(--wisp-font-mono)',
              fontSize: 10.5,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {`910B ${npuPerf.toFixed(1)} TF`}
          </text>
        </motion.g>

        <SwimlaneTimeline
          x={16}
          y={256}
          w={648}
          totalTime={27}
          unit="μs"
          ticks={[0, 9, 13.5, 18, 22.5, 27]}
          playhead={timeline.totalTime}
          title={
            cvMode === 'overlap'
              ? '昇腾 Cube + Vector 异步 CV 重叠流水线（重叠区提速 $1.50\\times$，跨度 $22.5\\;\\mu\\text{s}$）'
              : '昇腾 Cube + Vector 串行等待基线（两块分块共 $27.0\\;\\mu\\text{s}$）'
          }
          gutterW={124}
          laneH={30}
          laneGap={14}
          lanes={timeline.lanes}
          syncEvents={timeline.syncEvents}
        />

        <MetricRow
          x={16}
          y={404}
          w={648}
          h={44}
          metrics={[
            { label: '当前工况', value: regimeLabel, tone: 'highlight', active: true },
            {
              label: '算术强度 $I$',
              value: `$${ai.toFixed(2)}\\;\\text{FLOP/B}$`,
              tone: 'neutral',
            },
            {
              label: `H800 (${h800Bound})`,
              value: `$${h800Perf.toFixed(1)}\\;\\text{TF}$ ($${((h800Perf / H800_PEAK) * 100).toFixed(1)}\\%$)`,
              tone: 'active',
            },
            {
              label: `910B (${npuBound})`,
              value: `$${npuPerf.toFixed(1)}\\;\\text{TF}$ (${cvMode === 'overlap' ? 'CV $1.50\\times$' : '串行'})`,
              tone: 'activation',
            },
          ]}
        />
      </Stage>
    </InteractiveExplainer>
  );
}
