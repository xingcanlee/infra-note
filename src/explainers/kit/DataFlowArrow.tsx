import { motion } from 'motion/react';
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
  /** active 且非减弱动效时，沿折线播放数据脉冲点 */
  flow?: boolean;
  arrowEnd?: boolean;
  arrowStart?: boolean;
  label?: string;
  /** 可选标签位置覆盖；缺省放在最长线段中点 */
  labelPos?: Point2D;
  strokeWidth?: number;
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
  return Math.max(24, Math.ceil(estimateTextWidth(text, 11.5, 'sans')) + 10);
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
 * - 支持 active 时沿路径流动脉冲
 */
export default function DataFlowArrow({
  points,
  tone = 'active',
  active = false,
  muted = false,
  dashed = false,
  flow = false,
  arrowEnd = true,
  arrowStart = false,
  label,
  labelPos,
  strokeWidth,
}: DataFlowArrowProps) {
  const { canAnimateFlow, highlightTransition, packetTransition } = useDiagramMotion();
  if (points.length < 2) return null;

  const d = points
    .map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`)
    .join(' ');

  const stroke = active
    ? resolveToneStroke(tone)
    : muted
      ? 'var(--wisp-subtle)'
      : 'var(--wisp-muted)';
  const sw = strokeWidth ?? (active ? 2 : 1.25);
  const opacity = muted && !active ? 0.45 : 1;

  const endTri = arrowEnd
    ? arrowHeadPoints(points[points.length - 2], points[points.length - 1])
    : '';
  const startTri = arrowStart ? arrowHeadPoints(points[1], points[0]) : '';

  const lp = label ? (labelPos ?? defaultLabelPoint(points)) : null;
  const lw = label ? estimateLabelWidth(label) : 0;

  return (
    <motion.g
      initial={false}
      animate={{ opacity }}
      transition={highlightTransition}
      aria-hidden={muted && !active ? true : undefined}
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeDasharray={dashed ? '4 3' : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {endTri && <polygon points={endTri} fill={stroke} />}
      {startTri && <polygon points={startTri} fill={stroke} />}
      {active && flow && canAnimateFlow && (
        <motion.circle
          r={3.2}
          fill={stroke}
          initial={{ cx: points[0][0], cy: points[0][1] }}
          animate={{
            cx: points.map((p) => p[0]),
            cy: points.map((p) => p[1]),
          }}
          transition={packetTransition}
        />
      )}
      {label && lp && (
        <g>
          <rect
            x={lp[0] - lw / 2}
            y={lp[1] - 9}
            width={lw}
            height={18}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
          />
          <text
            x={lp[0]}
            y={lp[1]}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fill: active ? stroke : 'var(--wisp-muted)',
              fontFamily: 'var(--wisp-font-sans)',
              fontSize: 11.5,
              fontWeight: active ? 600 : 500,
            }}
          >
            {label}
          </text>
        </g>
      )}
    </motion.g>
  );
}
