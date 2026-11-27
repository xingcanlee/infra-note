import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, RADIUS, RADIUS_SM } from '@/explainers/kit';
import DataFlowArrow, { type Point2D } from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox, type MetricItem } from '@/explainers/kit/MetricRow';
import { SlotStrip, type SlotItem } from '@/explainers/kit/PointerBoard';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import {
  MORPH_SPRING,
  STAGE_W,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
  type AnyTone,
} from '@/explainers/kit/motion';

export interface EpLoadCard {
  expert: string;
  tokens: number;
  maxTokens: number;
  timeLabel: string;
  shapeLabel: string;
  tone: AnyTone;
  active?: boolean;
  dashed?: boolean;
}

export interface EpLinkSpec {
  id: string;
  points: readonly Point2D[];
  tone: AnyTone;
  active: boolean;
  dashed?: boolean;
  flow: boolean;
  draw: boolean;
}

export interface EpDispatchState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
  dpSlots: SlotItem[];
  epSlots: SlotItem[];
  epLoads: EpLoadCard[];
  links: EpLinkSpec[];
  corridorBadge: { text: string; tone: AnyTone };
  dpShape: string;
  epShapeSkew: string;
  commVolume: string;
  stragglerStatus: string;
}

const RANK_CENTERS_X = [96, 258, 420, 582] as const;

const DISPATCH_EDGES: ReadonlyArray<{
  from: 0 | 1 | 2 | 3;
  to: 0 | 1 | 2 | 3;
  tone: AnyTone;
  midOffset: number;
}> = [
  { from: 0, to: 0, tone: 'active', midOffset: 0 },
  { from: 0, to: 1, tone: 'highlight', midOffset: -10 },
  { from: 1, to: 1, tone: 'highlight', midOffset: 0 },
  { from: 1, to: 2, tone: 'active', midOffset: -10 },
  { from: 2, to: 0, tone: 'active', midOffset: 10 },
  { from: 2, to: 1, tone: 'highlight', midOffset: 4 },
  { from: 3, to: 1, tone: 'highlight', midOffset: 12 },
  { from: 3, to: 2, tone: 'active', midOffset: 4 },
];

function makeLinks(
  direction: 'down' | 'up',
  active: boolean,
  dashed: boolean,
  toneOverride?: AnyTone,
): EpLinkSpec[] {
  return DISPATCH_EDGES.map((e, i) => {
    const sx = RANK_CENTERS_X[e.from];
    const ex = RANK_CENTERS_X[e.to];
    const yTop = 104;
    const yBot = 192;
    const midY = (yTop + yBot) / 2 + e.midOffset;
    const points: readonly Point2D[] =
      direction === 'down'
        ? [
            [sx, yTop],
            [sx, midY],
            [ex, midY],
            [ex, yBot],
          ]
        : [
            [ex, yBot],
            [ex, midY],
            [sx, midY],
            [sx, yTop],
          ];
    return {
      id: `${direction}-${i}`,
      points,
      tone: toneOverride ?? e.tone,
      active,
      dashed,
      flow: active,
      draw: active,
    };
  });
}

export function buildEpDispatchSteps(): Step<EpDispatchState>[] {
  const tones: AnyTone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones, 3);

  return [
    {
      label: 'DP 路由计数',
      duration: 4600,
      state: {
        stepIndex: 0,
        phaseLabel: '1. DP 本地计算与 Top-2 Splits 计数',
        formulaTex:
          '$\\text{DP}[1,D] \\;\\xrightarrow{\\text{Top-2 Router}}\\; \\text{Splits} = [2, 4, 2, 0]$',
        dpSlots: [
          {
            id: 'dp0',
            label: '$t_0 \\to E_0,E_1$',
            sub: '$w=[0.6,0.4]$',
            topTag: '$[1, D]$',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp1',
            label: '$t_1 \\to E_1,E_2$',
            sub: '$w=[0.7,0.3]$',
            topTag: '$[1, D]$',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp2',
            label: '$t_2 \\to E_0,E_1$',
            sub: '$w=[0.5,0.5]$',
            topTag: '$[1, D]$',
            tone: 'active',
            status: 'active',
          },
          {
            id: 'dp3',
            label: '$t_3 \\to E_1,E_2$',
            sub: '$w=[0.8,0.2]$',
            topTag: '$[1, D]$',
            tone: 'active',
            status: 'active',
          },
        ],
        epSlots: [
          {
            id: 'ep0',
            label: 'Rank 0 · $E_0$',
            sub: 'Splits = 2',
            topTag: '25%',
            tone: 'active',
            status: 'selected',
          },
          {
            id: 'ep1',
            label: 'Rank 1 · $E_1$',
            sub: 'Splits = 4 (热点)',
            topTag: '50%',
            tone: 'highlight',
            status: 'active',
          },
          {
            id: 'ep2',
            label: 'Rank 2 · $E_2$',
            sub: 'Splits = 2',
            topTag: '25%',
            tone: 'active',
            status: 'selected',
          },
          {
            id: 'ep3',
            label: 'Rank 3 · $E_3$',
            sub: 'Splits = 0',
            topTag: 'IDLE',
            tone: 'mask',
            status: 'masked',
          },
        ],
        epLoads: [
          {
            expert: 'Splits[0]',
            tokens: 2,
            maxTokens: 4,
            timeLabel: '待收 [2,D]',
            shapeLabel: '2 / 4',
            tone: 'active',
            dashed: true,
          },
          {
            expert: 'Splits[1]',
            tokens: 4,
            maxTokens: 4,
            timeLabel: '热点 [4,D]',
            shapeLabel: '4 / 4',
            tone: 'highlight',
            active: true,
            dashed: true,
          },
          {
            expert: 'Splits[2]',
            tokens: 2,
            maxTokens: 4,
            timeLabel: '待收 [2,D]',
            shapeLabel: '2 / 4',
            tone: 'active',
            dashed: true,
          },
          {
            expert: 'Splits[3]',
            tokens: 0,
            maxTokens: 4,
            timeLabel: '空 [0,D]',
            shapeLabel: '0 / 4',
            tone: 'mask',
            dashed: true,
          },
        ],
        links: makeLinks('down', false, true),
        corridorBadge: { text: 'Top-2 Splits: [2, 4, 2, 0]', tone: 'highlight' },
        dpShape: '[1, D] / 卡',
        epShapeSkew: '[2, 4, 2, 0] 偏斜',
        commVolume: 'KV 零跨卡传输',
        stragglerStatus: 'E1 成为路由热点',
      },
      caption:
        'Step 1（DP 路由计数）：4 张卡各自持有独立请求 $t_0..t_3$ 与局部 KV（零副本冗余），输出 $[1, D]$ 激活；Top-2 门控路由集中命中 $E_1$，先经计数握手确定各卡 Splits $[2, 4, 2, 0]$。',
    },
    {
      label: 'All-to-All 重排派发',
      duration: 4600,
      state: {
        stepIndex: 1,
        phaseLabel: '2. 非对称 All-to-All Dispatch',
        formulaTex:
          '$[1, D]_{\\text{DP}} \\xrightarrow{\\text{All-to-All}} [2,D],\\,[4,D],\\,[2,D],\\,[0,D]$',
        dpSlots: [
          {
            id: 'dp0',
            label: '$t_0$ 切分发送',
            sub: '发往 $E_0, E_1$',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
          {
            id: 'dp1',
            label: '$t_1$ 切分发送',
            sub: '发往 $E_1, E_2$',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
          {
            id: 'dp2',
            label: '$t_2$ 切分发送',
            sub: '发往 $E_0, E_1$',
            topTag: 'SEND x2',
            tone: 'active',
            status: 'normal',
          },
          {
            id: 'dp3',
            label: '$t_3$ 切分发送',
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
            sub: 'Rank 1 Incast',
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
            label: '$E_3$: 空槽',
            sub: 'Rank 3 零接收',
            topTag: '0 tok',
            tone: 'mask',
            status: 'empty',
          },
        ],
        epLoads: [
          {
            expert: '$X_{E_0}$',
            tokens: 2,
            maxTokens: 4,
            timeLabel: '$[2, D]$ 就绪',
            shapeLabel: '2 tok',
            tone: 'active',
            active: true,
          },
          {
            expert: '$X_{E_1}$',
            tokens: 4,
            maxTokens: 4,
            timeLabel: '$[4, D]$ 拥塞',
            shapeLabel: '4 tok',
            tone: 'highlight',
            active: true,
          },
          {
            expert: '$X_{E_2}$',
            tokens: 2,
            maxTokens: 4,
            timeLabel: '$[2, D]$ 就绪',
            shapeLabel: '2 tok',
            tone: 'active',
            active: true,
          },
          {
            expert: '$X_{E_3}$',
            tokens: 0,
            maxTokens: 4,
            timeLabel: '$[0, D]$ 空',
            shapeLabel: '0 tok',
            tone: 'mask',
            dashed: true,
          },
        ],
        links: makeLinks('down', true, false),
        corridorBadge: { text: 'All-to-All Dispatch', tone: 'highlight' },
        dpShape: '[1, D] -> 变长发送',
        epShapeSkew: '[2, 4, 2, 0] × D',
        commVolume: 'Incast 拥塞 Rank 1',
        stragglerStatus: '批形状彻底重构',
      },
      caption:
        'Step 2（All-to-All 重排派发）：变长 All-to-All 按路由表将各卡 $[1, D]$ 激活副本送达目标专家；Rank 1 同时承受 4 路 Incast 写入并扩展为 $[4, D]$ 缓冲，Rank 3 则颗粒无收。',
    },
    {
      label: '热点长尾阻塞',
      duration: 4600,
      state: {
        stepIndex: 2,
        phaseLabel: '3. 专家 Grouped GEMM (木桶效应)',
        formulaTex: '$T_{\\text{FFN}} = \\max_r T(N_r) = T(E_1) = 2.0\\times t$',
        dpSlots: [
          {
            id: 'dp0',
            label: 'DP0 同步挂起',
            sub: '等待 $E_0, E_1$',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
          {
            id: 'dp1',
            label: 'DP1 同步挂起',
            sub: '等待 $E_1, E_2$',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
          {
            id: 'dp2',
            label: 'DP2 同步挂起',
            sub: '等待 $E_0, E_1$',
            topTag: 'WAIT',
            tone: 'neutral',
            status: 'normal',
          },
          {
            id: 'dp3',
            label: 'DP3 同步挂起',
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
            sub: '2 tok 早完工',
            topTag: '1.0x t',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'ep1',
            label: '$E_1$ FFN',
            sub: '4 tok 长尾关键路径',
            topTag: '2.0x t',
            tone: 'highlight',
            status: 'active',
          },
          {
            id: 'ep2',
            label: '$E_2$ FFN',
            sub: '2 tok 早完工',
            topTag: '1.0x t',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'ep3',
            label: '$E_3$ FFN',
            sub: '无负载空转',
            topTag: 'IDLE',
            tone: 'mask',
            status: 'masked',
          },
        ],
        epLoads: [
          {
            expert: '$Y_{E_0}$',
            tokens: 2,
            maxTokens: 4,
            timeLabel: '1.0x t 完工等待',
            shapeLabel: '50%',
            tone: 'done',
          },
          {
            expert: '$Y_{E_1}$',
            tokens: 4,
            maxTokens: 4,
            timeLabel: '2.0x t 阻塞全组',
            shapeLabel: '100%',
            tone: 'highlight',
            active: true,
          },
          {
            expert: '$Y_{E_2}$',
            tokens: 2,
            maxTokens: 4,
            timeLabel: '1.0x t 完工等待',
            shapeLabel: '50%',
            tone: 'done',
          },
          {
            expert: '$Y_{E_3}$',
            tokens: 0,
            maxTokens: 4,
            timeLabel: '0% 空转浪费',
            shapeLabel: '0%',
            tone: 'mask',
            dashed: true,
          },
        ],
        links: makeLinks('down', false, true),
        corridorBadge: { text: 'Grouped GEMM · 等热点 Rank 1', tone: 'highlight' },
        dpShape: '等待 Combine 屏障',
        epShapeSkew: 'Rank 1 = 2x 计算耗时',
        commVolume: '纯本地 GroupedMatmul',
        stragglerStatus: '木桶长尾: Rank 1 拖慢',
      },
      caption:
        'Step 3（热点长尾阻塞）：各卡在本地执行 Grouped GEMM；虽然 $E_0$ 与 $E_2$ 仅需 $1.0\\times t$ 即完工，但全组必须在 Combine 屏障处干等承担 4 个 token 的 $E_1$（$2.0\\times t$），$E_3$ 整轮空转。',
    },
    {
      label: 'Combine 回传归约',
      duration: 4600,
      state: {
        stepIndex: 3,
        phaseLabel: '4. All-to-All Combine + 加权还原',
        formulaTex: '$y_t = w_1 Y_{E_{r1}} + w_2 Y_{E_{r2}} \\in \\mathbb{R}^{1 \\times D}$',
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
        epLoads: [
          {
            expert: '$Y_{E_0} \\to \\text{DP}$',
            tokens: 1,
            maxTokens: 4,
            timeLabel: '回传释放',
            shapeLabel: '2->0',
            tone: 'done',
            dashed: true,
          },
          {
            expert: '$Y_{E_1} \\to \\text{DP}$',
            tokens: 1,
            maxTokens: 4,
            timeLabel: '回传释放',
            shapeLabel: '4->0',
            tone: 'done',
            dashed: true,
          },
          {
            expert: '$Y_{E_2} \\to \\text{DP}$',
            tokens: 1,
            maxTokens: 4,
            timeLabel: '回传释放',
            shapeLabel: '2->0',
            tone: 'done',
            dashed: true,
          },
          {
            expert: '$Y_{E_3}$',
            tokens: 0,
            maxTokens: 4,
            timeLabel: '空闲',
            shapeLabel: '0',
            tone: 'mask',
            dashed: true,
          },
        ],
        links: makeLinks('up', true, false, 'done'),
        corridorBadge: { text: 'All-to-All Combine', tone: 'done' },
        dpShape: '[1, D] 还原完成',
        epShapeSkew: '回传归约完毕',
        commVolume: '2 次 All-to-All / 层',
        stragglerStatus: '重返 DP 并行下一层',
      },
      caption:
        'Step 4（Combine 回传归约）：专家输出沿逆向 All-to-All 回传原卡，并按门控权重 $w_1 y_1 + w_2 y_2$ 归约叠加，将激活重新对齐为 $[1, D]$ 交还下一层 Attention DP。',
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
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { dotToken }) => {
        const s = step.state;
        const badgeStroke = resolveToneStroke(s.corridorBadge.tone);

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

        return (
          <Stage width={STAGE_W} height={428} label="Attention DP 到 MoE EP 路由生命周期面板">
            <SectionBox
              x={12}
              y={10}
              w={STAGE_W - 24}
              h={96}
              title={`Attention DP 侧 (KV 零副本冗余) · ${s.phaseLabel}`}
              tone={s.stepIndex === 3 ? 'done' : 'active'}
            />
            <SlotStrip
              x={24}
              y={46}
              slots={s.dpSlots}
              slotW={144}
              slotH={44}
              gap={18}
              fontSize={12}
            />

            {/* Cross-rank All-to-All DataFlowArrows */}
            {s.links.map((lk) => (
              <DataFlowArrow
                key={lk.id}
                points={lk.points}
                tone={lk.tone}
                active={lk.active}
                muted={!lk.active}
                dashed={lk.dashed}
                flow={lk.flow}
                continuous={true}
                draw={lk.draw}
                dotToken={lk.flow ? dotToken : 0}
                strokeWidth={lk.active ? 1.75 : 1.15}
              />
            ))}

            <g>
              <rect
                x={STAGE_W / 2 - 92}
                y={137}
                width={184}
                height={22}
                rx={RADIUS}
                fill="var(--wisp-bg)"
                stroke={badgeStroke}
                strokeWidth={1.25}
              />
              <SvgRichLabel
                x={STAGE_W / 2}
                y={148}
                width={180}
                height={22}
                text={s.corridorBadge.text}
                fontSize={11}
                fontWeight={600}
                color={badgeStroke}
                family="mono"
              />
            </g>

            <SectionBox
              x={12}
              y={192}
              w={STAGE_W - 24}
              h={160}
              title="MoE EP 专家侧 (按 Top-2 路由重塑各卡批尺寸与计算负载条)"
              tone={s.stepIndex === 3 ? 'done' : 'highlight'}
            />
            <SlotStrip
              x={24}
              y={230}
              slots={s.epSlots}
              slotW={144}
              slotH={40}
              gap={18}
              fontSize={12}
            />

            {/* Smoothly animated load bars per EP rank */}
            {s.epLoads.map((card, idx) => {
              const bx = 24 + idx * (144 + 18);
              const by = 282;
              const bw = 144;
              const bh = 56;
              const stroke = resolveToneStroke(card.tone);
              const fill = resolveToneFill(card.tone);
              const trackW = bw - 16;
              const barW =
                card.tokens > 0
                  ? Math.max(10, Math.round((card.tokens / card.maxTokens) * trackW))
                  : 0;

              return (
                <g key={`ep-load-${idx}`}>
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={RADIUS}
                    fill="var(--wisp-bg)"
                    stroke={stroke}
                    strokeWidth={card.active ? 1.75 : 1}
                    strokeDasharray={card.dashed ? '4 3' : undefined}
                  />
                  <SvgRichLabel
                    x={bx + 8}
                    y={by + 13}
                    width={92}
                    height={16}
                    text={card.expert}
                    fontSize={10.5}
                    fontWeight={600}
                    color="var(--wisp-fg)"
                    anchor="start"
                    family="mono"
                  />
                  <text
                    x={bx + bw - 8}
                    y={by + 13}
                    textAnchor="end"
                    dominantBaseline="central"
                    style={{
                      fill: card.active ? stroke : 'var(--wisp-muted)',
                      fontFamily: 'var(--wisp-font-mono)',
                      fontSize: 10,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {card.shapeLabel}
                  </text>
                  <rect
                    x={bx + 8}
                    y={by + 24}
                    width={trackW}
                    height={12}
                    rx={RADIUS_SM}
                    fill="var(--wisp-surface)"
                    stroke="var(--wisp-border)"
                    strokeWidth={0.75}
                  />
                  <motion.rect
                    initial={false}
                    animate={{ width: barW, fillOpacity: card.tokens > 0 ? 1 : 0 }}
                    transition={MORPH_SPRING}
                    x={bx + 8}
                    y={by + 24}
                    height={12}
                    rx={RADIUS_SM}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={card.tokens > 0 ? 1.25 : 0}
                  />
                  <SvgRichLabel
                    x={bx + bw / 2}
                    y={by + 45}
                    width={bw - 12}
                    height={14}
                    text={card.timeLabel}
                    fontSize={10}
                    color={card.active ? 'var(--wisp-fg)' : 'var(--wisp-muted)'}
                    family="sans"
                  />
                </g>
              );
            })}

            <MetricRow x={12} y={366} w={STAGE_W - 24} h={50} metrics={metrics} />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
