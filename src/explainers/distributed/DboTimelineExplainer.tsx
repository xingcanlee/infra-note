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
        'Step 1（串行单批基准，$B=1024$）：在未切分微批时，Compute 与 Comm 轨按顺序串行等待；计算共 $4.60\\text{ ms}$，前后两次同步与 All-to-All 插入了 $3.90\\text{ ms}$ 纯等待气泡（占比 $45.9\\%$）。',
    },
    {
      state: {
        modeTag: '2. 切分双微批 μB0 / μB1 错峰启动',
        lanes: [
          {
            title: 'Compute 轨',
            subtitle: 'SM / TMA',
            blocks: [
              { start: 0.0, dur: 1.1, label: 'μB0 Attn (512)', tone: 'active', active: true },
              { start: 1.1, dur: 1.1, label: 'μB1 Attn (512)', tone: 'activation', active: true },
            ],
          },
          {
            title: 'Comm 轨',
            subtitle: 'DeepEP',
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
        'Step 2（切分双微批错峰起步）：将 $B=1024$ 对半拆分为 $\\mu B_0$ 与 $\\mu B_1$（各 $512$ 个 token）；当 $\\mu B_0$ 完成 Attention 进入异步 Dispatch 时，Compute 轨零停顿直接运行 $\\mu B_1$ 的 Attention。',
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
            subtitle: 'Event Sync',
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
        hardwareNote: 'IBGDA 绕过 CPU，双流交错',
      },
      caption:
        'Step 3（GPU DeepEP 双微批乒乓稳态）：DeepEP IBGDA 绕过主机调度直接驱动网卡队列；$\\mu B_1$ Dispatch 与 $\\mu B_0$ MoE 并发，$\\mu B_0$ Combine 与 $\\mu B_1$ MoE 并发，仿真单层耗时从 $8.50\\text{ ms}$ 压至 $5.40\\text{ ms}$。',
    },
    {
      state: {
        modeTag: '4. 昇腾单批 MC2 融合流水 + 共享专家辅助流',
        lanes: [
          {
            title: '主流 AICore',
            subtitle: 'Attn + GMM',
            blocks: [
              { start: 0.0, dur: 2.2, label: 'Attn+Router (B=1024)', tone: 'active', active: true },
              { start: 2.2, dur: 0.55, label: 'TopK', tone: 'highlight', dashed: true },
              {
                start: 2.75,
                dur: 2.4,
                label: 'GroupedMatmul (Slice 接力)',
                tone: 'active',
                active: true,
              },
              { start: 5.15, dur: 0.55, label: '汇合', tone: 'highlight', dashed: true },
            ],
          },
          {
            title: 'MC2 融合核',
            subtitle: 'disp/comb_v2',
            blocks: [
              { start: 0.0, dur: 2.2, label: '等待路由就绪', tone: 'mask', kind: 'bubble' },
              {
                start: 2.2,
                dur: 1.5,
                label: 'dispatch_v2 (Slice 流水)',
                tone: 'highlight',
                active: true,
              },
              { start: 3.7, dur: 0.5, label: '核内衔接', tone: 'mask', kind: 'bubble' },
              {
                start: 4.2,
                dur: 1.5,
                label: 'combine_v2 (Slice 归约)',
                tone: 'highlight',
                active: true,
              },
            ],
          },
          {
            title: '辅助计算流',
            subtitle: 'Shared Expert',
            blocks: [
              { start: 0.0, dur: 2.2, label: '等 router_ready', tone: 'mask', kind: 'bubble' },
              {
                start: 2.2,
                dur: 1.85,
                label: 'Shared Gate-Up + Down',
                tone: 'activation',
                active: true,
              },
              { start: 4.05, dur: 1.65, label: '就绪等待汇合', tone: 'mask', kind: 'bubble' },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 0,
            at: 2.2,
            toLane: 1,
            toAt: 2.2,
            label: 'Dispatch',
            tone: 'highlight',
            active: true,
          },
          { fromLane: 0, at: 2.2, toLane: 2, toAt: 2.2, tone: 'activation', active: true },
          {
            fromLane: 1,
            at: 3.3,
            toLane: 0,
            toAt: 3.3,
            label: 'Slice',
            tone: 'active',
            active: true,
          },
          { fromLane: 0, at: 4.5, toLane: 1, toAt: 4.5, label: 'Combine', tone: 'highlight' },
          { fromLane: 2, at: 4.05, toLane: 0, toAt: 5.4, tone: 'activation', dashed: true },
        ],
        playhead: 5.7,
        endToEndMs: '单批整块执行 (禁用 DBO)',
        computeUtil: '核内 Slice 通算接力',
        commBubble: 'Shared 流掩盖 Dispatch',
        hardwareNote: 'npu_moe_distribute_*_v2',
      },
      caption:
        'Step 4（昇腾单批 MC2 与共享专家并发）：vllm-ascend 显式禁用双微批 DBO，保持完整单批以避免 Cube 分块效率受损；主流经 npu_moe_distribute_dispatch_v2、GroupedMatmul 与 npu_moe_distribute_combine_v2 按 Slice 接力推进，同时辅助流并发执行 Shared Expert 填补 TopK 与 Dispatch 等待窗口。',
    },
    {
      state: {
        modeTag: '5. 串行 vs DBO 省时总结 (昇腾单批走 MC2)',
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
            title: 'GPU DBO',
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
            title: 'GPU Comm / NPU',
            subtitle: '并发掩盖对照',
            blocks: [
              { start: 1.15, dur: 1.0, label: 'μB0 Disp', tone: 'active' },
              { start: 2.2, dur: 1.0, label: 'μB1 Disp', tone: 'activation' },
              { start: 3.45, dur: 0.75, label: 'μB0 C', tone: 'active' },
              { start: 4.65, dur: 0.75, label: 'μB1 C', tone: 'activation' },
              {
                start: 5.6,
                dur: 3.4,
                label: '昇腾: 单批 MC2 (禁用 DBO)',
                tone: 'activation',
                dashed: true,
              },
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
        hardwareNote: 'GPU DBO 省 36.5%；NPU 单批 MC2',
      },
      caption:
        'Step 5（总结对照）：严格按毫秒比例映射，Prefill 双微批乒乓消除了 $3.10\\text{ ms}$ 通信气泡（总时长从 $8.50\\text{ ms}$ 降至 $5.40\\text{ ms}$，算力利用率由 $54.1\\%$ 升至 $85.2\\%$）；华为昇腾因当前 vllm-ascend 不支持双微批 DBO，保持单批执行并由 MC2 核内 Slice 流水与共享专家辅助流掩盖延迟，Decode 极小批则依赖 IBGDA 与 MC2 压低 $\\alpha$ 启动开销。',
    },
  ];
}

export default function DboTimelineExplainer({
  title = '图 3：双微批重叠（DBO）与昇腾 MC2 异步流毫秒级流水线推演',
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
              title={`Prefill (B=1024) 流水线泳道 · ${s.modeTag}`}
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
              title="横轴按仿真时间比例绘制（每格 1.5 ms）"
            />

            <MetricRow x={12} y={290} w={STAGE_W - 24} h={50} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
