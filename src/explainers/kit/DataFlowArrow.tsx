import { hasInlineMath, plainInlineMath } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import SvgRichLabel from './SvgRichLabel';
import {
  RADIUS_SM,
  estimateTextWidth,
  resolveToneStroke,
  useDiagramMotion,
  type AnyTone,
} from './motion';

export type Point2D = readonly [number, number];

export interface DataFlowArrowProps {
  /** 折线顶点列表，至少 2 个点 */
  points: readonly Point2D[];
  tone?: AnyTone;
  active?: boolean;
  muted?: boolean;
  dashed?: boolean;
  /** active 时沿折线播放数据脉冲点与流光 */
  flow?: boolean;
  /** active 且 flow 时开启持续流光虚线（默认 true，reduced-motion 下自动禁用） */
  continuous?: boolean;
  /** 节拍显隐控制；缺省 true 保持向后兼容 */
  visible?: boolean;
  /** 是否在显影时按 pathLength 绘制连线 */
  draw?: boolean;
  drawDuration?: number;
  drawDelay?: number;
  /** 非 0 时在每次切步触发强调脉冲；持续流光在 flow && active 时始终生效 */
  dotToken?: number;
  arrowEnd?: boolean;
  arrowStart?: boolean;
  label?: string;
  /** 可选标签位置覆盖；缺省放在最长线段中点 */
  labelPos?: Point2D;
  strokeWidth?: number;
}

const DRAW_EASE = [0.42, 0, 0.2, 1] as const;

function polylineLength(points: readonly Point2D[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return len;
}

function arrowHeadPoints(from: Point2D, to: Point2D, size = 6.5): string {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return '';
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const bx = to[0] - ux * size;
  const by = to[1] - uy * size;
  const w = size * 0.44;
  return `${to[0]},${to[1]} ${bx + px * w},${by + py * w} ${bx - px * w},${by - py * w}`;
}

function estimateLabelWidth(text: string): number {
  const hasMath = hasInlineMath(text);
  const plain = plainInlineMath(text);
  return Math.max(24, Math.ceil(estimateTextWidth(plain, 11.5, 'sans')) + (hasMath ? 18 : 10));
}

function defaultLabelPoint(points: readonly Point2D[]): Point2D {
  let bestIdx = 0;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    if (l > bestLen) {
      bestLen = l;
      bestIdx = i;
    }
  }
  const a = points[bestIdx];
  const b = points[bestIdx + 1] ?? a;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * 复用正交/折线数据流箭头：
 * - 不使用全局 <marker id>，避免多图共存时 id 冲突
 * - 标签自带 --wisp-bg 遮罩底盒，杜绝压线
 * - 活跃态下以柔和轨底 + 高对比流光虚线 + 持续沿路径移动脉冲球表现真实数据流
 */
export default function DataFlowArrow({
  points,
  tone = 'active',
  active = false,
  muted = false,
  dashed = false,
  flow,
  continuous = true,
  visible = true,
  draw = false,
  drawDuration = 0.42,
  drawDelay = 0,
  dotToken,
  arrowEnd = true,
  arrowStart = false,
  label,
  labelPos,
  strokeWidth,
}: DataFlowArrowProps) {
  const { canAnimateFlow, highlightTransition } = useDiagramMotion();
  if (points.length < 2) return null;

  const d = points
    .map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`)
    .join(' ');
  const totalLen = polylineLength(points);

  const stroke = active
    ? resolveToneStroke(tone)
    : muted
      ? 'var(--wisp-subtle)'
      : 'var(--wisp-muted)';
  const sw = strokeWidth ?? (active ? 2 : 1.25);
  const targetOpacity = visible ? (muted && !active ? 0.45 : 1) : 0.08;

  const endTri = arrowEnd
    ? arrowHeadPoints(points[points.length - 2], points[points.length - 1])
    : '';
  const startTri = arrowStart ? arrowHeadPoints(points[1], points[0]) : '';

  const lp = label ? (labelPos ?? defaultLabelPoint(points)) : null;
  const lw = label ? estimateLabelWidth(label) : 0;

  const effectiveFlow = flow ?? active;
  const showStreamFlow = visible && active && effectiveFlow && continuous && canAnimateFlow;
  const showContinuousDot = showStreamFlow && totalLen >= 22;
  const showTimedDot =
    !showContinuousDot &&
    dotToken !== undefined &&
    dotToken > 0 &&
    visible &&
    active &&
    effectiveFlow &&
    canAnimateFlow;
  const pulseDuration = Math.max(0.95, Math.min(2.2, totalLen / 110));

  return (
    <motion.g
      initial={false}
      animate={{ opacity: draw ? 1 : targetOpacity }}
      transition={highlightTransition}
      aria-hidden={!visible || (muted && !active) ? true : undefined}
    >
      {draw ? (
        <motion.path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          strokeOpacity={showStreamFlow ? 0.34 : 1}
          strokeDasharray={dashed ? '4 3' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: visible ? 1 : 0, opacity: targetOpacity }}
          transition={{
            duration: visible ? drawDuration : 0,
            delay: visible ? drawDelay : 0,
            ease: DRAW_EASE,
          }}
        />
      ) : (
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          strokeOpacity={showStreamFlow ? 0.34 : 1}
          strokeDasharray={dashed ? '4 3' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {showStreamFlow && (
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={Math.max(2, sw + 0.3)}
          strokeDasharray="6 8"
          strokeLinecap="round"
          className="wisp-flow-dash"
        />
      )}

      {endTri &&
        (draw ? (
          <motion.polygon
            points={endTri}
            fill={stroke}
            initial={false}
            animate={{ opacity: visible ? targetOpacity : 0 }}
            transition={{
              duration: visible ? 0.2 : 0,
              delay: visible ? drawDelay + drawDuration * 0.6 : 0,
              ease: DRAW_EASE,
            }}
          />
        ) : (
          <polygon points={endTri} fill={stroke} />
        ))}
      {startTri &&
        (draw ? (
          <motion.polygon
            points={startTri}
            fill={stroke}
            initial={false}
            animate={{ opacity: visible ? targetOpacity : 0 }}
            transition={{
              duration: visible ? 0.2 : 0,
              delay: visible ? drawDelay + drawDuration * 0.6 : 0,
              ease: DRAW_EASE,
            }}
          />
        ) : (
          <polygon points={startTri} fill={stroke} />
        ))}

      {showContinuousDot && (
        <circle r={3.8} fill={stroke} stroke="var(--wisp-bg)" strokeWidth={1.3}>
          <animateMotion dur={`${pulseDuration.toFixed(2)}s`} repeatCount="indefinite" path={d} />
        </circle>
      )}

      {showTimedDot && (
        <motion.circle
          key={`df-${dotToken}`}
          r={3.6}
          fill={stroke}
          stroke="var(--wisp-bg)"
          strokeWidth={1.2}
          initial={{ cx: points[0][0], cy: points[0][1], opacity: 0 }}
          animate={{
            cx: points.map((p) => p[0]),
            cy: points.map((p) => p[1]),
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 0.65, delay: drawDelay, ease: DRAW_EASE }}
        />
      )}

      {label && lp && (
        <motion.g
          initial={false}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ duration: visible ? 0.24 : 0 }}
        >
          <rect
            x={lp[0] - lw / 2}
            y={lp[1] - 9}
            width={lw}
            height={18}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
          />
          <SvgRichLabel
            x={lp[0]}
            y={lp[1]}
            width={lw}
            height={20}
            text={label}
            fontSize={11.5}
            fontWeight={active ? 600 : 500}
            color={active ? stroke : 'var(--wisp-muted)'}
          />
        </motion.g>
      )}
    </motion.g>
  );
}
