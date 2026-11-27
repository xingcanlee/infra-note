import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues, type AnyTone } from '@/explainers/kit/motion';
import type { TimelineLane } from '@/explainers/kit/SwimlaneTimeline';

export type StreamPipelineMode = 'single_fifo' | 'dual_event' | 'launch_bubble' | 'host_sync_trap';

export interface StreamArrowSpec {
  id: string;
  fromLane: 0 | 1 | 2;
  at: number;
  toLane: 0 | 1 | 2;
  toAt: number;
  label?: string;
  tone: AnyTone;
  active: boolean;
  dashed?: boolean;
}

export interface StreamModeSpec {
  id: StreamPipelineMode;
  label: string;
  phaseLabel: string;
  formulaTex: string;
  caption: string;
  note: string;
  lanes: readonly TimelineLane[];
  arrows: readonly StreamArrowSpec[];
  playhead: number;
  hostCost: string;
  deviceSpan: string;
  syncMechanism: string;
  orderSafety: string;
  badgeTone: AnyTone;
  focusLane: 0 | 1 | 'forkjoin';
  focusLabel: string;
}

export const STREAM_PIPELINE_MODES: Record<StreamPipelineMode, StreamModeSpec> = {
  single_fifo: {
    id: 'single_fifo',
    label: '单流排队',
    phaseLabel: '单条 Stream 硬件 FIFO 严格保序与异步入队',
    formulaTex: '$K_1 \\prec K_2 \\prec K_3 \\prec K_4 \\;(\\text{同队列硬件保序})$',
    caption:
      '同一条 Stream 对应唯一的硬件 FIFO 队列。Host 在 $48\\,\\mu\\text{s}$ 写完 K1 到 K4 描述符即可返回准备下一批输入，Stream 0 按投入顺序隐式保序执行。',
    note: '单队列无需插同步屏障即可保证写后读安全，但独立通信或预取算子只能排队串行，无法与计算重叠。',
    lanes: [
      {
        id: 'host',
        title: 'Host 发射',
        subtitle: '写描述符后即返回',
        blocks: [
          { start: 0, dur: 12, label: 'K1', tone: 'active', active: true },
          { start: 12, dur: 12, label: 'K2', tone: 'active', active: true },
          { start: 24, dur: 12, label: 'K3', tone: 'active', active: true },
          { start: 36, dur: 12, label: 'K4', tone: 'active', active: true },
          { start: 48, dur: 36, label: '准备下一批输入', tone: 'done' },
        ],
      },
      {
        id: 'sq0',
        title: 'Stream 0',
        subtitle: 'FIFO 串行保序',
        blocks: [
          { start: 12, dur: 16, label: 'K1', tone: 'done', active: true },
          { start: 28, dur: 18, label: 'K2', tone: 'done', active: true },
          { start: 46, dur: 20, label: 'K3', tone: 'done', active: true },
          { start: 66, dur: 18, label: 'K4', tone: 'done', active: true },
        ],
      },
      {
        id: 'sq1',
        title: 'Stream 1',
        subtitle: '旁路未启用',
        blocks: [{ start: 0, dur: 110, label: '空闲', tone: 'neutral', kind: 'bubble' }],
      },
    ],
    arrows: [
      {
        id: 'doorbell',
        fromLane: 0,
        at: 10,
        toLane: 1,
        toAt: 12,
        label: 'Doorbell',
        tone: 'active',
        active: true,
      },
    ],
    playhead: 84,
    hostCost: '$48\\,\\mu\\text{s}$',
    deviceSpan: '$72\\,\\mu\\text{s}$',
    syncMechanism: '同队列 FIFO 串行',
    orderSafety: '隐式读写保序',
    badgeTone: 'done',
    focusLane: 1,
    focusLabel: '同队列按 K1 → K2 → K3 → K4 严格顺序执行',
  },
  dual_event: {
    id: 'dual_event',
    label: '多流并行 + Event',
    phaseLabel: '双流 Fork-Join 并发与 Event 跨队列屏障',
    formulaTex:
      '$t_{\\text{start}}(K_4) = \\max(44,\\, t_{\\text{end}}(S_1)) = 70\\,\\mu\\text{s}$',
    caption:
      '计算与通信落入两条独立 SQ 后会并发推进。在 $26\\,\\mu\\text{s}$ 用 $E_{\\text{fork}}$ 放行 Stream 1，再由 $E_{\\text{join}}$ 在设备侧推迟 K4 至 $70\\,\\mu\\text{s}$ 安全启动，CPU 全程零阻塞。',
    note: '设备调度器只在芯片内部挂起 Stream 0 等待 E_join 就绪，既重叠了 K2 与 S1，又避免 K4 提前读到旧显存。',
    lanes: [
      {
        id: 'host',
        title: 'Host 发射',
        subtitle: '插入 Record/Wait 描述符',
        blocks: [
          { start: 0, dur: 12, label: 'K1', tone: 'active' },
          { start: 12, dur: 12, label: 'K2', tone: 'active' },
          { start: 24, dur: 12, label: 'S1', tone: 'active' },
          { start: 36, dur: 12, label: 'K4', tone: 'active' },
        ],
      },
      {
        id: 'sq0',
        title: 'Stream 0',
        subtitle: 'Wait(E_join) 后汇合',
        blocks: [
          { start: 12, dur: 14, label: 'K1', tone: 'done' },
          { start: 26, dur: 18, label: 'K2', tone: 'done' },
          { start: 44, dur: 26, label: '硬件等待', tone: 'neutral', kind: 'bubble' },
          { start: 70, dur: 16, label: 'K4', tone: 'done', active: true },
        ],
      },
      {
        id: 'sq1',
        title: 'Stream 1',
        subtitle: 'Wait / Rec Event',
        blocks: [{ start: 26, dur: 44, label: 'S1 AllReduce', tone: 'done', active: true }],
      },
    ],
    arrows: [
      {
        id: 'efork',
        fromLane: 1,
        at: 26,
        toLane: 2,
        toAt: 26,
        label: 'E_fork',
        tone: 'active',
        active: true,
      },
      {
        id: 'ejoin',
        fromLane: 2,
        at: 70,
        toLane: 1,
        toAt: 70,
        label: 'E_join',
        tone: 'done',
        active: true,
      },
    ],
    playhead: 86,
    hostCost: '$48\\,\\mu\\text{s}$',
    deviceSpan: '$74\\,\\mu\\text{s}$',
    syncMechanism: 'Event Fork-Join',
    orderSafety: '设备侧无阻塞保序',
    badgeTone: 'done',
    focusLane: 'forkjoin',
    focusLabel: 'Fork-Join 封闭汇合，CPU 零等待',
  },
  launch_bubble: {
    id: 'launch_bubble',
    label: '发射气泡',
    phaseLabel: '小批量解码 Host-bound 空泡开销',
    formulaTex:
      '$T_{\\text{launch}} = 12\\,\\mu\\text{s} > T_{\\text{kernel}} = 4\\text{–}8\\,\\mu\\text{s}$',
    caption:
      '小批量解码阶段单算子缩水至 $4\\text{–}8\\,\\mu\\text{s}$，而 Host 每次发射仍耗时 $12\\,\\mu\\text{s}$。Stream 0 算完即停下干等下一条指令，有效占空比跌至 $40\\%$。',
    note: '此时设备算力早已过剩，优化单个算子无法填平气泡，必须通过算子融合或静态执行图一次发射整段任务链。',
    lanes: [
      {
        id: 'host',
        title: 'Host 发射',
        subtitle: '每 12 μs 发射 1 次',
        blocks: [
          { start: 0, dur: 12, label: 'K1', tone: 'active', active: true },
          { start: 12, dur: 12, label: 'K2', tone: 'active', active: true },
          { start: 24, dur: 12, label: 'K3', tone: 'active', active: true },
          { start: 36, dur: 12, label: 'K4', tone: 'active', active: true },
          { start: 48, dur: 12, label: 'K5', tone: 'active', active: true },
        ],
      },
      {
        id: 'sq0',
        title: 'Stream 0',
        subtitle: '暴露密集等待气泡',
        blocks: [
          { start: 12, dur: 4, label: 'K1', tone: 'done' },
          { start: 16, dur: 8, label: '空', tone: 'highlight', kind: 'bubble', active: true },
          { start: 24, dur: 6, label: 'K2', tone: 'done' },
          { start: 30, dur: 6, label: '空', tone: 'highlight', kind: 'bubble', active: true },
          { start: 36, dur: 8, label: 'K3', tone: 'done' },
          { start: 44, dur: 4, label: '空', tone: 'highlight', kind: 'bubble', active: true },
          { start: 48, dur: 5, label: 'K4', tone: 'done' },
          { start: 53, dur: 7, label: '空', tone: 'highlight', kind: 'bubble', active: true },
          { start: 60, dur: 5, label: 'K5', tone: 'done' },
        ],
      },
      {
        id: 'sq1',
        title: 'Stream 1',
        subtitle: '旁路未启用（瓶颈对照）',
        blocks: [{ start: 12, dur: 53, label: '有效算力 26 μs / 跨度 65 μs', tone: 'highlight' }],
      },
    ],
    arrows: [
      {
        id: 'l1',
        fromLane: 0,
        at: 12,
        toLane: 1,
        toAt: 12,
        tone: 'active',
        active: true,
      },
      {
        id: 'l2',
        fromLane: 0,
        at: 24,
        toLane: 1,
        toAt: 24,
        tone: 'active',
        active: true,
      },
      {
        id: 'l3',
        fromLane: 0,
        at: 36,
        toLane: 1,
        toAt: 36,
        tone: 'active',
        active: true,
      },
    ],
    playhead: 65,
    hostCost: '$60\\,\\mu\\text{s}$',
    deviceSpan: '$65\\,\\mu\\text{s}$',
    syncMechanism: 'Eager 逐条发射',
    orderSafety: '占空比仅 40.0%',
    badgeTone: 'highlight',
    focusLane: 1,
    focusLabel: 'CPU 发射慢于执行，硬件露出 60% 空泡',
  },
  host_sync_trap: {
    id: 'host_sync_trap',
    label: '主机同步陷阱',
    phaseLabel: 'Host 阻塞同步与图捕获退化陷阱',
    formulaTex: '$N_{\\text{sync}} \\ge 1 \\;\\Longrightarrow\\; \\text{流水线全线停顿}$',
    caption:
      '热路径中插入 SynchronizeStream 或张量 item() 读取后，Host 必须停下来死等设备 CQ 回执，Stream 0 随即排空产生大段空档，并直接破坏静态图捕获前提。',
    note: '在图捕获域内绝对禁止调用主机同步或隐式回拷，否则录制器会立刻报错中止，退回 Eager 逐条发射。',
    lanes: [
      {
        id: 'host',
        title: 'Host 发射',
        subtitle: '被 Synchronize 阻塞',
        blocks: [
          { start: 0, dur: 12, label: 'K1', tone: 'active' },
          { start: 12, dur: 12, label: 'K2', tone: 'active' },
          {
            start: 24,
            dur: 38,
            label: 'CPU 死等 CQ',
            tone: 'highlight',
            kind: 'bubble',
            active: true,
          },
          { start: 62, dur: 12, label: 'K3', tone: 'active' },
        ],
      },
      {
        id: 'sq0',
        title: 'Stream 0',
        subtitle: '队列排空产生大空档',
        blocks: [
          { start: 12, dur: 20, label: 'K1', tone: 'done' },
          { start: 32, dur: 30, label: 'K2', tone: 'done' },
          {
            start: 62,
            dur: 12,
            label: '等 Host 恢复',
            tone: 'highlight',
            kind: 'bubble',
            active: true,
          },
          { start: 74, dur: 18, label: 'K3', tone: 'done' },
        ],
      },
      {
        id: 'sq1',
        title: 'Stream 1',
        subtitle: '静态图捕获域兼容性',
        blocks: [{ start: 24, dur: 50, label: '禁止在捕获域内调用 Host Sync', tone: 'highlight' }],
      },
    ],
    arrows: [
      {
        id: 'cq',
        fromLane: 1,
        at: 62,
        toLane: 0,
        toAt: 62,
        label: 'CQ 回执',
        tone: 'highlight',
        active: true,
        dashed: true,
      },
    ],
    playhead: 92,
    hostCost: '全线阻塞',
    deviceSpan: '$92\\,\\mu\\text{s}$',
    syncMechanism: 'aclrtSynchronizeStream',
    orderSafety: '流水线断流且禁捕',
    badgeTone: 'highlight',
    focusLane: 0,
    focusLabel: 'Host 死等 CQ 回执导致双端空转',
  },
};

export const STREAM_MODE_ORDER: readonly StreamPipelineMode[] = [
  'single_fifo',
  'dual_event',
  'launch_bubble',
  'host_sync_trap',
];

export function buildStreamEventPipelineSteps(): Step<StreamModeSpec>[] {
  assertMaxHues(['active', 'highlight', 'done']);
  return STREAM_MODE_ORDER.map((id) => {
    const mode = STREAM_PIPELINE_MODES[id];
    return {
      label: mode.label,
      duration: 4200,
      state: mode,
      caption: mode.caption,
    };
  });
}
