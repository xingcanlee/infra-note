import type { Step, Tone } from 'astro-wisp/explainers';
export { MANIM_EASE, MORPH_SPRING, type BeatSpec } from '@/explainers/kit/motion';
import type { BeatSpec } from '@/explainers/kit/motion';

export type PdPhase =
  'pull-compute' | 'pull-drain' | 'push-prealloc' | 'push-overlap' | 'd2rh-stage' | 'd2rh-hit';

export interface PdTimelineItem {
  id: string;
  lane: 0 | 1 | 2 | 3;
  startMs: number;
  endMs: number;
  label: string;
  tone: Tone;
  beatMin: number;
  dashed?: boolean;
}

export interface PdArrowSpec {
  id: string;
  fromLane: 0 | 1 | 2 | 3;
  toLane: 0 | 1 | 2 | 3;
  atMs: number;
  label: string;
  tone: Tone;
  beatMin: number;
  /** 可选标签相对于箭头中点的纵向偏移（像素），避免与邻近车道或块重叠 */
  labelDy?: number;
}

export interface PdStepState {
  phase: PdPhase;
  modeName: string;
  pHoldMs: string;
  ttftMs: string;
  releaseRule: string;
  formulaTex: string;
  axisMaxMs: number;
  ticks: readonly number[];
  blocks: readonly PdTimelineItem[];
  arrows: readonly PdArrowSpec[];
  markerMs: number;
}

export const LANE_LABELS: readonly { idx: 0 | 1 | 2 | 3; title: string; sub: string }[] = [
  { idx: 0, title: 'Proxy / 元数据', sub: '路由与快照登记' },
  { idx: 1, title: 'P 节点 HBM', sub: '预填充与源显存' },
  { idx: 2, title: 'D 节点 DRAM', sub: '2 MiB 大页中转池' },
  { idx: 3, title: 'D 节点 HBM', sub: '目标槽位与解码' },
];

export const BEAT_SCHEDULES: Record<PdPhase, readonly BeatSpec[]> = {
  'pull-compute': [
    { at: 0, label: 'Proxy 选中 P 节点' },
    { at: 700, label: 'P 算完 L0 至 L3' },
    { at: 1500, label: '触发 delay_free 锁显存' },
    { at: 2300, label: '回传元数据至 Proxy' },
  ],
  'pull-drain': [
    { at: 0, label: 'Proxy 转发至 D 节点' },
    { at: 750, label: 'D 挂起等待远端拉取' },
    { at: 1600, label: 'D 发完成信号解锁 P' },
    { at: 2400, label: 'D 启动解码输出首字' },
  ],
  'push-prealloc': [
    { at: 0, label: 'Proxy 先路由到 D 节点' },
    { at: 700, label: 'D 预分配目标显存块' },
    { at: 1500, label: '快照提交至 metaserver' },
    { at: 2300, label: 'Proxy 携带地址派发 P' },
  ],
  'push-overlap': [
    { at: 0, label: 'P 算完 L0 即推写出' },
    { at: 750, label: 'L1 至 L3 计算与推写重叠' },
    { at: 1650, label: 'P 算完即刻释放 HBM' },
    { at: 2450, label: 'D 接续解码输出首字' },
  ],
  'd2rh-stage': [
    { at: 0, label: 'P 算完且 D HBM 正排队' },
    { at: 800, label: '第一跳拉入 D 固定 DRAM' },
    { at: 1650, label: '立即确认并释放 P HBM' },
    { at: 2450, label: '第二跳 H2D 载入后解码' },
  ],
  'd2rh-hit': [
    { at: 0, label: 'Proxy 路由请求至 D' },
    { at: 700, label: 'HostCacheKey 命中前缀' },
    { at: 1500, label: '跳过 P 计算与跨机拉取' },
    { at: 2300, label: '本地 H2D 后直接解码' },
  ],
};

export function buildMooncakePdFlowSteps(): Step<PdStepState>[] {
  return [
    {
      label: 'Pull 算完锁显存',
      duration: 4600,
      caption:
        '在默认 MooncakeConnector 拉取模式下，Proxy 先派发 P 节点完成 4 层预填充（耗时 8.0 ms）；请求结束钩子返回 delay_free 为真，将 P 端 HBM 块锁定等待 D 端来拉。',
      state: {
        phase: 'pull-compute',
        modeName: 'MooncakeConnector (Pull)',
        pHoldMs: '8.0 ms（持续锁定中）',
        ttftMs: '等待 D 端接管',
        releaseRule: 'delay_free=True 延迟释放',
        formulaTex:
          '$T_{\\text{comp}} = 4 \\times 2.0 = 8.0\\text{ ms},\\; \\text{delay\\_free} = \\text{True}$',
        axisMaxMs: 16,
        ticks: [0, 4, 8, 12, 16],
        markerMs: 8.5,
        blocks: [
          {
            id: 'p-route',
            lane: 0,
            startMs: 0,
            endMs: 0.9,
            label: '派P',
            tone: 'active',
            beatMin: 0,
          },
          { id: 'p-l0', lane: 1, startMs: 0, endMs: 2, label: 'L0', tone: 'active', beatMin: 1 },
          { id: 'p-l1', lane: 1, startMs: 2, endMs: 4, label: 'L1', tone: 'active', beatMin: 1 },
          { id: 'p-l2', lane: 1, startMs: 4, endMs: 6, label: 'L2', tone: 'active', beatMin: 1 },
          { id: 'p-l3', lane: 1, startMs: 6, endMs: 8, label: 'L3', tone: 'active', beatMin: 1 },
          {
            id: 'p-lock',
            lane: 1,
            startMs: 8,
            endMs: 14.5,
            label: 'HBM 锁定等 D 拉',
            tone: 'highlight',
            beatMin: 2,
            dashed: true,
          },
          {
            id: 'p-ret',
            lane: 0,
            startMs: 8,
            endMs: 9.2,
            label: '转D',
            tone: 'highlight',
            beatMin: 3,
          },
        ],
        arrows: [
          { id: 'a-p', fromLane: 0, toLane: 1, atMs: 0.45, label: 'P', tone: 'active', beatMin: 0 },
          {
            id: 'a-r',
            fromLane: 1,
            toLane: 0,
            atMs: 8.6,
            label: 'meta',
            tone: 'highlight',
            beatMin: 3,
          },
        ],
      },
    },
    {
      label: 'Pull 反拉解锁',
      duration: 4800,
      caption:
        'D 节点收到参数后置请求为等待远端状态并跳过前向，经 6.0 ms 将 4 层块整批拉入 D HBM，再发回 DONE_RECVING_MSG 解锁 P 端显存，总持块 14.5 ms、首字延迟 15.5 ms。',
      state: {
        phase: 'pull-drain',
        modeName: 'MooncakeConnector (Pull)',
        pHoldMs: '14.5 ms（无排队）/ 17.5 ms（遇堵）',
        ttftMs: '15.5 ms',
        releaseRule: '收到 D 端 DONE_RECVING_MSG 后释放',
        formulaTex:
          '$T_{\\text{hold}}^{\\text{pull}} = 14.5\\text{ ms},\\; \\text{TTFT} = 15.5\\text{ ms}$',
        axisMaxMs: 18,
        ticks: [0, 3, 6, 9, 12, 15, 18],
        markerMs: 15.5,
        blocks: [
          {
            id: 'p-comp',
            lane: 1,
            startMs: 0,
            endMs: 8,
            label: 'P 算 L0-L3',
            tone: 'slate',
            beatMin: 0,
          },
          {
            id: 'p-lock2',
            lane: 1,
            startMs: 8,
            endMs: 14.5,
            label: '等待拉取锁',
            tone: 'highlight',
            beatMin: 1,
            dashed: true,
          },
          {
            id: 'd-route',
            lane: 0,
            startMs: 8,
            endMs: 9.0,
            label: 'D',
            tone: 'active',
            beatMin: 0,
          },
          {
            id: 'd-pull',
            lane: 3,
            startMs: 8.5,
            endMs: 14.5,
            label: '远端拉取 (6.0ms)',
            tone: 'active',
            beatMin: 1,
          },
          {
            id: 'd-dec',
            lane: 3,
            startMs: 14.5,
            endMs: 15.8,
            label: '解码',
            tone: 'done',
            beatMin: 3,
          },
        ],
        arrows: [
          {
            id: 'a-d',
            fromLane: 0,
            toLane: 3,
            atMs: 8.5,
            label: '派D',
            tone: 'active',
            beatMin: 0,
            labelDy: -22,
          },
          {
            id: 'a-pull',
            fromLane: 1,
            toLane: 3,
            atMs: 11.5,
            label: 'RDMA',
            tone: 'active',
            beatMin: 1,
          },
          {
            id: 'a-ack',
            fromLane: 3,
            toLane: 1,
            atMs: 14.5,
            label: 'DONE',
            tone: 'done',
            beatMin: 2,
          },
        ],
      },
    },
    {
      label: 'Push 先登快照',
      duration: 4600,
      caption:
        '切换至 MooncakeConnectorV2 逐层推送模式后，Proxy 改为先路由到 D 节点；D 预分配物理块并将不可变目标地址快照发往 metaserver，再连同请求一起转交 P 节点。',
      state: {
        phase: 'push-prealloc',
        modeName: 'MooncakeConnectorV2 (Layerwise Push)',
        pHoldMs: '准备阶段（尚未驻留）',
        ttftMs: '预计 11.5 ms',
        releaseRule: 'D 预分配后向 metaserver 登记快照',
        formulaTex:
          '$D_{\\text{alloc}} \\to \\text{/v1/metaserver} \\to P,\\; P_{\\text{tp}} \\bmod D_{\\text{tp}} = 0$',
        axisMaxMs: 4.5,
        ticks: [0, 1, 2, 3, 4],
        markerMs: 1.8,
        blocks: [
          {
            id: 'pr-d',
            lane: 0,
            startMs: 0,
            endMs: 0.6,
            label: '路由 D',
            tone: 'active',
            beatMin: 0,
          },
          {
            id: 'd-pre',
            lane: 3,
            startMs: 0.25,
            endMs: 1.25,
            label: 'D 预分配 KV 块',
            tone: 'active',
            beatMin: 1,
          },
          {
            id: 'pr-meta',
            lane: 0,
            startMs: 0.9,
            endMs: 2.0,
            label: '登记快照',
            tone: 'highlight',
            beatMin: 2,
          },
          {
            id: 'p-ready',
            lane: 1,
            startMs: 1.8,
            endMs: 3.9,
            label: 'P 携目标地址就绪',
            tone: 'done',
            beatMin: 3,
          },
        ],
        arrows: [
          {
            id: 'a-pd',
            fromLane: 0,
            toLane: 3,
            atMs: 0.35,
            label: '预分',
            tone: 'active',
            beatMin: 0,
            labelDy: -18,
          },
          {
            id: 'a-ms',
            fromLane: 3,
            toLane: 0,
            atMs: 1.05,
            label: 'addr',
            tone: 'highlight',
            beatMin: 2,
            labelDy: 18,
          },
          { id: 'a-dp', fromLane: 0, toLane: 1, atMs: 1.9, label: '派P', tone: 'done', beatMin: 3 },
        ],
      },
    },
    {
      label: 'Push 逐层重叠',
      duration: 4800,
      caption:
        'P 节点每算完一层便通过 save_kv_layer 异步写入 D 端 HBM；因单层传输 1.5 ms 短于计算 2.0 ms，前 3 层传输完全隐身，仅末层留 1.5 ms 尾延迟，P 持块降至 9.5 ms。',
      state: {
        phase: 'push-overlap',
        modeName: 'MooncakeConnectorV2 (Layerwise Push)',
        pHoldMs: '9.5 ms（算完即释）',
        ttftMs: '11.5 ms',
        releaseRule: 'wait_for_save 排空后即刻释放',
        formulaTex:
          '$T_{\\text{hold}}^{\\text{push}} = 9.5\\text{ ms},\\; \\text{TTFT} = 11.5\\text{ ms}$',
        axisMaxMs: 14,
        ticks: [0, 2, 4, 6, 8, 10, 12, 14],
        markerMs: 11.5,
        blocks: [
          {
            id: 'ps-pre',
            lane: 0,
            startMs: 0,
            endMs: 1.0,
            label: 'D→P',
            tone: 'slate',
            beatMin: 0,
          },
          {
            id: 'ps-l0',
            lane: 1,
            startMs: 1.0,
            endMs: 3.0,
            label: 'L0',
            tone: 'active',
            beatMin: 0,
          },
          {
            id: 'ps-l1',
            lane: 1,
            startMs: 3.0,
            endMs: 5.0,
            label: 'L1',
            tone: 'active',
            beatMin: 1,
          },
          {
            id: 'ps-l2',
            lane: 1,
            startMs: 5.0,
            endMs: 7.0,
            label: 'L2',
            tone: 'active',
            beatMin: 1,
          },
          {
            id: 'ps-l3',
            lane: 1,
            startMs: 7.0,
            endMs: 9.0,
            label: 'L3',
            tone: 'active',
            beatMin: 1,
          },
          {
            id: 'ps-drain',
            lane: 1,
            startMs: 9.0,
            endMs: 10.5,
            label: '排空',
            tone: 'done',
            beatMin: 2,
          },
          {
            id: 'ps-w0',
            lane: 3,
            startMs: 3.0,
            endMs: 4.5,
            label: 'W0',
            tone: 'highlight',
            beatMin: 0,
          },
          {
            id: 'ps-w1',
            lane: 3,
            startMs: 5.0,
            endMs: 6.5,
            label: 'W1',
            tone: 'highlight',
            beatMin: 1,
          },
          {
            id: 'ps-w2',
            lane: 3,
            startMs: 7.0,
            endMs: 8.5,
            label: 'W2',
            tone: 'highlight',
            beatMin: 1,
          },
          {
            id: 'ps-w3',
            lane: 3,
            startMs: 9.0,
            endMs: 10.5,
            label: 'W3',
            tone: 'highlight',
            beatMin: 2,
          },
          {
            id: 'ps-dec',
            lane: 3,
            startMs: 10.5,
            endMs: 11.8,
            label: '解码',
            tone: 'done',
            beatMin: 3,
          },
        ],
        arrows: [
          {
            id: 'a-w0',
            fromLane: 1,
            toLane: 3,
            atMs: 3.0,
            label: 'Push L0',
            tone: 'highlight',
            beatMin: 0,
          },
          {
            id: 'a-w3',
            fromLane: 1,
            toLane: 3,
            atMs: 9.0,
            label: 'Push L3',
            tone: 'done',
            beatMin: 2,
          },
        ],
      },
    },
    {
      label: 'D2RH 驻留 Host',
      duration: 5000,
      caption:
        '当 D 端 HBM 排队拥堵 3.0 ms 时，MooncakeD2RHConnectorV1 先经第一跳把数据拉入 D 侧 2 MiB 对齐大页 DRAM 并在 14.5 ms 释放 P，彻底隔离 D 端显存排队与 H2D 拷贝。',
      state: {
        phase: 'd2rh-stage',
        modeName: 'MooncakeD2RHConnectorV1 (冷未命中)',
        pHoldMs: '14.5 ms（隔离 3.0 ms D 端排队）',
        ttftMs: '22.5 ms',
        releaseRule: '第一跳入驻 D DRAM 后即刻释放 P',
        formulaTex:
          '$T_{\\text{hold}}^{\\text{d2rh}} = 14.5\\text{ ms} < 17.5\\text{ ms},\\; \\text{HUGEPAGE} = 2\\text{ MiB}$',
        axisMaxMs: 24,
        ticks: [0, 4, 8, 12, 16, 20, 24],
        markerMs: 22.5,
        blocks: [
          {
            id: 'd2-p',
            lane: 1,
            startMs: 0,
            endMs: 8.0,
            label: 'P 算 L0-L3',
            tone: 'slate',
            beatMin: 0,
          },
          {
            id: 'd2-lock',
            lane: 1,
            startMs: 8.0,
            endMs: 14.5,
            label: '仅锁第一跳',
            tone: 'highlight',
            beatMin: 1,
            dashed: true,
          },
          {
            id: 'd2-hop1',
            lane: 2,
            startMs: 8.5,
            endMs: 14.5,
            label: 'Hop1: P→D DRAM',
            tone: 'active',
            beatMin: 1,
          },
          {
            id: 'd2-pin',
            lane: 2,
            startMs: 14.5,
            endMs: 21.5,
            label: 'DRAM 锁至 H2D 完',
            tone: 'slate',
            beatMin: 2,
            dashed: true,
          },
          {
            id: 'd2-stall',
            lane: 3,
            startMs: 14.5,
            endMs: 17.5,
            label: '排队 3ms',
            tone: 'highlight',
            beatMin: 0,
            dashed: true,
          },
          {
            id: 'd2-hop2',
            lane: 3,
            startMs: 17.5,
            endMs: 21.5,
            label: 'H2D (4ms)',
            tone: 'active',
            beatMin: 3,
          },
          {
            id: 'd2-dec',
            lane: 3,
            startMs: 21.5,
            endMs: 22.8,
            label: '解码',
            tone: 'done',
            beatMin: 3,
          },
        ],
        arrows: [
          {
            id: 'a-h1',
            fromLane: 1,
            toLane: 2,
            atMs: 10.5,
            label: 'D2H',
            tone: 'active',
            beatMin: 1,
          },
          {
            id: 'a-rel',
            fromLane: 2,
            toLane: 1,
            atMs: 14.5,
            label: 'DONE',
            tone: 'done',
            beatMin: 2,
          },
          {
            id: 'a-h2',
            fromLane: 2,
            toLane: 3,
            atMs: 19.5,
            label: 'H2D',
            tone: 'active',
            beatMin: 3,
          },
        ],
      },
    },
    {
      label: 'D2RH 前缀命中',
      duration: 4600,
      caption:
        '后续请求共享相同前缀并命中 D 侧 HostCacheKey 指纹时，系统完全跳过 P 节点重算与第一跳跨机拉取，仅执行 4.0 ms 本地 H2D 加载与 1.0 ms 解码，TTFT 降至 5.5 ms。',
      state: {
        phase: 'd2rh-hit',
        modeName: 'MooncakeD2RHConnectorV1 (Host 命中)',
        pHoldMs: '0.0 ms（跳过 P 节点）',
        ttftMs: '5.5 ms',
        releaseRule: 'Host 块锁定至本地 H2D 读完后解锁',
        formulaTex:
          '$T_{\\text{hold}}^{\\text{hit}} = 0\\text{ ms},\\; \\text{TTFT}_{\\text{hit}} = 5.5\\text{ ms}$',
        axisMaxMs: 10,
        ticks: [0, 2, 4, 6, 8, 10],
        markerMs: 5.5,
        blocks: [
          { id: 'ht-pr', lane: 0, startMs: 0, endMs: 0.7, label: '查库', tone: 'done', beatMin: 0 },
          {
            id: 'ht-p',
            lane: 1,
            startMs: 0,
            endMs: 6.0,
            label: '跳过 P 节点预填充与拉取',
            tone: 'slate',
            beatMin: 2,
            dashed: true,
          },
          {
            id: 'ht-dram',
            lane: 2,
            startMs: 0.6,
            endMs: 4.5,
            label: 'Host 命中',
            tone: 'done',
            beatMin: 1,
          },
          {
            id: 'ht-h2d',
            lane: 3,
            startMs: 0.6,
            endMs: 4.5,
            label: 'H2D (4ms)',
            tone: 'active',
            beatMin: 2,
          },
          {
            id: 'ht-dec',
            lane: 3,
            startMs: 4.5,
            endMs: 5.7,
            label: '解码',
            tone: 'done',
            beatMin: 3,
          },
        ],
        arrows: [
          {
            id: 'a-hr',
            fromLane: 0,
            toLane: 2,
            atMs: 0.35,
            label: 'hit',
            tone: 'done',
            beatMin: 0,
          },
          {
            id: 'a-hh2d',
            fromLane: 2,
            toLane: 3,
            atMs: 2.6,
            label: 'H2D',
            tone: 'active',
            beatMin: 2,
          },
        ],
      },
    },
  ];
}
