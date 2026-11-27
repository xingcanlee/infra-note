import { useState } from 'react';
import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { InteractiveExplainer, LabSegmented, LabSlider, SvgRichLabel } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow } from '@/explainers/kit/MetricRow';
import { useDiagramMotion } from '@/explainers/kit/motion';
import {
  MODE_OPTIONS,
  buildSinkNsaRouteSteps,
  computeSinkNsaSnapshot,
  type SinkNsaMode,
} from './steps';
import './style.css';

export { buildSinkNsaRouteSteps };

export interface SinkNsaRouteExplainerProps {
  title?: string;
}

const TOKEN_ROLES = [
  '起始词',
  '普通词',
  '关键信息',
  '普通词',
  '普通词',
  '近邻词',
  '近邻词',
  '当前词',
] as const;

const COL_STEP = 67;
const COL_START = 128;
const COL_W = 56;
const colX = (i: number) => COL_START + i * COL_STEP;
const colCx = (i: number) => colX(i) + COL_W / 2;

export default function SinkNsaRouteExplainer({ title }: SinkNsaRouteExplainerProps) {
  const [mode, setMode] = useState<SinkNsaMode>('full_causal');
  const [z0, setZ0] = useState<number>(6.0);
  const { stepTransition } = useDiagramMotion();

  const snap = computeSinkNsaSnapshot(mode, z0);
  const isFull = mode === 'full_causal';
  const isPureSwa = mode === 'pure_swa';
  const isSinkSwa = mode === 'sink_swa';
  const isNsa = mode === 'nsa_3branch';

  const handleReset = () => {
    setMode('full_causal');
    setZ0(6.0);
  };

  const bannerTone = isPureSwa ? 'highlight' : isNsa ? 'done' : 'active';
  const bannerText = isFull
    ? '全量扫描：查询 $q_7$ 读取全部 8 个历史位置（开销随长度线性增长）'
    : isPureSwa
      ? `纯滑窗丢弃 $t_0$：局部 $[t_5..t_7]$ 权重放大 ${snap.windowAmp.toFixed(1)}× 至 100%`
      : isSinkSwa
        ? `保留 $t_0$ 稳住 Softmax（滑窗回落至 ${(snap.windowMass * 100).toFixed(1)}%），但中段 $t_2$ 仍被遮蔽`
        : 'NSA 三分支并行：全局压缩 + 精准选回中段 $[t_2, t_3]$ + 局部滑窗';

  const leftmostVisibleCx = isPureSwa ? colCx(5) : colCx(0);

  return (
    <div className="nsa-exp-root">
      <InteractiveExplainer
        title={title}
        label="全量注意力、SWA、Attention Sink 与 NSA 三分支对比"
        stageMinHeight={420}
        formula={snap.formulaTex}
        caption={snap.caption}
        onReset={handleReset}
        controls={
          <>
            <LabSegmented
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
              ariaLabel="选择注意力可见范围与稀疏分支模式"
            />
            <LabSlider
              label="Sink 打分 z0"
              min={0}
              max={6}
              step={0.5}
              value={z0}
              valueText={isPureSwa ? `${z0.toFixed(1)} (已丢弃)` : z0.toFixed(1)}
              onChange={setZ0}
            />
          </>
        }
      >
        <div className="wisp-kit-svg-frame">
          <svg
            viewBox="0 0 680 392"
            role="img"
            aria-label="8 token 序列在全量注意力、SWA、Attention Sink 与 NSA 三分支下的可见范围与权重对比图"
          >
            {/* Row 1：模式结论横幅 + 右侧当前查询 q_7 */}
            <rect
              x={14}
              y={12}
              width={504}
              height={30}
              rx={4}
              fill="var(--wisp-surface)"
              stroke={toneStroke(bannerTone)}
              strokeWidth={1.3}
            />
            <SvgRichLabel
              x={266}
              y={27}
              width={490}
              height={24}
              fontSize={10.5}
              fontWeight={600}
              color="var(--wisp-fg)"
              text={bannerText}
            />

            <rect
              x={530}
              y={12}
              width={136}
              height={30}
              rx={4}
              fill={toneFill('active')}
              stroke={toneStroke('active')}
              strokeWidth={1.3}
            />
            <SvgRichLabel
              x={598}
              y={27}
              width={126}
              height={22}
              fontSize={10.5}
              fontWeight={700}
              color="var(--wisp-fg)"
              text={'当前查询 $q_7$'}
            />

            {/* Row 2：可见路径 / NSA 三分支路由轨道 (y=50..136) */}
            <rect
              x={14}
              y={50}
              width={652}
              height={86}
              rx={4}
              fill="var(--wisp-surface)"
              stroke={isNsa ? toneStroke('done') : 'var(--wisp-border)'}
              strokeWidth={isNsa ? 1.3 : 1}
            />

            {!isNsa ? (
              <g>
                {/* 左侧轨道标签 */}
                <text
                  x={66}
                  y={84}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--wisp-fg)"
                >
                  可见通路
                </text>
                <text x={66} y={101} textAnchor="middle" fontSize={9.5} fill="var(--wisp-muted)">
                  {isFull ? '全部 8 个位置' : isPureSwa ? '仅滑窗 3 个位置' : 'L 型: t_0 + 滑窗'}
                </text>

                {/* 从 q_7 连接到可见分布总线 */}
                <line
                  x1={colCx(7)}
                  y1={42}
                  x2={colCx(7)}
                  y2={66}
                  stroke={toneStroke('active')}
                  strokeWidth={1.6}
                />
                <motion.line
                  y1={66}
                  y2={66}
                  x2={colCx(7)}
                  initial={false}
                  animate={{ x1: leftmostVisibleCx }}
                  transition={stepTransition}
                  stroke={isPureSwa ? toneStroke('highlight') : toneStroke('active')}
                  strokeWidth={1.6}
                />

                {/* 每个可见位置从总线向下连接到底下 token 卡片 */}
                {snap.mask.map((visible, i) => (
                  <DataFlowArrow
                    key={`vis-${i}`}
                    points={[
                      [colCx(i), 66],
                      [colCx(i), 140],
                    ]}
                    active={visible}
                    visible={visible}
                    flow={visible}
                    tone={isPureSwa ? 'highlight' : 'active'}
                  />
                ))}

                {/* 纯滑窗 / L 型掩码遮蔽范围提示牌 */}
                {isPureSwa && (
                  <g>
                    <rect
                      x={132}
                      y={82}
                      width={316}
                      height={26}
                      rx={4}
                      fill={toneFill('highlight')}
                      stroke={toneStroke('highlight')}
                      strokeWidth={1.1}
                      strokeDasharray="4 3"
                    />
                    <SvgRichLabel
                      x={290}
                      y={95}
                      width={304}
                      height={22}
                      fontSize={10}
                      fontWeight={600}
                      color={toneStroke('highlight')}
                      text={'超出滑窗已移出 KV 缓存（$t_0$ 丢失）'}
                    />
                  </g>
                )}

                {isSinkSwa && (
                  <g>
                    <rect
                      x={199}
                      y={82}
                      width={249}
                      height={26}
                      rx={4}
                      fill="var(--wisp-bg)"
                      stroke="var(--wisp-border)"
                      strokeWidth={1.1}
                      strokeDasharray="4 3"
                    />
                    <SvgRichLabel
                      x={323.5}
                      y={95}
                      width={238}
                      height={22}
                      fontSize={10}
                      fontWeight={600}
                      color="var(--wisp-muted)"
                      text={'中段位置被静态掩码遮蔽（读不到 $t_2$）'}
                    />
                  </g>
                )}
              </g>
            ) : (
              <g>
                {/* NSA 分支 1：块压缩 cmp (0.25) */}
                <SvgRichLabel
                  x={22}
                  y={67}
                  width={102}
                  height={20}
                  anchor="start"
                  fontSize={10}
                  fontWeight={700}
                  color={toneStroke('active')}
                  text={'1. 压缩 $\\text{cmp}$ 0.25'}
                />
                {[0, 1, 2, 3].map((blk) => {
                  const bx = colX(blk * 2);
                  const bw = COL_STEP + COL_W;
                  return (
                    <g key={`cmp-${blk}`}>
                      <rect
                        x={bx}
                        y={56}
                        width={bw}
                        height={22}
                        rx={4}
                        fill={toneFill('active')}
                        stroke={toneStroke('active')}
                        strokeWidth={1.1}
                      />
                      <SvgRichLabel
                        x={bx + bw / 2}
                        y={67}
                        width={bw - 8}
                        height={18}
                        fontSize={9.5}
                        fontWeight={600}
                        color="var(--wisp-fg)"
                        text={
                          blk === 0
                            ? '块 0 $[0,1]$（含 $t_0$）'
                            : `块 ${blk} $[${blk * 2},${blk * 2 + 1}]$`
                        }
                      />
                    </g>
                  );
                })}

                {/* NSA 分支 2：块选择 slc (0.50) */}
                <SvgRichLabel
                  x={22}
                  y={94}
                  width={102}
                  height={20}
                  anchor="start"
                  fontSize={10}
                  fontWeight={700}
                  color={toneStroke('done')}
                  text={'2. 选择 $\\text{slc}$ 0.50'}
                />
                <rect
                  x={colX(2)}
                  y={83}
                  width={COL_STEP + COL_W}
                  height={22}
                  rx={4}
                  fill={toneFill('done')}
                  stroke={toneStroke('done')}
                  strokeWidth={1.4}
                />
                <SvgRichLabel
                  x={colX(2) + (COL_STEP + COL_W) / 2}
                  y={94}
                  width={COL_STEP + COL_W - 8}
                  height={18}
                  fontSize={9.5}
                  fontWeight={700}
                  color="var(--wisp-fg)"
                  text={'命中中段块 $[t_2, t_3]$'}
                />
                <DataFlowArrow
                  points={[
                    [colCx(2), 105],
                    [colCx(2), 142],
                  ]}
                  active={true}
                  flow={true}
                  tone="done"
                />

                {/* NSA 分支 3：独立滑窗 win (0.25) */}
                <SvgRichLabel
                  x={22}
                  y={121}
                  width={102}
                  height={20}
                  anchor="start"
                  fontSize={10}
                  fontWeight={700}
                  color={toneStroke('active')}
                  text={'3. 滑窗 $\\text{win}$ 0.25'}
                />
                <rect
                  x={colX(5)}
                  y={110}
                  width={COL_STEP * 2 + COL_W}
                  height={22}
                  rx={4}
                  fill={toneFill('active')}
                  stroke={toneStroke('active')}
                  strokeWidth={1.1}
                />
                <SvgRichLabel
                  x={colX(5) + (COL_STEP * 2 + COL_W) / 2}
                  y={121}
                  width={COL_STEP * 2 + COL_W - 8}
                  height={18}
                  fontSize={9.5}
                  fontWeight={600}
                  color="var(--wisp-fg)"
                  text={'独立局部滑窗 $W=3$'}
                />
              </g>
            )}

            {/* 滑窗 [t_5..t_7] 跨 Token 与柱图的统一背景框 */}
            <rect
              x={458}
              y={140}
              width={200}
              height={186}
              rx={4}
              fill="var(--wisp-bg)"
              fillOpacity={0.35}
              stroke={isPureSwa ? toneStroke('highlight') : 'var(--wisp-border)'}
              strokeWidth={isPureSwa ? 1.4 : 1}
              strokeDasharray="4 3"
            />
            <text
              x={558}
              y={214}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              fill={isPureSwa ? toneStroke('highlight') : 'var(--wisp-muted)'}
            >
              {isPureSwa ? `局部滑窗合计 100%（${snap.windowAmp.toFixed(1)}×）` : '局部滑窗 W = 3'}
            </text>

            {/* Row 3：8-token 历史序列行 (y=144..194) */}
            <text
              x={66}
              y={166}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="var(--wisp-fg)"
            >
              历史序列
            </text>
            <text x={66} y={182} textAnchor="middle" fontSize={9.5} fill="var(--wisp-muted)">
              8 个 token
            </text>

            {snap.weights.map((_, idx) => {
              const x = colX(idx);
              const isMasked = !snap.mask[idx];
              const isSink = idx === 0;
              const isMidFact = idx === 2;
              const isWin = idx >= 5;

              const cardTone = isMasked
                ? 'neutral'
                : isNsa && isMidFact
                  ? 'done'
                  : isPureSwa && isWin
                    ? 'highlight'
                    : isSink || isWin
                      ? 'active'
                      : 'neutral';

              return (
                <motion.g
                  key={`seq-tok-${idx}`}
                  initial={false}
                  animate={{ opacity: isMasked ? 0.42 : 1 }}
                  transition={stepTransition}
                >
                  <rect
                    x={x}
                    y={144}
                    width={COL_W}
                    height={50}
                    rx={4}
                    fill={cardTone === 'neutral' ? 'var(--wisp-surface)' : toneFill(cardTone)}
                    stroke={cardTone === 'neutral' ? 'var(--wisp-border)' : toneStroke(cardTone)}
                    strokeWidth={isMasked ? 1 : 1.3}
                    strokeDasharray={isMasked ? '3 2' : undefined}
                  />
                  <SvgRichLabel
                    x={colCx(idx)}
                    y={160}
                    width={48}
                    height={18}
                    fontSize={11}
                    fontWeight={700}
                    color="var(--wisp-fg)"
                    text={`$t_${idx}$`}
                  />
                  <text
                    x={colCx(idx)}
                    y={182}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={isMidFact || isSink ? 600 : 400}
                    fill={
                      isMasked
                        ? isPureSwa && isSink
                          ? toneStroke('highlight')
                          : 'var(--wisp-muted)'
                        : isMidFact && isNsa
                          ? toneStroke('done')
                          : 'var(--wisp-muted)'
                    }
                  >
                    {isMasked ? (isPureSwa && isSink ? '已丢弃' : '已遮蔽') : TOKEN_ROLES[idx]}
                  </text>
                </motion.g>
              );
            })}

            {/* Row 4：与上方 token 一一竖直对齐的 Softmax 权重柱图 (y=202..324) */}
            <text
              x={66}
              y={254}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="var(--wisp-fg)"
            >
              注意力权重
            </text>
            <text x={66} y={270} textAnchor="middle" fontSize={9.5} fill="var(--wisp-muted)">
              Softmax 分配
            </text>
            <text x={114} y={310} textAnchor="end" fontSize={9.5} fill="var(--wisp-muted)">
              0%
            </text>
            <line x1={124} y1={308} x2={656} y2={308} stroke="var(--wisp-border)" strokeWidth={1} />

            {snap.weights.map((prob, idx) => {
              const bx = colX(idx) + 10;
              const bw = 36;
              const maxH = 78;
              const baseY = 308;
              const isMasked = !snap.mask[idx];
              const bh = isMasked ? 0 : Math.max(3, Math.round(prob * maxH));
              const by = baseY - bh;

              const isSink = idx === 0;
              const isMidFact = idx === 2;
              const isWin = idx >= 5;

              const tone = isMasked
                ? 'neutral'
                : isSink
                  ? 'active'
                  : isMidFact && (isNsa || prob > 0.05)
                    ? 'done'
                    : isWin
                      ? isPureSwa
                        ? 'highlight'
                        : 'active'
                      : 'neutral';

              const fill = tone === 'neutral' ? 'var(--wisp-bg)' : toneFill(tone);
              const stroke = tone === 'neutral' ? 'var(--wisp-border)' : toneStroke(tone);

              return (
                <g key={`bar-${idx}`}>
                  {/* 柱图底槽 */}
                  <rect
                    x={bx}
                    y={baseY - maxH}
                    width={bw}
                    height={maxH}
                    rx={3}
                    fill="var(--wisp-bg)"
                    fillOpacity={0.35}
                  />

                  {/* 概率柱体 */}
                  <motion.rect
                    x={bx}
                    width={bw}
                    rx={3}
                    initial={false}
                    animate={{
                      y: isMasked ? baseY - 4 : by,
                      height: isMasked ? 4 : bh,
                      opacity: isMasked ? 0.35 : 1,
                    }}
                    transition={stepTransition}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isMasked ? 1 : 1.4}
                    strokeDasharray={isMasked ? '3 2' : undefined}
                  />

                  <text
                    x={colCx(idx)}
                    y={isMasked ? baseY - 10 : by - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill={isMasked ? 'var(--wisp-muted)' : 'var(--wisp-fg)'}
                  >
                    {isMasked ? '0%' : `${(prob * 100).toFixed(prob >= 0.1 ? 0 : 1)}%`}
                  </text>
                </g>
              );
            })}

            {/* Row 5：底部关键数值指标栏 */}
            <MetricRow
              x={14}
              y={336}
              w={652}
              h={44}
              gap={10}
              metrics={[
                {
                  label: '起始位 $t_0$',
                  value: isPureSwa ? '0.00% (丢弃)' : `${(snap.sinkMass * 100).toFixed(2)}%`,
                  tone: isPureSwa ? 'highlight' : 'active',
                },
                {
                  label: '中段关键位 $t_2$',
                  value: `${(snap.midMass * 100).toFixed(2)}%`,
                  tone: isNsa ? 'done' : 'neutral',
                  active: isNsa,
                },
                {
                  label: '局部滑窗 $[t_5..t_7]$',
                  value: `${(snap.windowMass * 100).toFixed(2)}%`,
                  tone: isPureSwa ? 'highlight' : 'active',
                },
                {
                  label: '滑窗放大倍数',
                  value: isNsa ? '三分支门控' : `${snap.windowAmp.toFixed(1)}×`,
                  tone: isPureSwa && snap.windowAmp > 5 ? 'highlight' : 'done',
                  active: isPureSwa,
                },
              ]}
            />
          </svg>
        </div>
      </InteractiveExplainer>
    </div>
  );
}
