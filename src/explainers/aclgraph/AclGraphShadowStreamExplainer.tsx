import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import SwimlaneTimeline, {
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit/SwimlaneTimeline';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface AclGraphShadowStreamState {
  stepIndex: number;
  phaseLabel: string;
  lanes: readonly TimelineLane[];
  syncEvents: readonly TimelineSyncEvent[];
  playhead: number;
  shadowModelTone: AnyTone;
  argsBackupState: string;
  notifyState: string;
  sqCqState: string;
  costFormula: string;
  focusRect: { x: number; y: number; w: number; h: number; label: string; tone: AnyTone };
}

export function buildAclGraphShadowStreamSteps(): Step<AclGraphShadowStreamState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · Eager 模式 Host-bound 断流空泡（Capture 前基线）',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '逐个算子调度发射',
            blocks: [
              { start: 0, dur: 18, label: 'Launch op1', tone: 'active', active: true },
              { start: 19, dur: 18, label: 'Launch op2', tone: 'active', active: true },
              { start: 38, dur: 18, label: 'Launch op3', tone: 'active', active: true },
              { start: 57, dur: 18, label: 'Launch op4', tone: 'active', active: true },
            ],
          },
          {
            title: 'Stream 1 (用户流)',
            subtitle: '实际计算存在空泡',
            blocks: [
              { start: 18, dur: 10, label: 'op1', tone: 'done' },
              { start: 28, dur: 9, label: '空泡', tone: 'highlight', kind: 'bubble', active: true },
              { start: 37, dur: 10, label: 'op2', tone: 'done' },
              { start: 47, dur: 9, label: '空泡', tone: 'highlight', kind: 'bubble', active: true },
              { start: 56, dur: 10, label: 'op3', tone: 'done' },
              { start: 66, dur: 9, label: '空泡', tone: 'highlight', kind: 'bubble', active: true },
              { start: 75, dur: 10, label: 'op4', tone: 'done' },
            ],
          },
          {
            title: '模型流 (影子流)',
            subtitle: '尚未建立',
            blocks: [
              { start: 0, dur: 95, label: 'Eager 模式下未激活', tone: 'neutral', kind: 'bubble' },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 18, toLane: 1, toAt: 18, tone: 'active' },
          { fromLane: 0, at: 37, toLane: 1, toAt: 37, tone: 'active' },
        ],
        playhead: 75,
        shadowModelTone: 'neutral',
        argsBackupState: '未备份',
        notifyState: '无',
        sqCqState: '逐条实时入队',
        costFormula: '$T_{\\text{eager}} = 4 \\cdot \\max(T_{\\text{launch}}, T_{\\text{kernel}})$',
        focusRect: {
          x: 14,
          y: 88,
          w: STAGE_W - 28,
          h: 36,
          label: 'Host-bound 间隙气泡',
          tone: 'highlight',
        },
      },
      caption:
        'Decode 阶段单算子在 NPU 上仅运行数微秒，而 CPU 侧框架构图与内核校验耗时超过执行时长，Stream 1 频频出现灰色等待气泡。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · CaptureBegin：切换至捕获模式并分配影子模型流',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '进入 StreamCapture 状态',
            blocks: [
              { start: 0, dur: 14, label: 'Task1/2', tone: 'neutral' },
              { start: 15, dur: 16, label: 'CaptureBegin', tone: 'highlight', active: true },
              { start: 32, dur: 22, label: '入队 memcpy/Mul', tone: 'active' },
            ],
          },
          {
            title: 'Stream 1 (用户流)',
            subtitle: '记录起点，暂停物理下发',
            blocks: [
              { start: 4, dur: 18, label: 'Task 1..2', tone: 'done' },
              {
                start: 22,
                dur: 58,
                label: '捕获期间不往物理 SQ 发任务',
                tone: 'neutral',
                dashed: true,
              },
            ],
          },
          {
            title: '模型流 (影子流)',
            subtitle: 'CaptureModel 逻辑流',
            blocks: [
              {
                start: 24,
                dur: 54,
                label: '绑定 Persistent 捕获状态',
                tone: 'highlight',
                active: true,
              },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 0,
            at: 22,
            toLane: 2,
            toAt: 24,
            label: 'Alloc Shadow',
            tone: 'highlight',
            active: true,
          },
        ],
        playhead: 24,
        shadowModelTone: 'highlight',
        argsBackupState: '准备备份槽位',
        notifyState: '待附加 EndGraph',
        sqCqState: '未绑定物理 SQ',
        costFormula: '$\\text{Capture}: \\text{Execution} = 0$',
        focusRect: {
          x: 14,
          y: 128,
          w: STAGE_W - 28,
          h: 36,
          label: '创建影子流',
          tone: 'highlight',
        },
      },
      caption:
        '调用 aclmdlRICaptureBegin 后，Runtime 在内部新建 CaptureModel 与持久化影子流，用户在 Stream 1 上后续下发的任务被重定向到影子模型流，设备端零执行。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · Capture 记录期：参数 D2D 备份与描述符组装',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '截取 Task 参数而不启动',
            blocks: [
              { start: 15, dur: 16, label: 'CaptureBegin', tone: 'neutral' },
              { start: 32, dur: 22, label: 'memcpyAsync', tone: 'active', active: true },
              { start: 55, dur: 22, label: 'aclnnMul', tone: 'active', active: true },
            ],
          },
          {
            title: 'Stream 1 (用户流)',
            subtitle: '作为拓扑锚点',
            blocks: [
              { start: 4, dur: 18, label: 'Task 1..2', tone: 'done' },
              { start: 32, dur: 45, label: '只拦截、不执行', tone: 'neutral', dashed: true },
            ],
          },
          {
            title: '模型流 (影子流)',
            subtitle: '装配 Task 描述符与参数副本',
            blocks: [
              { start: 34, dur: 20, label: 'SQE[0]: memcpy', tone: 'active', active: true },
              { start: 56, dur: 20, label: 'SQE[1]: aclnnMul', tone: 'active', active: true },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 0,
            at: 42,
            toLane: 2,
            toAt: 42,
            label: 'CopyArgs',
            tone: 'active',
            active: true,
          },
        ],
        playhead: 65,
        shadowModelTone: 'active',
        argsBackupState: 'CopyTaskArgsDeviceBuffer',
        notifyState: '记录 Task 依赖',
        sqCqState: '构建 LogicSQ 链表',
        costFormula: '$\\text{D2D Backup} \\to \\text{DevMem}$',
        focusRect: { x: 228, y: 214, w: 208, h: 60, label: 'Device 参数备份', tone: 'active' },
      },
      caption:
        'Runtime 将每次 Launch 的内核参数通过 CopyTaskArgsDeviceBuffer 备份到独立 Device 缓冲，同时生成对应 SQE 描述符保存至逻辑队列，全程遵循用户下发序。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · CaptureEnd：校验合法性与追加 EndGraph Notify Record',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '闭合校验与产出 modelRI',
            blocks: [
              { start: 32, dur: 45, label: '录制完毕', tone: 'neutral' },
              { start: 78, dur: 16, label: 'CaptureEnd', tone: 'highlight', active: true },
            ],
          },
          {
            title: 'Stream 1 (用户流)',
            subtitle: '退出捕获状态，等待图结束',
            blocks: [
              { start: 4, dur: 18, label: 'Task 1..2', tone: 'done' },
              { start: 78, dur: 16, label: 'CheckUnjoined', tone: 'highlight', active: true },
            ],
          },
          {
            title: '模型流 (影子流)',
            subtitle: '尾部自动写入 EndGraph',
            blocks: [
              { start: 34, dur: 20, label: 'memcpy', tone: 'done' },
              { start: 56, dur: 20, label: 'aclnnMul', tone: 'done' },
              { start: 78, dur: 18, label: 'notify record', tone: 'highlight', active: true },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 84,
            toLane: 2,
            toAt: 84,
            label: 'ModelEndGraph',
            tone: 'highlight',
            active: true,
          },
        ],
        playhead: 88,
        shadowModelTone: 'highlight',
        argsBackupState: '已冻结在模型内',
        notifyState: 'EndGraph Notify 绑定',
        sqCqState: '待首次 Replay 申请',
        costFormula: '$\\text{Tail} = \\text{NotifyRecord}$',
        focusRect: { x: 444, y: 214, w: 222, h: 60, label: 'EndGraph 收尾', tone: 'highlight' },
      },
      caption:
        'aclmdlRICaptureEnd 校验所有分叉流是否通过 Event 汇回主捕获流（否则报错 STREAM_UNJOINED），并在影子流末尾调用 ModelEndGraph 写入 notify record 信号。',
    },
    {
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · 多流协同捕获：跨流 Event Fork-Join 扩展图边界',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '向两条流并发录制任务',
            blocks: [
              { start: 10, dur: 16, label: 'Record E1', tone: 'highlight' },
              { start: 27, dur: 22, label: 'S1/S2 录制', tone: 'active', active: true },
              { start: 50, dur: 16, label: 'Join E2', tone: 'highlight' },
            ],
          },
          {
            title: '影子流 0 (主分支)',
            subtitle: '原 Stream 1 映射',
            blocks: [
              { start: 20, dur: 12, label: 'Rec E1', tone: 'highlight' },
              { start: 34, dur: 32, label: 'aclnnMul', tone: 'active', active: true },
              { start: 68, dur: 14, label: 'Wait E2', tone: 'highlight' },
              { start: 82, dur: 14, label: 'NotifyRec', tone: 'done' },
            ],
          },
          {
            title: '影子流 1 (副分支)',
            subtitle: '通过 Wait E1 拖入捕获域',
            blocks: [
              { start: 24, dur: 12, label: 'Wait E1', tone: 'highlight' },
              { start: 36, dur: 30, label: 'Mul + Add', tone: 'done', active: true },
              { start: 66, dur: 10, label: 'Rec E2', tone: 'highlight' },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 26,
            toLane: 2,
            toAt: 28,
            label: 'Fork E1',
            tone: 'highlight',
            active: true,
          },
          {
            fromLane: 2,
            at: 72,
            toLane: 1,
            toAt: 74,
            label: 'Join E2',
            tone: 'highlight',
            active: true,
          },
        ],
        playhead: 74,
        shadowModelTone: 'done',
        argsBackupState: '双流各自独立备份',
        notifyState: '双流同步 -> EndGraph',
        sqCqState: '需分配 2 组硬件 SQ/CQ',
        costFormula: '$N_{\\text{SQ}} = \\text{len}(\\text{StreamList})$',
        focusRect: {
          x: 14,
          y: 128,
          w: STAGE_W - 28,
          h: 40,
          label: '多分支自动归入同一 Graph',
          tone: 'done',
        },
      },
      caption:
        '捕获期间 Stream 1 记录 Event 1 且未捕获的 Stream 2 等待 Event 1，会把 Stream 2 动态拉入同一个 ACL Graph；结束后只需在捕获结束前经由 Event 2 汇合即可通过校验。',
    },
    {
      state: {
        stepIndex: 5,
        phaseLabel: 'Step 6 · Replay 阶段：user stream 发射 model exe + notify wait',
        lanes: [
          {
            title: 'Host 线程',
            subtitle: '一次提交整张静态图',
            blocks: [
              { start: 0, dur: 14, label: 'RIExecuteAsync', tone: 'done', active: true },
              { start: 16, dur: 74, label: 'CPU 完全自由处理下文', tone: 'neutral', dashed: true },
            ],
          },
          {
            title: 'Stream 1 (用户流)',
            subtitle: '顺序注入 2 个轻量控制任务',
            blocks: [
              { start: 4, dur: 12, label: 'Task 3', tone: 'neutral' },
              { start: 18, dur: 10, label: 'model exe', tone: 'highlight', active: true },
              {
                start: 28,
                dur: 34,
                label: 'notify wait (阻塞后文)',
                tone: 'highlight',
                kind: 'bubble',
              },
              { start: 64, dur: 18, label: 'Task n', tone: 'done', active: true },
            ],
          },
          {
            title: '模型流 (影子流)',
            subtitle: '硬件按预建 SQ 零间隙满载运行',
            blocks: [
              { start: 20, dur: 10, label: 'memcpy', tone: 'done', active: true },
              { start: 30, dur: 10, label: 'op2', tone: 'done', active: true },
              { start: 40, dur: 10, label: 'op3', tone: 'done', active: true },
              { start: 50, dur: 10, label: 'op4', tone: 'done', active: true },
              { start: 60, dur: 4, label: 'NtyRec', tone: 'highlight', active: true },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 1,
            at: 20,
            toLane: 2,
            toAt: 20,
            label: 'Trigger',
            tone: 'highlight',
            active: true,
          },
          {
            fromLane: 2,
            at: 62,
            toLane: 1,
            toAt: 64,
            label: '唤醒 Task n',
            tone: 'done',
            active: true,
          },
        ],
        playhead: 64,
        shadowModelTone: 'done',
        argsBackupState: '固定地址零改动',
        notifyState: 'NtyRec 唤醒 NtyWait',
        sqCqState: 'BuildSqCq 绑定物理 SQ/CQ',
        costFormula: '$T_{\\text{replay}} = T_{\\text{exec}} + \\sum T_k$',
        focusRect: { x: 14, y: 214, w: 206, h: 60, label: '物理队列单次 Trigger', tone: 'done' },
      },
      caption:
        '首次 ExecuteAsync 时通过 BuildSqCq 为影子流申请物理 SQ/CQ，随后向用户流下发 model exe 与 notify wait 两个控制任务，硬件触发影子流连续无气泡跑完并在末尾释放用户流上的 Task n。',
    },
  ];
}

export default function AclGraphShadowStreamExplainer({ title }: { title?: string }) {
  const steps = useMemo(() => buildAclGraphShadowStreamSteps(), []);
  const resolvedTitle = title ?? 'ACL Graph 影子模型流与 Capture / Replay 两阶段机制';
  return (
    <Explainer steps={steps} title={resolvedTitle} label={resolvedTitle}>
      {(step) => {
        const s = step.state;
        const yHeader = 14;
        const yTimeline = 32;
        const timelineH = 172;
        const yBoxes = yTimeline + timelineH + 10;
        const boxH = 60;
        const yMetric = yBoxes + boxH + 10;
        const metricH = 44;
        const totalH = yMetric + metricH + 10;

        return (
          <Stage width={STAGE_W} height={totalH} label={s.phaseLabel}>
            <SvgRichLabel
              x={STAGE_W / 2}
              y={yHeader}
              text={s.phaseLabel}
              fontSize={12.5}
              fontWeight={600}
              color="var(--wisp-fg)"
            />

            <SectionBox
              x={8}
              y={yTimeline - 2}
              w={STAGE_W - 16}
              h={timelineH + 4}
              tone="neutral"
              dashed={false}
            />
            <SwimlaneTimeline
              x={16}
              y={yTimeline + 4}
              w={STAGE_W - 32}
              totalTime={96}
              unit="μs"
              ticks={[0, 24, 48, 72, 96]}
              lanes={s.lanes}
              syncEvents={s.syncEvents}
              playhead={s.playhead}
              laneH={32}
              laneGap={8}
              gutterW={116}
            />

            <TensorBlock
              x={14}
              y={yBoxes}
              w={206}
              h={boxH}
              tone={s.stepIndex === 5 ? 'done' : s.shadowModelTone}
              name="物理 SQ/CQ 池绑定"
              shape={s.sqCqState}
              labelMode="inside"
              active={s.stepIndex === 5}
            />
            <TensorBlock
              x={228}
              y={yBoxes}
              w={208}
              h={boxH}
              tone={s.stepIndex === 2 ? 'active' : 'neutral'}
              name="Device Kernel Args 备份"
              shape={s.argsBackupState}
              labelMode="inside"
              active={s.stepIndex === 2}
            />
            <TensorBlock
              x={444}
              y={yBoxes}
              w={222}
              h={boxH}
              tone={s.stepIndex >= 3 ? 'highlight' : 'neutral'}
              name="EndGraph 同步信号链"
              shape={s.notifyState}
              labelMode="inside"
              active={s.stepIndex === 3}
            />

            <DataFlowArrow
              points={[
                [220, yBoxes + boxH / 2],
                [228, yBoxes + boxH / 2],
              ]}
              tone="active"
              active={s.stepIndex >= 2}
              arrowEnd={true}
            />
            <DataFlowArrow
              points={[
                [436, yBoxes + boxH / 2],
                [444, yBoxes + boxH / 2],
              ]}
              tone="highlight"
              active={s.stepIndex >= 3}
              arrowEnd={true}
            />

            <ActiveFocusFrame
              x={s.focusRect.x}
              y={s.focusRect.y}
              w={s.focusRect.w}
              h={s.focusRect.h}
              tone={s.focusRect.tone}
              label={s.focusRect.label}
              visible={true}
            />

            <MetricRow
              x={8}
              y={yMetric}
              w={STAGE_W - 16}
              h={metricH}
              metrics={[
                { label: '关键耗时模型', value: s.costFormula, tone: 'active', active: true },
                {
                  label: '捕获期执行',
                  value:
                    s.stepIndex === 0 ? '即时执行' : s.stepIndex < 5 ? '0 次运行' : '图模式回放',
                  tone: 'highlight',
                },
                {
                  label: '当前图状态',
                  value:
                    s.stepIndex === 5
                      ? 'Replay Ready'
                      : s.stepIndex >= 3
                        ? 'Model End'
                        : 'Capturing',
                  tone: 'done',
                },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
