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
        const valKind = fontKindFor(m.value, 'mono');
        const lblFit = fitTextMetrics(m.label, innerW, 10.5, 10, 'sans');
        const valFit = fitTextMetrics(m.value, innerW, 12.5, 10, valKind);
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
      {title && (
        <g>
          <rect
            x={x + 5}
            y={y + 3}
            width={Math.min(
              Math.max(24, w - 10),
              Math.ceil(estimateTextWidth(title, 11.5, 'sans')) + 8,
            )}
            height={16}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
            fillOpacity={0.92}
          />
          <text
            x={x + 9}
            y={y + 11}
            textAnchor="start"
            dominantBaseline="central"
            style={{
              fill: tone === 'neutral' ? 'var(--wisp-muted)' : resolveToneStroke(tone),
              fontFamily: 'var(--wisp-font-sans)',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {title}
          </text>
        </g>
      )}
    </g>
  );
}
