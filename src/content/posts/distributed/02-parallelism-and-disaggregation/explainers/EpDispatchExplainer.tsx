import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { BeatExplainer, SvgBeatGroup, defaultBeats, type BeatSpec } from '@/explainers/kit';
import { MetricRow, SectionBox, type MetricItem } from '@/explainers/kit/MetricRow';
import {
  PointerArcs,
  SlotStrip,
  type PointerArc,
  type SlotItem,
} from '@/explainers/kit/PointerBoard';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import TensorBlock from '@/explainers/kit/TensorBlock';
import {
  RADIUS,
  STAGE_W,
  assertMaxHues,
  resolveToneStroke,
  type AnyTone,
} from '@/explainers/kit/motion';

export interface EpTensorCard {
  name: string;
  shape: string;
  tone: AnyTone;
  stack: 1 | 2 | 3;
  active?: boolean;
  muted?: boolean;
  dashed?: boolean;
}

export interface EpDispatchState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
  beats: BeatSpec[];
  dpSlots: SlotItem[];
  epSlots: SlotItem[];
  epTensors: EpTensorCard[];
  arcs: PointerArc[];
  arcBadge?: { text: string; tone: AnyTone };
  dpShape: string;
  epShapeSkew: string;
  commVolume: string;
  stragglerStatus: string;
}

const RANK_CENTERS_X = [96, 258, 420, 582] as const;

export function buildEpDispatchSteps(): Step<EpDispatchState>[] {
  const tones: AnyTone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones, 3);

  return [
    {
      label: 'DP 计算',
      duration: 4600,
      state: {
        stepIndex: 0,
        phaseLabel: '1. Attention DP 本地计算',
        formulaTex:
          '$\\text{DP Rank}_r:\\; X_r \\in \\mathbb{R}^{1 \\times D}\\; (\\text{本地 KV 零通信})$',
        beats: defaultBeats([
          '检视 4 卡本地请求 t_r',
          '确认 Attention 零 KV 副本',
          '保留 EP 空槽待 Dispatch',
          '对齐各卡 [1,D] 输出',
        ]),
        dpSlots: [
          {
            id: 'dp0',
            label: 'DP0: $t_0$',
            sub: '$KV_0$ 本地',
            topTag: '$[1, D]$',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp1',
            label: 'DP1: $t_1$',
            sub: '$KV_1$ 本地',
            topTag: '$[1, D]$',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp2',
            label: 'DP2: $t_2$',
            sub: '$KV_2$ 本地',
            topTag: '$[1, D]$',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp3',
            label: 'DP3: $t_3$',
            sub: '$KV_3$ 本地',
            topTag: '$[1, D]$',
            tone: 'active',
            status: 'active',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: 'Rank 0 · $E_0$',
            sub: '等待 Dispatch',
            topTag: '0 tok',
            tone: 'neutral',
            status: 'empty',
          },
          {
            id: 'ep1',
            label: 'Rank 1 · $E_1$',
            sub: '等待 Dispatch',
            topTag: '0 tok',
            tone: 'neutral',
            status: 'empty',
          },
          {
            id: 'ep2',
            label: 'Rank 2 · $E_2$',
            sub: '等待 Dispatch',
            topTag: '0 tok',
            tone: 'neutral',
            status: 'empty',
          },
          {
            id: 'ep3',
            label: 'Rank 3 · $E_3$',
            sub: '等待 Dispatch',
            topTag: '0 tok',
            tone: 'neutral',
            status: 'empty',
          },
        ],
        epTensors: [
          {
            name: '$E_0$ Buf',
            shape: '$[0, D]$',
            tone: 'mask',
            stack: 1,
            muted: true,
            dashed: true,
          },
          {
            name: '$E_1$ Buf',
            shape: '$[0, D]$',
            tone: 'mask',
            stack: 1,
            muted: true,
            dashed: true,
          },
          {
            name: '$E_2$ Buf',
            shape: '$[0, D]$',
            tone: 'mask',
            stack: 1,
            muted: true,
            dashed: true,
          },
          {
            name: '$E_3$ Buf',
            shape: '$[0, D]$',
            tone: 'mask',
            stack: 1,
            muted: true,
            dashed: true,
          },
        ],
        arcs: [],
        dpShape: '[1, D] / 卡',
        epShapeSkew: '未路由',
        commVolume: 'KV 0 跨卡传输',
        stragglerStatus: 'DP 各卡独立均衡',
      },
      caption:
        'Step 1（Attention DP 本地并行）：4 张卡各自持有独立请求 $t_0..t_3$ 与局部 Paged KV，在 Attention 阶段零 KV 副本冗余、零跨卡通信，输出激活形状均为 $[1, D]$。',
    },
    {
      label: 'Splits 路由',
      duration: 4600,
      state: {
        stepIndex: 1,
        phaseLabel: '2. Top-2 门控路由与 Splits 同步',
        formulaTex:
          '$\\text{Top-2} \\;\\Longrightarrow\\; \\text{Splits} = [2, 4, 2, 0]\\; (E_1\\text{ 热点})$',
        beats: defaultBeats([
          '读取各卡 Top-2 权重与目标',
          '虚线预绘 8 条偏斜路由边',
          '汇总各卡 Splits 接收计数',
          '识别 E1 拥堵与 E3 空闲',
        ]),
        dpSlots: [
          {
            id: 'dp0',
            label: '$t_0 \\to E_0,E_1$',
            sub: '$w=[0.6,0.4]$',
            topTag: 'Rank 0',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp1',
            label: '$t_1 \\to E_1,E_2$',
            sub: '$w=[0.7,0.3]$',
            topTag: 'Rank 1',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp2',
            label: '$t_2 \\to E_0,E_1$',
            sub: '$w=[0.5,0.5]$',
            topTag: 'Rank 2',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp3',
            label: '$t_3 \\to E_1,E_2$',
            sub: '$w=[0.8,0.2]$',
            topTag: 'Rank 3',
            tone: 'active',
            status: 'active',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: 'Rank 0 · $E_0$',
            sub: '预计收 2 tok',
            topTag: '25%',
            tone: 'active',
            status: 'selected',
          },
          {
            id: 'ep1',
            label: 'Rank 1 · $E_1$',
            sub: '热点收 4 tok',
            topTag: '50%',
            tone: 'highlight',
            status: 'active',
          },
          {
            id: 'ep2',
            label: 'Rank 2 · $E_2$',
            sub: '预计收 2 tok',
            topTag: '25%',
            tone: 'active',
            status: 'selected',
          },
          {
            id: 'ep3',
            label: 'Rank 3 · $E_3$',
            sub: '冷门 0 tok',
            topTag: 'IDLE',
            tone: 'mask',
            status: 'masked',
          },
        ],
        epTensors: [
          { name: 'Splits[0]', shape: '待分配 [2, D]', tone: 'active', stack: 1, dashed: true },
          {
            name: 'Splits[1]',
            shape: '待分配 [4, D]',
            tone: 'highlight',
            stack: 2,
            active: true,
            dashed: true,
          },
          { name: 'Splits[2]', shape: '待分配 [2, D]', tone: 'active', stack: 1, dashed: true },
          {
            name: 'Splits[3]',
            shape: '空 [0, D]',
            tone: 'mask',
            stack: 1,
            muted: true,
            dashed: true,
          },
        ],
        arcs: [
          {
            id: 's1-0',
            fromX: RANK_CENTERS_X[0],
            fromY: 110,
            toX: RANK_CENTERS_X[0],
            toY: 194,
            tone: 'active',
            dashed: true,
            preserveTone: true,
          },
          {
            id: 's1-1',
            fromX: RANK_CENTERS_X[0],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            dashed: true,
            preserveTone: true,
            arcOffset: -12,
          },
          {
            id: 's1-2',
            fromX: RANK_CENTERS_X[1],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            dashed: true,
            preserveTone: true,
          },
          {
            id: 's1-3',
            fromX: RANK_CENTERS_X[1],
            fromY: 110,
            toX: RANK_CENTERS_X[2],
            toY: 194,
            tone: 'active',
            dashed: true,
            preserveTone: true,
            arcOffset: -12,
          },
          {
            id: 's1-4',
            fromX: RANK_CENTERS_X[2],
            fromY: 110,
            toX: RANK_CENTERS_X[0],
            toY: 194,
            tone: 'active',
            dashed: true,
            preserveTone: true,
            arcOffset: 24,
          },
          {
            id: 's1-5',
            fromX: RANK_CENTERS_X[2],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            dashed: true,
            preserveTone: true,
            arcOffset: 10,
          },
          {
            id: 's1-6',
            fromX: RANK_CENTERS_X[3],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            dashed: true,
            preserveTone: true,
            arcOffset: 24,
          },
          {
            id: 's1-7',
            fromX: RANK_CENTERS_X[3],
            fromY: 110,
            toX: RANK_CENTERS_X[2],
            toY: 194,
            tone: 'active',
            dashed: true,
            preserveTone: true,
            arcOffset: 10,
          },
        ],
        arcBadge: { text: 'Top-2 偏斜路由 $\\to E_1$', tone: 'highlight' },
        dpShape: '[1, D] / 卡',
        epShapeSkew: '[2, 4, 2, 0] 偏斜',
        commVolume: '8 份 Top-2 激活待发',
        stragglerStatus: 'E1 成为拥堵热点',
      },
      caption:
        'Step 2（Top-2 路由与 Splits 握手）：Router 输出偏斜分布，4 个 token 的 Top-2 路由均集中到 $E_1$，各卡接收计数为 $[2, 4, 2, 0]$；框架必须先交换 token 计数再为异步 All-to-All 预留缓冲。',
    },
    {
      label: '重排派发',
      duration: 4600,
      state: {
        stepIndex: 2,
        phaseLabel: '3. 非对称 All-to-All Dispatch',
        formulaTex:
          '$[1, D]_{\\text{DP}} \\xrightarrow{\\text{All-to-All}} [2,D],\\,[4,D],\\,[2,D],\\,[0,D]$',
        beats: defaultBeats([
          '切分发送侧 8 份激活',
          '沿 All-to-All 汇聚到 EP',
          'Rank 1 堆叠 [4, D] 缓冲',
          '定位 Incast 拥塞与重构',
        ]),
        dpSlots: [
          {
            id: 'dp0',
            label: '$t_0$ 已切分',
            sub: '发往 $E_0, E_1$',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
          {
            id: 'dp1',
            label: '$t_1$ 已切分',
            sub: '发往 $E_1, E_2$',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
          {
            id: 'dp2',
            label: '$t_2$ 已切分',
            sub: '发往 $E_0, E_1$',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
          {
            id: 'dp3',
            label: '$t_3$ 已切分',
            sub: '发往 $E_1, E_2$',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: '$E_0$: $t_0,t_2$',
            sub: 'Rank 0 接收',
            topTag: '2 tok',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'ep1',
            label: '$E_1$: $t_0..t_3$',
            sub: 'Rank 1 过载',
            topTag: '4 tok',
            tone: 'highlight',
            status: 'active',
          },
          {
            id: 'ep2',
            label: '$E_2$: $t_1,t_3$',
            sub: 'Rank 2 接收',
            topTag: '2 tok',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'ep3',
            label: '$E_3$: 空',
            sub: 'Rank 3 零接收',
            topTag: '0 tok',
            tone: 'mask',
            status: 'empty',
          },
        ],
        epTensors: [
          { name: '$X_{E_0}$', shape: '$[2, D]$', tone: 'active', stack: 1, active: true },
          { name: '$X_{E_1}$', shape: '$[4, D]$', tone: 'highlight', stack: 3, active: true },
          { name: '$X_{E_2}$', shape: '$[2, D]$', tone: 'active', stack: 1, active: true },
          {
            name: '$X_{E_3}$',
            shape: '$[0, D]$',
            tone: 'mask',
            stack: 1,
            muted: true,
            dashed: true,
          },
        ],
        arcs: [
          {
            id: 's2-0',
            fromX: RANK_CENTERS_X[0],
            fromY: 110,
            toX: RANK_CENTERS_X[0],
            toY: 194,
            tone: 'active',
            flow: true,
            active: true,
          },
          {
            id: 's2-1',
            fromX: RANK_CENTERS_X[0],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            flow: true,
            active: true,
            arcOffset: -12,
          },
          {
            id: 's2-2',
            fromX: RANK_CENTERS_X[1],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            flow: true,
            active: true,
          },
          {
            id: 's2-3',
            fromX: RANK_CENTERS_X[1],
            fromY: 110,
            toX: RANK_CENTERS_X[2],
            toY: 194,
            tone: 'active',
            flow: true,
            active: true,
            arcOffset: -12,
          },
          {
            id: 's2-4',
            fromX: RANK_CENTERS_X[2],
            fromY: 110,
            toX: RANK_CENTERS_X[0],
            toY: 194,
            tone: 'active',
            flow: true,
            active: true,
            arcOffset: 24,
          },
          {
            id: 's2-5',
            fromX: RANK_CENTERS_X[2],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            flow: true,
            active: true,
            arcOffset: 10,
          },
          {
            id: 's2-6',
            fromX: RANK_CENTERS_X[3],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            flow: true,
            active: true,
            arcOffset: 24,
          },
          {
            id: 's2-7',
            fromX: RANK_CENTERS_X[3],
            fromY: 110,
            toX: RANK_CENTERS_X[2],
            toY: 194,
            tone: 'active',
            flow: true,
            active: true,
            arcOffset: 10,
          },
        ],
        arcBadge: { text: 'All-to-All Dispatch', tone: 'highlight' },
        dpShape: '[1, D] -> 变长发送',
        epShapeSkew: '[2, 4, 2, 0] × D',
        commVolume: 'Incast 拥塞 Rank 1',
        stragglerStatus: '批形状彻底重构',
      },
      caption:
        'Step 3（非对称 All-to-All Dispatch）：不同于 TP 的均等切分，EP Dispatch 按路由表将各卡 $[1, D]$ 激活重塑为不等长张量；Rank 1 同时承受来自 4 个源头的 Incast 写入并分配 $[4, D]$ 计算缓冲。',
    },
    {
      label: '木桶长尾',
      duration: 4600,
      state: {
        stepIndex: 3,
        phaseLabel: '4. 专家 Grouped GEMM (木桶效应)',
        formulaTex: '$T_{\\text{FFN}} = \\max_r T(N_r) = T(E_1) = 2.0\\times t$',
        beats: defaultBeats([
          'DP 侧进入同步挂起',
          'E0/E2 早完工并对齐状态',
          'E1 承担 4 tok 拖长耗时',
          '量化木桶长尾与空转浪费',
        ]),
        dpSlots: [
          {
            id: 'dp0',
            label: 'DP0 挂起',
            sub: '等待 $E_0, E_1$',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
          {
            id: 'dp1',
            label: 'DP1 挂起',
            sub: '等待 $E_1, E_2$',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
          {
            id: 'dp2',
            label: 'DP2 挂起',
            sub: '等待 $E_0, E_1$',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
          {
            id: 'dp3',
            label: 'DP3 挂起',
            sub: '等待 $E_1, E_2$',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: '$E_0$ FFN',
            sub: '2 tok 早完成',
            topTag: '1.0x t',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'ep1',
            label: '$E_1$ FFN',
            sub: '4 tok 关键路径',
            topTag: '2.0x t',
            tone: 'highlight',
            status: 'active',
          },
          {
            id: 'ep2',
            label: '$E_2$ FFN',
            sub: '2 tok 早完成',
            topTag: '1.0x t',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'ep3',
            label: '$E_3$ FFN',
            sub: '无计算跳过',
            topTag: 'IDLE',
            tone: 'mask',
            status: 'masked',
          },
        ],
        epTensors: [
          { name: '$Y_{E_0}$', shape: '$[2, D]$ 就绪', tone: 'done', stack: 1 },
          {
            name: '$Y_{E_1}$',
            shape: '$[4, D]$ 计算中',
            tone: 'highlight',
            stack: 3,
            active: true,
          },
          { name: '$Y_{E_2}$', shape: '$[2, D]$ 就绪', tone: 'done', stack: 1 },
          {
            name: '$Y_{E_3}$',
            shape: '$[0, D]$ 空转',
            tone: 'mask',
            stack: 1,
            muted: true,
            dashed: true,
          },
        ],
        arcs: [],
        dpShape: '激活驻留待归还',
        epShapeSkew: 'Rank1 = 2× 计算量',
        commVolume: '纯本地 GroupedMatmul',
        stragglerStatus: '木桶长尾: Rank1 拖慢',
      },
      caption:
        'Step 4（本地 Grouped GEMM）：各卡仅读本地显存中的专家权重执行前馈计算；由于 $E_1$ 负载达 4 个 token（均值的 2 倍），全组必须等待 Rank 1 完成，Rank 3 完全空转形成算力浪费。',
    },
    {
      label: '回传归约',
      duration: 4600,
      state: {
        stepIndex: 4,
        phaseLabel: '5. All-to-All Combine + 加权还原',
        formulaTex: '$y_t = w_1 Y_{E_{r1}} + w_2 Y_{E_{r2}} \\in \\mathbb{R}^{1 \\times D}$',
        beats: defaultBeats([
          '锁定 EP 侧就绪专家输出',
          '逆向 All-to-All 回传原卡',
          '按门控权重还原 [1,D] 激活',
          '确认双向 All-to-All 全周期',
        ]),
        dpSlots: [
          {
            id: 'dp0',
            label: '$t_0 = \\sum w\\cdot Y$',
            sub: '$0.6E_0 + 0.4E_1$',
            topTag: '[1, D] DONE',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'dp1',
            label: '$t_1 = \\sum w\\cdot Y$',
            sub: '$0.7E_1 + 0.3E_2$',
            topTag: '[1, D] DONE',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'dp2',
            label: '$t_2 = \\sum w\\cdot Y$',
            sub: '$0.5E_0 + 0.5E_1$',
            topTag: '[1, D] DONE',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'dp3',
            label: '$t_3 = \\sum w\\cdot Y$',
            sub: '$0.8E_1 + 0.2E_2$',
            topTag: '[1, D] DONE',
            tone: 'done',
            status: 'selected',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: '$E_0$ 回传',
            sub: '归还 $t_0, t_2$',
            topTag: 'COMBINE',
            tone: 'done',
            status: 'normal',
          },
          {
            id: 'ep1',
            label: '$E_1$ 回传',
            sub: '归还 $t_0..t_3$',
            topTag: 'COMBINE',
            tone: 'done',
            status: 'normal',
          },
          {
            id: 'ep2',
            label: '$E_2$ 回传',
            sub: '归还 $t_1, t_3$',
            topTag: 'COMBINE',
            tone: 'done',
            status: 'normal',
          },
          {
            id: 'ep3',
            label: '$E_3$ (无)',
            sub: '无数据回传',
            topTag: '0 tok',
            tone: 'mask',
            status: 'empty',
          },
        ],
        epTensors: [
          {
            name: '$Y_{E_0} \\to \\text{DP}$',
            shape: '$[2, D]$ 释放',
            tone: 'done',
            stack: 1,
            dashed: true,
          },
          {
            name: '$Y_{E_1} \\to \\text{DP}$',
            shape: '$[4, D]$ 释放',
            tone: 'done',
            stack: 2,
            dashed: true,
          },
          {
            name: '$Y_{E_2} \\to \\text{DP}$',
            shape: '$[2, D]$ 释放',
            tone: 'done',
            stack: 1,
            dashed: true,
          },
          {
            name: '$Y_{E_3}$',
            shape: '$[0, D]$',
            tone: 'mask',
            stack: 1,
            muted: true,
            dashed: true,
          },
        ],
        arcs: [
          {
            id: 's4-0',
            fromX: RANK_CENTERS_X[0],
            fromY: 194,
            toX: RANK_CENTERS_X[0],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
          },
          {
            id: 's4-1',
            fromX: RANK_CENTERS_X[1],
            fromY: 194,
            toX: RANK_CENTERS_X[0],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
            arcOffset: 12,
          },
          {
            id: 's4-2',
            fromX: RANK_CENTERS_X[1],
            fromY: 194,
            toX: RANK_CENTERS_X[1],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
          },
          {
            id: 's4-3',
            fromX: RANK_CENTERS_X[2],
            fromY: 194,
            toX: RANK_CENTERS_X[1],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
            arcOffset: 12,
          },
          {
            id: 's4-4',
            fromX: RANK_CENTERS_X[0],
            fromY: 194,
            toX: RANK_CENTERS_X[2],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
            arcOffset: -24,
          },
          {
            id: 's4-5',
            fromX: RANK_CENTERS_X[1],
            fromY: 194,
            toX: RANK_CENTERS_X[2],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
            arcOffset: -10,
          },
          {
            id: 's4-6',
            fromX: RANK_CENTERS_X[1],
            fromY: 194,
            toX: RANK_CENTERS_X[3],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
            arcOffset: -24,
          },
          {
            id: 's4-7',
            fromX: RANK_CENTERS_X[2],
            fromY: 194,
            toX: RANK_CENTERS_X[3],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
            arcOffset: -10,
          },
        ],
        arcBadge: { text: 'All-to-All Combine', tone: 'done' },
        dpShape: '[1, D] 还原完成',
        epShapeSkew: '回传归约完毕',
        commVolume: '2 次 All-to-All / 层',
        stragglerStatus: '重返 DP 并行下一层',
      },
      caption:
        'Step 5（All-to-All Combine 与加权归约）：各专家将计算结果逆向路由回原点 DP 卡，并按原始门控权重 $w_1 y_1 + w_2 y_2$ 求和，把激活重塑回 $[1, D]$ 进入下一层 Attention。',
    },
  ];
}

export default function EpDispatchExplainer({
  title = '图 2：Attention DP + MoE EP 跨卡 Dispatch / Combine 全周期推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildEpDispatchSteps(), []);

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label="MoE EP 非对称路由与 All-to-All 推演"
      wide
      stageMinHeight={524}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        const isCombine = s.stepIndex === 4;
        const showArcs = beat >= 1;
        const dpDimmed = isCombine ? beat < 2 : false;
        const epDimmed = isCombine ? false : s.stepIndex === 3 ? beat < 1 : beat < 2;

        const metrics: MetricItem[] = [
          {
            label: '跨卡通信阶段',
            value: s.commVolume,
            tone: 'active',
            active: true,
          },
          {
            label: 'DP 激活形状',
            value: s.dpShape,
            tone: 'done',
          },
          {
            label: 'EP 专家批负载',
            value: s.epShapeSkew,
            tone: 'highlight',
          },
          {
            label: '均衡度评价',
            value: s.stragglerStatus,
            tone:
              s.stragglerStatus.includes('长尾') || s.stragglerStatus.includes('热点')
                ? 'highlight'
                : 'done',
          },
        ];

        const badgeStroke = s.arcBadge ? resolveToneStroke(s.arcBadge.tone) : 'var(--wisp-border)';
        const beatArcs: PointerArc[] = s.arcs.map((a) => ({
          ...a,
          visible: showArcs,
          draw: showArcs,
        }));

        return (
          <Stage width={STAGE_W} height={428} label="Attention DP 到 MoE EP 路由生命周期面板">
            <SectionBox
              x={12}
              y={10}
              w={STAGE_W - 24}
              h={100}
              title={`Attention DP 侧 (KV 零副本冗余) · ${s.phaseLabel}`}
              tone="active"
              dimmed={dpDimmed}
            />
            <SlotStrip
              x={24}
              y={48}
              slots={s.dpSlots}
              slotW={144}
              slotH={44}
              gap={18}
              dimmed={dpDimmed}
              fontSize={12}
            />

            <PointerArcs arcs={beatArcs} dotToken={showArcs ? dotToken : 0} />
            {s.arcBadge && (
              <SvgBeatGroup visible={showArcs}>
                <rect
                  x={STAGE_W / 2 - 78}
                  y={141}
                  width={156}
                  height={22}
                  rx={RADIUS}
                  fill="var(--wisp-bg)"
                  stroke={badgeStroke}
                  strokeWidth={1}
                />
                <SvgRichLabel
                  x={STAGE_W / 2}
                  y={152}
                  width={156}
                  height={22}
                  text={s.arcBadge.text}
                  fontSize={11}
                  fontWeight={600}
                  color={badgeStroke}
                  family="mono"
                />
              </SvgBeatGroup>
            )}

            <SectionBox
              x={12}
              y={194}
              w={STAGE_W - 24}
              h={156}
              title="MoE EP 专家侧 (按 Top-2 路由动态重塑各卡批尺寸)"
              tone="highlight"
              dimmed={epDimmed}
            />
            <SlotStrip
              x={24}
              y={232}
              slots={s.epSlots}
              slotW={144}
              slotH={40}
              gap={18}
              dimmed={epDimmed}
              fontSize={12}
            />

            {s.epTensors.map((card, idx) => (
              <TensorBlock
                key={`ep-tensor-${idx}`}
                x={24 + idx * (144 + 18)}
                y={290}
                w={144}
                h={44}
                tone={card.tone}
                name={card.name}
                shape={card.shape}
                labelMode="inside"
                stack={card.stack}
                active={card.active}
                muted={card.muted}
                dashed={card.dashed}
                visible={isCombine || s.stepIndex === 0 || s.stepIndex === 3 ? true : beat >= 2}
                dimmed={s.stepIndex === 3 && beat < 2}
              />
            ))}

            <MetricRow
              x={12}
              y={366}
              w={STAGE_W - 24}
              h={50}
              revealed={beat >= 3}
              metrics={metrics}
            />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
