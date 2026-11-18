import { formatNumber } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  RADIUS_SM,
  fontVarFor,
  resolveToneFill,
  resolveToneStroke,
  useDiagramMotion,
  type AnyTone,
} from './motion';

export interface ProbBarSeriesItem {
  label: string;
  sublabel?: string;
  masked?: boolean;
  bars: readonly {
    value: number;
    tone: AnyTone;
    tag?: string;
    faded?: boolean;
    dashed?: boolean;
    highlight?: boolean;
  }[];
}

export interface ProbabilityBarsProps {
  x: number;
  y: number;
  w: number;
  h: number;
  items: readonly ProbBarSeriesItem[];
  maxValue: number;
  title?: string;
  valueFormat?: (v: number) => string;
  refLine?: { value: number; label: string; tone?: AnyTone };
  legend?: readonly { label: string; tone: AnyTone }[];
}

/**
 * 带步间柱高动画的概率分布 / 权重对比 / SQNR 柱状图：
 * 适用于 Sink+SWA 23.7x 权重畸变、投机拒绝采样、量化 SQNR 对比等。
 */
export default function ProbabilityBars({
  x,
  y,
  w,
  h,
  items,
  maxValue,
  title,
  valueFormat = (v) => `${formatNumber(v * 100, 1)}%`,
  refLine,
  legend,
}: ProbabilityBarsProps) {
  const { stepTransition } = useDiagramMotion();
  const topPad = title || legend ? 22 : 8;
  const bottomPad = 28;
  const plotY = y + topPad;
  const plotH = Math.max(40, h - topPad - bottomPad);
  const baseLineY = plotY + plotH;
  const safeMax = maxValue > 0 ? maxValue : 1;

  const n = items.length || 1;
  const slotW = w / n;

  return (
    <g>
      {title && (
        <text
          x={x}
          y={y + 8}
          textAnchor="start"
          dominantBaseline="central"
          style={{
            fill: 'var(--wisp-fg)',
            fontFamily: 'var(--wisp-font-sans)',
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {title}
        </text>
      )}

      {legend && (
        <g>
          {legend.map((lg, idx) => {
            const lx = x + w - (legend.length - idx) * 84;
            return (
              <g key={lg.label}>
                <rect
                  x={lx}
                  y={y + 3}
                  width={10}
                  height={10}
                  rx={RADIUS_SM}
                  fill={resolveToneFill(lg.tone)}
                  stroke={resolveToneStroke(lg.tone)}
                  strokeWidth={1.25}
                />
                <text
                  x={lx + 14}
                  y={y + 8}
                  textAnchor="start"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11,
                  }}
                >
                  {lg.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      <line
        x1={x}
        y1={baseLineY}
        x2={x + w}
        y2={baseLineY}
        stroke="var(--wisp-border)"
        strokeWidth={1}
      />

      {refLine && (
        <g>
          {(() => {
            const ry = baseLineY - Math.min(1, Math.max(0, refLine.value / safeMax)) * plotH;
            const rs = refLine.tone ? resolveToneStroke(refLine.tone) : 'var(--wisp-muted)';
            return (
              <>
                <line
                  x1={x}
                  y1={ry}
                  x2={x + w}
                  y2={ry}
                  stroke={rs}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text
                  x={x + w}
                  y={ry - 7}
                  textAnchor="end"
                  dominantBaseline="central"
                  style={{
                    fill: rs,
                    fontFamily: fontVarFor(refLine.label, 'mono'),
                    fontSize: 10.5,
                  }}
                >
                  {refLine.label}
                </text>
              </>
            );
          })()}
        </g>
      )}

      {items.map((item, idx) => {
        const cx = x + idx * slotW + slotW / 2;
        const barCount = item.bars.length || 1;
        const innerW = Math.min(slotW - 8, barCount * 26);
        const bw = Math.max(10, (innerW - (barCount - 1) * 4) / barCount);
        const startX = cx - (barCount * bw + (barCount - 1) * 4) / 2;

        return (
          <g key={`${item.label}-${idx}`}>
            {item.bars.map((b, bi) => {
              const bx = startX + bi * (bw + 4);
              const clamped = Math.max(0, Math.min(1, b.value / safeMax));
              const bh = item.masked ? 0 : clamped * plotH;
              const by = baseLineY - bh;
              const fill = item.masked ? resolveToneFill('mask') : resolveToneFill(b.tone);
              const stroke = item.masked ? resolveToneStroke('mask') : resolveToneStroke(b.tone);
              const topText = item.masked ? 'Mask' : (b.tag ?? valueFormat(b.value));

              return (
                <g key={bi}>
                  {item.masked ? (
                    <rect
                      x={bx}
                      y={baseLineY - 6}
                      width={bw}
                      height={6}
                      rx={RADIUS_SM}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={1}
                      strokeDasharray="3 2"
                    />
                  ) : (
                    <motion.rect
                      initial={false}
                      animate={{ y: by, height: Math.max(2, bh) }}
                      transition={stepTransition}
                      x={bx}
                      width={bw}
                      rx={RADIUS_SM}
                      fill={fill}
                      fillOpacity={b.faded ? 0.45 : 1}
                      stroke={stroke}
                      strokeWidth={b.highlight ? 2 : 1.25}
                      strokeDasharray={b.dashed ? '3 2' : undefined}
                    />
                  )}
                  <text
                    x={bx + bw / 2}
                    y={item.masked ? baseLineY - 14 : by - 9}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fill: item.masked ? 'var(--wisp-muted)' : stroke,
                      fontFamily: fontVarFor(topText, 'mono'),
                      fontSize: 10.5,
                      fontWeight: b.highlight ? 600 : 500,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {topText}
                  </text>
                </g>
              );
            })}

            <text
              x={cx}
              y={baseLineY + 11}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: item.masked ? 'var(--wisp-muted)' : 'var(--wisp-fg)',
                fontFamily: fontVarFor(item.label, 'mono'),
                fontSize: 11,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {item.label}
            </text>
            {item.sublabel && (
              <text
                x={cx}
                y={baseLineY + 23}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-muted)',
                  fontFamily: fontVarFor(item.sublabel, 'mono'),
                  fontSize: 10,
                }}
              >
                {item.sublabel}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
