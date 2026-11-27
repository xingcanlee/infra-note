import { useState } from 'react';
import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, LabSegmented, SvgRichLabel } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { useDiagramMotion } from '@/explainers/kit/motion';
import {
  GATHER_MODE_SPECS,
  HEAD0_DOT,
  HEAD1_DOT,
  INDEX_SCORES,
  RELU_HEAD0,
  RELU_HEAD1,
  buildDsaLightningIndexSteps,
  type DsaGatherMode,
  type DsaIndexState,
} from './steps';
import './style.css';

export { buildDsaLightningIndexSteps };

export interface DsaLightningIndexExplainerProps {
  title?: string;
}

const GATHER_OPTIONS = [
  { id: 'top2' as const, label: 'Top-2' },
  { id: 'top3' as const, label: 'Top-3' },
  { id: 'all' as const, label: '全量' },
] as const;

export default function DsaLightningIndexExplainer({ title }: DsaLightningIndexExplainerProps) {
  const steps = buildDsaLightningIndexSteps();
  const [gatherMode, setGatherMode] = useState<DsaGatherMode>('top3');
  const { stepTransition } = useDiagramMotion();
  const gatherSpec = GATHER_MODE_SPECS[gatherMode];

  const renderHeadPlot = (
    boxX: number,
    titleText: string,
    rawVals: readonly number[],
    reluVals: readonly number[],
    isRaw: boolean,
    dimmed: boolean,
  ) => {
    const zeroY = 104;
    const scalePos = 13.5;
    const scaleNeg = 15;
    const vals = isRaw ? rawVals : reluVals;

    return (
      <motion.g
        initial={false}
        animate={{ opacity: dimmed ? 0.48 : 1 }}
        transition={stepTransition}
      >
        <rect
          x={boxX}
          y={14}
          width={318}
          height={138}
          rx={4}
          fill="var(--wisp-surface)"
          stroke="var(--wisp-border)"
          strokeWidth={1}
        />
        <SvgRichLabel
          x={boxX + 12}
          y={28}
          anchor="start"
          fontSize={11}
          fontWeight={700}
          color="var(--wisp-fg)"
          text={titleText}
        />
        <line
          x1={boxX + 12}
          y1={zeroY}
          x2={boxX + 306}
          y2={zeroY}
          stroke="var(--wisp-border)"
          strokeWidth={1}
        />
        <text x={boxX + 306} y={zeroY - 4} textAnchor="end" fontSize={9.5} fill="var(--wisp-muted)">
          0.0
        </text>

        {vals.map((val, idx) => {
          const bx = boxX + 16 + idx * 36;
          const bw = 24;
          const rawNeg = rawVals[idx] < 0;
          const isNegNow = val < 0;
          const barH = isNegNow
            ? Math.max(4, Math.round(Math.abs(val) * scaleNeg))
            : val > 0
              ? Math.max(4, Math.round(val * scalePos))
              : 0;
          const barY = isNegNow ? zeroY : zeroY - barH;
          const tone = isNegNow ? 'highlight' : val > 0 ? 'active' : 'neutral';

          return (
            <g key={`h-${boxX}-${idx}`}>
              <motion.rect
                x={bx}
                width={bw}
                rx={3}
                initial={false}
                animate={{
                  y: barH === 0 ? zeroY - 2 : barY,
                  height: barH === 0 ? 2 : barH,
                }}
                transition={stepTransition}
                fill={tone === 'neutral' ? 'var(--wisp-bg)' : toneFill(tone)}
                stroke={tone === 'neutral' ? 'var(--wisp-border)' : toneStroke(tone)}
                strokeWidth={1.2}
                strokeDasharray={barH === 0 && rawNeg ? '3 2' : undefined}
              />
              <text
                x={bx + bw / 2}
                y={isNegNow ? barY + barH + 10 : barY - 5}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={600}
                fill={
                  isNegNow
                    ? toneStroke('highlight')
                    : val === 0
                      ? 'var(--wisp-muted)'
                      : 'var(--wisp-fg)'
                }
              >
                {val.toFixed(1)}
              </text>
              <SvgRichLabel
                x={bx + bw / 2}
                y={138}
                fontSize={10}
                color="var(--wisp-muted)"
                text={`$s_${idx}$`}
              />
            </g>
          );
        })}
      </motion.g>
    );
  };

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label="DSA 闪电索引打分与稀疏 Gather 流程"
      stageMinHeight={390}
      getFormula={(s) => s.state.formulaTex}
      replayTrigger={gatherMode}
    >
      {(step, ctx) => {
        const st: DsaIndexState = step.state;
        const isRaw = st.phase === 'raw_dot';
        const isRelu = st.phase === 'relu_zero';
        const isSum = st.phase === 'weighted_sum';
        const isGather = st.phase === 'sparse_gather';

        const activeSlots = isGather ? gatherSpec.slots : [];
        const showIndexBars = isSum || isGather;

        return (
          <div className="dsa-exp-stage-stack">
            {isGather && (
              <div className="dsa-exp-toolbar">
                <LabSegmented
                  options={GATHER_OPTIONS}
                  value={gatherMode}
                  onChange={setGatherMode}
                  ariaLabel="切换稀疏 Gather 选槽规模"
                />
                <span className="dsa-exp-mode-hint">{gatherSpec.summary}</span>
              </div>
            )}

            <div className="wisp-kit-svg-frame">
              <svg
                viewBox="0 0 680 332"
                role="img"
                aria-label="DSA 双头 ReLU 索引打分与稀疏 Gather 图"
              >
                {/* 顶部双头：Head 0 (w=1.0) 与 Head 1 (w=0.5) */}
                {renderHeadPlot(
                  14,
                  '索引头 0：$q_{7,0}^I \\cdot k_s^I$（权重 $w_0 = 1.0$）',
                  HEAD0_DOT,
                  RELU_HEAD0,
                  isRaw,
                  isGather,
                )}
                {renderHeadPlot(
                  348,
                  '索引头 1：$q_{7,1}^I \\cdot k_s^I$（权重 $w_1 = 0.5$）',
                  HEAD1_DOT,
                  RELU_HEAD1,
                  isRaw,
                  isGather,
                )}

                {/* 从双头向下流向索引总分的汇总箭头 */}
                <DataFlowArrow
                  points={[
                    [173, 152],
                    [173, 174],
                  ]}
                  active={isSum}
                  visible={showIndexBars}
                  flow={isSum}
                  dotToken={ctx.dotToken}
                  tone="active"
                  label={'$\\times 1.0$'}
                />
                <DataFlowArrow
                  points={[
                    [507, 152],
                    [507, 174],
                  ]}
                  active={isSum}
                  visible={showIndexBars}
                  flow={isSum}
                  dotToken={ctx.dotToken}
                  tone="active"
                  label={'$\\times 0.5$'}
                />

                {/* 底部：8 槽加权索引分与稀疏 Gather 管道（Step 1/2 淡出占位，Step 3/4 清晰浮现） */}
                <motion.g
                  initial={false}
                  animate={{ opacity: showIndexBars ? 1 : 0.16, y: showIndexBars ? 0 : 6 }}
                  transition={stepTransition}
                >
                  <rect
                    x={14}
                    y={174}
                    width={652}
                    height={146}
                    rx={4}
                    fill="var(--wisp-surface)"
                    stroke={isGather ? toneStroke('done') : 'var(--wisp-border)'}
                    strokeWidth={isGather ? 1.4 : 1}
                  />
                  <SvgRichLabel
                    x={26}
                    y={190}
                    anchor="start"
                    fontSize={11}
                    fontWeight={700}
                    color="var(--wisp-fg)"
                    text={
                      isGather
                        ? `Step 4 · 稀疏 Gather（${gatherSpec.label}：读 ${activeSlots.length}/8 槽位）`
                        : isSum
                          ? 'Step 3 · 双头 ReLU 加权求和索引分 $I_{7,s}$'
                          : isRelu
                            ? 'Step 2 · 负分已归零，待加权求和得 $I_{7,s}$'
                            : 'Step 1 · 原始点积计算中（$H^I=2,\\; w=[1.0, 0.5]$）'
                    }
                  />

                  {/* 8 槽汇总柱 + 向下的 Gather 数据流箭头 */}
                  {INDEX_SCORES.map((score, idx) => {
                    const sx = 32 + idx * 78;
                    const sw = 54;
                    const maxH = 54;
                    const baseY = 258;
                    const bh = showIndexBars ? Math.max(4, Math.round((score / 5.4) * maxH)) : 0;
                    const by = baseY - bh;
                    const isSelected = activeSlots.includes(idx);
                    const isSkipped = isGather && !isSelected;

                    const tone = isGather
                      ? isSelected
                        ? 'done'
                        : 'neutral'
                      : showIndexBars && score > 0
                        ? 'active'
                        : 'neutral';

                    return (
                      <g key={`sum-slot-${idx}`}>
                        <motion.g
                          initial={false}
                          animate={{ opacity: showIndexBars ? (isSkipped ? 0.3 : 1) : 0.35 }}
                          transition={stepTransition}
                        >
                          <motion.rect
                            x={sx + 11}
                            width={32}
                            rx={3}
                            initial={false}
                            animate={{ y: bh === 0 ? baseY - 2 : by, height: bh === 0 ? 2 : bh }}
                            transition={stepTransition}
                            fill={tone === 'neutral' ? 'var(--wisp-bg)' : toneFill(tone)}
                            stroke={tone === 'neutral' ? 'var(--wisp-border)' : toneStroke(tone)}
                            strokeWidth={isSelected && isGather ? 1.8 : 1.2}
                          />
                          <text
                            x={sx + sw / 2}
                            y={bh === 0 ? baseY - 8 : by - 5}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={600}
                            fill={score === 0 || isSkipped ? 'var(--wisp-muted)' : 'var(--wisp-fg)'}
                          >
                            {showIndexBars ? score.toFixed(1) : '—'}
                          </text>
                          <SvgRichLabel
                            x={sx + sw / 2}
                            y={268}
                            fontSize={10}
                            fontWeight={isSelected ? 700 : 500}
                            color={isSelected ? toneStroke('done') : 'var(--wisp-muted)'}
                            text={`$s_${idx}$`}
                          />
                        </motion.g>

                        {/* 第 4 步：仅选中的槽位激活流光 Gather 箭头 */}
                        <DataFlowArrow
                          points={[
                            [sx + sw / 2, 274],
                            [sx + sw / 2, 294],
                          ]}
                          active={isGather && isSelected}
                          muted={!isGather || !isSelected}
                          dashed={!isGather || !isSelected}
                          flow={isGather && isSelected}
                          dotToken={ctx.dotToken}
                          tone="done"
                        />
                      </g>
                    );
                  })}

                  <TensorBlock
                    x={26}
                    y={294}
                    w={628}
                    h={20}
                    tone={isGather ? 'done' : 'neutral'}
                    name={
                      isGather
                        ? `主注意力稀疏 Gather：仅拉取 ${activeSlots.map((i) => `s_${i}`).join(', ')}（${((activeSlots.length / 8) * 100).toFixed(1)}%）`
                        : '主注意力槽位汇聚区'
                    }
                    labelMode="inside"
                    dimmed={!isGather}
                  />
                </motion.g>
              </svg>
            </div>
          </div>
        );
      }}
    </BeatExplainer>
  );
}
