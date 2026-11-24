import { motion } from 'motion/react';
import {
  RADIUS,
  RADIUS_SM,
  estimateTextWidth,
  fitTextMetrics,
  fontKindFor,
  fontVarFor,
  resolveToneFill,
  resolveToneStroke,
  useDiagramMotion,
  type AnyTone,
} from './motion';

export interface ByteSegment {
  value: number;
  label: string;
  sub?: string;
  tone: AnyTone;
  active?: boolean;
}

export interface ByteLedgerBarProps {
  x: number;
  y: number;
  w: number;
  h?: number;
  segments: readonly ByteSegment[];
  title?: string;
  totalLabel?: string;
  revealedCount?: number;
}

/**
 * 按字节/占比等比例切分的对比长条：
 * 极窄分段（< 54px，如 16B scale 或 4B UE8M0）自动交替引出引导标注，避免文字溢出互压。
 */
export default function ByteLedgerBar({
  x,
  y,
  w,
  h = 28,
  segments,
  title,
  totalLabel,
  revealedCount,
}: ByteLedgerBarProps) {
  const { stepTransition } = useDiagramMotion();
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.value), 0) || 1;

  // 保证正值分段有最小可见宽度同时从其余宽段扣减以精确贴合总宽 w
  const rawWidths = segments.map((s) => (s.value > 0 ? (s.value / total) * w : 0));
  const widths = rawWidths.map((rw, idx) => (segments[idx].value > 0 ? Math.max(6, rw) : 0));
  const sumW = widths.reduce((a, b) => a + b, 0) || 1;
  const scaledWidths = widths.map((wi) => (wi / sumW) * w);

  const titleEst = title ? estimateTextWidth(title, 12.5, 'sans') : 0;
  const totalKind = totalLabel ? fontKindFor(totalLabel, 'mono') : 'mono';
  const totalEst = totalLabel ? estimateTextWidth(totalLabel, 11.5, totalKind) : 0;
  const headerCrowded = Boolean(title && totalLabel && titleEst + totalEst > w - 16);
  const availTitle = headerCrowded
    ? Math.max(80, w * (titleEst / Math.max(1, titleEst + totalEst)) - 8)
    : w - 8;
  const availTotal = headerCrowded
    ? Math.max(60, w * (totalEst / Math.max(1, titleEst + totalEst)) - 8)
    : w - 8;
  const titleFit = title ? fitTextMetrics(title, availTitle, 12.5, 10, 'sans') : null;
  const totalFit = totalLabel ? fitTextMetrics(totalLabel, availTotal, 11.5, 10, totalKind) : null;

  interface LayoutItem {
    seg: ByteSegment;
    sx: number;
    sw: number;
    insideText: string | null;
    insideFit: { fontSize: number; textLength?: number } | null;
    calloutCx: number;
    calloutW: number;
    level: number;
  }

  const { items: layoutItems } = segments.reduce<{
    items: LayoutItem[];
    curX: number;
    levelEnds: number[];
  }>(
    (acc, seg, i) => {
      const sw = scaledWidths[i];
      const sx = acc.curX;
      if (sw <= 0.5) {
        acc.items.push({
          seg,
          sx,
          sw,
          insideText: null,
          insideFit: null,
          calloutCx: sx,
          calloutW: 0,
          level: 0,
        });
        return acc;
      }

      const fullText = seg.sub ? `${seg.label} (${seg.sub})` : seg.label;
      const fullKind = fontKindFor(fullText, 'mono');
      const labelKind = fontKindFor(seg.label, 'mono');
      let insideText: string | null = null;
      let insideFit: { fontSize: number; textLength?: number } | null = null;
      let level = 0;
      let calloutCx = sx + sw / 2;
      let calloutW = 0;
      let nextLevelEnds = acc.levelEnds;

      if (estimateTextWidth(fullText, 10.5, fullKind) <= sw - 8) {
        insideText = fullText;
        insideFit = fitTextMetrics(fullText, sw - 8, 11, 10, fullKind);
      } else if (estimateTextWidth(seg.label, 10, labelKind) <= sw - 8) {
        insideText = seg.label;
        insideFit = fitTextMetrics(seg.label, sw - 8, 10.5, 10, labelKind);
      } else {
        calloutW = Math.ceil(estimateTextWidth(seg.label, 10.5, labelKind)) + 8;
        calloutCx = Math.max(x + calloutW / 2 + 2, Math.min(x + w - calloutW / 2 - 2, sx + sw / 2));
        const leftEdge = calloutCx - calloutW / 2;
        let chosen = acc.levelEnds.findIndex((end) => leftEdge >= end + 8);
        if (chosen < 0) chosen = acc.levelEnds.length;
        level = chosen;
        nextLevelEnds = [...acc.levelEnds];
        nextLevelEnds[chosen] = calloutCx + calloutW / 2;
      }

      acc.items.push({
        seg,
        sx,
        sw,
        insideText,
        insideFit,
        calloutCx,
        calloutW,
        level,
      });
      return {
        items: acc.items,
        curX: sx + sw,
        levelEnds: nextLevelEnds,
      };
    },
    { items: [], curX: x, levelEnds: [] },
  );

  return (
    <g>
      {title && titleFit && (
        <text
          x={x}
          y={y - 12}
          textAnchor="start"
          dominantBaseline="central"
          textLength={titleFit.textLength}
          lengthAdjust={titleFit.textLength ? 'spacingAndGlyphs' : undefined}
          style={{
            fill: 'var(--wisp-fg)',
            fontFamily: 'var(--wisp-font-sans)',
            fontSize: titleFit.fontSize,
            fontWeight: 600,
          }}
        >
          {title}
        </text>
      )}
      {totalLabel && totalFit && (
        <text
          x={x + w}
          y={y - 12}
          textAnchor="end"
          dominantBaseline="central"
          textLength={totalFit.textLength}
          lengthAdjust={totalFit.textLength ? 'spacingAndGlyphs' : undefined}
          style={{
            fill: 'var(--wisp-muted)',
            fontFamily: fontVarFor(totalLabel, 'mono'),
            fontSize: totalFit.fontSize,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {totalLabel}
        </text>
      )}

      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        stroke="var(--wisp-border)"
        strokeWidth={1}
      />

      {/* 第一遍：先画所有分段矩形与引导折线，避免折线在 DOM 绘制顺序上压过相邻标签 */}
      <g>
        {layoutItems.map(({ seg, sx, sw, insideText, insideFit, calloutCx, level }, i) => {
          if (sw <= 0.5) return null;

          const segVisible = revealedCount === undefined || i < revealedCount;
          const fill = resolveToneFill(seg.tone);
          const stroke = resolveToneStroke(seg.tone);
          const calloutY = y + h + 14 + level * 15;

          return (
            <motion.g
              key={`seg-${seg.label}-${i}`}
              initial={false}
              animate={{ opacity: segVisible ? 1 : 0.14 }}
              transition={stepTransition}
            >
              <motion.rect
                initial={false}
                animate={{ x: sx, width: sw }}
                transition={stepTransition}
                y={y}
                height={h}
                rx={RADIUS_SM}
                fill={fill}
                stroke={stroke}
                strokeWidth={seg.active ? 2 : 1.25}
              />
              {!(insideText && insideFit) && (
                <polyline
                  points={`${(sx + sw / 2).toFixed(1)},${y + h} ${calloutCx.toFixed(1)},${calloutY - 7}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1}
                />
              )}
            </motion.g>
          );
        })}
      </g>

      {/* 第二遍：统一绘制段内标签与带遮罩底盒的引出标注 */}
      <g>
        {layoutItems.map(
          ({ seg, sx, sw, insideText, insideFit, calloutCx, calloutW, level }, i) => {
            if (sw <= 0.5) return null;

            const segVisible = revealedCount === undefined || i < revealedCount;
            const calloutY = y + h + 14 + level * 15;

            if (insideText && insideFit) {
              return (
                <text
                  key={`lbl-${seg.label}-${i}`}
                  x={sx + sw / 2}
                  y={y + h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  textLength={insideFit.textLength}
                  lengthAdjust={insideFit.textLength ? 'spacingAndGlyphs' : undefined}
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: fontVarFor(insideText, 'mono'),
                    fontSize: insideFit.fontSize,
                    fontWeight: seg.active ? 600 : 500,
                    fontVariantNumeric: 'tabular-nums',
                    opacity: segVisible ? 1 : 0,
                  }}
                >
                  {insideText}
                </text>
              );
            }

            return (
              <g key={`lbl-${seg.label}-${i}`} style={{ opacity: segVisible ? 1 : 0 }}>
                <rect
                  x={calloutCx - calloutW / 2}
                  y={calloutY - 7}
                  width={calloutW}
                  height={14}
                  rx={RADIUS_SM}
                  fill="var(--wisp-bg)"
                  fillOpacity={0.92}
                />
                <text
                  x={calloutCx}
                  y={calloutY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: fontVarFor(seg.label, 'mono'),
                    fontSize: 10.5,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {seg.label}
                </text>
              </g>
            );
          },
        )}
      </g>
    </g>
  );
}
