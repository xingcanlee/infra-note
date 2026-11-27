import type { Step } from 'astro-wisp/explainers';
import type { TimelineLane, TimelineSyncEvent } from '@/explainers/kit/SwimlaneTimeline';
import { assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export type PdModeId = 'pull' | 'push' | 'd2rh' | 'host-hit';

export interface PdModeSpec {
  id: PdModeId;
  tabLabel: string;
  modeName: string;
  vramLock: string;
  ttft: string;
  ttftMs: number;
  releaseRule: string;
  formulaTex: string;
  caption: string;
  lanes: readonly TimelineLane[];
  syncEvents: readonly TimelineSyncEvent[];
  pathActive: { pNode: boolean; rdma: boolean; host: boolean; dNode: boolean };
  pathLabel: string;
  pathTone: AnyTone;
}

export const PD_AXIS_MAX_MS = 24;
export const PD_TICKS = [0, 4, 8, 12, 16, 20, 24] as const;

export const PD_MODES: readonly PdModeSpec[] = [
  {
    id: 'pull',
    tabLabel: 'Pull 算完拉取',
    modeName: 'MooncakeConnector (Pull)',
    vramLock: '14.5 ms（持续锁定）',
    ttft: '15.5 ms',
    ttftMs: 15.5,
    releaseRule: '收到 DONE_RECVING_MSG 后释放',
    formulaTex:
      '$T_{\\text{hold}}^{\\text{pull}} = 8.0 + 0.5 + 6.0 = 14.5\\text{ ms},\\; \\text{TTFT} = 15.5\\text{ ms}$',
    caption:
      'Pull 算完拉取：P 节点算完 $L_0\\text{–}L_3$（$8.0\\text{ ms}$）后置 delay_free 锁定 HBM，待 D 节点接管并整批拉完 $4$ 层（$6.0\\text{ ms}$）发出完成确认才解锁，P 端持块达 $14.5\\text{ ms}$。',
    pathActive: { pNode: true, rdma: true, host: false, dNode: true },
    pathLabel: '算完后整批 RDMA 反拉至 D HBM',
    pathTone: 'active',
    lanes: [
      {
        id: 'p-hbm',
        title: 'P 节点 HBM',
        subtitle: 'L0–L3 与显存锁',
        blocks: [
          { start: 0, dur: 2, label: 'P:L0', tone: 'active', active: true },
          { start: 2, dur: 2, label: 'P:L1', tone: 'active', active: true },
          { start: 4, dur: 2, label: 'P:L2', tone: 'active', active: true },
          { start: 6, dur: 2, label: 'P:L3', tone: 'active', active: true },
          {
            start: 8,
            dur: 6.5,
            label: 'HBM 锁等 D 拉',
            tone: 'highlight',
            kind: 'bubble',
            active: true,
          },
        ],
      },
      {
        id: 'rdma',
        title: 'RDMA 跨机传输',
        subtitle: '1.5 ms / 层',
        blocks: [
          { start: 8.5, dur: 1.5, label: 'R:L0', tone: 'active', active: true },
          { start: 10.0, dur: 1.5, label: 'R:L1', tone: 'active', active: true },
          { start: 11.5, dur: 1.5, label: 'R:L2', tone: 'active', active: true },
          { start: 13.0, dur: 1.5, label: 'R:L3', tone: 'active', active: true },
        ],
      },
      {
        id: 'host-dram',
        title: 'D Host DRAM',
        subtitle: '2 MiB 大页缓存',
        blocks: [
          { start: 0, dur: 0.5, label: 'DRAM 驻留', tone: 'mask', visible: false },
          { start: 0, dur: 0.5, label: 'H2D:L0..3', tone: 'mask', visible: false },
        ],
      },
      {
        id: 'd-hbm',
        title: 'D 节点 HBM',
        subtitle: '目标槽位与解码',
        blocks: [
          { start: 0, dur: 0.5, label: 'D 排队拥堵', tone: 'mask', kind: 'bubble', visible: false },
          { start: 8.5, dur: 6.0, label: '拉入 D HBM', tone: 'active', active: true },
          { start: 14.5, dur: 1.0, label: '首字解码', tone: 'done', active: true },
        ],
      },
    ],
    syncEvents: [
      { fromLane: 0, at: 8.5, toLane: 1, label: '拉取', tone: 'active', active: true },
      { fromLane: 1, at: 14.5, toLane: 0, label: 'DONE', tone: 'done', active: true },
      { fromLane: 1, at: 14.5, toLane: 3, toAt: 14.5, tone: 'done', active: true },
    ],
  },
  {
    id: 'push',
    tabLabel: 'Push 逐层重叠',
    modeName: 'MooncakeConnectorV2 (Layerwise Push)',
    vramLock: '9.5 ms（算完即释）',
    ttft: '11.5 ms',
    ttftMs: 11.5,
    releaseRule: 'wait_for_save 排空后即刻释放',
    formulaTex:
      '$T_{\\text{hold}}^{\\text{push}} = 8.0 + 1.5 = 9.5\\text{ ms},\\; \\text{TTFT} = 11.5\\text{ ms}$',
    caption:
      'Push 逐层重叠：D 端先预分配并向 metaserver 登记快照（$1.0\\text{ ms}$）；P 端每算完一层即异步推写，因单层传 $1.5\\text{ ms} < 2.0\\text{ ms}$ 计算，前 $3$ 层通信完全被掩盖，持块降至 $9.5\\text{ ms}$。',
    pathActive: { pNode: true, rdma: true, host: false, dNode: true },
    pathLabel: '逐层 save_kv_layer 边算边推 D HBM',
    pathTone: 'highlight',
    lanes: [
      {
        id: 'p-hbm',
        title: 'P 节点 HBM',
        subtitle: 'L0–L3 与显存锁',
        blocks: [
          { start: 1.0, dur: 2, label: 'P:L0', tone: 'active', active: true },
          { start: 3.0, dur: 2, label: 'P:L1', tone: 'active', active: true },
          { start: 5.0, dur: 2, label: 'P:L2', tone: 'active', active: true },
          { start: 7.0, dur: 2, label: 'P:L3', tone: 'active', active: true },
          {
            start: 9.0,
            dur: 1.5,
            label: 'HBM 锁等 D 拉',
            tone: 'highlight',
            active: true,
            dashed: true,
          },
        ],
      },
      {
        id: 'rdma',
        title: 'RDMA 跨机传输',
        subtitle: '1.5 ms / 层',
        blocks: [
          { start: 3.0, dur: 1.5, label: 'R:L0', tone: 'highlight', active: true },
          { start: 5.0, dur: 1.5, label: 'R:L1', tone: 'highlight', active: true },
          { start: 7.0, dur: 1.5, label: 'R:L2', tone: 'highlight', active: true },
          { start: 9.0, dur: 1.5, label: 'R:L3', tone: 'done', active: true },
        ],
      },
      {
        id: 'host-dram',
        title: 'D Host DRAM',
        subtitle: '2 MiB 大页缓存',
        blocks: [
          { start: 0, dur: 0.5, label: 'DRAM 驻留', tone: 'mask', visible: false },
          { start: 0, dur: 0.5, label: 'H2D:L0..3', tone: 'mask', visible: false },
        ],
      },
      {
        id: 'd-hbm',
        title: 'D 节点 HBM',
        subtitle: '目标槽位与解码',
        blocks: [
          { start: 0, dur: 0.5, label: 'D 排队拥堵', tone: 'mask', kind: 'bubble', visible: false },
          { start: 0, dur: 1.0, label: '拉入 D HBM', tone: 'done', active: true, dashed: true },
          { start: 10.5, dur: 1.0, label: '首字解码', tone: 'done', active: true },
        ],
      },
    ],
    syncEvents: [
      { fromLane: 3, at: 1.0, toLane: 0, label: '快照', tone: 'done', active: true },
      { fromLane: 0, at: 3.0, toLane: 1, label: 'L0推', tone: 'highlight', active: true },
      { fromLane: 1, at: 10.5, toLane: 3, label: '排空', tone: 'done', active: true },
    ],
  },
  {
    id: 'd2rh',
    tabLabel: 'D2RH 驻留 Host',
    modeName: 'MooncakeD2RHConnectorV1 (冷未命中)',
    vramLock: '14.5 ms（隔离 3 ms 排队）',
    ttft: '22.5 ms',
    ttftMs: 22.5,
    releaseRule: '第一跳入驻 D DRAM 后即刻释放 P',
    formulaTex:
      '$T_{\\text{hold}}^{\\text{d2rh}} = 14.5\\text{ ms} < 17.5\\text{ ms},\\; \\text{HUGEPAGE} = 2\\text{ MiB}$',
    caption:
      'D2RH 驻留 Host：即使 D 端 HBM 排队拥堵 $3.0\\text{ ms}$，第一跳仍先将 $L_0\\text{–}L_3$ 拉入 D 侧 $2\\text{ MiB}$ 大页 DRAM 并在 $14.5\\text{ ms}$ 释放 P 端，彻底隔离 D 端显存排队与本地 H2D 拷贝。',
    pathActive: { pNode: true, rdma: true, host: true, dNode: true },
    pathLabel: 'Hop1 拉入 Host DRAM 释放 P -> Hop2 本地 H2D',
    pathTone: 'active',
    lanes: [
      {
        id: 'p-hbm',
        title: 'P 节点 HBM',
        subtitle: 'L0–L3 与显存锁',
        blocks: [
          { start: 0, dur: 2, label: 'P:L0', tone: 'active', active: true },
          { start: 2, dur: 2, label: 'P:L1', tone: 'active', active: true },
          { start: 4, dur: 2, label: 'P:L2', tone: 'active', active: true },
          { start: 6, dur: 2, label: 'P:L3', tone: 'active', active: true },
          {
            start: 8,
            dur: 6.5,
            label: 'HBM 锁等 D 拉',
            tone: 'highlight',
            kind: 'bubble',
            active: true,
          },
        ],
      },
      {
        id: 'rdma',
        title: 'RDMA 跨机传输',
        subtitle: '1.5 ms / 层',
        blocks: [
          { start: 8.5, dur: 1.5, label: 'R:L0', tone: 'active', active: true },
          { start: 10.0, dur: 1.5, label: 'R:L1', tone: 'active', active: true },
          { start: 11.5, dur: 1.5, label: 'R:L2', tone: 'active', active: true },
          { start: 13.0, dur: 1.5, label: 'R:L3', tone: 'active', active: true },
        ],
      },
      {
        id: 'host-dram',
        title: 'D Host DRAM',
        subtitle: '2 MiB 大页缓存',
        blocks: [
          {
            start: 8.5,
            dur: 9.0,
            label: 'DRAM 驻留',
            tone: 'highlight',
            active: true,
            dashed: true,
          },
          { start: 17.5, dur: 4.0, label: 'H2D:L0..3', tone: 'active', active: true },
        ],
      },
      {
        id: 'd-hbm',
        title: 'D 节点 HBM',
        subtitle: '目标槽位与解码',
        blocks: [
          {
            start: 14.5,
            dur: 3.0,
            label: 'D 排队拥堵',
            tone: 'highlight',
            kind: 'bubble',
            active: true,
          },
          { start: 17.5, dur: 4.0, label: '拉入 D HBM', tone: 'active', active: true },
          { start: 21.5, dur: 1.0, label: '首字解码', tone: 'done', active: true },
        ],
      },
    ],
    syncEvents: [
      { fromLane: 1, at: 14.5, toLane: 0, label: 'DONE', tone: 'done', active: true },
      { fromLane: 1, at: 14.5, toLane: 2, tone: 'active', active: true },
      { fromLane: 2, at: 17.5, toLane: 3, label: 'H2D', tone: 'active', active: true },
    ],
  },
  {
    id: 'host-hit',
    tabLabel: 'Host 前缀命中',
    modeName: 'MooncakeD2RHConnectorV1 (Host 命中)',
    vramLock: '0.0 ms（跳过 P 节点）',
    ttft: '5.5 ms',
    ttftMs: 5.5,
    releaseRule: 'Host 块锁定至本地 H2D 读完后解锁',
    formulaTex:
      '$T_{\\text{hold}}^{\\text{hit}} = 0\\text{ ms},\\; \\text{TTFT}_{\\text{hit}} = 0.5 + 4.0 + 1.0 = 5.5\\text{ ms}$',
    caption:
      'Host 前缀命中：后续请求共享前缀并命中 D 侧 HostCacheKey 指纹时，完全跳过 P 节点预填充与 RDMA 拉取，仅执行 $4.0\\text{ ms}$ 本地 H2D 加载与 $1.0\\text{ ms}$ 解码，TTFT 降至 $5.5\\text{ ms}$。',
    pathActive: { pNode: false, rdma: false, host: true, dNode: true },
    pathLabel: 'HostCacheKey 命中短路 P 节点与 RDMA',
    pathTone: 'done',
    lanes: [
      {
        id: 'p-hbm',
        title: 'P 节点 HBM',
        subtitle: 'L0–L3 与显存锁',
        blocks: [
          { start: 0, dur: 2, label: 'P:L0', tone: 'mask', visible: false },
          { start: 2, dur: 2, label: 'P:L1', tone: 'mask', visible: false },
          { start: 4, dur: 2, label: 'P:L2', tone: 'mask', visible: false },
          { start: 6, dur: 2, label: 'P:L3', tone: 'mask', visible: false },
          { start: 8, dur: 2, label: 'HBM 锁等 D 拉', tone: 'mask', visible: false },
        ],
      },
      {
        id: 'rdma',
        title: 'RDMA 跨机传输',
        subtitle: '1.5 ms / 层',
        blocks: [
          { start: 0, dur: 1.5, label: 'R:L0', tone: 'mask', visible: false },
          { start: 1.5, dur: 1.5, label: 'R:L1', tone: 'mask', visible: false },
          { start: 3.0, dur: 1.5, label: 'R:L2', tone: 'mask', visible: false },
          { start: 4.5, dur: 1.5, label: 'R:L3', tone: 'mask', visible: false },
        ],
      },
      {
        id: 'host-dram',
        title: 'D Host DRAM',
        subtitle: '2 MiB 大页缓存',
        blocks: [
          { start: 0.5, dur: 1.5, label: 'DRAM 驻留', tone: 'done', active: true },
          { start: 2.0, dur: 2.5, label: 'H2D:L0..3', tone: 'active', active: true },
        ],
      },
      {
        id: 'd-hbm',
        title: 'D 节点 HBM',
        subtitle: '目标槽位与解码',
        blocks: [
          { start: 0, dur: 0.5, label: 'D 排队拥堵', tone: 'mask', kind: 'bubble', visible: false },
          { start: 0.5, dur: 4.0, label: '拉入 D HBM', tone: 'active', active: true },
          { start: 4.5, dur: 1.0, label: '首字解码', tone: 'done', active: true },
        ],
      },
    ],
    syncEvents: [{ fromLane: 2, at: 2.5, toLane: 3, label: 'H2D', tone: 'done', active: true }],
  },
];

assertMaxHues(
  PD_MODES.flatMap((m) => m.lanes.flatMap((l) => l.blocks.map((b) => b.tone))),
  3,
);

/** Compatible step builder for shared test harness inventory. */
export function buildMooncakePdFlowSteps(): Step<PdModeSpec>[] {
  return PD_MODES.map((m) => ({
    label: m.tabLabel,
    duration: 4600,
    caption: m.caption,
    state: m,
  }));
}
