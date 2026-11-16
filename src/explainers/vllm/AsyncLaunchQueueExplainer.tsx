import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';

import {
  MetricRow,
  SectionBox,
  SlotStrip,
  STAGE_W,
  SwimlaneTimeline,
  assertMaxHues,
  type MetricItem,
  type SlotItem,
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit';

export interface AsyncLaunchQueueState {
  stepTag: string;
  queueDepth: number;
  deviceUtil: string;
  stepTimeMs: string;
  syncPoint: string;
  queueSlots: SlotItem[];
  lanes: TimelineLane[];
  syncEvents: TimelineSyncEvent[];
  playhead: number;
}

export function buildAsyncLaunchQueueSteps(): Step<AsyncLaunchQueueState>[] {
  const steps: Step<AsyncLaunchQueueState>[] = [
    {
      state: {
        stepTag: 'Sync Eager Baseline',
        queueDepth: 0,
        deviceUtil: '43%',
        stepTimeMs: '7.0 ms',
        syncPoint: 'op1..op5 步步同步',
        queueSlots: [
          { id: 'q-1', label: 'op1', sub: 'sync', tone: 'error', status: 'error' },
          { id: 'q-2', label: 'op2', sub: 'sync', tone: 'error', status: 'error' },
          { id: 'q-3', label: 'op3', sub: 'sync', tone: 'error', status: 'error' },
          { id: 'q-4', label: 'op4', sub: 'sync', tone: 'error', status: 'error' },
          { id: 'q-5', label: 'op5', sub: 'sync', tone: 'error', status: 'error' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: '0.8ms / op',
            blocks: [
              { start: 0.0, dur: 0.8, label: 'op1', tone: 'active', active: true },
              { start: 1.4, dur: 0.8, label: 'op2', tone: 'active', active: true },
              { start: 2.8, dur: 0.8, label: 'op3', tone: 'active', active: true },
              { start: 4.2, dur: 0.8, label: 'op4', tone: 'active', active: true },
              { start: 5.6, dur: 0.8, label: 'op5', tone: 'active', active: true },
            ],
          },
          {
            title: 'Device Stream',
            subtitle: '0.6ms / op',
            blocks: [
              { start: 0.0, dur: 0.8, label: 'idle', tone: 'mask', kind: 'bubble' },
              { start: 0.8, dur: 0.6, label: 'op1', tone: 'done', active: true },
              { start: 1.4, dur: 0.8, label: 'idle', tone: 'mask', kind: 'bubble' },
              { start: 2.2, dur: 0.6, label: 'op2', tone: 'done', active: true },
              { start: 2.8, dur: 0.8, label: 'idle', tone: 'mask', kind: 'bubble' },
              { start: 3.6, dur: 0.6, label: 'op3', tone: 'done', active: true },
              { start: 4.2, dur: 0.8, label: 'idle', tone: 'mask', kind: 'bubble' },
              { start: 5.0, dur: 0.6, label: 'op4', tone: 'done', active: true },
              { start: 5.6, dur: 0.8, label: 'idle', tone: 'mask', kind: 'bubble' },
              { start: 6.4, dur: 0.6, label: 'op5', tone: 'done', active: true },
            ],
          },
          {
            title: 'Copy / Sched',
            subtitle: 'Blocked',
            blocks: [
              {
                start: 0.0,
                dur: 7.0,
                label: 'Host 等待每个算子返回',
                tone: 'mask',
                kind: 'bubble',
              },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 1.4, toLane: 0, tone: 'error' },
          { fromLane: 1, at: 2.8, toLane: 0, tone: 'error' },
          { fromLane: 1, at: 4.2, toLane: 0, tone: 'error' },
          { fromLane: 1, at: 5.6, toLane: 0, tone: 'error' },
        ],
        playhead: 7.0,
      },
      caption:
        '第 1 步（同步基线）：若 Host 每发射一个算子都等待设备返回，Python 启动开销（0.8 ms）与内核执行（0.6 ms）串行累加，设备气泡高达 57%。',
      focus: ['op1', 'op5'],
    },
    {
      state: {
        stepTag: 'Async FIFO',
        queueDepth: 3,
        deviceUtil: '84%',
        stepTimeMs: '3.8 ms',
        syncPoint: 'None (FIFO 攒批)',
        queueSlots: [
          { id: 'q-1', label: 'op1', sub: 'done', tone: 'done', status: 'selected' },
          { id: 'q-2', label: 'op2', sub: 'exec', tone: 'done', status: 'active' },
          { id: 'q-3', label: 'op3', sub: 'queued', tone: 'active', status: 'active' },
          { id: 'q-4', label: 'op4', sub: 'queued', tone: 'active', status: 'active' },
          { id: 'q-5', label: 'op5', sub: 'launch', tone: 'active', status: 'normal' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: 'Run-Ahead',
            blocks: [
              { start: 0.0, dur: 0.8, label: 'op1', tone: 'active', active: true },
              { start: 0.8, dur: 0.8, label: 'op2', tone: 'active', active: true },
              { start: 1.6, dur: 0.8, label: 'op3', tone: 'active', active: true },
              { start: 2.4, dur: 0.8, label: 'op4', tone: 'active', active: true },
              { start: 3.2, dur: 0.8, label: 'op5', tone: 'active', active: true },
            ],
          },
          {
            title: 'Device Stream',
            subtitle: 'Continuous',
            blocks: [
              { start: 0.0, dur: 0.8, label: 'init', tone: 'mask', kind: 'bubble' },
              { start: 0.8, dur: 0.6, label: 'op1', tone: 'done', active: true },
              { start: 1.4, dur: 0.6, label: 'op2', tone: 'done', active: true },
              { start: 2.0, dur: 0.6, label: 'op3', tone: 'done', active: true },
              { start: 2.6, dur: 0.6, label: 'op4', tone: 'done', active: true },
              { start: 3.2, dur: 0.6, label: 'op5', tone: 'done', active: true },
            ],
          },
          {
            title: 'Copy / Sched',
            subtitle: 'FIFO Build-Ahead',
            blocks: [
              {
                start: 0.8,
                dur: 2.4,
                label: 'FIFO 队列积累 op2..op5 (无阻塞)',
                tone: 'active',
                dashed: true,
              },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 0.8, toLane: 1, label: 'op1', tone: 'active', active: true },
        ],
        playhead: 3.2,
      },
      caption:
        '第 2 步（异步发射队列）：Host 连续入队 op1..op5 不做返回等待，Launch FIFO 始终保留领先队列，掩盖设备后续算子的启动延迟。',
      focus: ['op3', 'op4'],
    },
    {
      state: {
        stepTag: 'op5 .item() Drain',
        queueDepth: 0,
        deviceUtil: '52%',
        stepTimeMs: '5.8 ms',
        syncPoint: 'op5 .item() / .cpu()',
        queueSlots: [
          { id: 'q-1', label: 'op1', sub: 'flushed', tone: 'done', status: 'normal' },
          { id: 'q-2', label: 'op2', sub: 'flushed', tone: 'done', status: 'normal' },
          { id: 'q-3', label: 'op3', sub: 'flushed', tone: 'done', status: 'normal' },
          { id: 'q-4', label: 'op4', sub: 'flushed', tone: 'done', status: 'normal' },
          { id: 'q-5', label: 'op5', sub: '.item()!', tone: 'error', status: 'error' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: 'Sync Drain',
            blocks: [
              { start: 0.0, dur: 0.8, label: 'op1', tone: 'active' },
              { start: 0.8, dur: 0.8, label: 'op2', tone: 'active' },
              { start: 1.6, dur: 0.8, label: 'op3', tone: 'active' },
              { start: 2.4, dur: 0.8, label: 'op4', tone: 'active' },
              { start: 3.2, dur: 0.8, label: 'op5', tone: 'active' },
              {
                start: 4.0,
                dur: 1.9,
                label: 'op5 .item() 阻塞排空',
                tone: 'error',
                kind: 'error',
                active: true,
              },
            ],
          },
          {
            title: 'Device Stream',
            subtitle: 'Drains at op5',
            blocks: [
              { start: 0.0, dur: 0.8, label: 'init', tone: 'mask', kind: 'bubble' },
              { start: 0.8, dur: 0.8, label: 'op1', tone: 'done' },
              { start: 1.6, dur: 0.8, label: 'op2', tone: 'done' },
              { start: 2.4, dur: 0.8, label: 'op3', tone: 'done' },
              { start: 3.2, dur: 0.8, label: 'op4', tone: 'done' },
              { start: 4.0, dur: 0.8, label: 'op5', tone: 'done', active: true },
              { start: 4.8, dur: 1.4, label: '队列空洞 bubble', tone: 'error', kind: 'error' },
            ],
          },
          {
            title: 'Copy / Sched',
            subtitle: 'Stalled',
            blocks: [
              {
                start: 4.0,
                dur: 1.9,
                label: 'FIFO 归零，下轮停摆',
                tone: 'error',
                kind: 'error',
              },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 4.8,
            toLane: 0,
            toAt: 5.8,
            label: 'sync',
            tone: 'error',
            active: true,
          },
        ],
        playhead: 4.8,
      },
      caption:
        '第 3 步（op5 致命同步）：只要在 op5 后调用一次 .item() 或 .cpu()，Host 必须等 op1..op5 全部排空才醒来，FIFO 库存瞬间归零并露出启动墙气泡。',
      focus: ['op5'],
    },
    {
      state: {
        stepTag: 'vLLM AsyncOutput',
        queueDepth: 4,
        deviceUtil: '91%',
        stepTimeMs: '3.6 ms',
        syncPoint: 'copy_event (延迟同步)',
        queueSlots: [
          { id: 'q-1', label: 'op1..4', sub: 'Graph', tone: 'done', status: 'selected' },
          { id: 'q-2', label: 'op5', sub: 'Sample', tone: 'done', status: 'active' },
          { id: 'q-3', label: 'D2H', sub: 'copy_st', tone: 'done', status: 'active' },
          { id: 'q-4', label: 'Sched', sub: 'Step+1', tone: 'active', status: 'active' },
          { id: 'q-5', label: 'Wait', sub: 'later', tone: 'active', status: 'normal' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: 'Step N -> N+1',
            blocks: [
              {
                start: 0.0,
                dur: 1.8,
                label: '发射 Step N',
                tone: 'active',
                active: true,
              },
              {
                start: 1.8,
                dur: 1.9,
                label: '准备 Step N+1 (零同步)',
                tone: 'active',
                active: true,
              },
              { start: 3.7, dur: 1.5, label: '发射 Step N+1', tone: 'active', active: true },
              { start: 5.3, dur: 1.4, label: 'wait_output', tone: 'active', active: true },
            ],
          },
          {
            title: 'Device Stream',
            subtitle: 'Compute',
            blocks: [
              { start: 0.4, dur: 3.4, label: 'Step N 执行 (op1..op5)', tone: 'done', active: true },
              { start: 3.8, dur: 2.8, label: 'Step N+1 无缝续接', tone: 'done', active: true },
            ],
          },
          {
            title: 'Copy / Sched',
            subtitle: 'copy_stream',
            blocks: [
              { start: 3.8, dur: 1.1, label: 'pinned D2H', tone: 'done', active: true },
              { start: 4.9, dur: 1.2, label: 'copy_event', tone: 'active', dashed: true },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 3.8, toLane: 2, label: 'done', tone: 'done', active: true },
          {
            fromLane: 2,
            at: 6.1,
            toLane: 0,
            toAt: 6.1,
            tone: 'active',
            dashed: true,
          },
        ],
        playhead: 4.9,
      },
      caption:
        '第 4 步（vLLM AsyncOutput）：GPUModelRunner 在独立 copy_stream 上将采样结果拷贝至锁页内存并记录 copy_event，让 Step $N+1$ 的 CPU 调度与 GPU 执行完全重叠。',
      focus: ['copy_stream', 'copy_event'],
    },
    {
      state: {
        stepTag: 'Ascend TaskQueue',
        queueDepth: 5,
        deviceUtil: '92%',
        stepTimeMs: '3.5 ms',
        syncPoint: 'aclrtSynchronizeEvent',
        queueSlots: [
          { id: 'q-1', label: 'ACL 1', sub: 'Graph', tone: 'done', status: 'selected' },
          { id: 'q-2', label: 'ACL 2', sub: 'Sample', tone: 'done', status: 'active' },
          { id: 'q-3', label: 'H2D/D2H', sub: 'copy_st', tone: 'done', status: 'active' },
          { id: 'q-4', label: 'TaskQ', sub: 'CANN', tone: 'active', status: 'active' },
          { id: 'q-5', label: 'N+1', sub: 'Overlap', tone: 'active', status: 'active' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: 'NPUModelRunner',
            blocks: [
              { start: 0.0, dur: 1.8, label: '下发 Step N Task', tone: 'active', active: true },
              {
                start: 1.8,
                dur: 1.9,
                label: '筹备 N+1 + AsyncOutput',
                tone: 'active',
                active: true,
              },
              {
                start: 3.7,
                dur: 1.5,
                label: '下发 Step N+1',
                tone: 'active',
                active: true,
              },
              {
                start: 5.3,
                dur: 1.4,
                label: 'aclrtSyncEvent',
                tone: 'active',
                active: true,
              },
            ],
          },
          {
            title: 'Device Stream',
            subtitle: 'AICore + TaskQ',
            blocks: [
              {
                start: 0.5,
                dur: 3.2,
                label: 'AICore 连续流水 (Step N)',
                tone: 'done',
                active: true,
              },
              {
                start: 3.7,
                dur: 3.0,
                label: 'AICore 连续流水 (Step N+1)',
                tone: 'done',
                active: true,
              },
            ],
          },
          {
            title: 'Copy / Sched',
            subtitle: 'CANN Event',
            blocks: [
              { start: 3.7, dur: 1.2, label: 'pinned D2H', tone: 'done', active: true },
              { start: 4.9, dur: 1.3, label: 'NPU Event', tone: 'active', dashed: true },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 3.7, toLane: 2, label: 'record', tone: 'done', active: true },
          {
            fromLane: 2,
            at: 6.2,
            toLane: 0,
            toAt: 6.2,
            tone: 'active',
            dashed: true,
          },
        ],
        playhead: 4.9,
      },
      caption:
        '第 5 步（昇腾 NPU CANN TaskQueue）：vllm-ascend 的 NPUModelRunner 通过异步任务队列与 AscendAsyncOutput 推迟主线程等待，同样把 AICore 利用率维持在 90% 以上。',
      focus: ['TaskQueue'],
    },
  ];

  const allTones = steps.flatMap((s) => [
    ...s.state.queueSlots.map((q) => q.tone ?? 'neutral'),
    ...s.state.lanes.flatMap((l) => l.blocks.map((b) => b.tone)),
  ]);
  assertMaxHues(allTones, 3);
  return steps;
}

export default function AsyncLaunchQueueExplainer({
  title = '图 1：CPU-Device 启动墙、Async FIFO 与 .item() 同步清空推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildAsyncLaunchQueueSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="异步发射队列与同步排空交互推演" wide>
      {(step) => {
        const s = step.state;
        const metrics: MetricItem[] = [
          {
            label: 'Launch FIFO 深度',
            value: `${s.queueDepth} ops`,
            tone: s.queueDepth === 0 ? 'error' : 'active',
            active: true,
          },
          {
            label: 'Device 利用率',
            value: s.deviceUtil,
            tone: s.queueDepth === 0 ? 'error' : 'done',
            active: true,
          },
          {
            label: '本步端到端耗时',
            value: s.stepTimeMs,
            tone: s.queueDepth === 0 ? 'error' : 'done',
          },
          {
            label: '同步触发点',
            value: s.syncPoint,
            tone:
              s.syncPoint.includes('.item()') || s.syncPoint.includes('步步') ? 'error' : 'active',
          },
        ];

        return (
          <Stage width={STAGE_W} height={384} label="Host-Device 异步发射队列时间线">
            <SectionBox
              x={12}
              y={12}
              w={STAGE_W - 24}
              h={96}
              title={`FIFO Launch Queue 状态 · ${s.stepTag}`}
              tone={s.queueDepth === 0 ? 'error' : 'neutral'}
              dashed
            />
            <SlotStrip
              x={140}
              y={48}
              slots={s.queueSlots}
              slotW={76}
              slotH={42}
              gap={8}
              fontSize={11}
            />

            <SwimlaneTimeline
              x={16}
              y={122}
              w={STAGE_W - 32}
              totalTime={7.0}
              unit="ms"
              ticks={[0, 1, 2, 3, 4, 5, 6, 7]}
              lanes={s.lanes}
              syncEvents={s.syncEvents}
              laneH={34}
              laneGap={20}
              gutterW={118}
              playhead={s.playhead}
              title="Host Launch vs Device Stream 并发时间轴"
            />

            <MetricRow x={12} y={328} w={STAGE_W - 24} h={42} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
