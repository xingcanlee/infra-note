import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { BeatExplainer, defaultBeats, type BeatSpec } from '@/explainers/kit';
import LogRooflineChart from '@/explainers/kit/LogRooflineChart';
import { MetricRow } from '@/explainers/kit/MetricRow';
import SwimlaneTimeline from '@/explainers/kit/SwimlaneTimeline';
import { STAGE_W, assertMaxHues, type AnyTone as Tone } from '@/explainers/kit/motion';

export interface RooflineState {
  stepIndex: number;
  formulaTex: string;
  beats: BeatSpec[];
  highlightMode: 'baseline' | 'decode1' | 'decode64' | 'batch256' | 'prefill';
  points: {
    ai: number;
    perf: number;
    label: string;
    tone: Tone;
    active?: boolean;
  }[];
  cvLanes: {
    id: string;
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
      visible?: boolean;
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
    visible?: boolean;
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
      id: 'cube',
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
      id: 'vector',
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
      id: 'cube',
      title: 'Cube Unit',
      subtitle: 'GEMM 连续打满',
      blocks: [
        { start: 0, dur: 9, label: 'Tile0 GEMM', tone: 'activation' as Tone, active: true },
        { start: 9, dur: 9, label: 'Tile1 GEMM', tone: 'activation' as Tone, active: true },
      ],
    },
    {
      id: 'vector',
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

  const serialSync = [
    {
      fromLane: 0,
      at: 9,
      toLane: 1,
      toAt: 9,
      label: '串行等待',
      tone: 'neutral' as Tone,
      dashed: true,
    },
    { fromLane: 1, at: 13.5, toLane: 0, toAt: 13.5, tone: 'neutral' as Tone, dashed: true },
  ];

  return [
    {
      label: '硬件拐点',
      duration: 4600,
      state: {
        stepIndex: 0,
        formulaTex:
          '$I^*_{\\text{H800}} = \\frac{990}{3.35} \\approx 295.5,\\quad I^*_{\\text{NPU}} = \\frac{320}{1.60} = 200.0\\;\\text{FLOP/B}$',
        beats: defaultBeats([
          '描出双平台带宽与算力上限',
          '标定 I* = 200 / 295.5 拐点',
          '对照串行 CV 时序参照点',
          '汇总双平台硬件基准',
        ]),
        highlightMode: 'baseline',
        points: [
          { ai: 1.0, perf: 3.35, label: 'M=1 (H800)', tone: 'active' },
          { ai: 62.86, perf: 210.57, label: 'M=64 (H800)', tone: 'active' },
          { ai: 1893.85, perf: 990, label: 'M=4096 (H800)', tone: 'active' },
        ],
        cvLanes: serialLanes,
        syncEvents: serialSync,
        totalTime: 27,
        regimeLabel: '双平台拐点 $I^*$',
        aiValue: 'H800 $295.5$ · 昇腾 $200$',
        h800Perf: '$990\\;\\text{TF}$ / $3.35\\;\\text{TB/s}$',
        npuPerf: '$320\\;\\text{TF}$ / $1.60\\;\\text{TB/s}$',
      },
      caption:
        '对数 Roofline 由斜率（HBM 带宽 $BW_{\\text{HBM}}$）与水平天花板（峰值算力 $P_{\\text{peak}}$）交汇定义。H800 SXM5 拐点 $I^* = 990/3.35 \\approx 295.5\\;\\text{FLOP/B}$，昇腾示例剖面（$320\\;\\text{TFLOPS},\\; 1.60\\;\\text{TB/s}$）拐点为 $200.0\\;\\text{FLOP/B}$。',
    },
    {
      label: '单发访存墙',
      duration: 4600,
      state: {
        stepIndex: 1,
        formulaTex:
          '$M=1:\\; I = 1.00\\;\\text{FLOP/B} \\ll I^* \\;\\Longrightarrow\\; \\text{算力利用 } < 0.5\\%$',
        beats: defaultBeats([
          '绘制双硬件 Roofline 天花板',
          '对照临界算术强度拐点',
          '落点 M=1 于带宽斜坡极左端',
          '输出访存墙算力利用率',
        ]),
        highlightMode: 'decode1',
        points: [
          {
            ai: 1.0,
            perf: 3.35,
            label: 'Decode M=1 (H800 3.35 TF)',
            tone: 'highlight',
            active: true,
          },
          { ai: 1.0, perf: 1.6, label: 'M=1 (昇腾 1.60 TF)', tone: 'activation', active: true },
        ],
        cvLanes: serialLanes,
        syncEvents: serialSync,
        totalTime: 27,
        regimeLabel: 'Decode $M=1$ (访存墙)',
        aiValue: '$1.00\\;\\text{FLOP/B}$',
        h800Perf: '$3.35\\;\\text{TF}$ ($0.3\\%$)',
        npuPerf: '$1.60\\;\\text{TF}$ ($0.5\\%$)',
      },
      caption:
        '单并发 Decode（$M=1$）每搬运 $2\\;\\text{B}$ 权重仅做 $2$ 次乘加，算术强度 $I = 1.00\\;\\text{FLOP/B}$。无论 GPU Tensor Core 还是昇腾 Cube，算力利用率均不足 $0.5\\%$，超过 $99\\%$ 的时间卡在等 HBM 送数。',
    },
    {
      label: '中等批复用',
      duration: 4600,
      state: {
        stepIndex: 2,
        formulaTex: '$M=64:\\; I = 62.86,\\; \\text{沿斜坡上升 } 63\\times$',
        beats: defaultBeats([
          '固定双平台 Roofline 斜坡',
          '对照拐点左侧剩余空间',
          '迁移操作点至 M=64 中段',
          '对比双平台带宽斜坡利用率',
        ]),
        highlightMode: 'decode64',
        points: [
          { ai: 1.0, perf: 3.35, label: 'M=1', tone: 'neutral' },
          {
            ai: 62.86,
            perf: 210.57,
            label: 'Decode M=64 (H800 211 TF)',
            tone: 'highlight',
            active: true,
          },
          {
            ai: 62.86,
            perf: 100.57,
            label: 'M=64 (昇腾 101 TF)',
            tone: 'activation',
            active: true,
          },
        ],
        cvLanes: serialLanes,
        syncEvents: serialSync,
        totalTime: 27,
        regimeLabel: 'Decode $M=64$ (带宽斜坡)',
        aiValue: '$62.86\\;\\text{FLOP/B}$',
        h800Perf: '$210.6\\;\\text{TF}$ ($21.3\\%$)',
        npuPerf: '$100.6\\;\\text{TF}$ ($31.4\\%$)',
      },
      caption:
        '批大小扩大到 $M=64$，同一份 $258\\;\\text{MiB}$ SwiGLU 权重被 $64$ 个 token 摊分复用，算术强度沿斜坡升至 $I = 62.86\\;\\text{FLOP/B}$，但仍位于 $200.0$ 与 $295.5$ 两道硬件拐点左侧，尚未触达算力平台期。',
    },
    {
      label: '拐点分化',
      duration: 4600,
      state: {
        stepIndex: 3,
        formulaTex: '$200 < I_{256}=238.7 < 295.5 \\Rightarrow \\text{昇腾封顶，H800 斜坡}$',
        beats: defaultBeats([
          '描出双平台天花板轮廓',
          '锁定两条拐点分水岭',
          '落点 M=256 于双拐点之间',
          '凸显算力比差异引发分化',
        ]),
        highlightMode: 'batch256',
        points: [
          { ai: 62.86, perf: 210.57, label: 'M=64', tone: 'neutral' },
          {
            ai: 238.66,
            perf: 799.5,
            label: 'M=256 (H800 800 TF)',
            tone: 'highlight',
            active: true,
          },
          {
            ai: 238.66,
            perf: 320.0,
            label: 'M=256 (昇腾 320 TF)',
            tone: 'activation',
            active: true,
          },
        ],
        cvLanes: serialLanes,
        syncEvents: serialSync,
        totalTime: 27,
        regimeLabel: '大批 $M=256$ (拐点分化)',
        aiValue: '$238.7\\;\\text{FLOP/B}$',
        h800Perf: '$799.5\\;\\text{TF}$ ($80.8\\%$)',
        npuPerf: '$320.0\\;\\text{TF}$ (已封顶)',
      },
      caption:
        '推进到 $M=256$ 时，SwiGLU 算术强度达到 $I \\approx 238.66\\;\\text{FLOP/B}$，恰好落于双平台拐点之间：昇腾剖面已跨越 $I^* = 200$ 并率先封顶 $320\\;\\text{TF}$ 算力墙，而高算力比芯片 H800（$I^* \\approx 295.5$）仍在带宽斜坡上跑到 $799.5\\;\\text{TF}$。',
    },
    {
      label: '算力墙与 CV',
      duration: 4600,
      state: {
        stepIndex: 4,
        formulaTex:
          '$I = 1893.9 \\gg I^* \\Rightarrow \\text{双平台封顶},\\; \\text{CV } 27\\to 22.5\\mu\\text{s}$',
        beats: defaultBeats([
          '描出算力天花板稳态线',
          '双点并肩踏上水平算力墙',
          '启动异步 CV 重叠压掉等待',
          '收拢重叠提速 1.50× 结论',
        ]),
        highlightMode: 'prefill',
        points: [
          { ai: 238.66, perf: 799.5, label: 'M=256', tone: 'neutral' },
          {
            ai: 1893.85,
            perf: 990,
            label: 'Prefill M=4096 (H800 990 TF)',
            tone: 'highlight',
            active: true,
          },
          {
            ai: 1893.85,
            perf: 320,
            label: 'M=4096 (昇腾 320 TF)',
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
        regimeLabel: 'Prefill $M=4096$ (算力墙)',
        aiValue: '$1893.9\\;\\text{FLOP/B}$',
        h800Perf: '$990.0\\;\\text{TF}$ ($100\\%$)',
        npuPerf: '$320.0\\;\\text{TF}$ (CV $1.50\\times$)',
      },
      caption:
        '进入长序列 Prefill（$M=4096$），算术强度跃至 $1893.85\\;\\text{FLOP/B}$，双硬件均彻底进入水平算力天花板。此时昇腾用异步 CV 双流水把 Vector（Norm/SiLU）掩盖在下一块 Cube GEMM 背后，将总跨度压缩至 $22.5\\;\\mu\\text{s}$（重叠区提速 $1.50\\times$）。',
    },
  ];
}

export default function RooflineExplainer({
  title = '图 4：双硬件对数 Roofline 拐点、Decode/Prefill 状态迁移与 Cube/Vector 重叠',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildRooflineSteps(), []);

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label="对数 Roofline 曲线与 CV 流水重叠交互"
      stageMinHeight={562}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat }) => {
        const s = step.state;
        const beatSyncs = s.syncEvents?.map((ev) => ({ ...ev, visible: beat >= 2 }));
        const beatLanes = s.cvLanes.map((lane) => ({
          ...lane,
          blocks: lane.blocks.map((blk) => ({
            ...blk,
            visible: s.highlightMode === 'prefill' ? beat >= 2 || lane.id === 'cube' : true,
          })),
        }));

        return (
          <Stage width={STAGE_W} height={466} label="H800 与昇腾示例剖面对数 Roofline 及 CV 重叠">
            <LogRooflineChart
              x={16}
              y={10}
              w={648}
              h={228}
              xRange={[0.5, 4096]}
              yRange={[1, 2048]}
              xTicks={[1, 4, 16, 64, 256, 1024, 4096]}
              yTicks={[1, 4, 16, 64, 256, 1024]}
              xAxisLabel={'算术强度 $I$ ($\\text{FLOPs/Byte}$, 对数刻度)'}
              yAxisLabel="TFLOPS"
              drawCeilings={true}
              showRidges={beat >= 1}
              showActivePoints={beat >= 2}
              ceilings={[
                { bw: 3350, peak: 990, label: 'NVIDIA H800 (990 TF, 3.35 TB/s)', tone: 'active' },
                {
                  bw: 1600,
                  peak: 320,
                  label: '昇腾示例剖面 (320 TF, 1.60 TB/s)',
                  tone: 'activation',
                  dashed: true,
                },
              ]}
              ridgeMarkers={[
                { ai: 200, label: '昇腾 $I^*=200$', tone: 'activation', side: 'left' },
                { ai: 295.5, label: 'H800 $I^*=295.5$', tone: 'active', side: 'right' },
              ]}
              points={s.points}
            />

            <SwimlaneTimeline
              x={16}
              y={256}
              w={648}
              totalTime={27}
              unit="μs"
              ticks={[0, 9, 13.5, 18, 22.5, 27]}
              playhead={beat >= 2 ? s.totalTime : undefined}
              title={
                s.highlightMode === 'prefill'
                  ? '昇腾 Cube + Vector 异步 CV 重叠流水线（重叠区提速 $1.50\\times$）'
                  : '昇腾 Cube + Vector 串行等待基线（两块分块共 $27\\;\\mu\\text{s}$）'
              }
              gutterW={124}
              laneH={30}
              laneGap={14}
              lanes={beatLanes}
              syncEvents={beatSyncs}
            />

            <MetricRow
              x={16}
              y={404}
              w={648}
              h={44}
              revealed={beat >= 3}
              metrics={[
                { label: '当前工况', value: s.regimeLabel, tone: 'highlight', active: true },
                { label: '算术强度 $I$', value: s.aiValue, tone: 'neutral' },
                { label: 'H800 上限', value: s.h800Perf, tone: 'active' },
                { label: '昇腾剖面', value: s.npuPerf, tone: 'activation' },
              ]}
            />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
