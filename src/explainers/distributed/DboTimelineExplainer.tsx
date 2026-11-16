import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  MetricRow,
  SectionBox,
  STAGE_W,
  SwimlaneTimeline,
  assertMaxHues,
  type AnyTone,
  type MetricItem,
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit';

export interface DboTimelineState {
  modeTag: string;
  lanes: TimelineLane[];
  syncEvents: TimelineSyncEvent[];
  playhead: number;
  endToEndMs: string;
  computeUtil: string;
  commBubble: string;
  hardwareNote: string;
}

export function buildDboTimelineSteps(): Step<DboTimelineState>[] {
  const tones: AnyTone[] = ['active', 'activation', 'highlight'];
  assertMaxHues(tones, 3);

  return [
    {
      state: {
        modeTag: '1. 串行单批基准 (Single-Batch Serial)',
        lanes: [
          {
            title: 'Compute 轨',
            subtitle: 'SM / AICore',
            blocks: [
              { start: 0.0, dur: 2.2, label: 'Attn (B=1024)', tone: 'active', active: true },
              { start: 2.2, dur: 2.15, label: '通信等待气泡 2.15ms', tone: 'mask', kind: 'bubble' },
              { start: 4.35, dur: 2.4, label: 'MoE Grouped GEMM', tone: 'active', active: true },
              {
                start: 6.75,
                dur: 1.75,
                label: '通信等待气泡 1.75ms',
                tone: 'mask',
                kind: 'bubble',
              },
            ],
          },
          {
            title: 'Comm 轨',
            subtitle: 'All2All NIC',
            blocks: [
              { start: 0.0, dur: 2.2, label: '链路空闲', tone: 'mask', kind: 'bubble' },
              { start: 2.2, dur: 2.0, label: 'Dispatch All2All', tone: 'highlight', active: true },
              { start: 4.35, dur: 2.4, label: '链路空闲', tone: 'mask', kind: 'bubble' },
              { start: 6.75, dur: 1.6, label: 'Combine All2All', tone: 'highlight', active: true },
            ],
          },
          {
            title: 'Sync / 辅助',
            subtitle: 'Host / Barrier',
            blocks: [
              { start: 2.05, dur: 0.15, label: 'Split', tone: 'neutral', dashed: true },
              { start: 4.2, dur: 0.15, label: 'Sync', tone: 'highlight', dashed: true },
              { start: 6.6, dur: 0.15, label: 'Prep', tone: 'neutral', dashed: true },
              { start: 8.35, dur: 0.15, label: 'Sync', tone: 'highlight', dashed: true },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 2.2, toLane: 1, toAt: 2.2, tone: 'highlight', active: true },
          { fromLane: 1, at: 4.35, toLane: 0, toAt: 4.35, tone: 'highlight', active: true },
          { fromLane: 0, at: 6.75, toLane: 1, toAt: 6.75, tone: 'highlight', active: true },
        ],
        playhead: 8.5,
        endToEndMs: '8.50 ms',
        computeUtil: '54.1% (4.60 ms)',
        commBubble: '45.9% (3.90 ms)',
        hardwareNote: '算力与网卡交替，互斥闲置',
      },
      caption:
        'Step 1（串行单批基准，$B=1024$）：在未切分微批时，Compute 与 Comm 轨严格互斥等待；计算共 $4.60\\text{ ms}$，但前后两次同步+All-to-All 插入了 $3.90\\text{ ms}$ 纯等待气泡（占比 $45.9\\%$）。',
    },
    {
      state: {
        modeTag: '2. 切分双微批 μB0 / μB1 错峰启动',
        lanes: [
          {
            title: 'Compute 轨',
            subtitle: 'SM / AICore',
            blocks: [
              { start: 0.0, dur: 1.1, label: 'μB0 Attn (512)', tone: 'active', active: true },
              { start: 1.1, dur: 1.1, label: 'μB1 Attn (512)', tone: 'activation', active: true },
            ],
          },
          {
            title: 'Comm 轨',
            subtitle: 'DeepEP / MC2',
            blocks: [
              { start: 0.0, dur: 1.15, label: '等待 μB0 Attn', tone: 'mask', kind: 'bubble' },
              {
                start: 1.15,
                dur: 1.0,
                label: 'μB0 Dispatch',
                tone: 'active',
                active: true,
                dashed: true,
              },
            ],
          },
          {
            title: 'Sync / 辅助',
            subtitle: 'Event Ping',
            blocks: [{ start: 1.1, dur: 0.05, label: 'Ev0', tone: 'highlight' }],
          },
        ],
        syncEvents: [
          {
            fromLane: 0,
            at: 1.1,
            toLane: 1,
            toAt: 1.15,
            label: 'μB0 就绪',
            tone: 'active',
            active: true,
          },
        ],
        playhead: 2.2,
        endToEndMs: '推进中 (2.20 ms)',
        computeUtil: '100% 前段无气泡',
        commBubble: 'μB0 通信完全掩盖',
        hardwareNote: 'μB1 Attn 填满 μB0 通信',
      },
      caption:
        'Step 2（切分双微批错峰起步）：将 $B=1024$ 对半拆分为 $\\mu B_0$ 与 $\\mu B_1$（各 $512$ token）；当 $\\mu B_0$ 完成 Attention 进入异步 Dispatch 时，Compute 轨零停顿直接运行 $\\mu B_1$ 的 Attention。',
    },
    {
      state: {
        modeTag: '3. GPU DeepEP IBGDA 乒乓掩盖稳态',
        lanes: [
          {
            title: 'Compute 轨',
            subtitle: 'SM / TMA',
            blocks: [
              { start: 0.0, dur: 1.1, label: 'μB0 Attn', tone: 'active' },
              { start: 1.1, dur: 1.1, label: 'μB1 Attn', tone: 'activation' },
              { start: 2.2, dur: 1.2, label: 'μB0 MoE', tone: 'active', active: true },
              { start: 3.4, dur: 1.2, label: 'μB1 MoE', tone: 'activation', active: true },
              { start: 4.6, dur: 0.8, label: '尾气泡', tone: 'mask', kind: 'bubble' },
            ],
          },
          {
            title: 'Comm 轨',
            subtitle: 'DeepEP IBGDA',
            blocks: [
              { start: 0.0, dur: 1.15, label: '起始等待', tone: 'mask', kind: 'bubble' },
              { start: 1.15, dur: 1.0, label: 'μB0 Disp', tone: 'active', active: true },
              { start: 2.2, dur: 1.0, label: 'μB1 Disp', tone: 'activation', active: true },
              { start: 3.45, dur: 0.75, label: 'μB0 Comb', tone: 'active' },
              { start: 4.65, dur: 0.75, label: 'μB1 Comb', tone: 'activation' },
            ],
          },
          {
            title: 'Sync / 辅助',
            subtitle: 'SM-Free Event',
            blocks: [
              { start: 1.1, dur: 0.05, label: 'E', tone: 'highlight' },
              { start: 2.15, dur: 0.05, label: 'E', tone: 'highlight' },
              { start: 3.4, dur: 0.05, label: 'E', tone: 'highlight' },
              { start: 4.6, dur: 0.05, label: 'E', tone: 'highlight' },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 2.15, toLane: 0, toAt: 2.2, tone: 'active', active: true },
          { fromLane: 1, at: 3.2, toLane: 0, toAt: 3.4, tone: 'activation', active: true },
          { fromLane: 0, at: 3.4, toLane: 1, toAt: 3.45, tone: 'active' },
          { fromLane: 0, at: 4.6, toLane: 1, toAt: 4.65, tone: 'activation' },
        ],
        playhead: 5.4,
        endToEndMs: '5.40 ms (1.57x 加速)',
        computeUtil: '85.2% (4.60 / 5.40)',
        commBubble: '14.8% (仅尾部 0.80 ms)',
        hardwareNote: 'IBGDA 绕过 SM/CPU，算力连贯',
      },
      caption:
        'Step 3（GPU DeepEP 双微批乒乓稳态）：DeepEP IBGDA 由 GPU Warp 直接写网卡队列而不占计算 SM；$\\mu B_1$ Dispatch 与 $\\mu B_0$ MoE 并发，$\\mu B_0$ Combine 与 $\\mu B_1$ MoE 并发，单层耗时从 $8.50\\text{ ms}$ 压至 $5.40\\text{ ms}$。',
    },
    {
      state: {
        modeTag: '4. 昇腾 MC2 dispatch_v2 / combine_v2 融合切片',
        lanes: [
          {
            title: 'AICore 轨',
            subtitle: 'Cube GMM',
            blocks: [
              { start: 0.0, dur: 1.1, label: 'μB0 Attn', tone: 'active' },
              { start: 1.1, dur: 1.1, label: 'μB1 Attn', tone: 'activation' },
              { start: 2.25, dur: 1.2, label: 'μB0 GMM', tone: 'active', active: true },
              { start: 3.45, dur: 1.2, label: 'μB1 GMM', tone: 'activation', active: true },
              { start: 4.65, dur: 0.85, label: '尾气泡', tone: 'mask', kind: 'bubble' },
            ],
          },
          {
            title: 'AIV + RDMA',
            subtitle: 'MC2 融合核',
            blocks: [
              { start: 0.0, dur: 1.15, label: '起始等待', tone: 'mask', kind: 'bubble' },
              { start: 1.15, dur: 1.05, label: 'μB0 Disp', tone: 'highlight', active: true },
              { start: 2.25, dur: 1.05, label: 'μB1 Disp', tone: 'activation', active: true },
              { start: 3.5, dur: 0.8, label: 'μB0 Comb', tone: 'highlight' },
              { start: 4.7, dur: 0.8, label: 'μB1 Comb', tone: 'activation' },
            ],
          },
          {
            title: 'UB / 硬件流控',
            subtitle: 'AIV -> AICore',
            blocks: [
              { start: 1.1, dur: 0.05, label: 'U', tone: 'highlight' },
              { start: 2.2, dur: 0.05, label: 'U', tone: 'highlight' },
              { start: 3.45, dur: 0.05, label: 'U', tone: 'highlight' },
              { start: 4.65, dur: 0.05, label: 'U', tone: 'highlight' },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 2.2,
            toLane: 0,
            toAt: 2.25,
            label: 'UB 直喂',
            tone: 'highlight',
            active: true,
          },
          { fromLane: 0, at: 3.45, toLane: 1, toAt: 3.5, tone: 'highlight' },
        ],
        playhead: 5.5,
        endToEndMs: '5.50 ms (1.55x 加速)',
        computeUtil: '83.6% (4.60 / 5.50)',
        commBubble: '16.4% (省外置量化核)',
        hardwareNote: 'MC2 v2 单核融合量化写窗',
      },
      caption:
        'Step 4（昇腾 MC2 通算融合切片）：昇腾通过 AIV 核内打包量化并触发 HCCS/UB-SDMA/RoCE 写窗，将原需多次 Host 调度的步骤收敛入 dispatch_v2 / combine_v2，同样实现双微批无气泡流水。',
    },
    {
      state: {
        modeTag: '5. 串行 vs DBO 省时总结 (严格毫秒对齐)',
        lanes: [
          {
            title: '串行基准',
            subtitle: '8.50 ms 参照',
            blocks: [
              { start: 0.0, dur: 2.2, label: 'Attn (2.20)', tone: 'neutral' },
              { start: 2.2, dur: 2.15, label: 'Disp 气泡', tone: 'mask', kind: 'bubble' },
              { start: 4.35, dur: 2.4, label: 'MoE (2.40)', tone: 'neutral' },
              { start: 6.75, dur: 1.75, label: 'Comb 气泡', tone: 'mask', kind: 'bubble' },
            ],
          },
          {
            title: 'DBO Compute',
            subtitle: '5.40 ms 达成',
            blocks: [
              { start: 0.0, dur: 1.1, label: 'μB0 A', tone: 'active' },
              { start: 1.1, dur: 1.1, label: 'μB1 A', tone: 'activation' },
              { start: 2.2, dur: 1.2, label: 'μB0 MoE', tone: 'active', active: true },
              { start: 3.4, dur: 1.2, label: 'μB1 MoE', tone: 'activation', active: true },
              {
                start: 5.4,
                dur: 3.1,
                label: '节省 3.10 ms (-36.5% 时延)',
                tone: 'highlight',
                dashed: true,
              },
            ],
          },
          {
            title: 'DBO Comm',
            subtitle: '硬件并发掩盖',
            blocks: [
              { start: 1.15, dur: 1.0, label: 'μB0 Disp', tone: 'active' },
              { start: 2.2, dur: 1.0, label: 'μB1 Disp', tone: 'activation' },
              { start: 3.45, dur: 0.75, label: 'μB0 C', tone: 'active' },
              { start: 4.65, dur: 0.75, label: 'μB1 C', tone: 'activation' },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 5.4,
            toLane: 0,
            toAt: 8.5,
            tone: 'highlight',
            active: true,
            dashed: true,
          },
        ],
        playhead: 5.4,
        endToEndMs: '8.50 -> 5.40 ms',
        computeUtil: '54.1% -> 85.2%',
        commBubble: '3.90 -> 0.80 ms',
        hardwareNote: '小批 Decode 需降 α 启动开销',
      },
      caption:
        'Step 5（总结对照）：严格按毫秒比例映射，Prefill 双微批乒乓成功消除了 $3.10\\text{ ms}$ 等效通信气泡（总时长缩减 $36.5\\%$，算力利用率从 $54.1\\%$ 跃升至 $85.2\\%$）；而在 Decode 极小批阶段，能否继续受益取决于 IBGDA 与 MC2 对 $\\alpha$ 启动时延的削减幅度。',
    },
  ];
}

export default function DboTimelineExplainer({
  title = '图 3：双微批重叠（DBO / TBO）与 DeepEP / MC2 毫秒级流水线推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildDboTimelineSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="DBO 双微批通算重叠毫秒级推演" wide>
      {(step) => {
        const s = step.state;
        const metrics: MetricItem[] = [
          {
            label: '单层端到端耗时',
            value: s.endToEndMs,
            tone: 'active',
            active: true,
          },
          {
            label: '有效算力利用率',
            value: s.computeUtil,
            tone: 'activation',
          },
          {
            label: '残留通信气泡',
            value: s.commBubble,
            tone: 'highlight',
          },
          {
            label: '引擎关键机制',
            value: s.hardwareNote,
            tone: 'neutral',
          },
        ];

        return (
          <Stage width={STAGE_W} height={352} label="单批串行与双微批重叠毫秒级硬件时间轴">
            <SectionBox
              x={12}
              y={10}
              w={STAGE_W - 24}
              h={262}
              title={`Prefill (B=1024) 严格毫秒等比例泳道 · ${s.modeTag}`}
              tone="neutral"
              dashed
            />

            <SwimlaneTimeline
              x={20}
              y={42}
              w={STAGE_W - 40}
              totalTime={9.0}
              unit="ms"
              ticks={[0, 1.5, 3.0, 4.5, 6.0, 7.5, 9.0]}
              lanes={s.lanes}
              syncEvents={s.syncEvents}
              laneH={42}
              laneGap={14}
              gutterW={102}
              playhead={s.playhead}
              title="横轴宽度与真实 ms 严格成正比（每格 1.5 ms）"
            />

            <MetricRow x={12} y={290} w={STAGE_W - 24} h={50} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
