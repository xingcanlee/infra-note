import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  MetricRow,
  PointerArcs,
  SectionBox,
  SlotStrip,
  STAGE_W,
  TensorBlock,
  assertMaxHues,
  type AnyTone,
  type MetricItem,
  type PointerArc,
  type SlotItem,
} from '@/explainers/kit';

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
  phaseLabel: string;
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
      state: {
        phaseLabel: '1. Attention DP 本地计算',
        dpSlots: [
          {
            id: 'dp0',
            label: 'DP0: t0',
            sub: 'KV0 本地',
            topTag: '[1, D]',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp1',
            label: 'DP1: t1',
            sub: 'KV1 本地',
            topTag: '[1, D]',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp2',
            label: 'DP2: t2',
            sub: 'KV2 本地',
            topTag: '[1, D]',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp3',
            label: 'DP3: t3',
            sub: 'KV3 本地',
            topTag: '[1, D]',
            tone: 'active',
            status: 'active',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: 'Rank 0 · E0',
            sub: '等待 Dispatch',
            topTag: '0 tok',
            tone: 'neutral',
            status: 'empty',
          },
          {
            id: 'ep1',
            label: 'Rank 1 · E1',
            sub: '等待 Dispatch',
            topTag: '0 tok',
            tone: 'neutral',
            status: 'empty',
          },
          {
            id: 'ep2',
            label: 'Rank 2 · E2',
            sub: '等待 Dispatch',
            topTag: '0 tok',
            tone: 'neutral',
            status: 'empty',
          },
          {
            id: 'ep3',
            label: 'Rank 3 · E3',
            sub: '等待 Dispatch',
            topTag: '0 tok',
            tone: 'neutral',
            status: 'empty',
          },
        ],
        epTensors: [
          { name: 'E0 Buf', shape: '[0, D]', tone: 'mask', stack: 1, muted: true, dashed: true },
          { name: 'E1 Buf', shape: '[0, D]', tone: 'mask', stack: 1, muted: true, dashed: true },
          { name: 'E2 Buf', shape: '[0, D]', tone: 'mask', stack: 1, muted: true, dashed: true },
          { name: 'E3 Buf', shape: '[0, D]', tone: 'mask', stack: 1, muted: true, dashed: true },
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
      state: {
        phaseLabel: '2. Top-2 门控路由与 Splits 同步',
        dpSlots: [
          {
            id: 'dp0',
            label: 't0 -> E0,E1',
            sub: 'w=[0.6,0.4]',
            topTag: 'Rank 0',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp1',
            label: 't1 -> E1,E2',
            sub: 'w=[0.7,0.3]',
            topTag: 'Rank 1',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp2',
            label: 't2 -> E0,E1',
            sub: 'w=[0.5,0.5]',
            topTag: 'Rank 2',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp3',
            label: 't3 -> E1,E2',
            sub: 'w=[0.8,0.2]',
            topTag: 'Rank 3',
            tone: 'active',
            status: 'active',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: 'Rank 0 · E0',
            sub: '预计收 2 tok',
            topTag: '25%',
            tone: 'active',
            status: 'selected',
          },
          {
            id: 'ep1',
            label: 'Rank 1 · E1',
            sub: '热点收 4 tok',
            topTag: '50%!',
            tone: 'highlight',
            status: 'active',
          },
          {
            id: 'ep2',
            label: 'Rank 2 · E2',
            sub: '预计收 2 tok',
            topTag: '25%',
            tone: 'active',
            status: 'selected',
          },
          {
            id: 'ep3',
            label: 'Rank 3 · E3',
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
            fromX: RANK_CENTERS_X[0],
            fromY: 110,
            toX: RANK_CENTERS_X[0],
            toY: 194,
            tone: 'active',
            dashed: true,
          },
          {
            fromX: RANK_CENTERS_X[0],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            dashed: true,
            arcOffset: -12,
          },
          {
            fromX: RANK_CENTERS_X[1],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            dashed: true,
          },
          {
            fromX: RANK_CENTERS_X[1],
            fromY: 110,
            toX: RANK_CENTERS_X[2],
            toY: 194,
            tone: 'active',
            dashed: true,
            arcOffset: -12,
          },
          {
            fromX: RANK_CENTERS_X[2],
            fromY: 110,
            toX: RANK_CENTERS_X[0],
            toY: 194,
            tone: 'highlight',
            dashed: true,
            arcOffset: 24,
          },
          {
            fromX: RANK_CENTERS_X[2],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            dashed: true,
            arcOffset: 10,
          },
          {
            fromX: RANK_CENTERS_X[3],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            dashed: true,
            arcOffset: 24,
          },
          {
            fromX: RANK_CENTERS_X[3],
            fromY: 110,
            toX: RANK_CENTERS_X[2],
            toY: 194,
            tone: 'active',
            dashed: true,
            arcOffset: 10,
          },
        ],
        arcBadge: { text: 'Top-2 偏斜路由 -> E1', tone: 'highlight' },
        dpShape: '[1, D] / 卡',
        epShapeSkew: '[2, 4, 2, 0] 偏斜',
        commVolume: '8 份 Top-2 激活待发',
        stragglerStatus: 'E1 成为拥堵热点',
      },
      caption:
        'Step 2（Top-2 路由与 Splits 握手）：Router 输出偏斜分布，4 条 Token 的 Top-2 路由均撞向 E1，各卡接收计数为 $[2, 4, 2, 0]$；框架必须先交互 Token 计数再为异步 All-to-All 预留缓冲。',
    },
    {
      state: {
        phaseLabel: '3. 非对称 All-to-All Dispatch',
        dpSlots: [
          {
            id: 'dp0',
            label: 't0 已切分',
            sub: '发往 E0, E1',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
          {
            id: 'dp1',
            label: 't1 已切分',
            sub: '发往 E1, E2',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
          {
            id: 'dp2',
            label: 't2 已切分',
            sub: '发往 E0, E1',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
          {
            id: 'dp3',
            label: 't3 已切分',
            sub: '发往 E1, E2',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: 'E0: t0,t2',
            sub: 'Rank 0 接收',
            topTag: '2 tok',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'ep1',
            label: 'E1: t0..t3',
            sub: 'Rank 1 过载',
            topTag: '4 tok',
            tone: 'highlight',
            status: 'active',
          },
          {
            id: 'ep2',
            label: 'E2: t1,t3',
            sub: 'Rank 2 接收',
            topTag: '2 tok',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'ep3',
            label: 'E3: (空)',
            sub: 'Rank 3 零接收',
            topTag: '0 tok',
            tone: 'mask',
            status: 'empty',
          },
        ],
        epTensors: [
          { name: 'X_E0', shape: '[2, D]', tone: 'active', stack: 1, active: true },
          { name: 'X_E1', shape: '[4, D]', tone: 'highlight', stack: 3, active: true },
          { name: 'X_E2', shape: '[2, D]', tone: 'active', stack: 1, active: true },
          { name: 'X_E3', shape: '[0, D]', tone: 'mask', stack: 1, muted: true, dashed: true },
        ],
        arcs: [
          {
            fromX: RANK_CENTERS_X[0],
            fromY: 110,
            toX: RANK_CENTERS_X[0],
            toY: 194,
            tone: 'active',
            flow: true,
            active: true,
          },
          {
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
            fromX: RANK_CENTERS_X[1],
            fromY: 110,
            toX: RANK_CENTERS_X[1],
            toY: 194,
            tone: 'highlight',
            flow: true,
            active: true,
          },
          {
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
      state: {
        phaseLabel: '4. 专家 Grouped GEMM (木桶效应)',
        dpSlots: [
          {
            id: 'dp0',
            label: 'DP0 挂起',
            sub: '等待 E0, E1',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
          {
            id: 'dp1',
            label: 'DP1 挂起',
            sub: '等待 E1, E2',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
          {
            id: 'dp2',
            label: 'DP2 挂起',
            sub: '等待 E0, E1',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
          {
            id: 'dp3',
            label: 'DP3 挂起',
            sub: '等待 E1, E2',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: 'E0 FFN',
            sub: '2 tok 早完成',
            topTag: '1.0x t',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'ep1',
            label: 'E1 FFN',
            sub: '4 tok 关键路径',
            topTag: '2.0x t!',
            tone: 'highlight',
            status: 'active',
          },
          {
            id: 'ep2',
            label: 'E2 FFN',
            sub: '2 tok 早完成',
            topTag: '1.0x t',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'ep3',
            label: 'E3 FFN',
            sub: '无计算跳过',
            topTag: 'IDLE',
            tone: 'mask',
            status: 'masked',
          },
        ],
        epTensors: [
          { name: 'Y_E0', shape: '[2, D] 就绪', tone: 'done', stack: 1 },
          { name: 'Y_E1', shape: '[4, D] 计算中', tone: 'highlight', stack: 3, active: true },
          { name: 'Y_E2', shape: '[2, D] 就绪', tone: 'done', stack: 1 },
          { name: 'Y_E3', shape: '[0, D] 空转', tone: 'mask', stack: 1, muted: true, dashed: true },
        ],
        arcs: [],
        dpShape: '激活驻留待归还',
        epShapeSkew: 'Rank1 = 2× 计算量',
        commVolume: '纯本地 GroupedMatmul',
        stragglerStatus: '木桶长尾: Rank1 拖慢',
      },
      caption:
        'Step 4（本地 Grouped GEMM）：各卡仅读本地显存中的专家权重执行前馈计算；由于 E1 负载达 4 tokens（均值的 2 倍），全组必须等待 Rank 1 完成，Rank 3 完全空转形成算力浪费。',
    },
    {
      state: {
        phaseLabel: '5. All-to-All Combine + 加权还原',
        dpSlots: [
          {
            id: 'dp0',
            label: 't0 = Σ w·Y',
            sub: '0.6E0 + 0.4E1',
            topTag: '[1, D] DONE',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'dp1',
            label: 't1 = Σ w·Y',
            sub: '0.7E1 + 0.3E2',
            topTag: '[1, D] DONE',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'dp2',
            label: 't2 = Σ w·Y',
            sub: '0.5E0 + 0.5E1',
            topTag: '[1, D] DONE',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'dp3',
            label: 't3 = Σ w·Y',
            sub: '0.8E1 + 0.2E2',
            topTag: '[1, D] DONE',
            tone: 'done',
            status: 'selected',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: 'E0 回传',
            sub: '归还 t0, t2',
            topTag: 'COMBINE',
            tone: 'done',
            status: 'normal',
          },
          {
            id: 'ep1',
            label: 'E1 回传',
            sub: '归还 t0..t3',
            topTag: 'COMBINE',
            tone: 'done',
            status: 'normal',
          },
          {
            id: 'ep2',
            label: 'E2 回传',
            sub: '归还 t1, t3',
            topTag: 'COMBINE',
            tone: 'done',
            status: 'normal',
          },
          {
            id: 'ep3',
            label: 'E3 (无)',
            sub: '无数据回传',
            topTag: '0 tok',
            tone: 'mask',
            status: 'empty',
          },
        ],
        epTensors: [
          { name: 'Y_E0 -> DP', shape: '[2, D] 释放', tone: 'done', stack: 1, dashed: true },
          { name: 'Y_E1 -> DP', shape: '[4, D] 释放', tone: 'done', stack: 2, dashed: true },
          { name: 'Y_E2 -> DP', shape: '[2, D] 释放', tone: 'done', stack: 1, dashed: true },
          { name: 'Y_E3', shape: '[0, D]', tone: 'mask', stack: 1, muted: true, dashed: true },
        ],
        arcs: [
          {
            fromX: RANK_CENTERS_X[0],
            fromY: 194,
            toX: RANK_CENTERS_X[0],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
          },
          {
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
            fromX: RANK_CENTERS_X[1],
            fromY: 194,
            toX: RANK_CENTERS_X[1],
            toY: 110,
            tone: 'done',
            flow: true,
            active: true,
          },
          {
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
        epShapeSkew: '回传规约完毕',
        commVolume: '2 次 All-to-All / 层',
        stragglerStatus: '重返 DP 并行下一层',
      },
      caption:
        'Step 5（All-to-All Combine 与加权规约）：各专家将计算结果逆向路由回原点 DP 卡，并按原始无偏门控权重 $w_1 y_1 + w_2 y_2$ 求和，把激活重塑回 $[1, D]$ 进入下一层 Attention。',
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
    <Explainer steps={steps} title={title} label="MoE EP 非对称路由与 All-to-All 推演" wide>
      {(step) => {
        const s = step.state;
        const metrics: MetricItem[] = [
          {
            label: '阶段状态',
            value: s.phaseLabel,
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

        return (
          <Stage width={STAGE_W} height={428} label="Attention DP 到 MoE EP 路由生命周期面板">
            <SectionBox
              x={12}
              y={10}
              w={STAGE_W - 24}
              h={100}
              title={`Attention DP 侧 (KV 零副本冗余) · ${s.phaseLabel}`}
              tone="active"
            />
            <SlotStrip
              x={24}
              y={48}
              slots={s.dpSlots}
              slotW={144}
              slotH={44}
              gap={18}
              fontSize={12}
            />

            <PointerArcs arcs={s.arcs} />
            {s.arcBadge && (
              <g>
                <rect
                  x={STAGE_W / 2 - 74}
                  y={141}
                  width={148}
                  height={22}
                  rx={4}
                  fill="var(--wisp-bg)"
                  stroke={`var(--wisp-sem-${s.arcBadge.tone})`}
                  strokeWidth={1}
                />
                <text
                  x={STAGE_W / 2}
                  y={152}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: `var(--wisp-sem-${s.arcBadge.tone})`,
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {s.arcBadge.text}
                </text>
              </g>
            )}

            <SectionBox
              x={12}
              y={194}
              w={STAGE_W - 24}
              h={156}
              title="MoE EP 专家侧 (按 Top-2 路由动态重塑各卡批尺寸)"
              tone="highlight"
            />
            <SlotStrip
              x={24}
              y={232}
              slots={s.epSlots}
              slotW={144}
              slotH={40}
              gap={18}
              fontSize={12}
            />

            {s.epTensors.map((card, idx) => (
              <TensorBlock
                key={card.name + idx}
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
              />
            ))}

            <MetricRow x={12} y={366} w={STAGE_W - 24} h={50} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
