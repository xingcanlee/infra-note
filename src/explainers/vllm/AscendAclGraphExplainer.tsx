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

export interface AscendAclGraphState {
  stepTag: string;
  requestSize: string;
  bucketSize: string;
  streamCost: string;
  updatePath: string;
  buckets: SlotItem[];
  lanes: TimelineLane[];
  syncEvents: TimelineSyncEvent[];
  playhead: number;
}

export function buildAscendAclGraphSteps(): Step<AscendAclGraphState>[] {
  const steps: Step<AscendAclGraphState>[] = [
    {
      state: {
        stepTag: '1. 稀疏分桶 [32, 48, 64]',
        requestSize: '[17, 33, 45, 58]',
        bucketSize: '桶 [32, 48, 64]',
        streamCost: '未超 207008 配额',
        updatePath: 'Capture Init',
        buckets: [
          {
            id: 'b-32',
            label: 'Bucket 32',
            sub: '接 17 tok',
            topTag: 'CAP',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'b-48',
            label: 'Bucket 48',
            sub: '接 33, 45',
            topTag: 'CAP',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'b-64',
            label: 'Bucket 64',
            sub: '接 58 tok',
            topTag: 'CAP',
            tone: 'active',
            status: 'active',
          },
        ],
        lanes: [
          {
            title: 'Main Stream',
            subtitle: 'aclmdlRI Cap',
            blocks: [
              { start: 0.0, dur: 1.2, label: 'Cap B=32', tone: 'active', active: true },
              { start: 1.3, dur: 1.2, label: 'Cap B=48', tone: 'active', active: true },
              { start: 2.6, dur: 1.2, label: 'Cap B=64', tone: 'active', active: true },
            ],
          },
          {
            title: 'update_stream',
            subtitle: 'Idle',
            blocks: [
              { start: 0.0, dur: 3.8, label: '准备图参数索引', tone: 'mask', kind: 'bubble' },
            ],
          },
          {
            title: 'ExternalEvent',
            subtitle: 'Handle Map',
            blocks: [
              {
                start: 0.0,
                dur: 3.8,
                label: '按分桶建 UpdatableGraph',
                tone: 'done',
                dashed: true,
              },
            ],
          },
        ],
        syncEvents: [],
        playhead: 3.8,
      },
      caption:
        '第 1 步（昇腾稀疏分桶）：受限于 NPU 流资源上限（防 207008 报错），将负载点 [17, 33, 45, 58] 向上归并到 [32, 48, 64] 三个静态 ACLGraph 桶。',
      focus: ['b-32', 'b-48', 'b-64'],
    },
    {
      state: {
        stepTag: '2. register_task 绑定',
        requestSize: 'Capture B=48',
        bucketSize: 'Bucket 48',
        streamCost: '记录 TaskGroup Handle',
        updatePath: 'graph_task_group',
        buckets: [
          { id: 'b-32', label: 'Bucket 32', sub: '接 17 tok', tone: 'neutral', status: 'normal' },
          {
            id: 'b-48',
            label: 'Bucket 48',
            sub: 'FIA Task 注册',
            topTag: 'TASK',
            tone: 'highlight',
            status: 'selected',
          },
          { id: 'b-64', label: 'Bucket 64', sub: '接 58 tok', tone: 'neutral', status: 'normal' },
        ],
        lanes: [
          {
            title: 'Main Stream',
            subtitle: 'Capture Window',
            blocks: [
              { start: 0.0, dur: 1.0, label: 'RMSNorm+QKV', tone: 'active' },
              {
                start: 1.0,
                dur: 1.8,
                label: 'task_group_begin -> FIA -> end',
                tone: 'highlight',
                active: true,
              },
              { start: 2.8, dur: 1.0, label: 'FFN/MoE', tone: 'active' },
            ],
          },
          {
            title: 'update_stream',
            subtitle: 'Registered',
            blocks: [
              {
                start: 1.0,
                dur: 1.8,
                label: '记下 handle 与 max workspace',
                tone: 'highlight',
                dashed: true,
              },
            ],
          },
          {
            title: 'ExternalEvent',
            subtitle: 'Wait + Reset',
            blocks: [
              { start: 0.6, dur: 0.8, label: 'ev.wait + reset', tone: 'done', active: true },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 2, at: 1.0, toLane: 0, label: 'wait', tone: 'done', active: true },
        ],
        playhead: 2.8,
      },
      caption:
        '第 2 步（捕获期注册可更新窗口）：UpdatableGraph.register_task 在 FIA 算子前后埋入 ExternalEvent.wait/reset，并用 graph_task_group_begin/end 截取其可改写任务组句柄。',
      focus: ['b-48'],
    },
    {
      state: {
        stepTag: '3. 桶复用：33 & 45 -> 48',
        requestSize: '33, 45 (KV 变长)',
        bucketSize: 'Bucket 48 命中',
        streamCost: '免重捕获 (Zero Re-Cap)',
        updatePath: 'Replay + Resolve',
        buckets: [
          { id: 'b-32', label: 'Bucket 32', sub: '17 -> 32', tone: 'active', status: 'normal' },
          {
            id: 'b-48',
            label: 'Bucket 48',
            sub: '33/45 复指!',
            topTag: 'REUSE',
            tone: 'highlight',
            status: 'selected',
          },
          { id: 'b-64', label: 'Bucket 64', sub: '58 -> 64', tone: 'active', status: 'normal' },
        ],
        lanes: [
          {
            title: 'Main Stream',
            subtitle: 'aclmdlRI Replay',
            blocks: [
              { start: 0.0, dur: 0.85, label: 'Resolve 参数', tone: 'active' },
              { start: 0.85, dur: 1.0, label: 'Replay(B=48)', tone: 'active', active: true },
              {
                start: 1.85,
                dur: 1.95,
                label: 'wait_ev -> FIA(新 seq_kv)',
                tone: 'done',
                active: true,
              },
            ],
          },
          {
            title: 'update_stream',
            subtitle: 'Wait Main',
            blocks: [{ start: 0.85, dur: 0.8, label: 'wait_stream', tone: 'highlight' }],
          },
          {
            title: 'ExternalEvent',
            subtitle: 'Armed',
            blocks: [{ start: 1.35, dur: 0.8, label: '准备更新', tone: 'done', dashed: true }],
          },
        ],
        syncEvents: [{ fromLane: 0, at: 0.85, toLane: 1, label: 'wait_main', tone: 'highlight' }],
        playhead: 1.85,
      },
      caption:
        '第 3 步（多负载同桶复用）：请求长度从 33 变为 45，甚至上下文 KV 长度每步递增，只要不超过 48 都复用 Bucket 48 并从 ContextSource 取出本步最新标量参数。',
      focus: ['b-48'],
    },
    {
      state: {
        stepTag: '4. 副流原地热改写 Tiling',
        requestSize: 'seq_kv += 1',
        bucketSize: 'Bucket 48',
        streamCost: '仅改 Tiling 参数',
        updatePath: 'graph_task_update',
        buckets: [
          { id: 'b-32', label: 'Bucket 32', sub: '17 -> 32', tone: 'neutral', status: 'normal' },
          {
            id: 'b-48',
            label: 'Bucket 48',
            sub: '热补 actual_seq_kv',
            topTag: 'PATCH',
            tone: 'highlight',
            status: 'selected',
          },
          { id: 'b-64', label: 'Bucket 64', sub: '58 -> 64', tone: 'neutral', status: 'normal' },
        ],
        lanes: [
          {
            title: 'Main Stream',
            subtitle: 'Replay Running',
            blocks: [
              { start: 0.0, dur: 1.1, label: 'Layer 0 前半图', tone: 'active' },
              {
                start: 1.1,
                dur: 1.2,
                label: 'ExternalEvent.wait',
                tone: 'mask',
                kind: 'bubble',
              },
              {
                start: 2.3,
                dur: 1.6,
                label: '执行 FIA(新 Tiling)',
                tone: 'done',
                active: true,
              },
            ],
          },
          {
            title: 'update_stream',
            subtitle: 'Hot-Patch',
            blocks: [
              {
                start: 0.6,
                dur: 1.6,
                label: 'task_update(FIA args)',
                tone: 'highlight',
                active: true,
              },
            ],
          },
          {
            title: 'ExternalEvent',
            subtitle: 'Pending Record',
            blocks: [{ start: 1.6, dur: 0.8, label: 'patch ready', tone: 'done', active: true }],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 2.1, toLane: 2, label: 'tiling ok', tone: 'highlight', active: true },
        ],
        playhead: 2.3,
      },
      caption:
        '第 4 步（graph_task_update_begin 热更新）：update_stream 并行刷新被捕获任务组里的 actual_seq_lengths_kv 与 block_table Tiling 参数，无需销毁重建计算图。',
      focus: ['b-48'],
    },
    {
      state: {
        stepTag: '5. ExternalEvent 跨流闭环',
        requestSize: '58 -> Bucket 64',
        bucketSize: '全部安全闭环',
        streamCost: '防 507011 / 竞争',
        updatePath: 'ev.record -> replay',
        buckets: [
          { id: 'b-32', label: 'Bucket 32', sub: '17 -> 32', tone: 'done', status: 'selected' },
          { id: 'b-48', label: 'Bucket 48', sub: '33, 45 -> 48', tone: 'done', status: 'selected' },
          { id: 'b-64', label: 'Bucket 64', sub: '58 -> 64', tone: 'done', status: 'selected' },
        ],
        lanes: [
          {
            title: 'Main Stream',
            subtitle: 'Step i & i+1',
            blocks: [
              { start: 0.0, dur: 1.1, label: 'Replay(i) 完结', tone: 'active' },
              {
                start: 1.9,
                dur: 2.0,
                label: 'FIA_update 安全起飞 -> Step i+1',
                tone: 'done',
                active: true,
              },
            ],
          },
          {
            title: 'update_stream',
            subtitle: 'Update Complete',
            blocks: [
              { start: 0.6, dur: 0.9, label: '写入新 seq_lens', tone: 'highlight', active: true },
              { start: 1.5, dur: 0.8, label: 'ev.record', tone: 'done', active: true },
            ],
          },
          {
            title: 'ExternalEvent',
            subtitle: 'Closed Loop',
            blocks: [
              { start: 1.4, dur: 1.2, label: 'ev.record 解锁 wait', tone: 'done', active: true },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 1.85,
            toLane: 0,
            toAt: 1.9,
            label: 'ev.record',
            tone: 'done',
            active: true,
          },
        ],
        playhead: 3.6,
      },
      caption:
        '第 5 步（跨流依赖闭合）：update_stream 执行完补丁后触发 event.record(update_stream) 解锁主流 ExternalEvent.wait，且入图前执行流同步防 $i$ 与 $i-1$ 参数踩踏。',
      focus: ['b-64'],
    },
  ];

  const allTones = steps.flatMap((s) => [
    ...s.state.buckets.map((b) => b.tone ?? 'neutral'),
    ...s.state.lanes.flatMap((l) => l.blocks.map((b) => b.tone)),
  ]);
  assertMaxHues(allTones, 3);
  return steps;
}

export default function AscendAclGraphExplainer({
  title = '图 1：昇腾 ACLGraph 分桶复用、参数热更新与跨流闭合推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildAscendAclGraphSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="Ascend ACLGraph 分桶与热更新推演" wide>
      {(step) => {
        const s = step.state;
        const metrics: MetricItem[] = [
          { label: '实际 Batch 大小', value: s.requestSize, tone: 'active' },
          { label: '捕获 / 命中桶', value: s.bucketSize, tone: 'highlight', active: true },
          { label: '硬件约束状态', value: s.streamCost, tone: 'done' },
          { label: '更新机制', value: s.updatePath, tone: 'highlight' },
        ];

        return (
          <Stage width={STAGE_W} height={412} label="ACLGraph 分桶与 UpdatableGraph 时序视图">
            <SectionBox
              x={12}
              y={12}
              w={STAGE_W - 24}
              h={118}
              title={`ACLGraph 分桶路由 [17, 33, 45, 58] -> [32, 48, 64] · ${s.stepTag}`}
              tone="neutral"
              dashed
            />
            <SlotStrip
              x={94}
              y={68}
              slots={s.buckets}
              slotW={150}
              slotH={44}
              gap={20}
              fontSize={11}
            />

            <SwimlaneTimeline
              x={16}
              y={144}
              w={STAGE_W - 32}
              totalTime={4.0}
              unit="ms"
              ticks={[0, 1, 2, 3, 4]}
              lanes={s.lanes}
              syncEvents={s.syncEvents}
              laneH={34}
              laneGap={20}
              gutterW={118}
              playhead={s.playhead}
              title="Main Stream 与 update_stream 热更新时序闭环"
            />

            <MetricRow x={12} y={354} w={STAGE_W - 24} h={42} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
