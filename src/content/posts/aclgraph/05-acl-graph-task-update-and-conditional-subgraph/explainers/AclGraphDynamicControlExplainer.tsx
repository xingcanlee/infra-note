import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { BeatExplainer, defaultBeats, type BeatSpec } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface AclGraphDynamicControlState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
  beats: BeatSpec[];
  slot2Label: string;
  slot2Tone: AnyTone;
  condTaskLabel: string;
  condTaskTone: AnyTone;
  showExtEvent: boolean;
  showCondHandle: boolean;
  showSubGraphs: boolean;
  activeBranch: 'none' | 'left' | 'right' | 'loop';
  hostCpuTrips: string;
  sqPatchMode: string;
  condValueText: string;
  focusRect: { x: number; y: number; w: number; h: number; label: string; tone: AnyTone };
}

export function buildAclGraphDynamicControlSteps(): Step<AclGraphDynamicControlState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: '静态断点',
      duration: 4600,
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 传统纯静态图的控制面断点（参数变化与条件分支）',
        formulaTex: '$N_{\\text{sync}} \\ge 1/\\text{步} \\Rightarrow \\text{重录或退回 CPU}$',
        beats: defaultBeats([
          '建立父 ACL Graph 主逻辑流',
          '变长序列暴露 Tiling 固化限制',
          '分支与循环触发退回 CPU 截断',
          '汇总纯静态控制面开销',
        ]),
        slot2Label: 'FIA Tiling (固化)',
        slot2Tone: 'highlight',
        condTaskLabel: '截断：退回 CPU',
        condTaskTone: 'highlight',
        showExtEvent: false,
        showCondHandle: false,
        showSubGraphs: false,
        activeBranch: 'none',
        hostCpuTrips: '$N_{\\text{sync}} \\ge 1$ / 步',
        sqPatchMode: '全图重录',
        condValueText: '无 Device 条件字',
        focusRect: { x: 168, y: 50, w: 342, h: 56, label: '静态假设在此断裂', tone: 'highlight' },
      },
      caption:
        '变长序列会让 Host 侧预计算的 Tiling 与 Workspace 参数在图内固化，而遇到早退/投机循环分支时传统静态图只能被迫中断并 Synchronize 回 CPU 决策。',
    },
    {
      label: '槽位标定',
      duration: 4600,
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · TaskGrp 局部划定 isUpdateSinkSqe 可变槽位',
        formulaTex:
          '$\\text{TaskGrp} \\mapsto (\\text{streamId}, \\text{taskId})\\text{ 可覆写槽}$',
        beats: defaultBeats([
          '展开父流连续静态节点',
          '用 TaskGrp 包裹可变 PA 算子',
          '在逻辑 SQE 标出局部覆写锚点',
          '保持零重录静态拓扑',
        ]),
        slot2Label: 'TaskGrp[0] (PA)',
        slot2Tone: 'active',
        condTaskLabel: 'op3 (静态)',
        condTaskTone: 'neutral',
        showExtEvent: false,
        showCondHandle: false,
        showSubGraphs: false,
        activeBranch: 'none',
        hostCpuTrips: '$0$ 次重录',
        sqPatchMode: 'Preload + Slot 标记',
        condValueText: '未开启条件分支',
        focusRect: {
          x: 168,
          y: 50,
          w: 142,
          h: 56,
          label: 'aclmdlRICaptureTaskGrp',
          tone: 'active',
        },
      },
      caption:
        '在捕获期用 TaskGrpBegin/End 包裹少数需要随输入变化的算子（例如 Attention PA），Runtime 插入预取 Nop 并按 (streamId, taskId) 在逻辑队列中标出可覆写槽位。',
    },
    {
      label: '更新补丁',
      duration: 4600,
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · ExternalEvent + TaskUpdate 在 Replay 前原地补丁',
        formulaTex: '$\\text{TaskUpdate} \\xrightarrow{\\text{ExtEvent}} \\text{Patch SQE}$',
        beats: defaultBeats([
          '激活异步 update_stream 重算',
          'ExternalEvent 在流间建立等待边',
          '原地覆写父图内 PA SQE 槽位',
          '实现零阻塞热更新流水',
        ]),
        slot2Label: 'Updated PA SQE',
        slot2Tone: 'done',
        condTaskLabel: 'op3 (静态)',
        condTaskTone: 'neutral',
        showExtEvent: true,
        showCondHandle: false,
        showSubGraphs: false,
        activeBranch: 'none',
        hostCpuTrips: '零阻塞流水更新',
        sqPatchMode: 'UpdateStream 一对一覆写',
        condValueText: 'ExternalEvent 保序',
        focusRect: { x: 14, y: 136, w: 310, h: 82, label: 'ExternalEvent 护栏', tone: 'done' },
      },
      caption:
        '每次 Replay 前，非捕获 update_stream 在 TaskUpdateBegin/End 内重算 Tiling 并原地覆写 TaskGrp 槽位；ExternalEvent 在更新流触发 record，在图内触发 wait，避免与前图数据冲突。',
    },
    {
      label: '条件句柄',
      duration: 4600,
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · Conditional Handle：Device 条件槽与默认值复位',
        formulaTex:
          '$*\\text{devAddr} \\leftarrow \\text{defaultValue}\\; (\\text{Device 8B 条件字})$',
        beats: defaultBeats([
          'Host 在 PreExecute 下发默认初值',
          '写入 Device 端 8 字节 devAddr_',
          '将条件指针注入父流 AddCondTask',
          '确认 0 次 CPU 读回判别',
        ]),
        slot2Label: 'TaskGrp[0] (PA)',
        slot2Tone: 'neutral',
        condTaskLabel: 'aclmdlRIAddCondTask',
        condTaskTone: 'highlight',
        showExtEvent: false,
        showCondHandle: true,
        showSubGraphs: false,
        activeBranch: 'none',
        hostCpuTrips: '$0$ 次 CPU 读回',
        sqPatchMode: '父图内写 CondTask SQE',
        condValueText: '$*\\text{devAddr} \\leftarrow \\text{defaultValue}$',
        focusRect: {
          x: 362,
          y: 136,
          w: 304,
          h: 82,
          label: '8B Device 内存',
          tone: 'highlight',
        },
      },
      caption:
        'aclmdlRICondHandleCreate 在 Device 上分配 8 字节 devAddr 存储条件字；当带 ASSIGN_DEFAULT 标志时，每次父图启动前由 PreModelExecute 自动将 Host 默认值 H2D 复位到 devAddr。',
    },
    {
      label: '子图捕获',
      duration: 4600,
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · 条件子图捕获与共享 Notify 汇合配对',
        formulaTex:
          '$\\text{CondTask} \\to \\text{SubModel}_{0/1} \\xrightarrow{\\text{Notify}} \\text{Wait}$',
        beats: defaultBeats([
          '读取 devAddr_ 判定待选分支',
          '沿中间通道向下派发 SubModel 0',
          '共用 notify 回传父流唤醒 LMHead',
          '检查父子图等待配对完整',
        ]),
        slot2Label: 'TaskGrp[0] (PA)',
        slot2Tone: 'neutral',
        condTaskLabel: 'CondTask + NtyWait',
        condTaskTone: 'active',
        showExtEvent: false,
        showCondHandle: true,
        showSubGraphs: true,
        activeBranch: 'left',
        hostCpuTrips: '$0$ 次 CPU 同步',
        sqPatchMode: 'CaptureToModelRIBegin',
        condValueText: '分支 0/1 共用 Notify',
        focusRect: {
          x: 14,
          y: 236,
          w: 652,
          h: 88,
          label: '条件子图与父图 Wait 配对',
          tone: 'active',
        },
      },
      caption:
        'aclmdlRICaptureToModelRIBegin 把分支代码单独录成 SubModel 0/1；运行时父图根据 devAddr 激活对应子流并在末尾统一发 notify record 唤醒父流上的 notify wait。',
    },
    {
      label: '片上流控',
      duration: 4600,
      state: {
        stepIndex: 5,
        phaseLabel: 'Step 6 · Device 上 IF / WHILE / SWITCH 全硬件流控原地连续运行',
        formulaTex:
          '$\\text{TaskUpdate} \\oplus \\text{CondSubGraph} \\Rightarrow 0\\text{ CPU Sync}$',
        beats: defaultBeats([
          'update_stream 热更新动态参数',
          'CondHandle 条件字直喂 TS 固件',
          '子图循环回写唤醒父流收尾',
          '汇总单次 Replay 全硬件协同',
        ]),
        slot2Label: 'Updated PA SQE',
        slot2Tone: 'done',
        condTaskLabel: 'WHILE 零往返循环',
        condTaskTone: 'done',
        showExtEvent: true,
        showCondHandle: true,
        showSubGraphs: true,
        activeBranch: 'loop',
        hostCpuTrips: '$0$ 次 CPU 干预',
        sqPatchMode: 'TaskUpdate + CondSubGraph',
        condValueText: 'TS 固件直接读 devAddr',
        focusRect: {
          x: 14,
          y: 22,
          w: STAGE_W - 28,
          h: 302,
          label: '动态参数与条件控制片上协奏',
          tone: 'done',
        },
      },
      caption:
        'TaskUpdate 负责更新随 batch 变化的算子参数，Conditional Subgraph 负责在 Device 侧直接读取判定张量执行分支与循环；两者叠加，Host 在整轮推理解码步中只需单次 Replay 提交。',
    },
  ];
}

export default function AclGraphDynamicControlExplainer({ title }: { title?: string }) {
  const steps = useMemo(() => buildAclGraphDynamicControlSteps(), []);
  const resolvedTitle = title ?? 'TaskGrp 局部刷新与 Conditional Subgraph 条件子图机制';
  return (
    <BeatExplainer
      steps={steps}
      title={resolvedTitle}
      label={resolvedTitle}
      stageMinHeight={504}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        const yParent = 22;
        const parentH = 96;
        const yMid = 136;
        const midH = 82;
        const ySub = 236;
        const subH = 88;
        const yMetric = 336;
        const metricH = 44;
        const totalH = yMetric + metricH + 12;

        return (
          <Stage width={STAGE_W} height={totalH} label={s.phaseLabel}>
            {/* Parent Graph Lane */}
            <SectionBox
              x={14}
              y={yParent}
              w={STAGE_W - 28}
              h={parentH}
              title="父 ACL Graph 主逻辑流 (Parent SQ Sequence)"
              tone="active"
            />
            <TensorBlock
              x={28}
              y={yParent + 28}
              w={118}
              h={56}
              tone="done"
              name="op1: Norm"
              shape="静态 SQE"
              labelMode="inside"
            />
            <TensorBlock
              x={168}
              y={yParent + 28}
              w={142}
              h={56}
              tone={s.slot2Tone}
              name={s.slot2Label}
              shape={s.stepIndex >= 1 ? '可覆写槽位' : '静态固化'}
              labelMode="inside"
              active={s.stepIndex === 1 || s.stepIndex === 2}
              dimmed={beat === 0 && s.stepIndex >= 2 && s.showSubGraphs}
            />
            <TensorBlock
              x={332}
              y={yParent + 28}
              w={178}
              h={56}
              tone={s.condTaskTone}
              name={s.condTaskLabel}
              shape={s.stepIndex >= 3 ? 'SQE+1 = notify wait' : '控制流断点'}
              labelMode="inside"
              active={s.stepIndex >= 3}
            />
            <TensorBlock
              x={532}
              y={yParent + 28}
              w={120}
              h={56}
              tone="done"
              name="opN: LMHead"
              shape="恢复父流"
              labelMode="inside"
              dimmed={beat < 2 && s.stepIndex >= 4}
            />

            <DataFlowArrow
              points={[
                [146, yParent + 56],
                [168, yParent + 56],
              ]}
              tone="active"
              active
              arrowEnd
            />
            <DataFlowArrow
              points={[
                [310, yParent + 56],
                [332, yParent + 56],
              ]}
              tone="active"
              active
              arrowEnd
            />
            <DataFlowArrow
              points={[
                [510, yParent + 56],
                [532, yParent + 56],
              ]}
              tone={s.stepIndex >= 4 ? 'done' : 'neutral'}
              active={s.stepIndex >= 4}
              draw={beat >= 2 && s.stepIndex >= 4}
              arrowEnd
            />

            {/* Middle Control Mechanisms */}
            <SectionBox
              x={14}
              y={yMid}
              w={310}
              h={midH}
              title="更新流与 ExternalEvent 同步"
              tone={s.showExtEvent ? 'done' : 'neutral'}
              dimmed={!s.showExtEvent && beat < 1}
            />
            <TensorBlock
              x={24}
              y={yMid + 26}
              w={132}
              h={44}
              tone={s.showExtEvent ? 'done' : 'neutral'}
              muted={!s.showExtEvent}
              name="update_stream"
              shape={s.showExtEvent ? 'TaskUpdate+rec' : '待 Replay 更新'}
              labelMode="inside"
              dimmed={s.showExtEvent && beat < 0}
            />
            <TensorBlock
              x={176}
              y={yMid + 26}
              w={138}
              h={44}
              tone={s.showExtEvent ? 'highlight' : 'neutral'}
              muted={!s.showExtEvent}
              name="ExternalEvent"
              shape={s.showExtEvent ? '图内 wait/reset' : '未启用'}
              labelMode="inside"
              dimmed={s.showExtEvent && beat < 1}
            />
            <DataFlowArrow
              points={[
                [156, yMid + 48],
                [176, yMid + 48],
              ]}
              tone="done"
              active={s.showExtEvent}
              muted={!s.showExtEvent}
              visible={beat >= 1 || !s.showExtEvent}
              arrowEnd
            />
            {s.showExtEvent && (
              <DataFlowArrow
                points={[
                  [245, yMid + 26],
                  [245, yParent + 84],
                ]}
                tone="done"
                label="热更"
                active
                visible={beat >= 1}
                draw={beat >= 1}
                dotToken={beat >= 1 ? dotToken : 0}
                arrowEnd
              />
            )}

            <SectionBox
              x={362}
              y={yMid}
              w={304}
              h={midH}
              title="CondHandle 条件句柄与初值复位"
              tone={s.showCondHandle ? 'highlight' : 'neutral'}
              dimmed={!s.showCondHandle && beat < 1}
            />
            <TensorBlock
              x={372}
              y={yMid + 26}
              w={132}
              h={44}
              tone={s.showCondHandle ? 'active' : 'neutral'}
              muted={!s.showCondHandle}
              name="Host defaultVal"
              shape="PreExecute H2D"
              labelMode="inside"
              dimmed={s.showCondHandle && beat < 1}
            />
            <TensorBlock
              x={524}
              y={yMid + 26}
              w={132}
              h={44}
              tone={s.showCondHandle ? 'highlight' : 'neutral'}
              muted={!s.showCondHandle}
              name="devAddr_ (8B)"
              shape="Device 算子可写"
              labelMode="inside"
              dimmed={s.showCondHandle && beat < 1}
            />
            <DataFlowArrow
              points={[
                [504, yMid + 48],
                [524, yMid + 48],
              ]}
              tone="highlight"
              active={s.showCondHandle}
              muted={!s.showCondHandle}
              visible={beat >= 1 || !s.showCondHandle}
              arrowEnd
            />
            {s.showCondHandle && (
              <DataFlowArrow
                points={[
                  [590, yMid + 26],
                  [590, 126],
                  [462, 126],
                  [462, yParent + 84],
                ]}
                tone="highlight"
                label="条件字"
                active
                visible={beat >= 1}
                draw={beat >= 1}
                dotToken={beat >= 1 ? dotToken : 0}
                arrowEnd
              />
            )}

            {/* SubGraphs Row */}
            <SectionBox
              x={14}
              y={ySub}
              w={STAGE_W - 28}
              h={subH}
              title="条件子图分支池（与父图共用 subModelNotify_）"
              tone={s.showSubGraphs ? 'active' : 'neutral'}
              dimmed={!s.showSubGraphs && beat < 2}
            />
            <TensorBlock
              x={34}
              y={ySub + 28}
              w={286}
              h={48}
              tone={s.activeBranch === 'left' || s.activeBranch === 'loop' ? 'done' : 'neutral'}
              muted={!s.showSubGraphs}
              name="Sub ACL Graph 0 (Stream 6 / True / LoopBody)"
              shape="ops -> aclrtNotifyRecord (subModelNotify_)"
              labelMode="inside"
              active={s.activeBranch === 'left' || s.activeBranch === 'loop'}
              visible={beat >= 2 || !s.showSubGraphs}
            />
            <TensorBlock
              x={360}
              y={ySub + 28}
              w={290}
              h={48}
              tone={s.activeBranch === 'right' ? 'active' : 'neutral'}
              muted={!s.showSubGraphs || s.activeBranch === 'loop'}
              name="Sub ACL Graph 1 (Stream 7 / False 分支)"
              shape="ops -> 共享同一个 subModelNotify_"
              labelMode="inside"
              visible={beat >= 2 || !s.showSubGraphs}
            />
            {s.showSubGraphs && (
              <>
                <DataFlowArrow
                  points={[
                    [392, yParent + 84],
                    [392, 126],
                    [332, 126],
                    [332, 228],
                    [246, 228],
                    [246, ySub + 28],
                  ]}
                  tone="active"
                  label="派发"
                  labelPos={[336, 152]}
                  active
                  dashed
                  visible={beat >= 1}
                  draw={beat >= 1}
                  dotToken={beat >= 1 ? dotToken : 0}
                  arrowEnd
                />
                <DataFlowArrow
                  points={[
                    [292, ySub + 28],
                    [292, 224],
                    [352, 224],
                    [352, 124],
                    [424, 124],
                    [424, yParent + 84],
                  ]}
                  tone="done"
                  label="Notify"
                  labelPos={[348, 196]}
                  active
                  visible={beat >= 2}
                  draw={beat >= 2}
                  dotToken={beat >= 2 ? dotToken : 0}
                  arrowEnd
                />
              </>
            )}

            <ActiveFocusFrame
              x={s.focusRect.x}
              y={s.focusRect.y}
              w={s.focusRect.w}
              h={s.focusRect.h}
              tone={s.focusRect.tone}
              label={s.focusRect.label}
              labelAlign={s.stepIndex >= 2 ? 'right' : 'left'}
              visible={beat >= 2}
            />

            <MetricRow
              x={8}
              y={yMetric}
              w={STAGE_W - 16}
              h={metricH}
              revealed={beat >= 3}
              metrics={[
                { label: 'CPU-Device 往返', value: s.hostCpuTrips, tone: 'active', active: true },
                { label: '逻辑流刷新机制', value: s.sqPatchMode, tone: 'done' },
                { label: '条件寄存器状态', value: s.condValueText, tone: 'highlight' },
              ]}
            />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
