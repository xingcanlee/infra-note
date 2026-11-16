import { formatNumber } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  RADIUS_SM,
  estimateTextWidth,
  fitTextMetrics,
  resolveToneFill,
  resolveToneStroke,
  useDiagramMotion,
  type AnyTone,
} from './motion';

export interface TimelineBlock {
  start: number;
  dur: number;
  label: string;
  tone: AnyTone;
  active?: boolean;
  dashed?: boolean;
  /** 'bubble' 表示等待/空闲气泡区间，用斜虚线/暗底渲染 */
  kind?: 'op' | 'bubble' | 'error';
}

export interface TimelineLane {
  title: string;
  subtitle?: string;
  blocks: readonly TimelineBlock[];
}

export interface TimelineSyncEvent {
  fromLane: number;
  at: number;
  toLane: number;
  toAt?: number;
  label?: string;
  tone?: AnyTone;
  active?: boolean;
  dashed?: boolean;
}

export interface SwimlaneTimelineProps {
  x: number;
  y: number;
  w: number;
  totalTime: number;
  unit?: string;
  ticks?: readonly number[];
  lanes: readonly TimelineLane[];
  syncEvents?: readonly TimelineSyncEvent[];
  laneH?: number;
  laneGap?: number;
  gutterW?: number;
  playhead?: number;
  title?: string;
}

/**
 * 时间轴严格按毫秒/微秒等比例对齐的多泳道硬件时序图：
 * 支持计算流/通信流/预取流并行、气泡标识、跨流 Event 同步箭头与播放头。
 */
export default function SwimlaneTimeline({
  x,
  y,
  w,
  totalTime,
  unit = 'ms',
  ticks,
  lanes,
  syncEvents,
  laneH = 32,
  laneGap = 12,
  gutterW = 112,
  playhead,
  title,
}: SwimlaneTimelineProps) {
  const { stepTransition } = useDiagramMotion();
  const trackX = x + gutterW;
  const trackW = Math.max(120, w - gutterW);
  const topPad = title ? 24 : 14;
  const trackY = y + topPad;
  const totalH = lanes.length * laneH + Math.max(0, lanes.length - 1) * laneGap;
  const safeTotal = totalTime > 0 ? totalTime : 1;
  const toX = (t: number) => trackX + (Math.max(0, Math.min(safeTotal, t)) / safeTotal) * trackW;

  const tickList =
    ticks ?? Array.from({ length: 5 }, (_, i) => Number(((safeTotal * i) / 4).toFixed(1)));

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

      {tickList.map((tk) => {
        const tx = toX(tk);
        return (
          <g key={tk}>
            <line
              x1={tx}
              y1={trackY - 4}
              x2={tx}
              y2={trackY + totalH + 4}
              stroke="var(--wisp-border)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={tx}
              y={trackY + totalH + 14}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 10.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {`${formatNumber(tk, 1)}${unit}`}
            </text>
          </g>
        );
      })}

      {lanes.map((lane, li) => {
        const ly = trackY + li * (laneH + laneGap);
        return (
          <g key={lane.title}>
            <rect
              x={trackX}
              y={ly}
              width={trackW}
              height={laneH}
              rx={RADIUS_SM}
              fill="var(--wisp-surface)"
              stroke="var(--wisp-border)"
              strokeWidth={1}
            />
            <text
              x={x + gutterW - 8}
              y={ly + (lane.subtitle ? laneH * 0.36 : laneH / 2)}
              textAnchor="end"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-fg)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {lane.title}
            </text>
            {lane.subtitle && (
              <text
                x={x + gutterW - 8}
                y={ly + laneH * 0.72}
                textAnchor="end"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-muted)',
                  fontFamily: 'var(--wisp-font-mono)',
                  fontSize: 10,
                }}
              >
                {lane.subtitle}
              </text>
            )}

            {lane.blocks.map((blk, bi) => {
              const bx = toX(blk.start);
              const bw = Math.max(4, toX(blk.start + blk.dur) - bx);
              const isBubble = blk.kind === 'bubble';
              const tone: AnyTone = blk.kind === 'error' ? 'error' : isBubble ? 'mask' : blk.tone;
              const fill = resolveToneFill(tone);
              const stroke = resolveToneStroke(tone);
              const blkFit =
                bw >= 26
                  ? fitTextMetrics(blk.label, bw - 6, bw >= 64 ? 10.5 : 9.5, 7.5, 'mono')
                  : null;

              return (
                <g key={`${blk.label}-${bi}`}>
                  <motion.rect
                    initial={false}
                    animate={{ x: bx, width: bw }}
                    transition={stepTransition}
                    y={ly + 2}
                    height={laneH - 4}
                    rx={RADIUS_SM}
                    fill={fill}
                    fillOpacity={isBubble ? 0.45 : 1}
                    stroke={stroke}
                    strokeWidth={blk.active ? 2 : 1.1}
                    strokeDasharray={blk.dashed || isBubble ? '3 2' : undefined}
                  />
                  {blkFit && (
                    <text
                      x={bx + bw / 2}
                      y={ly + laneH / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      textLength={blkFit.textLength}
                      lengthAdjust={blkFit.textLength ? 'spacingAndGlyphs' : undefined}
                      style={{
                        fill: isBubble ? 'var(--wisp-muted)' : 'var(--wisp-fg)',
                        fontFamily: 'var(--wisp-font-mono)',
                        fontSize: blkFit.fontSize,
                        fontWeight: blk.active ? 600 : 500,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {blk.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {syncEvents?.map((ev, ei) => {
        const sx = toX(ev.at);
        const ex = toX(ev.toAt ?? ev.at);
        const sy = trackY + ev.fromLane * (laneH + laneGap) + laneH;
        const ey = trackY + ev.toLane * (laneH + laneGap);
        const up = ev.toLane < ev.fromLane;
        const y0 = up ? sy - laneH : sy;
        const y1 = up ? ey + laneH : ey;
        const stroke = resolveToneStroke(ev.tone ?? (ev.active ? 'activation' : 'mask'));
        const dir = y1 >= y0 ? 1 : -1;
        const tri = `${ex},${y1} ${ex - 3},${y1 - 5 * dir} ${ex + 3},${y1 - 5 * dir}`;

        return (
          <g key={`ev-${ei}`}>
            <line
              x1={sx}
              y1={y0}
              x2={ex}
              y2={y1}
              stroke={stroke}
              strokeWidth={ev.active ? 1.75 : 1.15}
              strokeDasharray={ev.dashed ? '3 2' : undefined}
            />
            <polygon points={tri} fill={stroke} />
            {ev.label &&
              (() => {
                const evW = Math.max(32, Math.ceil(estimateTextWidth(ev.label, 9.5, 'mono')) + 8);
                const evX = Math.max(
                  trackX + evW / 2,
                  Math.min(trackX + trackW - evW / 2, (sx + ex) / 2),
                );
                const evY = (y0 + y1) / 2;
                return (
                  <g>
                    <rect
                      x={evX - evW / 2}
                      y={evY - 7}
                      width={evW}
                      height={14}
                      rx={2}
                      fill="var(--wisp-bg)"
                    />
                    <text
                      x={evX}
                      y={evY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fill: stroke,
                        fontFamily: 'var(--wisp-font-mono)',
                        fontSize: 9.5,
                        fontWeight: 600,
                      }}
                    >
                      {ev.label}
                    </text>
                  </g>
                );
              })()}
          </g>
        );
      })}

      {playhead !== undefined && (
        <motion.line
          initial={false}
          animate={{ x1: toX(playhead), x2: toX(playhead) }}
          transition={stepTransition}
          y1={trackY - 6}
          y2={trackY + totalH + 6}
          stroke="var(--wisp-accent)"
          strokeWidth={1.75}
          strokeDasharray="4 2"
        />
      )}
    </g>
  );
}
