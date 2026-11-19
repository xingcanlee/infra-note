import { hasInlineMath, plainInlineMath } from 'astro-wisp/explainers';
import SvgRichLabel from './SvgRichLabel';
import {
  RADIUS,
  RADIUS_SM,
  estimateTextWidth,
  fitTextMetrics,
  fontKindFor,
  fontVarFor,
  resolveToneFill,
  resolveToneStroke,
  type AnyTone,
} from './motion';

export interface MetricItem {
  label: string;
  value: string;
  tone?: AnyTone;
  active?: boolean;
}

export interface MetricRowProps {
  x: number;
  y: number;
  w: number;
  h?: number;
  gap?: number;
  metrics: readonly MetricItem[];
}

/** 固定位置的数据仪表条（tabular-nums 等宽数值），避免翻步时版面高度抖动。 */
export function MetricRow({ x, y, w, h = 40, gap = 8, metrics }: MetricRowProps) {
  const n = metrics.length || 1;
  const cw = (w - (n - 1) * gap) / n;

  return (
    <g>
      {metrics.map((m, i) => {
        const mx = x + i * (cw + gap);
        const tone = m.tone ?? 'neutral';
        const fill = tone === 'neutral' ? 'var(--wisp-surface)' : resolveToneFill(tone);
        const stroke = m.active ? resolveToneStroke(tone) : 'var(--wisp-border)';
        const valColor = 'var(--wisp-fg)';
        const innerW = Math.max(24, cw - 12);
        const labelHasMath = hasInlineMath(m.label);
        const valueHasMath = hasInlineMath(m.value);
        const valKind = fontKindFor(plainInlineMath(m.value), 'mono');
        const lblFit = fitTextMetrics(plainInlineMath(m.label), innerW, 10.5, 10, 'sans');
        const valFit = fitTextMetrics(plainInlineMath(m.value), innerW, 12.5, 10, valKind);
        return (
          <g key={`${m.label}-${i}`}>
            <rect
              x={mx}
              y={y}
              width={cw}
              height={h}
              rx={RADIUS_SM}
              fill={fill}
              stroke={stroke}
              strokeWidth={m.active ? 2 : 1}
            />
            {labelHasMath ? (
              <SvgRichLabel
                x={mx + cw / 2}
                y={y + h * 0.31}
                width={innerW}
                height={20}
                text={m.label}
                fontSize={Math.min(10.5, lblFit.fontSize)}
                fontWeight={500}
                color="var(--wisp-muted)"
                family="sans"
              />
            ) : (
              <text
                x={mx + cw / 2}
                y={y + h * 0.31}
                textAnchor="middle"
                dominantBaseline="central"
                textLength={lblFit.textLength}
                lengthAdjust={lblFit.textLength ? 'spacingAndGlyphs' : undefined}
                style={{
                  fill: 'var(--wisp-muted)',
                  fontFamily: 'var(--wisp-font-sans)',
                  fontSize: lblFit.fontSize,
                  fontWeight: 500,
                }}
              >
                {m.label}
              </text>
            )}
            {valueHasMath ? (
              <SvgRichLabel
                x={mx + cw / 2}
                y={y + h * 0.7}
                width={innerW}
                height={22}
                text={m.value}
                fontSize={Math.min(12, valFit.fontSize)}
                fontWeight={600}
                color={valColor}
                family={valKind}
              />
            ) : (
              <text
                x={mx + cw / 2}
                y={y + h * 0.7}
                textAnchor="middle"
                dominantBaseline="central"
                textLength={valFit.textLength}
                lengthAdjust={valFit.textLength ? 'spacingAndGlyphs' : undefined}
                style={{
                  fill: valColor,
                  fontFamily: fontVarFor(m.value, 'mono'),
                  fontSize: valFit.fontSize,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {m.value}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export interface SectionBoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  tone?: AnyTone;
  dashed?: boolean;
}

/** 轻量虚线分组区框（与 Wisp 纸面底保持高对比与克制层次）。 */
export function SectionBox({
  x,
  y,
  w,
  h,
  title,
  tone = 'neutral',
  dashed = true,
}: SectionBoxProps) {
  const stroke = tone === 'neutral' ? 'var(--wisp-border)' : resolveToneStroke(tone);
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={RADIUS}
        fill="var(--wisp-surface)"
        fillOpacity={0.32}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray={dashed ? '4 3' : undefined}
      />
      {title &&
        (() => {
          const titleHasMath = hasInlineMath(title);
          const plainTitle = plainInlineMath(title);
          const titleColor = tone === 'neutral' ? 'var(--wisp-muted)' : resolveToneStroke(tone);
          return (
            <g>
              <rect
                x={x + 5}
                y={y + 3}
                width={Math.min(
                  Math.max(24, w - 10),
                  Math.ceil(estimateTextWidth(plainTitle, 11.5, 'sans')) + (titleHasMath ? 16 : 8),
                )}
                height={16}
                rx={RADIUS_SM}
                fill="var(--wisp-bg)"
                fillOpacity={0.92}
              />
              {titleHasMath ? (
                <SvgRichLabel
                  x={x + 9}
                  y={y + 11}
                  width={Math.max(40, w - 18)}
                  height={20}
                  text={title}
                  fontSize={11.5}
                  fontWeight={600}
                  color={titleColor}
                  anchor="start"
                />
              ) : (
                <text
                  x={x + 9}
                  y={y + 11}
                  textAnchor="start"
                  dominantBaseline="central"
                  style={{
                    fill: titleColor,
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  {title}
                </text>
              )}
            </g>
          );
        })()}
    </g>
  );
}
