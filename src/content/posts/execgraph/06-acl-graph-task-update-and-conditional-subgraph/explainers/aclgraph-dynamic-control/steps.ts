import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export type GuardEventMode = 'with_reset' | 'miss_reset';
export type SpecCaseId = 'case_3' | 'case_4' | 'case_1';

export interface AclGraphDynamicControlState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
  slot2Label: string;
  slot2Detail: string;
  slot2Tone: AnyTone;
  condTaskLabel: string;
  condTaskDetail: string;
  condTaskTone: AnyTone;
  extActive: boolean;
  condHandleActive: boolean;
  subGraphsActive: boolean;
  activeBranch: 'none' | 'left' | 'right' | 'loop';
  hostCpuTrips: string;
  sqPatchMode: string;
  condValueText: string;
  badgeTone: AnyTone;
  supportsResetToggle: boolean;
  supportsLoopToggle: boolean;
  focusRect: { x: number; y: number; w: number; h: number; label: string; tone: AnyTone };
  note: string;
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
    label: '完整护栏 (Wait + Reset)',
    sqPatchMode: 'ExtEvent 严格保序覆写',
    badgeTone: 'done',
    focusLabel: 'ExternalEvent.reset 清除旧信号后安全更新',
    note: '主图 Wait 后立即调用 ExternalEvent.reset，确保下一步 update_stream 不会提前冲进正在执行的老槽位。',
  },
  miss_reset: {
    id: 'miss_reset',
    label: '漏调 Reset (跨步读写冲突)',
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
      '连续 4 轮草稿都超过阈值 0.65，TS 固件在芯片内自动连续执行 4 轮子图后交回父流，CPU 零往返。',
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
      label: '静态图动态断点',
      duration: 4500,
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 纯静态图面对变长与分支的两道断点',
        formulaTex:
          '$N_{\\text{sync}} \\ge 1/\\text{步} \\;\\Longrightarrow\\; \\text{重录或退回 CPU}$',
        slot2Label: 'PA Tiling (已固化)',
        slot2Detail: 'seq_kv 变化即失效',
        slot2Tone: 'highlight',
        condTaskLabel: '分支截断回 CPU',
        condTaskDetail: '被迫中断静态执行',
        condTaskTone: 'highlight',
        extActive: false,
        condHandleActive: false,
        subGraphsActive: false,
        activeBranch: 'none',
        hostCpuTrips: '$\\ge 1$ 次同步',
        sqPatchMode: '整图重录',
        condValueText: '无设备条件字',
        badgeTone: 'highlight',
        supportsResetToggle: false,
        supportsLoopToggle: false,
        focusRect: {
          x: 168,
          y: 52,
          w: 344,
          h: 62,
          label: '变长 Tiling 与动态分支迫使静态图断裂',
          tone: 'highlight',
        },
        note: '常规静态图固化了核函数参数与唯一执行路径，无法原地消化每步变化的 KV 长度或条件跳转。',
      },
      caption:
        '变长上下文会让主机预计算的 Tiling 描述符失效，而投机解码的条件循环则迫使传统静态图中断并同步回 CPU 决策。',
    },
    {
      label: '槽位划定与护栏',
      duration: 4700,
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · TaskGrp 槽位划定与 ExternalEvent 护栏防冲突',
        formulaTex:
          '$\\text{TaskGrp} \\mapsto (\\text{streamId},\\, \\text{taskId}) \\xrightarrow{\\text{ExtEvent}} \\text{isUpdateSinkSqe}=1$',
        slot2Label: 'TaskGrp[0] 原地覆写',
        slot2Detail: 'isUpdateSinkSqe=1',
        slot2Tone: 'done',
        condTaskLabel: '后续静态算子',
        condTaskDetail: '零重录保持不动',
        condTaskTone: 'neutral',
        extActive: true,
        condHandleActive: false,
        subGraphsActive: false,
        activeBranch: 'none',
        hostCpuTrips: '$0$ 次重录',
        sqPatchMode: RESET_GUARD_MODES.with_reset.sqPatchMode,
        condValueText: '未开启条件分支',
        badgeTone: 'done',
        supportsResetToggle: true,
        supportsLoopToggle: false,
        focusRect: {
          x: 168,
          y: 52,
          w: 144,
          h: 184,
          label: RESET_GUARD_MODES.with_reset.focusLabel,
          tone: 'done',
        },
        note: RESET_GUARD_MODES.with_reset.note,
      },
      caption:
        'TaskGrp 标出可变算子的 SQE 槽位，重放前在 update_stream 原地刷新 Tiling 并用 ExternalEvent 的 Wait 与 Reset 护栏防止跨步读写冲突。',
    },
    {
      label: '条件复位与切换',
      duration: 4600,
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · CondHandle 8 字节条件字复位与 IF/SWITCH 切换',
        formulaTex:
          '$\\text{PreExecute}: \\text{defaultValue\\_} \\xrightarrow{\\text{H2D}} *\\text{devAddr\\_}$',
        slot2Label: 'Updated PA SQE',
        slot2Detail: 'isUpdateSinkSqe=1',
        slot2Tone: 'done',
        condTaskLabel: 'CondTask (IF/SWITCH)',
        condTaskDetail: 'SQE+1 notify wait',
        condTaskTone: 'active',
        extActive: true,
        condHandleActive: true,
        subGraphsActive: true,
        activeBranch: 'left',
        hostCpuTrips: '$0$ 次 CPU 读回',
        sqPatchMode: 'TaskGrp 原地更新',
        condValueText: 'H2D 复位 = 1 → True',
        badgeTone: 'active',
        supportsResetToggle: false,
        supportsLoopToggle: false,
        focusRect: {
          x: 16,
          y: 172,
          w: 140,
          h: 64,
          label: 'PreExecute 自动 H2D 复位 *devAddr_',
          tone: 'active',
        },
        note: 'CondHandle 分配 8 字节设备条件字并在每次重放前自动 H2D 写回默认值，随后父流按条件字拉起命中分支子图。',
      },
      caption:
        'CondHandle 绑定 8 字节 devAddr_ 并在 ASSIGN_DEFAULT 标志下自动复位默认值；分支点由硬件条件字决定唤醒 SubGraph 0 还是 SubGraph 1。',
    },
    {
      label: '固件派发设备循环',
      duration: 4700,
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · TS 固件直读 *devAddr_ 派发 WHILE 设备自循环',
        formulaTex:
          '$\\text{TS read}(*\\text{devAddr\\_}) \\;\\longrightarrow\\; \\text{while } (*\\text{devAddr\\_} \\neq 0)\\;\\{\\;\\text{DraftVerify}\\;\\}$',
        slot2Label: 'Updated PA SQE',
        slot2Detail: 'isUpdateSinkSqe=1',
        slot2Tone: 'done',
        condTaskLabel: 'WHILE (*devAddr_ ≠ 0)',
        condTaskDetail: 'TS 固件直判循环',
        condTaskTone: 'done',
        extActive: true,
        condHandleActive: true,
        subGraphsActive: true,
        activeBranch: 'loop',
        hostCpuTrips: '$0$ 次 CPU 往返',
        sqPatchMode: 'TaskGrp 原地更新',
        condValueText: SPEC_LOOP_CASES.case_3.condText,
        badgeTone: 'done',
        supportsResetToggle: false,
        supportsLoopToggle: true,
        focusRect: {
          x: 352,
          y: 172,
          w: 314,
          h: 64,
          label: 'WHILE 迭代 3 轮后写 0 自动退出',
          tone: 'done',
        },
        note: SPEC_LOOP_CASES.case_3.summary,
      },
      caption:
        'TS 固件直接在芯片内读取 *devAddr_ 驱动 WHILE 子图多轮校验草稿，置信度跌破阈值时算子写 0 退出并经共享 Notify 唤醒父流。',
    },
  ];
}
