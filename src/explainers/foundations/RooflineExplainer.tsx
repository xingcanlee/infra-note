import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  LogRooflineChart,
  MetricRow,
  STAGE_W,
  SwimlaneTimeline,
  assertMaxHues,
  type AnyTone as Tone,
} from '@/explainers/kit';

export interface RooflineState {
  stepIndex: number;
  highlightMode: 'baseline' | 'decode1' | 'decode64' | 'prefill';
  points: {
    ai: number;
    perf: number;
    label: string;
    tone: Tone;
    active?: boolean;
  }[];
  cvLanes: {
    title: string;
    subtitle?: string;
    blocks: {
      start: number;
      dur: number;
      label: string;
      tone: Tone;
      active?: boolean;
      dashed?: boolean;
      kind?: 'op' | 'bubble' | 'error';
    }[];
  }[];
  syncEvents?: {
    fromLane: number;
    at: number;
    toLane: number;
    toAt?: number;
    label?: string;
    tone?: Tone;
    active?: boolean;
    dashed?: boolean;
  }[];
  totalTime: number;
  regimeLabel: string;
  aiValue: string;
  h800Perf: string;
  npuPerf: string;
}

export function buildRooflineSteps(): Step<RooflineState>[] {
  const tones: Tone[] = ['active', 'activation', 'highlight'];
  assertMaxHues(tones);

  const serialLanes = [
    {
      title: 'Cube Unit',
      subtitle: 'GEMM 矩阵乘',
      blocks: [
        { start: 0, dur: 9, label: 'Tile0 GEMM', tone: 'activation' as Tone },
        {
          start: 9,
          dur: 4.5,
          label: '空等 Vector',
          tone: 'neutral' as Tone,
          kind: 'bubble' as const,
          dashed: true,
        },
        { start: 13.5, dur: 9, label: 'Tile1 GEMM', tone: 'activation' as Tone },
        {
          start: 22.5,
          dur: 4.5,
          label: '空等 Vector',
          tone: 'neutral' as Tone,
          kind: 'bubble' as const,
          dashed: true,
        },
      ],
    },
    {
      title: 'Vector Unit',
      subtitle: 'Norm / SiLU',
      blocks: [
        {
          start: 0,
          dur: 9,
          label: '空等 Cube',
          tone: 'neutral' as Tone,
          kind: 'bubble' as const,
          dashed: true,
        },
        { start: 9, dur: 4.5, label: 'Tile0 Vec', tone: 'highlight' as Tone },
        {
          start: 13.5,
          dur: 9,
          label: '空等 Cube',
          tone: 'neutral' as Tone,
          kind: 'bubble' as const,
          dashed: true,
        },
        { start: 22.5, dur: 4.5, label: 'Tile1 Vec', tone: 'highlight' as Tone },
      ],
    },
  ];

  const overlapLanes = [
    {
      title: 'Cube Unit',
      subtitle: 'GEMM 连续打满',
      blocks: [
        { start: 0, dur: 9, label: 'Tile0 GEMM', tone: 'activation' as Tone, active: true },
        { start: 9, dur: 9, label: 'Tile1 GEMM', tone: 'activation' as Tone, active: true },
      ],
    },
    {
      title: 'Vector Unit',
      subtitle: '与下一块重叠',
      blocks: [
        { start: 0, dur: 9, label: 'Prefetch/上轮收尾', tone: 'neutral' as Tone, dashed: true },
        { start: 9, dur: 4.5, label: 'Tile0 Vec', tone: 'highlight' as Tone, active: true },
        {
          start: 13.5,
          dur: 4.5,
          label: '空隙掩盖',
          tone: 'neutral' as Tone,
          kind: 'bubble' as const,
          dashed: true,
        },
        { start: 18, dur: 4.5, label: 'Tile1 Vec', tone: 'highlight' as Tone, active: true },
      ],
    },
  ];

  return [
    {
      state: {
        stepIndex: 0,
        highlightMode: 'baseline',
        points: [
          { ai: 1.0, perf: 3.35, label: 'B=1 (H800)', tone: 'active' },
          { ai: 62.86, perf: 210.57, label: 'B=64 (H800)', tone: 'active' },
          { ai: 1893.85, perf: 990, label: 'S=4096 (H800)', tone: 'active' },
        ],
        cvLanes: serialLanes,
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
        totalTime: 27,
        regimeLabel: '双平台拐点 I*',
        aiValue: 'H800 295.5 | 910B 200',
        h800Perf: '990 TF / 3.35 TB/s',
        npuPerf: '320 TF / 1.60 TB/s',
      },
      caption:
        '对数 Roofline 由斜率（HBM 带宽 $BW_{\\text{HBM}}$）与水平天花板（峰值算力 $P_{\\text{peak}}$）交汇定义。H800 SXM5 拐点 $I^* = 990/3.35 \\approx 295.5\\;\\text{FLOP/B}$，昇腾示例剖面（$320\\;\\text{TFLOPS}, 1.6\\;\\text{TB/s}$）拐点为 $200.0\\;\\text{FLOP/B}$。',
    },
    {
      state: {
        stepIndex: 1,
        highlightMode: 'decode1',
        points: [
          {
            ai: 1.0,
            perf: 3.35,
            label: 'Decode B=1 (H800 3.35 TF)',
            tone: 'highlight',
            active: true,
          },
          { ai: 1.0, perf: 1.6, label: 'B=1 (910B 1.60 TF)', tone: 'activation', active: true },
        ],
        cvLanes: serialLanes,
        totalTime: 27,
        regimeLabel: 'Decode B=1 (访存墙)',
        aiValue: '1.00 FLOP/B',
        h800Perf: '3.35 TF (0.3% 峰值)',
        npuPerf: '1.60 TF (0.5% 峰值)',
      },
      caption:
        '单并发 Decode（$B=1$）每读 2 字节权重仅做 2 次乘加，$I \\approx 1.00\\;\\text{FLOP/B}$。无论 Tensor Core 还是 Cube 单元，算力利用率均不足 $0.5\\%$，超过 $99\\%$ 的时间卡在等 HBM 送数。',
    },
    {
      state: {
        stepIndex: 2,
        highlightMode: 'decode64',
        points: [
          { ai: 1.0, perf: 3.35, label: 'B=1', tone: 'neutral' },
          {
            ai: 62.86,
            perf: 210.57,
            label: 'Decode B=64 (H800 211 TF)',
            tone: 'highlight',
            active: true,
          },
          {
            ai: 62.86,
            perf: 100.57,
            label: 'B=64 (910B 101 TF)',
            tone: 'activation',
            active: true,
          },
        ],
        cvLanes: serialLanes,
        totalTime: 27,
        regimeLabel: 'Decode B=64 (仍受限于带宽)',
        aiValue: '62.86 FLOP/B',
        h800Perf: '210.6 TF (21.3% 峰值)',
        npuPerf: '100.6 TF (31.4% 峰值)',
      },
      caption:
        '把批大小提升到 $B=64$，同一份 $258\\;\\text{MiB}$ SwiGLU 权重被 64 个 token 摊分，算术强度涨至 $62.86\\;\\text{FLOP/B}$，但仍低于 $200$ 与 $295.5$ 两道拐点，依然处于带宽斜坡上（配合连续批处理或量化才能继续向右推）。',
    },
    {
      state: {
        stepIndex: 3,
        highlightMode: 'prefill',
        points: [
          { ai: 62.86, perf: 210.57, label: 'B=64', tone: 'neutral' },
          {
            ai: 1893.85,
            perf: 990,
            label: 'Prefill S=4096 (H800 990 TF)',
            tone: 'highlight',
            active: true,
          },
          {
            ai: 1893.85,
            perf: 320,
            label: 'S=4096 (910B 320 TF)',
            tone: 'activation',
            active: true,
          },
        ],
        cvLanes: overlapLanes,
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
        totalTime: 22.5,
        regimeLabel: 'Prefill S=4096 (算力墙+CV重叠)',
        aiValue: '1893.9 FLOP/B',
        h800Perf: '990.0 TF (100% 满载)',
        npuPerf: '320.0 TF (CV提速1.5x)',
      },
      caption:
        'Prefill（$S=4096$）算术强度达到 $1893.85\\;\\text{FLOP/B}$，跑满算力天花板。此时在昇腾 AI Core 上，用 CV 异步双流水把 Vector（Norm/SiLU）隐藏在下一块 Cube GEMM 背后，可将分块耗时从 $27\\;\\mu\\text{s}$ 压到 $\\max(t_c, t_v)$ 级（重叠区提速 $1.50\\times$）。',
    },
  ];
}

export default function RooflineExplainer({
  title = '图 2：H800 vs 昇腾 910B 对数 Roofline 与 Cube/Vector 流水重叠',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildRooflineSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="对数 Roofline 与硬件执行流水线交互">
      {(step) => {
        const s = step.state;
        return (
          <Stage width={STAGE_W} height={454} label="H800 与昇腾 910B 对数 Roofline 及 CV 重叠">
            <LogRooflineChart
              x={16}
              y={10}
              w={648}
              h={218}
              xRange={[0.5, 4096]}
              yRange={[1, 2048]}
              xTicks={[1, 4, 16, 64, 256, 1024, 4096]}
              yTicks={[1, 4, 16, 64, 256, 1024]}
              xAxisLabel="算术强度 I (FLOPs / Byte, 对数刻度)"
              yAxisLabel="TFLOPS"
              ceilings={[
                { bw: 3350, peak: 990, label: 'NVIDIA H800 (990 TF, 3.35 TB/s)', tone: 'active' },
                {
                  bw: 1600,
                  peak: 320,
                  label: '昇腾 910B 剖面 (320 TF, 1.60 TB/s)',
                  tone: 'activation',
                  dashed: true,
                },
              ]}
              ridgeMarkers={[
                { ai: 200, label: '910B I*=200', tone: 'activation' },
                { ai: 295.5, label: 'H800 I*=295.5', tone: 'active' },
              ]}
              points={s.points}
            />

            <SwimlaneTimeline
              x={16}
              y={246}
              w={648}
              totalTime={27}
              unit="us"
              ticks={[0, 9, 13.5, 18, 22.5, 27]}
              title={
                s.highlightMode === 'prefill'
                  ? '昇腾 Cube + Vector 异步 CV 重叠流水线'
                  : '昇腾 Cube + Vector 串行等待基线 (两块分块共 27 us)'
              }
              gutterW={124}
              laneH={30}
              laneGap={14}
              lanes={s.cvLanes}
              syncEvents={s.syncEvents}
            />

            <MetricRow
              x={16}
              y={394}
              w={648}
              h={42}
              metrics={[
                { label: '当前工况', value: s.regimeLabel, tone: 'highlight', active: true },
                { label: '算术强度', value: s.aiValue, tone: 'neutral' },
                { label: 'H800 上限', value: s.h800Perf, tone: 'active' },
                { label: '910B 剖面', value: s.npuPerf, tone: 'activation' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
