import { useMemo, useState } from 'react';
import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  BeatExplainer,
  DataFlowArrow,
  LabSegmented,
  RADIUS,
  RADIUS_SM,
  SvgRichLabel,
  useDiagramMotion,
} from '@/explainers/kit';
import {
  HEADS,
  MULTIPLIERS,
  SCENARIOS,
  TOKENS,
  TOTAL_ROWS,
  buildEngramHashSteps,
  computeRollingHash,
  computeSlots,
  type ScenarioSpec,
} from './steps';
import './style.css';

export { buildEngramHashSteps };

export interface EngramHashExplainerProps {
  title?: string;
}

const SCENARIO_OPTIONS: readonly { id: ScenarioSpec['id']; label: string }[] = [
  { id: 'china', label: SCENARIOS.china.label },
  { id: 'new_chief', label: SCENARIOS.new_chief.label },
  { id: 'poem', label: SCENARIOS.poem.label },
];

// 36 行按 5:7:11:13 在 x=16..664 (w=648) 内切分
const BUCKET_X = 16;
const BUCKET_W = 648;
const HEAD_LAYOUT = HEADS.reduce<
  Array<{ x: number; w: number; center: number; head: (typeof HEADS)[number] }>
>((acc, head) => {
  const prevEnd = acc.length === 0 ? BUCKET_X : acc[acc.length - 1].x + acc[acc.length - 1].w;
  const w = (head.prime / TOTAL_ROWS) * BUCKET_W;
  acc.push({ x: prevEnd, w, center: prevEnd + w / 2, head });
  return acc;
}, []);

const TOKEN_X = [224, 313, 402, 491, 580] as const;
const TOKEN_W = 82;

export default function EngramHashExplainer({ title }: EngramHashExplainerProps) {
  const steps = useMemo(() => buildEngramHashSteps(), []);
  const [scenario, setScenario] = useState<ScenarioSpec['id']>('china');
  const { stepTransition } = useDiagramMotion();

  const spec = SCENARIOS[scenario];
  const rolling = useMemo(() => computeRollingHash(88, 12, spec.prefixId), [spec.prefixId]);
  const lookups = useMemo(() => computeSlots(rolling.h2, rolling.h3), [rolling.h2, rolling.h3]);
  const chinaSlots = SCENARIOS.china.slots;

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={456}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={scenario}
    >
      {(step, { dotToken }) => {
        const phase = step.state.phase;
        const stepIdx =
          phase === 'normalize' ? 0 : phase === 'xor' ? 1 : phase === 'lookup' ? 2 : 3;
        const isNorm = stepIdx === 0;
        const isXor = stepIdx === 1;
        const isLookup = stepIdx === 2;
        const isGate = stepIdx === 3;
        const showCompareChina = scenario !== 'china';
        const gateBarW = Math.round(264 * spec.alpha);

        return (
          <div className="engram-stage">
            <div className="engram-switcher">
              <span className="engram-banks-title">短语语境（替换前缀词 t = 3）</span>
              <LabSegmented
                options={SCENARIO_OPTIONS}
                value={scenario}
                onChange={setScenario}
                ariaLabel="选择上下文测试短语"
              />
            </div>

            <div className="wisp-kit-svg-frame">
              <svg
                className="engram-unified-svg"
                viewBox="0 0 680 426"
                role="img"
                aria-label="Engram 词表归一、奇乘子滚动异或、素数取模查桶与碰撞门控渐进图"
              >
                {/* 1. 顶部：后缀窗口（首帧即清晰可见，不混生产词表尺度） */}
                <motion.g
                  initial={false}
                  animate={{ opacity: isNorm || isXor ? 1 : 0.68 }}
                  transition={stepTransition}
                >
                  <rect
                    x={16}
                    y={24}
                    width={174}
                    height={72}
                    rx={RADIUS}
                    fill={isNorm ? toneFill('active') : 'var(--wisp-surface)'}
                    stroke={isNorm ? toneStroke('active') : 'var(--wisp-border)'}
                    strokeWidth={isNorm ? 1.6 : 1}
                  />
                  <text
                    x={103}
                    y={43}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="var(--wisp-fg)"
                  >
                    后缀窗口截取 (t = 5)
                  </text>
                  <SvgRichLabel
                    x={103}
                    y={64}
                    width={162}
                    height={18}
                    fontSize={10.5}
                    fontWeight={600}
                    text={'$2\\text{-gram}: (12, 88)$'}
                  />
                  <SvgRichLabel
                    x={103}
                    y={82}
                    width={162}
                    height={18}
                    fontSize={10}
                    color="var(--wisp-muted)"
                    text={`$3\\text{-gram}: (${spec.prefixId}, 12, 88)$`}
                  />

                  <DataFlowArrow
                    points={[
                      [190, 60],
                      [222, 60],
                    ]}
                    tone="active"
                    active={isNorm}
                    visible={true}
                    flow={isNorm}
                    dotToken={dotToken}
                    strokeWidth={1.6}
                  />

                  {/* 2-gram 顶部框线 */}
                  <path
                    d="M 532 30 L 532 22 L 621 22 L 621 30"
                    fill="none"
                    stroke={toneStroke('active')}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                  <rect
                    x={548}
                    y={13}
                    width={58}
                    height={14}
                    rx={RADIUS_SM}
                    fill="var(--wisp-bg)"
                  />
                  <text
                    x={577}
                    y={22}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill={toneStroke('active')}
                  >
                    2-gram
                  </text>

                  {/* 5 个词元槽 */}
                  {TOKENS.map((tok, i) => {
                    const tx = TOKEN_X[i];
                    const isContext = tok.role === 'context';
                    const isPrefix3 = tok.pos === 3;
                    const displayText = isPrefix3 ? spec.prefixText : tok.text;
                    const displayId = isPrefix3 ? spec.prefixId : tok.id;
                    const tone = isContext
                      ? null
                      : isPrefix3
                        ? showCompareChina && isGate
                          ? 'highlight'
                          : 'done'
                        : 'active';
                    const fill = tone ? toneFill(tone) : 'var(--wisp-surface)';
                    const stroke = tone ? toneStroke(tone) : 'var(--wisp-border)';
                    const dimmed = !isNorm && isContext;

                    return (
                      <motion.g
                        key={tok.pos}
                        initial={false}
                        animate={{ opacity: dimmed ? 0.3 : 1 }}
                        transition={stepTransition}
                      >
                        <rect
                          x={tx}
                          y={32}
                          width={TOKEN_W}
                          height={60}
                          rx={RADIUS}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={tone ? 1.5 : 1}
                        />
                        <text
                          x={tx + TOKEN_W / 2}
                          y={46}
                          textAnchor="middle"
                          fontSize={10}
                          fill="var(--wisp-muted)"
                          style={{ fontFamily: 'var(--wisp-font-mono)' }}
                        >
                          t={tok.pos}
                        </text>
                        <text
                          x={tx + TOKEN_W / 2}
                          y={65}
                          textAnchor="middle"
                          fontSize={12.5}
                          fontWeight={700}
                          fill="var(--wisp-fg)"
                        >
                          “{displayText}”
                        </text>
                        <SvgRichLabel
                          x={tx + TOKEN_W / 2}
                          y={82}
                          width={TOKEN_W - 6}
                          height={16}
                          fontSize={10}
                          color="var(--wisp-muted)"
                          text={`$c_${tok.pos}=${displayId}$`}
                        />
                      </motion.g>
                    );
                  })}

                  {/* 3-gram 底部括号 */}
                  <path
                    d="M 443 94 L 443 102 L 621 102 L 621 94"
                    fill="none"
                    stroke={toneStroke('done')}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                  <rect
                    x={502}
                    y={96}
                    width={60}
                    height={14}
                    rx={RADIUS_SM}
                    fill="var(--wisp-bg)"
                  />
                  <text
                    x={532}
                    y={106}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill={toneStroke('done')}
                  >
                    3-gram
                  </text>
                </motion.g>

                {/* 顶部 -> 中部非交叉双线路由（Step 2 起渐进显影） */}
                <DataFlowArrow
                  points={[
                    [576, 92],
                    [576, 114],
                    [165, 114],
                    [165, 136],
                  ]}
                  tone="active"
                  active={isXor}
                  visible={stepIdx >= 1}
                  flow={isXor}
                  draw={stepIdx >= 1}
                  dotToken={dotToken}
                  strokeWidth={1.5}
                />
                <DataFlowArrow
                  points={[
                    [443, 102],
                    [443, 124],
                    [586, 124],
                    [586, 136],
                  ]}
                  tone="done"
                  active={isXor}
                  visible={stepIdx >= 1}
                  flow={isXor}
                  draw={stepIdx >= 1}
                  dotToken={dotToken}
                  strokeWidth={1.5}
                />

                {/* 2. 中部：奇乘子滚动异或管道（Step 2 浮现） */}
                <motion.g
                  initial={false}
                  animate={{
                    opacity: stepIdx < 1 ? 0.12 : isXor ? 1 : 0.72,
                    y: stepIdx < 1 ? 6 : 0,
                  }}
                  transition={stepTransition}
                >
                  {/* 2-gram 卡 */}
                  <rect
                    x={16}
                    y={136}
                    width={296}
                    height={86}
                    rx={RADIUS}
                    fill={isXor ? toneFill('active') : 'var(--wisp-surface)'}
                    stroke={isXor ? toneStroke('active') : 'var(--wisp-border)'}
                    strokeWidth={isXor ? 1.6 : 1}
                  />
                  <text x={28} y={154} fontSize={11} fontWeight={700} fill="var(--wisp-fg)">
                    2-gram 奇乘子按位异或
                  </text>
                  <SvgRichLabel
                    x={300}
                    y={151}
                    width={74}
                    height={18}
                    anchor="end"
                    fontSize={10.5}
                    fontWeight={700}
                    color={toneStroke('active')}
                    text={`$g_2 = ${rolling.h2}$`}
                  />

                  <rect
                    x={28}
                    y={165}
                    width={130}
                    height={24}
                    rx={RADIUS_SM}
                    fill="var(--wisp-bg)"
                    stroke="var(--wisp-border)"
                  />
                  <SvgRichLabel
                    x={93}
                    y={177}
                    width={122}
                    height={18}
                    fontSize={10}
                    text={`$88 \\times m_0(${MULTIPLIERS[0]}) = ${rolling.prod0}$`}
                  />

                  <rect
                    x={170}
                    y={165}
                    width={130}
                    height={24}
                    rx={RADIUS_SM}
                    fill="var(--wisp-bg)"
                    stroke="var(--wisp-border)"
                  />
                  <SvgRichLabel
                    x={235}
                    y={177}
                    width={122}
                    height={18}
                    fontSize={10}
                    text={`$12 \\times m_1(${MULTIPLIERS[1]}) = ${rolling.prod1}$`}
                  />

                  <SvgRichLabel
                    x={164}
                    y={205}
                    width={260}
                    height={18}
                    fontSize={10.5}
                    fontWeight={600}
                    text={`$g_2 = ${rolling.prod0} \\oplus ${rolling.prod1} = ${rolling.h2}$`}
                  />

                  {/* 横向复用 g₂ 接力箭 */}
                  <DataFlowArrow
                    points={[
                      [312, 179],
                      [368, 179],
                    ]}
                    tone="active"
                    active={isXor}
                    visible={stepIdx >= 1}
                    flow={isXor}
                    dotToken={dotToken}
                    label="复用 g₂"
                    labelPos={[340, 165]}
                  />

                  {/* 3-gram 卡 */}
                  <rect
                    x={368}
                    y={136}
                    width={296}
                    height={86}
                    rx={RADIUS}
                    fill={isXor ? toneFill('done') : 'var(--wisp-surface)'}
                    stroke={isXor ? toneStroke('done') : 'var(--wisp-border)'}
                    strokeWidth={isXor ? 1.6 : 1}
                  />
                  <text x={380} y={154} fontSize={11} fontWeight={700} fill="var(--wisp-fg)">
                    3-gram 滚动递推异或
                  </text>
                  <SvgRichLabel
                    x={652}
                    y={151}
                    width={84}
                    height={18}
                    anchor="end"
                    fontSize={10.5}
                    fontWeight={700}
                    color={toneStroke('done')}
                    text={`$g_3 = ${rolling.h3}$`}
                  />

                  <rect
                    x={380}
                    y={165}
                    width={118}
                    height={24}
                    rx={RADIUS_SM}
                    fill="var(--wisp-bg)"
                    stroke="var(--wisp-border)"
                  />
                  <SvgRichLabel
                    x={439}
                    y={177}
                    width={110}
                    height={18}
                    fontSize={10}
                    text={`接力 $g_2 = ${rolling.h2}$`}
                  />

                  <rect
                    x={506}
                    y={165}
                    width={146}
                    height={24}
                    rx={RADIUS_SM}
                    fill="var(--wisp-bg)"
                    stroke="var(--wisp-border)"
                  />
                  <SvgRichLabel
                    x={579}
                    y={177}
                    width={138}
                    height={18}
                    fontSize={10}
                    text={`$${spec.prefixId}\\times m_2(${MULTIPLIERS[2]})=${rolling.prod2}$`}
                  />

                  <SvgRichLabel
                    x={516}
                    y={205}
                    width={276}
                    height={18}
                    fontSize={10.5}
                    fontWeight={600}
                    text={`$g_3 = ${rolling.h2} \\oplus ${rolling.prod2} = ${rolling.h3}$`}
                  />
                </motion.g>

                {/* 中部 -> 底部素数分桶路由箭头（Step 3 浮现） */}
                <DataFlowArrow
                  points={[
                    [HEAD_LAYOUT[0].center, 222],
                    [HEAD_LAYOUT[0].center, 252],
                  ]}
                  tone="active"
                  active={isLookup}
                  visible={stepIdx >= 2}
                  flow={isLookup}
                  draw={stepIdx >= 2}
                  dotToken={dotToken}
                  label="mod 5+0"
                />
                <DataFlowArrow
                  points={[
                    [HEAD_LAYOUT[1].center, 222],
                    [HEAD_LAYOUT[1].center, 252],
                  ]}
                  tone="active"
                  active={isLookup}
                  visible={stepIdx >= 2}
                  flow={isLookup}
                  draw={stepIdx >= 2}
                  dotToken={dotToken}
                  label="mod 7+5"
                />
                <DataFlowArrow
                  points={[
                    [414, 222],
                    [414, 236],
                    [HEAD_LAYOUT[2].center, 236],
                    [HEAD_LAYOUT[2].center, 252],
                  ]}
                  tone="done"
                  active={isLookup}
                  visible={stepIdx >= 2}
                  flow={isLookup}
                  draw={stepIdx >= 2}
                  dotToken={dotToken}
                  label="mod 11+12"
                  labelPos={[372, 236]}
                />
                <DataFlowArrow
                  points={[
                    [HEAD_LAYOUT[3].center, 222],
                    [HEAD_LAYOUT[3].center, 252],
                  ]}
                  tone={scenario === 'new_chief' ? 'highlight' : 'done'}
                  active={isLookup || isGate}
                  visible={stepIdx >= 2}
                  flow={isLookup}
                  draw={stepIdx >= 2}
                  dotToken={dotToken}
                  label="mod 13+23"
                />

                {/* 3. 底部上层：36 行互异素数扁平大表 E（Step 3 浮现） */}
                <motion.g
                  initial={false}
                  animate={{
                    opacity: stepIdx < 2 ? 0.12 : isLookup || isGate ? 1 : 0.72,
                    y: stepIdx < 2 ? 6 : 0,
                  }}
                  transition={stepTransition}
                >
                  <rect
                    x={BUCKET_X}
                    y={252}
                    width={BUCKET_W}
                    height={80}
                    rx={RADIUS}
                    fill="var(--wisp-surface)"
                    stroke={isLookup ? toneStroke('done') : 'var(--wisp-border)'}
                    strokeWidth={isLookup ? 1.4 : 1}
                  />

                  {HEAD_LAYOUT.map(({ x, w, center, head }, hi) => {
                    const lk = lookups[hi];
                    const hitSlot = lk.slot;
                    const chinaSlot = chinaSlots[hi];
                    const isCollisionHead = hi === 3 && scenario === 'new_chief';
                    const isIsolatedHead = hi === 2 && scenario === 'new_chief';
                    const headTone = isCollisionHead ? 'highlight' : head.tone;
                    const innerPad = 6;
                    const slotGap = 2;
                    const slotW = (w - innerPad * 2 - slotGap * (head.prime - 1)) / head.prime;

                    return (
                      <g key={head.headIdx}>
                        {hi > 0 && (
                          <line
                            x1={x}
                            y1={254}
                            x2={x}
                            y2={330}
                            stroke="var(--wisp-border)"
                            strokeDasharray="3 2"
                          />
                        )}
                        <text
                          x={center}
                          y={267}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight={600}
                          fill="var(--wisp-fg)"
                        >
                          {`头 ${head.headIdx} · p=${head.prime} (off=${head.offset})`}
                        </text>

                        {Array.from({ length: head.prime }, (_, rem) => {
                          const rowIdx = head.offset + rem;
                          const sx = x + innerPad + rem * (slotW + slotGap);
                          const isHit = rowIdx === hitSlot;
                          const isChinaRef = showCompareChina && hi >= 2 && rowIdx === chinaSlot;
                          const cellTone = isHit ? headTone : isChinaRef ? 'done' : null;
                          const popH = isHit && stepIdx >= 2 ? 28 : 24;
                          const popY = isHit && stepIdx >= 2 ? 273 : 275;

                          return (
                            <motion.rect
                              key={rowIdx}
                              x={sx}
                              width={slotW}
                              rx={RADIUS_SM}
                              initial={false}
                              animate={{
                                y: popY,
                                height: popH,
                                fillOpacity: isHit ? 1 : isChinaRef ? 0.72 : 0.85,
                                strokeWidth: isHit ? 2 : isChinaRef ? 1.5 : 1,
                              }}
                              transition={stepTransition}
                              fill={cellTone ? toneFill(cellTone) : 'var(--wisp-bg)'}
                              stroke={cellTone ? toneStroke(cellTone) : 'var(--wisp-border)'}
                            />
                          );
                        })}

                        <text
                          x={center}
                          y={319}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight={700}
                          fill={toneStroke(headTone)}
                          style={{ fontFamily: 'var(--wisp-font-mono)' }}
                        >
                          {isCollisionHead
                            ? `撞 行 ${hitSlot} (rem=${lk.remainder})`
                            : isIsolatedHead
                              ? `行 ${hitSlot} vs 中国:${chinaSlot}`
                              : `命中行 ${hitSlot} (rem=${lk.remainder})`}
                        </text>
                      </g>
                    );
                  })}
                </motion.g>

                {/* 4. 底部下层：碰撞对比盒 -> 宽走廊 Gather 箭头 -> 门控条（Step 4 浮现，零文字遮挡） */}
                <motion.g
                  initial={false}
                  animate={{
                    opacity: stepIdx < 3 ? 0.12 : 1,
                    y: stepIdx < 3 ? 6 : 0,
                  }}
                  transition={stepTransition}
                >
                  <rect
                    x={16}
                    y={344}
                    width={282}
                    height={72}
                    rx={RADIUS}
                    fill={
                      scenario === 'new_chief' && isGate
                        ? toneFill('highlight')
                        : 'var(--wisp-surface)'
                    }
                    stroke={
                      scenario === 'new_chief' && isGate
                        ? toneStroke('highlight')
                        : 'var(--wisp-border)'
                    }
                    strokeWidth={isGate ? 1.5 : 1}
                  />
                  <text x={28} y={364} fontSize={10.5} fontWeight={700} fill="var(--wisp-fg)">
                    {scenario === 'china'
                      ? '多头四槽 Gather（无碰撞基准）'
                      : scenario === 'new_chief'
                        ? '碰撞隔离：头 3 撞 24，头 2 错开'
                        : '语境切换：3-gram 落点分离'}
                  </text>
                  <text
                    x={28}
                    y={384}
                    fontSize={10}
                    fill="var(--wisp-muted)"
                    style={{ fontFamily: 'var(--wisp-font-mono)' }}
                  >
                    {`命中槽位: [${spec.slots.join(', ')}]`}
                  </text>
                  <text x={28} y={403} fontSize={10} fill="var(--wisp-fg)">
                    {spec.collisionSummary}
                  </text>

                  <DataFlowArrow
                    points={[
                      [298, 380],
                      [376, 380],
                    ]}
                    tone={spec.gateTone === 'slate' ? 'active' : spec.gateTone}
                    active={isGate}
                    visible={stepIdx >= 3}
                    flow={isGate}
                    draw={stepIdx >= 3}
                    dotToken={dotToken}
                    label="Gather"
                    labelPos={[337, 366]}
                  />

                  <rect
                    x={376}
                    y={344}
                    width={288}
                    height={72}
                    rx={RADIUS}
                    fill="var(--wisp-surface)"
                    stroke={
                      isGate
                        ? toneStroke(spec.gateTone === 'slate' ? 'active' : spec.gateTone)
                        : 'var(--wisp-border)'
                    }
                    strokeWidth={isGate ? 1.5 : 1}
                  />
                  <SvgRichLabel
                    x={388}
                    y={362}
                    width={190}
                    height={18}
                    anchor="start"
                    fontSize={10.5}
                    fontWeight={600}
                    text={`$\\mathbf{e}_t \\in \\mathbb{R}^{4d_h} + \\mathbf{h}_t$（${spec.label}）`}
                  />
                  <SvgRichLabel
                    x={652}
                    y={362}
                    width={76}
                    height={18}
                    anchor="end"
                    fontSize={10.5}
                    fontWeight={700}
                    color={
                      spec.gateTone === 'slate' ? 'var(--wisp-muted)' : toneStroke(spec.gateTone)
                    }
                    text={`$\\alpha_t = ${spec.alpha.toFixed(2)}$`}
                  />

                  <rect
                    x={388}
                    y={376}
                    width={264}
                    height={12}
                    rx={RADIUS_SM}
                    fill="var(--wisp-bg)"
                    stroke="var(--wisp-border)"
                  />
                  <motion.rect
                    x={388}
                    y={376}
                    height={12}
                    rx={RADIUS_SM}
                    initial={false}
                    animate={{ width: isGate ? gateBarW : 0 }}
                    transition={stepTransition}
                    fill={
                      spec.gateTone === 'slate' ? 'var(--wisp-muted)' : toneStroke(spec.gateTone)
                    }
                  />

                  <text x={388} y={405} fontSize={10} fill="var(--wisp-muted)">
                    {spec.verdict}
                  </text>
                </motion.g>
              </svg>
            </div>
          </div>
        );
      }}
    </BeatExplainer>
  );
}
