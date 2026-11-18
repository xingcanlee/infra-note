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

export interface ProfilerSignatureState {
  stepTag: string;
  hostSignature: string;
  deviceUtil: string;
  rootCause: string;
  fixCommand: string;
  symptomStrip: SlotItem[];
  lanes: TimelineLane[];
  syncEvents: TimelineSyncEvent[];
  playhead: number;
}

export function buildProfilerSignaturesSteps(): Step<ProfilerSignatureState>[] {
  const steps: Step<ProfilerSignatureState>[] = [
    {
      state: {
        stepTag: '1. Healthy Graph Replay',
        hostSignature: '单条 GraphLaunch',
        deviceUtil: '94%',
        rootCause: '健康基线 (无瓶颈)',
        fixCommand: '保持静态图重放',
        symptomStrip: [
          { id: 'sig-0', label: 'Graph', sub: 'Healthy', tone: 'done', status: 'selected' },
          { id: 'sig-1', label: 'Launch', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-2', label: 'HostSync', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-3', label: 'DP All2All', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-4', label: 'Pad Slot', sub: 'OK', tone: 'neutral', status: 'normal' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: '0.08ms Launch',
            blocks: [
              { start: 0.0, dur: 0.7, label: 'GraphLaunch', tone: 'done', active: true },
              {
                start: 0.7,
                dur: 3.2,
                label: '异步准备下一 Step 调度元数据',
                tone: 'done',
                dashed: true,
              },
            ],
          },
          {
            title: 'Device Kernel',
            subtitle: 'Dense Stream',
            blocks: [
              { start: 0.7, dur: 0.7, label: 'Norm', tone: 'done', active: true },
              { start: 1.4, dur: 1.0, label: 'Attn', tone: 'done', active: true },
              { start: 2.4, dur: 0.8, label: 'MoE', tone: 'done', active: true },
              { start: 3.2, dur: 0.7, label: 'Head', tone: 'done', active: true },
            ],
          },
          {
            title: 'HCCL / Copy',
            subtitle: 'Clean Overlap',
            blocks: [{ start: 3.2, dur: 0.7, label: 'Async D2H', tone: 'done' }],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 0.7, toLane: 1, label: 'replay', tone: 'done', active: true },
        ],
        playhead: 3.9,
      },
      caption:
        '第 1 步（健康指纹）：Host Python 轨只有一根极窄的 cudaGraphLaunch / aclmdlRI 发射棒，Device 轨算子首尾紧贴，算力利用率达到 94%。',
      focus: ['sig-0'],
    },
    {
      state: {
        stepTag: '2. Launch-Bound Gaps',
        hostSignature: 'Host 锯齿发射气泡',
        deviceUtil: '38%',
        rootCause: '跌回 Eager / NONE',
        fixCommand: '核查 splitting_ops',
        symptomStrip: [
          { id: 'sig-0', label: 'Graph', sub: 'Bypass', tone: 'neutral', status: 'normal' },
          { id: 'sig-1', label: 'Launch', sub: 'GAP', tone: 'highlight', status: 'selected' },
          { id: 'sig-2', label: 'HostSync', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-3', label: 'DP All2All', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-4', label: 'Pad Slot', sub: 'OK', tone: 'neutral', status: 'normal' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: 'Python Overhead',
            blocks: [
              { start: 0.0, dur: 0.7, label: 'k1 launch', tone: 'highlight', active: true },
              { start: 0.7, dur: 0.7, label: 'k2 launch', tone: 'highlight', active: true },
              { start: 1.4, dur: 0.7, label: 'k3 launch', tone: 'highlight', active: true },
              { start: 2.1, dur: 0.7, label: 'k4 launch', tone: 'highlight', active: true },
              { start: 2.8, dur: 0.7, label: 'k5 launch', tone: 'highlight', active: true },
            ],
          },
          {
            title: 'Device Kernel',
            subtitle: 'Sparse Micro-ops',
            blocks: [
              { start: 0.0, dur: 0.7, label: 'idle', tone: 'mask', kind: 'bubble' },
              { start: 0.7, dur: 0.3, label: 'k1', tone: 'done' },
              { start: 1.0, dur: 0.4, label: 'gap', tone: 'error', kind: 'error' },
              { start: 1.4, dur: 0.3, label: 'k2', tone: 'done' },
              { start: 1.7, dur: 0.4, label: 'gap', tone: 'error', kind: 'error' },
              { start: 2.1, dur: 0.3, label: 'k3', tone: 'done' },
              { start: 2.4, dur: 0.4, label: 'gap', tone: 'error', kind: 'error' },
              { start: 2.8, dur: 0.3, label: 'k4', tone: 'done' },
              { start: 3.1, dur: 0.4, label: 'gap', tone: 'error', kind: 'error' },
              { start: 3.5, dur: 0.3, label: 'k5', tone: 'done' },
            ],
          },
          {
            title: 'HCCL / Copy',
            subtitle: 'Idle',
            blocks: [
              {
                start: 0.0,
                dur: 4.0,
                label: '算子颗粒过碎，Host 追不上硬件',
                tone: 'mask',
                kind: 'bubble',
              },
            ],
          },
        ],
        syncEvents: [{ fromLane: 0, at: 0.7, toLane: 1, label: 'k1', tone: 'highlight' }],
        playhead: 2.4,
      },
      caption:
        '第 2 步（启动受限指纹）：Device 轨出现周期性黑色/空白锯齿气泡，而 Host 轨堆满碎片化 Kernel 发射调用，说明请求未命中 Graph 桶并跌回逐算子 Eager 发射。',
      focus: ['sig-1'],
    },
    {
      state: {
        stepTag: '3. Host .item() Sync Stall',
        hostSignature: 'StreamSync 长条阻塞',
        deviceUtil: '49%',
        rootCause: '隐式主机同步 (.item)',
        fixCommand: 'sync_guard 拦截定位',
        symptomStrip: [
          { id: 'sig-0', label: 'Graph', sub: 'Partial', tone: 'neutral', status: 'normal' },
          { id: 'sig-1', label: 'Launch', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-2', label: 'HostSync', sub: 'STALL', tone: 'error', status: 'error' },
          { id: 'sig-3', label: 'DP All2All', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-4', label: 'Pad Slot', sub: 'OK', tone: 'neutral', status: 'normal' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: 'Blocked Thread',
            blocks: [
              { start: 0.0, dur: 1.0, label: 'Launch Part1', tone: 'done' },
              {
                start: 1.0,
                dur: 1.8,
                label: 'aclrtSynchronizeStream (.item)',
                tone: 'error',
                kind: 'error',
                active: true,
              },
              { start: 2.8, dur: 1.0, label: 'Launch Part2', tone: 'done' },
            ],
          },
          {
            title: 'Device Kernel',
            subtitle: 'Queue Drained',
            blocks: [
              { start: 0.3, dur: 1.5, label: '执行 Part1 直到排空', tone: 'done' },
              {
                start: 1.8,
                dur: 1.4,
                label: '队列已空 -> 空转等待',
                tone: 'error',
                kind: 'error',
                active: true,
              },
              { start: 3.2, dur: 0.8, label: 'Part2', tone: 'done' },
            ],
          },
          {
            title: 'HCCL / Copy',
            subtitle: 'D2H 4-byte',
            blocks: [{ start: 1.6, dur: 0.7, label: '.item() 4B', tone: 'error', kind: 'error' }],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 1.8,
            toLane: 0,
            toAt: 2.8,
            label: 'wake',
            tone: 'error',
            active: true,
          },
        ],
        playhead: 2.8,
      },
      caption:
        '第 3 步（隐式同步指纹）：Host 轨突然出现长条 cudaStreamSynchronize / aclrtSynchronizeStream 与 4 字节 D2H 拷贝，设备排空后只能空闲等待 Python 线程唤醒。',
      focus: ['sig-2'],
    },
    {
      state: {
        stepTag: '4. DP Rank Imbalance Wait',
        hostSignature: 'All-to-All 长块等待',
        deviceUtil: '58%',
        rootCause: 'DP 卡间长尾不均',
        fixCommand: '对齐 dp_utils 与分块',
        symptomStrip: [
          { id: 'sig-0', label: 'Graph', sub: 'Synced', tone: 'neutral', status: 'normal' },
          { id: 'sig-1', label: 'Launch', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-2', label: 'HostSync', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-3', label: 'DP All2All', sub: 'WAIT', tone: 'highlight', status: 'selected' },
          { id: 'sig-4', label: 'Pad Slot', sub: 'OK', tone: 'neutral', status: 'normal' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: 'Rank 0 Early',
            blocks: [
              { start: 0.0, dur: 1.0, label: 'Rank 0 Attn (Fast)', tone: 'done' },
              {
                start: 1.0,
                dur: 2.2,
                label: '通信轨等待慢卡 Rank 1',
                tone: 'highlight',
                active: true,
              },
            ],
          },
          {
            title: 'Device Kernel',
            subtitle: 'Rank 1 Straggler',
            blocks: [
              {
                start: 0.0,
                dur: 2.8,
                label: 'Rank 1 Long Prefill Attn',
                tone: 'highlight',
                active: true,
              },
              { start: 2.8, dur: 0.8, label: 'MoE Compute', tone: 'done' },
            ],
          },
          {
            title: 'HCCL / Copy',
            subtitle: 'EP Barrier',
            blocks: [
              {
                start: 1.0,
                dur: 1.8,
                label: 'NCCL/HCCL All2All 空等墙',
                tone: 'highlight',
                active: true,
              },
              { start: 2.8, dur: 0.8, label: 'EP 传输', tone: 'done' },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 2.8, toLane: 2, label: 'arrive', tone: 'highlight', active: true },
        ],
        playhead: 2.8,
      },
      caption:
        '第 4 步（跨卡长尾等待）：虽然两卡入图一致，但若某卡承接超长 KV 上下文造成 Attention 计算耗时倍增，快卡会在 HCCL/NCCL 通信轨拉出大段长尾阻塞块。',
      focus: ['sig-3'],
    },
    {
      state: {
        stepTag: '5. Dirty Padding Slot (B=4 -> 2)',
        hostSignature: '图重放正常但产出乱码',
        deviceUtil: 'CRASH / 507011',
        rootCause: 'slot[2..3] 残留脏指针',
        fixCommand: '刷写 PAD_SLOT_ID=-1',
        symptomStrip: [
          { id: 'sig-0', label: 'Graph', sub: 'Replayed', tone: 'neutral', status: 'normal' },
          { id: 'sig-1', label: 'Launch', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-2', label: 'HostSync', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-3', label: 'DP All2All', sub: 'OK', tone: 'neutral', status: 'normal' },
          { id: 'sig-4', label: 'Pad Slot', sub: 'DIRTY', tone: 'error', status: 'error' },
        ],
        lanes: [
          {
            title: 'Host Python',
            subtitle: 'B=4 缩容 B=2',
            blocks: [
              {
                start: 0.0,
                dur: 1.6,
                label: '仅写 slot[0..1]，遗漏 slot[2..3]',
                tone: 'highlight',
                active: true,
              },
              { start: 1.6, dur: 1.4, label: 'Replay(B=4)', tone: 'done' },
            ],
          },
          {
            title: 'Device Kernel',
            subtitle: 'scatter_kv 越界',
            blocks: [
              { start: 1.6, dur: 0.85, label: '写 slot[0..1] 合法', tone: 'done' },
              {
                start: 2.45,
                dur: 1.5,
                label: 'slot[2..3] 写穿 KV (507011)',
                tone: 'error',
                kind: 'error',
                active: true,
              },
            ],
          },
          {
            title: 'HCCL / Copy',
            subtitle: 'Async Error',
            blocks: [
              {
                start: 2.75,
                dur: 1.25,
                label: '同步点触发异步错误',
                tone: 'error',
                kind: 'error',
              },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 2.8, toLane: 2, label: '507011 trap', tone: 'error', active: true },
        ],
        playhead: 3.2,
      },
      caption:
        '第 5 步（脏 Padding 槽写穿）：当批大小从 $B=4$ 缩至 $B=2$ 时若未把末尾槽位显式刷为 $-1$（PAD_SLOT_ID），重放 Kernel 会把第 3、4 槽的 Padding 输入写进上一轮残留 KV 地址，引发输出乱码或昇腾异步错误 507011。',
      focus: ['sig-4'],
    },
  ];

  const allTones = steps.flatMap((s) => [
    ...s.state.symptomStrip.map((sl) => sl.tone ?? 'neutral'),
    ...s.state.lanes.flatMap((l) => l.blocks.map((b) => b.tone)),
  ]);
  assertMaxHues(allTones, 3);
  return steps;
}

export default function ProfilerSignaturesExplainer({
  title = '图 1：nsys 与 torch_npu.profiler 五类故障指纹诊断推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildProfilerSignaturesSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="Profiler 五类故障指纹诊断视图" wide>
      {(step) => {
        const s = step.state;
        const isDanger = s.stepTag.startsWith('3.') || s.stepTag.startsWith('5.');
        const metrics: MetricItem[] = [
          {
            label: 'Trace 核心指纹',
            value: s.hostSignature,
            tone: isDanger ? 'error' : s.stepTag.startsWith('1.') ? 'done' : 'highlight',
            active: true,
          },
          {
            label: '硬件利用率',
            value: s.deviceUtil,
            tone: isDanger ? 'error' : s.stepTag.startsWith('1.') ? 'done' : 'highlight',
          },
          {
            label: '根因定位',
            value: s.rootCause,
            tone: isDanger ? 'error' : 'highlight',
          },
          {
            label: '排查手段',
            value: s.fixCommand,
            tone: 'done',
          },
        ];

        return (
          <Stage width={STAGE_W} height={394} label="nsys 与 torch_npu.profiler 指纹面板">
            <SectionBox
              x={12}
              y={12}
              w={STAGE_W - 24}
              h={96}
              title={`五维异常指纹雷达 · ${s.stepTag}`}
              tone={isDanger ? 'error' : 'neutral'}
              dashed
            />
            <SlotStrip
              x={22}
              y={50}
              slots={s.symptomStrip}
              slotW={118}
              slotH={44}
              gap={11}
              fontSize={11}
            />

            <SwimlaneTimeline
              x={16}
              y={124}
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
              title="Host Python / Device Kernel / HCCL 三轨对齐诊断"
            />

            <MetricRow x={12} y={338} w={STAGE_W - 24} h={42} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
