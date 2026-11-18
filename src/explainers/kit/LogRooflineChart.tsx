import { motion } from 'motion/react';
import {
  RADIUS_SM,
  estimateTextWidth,
  fontKindFor,
  fontVarFor,
  resolveToneFill,
  resolveToneStroke,
  useDiagramMotion,
  type AnyTone,
} from './motion';

export interface RooflineCeiling {
  bw: number; // GB/s or TB/s matching unit
  peak: number; // TFLOPS
  label: string;
  tone: AnyTone;
  dashed?: boolean;
}

export interface RooflinePoint {
  ai: number;
  perf: number;
  label: string;
  tone: AnyTone;
  active?: boolean;
}

export interface LogRooflineChartProps {
  x: number;
  y: number;
  w: number;
  h: number;
  xRange: readonly [number, number];
  yRange: readonly [number, number];
  ceilings: readonly RooflineCeiling[];
  points: readonly RooflinePoint[];
  xTicks: readonly number[];
  yTicks: readonly number[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** ridgeAI marker vertical line */
  ridgeMarkers?: readonly { ai: number; label: string; tone: AnyTone }[];
}

/** 对数坐标 Roofline 性能曲线画布：严格按 log10 比例映射到 viewBox。 */
export default function LogRooflineChart({
  x,
  y,
  w,
  h,
  xRange,
  yRange,
  ceilings,
  points,
  xTicks,
  yTicks,
  xAxisLabel = '算术强度 AI (FLOP / Byte)',
  yAxisLabel = '性能 (TFLOPS)',
  ridgeMarkers,
}: LogRooflineChartProps) {
  const { stepTransition } = useDiagramMotion();
  const left = x + 46;
  const top = y + 14;
  const pw = w - 62;
  const ph = h - 46;

  const lx0 = Math.log10(xRange[0]);
  const lx1 = Math.log10(xRange[1]);
  const ly0 = Math.log10(yRange[0]);
  const ly1 = Math.log10(yRange[1]);

  const toPx = (ai: number) =>
    left + ((Math.log10(Math.max(xRange[0], ai)) - lx0) / (lx1 - lx0)) * pw;
  const toPy = (perf: number) =>
    top +
    ph -
    ((Math.log10(Math.max(yRange[0], Math.min(yRange[1], perf))) - ly0) / (ly1 - ly0)) * ph;

  // 预计算无碰撞标签位置（拐点垂直线贴底，Ceiling 贴左膝区，数据点标签避让折线与同行兄弟）
  const placedRidges = (ridgeMarkers ?? []).reduce<
    Array<{ rm: { ai: number; label: string; tone: AnyTone }; rx: number; ly: number; lw: number }>
  >((acc, rm) => {
    const rx = toPx(rm.ai);
    const lw = Math.ceil(estimateTextWidth(rm.label, 10, fontKindFor(rm.label, 'mono'))) + 8;
    const lx = Math.max(left + 4, Math.min(left + pw - lw - 4, rx + 4));
    const collidesRow0 = acc.some((prev) => prev.ly > top + ph - 18 && lx < prev.rx + prev.lw + 6);
    const ly = top + ph - (collidesRow0 ? 26 : 12);
    acc.push({ rm, rx, ly, lw });
    return acc;
  }, []);

  const placedCeilings = ceilings.map((c, idx) => {
    const ridgeAI = (c.peak * 1000) / c.bw;
    const p0x = toPx(xRange[0]);
    const p0y = toPy(Math.min(c.peak, (xRange[0] * c.bw) / 1000));
    const p1x = toPx(Math.min(xRange[1], ridgeAI));
    const p1y = toPy(c.peak);
    const p2x = toPx(xRange[1]);
    const stroke = resolveToneStroke(c.tone);
    const lw = Math.ceil(estimateTextWidth(c.label, 10.5, 'sans')) + 24;
    // Legend in upper-left corner (always above diagonal bandwidth slope, guaranteed empty)
    const lx = left + 10;
    const ly = top + 11 + idx * 17;
    return {
      c,
      pointsStr: `${p0x},${p0y} ${p1x},${p1y} ${p2x},${p1y}`,
      lx,
      ly,
      lw,
      stroke,
    };
  });

  const placedPoints = points.reduce<
    Array<{
      pt: RooflinePoint;
      px: number;
      py: number;
      lx: number;
      ly: number;
      lw: number;
      anchor: 'start' | 'end';
      stroke: string;
      fill: string;
    }>
  >((acc, pt) => {
    const px = toPx(pt.ai);
    const py = toPy(pt.perf);
    const stroke = resolveToneStroke(pt.tone);
    const fill = resolveToneFill(pt.tone);
    const fs = pt.active ? 10.5 : 10;
    const lw = Math.ceil(estimateTextWidth(pt.label, fs, fontKindFor(pt.label, 'mono'))) + 8;
    const nearRight = px + 9 + lw > left + pw - 2;
    const anchor: 'start' | 'end' = nearRight ? 'end' : 'start';
    const rawLx = nearRight ? px - 9 : px + 9;
    const lx = anchor === 'start' ? Math.min(rawLx, left + pw - lw) : Math.max(rawLx, left + lw);

    let ly = py < top + 24 ? Math.min(top + ph - 12, py + 13) : py - 1;
    for (const prev of acc) {
      const pLeft = prev.anchor === 'start' ? prev.lx - 4 : prev.lx - prev.lw + 4;
      const curLeft = anchor === 'start' ? lx - 4 : lx - lw + 4;
      const overlapX = curLeft < pLeft + prev.lw + 4 && curLeft + lw + 4 > pLeft;
      if (overlapX && Math.abs(ly - prev.ly) < 13) {
        ly = Math.min(top + ph - 10, prev.ly + 13);
      }
    }
    acc.push({ pt, px, py, lx, ly, lw, anchor, stroke, fill });
    return acc;
  }, []);

  return (
    <g>
      <rect
        x={left}
        y={top}
        width={pw}
        height={ph}
        rx={RADIUS_SM}
        fill="var(--wisp-surface)"
        fillOpacity={0.38}
        stroke="var(--wisp-border)"
        strokeWidth={1}
      />

      {xTicks.map((xt) => {
        const px = toPx(xt);
        return (
          <g key={`xt-${xt}`}>
            <line
              x1={px}
              y1={top}
              x2={px}
              y2={top + ph}
              stroke="var(--wisp-border)"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
            <text
              x={px}
              y={top + ph + 12}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {xt}
            </text>
          </g>
        );
      })}

      {yTicks.map((yt) => {
        const py = toPy(yt);
        return (
          <g key={`yt-${yt}`}>
            <line
              x1={left}
              y1={py}
              x2={left + pw}
              y2={py}
              stroke="var(--wisp-border)"
              strokeDasharray="2 3"
              strokeWidth={1}
            />
            <text
              x={left - 6}
              y={py}
              textAnchor="end"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {yt}
            </text>
          </g>
        );
      })}

      {placedRidges.map(({ rm, rx, ly, lw }) => {
        const rs = resolveToneStroke(rm.tone);
        const pillX = Math.max(left + 4, Math.min(left + pw - lw - 4, rx + 2));
        return (
          <g key={rm.label}>
            <line
              x1={rx}
              y1={top}
              x2={rx}
              y2={top + ph}
              stroke={rs}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <rect
              x={pillX}
              y={ly - 7}
              width={lw}
              height={14}
              rx={RADIUS_SM}
              fill="var(--wisp-bg)"
              fillOpacity={0.92}
            />
            <text
              x={pillX + 4}
              y={ly}
              textAnchor="start"
              dominantBaseline="central"
              style={{
                fill: rs,
                fontFamily: fontVarFor(rm.label, 'mono'),
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {rm.label}
            </text>
          </g>
        );
      })}

      {placedCeilings.map(({ c, pointsStr, lx, ly, lw, stroke }) => (
        <g key={c.label}>
          <polyline
            points={pointsStr}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray={c.dashed ? '5 3' : undefined}
          />
          <rect
            x={lx - 4}
            y={ly - 7.5}
            width={lw}
            height={15}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
            fillOpacity={0.92}
          />
          <line
            x1={lx}
            y1={ly}
            x2={lx + 14}
            y2={ly}
            stroke={stroke}
            strokeWidth={2}
            strokeDasharray={c.dashed ? '4 2' : undefined}
          />
          <text
            x={lx + 18}
            y={ly}
            textAnchor="start"
            dominantBaseline="central"
            style={{
              fill: stroke,
              fontFamily: 'var(--wisp-font-sans)',
              fontSize: 10.5,
              fontWeight: 600,
            }}
          >
            {c.label}
          </text>
        </g>
      ))}

      {placedPoints.map(({ pt, px, py, lx, ly, lw, anchor, stroke, fill }) => {
        const pillX = anchor === 'start' ? lx - 4 : lx - lw + 4;
        return (
          <motion.g
            key={pt.label}
            initial={false}
            animate={{ opacity: pt.active ? 1 : 0.45 }}
            transition={stepTransition}
          >
            <circle
              cx={px}
              cy={py}
              r={pt.active ? 5.5 : 4}
              fill={fill}
              stroke={stroke}
              strokeWidth={pt.active ? 2 : 1.25}
            />
            <rect
              x={pillX}
              y={ly - 7}
              width={lw}
              height={14}
              rx={RADIUS_SM}
              fill="var(--wisp-bg)"
              fillOpacity={0.9}
            />
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="central"
              style={{
                fill: pt.active ? stroke : 'var(--wisp-muted)',
                fontFamily: fontVarFor(pt.label, 'mono'),
                fontSize: pt.active ? 10.5 : 10,
                fontWeight: pt.active ? 600 : 500,
              }}
            >
              {pt.label}
            </text>
          </motion.g>
        );
      })}

      <text
        x={left + pw / 2}
        y={top + ph + 26}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fill: 'var(--wisp-muted)',
          fontFamily: 'var(--wisp-font-sans)',
          fontSize: 11,
        }}
      >
        {xAxisLabel}
      </text>
      <text
        x={x + 12}
        y={top + ph / 2}
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(-90 ${x + 12} ${top + ph / 2})`}
        style={{
          fill: 'var(--wisp-muted)',
          fontFamily: 'var(--wisp-font-sans)',
          fontSize: 11,
        }}
      >
        {yAxisLabel}
      </text>
    </g>
  );
}
