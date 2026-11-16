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

export type SlotStatus = 'normal' | 'active' | 'selected' | 'masked' | 'error' | 'empty';

export interface SlotItem {
  id: string;
  label: string;
  sub?: string;
  topTag?: string;
  tone?: AnyTone;
  status?: SlotStatus;
}

export interface SlotStripProps {
  x: number;
  y: number;
  slots: readonly SlotItem[];
  slotW?: number;
  slotH?: number;
  gap?: number;
  title?: string;
  fontSize?: number;
}

/** 连续物理页块 / 环形缓存 / 质数分桶 / Token 序列槽位条。 */
export function SlotStrip({
  x,
  y,
  slots,
  slotW = 40,
  slotH = 34,
  gap = 4,
  title,
  fontSize = 11.5,
}: SlotStripProps) {
  const { highlightTransition } = useDiagramMotion();
  const topOffset = title ? 18 : 0;
  const gridY = y + topOffset;

  return (
    <g>
      {title && (
        <text
          x={x}
          y={y + 7}
          textAnchor="start"
          dominantBaseline="central"
          style={{
            fill: 'var(--wisp-fg)',
            fontFamily: 'var(--wisp-font-sans)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {title}
        </text>
      )}

      {slots.map((s, idx) => {
        const sx = x + idx * (slotW + gap);
        const status = s.status ?? 'normal';
        const tone: AnyTone =
          status === 'masked' || status === 'empty'
            ? 'mask'
            : status === 'error'
              ? 'error'
              : (s.tone ?? 'neutral');

        const fill = status === 'empty' ? 'var(--wisp-bg)' : resolveToneFill(tone);
        const stroke = resolveToneStroke(tone);
        const sw = status === 'selected' || status === 'active' || status === 'error' ? 2 : 1.1;
        const innerW = Math.max(12, slotW - 4);
        const lblFit = fitTextMetrics(s.label, innerW, fontSize, 7.5, 'mono');
        const subFit = s.sub ? fitTextMetrics(s.sub, innerW, 9.5, 7, 'mono') : null;
        const tagFit = s.topTag
          ? fitTextMetrics(s.topTag, slotW + Math.max(0, gap - 2), 10, 7.5, 'mono')
          : null;

        return (
          <g key={s.id}>
            {s.topTag && tagFit && (
              <text
                x={sx + slotW / 2}
                y={gridY - 8}
                textAnchor="middle"
                dominantBaseline="central"
                textLength={tagFit.textLength}
                lengthAdjust={tagFit.textLength ? 'spacingAndGlyphs' : undefined}
                style={{
                  fill: 'var(--wisp-muted)',
                  fontFamily: 'var(--wisp-font-mono)',
                  fontSize: tagFit.fontSize,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.topTag}
              </text>
            )}
            <motion.rect
              initial={false}
              animate={{ opacity: status === 'masked' ? 0.65 : 1 }}
              transition={highlightTransition}
              x={sx}
              y={gridY}
              width={slotW}
              height={slotH}
              rx={RADIUS_SM}
              fill={fill}
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray={status === 'empty' || status === 'masked' ? '3 2' : undefined}
            />
            <text
              x={sx + slotW / 2}
              y={gridY + (s.sub ? slotH * 0.38 : slotH / 2)}
              textAnchor="middle"
              dominantBaseline="central"
              textLength={lblFit.textLength}
              lengthAdjust={lblFit.textLength ? 'spacingAndGlyphs' : undefined}
              style={{
                fill: status === 'empty' ? 'var(--wisp-muted)' : 'var(--wisp-fg)',
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: lblFit.fontSize,
                fontWeight: status === 'selected' || status === 'active' ? 600 : 500,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.label}
            </text>
            {s.sub && subFit && (
              <text
                x={sx + slotW / 2}
                y={gridY + slotH * 0.74}
                textAnchor="middle"
                dominantBaseline="central"
                textLength={subFit.textLength}
                lengthAdjust={subFit.textLength ? 'spacingAndGlyphs' : undefined}
                style={{
                  fill: stroke,
                  fontFamily: 'var(--wisp-font-mono)',
                  fontSize: subFit.fontSize,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.sub}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export interface PointerArc {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  tone?: AnyTone;
  active?: boolean;
  dashed?: boolean;
  flow?: boolean;
  /** 弯曲高度，正值向下凸，负值向上拱 */
  arcOffset?: number;
  label?: string;
}

/** 槽位间平滑指针连线 / 通道配对弧 / 虚拟页映射跳线。 */
export function PointerArcs({ arcs }: { arcs: readonly PointerArc[] }) {
  const { canAnimateFlow, highlightTransition, packetTransition } = useDiagramMotion();

  return (
    <g>
      {arcs.map((a, idx) => {
        const stroke = a.active ? resolveToneStroke(a.tone ?? 'active') : 'var(--wisp-subtle)';
        const mx = (a.fromX + a.toX) / 2;
        const my = (a.fromY + a.toY) / 2 + (a.arcOffset ?? -26);
        const d = `M ${a.fromX.toFixed(1)} ${a.fromY.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${a.toX.toFixed(1)} ${a.toY.toFixed(1)}`;
        const lx = mx;
        const ly = (a.fromY + 2 * my + a.toY) / 4;

        // 估算终点切线方向绘制箭头
        const tx = a.toX - mx;
        const ty = a.toY - my;
        const tl = Math.hypot(tx, ty) || 1;
        const ux = tx / tl;
        const uy = ty / tl;
        const bx = a.toX - ux * 6;
        const by = a.toY - uy * 6;
        const px = -uy * 2.6;
        const py = ux * 2.6;
        const tri = `${a.toX},${a.toY} ${bx + px},${by + py} ${bx - px},${by - py}`;

        return (
          <motion.g
            key={idx}
            initial={false}
            animate={{ opacity: a.active ? 1 : 0.4 }}
            transition={highlightTransition}
          >
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={a.active ? 1.75 : 1.1}
              strokeDasharray={a.dashed ? '4 3' : undefined}
            />
            <polygon points={tri} fill={stroke} />
            {a.active && a.flow && canAnimateFlow && (
              <motion.circle
                r={2.8}
                fill={stroke}
                initial={{ cx: a.fromX, cy: a.fromY }}
                animate={{
                  cx: [a.fromX, mx, a.toX],
                  cy: [a.fromY, (a.fromY + my) / 2, a.toY],
                }}
                transition={packetTransition}
              />
            )}
            {a.label &&
              (() => {
                const alw = Math.max(36, Math.ceil(estimateTextWidth(a.label, 10.5, 'mono')) + 10);
                return (
                  <g>
                    <rect
                      x={lx - alw / 2}
                      y={ly - 8}
                      width={alw}
                      height={16}
                      rx={3}
                      fill="var(--wisp-bg)"
                    />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fill: a.active ? stroke : 'var(--wisp-muted)',
                        fontFamily: 'var(--wisp-font-mono)',
                        fontSize: 10.5,
                        fontWeight: a.active ? 600 : 500,
                      }}
                    >
                      {a.label}
                    </text>
                  </g>
                );
              })()}
          </motion.g>
        );
      })}
    </g>
  );
}
