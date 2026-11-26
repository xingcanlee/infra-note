import type { Step } from 'astro-wisp/explainers';
import { defaultBeats, assertMaxHues, type AnyTone, type BeatSpec } from '@/explainers/kit/motion';
import type { TimelineLane, TimelineSyncEvent } from '@/explainers/kit/SwimlaneTimeline';

export type ArgsBackupMode = 'with_d2d' | 'no_d2d';

export interface AclGraphShadowStreamState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
  beats: BeatSpec[];
  lanes: readonly TimelineLane[];
  syncEvents: readonly TimelineSyncEvent[];
  playhead: number;
  argsBackupState: string;
  notifyState: string;
  sqCqState: string;
  badgeTone: AnyTone;
  focusLabel: string;
  supportsBackupToggle: boolean;
}

export const BACKUP_COMPARE_MODES: Record<
  ArgsBackupMode,
  {
    id: ArgsBackupMode;
    label: string;
    argsBackupState: string;
    sqCqState: string;
    badgeTone: AnyTone;
    focusLabel: string;
    note: string;
  }
> = {
  with_d2d: {
    id: 'with_d2d',
    label: '开启 CopyTaskArgsDeviceBuffer（D2D 快照）',
    argsBackupState: 'D2D 持久备份 (8, 128)',
    sqCqState: '影子流读持久副本',
    badgeTone: 'done',
    focusLabel: '图外修改临时参数区，图内参数依然完整保留',
    note: 'CANN Runtime 申请带 Backup 标志的持久显存并做 D2D 拷贝，彻底隔离图外运算对临时 args 区的覆写。',
  },
  no_d2d: {
    id: 'no_d2d',
    label: '跳过参数备份（图外覆写污染）',
    argsBackupState: '指向易变临时区 (999, 128)',
    sqCqState: '影子流读到错误维度',
    badgeTone: 'highlight',
    focusLabel: '图外 Eager 算子覆盖临时参数区导致重放算错',
    note: '若直接引用临时 comm.args，后续 Eager 任务就会覆盖原地指针，导致静态图重放时读取错位维度。',
  },
};

export const BASE_TIMELINES: Record<number, { lanes: TimelineLane[]; syncs: TimelineSyncEvent[] }> =
  {
    0: {
      lanes: [
        {
          id: 'host',
          title: 'Host 线程',
          subtitle: '逐个构造并发射算子',
          blocks: [
            { start: 0, dur: 16, label: 'Launch K1', tone: 'active', active: true },
            { start: 17, dur: 16, label: 'Launch K2', tone: 'active', active: true },
            { start: 34, dur: 16, label: 'Launch K3', tone: 'active', active: true },
            { start: 51, dur: 16, label: 'Launch K4', tone: 'active', active: true },
          ],
        },
        {
          id: 'user',
          title: 'Stream 1 (用户流)',
          subtitle: '暴露 Host 等待气泡',
          blocks: [
            { start: 16, dur: 8, label: 'K1', tone: 'done' },
            { start: 24, dur: 9, label: '空泡', tone: 'highlight', kind: 'bubble', active: true },
            { start: 33, dur: 8, label: 'K2', tone: 'done' },
            { start: 41, dur: 9, label: '空泡', tone: 'highlight', kind: 'bubble', active: true },
            { start: 50, dur: 8, label: 'K3', tone: 'done' },
            { start: 58, dur: 9, label: '空泡', tone: 'highlight', kind: 'bubble', active: true },
            { start: 67, dur: 8, label: 'K4', tone: 'done' },
          ],
        },
        {
          id: 'shadow',
          title: 'Shadow Stream',
          subtitle: '尚未建立',
          blocks: [
            { start: 0, dur: 90, label: 'Eager 模式下未激活', tone: 'neutral', kind: 'bubble' },
          ],
        },
      ],
      syncs: [
        { fromLane: 0, at: 16, toLane: 1, toAt: 16, tone: 'active' },
        { fromLane: 0, at: 33, toLane: 1, toAt: 33, tone: 'active' },
      ],
    },
    1: {
      lanes: [
        {
          id: 'host',
          title: 'Host 线程',
          subtitle: 'CaptureBegin 切入录制',
          blocks: [
            { start: 0, dur: 18, label: 'CaptureBegin(S1)', tone: 'active', active: true },
            { start: 18, dur: 54, label: '截获算子写入内存', tone: 'active' },
          ],
        },
        {
          id: 'user',
          title: 'Stream 1 (用户流)',
          subtitle: '前期正常算，捕获期不落硬件',
          blocks: [
            { start: 0, dur: 18, label: '前置 Eager 任务', tone: 'done' },
            { start: 18, dur: 72, label: '捕获期间零硬件执行', tone: 'neutral', kind: 'bubble' },
          ],
        },
        {
          id: 'shadow',
          title: 'Shadow Stream',
          subtitle: '新建 LogicSQ 链表',
          blocks: [{ start: 18, dur: 72, label: '等待接收重定向算子', tone: 'done', active: true }],
        },
      ],
      syncs: [
        {
          fromLane: 0,
          at: 18,
          toLane: 2,
          toAt: 18,
          label: '建影子流',
          tone: 'active',
          active: true,
        },
      ],
    },
    2: {
      lanes: [
        {
          id: 'host',
          title: 'Host 线程',
          subtitle: '提交 K1..K4 进 CaptureSession',
          blocks: [
            { start: 0, dur: 16, label: 'K1', tone: 'active' },
            { start: 16, dur: 16, label: 'K2', tone: 'active' },
            { start: 32, dur: 16, label: 'K3', tone: 'active' },
            { start: 48, dur: 16, label: 'K4', tone: 'active' },
          ],
        },
        {
          id: 'user',
          title: 'Stream 1 (用户流)',
          subtitle: '算子被重定向转发',
          blocks: [
            {
              start: 0,
              dur: 90,
              label: 'IsSoftwareSqEnable 拦截',
              tone: 'neutral',
              kind: 'bubble',
            },
          ],
        },
        {
          id: 'shadow',
          title: 'Shadow Stream',
          subtitle: 'LogicSQ + D2D 参数备份',
          blocks: [
            { start: 16, dur: 14, label: 'K1+Args', tone: 'done', active: true },
            { start: 32, dur: 14, label: 'K2+Args', tone: 'done', active: true },
            { start: 48, dur: 14, label: 'K3+Args', tone: 'done', active: true },
            { start: 64, dur: 14, label: 'K4+Args', tone: 'done', active: true },
          ],
        },
      ],
      syncs: [
        { fromLane: 0, at: 16, toLane: 2, toAt: 16, label: 'D2D 备份', tone: 'done', active: true },
      ],
    },
    3: {
      lanes: [
        {
          id: 'host',
          title: 'Host 线程',
          subtitle: 'CaptureEnd 校验拓扑闭合',
          blocks: [
            { start: 0, dur: 30, label: 'CheckValidity', tone: 'active', active: true },
            { start: 30, dur: 36, label: '冻结 modelRI', tone: 'done', active: true },
          ],
        },
        {
          id: 'user',
          title: 'Stream 1 (用户流)',
          subtitle: '未占物理 SQ/CQ 槽位',
          blocks: [
            {
              start: 0,
              dur: 90,
              label: '仅记录逻辑图，物理队列未分配',
              tone: 'neutral',
              kind: 'bubble',
            },
          ],
        },
        {
          id: 'shadow',
          title: 'Shadow Stream',
          subtitle: '追加 EndGraph 通知尾节点',
          blocks: [
            { start: 0, dur: 54, label: 'K1..K4 LogicSQ', tone: 'done' },
            {
              start: 54,
              dur: 32,
              label: 'NotifyRecord(EndGraph)',
              tone: 'highlight',
              active: true,
            },
          ],
        },
      ],
      syncs: [
        {
          fromLane: 0,
          at: 54,
          toLane: 2,
          toAt: 54,
          label: 'EndGraph',
          tone: 'highlight',
          active: true,
        },
      ],
    },
    4: {
      lanes: [
        {
          id: 'host',
          title: 'Host 线程',
          subtitle: '首次 Replay 触发 BuildSqCq',
          blocks: [
            { start: 0, dur: 26, label: 'PreModelExecute', tone: 'highlight', active: true },
            { start: 26, dur: 18, label: 'ExecuteAsync', tone: 'done', active: true },
          ],
        },
        {
          id: 'user',
          title: 'Stream 1 (用户流)',
          subtitle: '懒分配物理通道',
          blocks: [
            { start: 26, dur: 14, label: 'model exe', tone: 'active' },
            {
              start: 40,
              dur: 44,
              label: 'notify wait (芯片内等)',
              tone: 'neutral',
              kind: 'bubble',
            },
          ],
        },
        {
          id: 'shadow',
          title: 'Shadow Stream',
          subtitle: '首次绑定物理 SQ/CQ',
          blocks: [
            { start: 26, dur: 14, label: 'BuildSqCq', tone: 'highlight', active: true },
            { start: 40, dur: 44, label: 'K1..K4 + NotifyRec', tone: 'done', active: true },
          ],
        },
      ],
      syncs: [
        {
          fromLane: 1,
          at: 36,
          toLane: 2,
          toAt: 36,
          label: 'Trigger',
          tone: 'active',
          active: true,
        },
        { fromLane: 2, at: 84, toLane: 1, toAt: 84, label: '唤醒', tone: 'done', active: true },
      ],
    },
    5: {
      lanes: [
        {
          id: 'host',
          title: 'Host 线程',
          subtitle: '单条 Trigger 后立即返回',
          blocks: [{ start: 0, dur: 14, label: 'Launch modelRI', tone: 'done', active: true }],
        },
        {
          id: 'user',
          title: 'Stream 1 (用户流)',
          subtitle: '硬件内部挂起等待唤醒',
          blocks: [
            { start: 0, dur: 12, label: 'task3', tone: 'active' },
            { start: 14, dur: 12, label: 'exe', tone: 'done' },
            {
              start: 26,
              dur: 42,
              label: 'notify wait (无 CPU 阻塞)',
              tone: 'neutral',
              kind: 'bubble',
            },
            { start: 68, dur: 16, label: 'taskN', tone: 'done', active: true },
          ],
        },
        {
          id: 'shadow',
          title: 'Shadow Stream',
          subtitle: 'TS 固件满载无气泡连跑',
          blocks: [
            { start: 20, dur: 10, label: 'K1', tone: 'done', active: true },
            { start: 30, dur: 12, label: 'K2', tone: 'done', active: true },
            { start: 42, dur: 14, label: 'K3', tone: 'done', active: true },
            { start: 56, dur: 12, label: 'K4+Notify', tone: 'done', active: true },
          ],
        },
      ],
      syncs: [
        {
          fromLane: 1,
          at: 20,
          toLane: 2,
          toAt: 20,
          label: 'Trigger',
          tone: 'active',
          active: true,
        },
        { fromLane: 2, at: 68, toLane: 1, toAt: 68, label: 'Notify', tone: 'done', active: true },
      ],
    },
  };

export function buildAclGraphShadowStreamSteps(): Step<AclGraphShadowStreamState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: 'Eager 基线',
      duration: 4500,
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · Eager 模式 Host-bound 断流空泡',
        formulaTex:
          '$T_{\\text{eager}} = 4 \\cdot \\max(T_{\\text{launch}},\\, T_{\\text{kernel}})$',
        beats: defaultBeats([
          'Host 逐条发射 K1..K4',
          'Stream 1 间隙露出密集空泡',
          '影子模型流与物理池未建立',
          '确认待消除的发射气泡',
        ]),
        lanes: BASE_TIMELINES[0].lanes,
        syncEvents: BASE_TIMELINES[0].syncs,
        playhead: 67,
        argsBackupState: '未备份',
        notifyState: '无',
        sqCqState: '逐条实时入队',
        badgeTone: 'highlight',
        focusLabel: 'Host 发射慢于执行，硬件反复等单',
        supportsBackupToggle: false,
      },
      caption:
        '在 Eager 模式下逐算子发射，主机耗时超过设备执行时长，Stream 1 频频停下等待下一条任务单。',
    },
    {
      label: '开启捕获',
      duration: 4500,
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · CaptureBegin 切换录制并建立影子流',
        formulaTex: '$\\text{CaptureBegin} \\;\\Longrightarrow\\; \\text{Execution} = 0$',
        beats: defaultBeats([
          'Host 调用 CaptureBegin(S1)',
          '拦截用户流后续任务不落硬件',
          '内部配对新建 Shadow Stream',
          '前置 Eager 任务仍正常跑完',
        ]),
        lanes: BASE_TIMELINES[1].lanes,
        syncEvents: BASE_TIMELINES[1].syncs,
        playhead: 72,
        argsBackupState: '等待捕获算子',
        notifyState: '准备分配',
        sqCqState: '仅建内存态 LogicSQ',
        badgeTone: 'active',
        focusLabel: '新建 Shadow Stream 接管后续录制',
        supportsBackupToggle: false,
      },
      caption:
        '调用 aclmdlRICaptureBegin 后，Runtime 配对新建一条影子模型流，随后投入用户流的算子不会在芯片上真正执行。',
    },
    {
      label: 'D2D 备份',
      duration: 4700,
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · LogicSQ 重定向与参数 D2D 持久备份',
        formulaTex: '$\\text{comm.args} \\xrightarrow{\\text{D2D}} \\text{BackupBuf}$',
        beats: defaultBeats([
          '算子描述符转发进 LogicSQ',
          '检查临时 comm.args 生命周期',
          '触发 CopyTaskArgsDeviceBuffer',
          '切换对照是否跳过参数备份',
        ]),
        lanes: BASE_TIMELINES[2].lanes,
        syncEvents: BASE_TIMELINES[2].syncs,
        playhead: 78,
        argsBackupState: BACKUP_COMPARE_MODES.with_d2d.argsBackupState,
        notifyState: '待 EndGraph 追加',
        sqCqState: BACKUP_COMPARE_MODES.with_d2d.sqCqState,
        badgeTone: 'done',
        focusLabel: BACKUP_COMPARE_MODES.with_d2d.focusLabel,
        supportsBackupToggle: true,
      },
      caption:
        '昇腾算子参数体驻留在易变的临时区。上方可切换对比 D2D 持久备份与跳过备份时，图外任务修改临时缓冲对重放的影响。',
    },
    {
      label: '闭合收尾',
      duration: 4500,
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · CaptureEnd 闭合校验与 EndGraph 追加',
        formulaTex: '$\\text{CheckValidity} \\;\\to\\; \\text{Append(NotifyRecord)}$',
        beats: defaultBeats([
          '校验所有分叉副流是否汇回原点',
          '在影子流尾插 EndGraph Notify',
          '冻结拓扑并产出句柄 modelRI',
          '此时仍不提前抢占物理 SQ/CQ',
        ]),
        lanes: BASE_TIMELINES[3].lanes,
        syncEvents: BASE_TIMELINES[3].syncs,
        playhead: 86,
        argsBackupState: '持久副本已锁定',
        notifyState: '尾部 NotifyRecord',
        sqCqState: '延迟至首次重放分配',
        badgeTone: 'active',
        focusLabel: '未汇合副流在此处报错 0x0703001F',
        supportsBackupToggle: false,
      },
      caption:
        '结束捕获时 Runtime 校验多流 Fork-Join 闭合性，并在影子流末尾追加一条 EndGraph 通知记录后冻结图结构。',
    },
    {
      label: '首次懒绑',
      duration: 4500,
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · 首次 Replay 懒分配物理 SQ/CQ 队列',
        formulaTex: '$\\text{PreModelExecute} \\;\\to\\; \\text{BuildSqCq} \\le 1024$',
        beats: defaultBeats([
          '首次调用 ExecuteAsync 触发 PreModel',
          'BuildSqCq 向物理池申请通道',
          '刷新关联 Notify ID 防跨步串号',
          '超 1024 上限在此处报 207008',
        ]),
        lanes: BASE_TIMELINES[4].lanes,
        syncEvents: BASE_TIMELINES[4].syncs,
        playhead: 84,
        argsBackupState: 'D2D 副本只读生效',
        notifyState: 'UpdateNotifyIdAll',
        sqCqState: '首次绑定物理 SQ/CQ',
        badgeTone: 'highlight',
        focusLabel: '首次重放才申请物理 SQ/CQ 与 Notify',
        supportsBackupToggle: false,
      },
      caption:
        '为避免建图却不运行造成物理槽位浪费，CANN 把 BuildSqCq 推迟到首次重放时执行，并刷新对应的硬件 Notify 编号。',
    },
    {
      label: '满载重放',
      duration: 4500,
      state: {
        stepIndex: 5,
        phaseLabel: 'Step 6 · 稳态 Replay：单条 Trigger + 芯片内握手',
        formulaTex: '$T_{\\text{replay}} \\approx T_{\\text{trigger}} + \\sum T_{\\text{kernel}}$',
        beats: defaultBeats([
          'CPU 仅发一条 ExecuteAsync 即返回',
          '用户流写入 model exe + notify wait',
          '影子流无气泡连续执行 K1..K4',
          'EndGraph Notify 硬件内唤醒用户流',
        ]),
        lanes: BASE_TIMELINES[5].lanes,
        syncEvents: BASE_TIMELINES[5].syncs,
        playhead: 84,
        argsBackupState: 'D2D 快照常驻',
        notifyState: 'EndGraph 自动唤醒',
        sqCqState: '零 CPU 同步满载直通',
        badgeTone: 'done',
        focusLabel: '用户流芯片内挂起，CPU 全程零阻塞',
        supportsBackupToggle: false,
      },
      caption:
        '进入稳态重放后，用户流只需发射两条控制指令即可在芯片内部等待影子流跑完唤醒，彻底抹掉百层发射气泡。',
    },
  ];
}
