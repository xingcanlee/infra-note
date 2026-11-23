import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface AclGraphDynamicControlState {
  stepIndex: number;
  phaseLabel: string;
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
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 传统纯静态图的控制面死结（参数变化与条件分支）',
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
        focusRect: { x: 164, y: 60, w: 348, h: 60, label: '静态假设在此断裂', tone: 'highlight' },
      },
      caption:
        '变长序列会让 Host 侧预计算的 Tiling 与 Workspace 参数在图内固化，而遇到早退/投机循环分支时传统静态图只能被迫中断并 Synchronize 回 CPU 决策。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · TaskGrp 局部划定 isUpdateSinkSqe 可变槽位',
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
          x: 164,
          y: 60,
          w: 150,
          h: 60,
          label: 'aclmdlRICaptureTaskGrp',
          tone: 'active',
        },
      },
      caption:
        '在捕获期用 TaskGrpBegin/End 包裹少数需要随输入变化的算子（例如 Attention PA），Runtime 插入预取 Nop 并按 (streamId, taskId) 在逻辑队列中标出可覆写槽位。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · ExternalEvent + TaskUpdate 在 Replay 前精准补丁',
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
        focusRect: { x: 14, y: 144, w: 322, h: 82, label: 'ExternalEvent 同步护栏', tone: 'done' },
      },
      caption:
        '每次 Replay 前，非捕获 update_stream 在 TaskUpdateBegin/End 内重算 Tiling 并原地覆写 TaskGrp 槽位；ExternalEvent 在更新流触发 record，在图内触发 wait，避免与前图数据打架。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · Conditional Handle：Device 条件槽与默认值复位',
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
          x: 350,
          y: 144,
          w: 316,
          h: 82,
          label: 'CondHandle 8B Device 内存',
          tone: 'highlight',
        },
      },
      caption:
        'aclmdlRICondHandleCreate 在 Device 上分配 8 字节 devAddr 存储条件字；当带 ASSIGN_DEFAULT 标志时，每次父图启动前由 PreModelExecute 自动将 Host 默认值 H2D 复位到 devAddr。',
    },
    {
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · 条件子图捕获与共享 Notify 收尾闭合',
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
          y: 238,
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
      state: {
        stepIndex: 5,
        phaseLabel: 'Step 6 · Device 上 IF / WHILE / SWITCH 全硬件流控原地连续运行',
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
          y: 34,
          w: STAGE_W - 28,
          h: 292,
          label: '动态参数与条件控制全硬件协奏',
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
    <Explainer steps={steps} title={resolvedTitle} label={resolvedTitle}>
      {(step) => {
        const s = step.state;
        const yHeader = 14;
        const yParent = 34;
        const parentH = 98;
        const yMid = 144;
        const midH = 82;
        const ySub = 238;
        const subH = 88;
        const yMetric = 338;
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
              y={yParent + 30}
              w={118}
              h={52}
              tone="done"
              name="op1: Norm"
              shape="静态 SQE"
              labelMode="inside"
            />
            <TensorBlock
              x={168}
              y={yParent + 30}
              w={142}
              h={52}
              tone={s.slot2Tone}
              name={s.slot2Label}
              shape={s.stepIndex >= 1 ? '可覆写槽位' : '静态固化'}
              labelMode="inside"
              active={s.stepIndex === 1 || s.stepIndex === 2}
            />
            <TensorBlock
              x={332}
              y={yParent + 30}
              w={176}
              h={52}
              tone={s.condTaskTone}
              name={s.condTaskLabel}
              shape={s.stepIndex >= 3 ? 'SQE+1 = notify wait' : '控制流断点'}
              labelMode="inside"
              active={s.stepIndex >= 3}
            />
            <TensorBlock
              x={530}
              y={yParent + 30}
              w={122}
              h={52}
              tone="done"
              name="opN: LMHead"
              shape="恢复父流"
              labelMode="inside"
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
                [508, yParent + 56],
                [530, yParent + 56],
              ]}
              tone={s.stepIndex >= 4 ? 'done' : 'neutral'}
              active={s.stepIndex >= 4}
              arrowEnd
            />

            {/* Middle Control Mechanisms: ExternalEvent / UpdateStream & CondHandle */}
            <SectionBox
              x={14}
              y={yMid}
              w={322}
              h={midH}
              title="更新流与 ExternalEvent 同步"
              tone={s.showExtEvent ? 'done' : 'neutral'}
            />
            <TensorBlock
              x={26}
              y={yMid + 26}
              w={136}
              h={44}
              tone={s.showExtEvent ? 'done' : 'neutral'}
              muted={!s.showExtEvent}
              name="update_stream"
              shape={s.showExtEvent ? 'TaskUpdate + record' : '待 Replay 前更新'}
              labelMode="inside"
            />
            <TensorBlock
              x={182}
              y={yMid + 26}
              w={142}
              h={44}
              tone={s.showExtEvent ? 'highlight' : 'neutral'}
              muted={!s.showExtEvent}
              name="ExternalEvent"
              shape={s.showExtEvent ? '图内 wait/reset' : '未启用'}
              labelMode="inside"
            />
            <DataFlowArrow
              points={[
                [162, yMid + 48],
                [182, yMid + 48],
              ]}
              tone="done"
              active={s.showExtEvent}
              muted={!s.showExtEvent}
              arrowEnd
            />
            {s.showExtEvent && (
              <DataFlowArrow
                points={[
                  [253, yMid + 26],
                  [253, yParent + 82],
                ]}
                tone="done"
                active
                flow
                arrowEnd
              />
            )}

            <SectionBox
              x={350}
              y={yMid}
              w={316}
              h={midH}
              title="CondHandle 条件句柄与默认值初始化"
              tone={s.showCondHandle ? 'highlight' : 'neutral'}
            />
            <TensorBlock
              x={364}
              y={yMid + 26}
              w={132}
              h={44}
              tone={s.showCondHandle ? 'active' : 'neutral'}
              muted={!s.showCondHandle}
              name="Host defaultVal"
              shape="PreExecute H2D"
              labelMode="inside"
            />
            <TensorBlock
              x={516}
              y={yMid + 26}
              w={136}
              h={44}
              tone={s.showCondHandle ? 'highlight' : 'neutral'}
              muted={!s.showCondHandle}
              name="devAddr_ (8B)"
              shape="Device 算子可写"
              labelMode="inside"
            />
            <DataFlowArrow
              points={[
                [496, yMid + 48],
                [516, yMid + 48],
              ]}
              tone="highlight"
              active={s.showCondHandle}
              muted={!s.showCondHandle}
              arrowEnd
            />
            {s.showCondHandle && (
              <DataFlowArrow
                points={[
                  [584, yMid + 26],
                  [584, 136],
                  [450, 136],
                  [450, yParent + 82],
                ]}
                tone="highlight"
                active
                flow
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
            />
            {s.showSubGraphs && (
              <>
                <DataFlowArrow
                  points={[
                    [390, yParent + 82],
                    [390, 138],
                    [338, 138],
                    [338, 232],
                    [260, 232],
                    [260, ySub + 28],
                  ]}
                  tone="active"
                  active
                  dashed
                  arrowEnd
                />
                <DataFlowArrow
                  points={[
                    [292, ySub + 28],
                    [292, 232],
                    [346, 232],
                    [346, 138],
                    [430, 138],
                    [430, yParent + 82],
                  ]}
                  tone="done"
                  active
                  flow
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
              visible={true}
            />

            <MetricRow
              x={8}
              y={yMetric}
              w={STAGE_W - 16}
              h={metricH}
              metrics={[
                { label: 'CPU-Device 往返', value: s.hostCpuTrips, tone: 'active', active: true },
                { label: '逻辑流刷新机制', value: s.sqPatchMode, tone: 'done' },
                { label: '条件寄存器状态', value: s.condValueText, tone: 'highlight' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
