import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import SwimlaneTimeline, {
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit/SwimlaneTimeline';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface StreamEventPipelineState {
  stepIndex: number;
  phaseLabel: string;
  lanes: readonly TimelineLane[];
  syncEvents: readonly TimelineSyncEvent[];
  playhead: number;
  hostCost: string;
  deviceSpan: string;
  syncMechanism: string;
  orderSafety: string;
  badgeText: string;
  badgeTone: AnyTone;
}

export function buildStreamEventPipelineSteps(): Step<StreamEventPipelineState>[] {
  const tones: AnyTone[] = ['active', 'highlight', 'done', 'error'];
  // Notice: highlight=amber, active=blue, done=green; error is rose -> that would be 4 hues!
  // Wait: let's keep strictly <= 3 non-slate hues across the entire component:
  // Use 'active' (blue), 'highlight' (amber), 'done' (green) OR replace error block with 'highlight' + dashed/bubble!
  assertMaxHues(['active', 'highlight', 'done']);
  void tones;

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · Host Write SQ（非阻塞异步入队）',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '仅写入任务描述符',
            blocks: [
              { start: 0, dur: 14, label: 'Launch K1', tone: 'active', active: true },
              { start: 15, dur: 14, label: 'Launch K2', tone: 'active', active: true },
              { start: 30, dur: 14, label: 'Launch K3', tone: 'active', active: true },
            ],
          },
          {
            title: 'Stream 0 (SQ0)',
            subtitle: '计算队列',
            blocks: [
              { start: 10, dur: 32, label: 'K1 MatMul', tone: 'done' },
              { start: 44, dur: 36, label: 'K2 AddNorm', tone: 'neutral', dashed: true },
              { start: 82, dur: 32, label: 'K3 Softmax', tone: 'neutral', dashed: true },
            ],
          },
          {
            title: 'Stream 1 (SQ1)',
            subtitle: '通信/拷贝队列',
            blocks: [{ start: 0, dur: 120, label: '未启用', tone: 'neutral', kind: 'bubble' }],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 7, toLane: 1, toAt: 10, label: '入队', tone: 'active', active: true },
        ],
        playhead: 44,
        hostCost: '$T_{\\text{host}} = 44\\,\\mu\\text{s}$',
        deviceSpan: '$T_{\\text{dev}} = 104\\,\\mu\\text{s}$',
        syncMechanism: 'FIFO（先进先出无同步）',
        orderSafety: '单流天然有序',
        badgeText: '异步队列解耦 CPU 与硬件执行',
        badgeTone: 'active',
      },
      caption:
        'Host 调用异步算子接口仅将描述符写入 SQ 环形缓冲，44 微秒内即可发完三条发射请求并继续执行后续 Python 逻辑，此时 K1 才刚刚在设备端启动。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · 单流严格 FIFO 顺序执行与排队',
        lanes: [
          {
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
            title: 'Stream 0 (SQ0)',
            subtitle: '严格先进先出',
            blocks: [
              { start: 10, dur: 32, label: 'K1 MatMul', tone: 'done', active: true },
              { start: 42, dur: 36, label: 'K2 AddNorm', tone: 'active', active: true },
              { start: 78, dur: 32, label: 'K3 Softmax', tone: 'active', active: true },
            ],
          },
          {
            title: 'Stream 1 (SQ1)',
            subtitle: '通信/拷贝队列',
            blocks: [{ start: 0, dur: 120, label: '闲置', tone: 'neutral', kind: 'bubble' }],
          },
        ],
        syncEvents: [],
        playhead: 110,
        hostCost: '$T_{\\text{host}} = 44\\,\\mu\\text{s}$',
        deviceSpan: '$T_{\\text{dev}} = 100\\,\\mu\\text{s}$',
        syncMechanism: '同队列 FIFO 保障',
        orderSafety: 'K1 < K2 < K3',
        badgeText: '同流保序无需插入任何 Event',
        badgeTone: 'done',
      },
      caption:
        '同一 Stream 映射到同一硬件 SQ，只要 K2 排在 K1 之后写入 SQ，设备侧任务调度器保证 K1 写回并完成后才会启动 K2，无需额外同步原语。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · 双流并发陷阱：缺少 Event 导致的数据竞态',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '跨流发射两个任务',
            blocks: [
              { start: 0, dur: 14, label: 'S0: K1', tone: 'active' },
              { start: 15, dur: 14, label: 'S0: K2 写 X', tone: 'active' },
              { start: 30, dur: 14, label: 'S1: 读 X', tone: 'highlight', active: true },
            ],
          },
          {
            title: 'Stream 0 (SQ0)',
            subtitle: '生产者队列',
            blocks: [
              { start: 10, dur: 32, label: 'K1', tone: 'done' },
              { start: 42, dur: 40, label: 'K2 写入张量 X', tone: 'active', active: true },
            ],
          },
          {
            title: 'Stream 1 (SQ1)',
            subtitle: '消费者队列（越跑越快）',
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
        badgeText: '不同硬件队列相互独立，禁止凭入队顺序猜完成时间',
        badgeTone: 'highlight',
      },
      caption:
        '虽然 Host 在发完 K2 后才往 Stream 1 投入读任务，但两张独立 SQ 的调度速度互相独立；Stream 1 在 32 微秒抢先读取尚未被 K2 写完的显存 X。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · Event Record + StreamWaitEvent 硬件侧接力',
        lanes: [
          {
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
            title: 'Stream 0 (SQ0)',
            subtitle: '生产者完成触发 Notify',
            blocks: [
              { start: 10, dur: 32, label: 'K1', tone: 'done' },
              { start: 42, dur: 36, label: 'K2 写 X', tone: 'active', active: true },
              { start: 78, dur: 8, label: 'E1', tone: 'highlight', active: true },
            ],
          },
          {
            title: 'Stream 1 (SQ1)',
            subtitle: '硬件暂停等 E1 后放行',
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
        badgeText: 'StreamWaitEvent 也是异步发射，只阻塞目标流而不卡 CPU',
        badgeTone: 'done',
      },
      caption:
        'Host 只需在 Stream 0 插入 Record E1，在 Stream 1 插入 Wait E1，便能立刻返回；硬件调度器会在 t=78 确认 K2 写回 HBM 后释放 Stream 1。',
    },
    {
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · Fork-Join 多流并发重叠掩盖通信开销',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '依次下发主分支与副分支',
            blocks: [
              { start: 0, dur: 10, label: 'Fork E1', tone: 'highlight' },
              { start: 11, dur: 18, label: 'S0/S1 任务', tone: 'active' },
              { start: 30, dur: 10, label: 'Join E2', tone: 'highlight' },
            ],
          },
          {
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
            title: 'Stream 1 (SQ1)',
            subtitle: '通信/旁路拷贝流',
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
        badgeText: '通信 50 us 与计算 46 us 并行掩盖，且可整体纳入静态图捕获',
        badgeTone: 'active',
      },
      caption:
        '通过 E1 分叉、E2 汇合的 Fork-Join 模式，Stream 1 与 Stream 0 在中间 46 微秒严格并行；这种起点终点明确的 DAG 正是 CUDA Graph 与 ACL Graph 支持的多流捕获形状。',
    },
    {
      state: {
        stepIndex: 5,
        phaseLabel: 'Step 6 · Host Synchronize 同步屏障（阻塞到 CQ 完成）',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '调用 Synchronize 睡眠等待',
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
            title: 'Stream 0 (SQ0)',
            subtitle: '主计算流',
            blocks: [
              { start: 10, dur: 84, label: '执行完毕', tone: 'done' },
              { start: 94, dur: 24, label: 'DownProj', tone: 'done', active: true },
            ],
          },
          {
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
        badgeText: '高频调用 Synchronize 会瞬间摧毁异步流水线，必须只在必要边界使用',
        badgeTone: 'highlight',
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
    <Explainer steps={steps} title={resolvedTitle} label={resolvedTitle}>
      {(step) => {
        const s = step.state;
        const footerH = 44;
        const timelineY = 30;
        const timelineH = 196;
        const metricY = timelineY + timelineH + 14;
        const totalH = metricY + footerH + 14;

        return (
          <Stage width={STAGE_W} height={totalH} label={s.phaseLabel}>
            <SvgRichLabel
              x={STAGE_W / 2}
              y={14}
              text={s.phaseLabel}
              fontSize={12.5}
              fontWeight={600}
              color="var(--wisp-fg)"
            />

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
              lanes={s.lanes}
              syncEvents={s.syncEvents}
              playhead={s.playhead}
              laneH={34}
              laneGap={10}
              gutterW={112}
            />

            <MetricRow
              x={8}
              y={metricY}
              w={STAGE_W - 16}
              h={footerH}
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
    </Explainer>
  );
}
