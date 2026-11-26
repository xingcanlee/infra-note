import type { Step } from 'astro-wisp/explainers';
import { defaultBeats, assertMaxHues, type AnyTone, type BeatSpec } from '@/explainers/kit/motion';
import type { TimelineLane, TimelineSyncEvent } from '@/explainers/kit/SwimlaneTimeline';

export type StreamSyncMode = 'with_event' | 'no_sync';

export interface StreamEventPipelineState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
  beats: BeatSpec[];
  lanes: readonly TimelineLane[];
  syncEvents: readonly TimelineSyncEvent[];
  playhead: number;
  hostCost: string;
  deviceSpan: string;
  syncMechanism: string;
  orderSafety: string;
  badgeTone: AnyTone;
  focusLane: 0 | 1 | 2 | 'forkjoin';
  focusLabel: string;
  supportsRaceToggle: boolean;
}

export const RACE_COMPARE_MODES: Record<
  StreamSyncMode,
  {
    id: StreamSyncMode;
    label: string;
    lanes: readonly TimelineLane[];
    syncEvents: readonly TimelineSyncEvent[];
    formulaTex: string;
    syncMechanism: string;
    orderSafety: string;
    badgeTone: AnyTone;
    focusLabel: string;
    note: string;
  }
> = {
  no_sync: {
    id: 'no_sync',
    label: '无 Event 屏障（竞态读到脏数据）',
    lanes: [
      {
        id: 'host',
        title: 'Host 线程',
        subtitle: '并发向两条队列入队',
        blocks: [
          { start: 0, dur: 12, label: 'K1', tone: 'active' },
          { start: 12, dur: 12, label: 'S1', tone: 'active' },
          { start: 24, dur: 12, label: 'K4', tone: 'active' },
        ],
      },
      {
        id: 'sq0',
        title: 'Stream 0 (SQ0)',
        subtitle: '主流计算队列',
        blocks: [
          { start: 12, dur: 14, label: 'K1 Norm', tone: 'done' },
          { start: 26, dur: 18, label: 'K2 QKV', tone: 'done' },
          { start: 44, dur: 18, label: 'K4 读到脏数据', tone: 'highlight', active: true },
        ],
      },
      {
        id: 'sq1',
        title: 'Stream 1 (SQ1)',
        subtitle: '独立通信队列（未同步）',
        blocks: [
          { start: 24, dur: 46, label: 'S1 AllReduce（未写完）', tone: 'highlight', active: true },
        ],
      },
    ],
    syncEvents: [],
    formulaTex:
      '$t_{\\text{read}}(K_4)=44\\,\\mu\\text{s} < t_{\\text{write}}(S_1)=70\\,\\mu\\text{s}$',
    syncMechanism: '无跨流依赖边',
    orderSafety: '读到旧显存脏数据',
    badgeTone: 'highlight',
    focusLabel: 'K4 在 44 μs 提前启动并读到脏数据',
    note: '两套硬件队列各自空闲即启动：SQ0 在 44 μs 启动 K4，而 SQ1 的 S1 到 70 μs 才写回。',
  },
  with_event: {
    id: 'with_event',
    label: '插入 Event 屏障（保序安全）',
    lanes: [
      {
        id: 'host',
        title: 'Host 线程',
        subtitle: '插入 Record/Wait 描述符',
        blocks: [
          { start: 0, dur: 12, label: 'K1', tone: 'active' },
          { start: 12, dur: 12, label: 'S1', tone: 'active' },
          { start: 24, dur: 12, label: 'K4', tone: 'active' },
        ],
      },
      {
        id: 'sq0',
        title: 'Stream 0 (SQ0)',
        subtitle: 'Wait(E_join) 后安全执行',
        blocks: [
          { start: 12, dur: 14, label: 'K1 Norm', tone: 'done' },
          { start: 26, dur: 18, label: 'K2 QKV', tone: 'done' },
          { start: 44, dur: 26, label: '硬件等待', tone: 'neutral', kind: 'bubble' },
          { start: 70, dur: 16, label: 'K4 OutProj', tone: 'done', active: true },
        ],
      },
      {
        id: 'sq1',
        title: 'Stream 1 (SQ1)',
        subtitle: 'Wait(E_fork) → Rec(E_join)',
        blocks: [{ start: 26, dur: 44, label: 'S1 AllReduce', tone: 'done', active: true }],
      },
    ],
    syncEvents: [
      { fromLane: 1, at: 26, toLane: 2, toAt: 26, label: 'E_fork', tone: 'active', active: true },
      { fromLane: 2, at: 70, toLane: 1, toAt: 70, label: 'E_join', tone: 'done', active: true },
    ],
    formulaTex:
      '$t_{\\text{start}}(K_4) = \\max(44,\\, t_{\\text{end}}(S_1)) = 70\\,\\mu\\text{s}$',
    syncMechanism: 'Event Fork-Join 汇合',
    orderSafety: '设备侧无阻塞保序',
    badgeTone: 'done',
    focusLabel: 'E_join 推迟 K4 至 70 μs 安全启动',
    note: '设备调度器只在芯片内部挂起 SQ0 等待 E_join 就绪，CPU 线程全程零等待。',
  },
};

export function buildStreamEventPipelineSteps(): Step<StreamEventPipelineState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: '异步入队',
      duration: 4600,
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · Host 写入描述符（非阻塞异步入队）',
        formulaTex:
          '$T_{\\text{host}} = 36\\,\\mu\\text{s} \\ll T_{\\text{dev}} = 54\\,\\mu\\text{s}$',
        beats: defaultBeats([
          'Host 连续写入 K1..K3 描述符',
          '敲下 Doorbell 后立即返回',
          'SQ0 刚刚启动 K1 RMSNorm',
          '量化 CPU-设备异步解耦',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '仅写入任务描述符',
            blocks: [
              { start: 0, dur: 12, label: 'Launch K1', tone: 'active', active: true },
              { start: 12, dur: 12, label: 'Launch K2', tone: 'active', active: true },
              { start: 24, dur: 12, label: 'Launch K3', tone: 'active', active: true },
            ],
          },
          {
            id: 'sq0',
            title: 'Stream 0 (SQ0)',
            subtitle: '计算队列',
            blocks: [
              { start: 12, dur: 18, label: 'K1 Norm', tone: 'done' },
              { start: 30, dur: 18, label: 'K2 QKV', tone: 'neutral', dashed: true },
              { start: 48, dur: 18, label: 'K3 Attn', tone: 'neutral', dashed: true },
            ],
          },
          {
            id: 'sq1',
            title: 'Stream 1 (SQ1)',
            subtitle: '旁路队列',
            blocks: [{ start: 0, dur: 110, label: '空闲', tone: 'neutral', kind: 'bubble' }],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 8, toLane: 1, toAt: 12, label: '入队', tone: 'active', active: true },
        ],
        playhead: 36,
        hostCost: '$36\\,\\mu\\text{s}$',
        deviceSpan: '$54\\,\\mu\\text{s}$',
        syncMechanism: 'Doorbell 异步通知',
        orderSafety: '主机发射完即返回',
        badgeTone: 'active',
        focusLane: 0,
        focusLabel: 'Host 36 μs 发完即返回',
        supportsRaceToggle: false,
      },
      caption:
        'Host 线程把 K1、K2、K3 的任务描述符顺序写入提交队列后立刻返回，无需等待计算单元跑完，36 微秒即可腾出手准备下一批输入。',
    },
    {
      label: '单流排队',
      duration: 4600,
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · 单条 Stream 硬件 FIFO 保序',
        formulaTex: '$K_1 \\prec K_2 \\prec K_3 \\prec K_4 \\;(\\text{同队列硬件保序})$',
        beats: defaultBeats([
          'Host 转向制备下一批请求',
          'SQ0 按 FIFO 依次执行 K1..K4',
          '写后读依赖由队列天然保证',
          '无需插同步原语即可保序',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '可并发准备后续工作',
            blocks: [
              { start: 0, dur: 12, label: 'K1', tone: 'neutral' },
              { start: 12, dur: 12, label: 'K2', tone: 'neutral' },
              { start: 24, dur: 12, label: 'K3', tone: 'neutral' },
              { start: 36, dur: 40, label: '准备下一批输入', tone: 'done' },
            ],
          },
          {
            id: 'sq0',
            title: 'Stream 0 (SQ0)',
            subtitle: 'FIFO 顺序执行',
            blocks: [
              { start: 12, dur: 16, label: 'K1 Norm', tone: 'done', active: true },
              { start: 28, dur: 20, label: 'K2 QKV', tone: 'done', active: true },
              { start: 48, dur: 24, label: 'K3 Attn', tone: 'done', active: true },
              { start: 72, dur: 18, label: 'K4 Out', tone: 'done', active: true },
            ],
          },
          {
            id: 'sq1',
            title: 'Stream 1 (SQ1)',
            subtitle: '旁路队列',
            blocks: [{ start: 0, dur: 110, label: '未启用', tone: 'neutral', kind: 'bubble' }],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 28, toLane: 1, toAt: 28, tone: 'done' },
          { fromLane: 1, at: 48, toLane: 1, toAt: 48, tone: 'done' },
        ],
        playhead: 90,
        hostCost: '$48\\,\\mu\\text{s}$',
        deviceSpan: '$78\\,\\mu\\text{s}$',
        syncMechanism: '同队列 FIFO 串行',
        orderSafety: '隐式读写保序',
        badgeTone: 'done',
        focusLane: 1,
        focusLabel: '单流严格按 K1 → K2 → K3 → K4 执行',
        supportsRaceToggle: false,
      },
      caption:
        '同一条 Stream 对应唯一的硬件 FIFO 队列。只要算子按顺序投入 SQ0，调度器会等前一个算子写回 HBM 再启动下一个。',
    },
    {
      label: '多流竞态',
      duration: 4800,
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · 双流并发竞态 vs Fork-Join Event 同步',
        formulaTex: RACE_COMPARE_MODES.no_sync.formulaTex,
        beats: defaultBeats([
          '计算与旁路分入两条独立 SQ',
          '检查两条队列之间的时序偏移',
          '定位 K4 与 S1 的读写冲突点',
          '切换对比无同步与加 Event',
        ]),
        lanes: RACE_COMPARE_MODES.no_sync.lanes,
        syncEvents: RACE_COMPARE_MODES.no_sync.syncEvents,
        playhead: 70,
        hostCost: '$36\\,\\mu\\text{s}$',
        deviceSpan: '$86\\,\\mu\\text{s}$',
        syncMechanism: RACE_COMPARE_MODES.no_sync.syncMechanism,
        orderSafety: RACE_COMPARE_MODES.no_sync.orderSafety,
        badgeTone: 'highlight',
        focusLane: 'forkjoin',
        focusLabel: RACE_COMPARE_MODES.no_sync.focusLabel,
        supportsRaceToggle: true,
      },
      caption:
        '计算与通信落入不同 SQ 后会各自全速并发。可切换上方按钮对比无屏障时 K4 提前读到脏数据，以及插入 Event 构成 Fork-Join 后的安全汇合。',
    },
    {
      label: '发射气泡',
      duration: 4600,
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · 小批量解码 Host-bound 空泡开销',
        formulaTex:
          '$T_{\\text{launch}} = 12\\,\\mu\\text{s} > T_{\\text{kernel}} = 4\\text{–}8\\,\\mu\\text{s}$',
        beats: defaultBeats([
          '进入小批量解码单算子缩短至 4-8 μs',
          'CPU 单次发射仍需 12 μs',
          '计算单元跑完立即停下等下一条',
          '有效占空比跌破五成',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '每 12 μs 发射 1 次',
            blocks: [
              { start: 0, dur: 12, label: 'L(K1)', tone: 'active' },
              { start: 12, dur: 12, label: 'L(K2)', tone: 'active' },
              { start: 24, dur: 12, label: 'L(K3)', tone: 'active' },
              { start: 36, dur: 12, label: 'L(K4)', tone: 'active' },
              { start: 48, dur: 12, label: 'L(K5)', tone: 'active' },
            ],
          },
          {
            id: 'sq0',
            title: 'Stream 0 (SQ0)',
            subtitle: '暴露密集等待气泡',
            blocks: [
              { start: 12, dur: 4, label: 'K1', tone: 'done' },
              { start: 16, dur: 8, label: '气泡', tone: 'highlight', kind: 'bubble', active: true },
              { start: 24, dur: 6, label: 'K2', tone: 'done' },
              { start: 30, dur: 6, label: '气泡', tone: 'highlight', kind: 'bubble', active: true },
              { start: 36, dur: 8, label: 'K3', tone: 'done' },
              { start: 44, dur: 4, label: '气泡', tone: 'highlight', kind: 'bubble', active: true },
              { start: 48, dur: 5, label: 'K4', tone: 'done' },
              { start: 53, dur: 7, label: '气泡', tone: 'highlight', kind: 'bubble', active: true },
              { start: 60, dur: 5, label: 'K5', tone: 'done' },
            ],
          },
          {
            id: 'sq1',
            title: '硬件有效利用率',
            subtitle: '仅 40.0% 处于计算态',
            blocks: [
              { start: 12, dur: 53, label: '有效算力 26 μs / 总耗时 65 μs', tone: 'highlight' },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 12, toLane: 1, toAt: 12, tone: 'active' },
          { fromLane: 0, at: 24, toLane: 1, toAt: 24, tone: 'active' },
          { fromLane: 0, at: 36, toLane: 1, toAt: 36, tone: 'active' },
        ],
        playhead: 65,
        hostCost: '$60\\,\\mu\\text{s}$',
        deviceSpan: '$65\\,\\mu\\text{s}$',
        syncMechanism: '单流 Eager 逐条发射',
        orderSafety: '占空比仅 40.0%',
        badgeTone: 'highlight',
        focusLane: 1,
        focusLabel: 'CPU 发射跟不上，硬件露出 60% 空泡',
        supportsRaceToggle: false,
      },
      caption:
        '当小批量解码的单算子缩到 4–8 微秒而 CPU 每次派发仍需 12 微秒时，硬件跑完一个算子就只能干等下一条指令，有效占空比跌至 40%。',
    },
    {
      label: '同步陷阱',
      duration: 4600,
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · Host 阻塞同步与图捕获退化陷阱',
        formulaTex: '$N_{\\text{sync}} \\ge 1 \\;\\Longrightarrow\\; \\text{流水线全线停顿}$',
        beats: defaultBeats([
          '插入 .item() 或 Synchronize',
          'CPU 线程被迫挂起等 CQ 回执',
          '设备端队列排空失去掩盖',
          '同时打破静态图捕获前提',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
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
            title: 'Stream 0 (SQ0)',
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
            title: '静态图兼容性',
            subtitle: '同步点直接中止录制',
            blocks: [
              { start: 24, dur: 50, label: '禁止在捕获域内调用 Host Sync', tone: 'highlight' },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 62,
            toLane: 0,
            toAt: 62,
            label: 'CQ 回执',
            tone: 'highlight',
            active: true,
          },
        ],
        playhead: 92,
        hostCost: '全线阻塞',
        deviceSpan: '$92\\,\\mu\\text{s}$',
        syncMechanism: 'aclrtSynchronizeStream',
        orderSafety: '破坏异步且禁止静态图捕获',
        badgeTone: 'highlight',
        focusLane: 0,
        focusLabel: 'Host 同步让 CPU 与设备同时空转',
        supportsRaceToggle: false,
      },
      caption:
        '在热路径里放一条 SynchronizeStream 或张量 item() 读取，不仅会让 CPU 死等队列排空，还会在后续静态图捕获阶段直接报错中断。',
    },
  ];
}
