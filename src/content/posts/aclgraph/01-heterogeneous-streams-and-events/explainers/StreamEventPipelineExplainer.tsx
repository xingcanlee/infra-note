import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { BeatExplainer, defaultBeats, type BeatSpec } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SwimlaneTimeline, {
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit/SwimlaneTimeline';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

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
}

export function buildStreamEventPipelineSteps(): Step<StreamEventPipelineState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: '异步入队',
      duration: 4600,
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · Host Write SQ（非阻塞异步入队）',
        formulaTex:
          '$T_{\\text{host}} = 44\\,\\mu\\text{s} \\ll T_{\\text{dev}} = 104\\,\\mu\\text{s}$',
        beats: defaultBeats([
          'Host 连续写入 3 条 SQE',
          '首条指令触发设备启动 K1',
          '后续算子挂在 SQ0 排队',
          '量化 CPU-NPU 异步解耦',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '仅写入任务描述符',
            blocks: [
              { start: 0, dur: 14, label: 'Launch K1', tone: 'active', active: true },
              { start: 15, dur: 14, label: 'Launch K2', tone: 'active', active: true },
              { start: 30, dur: 14, label: 'Launch K3', tone: 'active', active: true },
            ],
          },
          {
            id: 'sq0',
            title: 'Stream 0 (SQ0)',
            subtitle: '计算队列',
            blocks: [
              { start: 10, dur: 32, label: 'K1 MatMul', tone: 'done' },
              { start: 42, dur: 36, label: 'K2 AddNorm', tone: 'neutral', dashed: true },
              { start: 78, dur: 32, label: 'K3 Softmax', tone: 'neutral', dashed: true },
            ],
          },
          {
            id: 'sq1',
            title: 'Stream 1 (SQ1)',
            subtitle: '消费者队列',
            blocks: [{ start: 0, dur: 120, label: '未启用', tone: 'neutral', kind: 'bubble' }],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 7, toLane: 1, toAt: 10, label: '入队', tone: 'active', active: true },
        ],
        playhead: 44,
        hostCost: '$T_{\\text{host}} = 44\\,\\mu\\text{s}$',
        deviceSpan: '$T_{\\text{dev}} = 104\\,\\mu\\text{s}$',
        syncMechanism: 'FIFO 队列顺序派发',
        orderSafety: '单流顺序保序',
        badgeTone: 'active',
        focusLane: 0,
        focusLabel: 'Host 44 μs 发完即返回',
      },
      caption:
        'Host 调用异步算子接口仅将描述符写入 SQ 环形缓冲，44 微秒内即可发完三条发射请求并继续执行后续 Python 逻辑，此时 K1 才刚刚在设备端启动。',
    },
    {
      label: '单流排队',
      duration: 4600,
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · 单流 FIFO 顺序执行与排队',
        formulaTex: '$K_1 \\prec K_2 \\prec K_3 \\quad (\\text{同队列硬件保序})$',
        beats: defaultBeats([
          'Host 转向制备下一批输入',
          'SQ0 依次接管 K1..K3 执行',
          '同队列隐式保证写后读',
          '汇总单流无同步开销',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '发射完毕可做它事',
            blocks: [
              { start: 0, dur: 14, label: 'Launch K1', tone: 'neutral' },
              { start: 15, dur: 14, label: 'Launch K2', tone: 'neutral' },
              { start: 30, dur: 14, label: 'Launch K3', tone: 'neutral' },
              { start: 46, dur: 50, label: '准备下一批输入', tone: 'done' },
            ],
          },
          {
            id: 'sq0',
            title: 'Stream 0 (SQ0)',
            subtitle: 'FIFO 顺序执行',
            blocks: [
              { start: 10, dur: 32, label: 'K1 MatMul', tone: 'done', active: true },
              { start: 42, dur: 36, label: 'K2 AddNorm', tone: 'active', active: true },
              { start: 78, dur: 32, label: 'K3 Softmax', tone: 'active', active: true },
            ],
          },
          {
            id: 'sq1',
            title: 'Stream 1 (SQ1)',
            subtitle: '消费者队列',
            blocks: [{ start: 0, dur: 120, label: '闲置', tone: 'neutral', kind: 'bubble' }],
          },
        ],
        syncEvents: [],
        playhead: 110,
        hostCost: '$T_{\\text{host}} = 44\\,\\mu\\text{s}$',
        deviceSpan: '$T_{\\text{dev}} = 100\\,\\mu\\text{s}$',
        syncMechanism: '同队列 FIFO 保障',
        orderSafety: 'K1 < K2 < K3',
        badgeTone: 'done',
        focusLane: 1,
        focusLabel: '同流隐式 FIFO 无需 Event',
      },
      caption:
        '同一 Stream 映射到同一硬件 SQ，只要 K2 排在 K1 之后写入 SQ，设备侧任务调度器保证 K1 写回并完成后才会启动 K2，无需额外同步原语。',
    },
    {
      label: '跨流竞态',
      duration: 4600,
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · 双流并发陷阱：缺少 Event 导致的数据竞态',
        formulaTex:
          '$t_{\\text{read}}(\\text{SQ1})=32\\,\\mu\\text{s} < t_{\\text{write}}(\\text{SQ0})=82\\,\\mu\\text{s}$',
        beats: defaultBeats([
          'Host 先投 S0 再投 S1 读 X',
          'SQ0 的 K2 在 t=42 才写入 X',
          'SQ1 在 t=32 抢读未写完 X',
          '标出跨流无边竞态风险',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '跨流发射两个任务',
            blocks: [
              { start: 0, dur: 14, label: 'S0: K1', tone: 'active' },
              { start: 15, dur: 14, label: 'S0: K2 写 X', tone: 'active' },
              { start: 30, dur: 14, label: 'S1: 读 X', tone: 'highlight', active: true },
            ],
          },
          {
            id: 'sq0',
            title: 'Stream 0 (SQ0)',
            subtitle: '生产者队列',
            blocks: [
              { start: 10, dur: 32, label: 'K1', tone: 'done' },
              { start: 42, dur: 40, label: 'K2 写入张量 X', tone: 'active', active: true },
            ],
          },
          {
            id: 'sq1',
            title: 'Stream 1 (SQ1)',
            subtitle: '消费者队列',
            blocks: [
              {
                start: 32,
                dur: 28,
                label: '读未写完的 X',
                tone: 'highlight',
                active: true,
                dashed: true,
              },
            ],
          },
        ],
        syncEvents: [],
        playhead: 42,
        hostCost: '$T_{\\text{host}} = 44\\,\\mu\\text{s}$',
        deviceSpan: '竞态冲突',
        syncMechanism: '缺失依赖边',
        orderSafety: 'S1 在 t=32 读脏数据',
        badgeTone: 'highlight',
        focusLane: 2,
        focusLabel: '双流各自推进触发脏读',
      },
      caption:
        '虽然 Host 在发完 K2 后才往 Stream 1 投入读任务，但两张独立 SQ 的调度速度互相独立；Stream 1 在 32 微秒抢先读取尚未被 K2 写完的显存 X。',
    },
    {
      label: 'Event 接力',
      duration: 4600,
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · Event Record + StreamWaitEvent 硬件侧接力',
        formulaTex:
          '$\\text{Record}(E_1)@\\text{SQ0} \\;\\longrightarrow\\; \\text{Wait}(E_1)@\\text{SQ1}$',
        beats: defaultBeats([
          'Host 下发 Record/Wait E1',
          'SQ0 完成写 X 并打标 E1',
          'SQ1 硬件等待后安全读 X',
          '确认零 CPU 阻塞保序',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '发完即走，零阻塞',
            blocks: [
              { start: 0, dur: 12, label: 'K2', tone: 'active' },
              { start: 13, dur: 10, label: 'Record E1', tone: 'highlight', active: true },
              { start: 24, dur: 10, label: 'Wait E1', tone: 'highlight', active: true },
              { start: 35, dur: 12, label: 'S1 读 X', tone: 'done' },
            ],
          },
          {
            id: 'sq0',
            title: 'Stream 0 (SQ0)',
            subtitle: '写完触发 Notify',
            blocks: [
              { start: 10, dur: 32, label: 'K1', tone: 'done' },
              { start: 42, dur: 36, label: 'K2 写 X', tone: 'active', active: true },
              { start: 78, dur: 8, label: 'E1', tone: 'highlight', active: true },
            ],
          },
          {
            id: 'sq1',
            title: 'Stream 1 (SQ1)',
            subtitle: '等 E1 就绪放行',
            blocks: [
              { start: 34, dur: 52, label: '硬件阻塞等待 E1', tone: 'neutral', kind: 'bubble' },
              { start: 86, dur: 28, label: '安全读取 X', tone: 'done', active: true },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 82,
            toLane: 2,
            toAt: 86,
            label: 'Event E1',
            tone: 'highlight',
            active: true,
          },
        ],
        playhead: 86,
        hostCost: '$T_{\\text{host}} = 47\\,\\mu\\text{s}$',
        deviceSpan: '$T_{\\text{dev}} = 104\\,\\mu\\text{s}$',
        syncMechanism: 'Event / Notify 硬件边',
        orderSafety: '保证 X 写后读',
        badgeTone: 'done',
        focusLane: 2,
        focusLabel: '硬件 Event 门控跨流依赖',
      },
      caption:
        'Host 只需在 Stream 0 插入 Record E1，在 Stream 1 插入 Wait E1，便能立刻返回；硬件调度器会在 t=78 确认 K2 写回 HBM 后释放 Stream 1。',
    },
    {
      label: 'Fork-Join',
      duration: 4600,
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · Fork-Join 多流并发重叠掩盖通信开销',
        formulaTex:
          '$T_{\\text{overlap}} = \\max(T_{\\text{comp}}, T_{\\text{comm}}) = 50\\,\\mu\\text{s}$',
        beats: defaultBeats([
          'Host 下发 Fork/Join 拓扑',
          'E1 分叉激活两路并行',
          '通信 50μs 与计算 46μs 重叠',
          'E2 汇合闭合静态 DAG',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '依次下发双分支',
            blocks: [
              { start: 0, dur: 10, label: 'Fork E1', tone: 'highlight' },
              { start: 11, dur: 18, label: 'S0/S1 任务', tone: 'active' },
              { start: 30, dur: 10, label: 'Join E2', tone: 'highlight' },
            ],
          },
          {
            id: 'sq0',
            title: 'Stream 0 (SQ0)',
            subtitle: '主计算流',
            blocks: [
              { start: 10, dur: 22, label: 'Norm', tone: 'done' },
              { start: 32, dur: 6, label: 'E1', tone: 'highlight' },
              { start: 38, dur: 46, label: 'MatMul 计算', tone: 'active', active: true },
              { start: 84, dur: 10, label: '等 E2', tone: 'neutral', kind: 'bubble' },
              { start: 94, dur: 24, label: 'DownProj', tone: 'done', active: true },
            ],
          },
          {
            id: 'sq1',
            title: 'Stream 1 (SQ1)',
            subtitle: '通信与拷贝流',
            blocks: [
              { start: 38, dur: 50, label: 'AllReduce / H2D 重叠', tone: 'done', active: true },
              { start: 88, dur: 6, label: 'E2', tone: 'highlight' },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 35,
            toLane: 2,
            toAt: 38,
            label: 'Fork',
            tone: 'highlight',
            active: true,
          },
          {
            fromLane: 2,
            at: 91,
            toLane: 1,
            toAt: 94,
            label: 'Join',
            tone: 'highlight',
            active: true,
          },
        ],
        playhead: 94,
        hostCost: '$T_{\\text{host}} = 40\\,\\mu\\text{s}$',
        deviceSpan: '$T_{\\text{overlap}} = 108\\,\\mu\\text{s}$',
        syncMechanism: 'Fork-Join 双 Event',
        orderSafety: '闭合并发 DAG',
        badgeTone: 'active',
        focusLane: 'forkjoin',
        focusLabel: 'E1 分叉 + E2 汇合可整图捕获',
      },
      caption:
        '通过 E1 分叉、E2 汇合的 Fork-Join 模式，Stream 1 与 Stream 0 在中间 46 微秒保持并发重叠；这种起点终点明确的 DAG 正是 CUDA Graph 与 ACL Graph 支持的多流捕获形状。',
    },
    {
      label: '同步屏障',
      duration: 4600,
      state: {
        stepIndex: 5,
        phaseLabel: 'Step 6 · Host Synchronize 同步屏障（阻塞到 CQ 完成）',
        formulaTex: '$T_{\\text{wait}} = 78\\,\\mu\\text{s}\\; (\\text{CPU 阻塞至 CQ 回执})$',
        beats: defaultBeats([
          'Host 发射后进入睡眠等待',
          'SQ0 与 SQ1 推进至末尾',
          'SQ0 发回 CQ 完成中断',
          '警示同步对流水的打断',
        ]),
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '等待 CQ 完成回执',
            blocks: [
              { start: 0, dur: 40, label: '异步发射完毕', tone: 'active' },
              {
                start: 40,
                dur: 78,
                label: 'Host 阻塞等待 CQ 返回',
                tone: 'highlight',
                active: true,
                kind: 'bubble',
              },
              { start: 118, dur: 12, label: '读结果', tone: 'done', active: true },
            ],
          },
          {
            id: 'sq0',
            title: 'Stream 0 (SQ0)',
            subtitle: '主计算流',
            blocks: [
              { start: 10, dur: 84, label: '执行完毕', tone: 'done' },
              { start: 94, dur: 24, label: 'DownProj', tone: 'done', active: true },
            ],
          },
          {
            id: 'sq1',
            title: 'Stream 1 (SQ1)',
            subtitle: '旁路流',
            blocks: [{ start: 38, dur: 56, label: '重叠完成', tone: 'done' }],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 118,
            toLane: 0,
            toAt: 118,
            label: 'CQ 回执',
            tone: 'done',
            active: true,
          },
        ],
        playhead: 118,
        hostCost: '$T_{\\text{wait}} = 78\\,\\mu\\text{s}$',
        deviceSpan: '$T_{\\text{dev}} = 108\\,\\mu\\text{s}$',
        syncMechanism: 'SynchronizeStream',
        orderSafety: '全局 Host-Device 同步',
        badgeTone: 'highlight',
        focusLane: 0,
        focusLabel: 'Synchronize 冻结 Host 流水线',
      },
      caption:
        'SynchronizeStream 会挂起当前 CPU 线程直到 CQ 收到全部完成回执；在循环内部误放该调用或张量 item() 读取，是触发 Host 气泡与图捕获失败的首要根因。',
    },
  ];
}

export default function StreamEventPipelineExplainer({ title }: { title?: string }) {
  const steps = useMemo(() => buildStreamEventPipelineSteps(), []);
  const resolvedTitle = title ?? 'Host 异步入队、双流 Event 同步与 Fork-Join 并发流水线';
  return (
    <BeatExplainer
      steps={steps}
      title={resolvedTitle}
      label={resolvedTitle}
      stageMinHeight={372}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat }) => {
        const s = step.state;
        const footerH = 44;
        const timelineY = 12;
        const timelineH = 180;
        const metricY = timelineY + timelineH + 14;
        const totalH = metricY + footerH + 12;

        const beatLanes: TimelineLane[] = s.lanes.map((lane, lIdx) => ({
          ...lane,
          blocks: lane.blocks.map((blk) => ({
            ...blk,
            visible: lIdx === 0 ? true : lIdx === 1 ? beat >= 1 : beat >= 2,
          })),
        }));
        const beatSyncs: TimelineSyncEvent[] = s.syncEvents.map((ev) => ({
          ...ev,
          visible: beat >= (ev.toLane === 1 ? 1 : 2),
        }));

        const laneTopY =
          timelineY +
          6 +
          14 +
          (s.focusLane === 'forkjoin' || s.focusLane === 1 ? 48 : s.focusLane === 2 ? 96 : 0);
        const focusH = s.focusLane === 'forkjoin' ? 82 : 34;

        return (
          <Stage width={STAGE_W} height={totalH} label={s.phaseLabel}>
            <SectionBox
              x={8}
              y={timelineY - 2}
              w={STAGE_W - 16}
              h={timelineH + 6}
              tone="neutral"
              dashed={false}
            />
            <SwimlaneTimeline
              x={16}
              y={timelineY + 6}
              w={STAGE_W - 32}
              totalTime={132}
              unit="μs"
              ticks={[0, 30, 60, 90, 120]}
              lanes={beatLanes}
              syncEvents={beatSyncs}
              playhead={beat >= 2 ? s.playhead : undefined}
              laneH={32}
              laneGap={16}
              gutterW={112}
            />

            <ActiveFocusFrame
              x={124}
              y={laneTopY - 1}
              w={STAGE_W - 140}
              h={focusH}
              tone={s.badgeTone}
              label={s.focusLabel}
              visible={beat >= 3}
            />

            <MetricRow
              x={8}
              y={metricY}
              w={STAGE_W - 16}
              h={footerH}
              revealed={beat >= 3}
              metrics={[
                {
                  label: 'CPU 发射耗时',
                  value: s.hostCost,
                  tone: 'active',
                  active: s.stepIndex === 0,
                },
                {
                  label: 'Device 端跨度',
                  value: s.deviceSpan,
                  tone: 'done',
                  active: s.stepIndex === 1 || s.stepIndex === 4,
                },
                {
                  label: '同步原语',
                  value: s.syncMechanism,
                  tone: s.badgeTone,
                  active: s.stepIndex >= 3,
                },
                {
                  label: '依赖保障',
                  value: s.orderSafety,
                  tone: s.badgeTone,
                  active: s.stepIndex === 2 || s.stepIndex === 5,
                },
              ]}
            />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
