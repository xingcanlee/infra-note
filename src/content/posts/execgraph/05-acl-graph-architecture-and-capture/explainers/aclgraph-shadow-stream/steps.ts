import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues, type AnyTone } from '@/explainers/kit/motion';
import type { TimelineLane } from '@/explainers/kit/SwimlaneTimeline';

export type ArgsBackupMode = 'with_d2d' | 'no_d2d';

export interface ShadowArrowSpec {
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

export interface MemoryLifecycleSpec {
  srcTitle: string;
  srcDetail: string;
  srcTone: AnyTone;
  copyLabel: string;
  copyTone: AnyTone;
  copyActive: boolean;
  bufTitle: string;
  bufDetail: string;
  bufTone: AnyTone;
  bindLabel: string;
  bindTone: AnyTone;
  bindActive: boolean;
  dstTitle: string;
  dstDetail: string;
  dstTone: AnyTone;
}

export interface AclGraphShadowStreamState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
  lanes: readonly TimelineLane[];
  arrows: readonly ShadowArrowSpec[];
  memory: MemoryLifecycleSpec;
  playhead: number;
  argsBackupState: string;
  notifyState: string;
  sqCqState: string;
  badgeTone: AnyTone;
  focusLane: 1 | 2 | 'handshake' | 'memory';
  focusLabel: string;
  supportsBackupToggle: boolean;
  note: string;
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
    memory: MemoryLifecycleSpec;
    note: string;
  }
> = {
  with_d2d: {
    id: 'with_d2d',
    label: '开启 D2D 参数备份',
    argsBackupState: 'D2D 持久备份 (8, 128)',
    sqCqState: '影子流读持久副本',
    badgeTone: 'done',
    focusLabel: '图外覆写临时区时，BackupBuf 持久快照依然完好',
    memory: {
      srcTitle: 'comm.args (临时区)',
      srcDetail: '图外算子稍后会覆写',
      srcTone: 'active',
      copyLabel: 'D2D 快照',
      copyTone: 'done',
      copyActive: true,
      bufTitle: 'BackupBuf (持久显存)',
      bufDetail: '锁存维度 (8, 128)',
      bufTone: 'done',
      bindLabel: '只读绑定',
      bindTone: 'done',
      bindActive: true,
      dstTitle: 'LogicSQ 任务链表',
      dstDetail: '内存态录制，未占物理队列',
      dstTone: 'active',
    },
    note: 'CANN Runtime 申请带 Backup 标志的持久显存并做 D2D 拷贝，彻底隔离图外运算对临时 args 区的覆写。',
  },
  no_d2d: {
    id: 'no_d2d',
    label: '跳过备份 (图外覆写)',
    argsBackupState: '指向易变临时区 (999, 128)',
    sqCqState: '影子流读到错误维度',
    badgeTone: 'highlight',
    focusLabel: '图外 Eager 算子覆盖临时参数区导致重放算错',
    memory: {
      srcTitle: 'comm.args (易变区)',
      srcDetail: '已被图外任务改成 (999, 128)',
      srcTone: 'highlight',
      copyLabel: '直接引用',
      copyTone: 'highlight',
      copyActive: true,
      bufTitle: '无持久副本 (指针悬空)',
      bufDetail: '原地维度被覆盖污染',
      bufTone: 'highlight',
      bindLabel: '错位读取',
      bindTone: 'highlight',
      bindActive: true,
      dstTitle: 'LogicSQ 任务链表',
      dstDetail: '重放读取错误 shape 崩溃',
      dstTone: 'highlight',
    },
    note: '若直接引用临时 comm.args，后续 Eager 任务就会覆盖原地指针，导致静态图重放时读取错位维度。',
  },
};

export function buildAclGraphShadowStreamSteps(): Step<AclGraphShadowStreamState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: 'Eager 基线发射',
      duration: 4500,
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · Eager 模式 Host-bound 断流空泡',
        formulaTex:
          '$T_{\\text{eager}} = 4 \\cdot \\max(T_{\\text{launch}},\\, T_{\\text{kernel}})$',
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '逐个构造并发射算子',
            blocks: [
              { start: 0, dur: 16, label: 'K1', tone: 'active', active: true },
              { start: 17, dur: 16, label: 'K2', tone: 'active', active: true },
              { start: 34, dur: 16, label: 'K3', tone: 'active', active: true },
              { start: 51, dur: 16, label: 'K4', tone: 'active', active: true },
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
              { start: 0, dur: 95, label: 'Eager 模式下未激活', tone: 'neutral', kind: 'bubble' },
            ],
          },
        ],
        arrows: [
          { id: 'e1', fromLane: 0, at: 16, toLane: 1, toAt: 16, tone: 'active', active: true },
          { id: 'e2', fromLane: 0, at: 33, toLane: 1, toAt: 33, tone: 'active', active: true },
          { id: 'e3', fromLane: 0, at: 50, toLane: 1, toAt: 50, tone: 'active', active: true },
        ],
        memory: {
          srcTitle: 'comm.args (临时区)',
          srcDetail: '逐条发射即时释放',
          srcTone: 'neutral',
          copyLabel: '即时传参',
          copyTone: 'neutral',
          copyActive: false,
          bufTitle: 'BackupBuf (未启用)',
          bufDetail: '无需跨步保留参数',
          bufTone: 'neutral',
          bindLabel: '直通 SQ',
          bindTone: 'neutral',
          bindActive: false,
          dstTitle: '用户流物理 SQ',
          dstDetail: '每发一条即落硬件执行',
          dstTone: 'highlight',
        },
        playhead: 67,
        argsBackupState: '未备份',
        notifyState: '无',
        sqCqState: '逐条实时入队',
        badgeTone: 'highlight',
        focusLane: 1,
        focusLabel: 'Host 发射慢于执行，用户流反复停等',
        supportsBackupToggle: false,
        note: 'Eager 模式下每条算子都要经过 Host 构造与发射，硬件跑完就停下露出大段等待空泡。',
      },
      caption:
        '在 Eager 模式下逐算子发射，主机耗时超过设备执行时长，Stream 1 频频停下等待下一条任务单。',
    },
    {
      label: '捕获与影子流备份',
      duration: 4700,
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · CaptureBegin 重定向影子流与 D2D 参数快照',
        formulaTex:
          '$\\text{comm.args} \\xrightarrow{\\text{D2D}} \\text{BackupBuf} \\;(\\text{LogicSQ 录制})$',
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: 'CaptureBegin 后录制 K1..K4',
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
            subtitle: 'IsSoftwareSqEnable 拦截',
            blocks: [
              {
                start: 0,
                dur: 95,
                label: '捕获期不落硬件，任务重定向至影子流',
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
        arrows: [
          {
            id: 'redir',
            fromLane: 0,
            at: 16,
            toLane: 2,
            toAt: 16,
            label: '重定向+D2D',
            tone: 'done',
            active: true,
          },
        ],
        memory: BACKUP_COMPARE_MODES.with_d2d.memory,
        playhead: 78,
        argsBackupState: BACKUP_COMPARE_MODES.with_d2d.argsBackupState,
        notifyState: '待 EndGraph 追加',
        sqCqState: BACKUP_COMPARE_MODES.with_d2d.sqCqState,
        badgeTone: 'done',
        focusLane: 'memory',
        focusLabel: BACKUP_COMPARE_MODES.with_d2d.focusLabel,
        supportsBackupToggle: true,
        note: BACKUP_COMPARE_MODES.with_d2d.note,
      },
      caption:
        '调用 CaptureBegin 后，Runtime 建立 Shadow Stream 并通过 IsSoftwareSqEnable 拦截任务；同时把临时 comm.args 做 D2D 备份锁进持久显存，避免被图外任务覆写。',
    },
    {
      label: '图闭合与延迟绑定',
      duration: 4600,
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · CaptureEnd 闭合追加 Notify 与首次 Replay BuildSqCq',
        formulaTex:
          '$\\text{CaptureEnd} \\to \\text{BuildSqCq} \\le 1024 \\;(\\text{NotifyRecord})$',
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: 'CaptureEnd + 首次 PreModelExecute',
            blocks: [
              { start: 0, dur: 24, label: 'CaptureEnd', tone: 'active', active: true },
              { start: 26, dur: 20, label: 'PreModelExec', tone: 'highlight', active: true },
            ],
          },
          {
            id: 'user',
            title: 'Stream 1 (用户流)',
            subtitle: '首次重放延迟绑定物理通道',
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
            subtitle: 'BuildSqCq 绑定池 + EndGraph',
            blocks: [
              { start: 26, dur: 14, label: 'BuildSqCq', tone: 'highlight', active: true },
              {
                start: 40,
                dur: 44,
                label: 'K1..K4 + NotifyRecord',
                tone: 'done',
                active: true,
              },
            ],
          },
        ],
        arrows: [
          {
            id: 'trig',
            fromLane: 1,
            at: 36,
            toLane: 2,
            toAt: 36,
            label: 'Trigger',
            tone: 'active',
            active: true,
          },
          {
            id: 'wake',
            fromLane: 2,
            at: 84,
            toLane: 1,
            toAt: 84,
            label: 'EndGraph',
            tone: 'done',
            active: true,
          },
        ],
        memory: {
          srcTitle: 'BackupBuf (只读锁定)',
          srcDetail: '拓扑与参数指针已冻结',
          srcTone: 'done',
          copyLabel: '首次绑定',
          copyTone: 'highlight',
          copyActive: true,
          bufTitle: 'BuildSqCq 物理池',
          bufDetail: '单卡上限 ≤ 1024 槽位',
          bufTone: 'highlight',
          bindLabel: '刷新 ID',
          bindTone: 'active',
          bindActive: true,
          dstTitle: 'EndGraph Notify',
          dstDetail: 'UpdateNotifyIdAll 对齐',
          dstTone: 'done',
        },
        playhead: 84,
        argsBackupState: '持久副本已锁定',
        notifyState: 'UpdateNotifyIdAll',
        sqCqState: '首次重放 BuildSqCq',
        badgeTone: 'highlight',
        focusLane: 2,
        focusLabel: 'CaptureEnd 校验闭合，首次重放才分配物理 SQ/CQ',
        supportsBackupToggle: false,
        note: 'CaptureEnd 追加 EndGraph Notify 并校验多流闭合性；为节省硬件队列槽位，直到首次 Replay 才执行 BuildSqCq。',
      },
      caption:
        '结束捕获时校验 Fork-Join 闭合并在影子流尾追加 EndGraph Notify；真正调用首次重放时，PreModelExecute 才通过 BuildSqCq 延迟申请物理 SQ/CQ。',
    },
    {
      label: '满载零开销重放',
      duration: 4600,
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · 稳态 Replay：单条 Trigger + 芯片内零气泡执行',
        formulaTex: '$T_{\\text{replay}} \\approx T_{\\text{trigger}} + \\sum T_{\\text{kernel}}$',
        lanes: [
          {
            id: 'host',
            title: 'Host 线程',
            subtitle: '单条 ExecuteAsync 即返回',
            blocks: [{ start: 0, dur: 14, label: 'Launch RI', tone: 'done', active: true }],
          },
          {
            id: 'user',
            title: 'Stream 1 (用户流)',
            subtitle: '芯片内部挂起等 Notify',
            blocks: [
              { start: 0, dur: 12, label: 'task3', tone: 'active' },
              { start: 14, dur: 12, label: 'exe', tone: 'done' },
              {
                start: 26,
                dur: 42,
                label: 'notify wait (CPU 零阻塞)',
                tone: 'neutral',
                kind: 'bubble',
              },
              { start: 68, dur: 16, label: 'taskN', tone: 'done', active: true },
            ],
          },
          {
            id: 'shadow',
            title: 'Shadow Stream',
            subtitle: 'TS 固件满载无气泡直通',
            blocks: [
              { start: 20, dur: 10, label: 'K1', tone: 'done', active: true },
              { start: 30, dur: 12, label: 'K2', tone: 'done', active: true },
              { start: 42, dur: 14, label: 'K3', tone: 'done', active: true },
              { start: 56, dur: 12, label: 'K4+Notify', tone: 'done', active: true },
            ],
          },
        ],
        arrows: [
          {
            id: 'rtrig',
            fromLane: 1,
            at: 20,
            toLane: 2,
            toAt: 20,
            label: 'Trigger',
            tone: 'active',
            active: true,
          },
          {
            id: 'rnotify',
            fromLane: 2,
            at: 68,
            toLane: 1,
            toAt: 68,
            label: 'Notify 唤醒',
            tone: 'done',
            active: true,
          },
        ],
        memory: {
          srcTitle: 'BackupBuf (常驻显存)',
          srcDetail: '零 H2D 拷贝直接复用',
          srcTone: 'done',
          copyLabel: '直通读取',
          copyTone: 'done',
          copyActive: true,
          bufTitle: '物理 SQ/CQ 已就绪',
          bufDetail: 'TS 固件连续派发 K1..K4',
          bufTone: 'done',
          bindLabel: '片上握手',
          bindTone: 'done',
          bindActive: true,
          dstTitle: 'Stream 1 taskN',
          dstDetail: 'Notify 唤醒后无缝续跑',
          dstTone: 'done',
        },
        playhead: 84,
        argsBackupState: 'D2D 快照常驻',
        notifyState: 'EndGraph 自动唤醒',
        sqCqState: '零 CPU 同步满载直通',
        badgeTone: 'done',
        focusLane: 'handshake',
        focusLabel: '影子流无气泡连续跑完，硬件 Notify 唤醒用户流',
        supportsBackupToggle: false,
        note: '稳态重放期间 CPU 只发射一条 Trigger 指令即可去准备下一轮输入，影子流在设备侧无缝连跑并自动唤醒用户流。',
      },
      caption:
        '进入稳态重放后，Host 仅发一条 ExecuteAsync 触发指令，用户流在芯片内挂起等待影子流满载跑完并通过 EndGraph Notify 唤醒。',
    },
  ];
}
