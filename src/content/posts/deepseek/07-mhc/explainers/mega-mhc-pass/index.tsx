import { useMemo } from 'react';
import { RichText, toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  BeatExplainer,
  MetricRow,
  RADIUS,
  RADIUS_SM,
  SwimlaneTimeline,
  useDiagramMotion,
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit';
import { buildMegaMhcPassSteps, type MegaMhcStepState } from './steps';
import './style.css';

export { buildMegaMhcPassSteps };

export interface MegaMhcPassExplainerProps {
  title?: string;
}

function buildTimelineData(state: MegaMhcStepState): {
  lanes: TimelineLane[];
  syncEvents: TimelineSyncEvent[];
} {
  const p = state.phase;
  const isSplit = p === 'split_4';
  const isTwo = p === 'two_pass';
  const isShift = p === 'shift_dep';
  const isSingle = p === 'single_pass';
  const merged = isShift || isSingle;

  const lanes: TimelineLane[] = [
    {
      id: 'hbm-read',
      title: 'HBM 读入',
      subtitle: `${state.readD}d / 层`,
      blocks: [
        {
          label: '读 y+X (5d)',
          start: 0,
          dur: 5,
          tone: merged ? 'done' : 'active',
          active: true,
          visible: true,
        },
        {
          label: '重读 X (4d)',
          start: isSplit ? 9 : 10,
          dur: 4,
          tone: 'highlight',
          active: isTwo,
          visible: isSplit || isTwo,
        },
        {
          label: '再读 X (4d)',
          start: 13,
          dur: 4,
          tone: 'active',
          visible: isSplit,
        },
        {
          label: '读 1d',
          start: 17,
          dur: 1,
          tone: 'neutral',
          visible: isSplit,
        },
      ],
    },
    {
      id: 'compute',
      title: '片上执行流',
      subtitle: `${state.hbmTrips} 趟 Kernel`,
      blocks: [
        {
          label: 'Post+Res',
          start: 0,
          dur: isSplit ? 5 : isTwo ? 7 : 10,
          tone: merged ? 'done' : 'active',
          active: true,
          visible: true,
        },
        {
          label: '系数 / 栅栏',
          start: isSplit ? 9 : isTwo ? 7 : 5,
          dur: isSplit ? 4 : 3,
          tone: 'highlight',
          kind: isTwo ? 'bubble' : 'op',
          active: isTwo,
          visible: isSplit || isTwo,
        },
        {
          label: 'Pre+Norm',
          start: isSplit ? 13 : isTwo ? 10 : 5,
          dur: isSplit ? 7 : 5,
          tone: isTwo ? 'highlight' : 'active',
          active: isTwo,
          visible: isSplit || isTwo,
        },
      ],
    },
    {
      id: 'hbm-write',
      title: 'HBM 写出',
      subtitle: `${state.writeD}d / 层`,
      blocks: [
        {
          label: '写 X_{l+1} (4d)',
          start: isTwo ? 6 : 5,
          dur: 4,
          tone: merged ? 'done' : 'active',
          active: merged,
          visible: true,
        },
        {
          label: '写 h_in (1d)',
          start: 16,
          dur: 1,
          tone: 'active',
          visible: isSplit,
        },
        {
          label: '写 Norm (1d)',
          start: isSplit ? 19 : isTwo ? 14 : 9,
          dur: 1,
          tone: merged ? 'done' : isTwo ? 'highlight' : 'neutral',
          active: merged,
          visible: true,
        },
      ],
    },
  ];

  const syncEvents: TimelineSyncEvent[] = [
    {
      fromLane: 1,
      at: 8.5,
      toLane: 0,
      toAt: 10.5,
      label: '等 r_{l+1} 迫使重读 4d',
      tone: 'highlight',
      active: isTwo,
      dashed: true,
      visible: isTwo,
    },
    {
      fromLane: 1,
      at: 5.0,
      toLane: 2,
      toAt: 9.0,
      label: '复用 A_{l-1} · 写出 A_l',
      tone: 'done',
      active: isShift,
      visible: isShift,
    },
  ];

  return { lanes, syncEvents };
}

export default function MegaMhcPassExplainer({ title }: MegaMhcPassExplainerProps) {
  const steps = useMemo(() => buildMegaMhcPassSteps(), []);
  const { stepTransition } = useDiagramMotion();

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label="mHC 单子层 HBM 访存融合演进"
      stageMinHeight={380}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step) => {
        const s = step.state;
        const { lanes, syncEvents } = buildTimelineData(s);

        const barX = 14;
        const barY = 258;
        const barW = 652;
        const barH = 30;
        const readW = (s.readD / 20) * barW;
        const writeW = (s.writeD / 20) * barW;
        const savedD = 20 - s.totalD;
        const savedW = (savedD / 20) * barW;
        const merged = s.totalD === 10;

        return (
          <div className="mega-stage">
            <div className="wisp-kit-svg-frame">
              <svg
                className="mega-svg"
                viewBox="0 0 680 374"
                role="img"
                aria-label="mHC 单子层 HBM 读写泳道与访存下界对比"
              >
                <SwimlaneTimeline
                  x={14}
                  y={10}
                  w={652}
                  totalTime={20}
                  unit="d"
                  ticks={[0, 5, 10, 14, 20]}
                  lanes={lanes}
                  syncEvents={syncEvents}
                  laneH={34}
                  laneGap={22}
                  gutterW={106}
                  title="单子层 HBM 读写泳道（按访存字节比例对齐，基准 = 20d）"
                />

                {/* 动画 HBM 读写/节省比例条 */}
                <text x={barX} y={barY - 9} fontSize={11} fontWeight={600} fill="var(--wisp-fg)">
                  单子层 HBM 访存结构对照（满槽 20d）
                </text>
                <text
                  x={barX + barW}
                  y={barY - 9}
                  textAnchor="end"
                  fontSize={10.5}
                  fontWeight={600}
                  fill="var(--wisp-muted)"
                >
                  {`读 ${s.readD}d + 写 ${s.writeD}d = ${s.totalD}d（${s.hbmTrips} 趟 Kernel）`}
                </text>

                <rect
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  rx={RADIUS}
                  fill="var(--wisp-surface)"
                  stroke="var(--wisp-border)"
                />

                {/* 读段 */}
                <motion.rect
                  x={barX + 1}
                  y={barY + 1}
                  height={barH - 2}
                  rx={RADIUS_SM}
                  initial={false}
                  animate={{ width: Math.max(0, readW - 2) }}
                  transition={stepTransition}
                  fill={merged ? toneFill('done') : toneFill('active')}
                  stroke={merged ? toneStroke('done') : toneStroke('active')}
                  strokeWidth={1.35}
                />
                <motion.text
                  y={barY + barH / 2 + 4}
                  initial={false}
                  animate={{ x: barX + readW / 2 }}
                  transition={stepTransition}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={700}
                  fill="var(--wisp-fg)"
                >
                  {`HBM 读 ${s.readD}d`}
                </motion.text>

                {/* 写段 */}
                <motion.rect
                  y={barY + 1}
                  height={barH - 2}
                  rx={RADIUS_SM}
                  initial={false}
                  animate={{ x: barX + readW + 1, width: Math.max(0, writeW - 2) }}
                  transition={stepTransition}
                  fill={s.phase === 'two_pass' ? toneFill('highlight') : toneFill('active')}
                  stroke={s.phase === 'two_pass' ? toneStroke('highlight') : toneStroke('active')}
                  strokeWidth={1.35}
                />
                <motion.text
                  y={barY + barH / 2 + 4}
                  initial={false}
                  animate={{ x: barX + readW + writeW / 2 }}
                  transition={stepTransition}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={700}
                  fill="var(--wisp-fg)"
                >
                  {`HBM 写 ${s.writeD}d`}
                </motion.text>

                {/* 省下段 */}
                <motion.g
                  initial={false}
                  animate={{ opacity: savedD > 0 ? 1 : 0 }}
                  transition={stepTransition}
                >
                  <motion.rect
                    y={barY + 1}
                    height={barH - 2}
                    rx={RADIUS_SM}
                    initial={false}
                    animate={{
                      x: barX + readW + writeW + 1,
                      width: Math.max(0, savedW - 2),
                    }}
                    transition={stepTransition}
                    fill="var(--wisp-bg)"
                    stroke={toneStroke('done')}
                    strokeDasharray="4 3"
                  />
                  <motion.text
                    y={barY + barH / 2 + 4}
                    initial={false}
                    animate={{ x: barX + readW + writeW + savedW / 2 }}
                    transition={stepTransition}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={700}
                    fill={toneStroke('done')}
                  >
                    {savedD > 0 ? `省下 ${savedD}d (-${Math.round((savedD / 20) * 100)}%)` : ''}
                  </motion.text>
                </motion.g>

                <MetricRow
                  x={14}
                  y={310}
                  w={652}
                  h={48}
                  gap={10}
                  metrics={[
                    {
                      label: 'Kernel 发射趟次',
                      value: `${s.hbmTrips} 趟`,
                      tone: merged ? 'done' : s.phase === 'two_pass' ? 'highlight' : 'active',
                      active: true,
                    },
                    {
                      label: '单子层 HBM 访存',
                      value: `${s.totalD}d`,
                      tone: merged ? 'done' : s.phase === 'two_pass' ? 'highlight' : 'active',
                      active: true,
                    },
                    {
                      label: '相对四算子基线',
                      value: savedD > 0 ? `-${Math.round((savedD / 20) * 100)}%` : '基线 100%',
                      tone: merged ? 'done' : 'neutral',
                      active: merged,
                    },
                  ]}
                />
              </svg>
            </div>

            <div className="mega-note-box">
              <RichText text={s.blockerNote} />
            </div>
          </div>
        );
      }}
    </BeatExplainer>
  );
}
