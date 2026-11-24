import { hasInlineMath, plainInlineMath } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import SvgRichLabel from './SvgRichLabel';
import {
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
  dimmed?: boolean;
  /** 控制逐槽显影数量；缺省显示全部槽位 */
  revealedCount?: number;
}

const DRAW_EASE = [0.42, 0, 0.2, 1] as const;

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
  dimmed = false,
  revealedCount,
}: SlotStripProps) {
  const { highlightTransition } = useDiagramMotion();
  const topOffset = title ? 18 : 0;
  const gridY = y + topOffset;

  return (
    <motion.g
      initial={false}
      animate={{ opacity: dimmed ? 0.34 : 1 }}
      transition={highlightTransition}
    >
      {title &&
        (hasInlineMath(title) ? (
          <SvgRichLabel
            x={x}
            y={y + 7}
            width={Math.max(120, slots.length * (slotW + gap))}
            height={20}
            text={title}
            fontSize={12}
            fontWeight={600}
            anchor="start"
          />
        ) : (
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
        ))}

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
        const sw =
          status === 'selected' || status === 'active' || status === 'error'
            ? 2
            : tone === 'neutral'
              ? 1
              : 1.25;
        const innerW = Math.max(12, slotW - 4);
        const lblHasMath = hasInlineMath(s.label);
        const subHasMath = hasInlineMath(s.sub);
        const tagHasMath = hasInlineMath(s.topTag);
        const lblKind = fontKindFor(plainInlineMath(s.label), 'mono');
        const subKind = s.sub ? fontKindFor(plainInlineMath(s.sub), 'mono') : 'mono';
        const tagKind = s.topTag ? fontKindFor(plainInlineMath(s.topTag), 'mono') : 'mono';
        const lblFit = fitTextMetrics(s.label, innerW, fontSize, 10, lblKind);
        const subFit = s.sub ? fitTextMetrics(s.sub, innerW, 10, 10, subKind) : null;
        const tagFit = s.topTag
          ? fitTextMetrics(s.topTag, slotW + Math.max(0, gap - 2), 10, 10, tagKind)
          : null;
        const slotVisible = revealedCount === undefined || idx < revealedCount;

        return (
          <motion.g
            key={s.id}
            initial={false}
            animate={{ opacity: slotVisible ? 1 : 0.16 }}
            transition={highlightTransition}
          >
            {s.topTag &&
              tagFit &&
              (tagHasMath ? (
                <SvgRichLabel
                  x={sx + slotW / 2}
                  y={gridY - 8}
                  width={slotW + Math.max(4, gap)}
                  height={18}
                  text={s.topTag}
                  fontSize={10}
                  color="var(--wisp-muted)"
                  family={tagKind}
                />
              ) : (
                <text
                  x={sx + slotW / 2}
                  y={gridY - 8}
                  textAnchor="middle"
                  dominantBaseline="central"
                  textLength={tagFit.textLength}
                  lengthAdjust={tagFit.textLength ? 'spacingAndGlyphs' : undefined}
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: fontVarFor(s.topTag, 'mono'),
                    fontSize: tagFit.fontSize,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {s.topTag}
                </text>
              ))}
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
            {lblHasMath ? (
              <SvgRichLabel
                x={sx + slotW / 2}
                y={gridY + (s.sub ? slotH * 0.38 : slotH / 2)}
                width={innerW}
                height={18}
                text={s.label}
                fontSize={fontSize}
                fontWeight={status === 'selected' || status === 'active' ? 600 : 500}
                color={status === 'empty' ? 'var(--wisp-muted)' : 'var(--wisp-fg)'}
                family={lblKind}
              />
            ) : (
              <text
                x={sx + slotW / 2}
                y={gridY + (s.sub ? slotH * 0.38 : slotH / 2)}
                textAnchor="middle"
                dominantBaseline="central"
                textLength={lblFit.textLength}
                lengthAdjust={lblFit.textLength ? 'spacingAndGlyphs' : undefined}
                style={{
                  fill: status === 'empty' ? 'var(--wisp-muted)' : 'var(--wisp-fg)',
                  fontFamily: fontVarFor(s.label, 'mono'),
                  fontSize: lblFit.fontSize,
                  fontWeight: status === 'selected' || status === 'active' ? 600 : 500,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.label}
              </text>
            )}
            {s.sub &&
              subFit &&
              (subHasMath ? (
                <SvgRichLabel
                  x={sx + slotW / 2}
                  y={gridY + slotH * 0.74}
                  width={innerW}
                  height={16}
                  text={s.sub}
                  fontSize={10}
                  color="var(--wisp-fg)"
                  family={subKind}
                />
              ) : (
                <text
                  x={sx + slotW / 2}
                  y={gridY + slotH * 0.74}
                  textAnchor="middle"
                  dominantBaseline="central"
                  textLength={subFit.textLength}
                  lengthAdjust={subFit.textLength ? 'spacingAndGlyphs' : undefined}
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: fontVarFor(s.sub, 'mono'),
                    fontSize: subFit.fontSize,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {s.sub}
                </text>
              ))}
          </motion.g>
        );
      })}
    </motion.g>
  );
}

export interface PointerArc {
  id?: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  tone?: AnyTone;
  active?: boolean;
  dashed?: boolean;
  flow?: boolean;
  visible?: boolean;
  draw?: boolean;
  /** active 为 false 时依然保留指定 tone 色彩而非统一切成灰色 */
  preserveTone?: boolean;
  /** 弯曲高度，正值向下凸，负值向上拱 */
  arcOffset?: number;
  label?: string;
}

/** 槽位间平滑指针连线 / 通道配对弧 / 虚拟页映射跳线。 */
export function PointerArcs({
  arcs,
  dotToken,
}: {
  arcs: readonly PointerArc[];
  dotToken?: number;
}) {
  const { canAnimateFlow, highlightTransition, packetTransition } = useDiagramMotion();

  return (
    <g>
      {arcs.map((a, idx) => {
        const useTone = a.active || (a.preserveTone && a.tone);
        const stroke = useTone ? resolveToneStroke(a.tone ?? 'active') : 'var(--wisp-subtle)';
        const visible = a.visible ?? true;
        const baseOpacity = a.active ? 1 : a.preserveTone ? 0.6 : 0.4;
        const targetOpacity = visible ? baseOpacity : 0.08;
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

        const showTimedDot =
          dotToken !== undefined ? dotToken > 0 && visible && a.active && a.flow : false;
        const showFallbackDot =
          dotToken === undefined && visible && a.active && a.flow && canAnimateFlow;

        return (
          <motion.g
            key={a.id ?? idx}
            initial={false}
            animate={{ opacity: a.draw ? 1 : targetOpacity }}
            transition={highlightTransition}
          >
            {a.draw ? (
              <motion.path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={a.active ? 2 : 1.25}
                strokeDasharray={a.dashed ? '4 3' : undefined}
                initial={false}
                animate={{ pathLength: visible ? 1 : 0, opacity: targetOpacity }}
                transition={{ duration: visible ? 0.28 : 0, ease: DRAW_EASE }}
              />
            ) : (
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={a.active ? 2 : 1.25}
                strokeDasharray={a.dashed ? '4 3' : undefined}
              />
            )}

            {a.draw ? (
              <motion.polygon
                points={tri}
                fill={stroke}
                initial={false}
                animate={{ opacity: visible ? targetOpacity : 0 }}
                transition={{ duration: visible ? 0.14 : 0, delay: visible ? 0.18 : 0 }}
              />
            ) : (
              <polygon points={tri} fill={stroke} />
            )}

            {showTimedDot && (
              <motion.circle
                key={`pa-${a.id ?? idx}-${dotToken}`}
                r={2.8}
                fill={stroke}
                initial={{ cx: a.fromX, cy: a.fromY, opacity: 0 }}
                animate={{
                  cx: [a.fromX, (a.fromX + 2 * mx + a.toX) / 4, a.toX],
                  cy: [a.fromY, ly, a.toY],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.48, ease: DRAW_EASE }}
              />
            )}
            {showFallbackDot && (
              <motion.circle
                r={2.8}
                fill={stroke}
                initial={{ cx: a.fromX, cy: a.fromY }}
                animate={{
                  cx: [a.fromX, (a.fromX + 2 * mx + a.toX) / 4, a.toX],
                  cy: [a.fromY, ly, a.toY],
                }}
                transition={packetTransition}
              />
            )}

            {a.label &&
              (() => {
                const labelHasMath = hasInlineMath(a.label);
                const plain = plainInlineMath(a.label);
                const labelKind = fontKindFor(plain, 'mono');
                const alw = Math.max(
                  36,
                  Math.ceil(estimateTextWidth(plain, 10.5, labelKind)) + (labelHasMath ? 18 : 10),
                );
                return (
                  <motion.g
                    initial={false}
                    animate={{ opacity: visible ? 1 : 0 }}
                    transition={{ duration: visible ? 0.18 : 0 }}
                  >
                    <rect
                      x={lx - alw / 2}
                      y={ly - 8}
                      width={alw}
                      height={16}
                      rx={RADIUS_SM}
                      fill="var(--wisp-bg)"
                    />
                    <SvgRichLabel
                      x={lx}
                      y={ly}
                      width={alw}
                      height={16}
                      text={a.label}
                      fontSize={10.5}
                      fontWeight={a.active ? 600 : 500}
                      color={useTone ? stroke : 'var(--wisp-muted)'}
                      family={labelKind}
                    />
                  </motion.g>
                );
              })()}
          </motion.g>
        );
      })}
    </g>
  );
}
