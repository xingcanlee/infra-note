import { useState } from 'react';
import { type Step, toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { InteractiveExplainer, LabSegmented, LabSlider, SvgRichLabel } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import {
  RADIUS_SM,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
  useDiagramMotion,
  type AnyTone,
} from '@/explainers/kit/motion';

export type SpecDecPreset = 'reject_resample' | 'accept_bonus';

export interface SpecDecVerifyState {
  stepIndex: number;
  phaseLabel: string;
  formulaTex: string;
  uThreshold: number;
}

const VOCAB = ['A', 'B', 'C', 'D'] as const;
const DRAFT_Q = [0.2, 0.5, 0.2, 0.1] as const;
const TARGET_P = [0.35, 0.25, 0.3, 0.1] as const;
const ACCEPT_RATES = VOCAB.map((_, i) => Math.min(1, TARGET_P[i] / DRAFT_Q[i])); // [1.0, 0.5, 1.0, 1.0]
const MIN_PQ = VOCAB.map((_, i) => Math.min(TARGET_P[i], DRAFT_Q[i])); // [0.20, 0.25, 0.20, 0.10]
const RESIDUAL_RAW = VOCAB.map((_, i) => Math.max(0, TARGET_P[i] - DRAFT_Q[i])); // [0.15, 0, 0.10, 0]
const RESIDUAL_Z = RESIDUAL_RAW.reduce((a, b) => a + b, 0); // 0.25

const PRESET_OPTIONS = [
  { id: 'reject_resample' as const, label: '拒绝重采 (u=0.72)' },
  { id: 'accept_bonus' as const, label: '全收奖励 (u=0.35)' },
] as const;

/** 保留供测试清单引用的 4 步构造导出 */
export function buildSpecDecVerifySteps(): Step<SpecDecVerifyState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: '草稿提案',
      duration: 4600,
      state: {
        stepIndex: 0,
        phaseLabel: '草稿与目标分布对比',
        formulaTex: '$q=[0.20,0.50,0.20,0.10],\\; p=[0.35,0.25,0.30,0.10]$',
        uThreshold: 0.72,
      },
      caption:
        '4 词词表 $[A,B,C,D]$ 下，草稿提出序列 $[A,B,C,D]$，其中位置 $k=2$ 的 B 满足 $q(B)=0.50 > p(B)=0.25$。',
    },
    {
      label: '阈值判定',
      duration: 4600,
      state: {
        stepIndex: 1,
        phaseLabel: '无损拒绝阈值判定',
        formulaTex: '$P(\\text{acc}\\mid B)=\\min(1, 0.25/0.50)=0.50 < u=0.72$',
        uThreshold: 0.72,
      },
      caption:
        '当随机阈值 $u=0.72 > 0.50$ 时，位置 $k=2$ 的 B 被拒收，后缀 $[C,D]$ 与奖励位一并截断。',
    },
    {
      label: '残差重采',
      duration: 4600,
      state: {
        stepIndex: 2,
        phaseLabel: '归一化残差分布补抽',
        formulaTex: '$P_{\\text{res}}(x)=\\operatorname{norm}(\\max(0,p-q))=[0.60,0,0.40,0]$',
        uThreshold: 0.72,
      },
      caption:
        '从仅保留正差值的残差分布 $P_{\\text{res}}=[0.60,0,0.40,0]$ 重采样替代词，保持边缘分布 $\\Delta\\mathrm{TV}=0.0000$。',
    },
    {
      label: '全收奖励',
      duration: 4600,
      state: {
        stepIndex: 3,
        phaseLabel: '全接收并激活奖励位',
        formulaTex:
          '$u=0.35 \\le 0.50 \\;\\Longrightarrow\\; \\text{全收 }[A,B,C,D]+\\text{Bonus}$',
        uThreshold: 0.35,
      },
      caption:
        '当 $u \\le 0.50$ 时全部 4 个候选均通过校验，并由末端已算出的 $p_5$ 额外采样第 5 个奖励 token。',
    },
  ];
}

export default function SpecDecVerifyExplainer({
  title = '图 1：Speculative Decoding 无损拒绝采样与数学等价证明',
}: {
  title?: string;
}) {
  const [u, setU] = useState<number>(0.72);
  const { stepTransition, canAnimateFlow } = useDiagramMotion();
  const isRejected = u > ACCEPT_RATES[1]; // 0.50
  const preset: SpecDecPreset = isRejected ? 'reject_resample' : 'accept_bonus';

  const handlePresetChange = (next: SpecDecPreset) => {
    setU(next === 'reject_resample' ? 0.72 : 0.35);
  };

  const handleReset = () => {
    setU(0.72);
  };

  const formulaTex = isRejected
    ? `$u=${u.toFixed(2)} > 0.50 \\Rightarrow \\text{拒收 }B,\\; P_{\\text{final}}(x)=\\min(p,q)+\\max(0,p-q)=p(x)$`
    : `$u=${u.toFixed(2)} \\le 0.50 \\Rightarrow \\text{全收 }[A,B,C,D]+\\text{Bonus},\\; P_{\\text{final}}(x)=p(x)$`;

  const caption = isRejected
    ? `位置 $k=2$ 的候选 $B$ 超猜了 $0.25$（$q=0.50 > p=0.25$），随机阈值 $u=${u.toFixed(2)} > 0.50$ 将其拒收并截断 $C,D$；多出的 $Z=0.25$ 拒绝质量按 $P_{\\text{res}}=[0.60, 0, 0.40, 0]$ 补回 $A(+0.15)$ 与 $C(+0.10)$，最终分布严格等于目标 $p(x)$。`
    : `随机阈值 $u=${u.toFixed(2)}$ 未超过所有位置的接收上限 $\\min(1,p/q)$（最低为 $B$ 的 $0.50$），4 个草稿全部通过校验并额外生成第 5 个 Bonus token；多次采样长期统计下，绿色直接接收与橙色残差补齐之和同样严格等于 $p(x)$。`;

  const slotCards = [
    {
      id: 'd0',
      top: '$D_0$: A',
      sub: '接收 A ($1.00$)',
      tone: 'done' as AnyTone,
      active: true,
      dimmed: false,
      dashed: false,
    },
    {
      id: 'd1',
      top: isRejected ? '$D_1$: $B \\to A^*$' : '$D_1$: B',
      sub: isRejected ? '拒收重采 ($0.50$)' : '接收 B ($0.50$)',
      tone: (isRejected ? 'highlight' : 'done') as AnyTone,
      active: true,
      dimmed: false,
      dashed: false,
    },
    {
      id: 'd2',
      top: '$D_2$: C',
      sub: isRejected ? '后缀已截断' : '接收 C ($1.00$)',
      tone: (isRejected ? 'neutral' : 'done') as AnyTone,
      active: !isRejected,
      dimmed: isRejected,
      dashed: isRejected,
    },
    {
      id: 'd3',
      top: '$D_3$: D',
      sub: isRejected ? '后缀已截断' : '接收 D ($1.00$)',
      tone: (isRejected ? 'neutral' : 'done') as AnyTone,
      active: !isRejected,
      dimmed: isRejected,
      dashed: isRejected,
    },
    {
      id: 'bonus',
      top: 'Bonus',
      sub: isRejected ? '未触发奖励' : '末端 $p_5$ 采样',
      tone: (isRejected ? 'neutral' : 'done') as AnyTone,
      active: !isRejected,
      dimmed: isRejected,
      dashed: isRejected,
    },
  ];

  // 左面板与右面板共有条形图坐标系统
  const barPlotTop = 148;
  const barPlotBottom = 310;
  const barPlotH = barPlotBottom - barPlotTop; // 162 px
  const maxProb = 0.55;
  const probY = (val: number) => barPlotBottom - (Math.min(maxProb, val) / maxProb) * barPlotH;
  const probH = (val: number) => Math.max(0, (Math.min(maxProb, val) / maxProb) * barPlotH);

  // B 的接收阈值演示横线位置：将 u (0..1) 映射至 B 的草稿高度 [0 .. 0.50] 上，直观显示 u=0.50 恰好落在 p(B)=0.25 切线处
  const uOnBY = probY(u * DRAFT_Q[1]);

  return (
    <InteractiveExplainer
      title={title}
      label={title}
      stageMinHeight={444}
      formula={formulaTex}
      caption={caption}
      onReset={handleReset}
      controls={
        <>
          <LabSegmented
            options={PRESET_OPTIONS}
            value={preset}
            onChange={handlePresetChange}
            ariaLabel="切换拒绝重采与全收奖励预设"
          />
          <LabSlider
            label="随机阈值 u"
            min={0.05}
            max={0.95}
            step={0.01}
            value={u}
            valueText={u.toFixed(2)}
            onChange={setU}
          />
        </>
      }
    >
      <div className="wisp-kit-svg-frame">
        <svg
          viewBox="0 0 680 416"
          role="img"
          aria-label="推测解码无损拒绝采样与分布等价证明动态图解"
        >
          {/* Row 1：草稿序列从左到右校验流水线 (y = 10..96) */}
          <SectionBox
            x={14}
            y={10}
            w={652}
            h={86}
            tone={isRejected ? 'highlight' : 'done'}
            title={
              isRejected
                ? '1. 从左到右并行校验：$D_1$ 触发拒收，溢出质量沿残差重采替代词'
                : '1. 从左到右并行校验：4 个草稿全部通过，激活第 5 个 Bonus 位置'
            }
          />

          {slotCards.map((card, i) => {
            const cx = 22 + i * 132;
            const cw = 108;
            const cy = 36;
            const ch = 48;
            const fill = card.dimmed ? 'var(--wisp-bg)' : resolveToneFill(card.tone);
            const stroke = card.dimmed ? 'var(--wisp-border)' : resolveToneStroke(card.tone);
            return (
              <g key={card.id}>
                <motion.g
                  initial={false}
                  animate={{ opacity: card.dimmed ? 0.42 : 1 }}
                  transition={stepTransition}
                >
                  <rect
                    x={cx}
                    y={cy}
                    width={cw}
                    height={ch}
                    rx={4}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={card.active ? 1.8 : 1}
                    strokeDasharray={card.dashed ? '3 2' : undefined}
                  />
                  <SvgRichLabel
                    x={cx + cw / 2}
                    y={cy + 16}
                    width={cw - 8}
                    height={18}
                    fontSize={11}
                    fontWeight={700}
                    color="var(--wisp-fg)"
                    text={card.top}
                  />
                  <SvgRichLabel
                    x={cx + cw / 2}
                    y={cy + 34}
                    width={cw - 8}
                    height={16}
                    fontSize={9.5}
                    fontWeight={500}
                    color={card.dimmed ? 'var(--wisp-muted)' : stroke}
                    text={card.sub}
                  />
                </motion.g>

                {i < slotCards.length - 1 && (
                  <DataFlowArrow
                    points={[
                      [cx + cw, cy + ch / 2],
                      [cx + cw + 24, cy + ch / 2],
                    ]}
                    active={i === 0 || !isRejected}
                    flow={i === 0 || !isRejected}
                    muted={isRejected && i >= 1}
                    dashed={isRejected && i >= 1}
                    tone="done"
                    arrowEnd={true}
                  />
                )}
              </g>
            );
          })}

          {/* Row 2 左栏：草稿 q 与目标 p 对比，突出 B 的超猜质量 Z = 0.25 */}
          <SectionBox
            x={14}
            y={106}
            w={294}
            h={248}
            tone="neutral"
            dashed={false}
            title={'2. 草稿 $q(x)$ vs 目标 $p(x)$'}
          />

          {/* 左栏图例 */}
          <rect
            x={24}
            y={131}
            width={9}
            height={9}
            rx={RADIUS_SM}
            fill={toneFill('active')}
            stroke={toneStroke('active')}
            strokeWidth={1.1}
          />
          <SvgRichLabel
            x={37}
            y={135.5}
            width={56}
            height={16}
            anchor="start"
            fontSize={10}
            color="var(--wisp-muted)"
            text={'草稿 $q$'}
          />
          <rect
            x={94}
            y={131}
            width={9}
            height={9}
            rx={RADIUS_SM}
            fill={toneFill('done')}
            stroke={toneStroke('done')}
            strokeWidth={1.1}
          />
          <SvgRichLabel
            x={107}
            y={135.5}
            width={56}
            height={16}
            anchor="start"
            fontSize={10}
            color="var(--wisp-muted)"
            text={'目标 $p$'}
          />
          <rect
            x={166}
            y={131}
            width={9}
            height={9}
            rx={RADIUS_SM}
            fill={toneFill('highlight')}
            stroke={toneStroke('highlight')}
            strokeWidth={1.1}
            strokeDasharray="2 1"
          />
          <SvgRichLabel
            x={179}
            y={135.5}
            width={118}
            height={16}
            anchor="start"
            fontSize={10}
            color={toneStroke('highlight')}
            text={'多猜拒收 $q-p$'}
          />

          <line
            x1={24}
            y1={barPlotBottom}
            x2={296}
            y2={barPlotBottom}
            stroke="var(--wisp-border)"
            strokeWidth={1}
          />

          {VOCAB.map((tok, i) => {
            const groupCx = 58 + i * 66;
            const bw = 18;
            const qx = groupCx - bw - 2;
            const px = groupCx + 2;
            const qVal = DRAFT_Q[i];
            const pVal = TARGET_P[i];
            const isB = i === 1;

            return (
              <g key={`left-${tok}`}>
                {/* 草稿 q 柱：对 B 拆成 [0..0.25] + 溢出 [0.25..0.50] */}
                {isB ? (
                  <>
                    <rect
                      x={qx}
                      y={probY(pVal)}
                      width={bw}
                      height={probH(pVal)}
                      rx={RADIUS_SM}
                      fill={toneFill('active')}
                      stroke={toneStroke('active')}
                      strokeWidth={1.2}
                    />
                    <motion.rect
                      x={qx}
                      y={probY(qVal)}
                      width={bw}
                      height={probH(qVal - pVal)}
                      rx={RADIUS_SM}
                      fill={toneFill('highlight')}
                      stroke={toneStroke('highlight')}
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      initial={false}
                      animate={{ opacity: isRejected ? 1 : 0.65 }}
                      transition={stepTransition}
                      className={isRejected && canAnimateFlow ? 'wisp-focus-pulse' : undefined}
                    />
                  </>
                ) : (
                  <rect
                    x={qx}
                    y={probY(qVal)}
                    width={bw}
                    height={probH(qVal)}
                    rx={RADIUS_SM}
                    fill={toneFill('active')}
                    stroke={toneStroke('active')}
                    strokeWidth={1.2}
                  />
                )}

                {/* 目标 p 柱 */}
                <rect
                  x={px}
                  y={probY(pVal)}
                  width={bw}
                  height={probH(pVal)}
                  rx={RADIUS_SM}
                  fill={toneFill('done')}
                  stroke={toneStroke('done')}
                  strokeWidth={1.2}
                />

                <text
                  x={qx + bw / 2}
                  y={probY(qVal) - 6}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={isB ? 700 : 500}
                  fill={isB ? toneStroke('highlight') : toneStroke('active')}
                >
                  {qVal.toFixed(2)}
                </text>
                <text
                  x={px + bw / 2}
                  y={probY(pVal) - 6}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  fill={toneStroke('done')}
                >
                  {pVal.toFixed(2)}
                </text>

                <text
                  x={groupCx}
                  y={barPlotBottom + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--wisp-fg)"
                >
                  {tok}
                </text>
                <text
                  x={groupCx}
                  y={barPlotBottom + 27}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill={isB ? toneStroke('highlight') : 'var(--wisp-muted)'}
                >
                  {isB ? '上限 0.50' : pVal > qVal ? '必收(欠)' : '必收'}
                </text>
              </g>
            );
          })}

          {/* B 柱上的动态阈值 u 扫描横线 + 固定高处清晰徽标（避免遮挡 C 柱数值） */}
          <motion.g initial={false} animate={{ y: uOnBY }} transition={stepTransition}>
            <line
              x1={100}
              y1={0}
              x2={148}
              y2={0}
              stroke={isRejected ? toneStroke('highlight') : toneStroke('done')}
              strokeWidth={1.6}
              strokeDasharray="4 2"
            />
          </motion.g>
          <motion.line
            x1={148}
            x2={182}
            y2={188}
            initial={false}
            animate={{ y1: uOnBY }}
            transition={stepTransition}
            stroke={isRejected ? toneStroke('highlight') : toneStroke('done')}
            strokeWidth={1.1}
            strokeDasharray="3 2"
          />
          <rect
            x={152}
            y={170}
            width={62}
            height={18}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
            stroke={isRejected ? toneStroke('highlight') : toneStroke('done')}
            strokeWidth={1.2}
          />
          <SvgRichLabel
            x={183}
            y={179}
            width={58}
            height={16}
            fontSize={9.5}
            fontWeight={700}
            color={isRejected ? toneStroke('highlight') : toneStroke('done')}
            text={`$u=${u.toFixed(2)}$`}
          />

          {/* 中央流动桥梁：拒绝总质量 Z = 0.25 流入残差重采样 */}
          <DataFlowArrow
            points={[
              [308, 224],
              [372, 224],
            ]}
            active={true}
            flow={true}
            tone="highlight"
            label={'$Z=0.25$'}
            labelPos={[340, 204]}
          />

          {/* Row 2 右栏：数学等价分解 min(p, q) + max(0, p - q) = p */}
          <SectionBox
            x={372}
            y={106}
            w={294}
            h={248}
            tone="done"
            dashed={false}
            title={'3. 边缘等价：$\\min(p,q)+\\max(0,p-q)=p$'}
          />

          <rect
            x={382}
            y={131}
            width={9}
            height={9}
            rx={RADIUS_SM}
            fill={toneFill('done')}
            stroke={toneStroke('done')}
            strokeWidth={1.1}
          />
          <SvgRichLabel
            x={395}
            y={135.5}
            width={118}
            height={16}
            anchor="start"
            fontSize={10}
            color="var(--wisp-muted)"
            text={'直接接收 $\\min(p,q)$'}
          />
          <rect
            x={510}
            y={131}
            width={9}
            height={9}
            rx={RADIUS_SM}
            fill={toneFill('highlight')}
            stroke={toneStroke('highlight')}
            strokeWidth={1.1}
          />
          <SvgRichLabel
            x={523}
            y={135.5}
            width={136}
            height={16}
            anchor="start"
            fontSize={10}
            color={toneStroke('highlight')}
            text={'残差补齐 $\\max(0,p-q)$'}
          />

          <line
            x1={382}
            y1={barPlotBottom}
            x2={656}
            y2={barPlotBottom}
            stroke="var(--wisp-border)"
            strokeWidth={1}
          />

          {VOCAB.map((tok, i) => {
            const cx = 418 + i * 66;
            const bw = 32;
            const bx = cx - bw / 2;
            const baseVal = MIN_PQ[i];
            const resVal = RESIDUAL_RAW[i];
            const targetVal = TARGET_P[i];
            const baseH = probH(baseVal);
            const resH = probH(resVal);

            return (
              <g key={`right-${tok}`}>
                {/* 底层直接接收质量 min(p, q) */}
                <rect
                  x={bx}
                  y={probY(baseVal)}
                  width={bw}
                  height={baseH}
                  rx={RADIUS_SM}
                  fill={toneFill('done')}
                  stroke={toneStroke('done')}
                  strokeWidth={1.3}
                />

                {/* 顶层残差补齐质量 max(0, p - q) */}
                {resVal > 0 && (
                  <motion.rect
                    x={bx}
                    width={bw}
                    rx={RADIUS_SM}
                    fill={toneFill('highlight')}
                    stroke={toneStroke('highlight')}
                    strokeWidth={1.4}
                    initial={false}
                    animate={{
                      y: probY(targetVal),
                      height: resH,
                      opacity: isRejected ? 1 : 0.85,
                    }}
                    transition={stepTransition}
                  />
                )}

                {/* 目标概率 p(x) 虚线校准框：证明堆叠总高度恰好等于 p(x) */}
                <line
                  x1={bx - 4}
                  y1={probY(targetVal)}
                  x2={bx + bw + 4}
                  y2={probY(targetVal)}
                  stroke={toneStroke('done')}
                  strokeWidth={1.6}
                  strokeDasharray="3 2"
                />

                <text
                  x={cx}
                  y={probY(targetVal) - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="var(--wisp-fg)"
                >
                  {targetVal.toFixed(2)}
                </text>

                {resVal > 0 && (
                  <text
                    x={cx}
                    y={probY(targetVal) + resH / 2 + 3.5}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill={toneStroke('highlight')}
                  >
                    +{resVal.toFixed(2)}
                  </text>
                )}

                <text
                  x={cx}
                  y={barPlotBottom + 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--wisp-fg)"
                >
                  {tok}
                </text>
                <text
                  x={cx}
                  y={barPlotBottom + 27}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill="var(--wisp-muted)"
                >
                  {resVal > 0
                    ? `= ${baseVal.toFixed(2)}+${resVal.toFixed(2)}`
                    : `= ${targetVal.toFixed(2)}`}
                </text>
              </g>
            );
          })}

          {/* Row 3：底部结论指标栏 */}
          <MetricRow
            x={14}
            y={364}
            w={652}
            h={42}
            gap={10}
            metrics={[
              { label: '$B$ 接收上限', value: '$p(B)/q(B)=0.50$', tone: 'active' },
              {
                label: '当前裁决阈值',
                value: isRejected
                  ? `$u=${u.toFixed(2)} > 0.50$ 拒收`
                  : `$u=${u.toFixed(2)} \\le 0.50$ 全收`,
                tone: isRejected ? 'highlight' : 'done',
                active: true,
              },
              {
                label: '总拒绝质量 $Z$',
                value: `$P(\\text{reject})=${RESIDUAL_Z.toFixed(2)}$`,
                tone: 'highlight',
              },
              {
                label: '边缘分布误差 $\\Delta\\mathrm{TV}$',
                value: '$0.0000$（严格无损）',
                tone: 'done',
              },
            ]}
          />
        </svg>
      </div>
    </InteractiveExplainer>
  );
}
