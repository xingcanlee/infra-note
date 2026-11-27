import { useMemo, useState } from 'react';
import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  ActiveFocusFrame,
  InteractiveExplainer,
  LabSegmented,
  LabSlider,
  MORPH_SPRING,
  RADIUS,
  RADIUS_SM,
  SvgRichLabel,
  useDiagramMotion,
} from '@/explainers/kit';
import {
  CONV_TOKENS,
  KERNEL_SIZE,
  MAX_LEFT_PAD,
  WEIGHTS,
  buildShortConvSteps,
  computeDilatedConvAt,
  type ConvTap,
  type DilationRate,
} from './steps';
import './style.css';

export { buildShortConvSteps };

export interface ShortConvExplainerProps {
  title?: string;
}

const PAD_X = 21;
const CELL_W = 29;

function cellLeft(col: number): number {
  return PAD_X + col * CELL_W;
}

function cellCenter(col: number): number {
  return PAD_X + col * CELL_W + CELL_W / 2;
}

function formatDotTex(taps: readonly ConvTap[]): string {
  return taps
    .map((t, idx) => {
      const absW = Math.abs(t.weight);
      const term = `${absW}\\times ${t.xVal}`;
      if (idx === 0) return t.weight < 0 ? `-${term}` : term;
      return t.weight < 0 ? ` - ${term}` : ` + ${term}`;
    })
    .join('');
}

export default function ShortConvExplainer({ title }: ShortConvExplainerProps) {
  const [pos, setPos] = useState<number>(9);
  const [dilation, setDilation] = useState<DilationRate>(4);
  const { stepTransition } = useDiagramMotion();

  const res = useMemo(() => computeDilatedConvAt(pos, dilation), [pos, dilation]);
  const allResults = useMemo(
    () => CONV_TOKENS.map((tok) => computeDilatedConvAt(tok.pos, dilation)),
    [dilation],
  );

  const activePadCount = (KERNEL_SIZE - 1) * dilation;
  const tapMap = new Map(res.taps.map((t) => [t.srcPos, t]));
  const outCenterX = cellCenter(pos + MAX_LEFT_PAD);
  const leftMostTapCol = pos - (KERNEL_SIZE - 1) * dilation + MAX_LEFT_PAD;
  const rightMostTapCol = pos + MAX_LEFT_PAD;
  const spineX1 = cellCenter(leftMostTapCol);
  const spineX2 = cellCenter(rightMostTapCol);
  const rfX = cellLeft(leftMostTapCol) - 2;
  const rfW = (rightMostTapCol - leftMostTapCol + 1) * CELL_W + 4;
  const padHitCount = res.taps.filter((t) => t.isPad).length;
  const spanWidth = (KERNEL_SIZE - 1) * dilation + 1;

  const formulaTex = `$y_{${pos}} = \\sum_{i=0}^{3} w_i\\,u_{${pos}-${dilation}i} = ${res.y.toFixed(2)}$`;
  const captionText =
    `当前位置 $t=${pos}$（“${res.tokenText}”，$u_${pos}=${res.xAtPos}$），空洞率 $d=${dilation}$ 对应左补零 ${activePadCount} 格、感受野跨度 ${spanWidth} 格；` +
    `本次四根抽头中有 ${padHitCount} 根落入补零区，算得 $y_${pos} = ${res.y.toFixed(2)}$，经 SiLU 加回残差得 ${res.out.toFixed(2)}。`;

  return (
    <InteractiveExplainer
      title={title}
      label="ShortConv 一维因果空洞卷积微实验"
      stageMinHeight={316}
      formula={formulaTex}
      caption={captionText}
      onReset={() => {
        setPos(9);
        setDilation(4);
      }}
      controls={
        <>
          <LabSlider
            label="位置 t"
            min={0}
            max={9}
            step={1}
            value={pos}
            valueText={`t=${pos} (${res.tokenText})`}
            onChange={setPos}
          />
          <LabSegmented
            ariaLabel="切换空洞率"
            options={[
              { id: '1', label: '标准 d=1' },
              { id: '4', label: '空洞 d=4' },
            ]}
            value={String(dilation)}
            onChange={(next) => setDilation(Number(next) as DilationRate)}
          />
        </>
      }
    >
      <div className="wisp-kit-svg-frame">
        <svg
          className="sc-scan-svg"
          viewBox="0 0 680 282"
          role="img"
          aria-label="一维因果空洞卷积感受野与加权弧线交互图"
        >
          {/* 区域导引标签 */}
          <SvgRichLabel
            x={PAD_X + 2}
            y={46}
            width={240}
            height={16}
            fontSize={10}
            anchor="start"
            color="var(--wisp-muted)"
            text={`因果左补零区（当前启用 ${activePadCount} 格）`}
          />
          <SvgRichLabel
            x={cellLeft(MAX_LEFT_PAD) + 2}
            y={46}
            width={300}
            height={16}
            fontSize={10}
            anchor="start"
            color="var(--wisp-muted)"
            text={'10 词序列 $t = 0 \\dots 9$'}
          />

          {/* 顶部 4 齿卷积核连杆与权重块（随 t 和 d 平滑平移与拉伸） */}
          <motion.line
            y1={19}
            y2={19}
            stroke={toneStroke('done')}
            strokeWidth={2}
            strokeLinecap="round"
            initial={false}
            animate={{ x1: spineX1, x2: spineX2 }}
            transition={MORPH_SPRING}
          />

          {([3, 2, 1, 0] as const).map((tapIdx) => {
            const srcPos = pos - tapIdx * dilation;
            const tapCenterX = cellCenter(srcPos + MAX_LEFT_PAD);
            const isCur = tapIdx === 0;
            const isPad = srcPos < 0;
            const stroke = isPad
              ? 'var(--wisp-muted)'
              : isCur
                ? toneStroke('active')
                : toneStroke('done');
            const fill = isPad
              ? 'var(--wisp-surface)'
              : isCur
                ? toneFill('active')
                : toneFill('done');

            return (
              <motion.g
                key={`tooth-${tapIdx}`}
                initial={false}
                animate={{ x: tapCenterX }}
                transition={MORPH_SPRING}
              >
                <line
                  x1={0}
                  y1={32}
                  x2={0}
                  y2={80}
                  stroke={stroke}
                  strokeWidth={isPad ? 1.35 : 1.75}
                  strokeDasharray={isPad ? '3 2' : undefined}
                />
                <rect
                  x={-14}
                  y={5}
                  width={28}
                  height={27}
                  rx={RADIUS}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isCur ? 1.75 : 1.25}
                />
                <SvgRichLabel
                  x={0}
                  y={14}
                  width={26}
                  height={14}
                  fontSize={9.5}
                  fontWeight={700}
                  text={`$w_${tapIdx}$`}
                />
                <text
                  x={0}
                  y={27}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill="var(--wisp-muted)"
                >
                  {WEIGHTS[tapIdx]}
                </text>
              </motion.g>
            );
          })}

          {/* 左侧 12 格因果补零槽（-12..-1），仅激活当前 d 所需的 (k-1)d 格 */}
          {Array.from({ length: MAX_LEFT_PAD }, (_, i) => {
            const srcPos = i - MAX_LEFT_PAD;
            const x = cellLeft(i);
            const padActive = srcPos >= -activePadCount;
            const hitTap = tapMap.get(srcPos);
            const fill = hitTap
              ? toneFill('highlight')
              : padActive
                ? 'var(--wisp-surface)'
                : 'var(--wisp-bg)';
            const stroke = hitTap ? toneStroke('highlight') : 'var(--wisp-border)';

            return (
              <motion.g
                key={`pad-${srcPos}`}
                initial={false}
                animate={{ opacity: padActive ? 1 : 0.16 }}
                transition={stepTransition}
              >
                <rect
                  x={x + 1}
                  y={84}
                  width={CELL_W - 2}
                  height={56}
                  rx={RADIUS_SM}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={hitTap ? 1.6 : 1}
                  strokeDasharray={hitTap ? undefined : '3 2'}
                />
                <text
                  x={x + CELL_W / 2}
                  y={98}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--wisp-muted)"
                >
                  {srcPos}
                </text>
                <text
                  x={x + CELL_W / 2}
                  y={116}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill="var(--wisp-muted)"
                >
                  pad
                </text>
                <text
                  x={x + CELL_W / 2}
                  y={132}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--wisp-fg)"
                >
                  0
                </text>
              </motion.g>
            );
          })}

          {/* 右侧 10 个实词槽 t=0..9 */}
          {CONV_TOKENS.map((tok) => {
            const col = tok.pos + MAX_LEFT_PAD;
            const x = cellLeft(col);
            const hitTap = tapMap.get(tok.pos);
            const isCurrent = tok.pos === pos;
            const tone = isCurrent ? 'active' : hitTap ? 'done' : null;
            const fill = tone ? toneFill(tone) : 'var(--wisp-surface)';
            const stroke = tone ? toneStroke(tone) : 'var(--wisp-border)';

            return (
              <g key={`in-${tok.pos}`}>
                <rect
                  x={x + 1}
                  y={84}
                  width={CELL_W - 2}
                  height={56}
                  rx={RADIUS_SM}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isCurrent ? 2 : hitTap ? 1.5 : 1}
                />
                <text
                  x={x + CELL_W / 2}
                  y={98}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--wisp-muted)"
                >
                  {tok.pos}
                </text>
                <text
                  x={x + CELL_W / 2}
                  y={116}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={600}
                  fill="var(--wisp-fg)"
                >
                  {tok.text}
                </text>
                <text
                  x={x + CELL_W / 2}
                  y={132}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--wisp-fg)"
                >
                  {tok.xVal}
                </text>
              </g>
            );
          })}

          {/* 感受野高亮框：随 t 与 d 平滑平移与拉伸 */}
          <ActiveFocusFrame
            x={rfX}
            y={81}
            w={rfW}
            h={62}
            tone={dilation === 4 ? 'done' : 'active'}
            label={`感受野 ${spanWidth} 格 (d=${dilation})`}
            visible={true}
          />

          {/* 加权汇聚弧线：从 4 个抽头平滑弯曲连到 Σ 与当前输出格 */}
          {res.taps.map((tap) => {
            const sx = cellCenter(tap.srcPos + MAX_LEFT_PAD);
            const stroke = tap.isPad
              ? 'var(--wisp-muted)'
              : tap.tapIdx === 0
                ? toneStroke('active')
                : toneStroke('done');
            const wireD = `M ${sx.toFixed(1)} 142 C ${sx.toFixed(1)} 170, ${outCenterX.toFixed(1)} 160, ${outCenterX.toFixed(1)} 194`;

            return (
              <motion.path
                key={`arc-${tap.tapIdx}`}
                initial={false}
                animate={{ d: wireD, opacity: tap.isPad ? 0.52 : 0.95 }}
                transition={MORPH_SPRING}
                fill="none"
                stroke={stroke}
                strokeWidth={tap.isPad ? 1.3 : 1.8}
                strokeDasharray={tap.isPad ? '3 2' : undefined}
                strokeLinecap="round"
              />
            );
          })}

          <motion.g initial={false} animate={{ x: outCenterX }} transition={MORPH_SPRING}>
            <circle
              cx={0}
              cy={184}
              r={9}
              fill={toneFill('done')}
              stroke={toneStroke('done')}
              strokeWidth={1.5}
            />
            <SvgRichLabel
              x={0}
              y={184}
              width={18}
              height={18}
              fontSize={10.5}
              fontWeight={700}
              text={'$\\Sigma$'}
            />
            <line x1={0} y1={193} x2={0} y2={208} stroke={toneStroke('done')} strokeWidth={1.75} />
          </motion.g>

          {/* 左下实时手算卡片 */}
          <rect
            x={PAD_X + 1}
            y={166}
            width={326}
            height={102}
            rx={RADIUS}
            fill="var(--wisp-surface)"
            stroke="var(--wisp-border)"
          />
          <SvgRichLabel
            x={PAD_X + 12}
            y={183}
            width={304}
            height={20}
            fontSize={11}
            fontWeight={700}
            anchor="start"
            text={`当前落位 $t=${pos}$（“${res.tokenText}”，$u_${pos}=${res.xAtPos}$） · 空洞 $d=${dilation}$`}
          />
          <SvgRichLabel
            x={PAD_X + 12}
            y={204}
            width={304}
            height={18}
            fontSize={10}
            anchor="start"
            color="var(--wisp-muted)"
            text={`抽头下标 $[${res.taps
              .slice()
              .reverse()
              .map((t) => t.srcPos)
              .join(',\\;')}] $（补零 ${padHitCount} 根）`}
          />
          <SvgRichLabel
            x={PAD_X + 12}
            y={227}
            width={304}
            height={20}
            fontSize={10.5}
            fontWeight={600}
            anchor="start"
            text={`$y_${pos} = ${formatDotTex(res.taps)}$`}
          />
          <SvgRichLabel
            x={PAD_X + 12}
            y={251}
            width={304}
            height={20}
            fontSize={11}
            fontWeight={700}
            anchor="start"
            color={toneStroke('done')}
            text={`$y_${pos} = ${res.y.toFixed(2)},\\quad u_${pos}+\\operatorname{SiLU}(y_${pos}) = ${res.out.toFixed(2)}$`}
          />

          {/* 右下 10 格输出轨道 y_0..y_9 */}
          {CONV_TOKENS.map((tok) => {
            const col = tok.pos + MAX_LEFT_PAD;
            const x = cellLeft(col);
            const item = allResults[tok.pos];
            const isCurrent = tok.pos === pos;
            const isDone = tok.pos < pos;
            const fill = isCurrent
              ? toneFill('active')
              : isDone
                ? toneFill('done')
                : 'var(--wisp-bg)';
            const stroke = isCurrent
              ? toneStroke('active')
              : isDone
                ? toneStroke('done')
                : 'var(--wisp-border)';

            return (
              <g key={`out-${tok.pos}`}>
                <rect
                  x={x + 1}
                  y={210}
                  width={CELL_W - 2}
                  height={56}
                  rx={RADIUS_SM}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isCurrent ? 2 : 1}
                />
                <SvgRichLabel
                  x={x + CELL_W / 2}
                  y={225}
                  width={26}
                  height={16}
                  fontSize={10}
                  color="var(--wisp-muted)"
                  text={`$y_${tok.pos}$`}
                />
                <text
                  x={x + CELL_W / 2}
                  y={250}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={isCurrent || isDone ? 700 : 500}
                  fill={isCurrent || isDone ? 'var(--wisp-fg)' : 'var(--wisp-muted)'}
                >
                  {item.y.toFixed(2)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </InteractiveExplainer>
  );
}
