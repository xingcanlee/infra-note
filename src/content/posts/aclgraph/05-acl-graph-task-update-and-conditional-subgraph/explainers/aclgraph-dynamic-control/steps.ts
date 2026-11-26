import type { Step } from 'astro-wisp/explainers';
import { defaultBeats, assertMaxHues, type AnyTone, type BeatSpec } from '@/explainers/kit/motion';

export type GuardEventMode = 'with_reset' | 'miss_reset';
export type SpecCaseId = 'case_3' | 'case_4' | 'case_1';

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
  badgeTone: AnyTone;
  supportsResetToggle: boolean;
  supportsLoopToggle: boolean;
  focusRect: { x: number; y: number; w: number; h: number; label: string; tone: AnyTone };
}

export const RESET_GUARD_MODES: Record<
  GuardEventMode,
  {
    id: GuardEventMode;
    label: string;
    sqPatchMode: string;
    badgeTone: AnyTone;
    focusLabel: string;
    note: string;
  }
> = {
  with_reset: {
    id: 'with_reset',
    label: '完整护栏（Wait + Reset）',
    sqPatchMode: 'ExtEvent 严格保序覆写',
    badgeTone: 'done',
    focusLabel: 'ExternalEvent.reset 清除旧信号后安全更新',
    note: '主图 Wait 后立即调用 ExternalEvent.reset，确保下一步 update_stream 不会提前冲进正在执行的老槽位。',
  },
  miss_reset: {
    id: 'miss_reset',
    label: '漏调 Reset（跨步踩踏）',
    sqPatchMode: '残留信号提前放行',
    badgeTone: 'highlight',
    focusLabel: '残留信号导致第 t+1 步覆盖未读完的 SQE',
    note: '若忘记在图内调用 ExternalEvent.reset，残留已触发标志会直接放行下一步读取，引发异步覆写错位。',
  },
};

export const SPEC_LOOP_CASES: Record<
  SpecCaseId,
  {
    id: SpecCaseId;
    label: string;
    probs: readonly number[];
    iters: number;
    condText: string;
    summary: string;
  }
> = {
  case_3: {
    id: 'case_3',
    label: '置信度 [0.91, 0.88, 0.52]',
    probs: [0.91, 0.88, 0.52, 0.8],
    iters: 3,
    condText: '第 3 轮 0.52 < 0.65 → 写 0 退出',
    summary:
      '前 2 轮草稿达标继续，第 3 轮跌破阈值 0.65，子图直接往 *devAddr_ 写 0 结束循环，CPU 零干预。',
  },
  case_4: {
    id: 'case_4',
    label: '置信度 [0.95, 0.92, 0.90, 0.87]',
    probs: [0.95, 0.92, 0.9, 0.87],
    iters: 4,
    condText: '跑满 4 轮全部达标接收',
    summary:
      '连续 4 轮草稿都超过阈值 0.65，TS 固件在芯片内自动连跑 4 轮子图后交回父流，CPU 零往返。',
  },
  case_1: {
    id: 'case_1',
    label: '置信度 [0.40, 0.85, 0.90]',
    probs: [0.4, 0.85, 0.9, 0.88],
    iters: 1,
    condText: '首轮 0.40 < 0.65 → 立刻早退',
    summary: '首轮即未过阈值，子图只跑 1 轮便写 *devAddr_=0 退出，避免把算力浪费在低置信草稿上。',
  },
};

export function buildAclGraphDynamicControlSteps(): Step<AclGraphDynamicControlState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: '静态断点',
      duration: 4500,
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 纯静态图的两道动态断点',
        formulaTex:
          '$N_{\\text{sync}} \\ge 1/\\text{步} \\;\\Longrightarrow\\; \\text{重录或退回 CPU}$',
        beats: defaultBeats([
          '展开父 ACL Graph 主逻辑流',
          'seq_kv 增长让 Host Tiling 失效',
          '动态分支逼迫图退回 CPU 同步',
          '定位需原地破壁的两处节点',
        ]),
        slot2Label: 'PA Tiling (已固化)',
        slot2Tone: 'highlight',
        condTaskLabel: '分支截断回 CPU',
        condTaskTone: 'highlight',
        showExtEvent: false,
        showCondHandle: false,
        showSubGraphs: false,
        activeBranch: 'none',
        hostCpuTrips: '$\\ge 1$ 次同步',
        sqPatchMode: '整图重录',
        condValueText: '无设备条件字',
        badgeTone: 'highlight',
        supportsResetToggle: false,
        supportsLoopToggle: false,
        focusRect: { x: 168, y: 50, w: 342, h: 56, label: '静态假设在此断裂', tone: 'highlight' },
      },
      caption:
        '变长上下文会让主机预计算的 Tiling 描述符失效，而投机解码的条件循环则迫使传统静态图中断并同步回 CPU 决策。',
    },
    {
      label: '槽位划定',
      duration: 4500,
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · TaskGrp 划定可局部覆写槽位',
        formulaTex: '$\\text{TaskGrp} \\mapsto (\\text{streamId},\\, \\text{taskId})\\text{ 槽}$',
        beats: defaultBeats([
          '保留前后不变的投影与 MoE',
          '用 TaskGrp 包裹可变注意力算子',
          '插入预取 Nop 登记槽位坐标',
          '其余静态图节点保持不动',
        ]),
        slot2Label: 'TaskGrp[0] (PA)',
        slot2Tone: 'active',
        condTaskLabel: '后续静态算子',
        condTaskTone: 'neutral',
        showExtEvent: false,
        showCondHandle: false,
        showSubGraphs: false,
        activeBranch: 'none',
        hostCpuTrips: '$0$ 次重录',
        sqPatchMode: 'Preload + Slot 标记',
        condValueText: '未开启条件分支',
        badgeTone: 'active',
        supportsResetToggle: false,
        supportsLoopToggle: false,
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
        '捕获阶段用 TaskGrpBegin/End 框住少数随序列长度变化的算子，Runtime 在逻辑队列上标出可原地覆写的槽位坐标。',
    },
    {
      label: '热更护栏',
      duration: 4700,
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · TaskUpdate 原地补丁与 ExternalEvent 护栏',
        formulaTex:
          '$\\text{TaskUpdate} \\xrightarrow{\\text{ExtEvent}} \\text{isUpdateSinkSqe}=1$',
        beats: defaultBeats([
          'update_stream 重算新 Tiling',
          '一对一覆写对应 PA SQE 描述符',
          'ExternalEvent.record 放行主图',
          '切换对比漏调 Reset 的后果',
        ]),
        slot2Label: 'Updated PA SQE',
        slot2Tone: 'done',
        condTaskLabel: '后续静态算子',
        condTaskTone: 'neutral',
        showExtEvent: true,
        showCondHandle: false,
        showSubGraphs: false,
        activeBranch: 'none',
        hostCpuTrips: '零阻塞流水更新',
        sqPatchMode: RESET_GUARD_MODES.with_reset.sqPatchMode,
        condValueText: '未开启条件分支',
        badgeTone: 'done',
        supportsResetToggle: true,
        supportsLoopToggle: false,
        focusRect: {
          x: 168,
          y: 120,
          w: 142,
          h: 56,
          label: RESET_GUARD_MODES.with_reset.focusLabel,
          tone: 'done',
        },
      },
      caption:
        '重放前在非捕获流 update_stream 上重写 Tiling 槽位并用 ExternalEvent 保序。上方可切换对比漏调 Reset 导致的跨步踩踏。',
    },
    {
      label: '条件复位',
      duration: 4500,
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · CondHandle 8 字节条件字与自动复位',
        formulaTex:
          '$\\text{PreExecute}: \\text{defaultValue\\_} \\xrightarrow{\\text{H2D}} *\\text{devAddr\\_}$',
        beats: defaultBeats([
          '创建绑定 8 字节 devAddr_ 的句柄',
          '设 ASSIGN_DEFAULT 复位标志',
          'PreExecute 自动把默认值写回',
          '保证多轮重放状态幂等起步',
        ]),
        slot2Label: 'Updated PA SQE',
        slot2Tone: 'done',
        condTaskLabel: 'CondTask (*devAddr_)',
        condTaskTone: 'active',
        showExtEvent: true,
        showCondHandle: true,
        showSubGraphs: false,
        activeBranch: 'none',
        hostCpuTrips: '$0$ 次 CPU 读回',
        sqPatchMode: 'TaskGrp 热更',
        condValueText: '自动 H2D 复位 = 1',
        badgeTone: 'active',
        supportsResetToggle: false,
        supportsLoopToggle: false,
        focusRect: {
          x: 368,
          y: 50,
          w: 142,
          h: 56,
          label: 'CondHandle (8B devAddr_)',
          tone: 'active',
        },
      },
      caption:
        'CondHandle 在设备侧分配 8 字节条件字。若带上 ASSIGN_DEFAULT 标志，每次重放前 Runtime 自动把默认值写回设备，保证幂等。',
    },
    {
      label: '固件派发',
      duration: 4500,
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · TS 固件读取 *devAddr_ 派发条件子图',
        formulaTex:
          '$\\text{TS} \\;\\text{read}(*\\text{devAddr\\_}) \\;\\longrightarrow\\; \\text{SubGraph}$',
        beats: defaultBeats([
          '父流发出 CAPTURE_CONDITION',
          '父流紧接 notify wait (SQE+1)',
          'TS 固件直读 HBM 8 字节条件字',
          '不回退 CPU 直接唤醒命中支路',
        ]),
        slot2Label: 'Updated PA SQE',
        slot2Tone: 'done',
        condTaskLabel: 'CondTask (IF/SWITCH)',
        condTaskTone: 'done',
        showExtEvent: true,
        showCondHandle: true,
        showSubGraphs: true,
        activeBranch: 'left',
        hostCpuTrips: '$0$ 次往返',
        sqPatchMode: 'TaskGrp 热更',
        condValueText: 'TS 固件直接判决',
        badgeTone: 'done',
        supportsResetToggle: false,
        supportsLoopToggle: false,
        focusRect: { x: 356, y: 120, w: 144, h: 56, label: '子图连续运行并唤醒父流', tone: 'done' },
      },
      caption:
        '所有分支子图在硬件侧共享同一枚通知字 subModelNotify_。TS 固件读完条件字后直接拉起命中子图，跑完再唤醒挂起的父流。',
    },
    {
      label: '设备循环',
      duration: 4700,
      state: {
        stepIndex: 5,
        phaseLabel: 'Step 6 · 设备侧 WHILE 自循环与投机早退对比',
        formulaTex:
          '$\\text{while } (*\\text{devAddr\\_} \\neq 0)\\; \\{\\; \\text{DraftVerify} \\;\\}$',
        beats: defaultBeats([
          'WHILE 支路单轮校验草稿置信度',
          '不达标时算子直接写 *devAddr_=0',
          '达标则经 Notify 回环继续下一轮',
          '切换不同置信度序列观察迭代次数',
        ]),
        slot2Label: 'Updated PA SQE',
        slot2Tone: 'done',
        condTaskLabel: 'WHILE (*devAddr_ != 0)',
        condTaskTone: 'done',
        showExtEvent: true,
        showCondHandle: true,
        showSubGraphs: true,
        activeBranch: 'loop',
        hostCpuTrips: '$0$ 次 CPU 干预',
        sqPatchMode: 'TaskGrp 热更',
        condValueText: SPEC_LOOP_CASES.case_3.condText,
        badgeTone: 'done',
        supportsResetToggle: false,
        supportsLoopToggle: true,
        focusRect: {
          x: 356,
          y: 120,
          w: 300,
          h: 56,
          label: '设备自循环零 CPU 往返退出',
          tone: 'done',
        },
      },
      caption:
        '开启 WHILE 条件子图后，投机校验在芯片内自动多轮迭代直至置信度跌破阈值写 0 退出。下方可切换三组置信度序列验证退出轮数。',
    },
  ];
}
