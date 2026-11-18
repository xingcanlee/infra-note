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

export interface HeatmapMatrixProps {
  x: number;
  y: number;
  values: readonly (readonly (number | null)[])[];
  tone: AnyTone;
  cellW?: number;
  cellH?: number;
  gap?: number;
  min?: number;
  max?: number;
  format?: (v: number, r: number, c: number) => string;
  /** masks[r][c] 为 true 的格子按 mask（暗灰斜纹/占位符）渲染 */
  masks?: readonly (readonly boolean[])[];
  maskText?: string;
  /** 强高亮选中格子，键为 `${r},${c}` */
  selected?: ReadonlySet<string>;
  selectedTone?: AnyTone;
  /** 弱高亮（整行/整列）格子，键为 `${r},${c}` */
  softSelected?: ReadonlySet<string>;
  rowLabels?: readonly string[];
  colLabels?: readonly string[];
  rowSums?: readonly string[];
  colSums?: readonly string[];
  rowLabelW?: number;
  title?: string;
  /** 是否显示 5 档离散色阶图例（零 CSS 渐变） */
  showLegend?: boolean;
  fontSize?: number;
}

const STRONG_STROKE = 2;
export const HEAT_ALPHA_BASE = 0.04;
export const HEAT_ALPHA_RANGE = 0.44;
export const DARK_HEAT_STROKE_WEIGHT = 0.48;

/**
 * 复用二维数值热力与稀疏掩码矩阵：
 * - 支持方格或矩形单元格
 * - 支持热力透明度映射（Cell fill + stroke 叠加层）
 * - 支持屏蔽区暗色格（mask）、选中块粗边框高亮、边际行和/列和标注
 */
export default function HeatmapMatrix({
  x,
  y,
  values,
  tone,
  cellW = 42,
  cellH,
  gap = 4,
  min,
  max,
  format = (v) => formatNumber(v, 2),
  masks,
  maskText = '—',
  selected,
  selectedTone = 'highlight',
  softSelected,
  rowLabels,
  colLabels,
  rowSums,
  colSums,
  rowLabelW = 42,
  title,
  showLegend = false,
  fontSize = 12,
}: HeatmapMatrixProps) {
  const { highlightTransition } = useDiagramMotion();
  const ch = cellH ?? cellW;
  const rows = values.length;
  const cols = values[0]?.length ?? 0;

  let lo = min ?? Infinity;
  let hi = max ?? -Infinity;
  if (min === undefined || max === undefined) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = values[r]?.[c];
        if (v !== null && v !== undefined && !masks?.[r]?.[c]) {
          if (min === undefined) lo = Math.min(lo, v);
          if (max === undefined) hi = Math.max(hi, v);
        }
      }
    }
  }
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi) || hi <= lo) hi = lo + 1;

  const leftPad = rowLabels ? rowLabelW : 0;
  const topPad = (title ? 20 : 0) + (colLabels ? 18 : 0);
  const gridX = x + leftPad;
  const gridY = y + topPad;
  const gridW = cols * (cellW + gap) - gap;
  const gridH = rows * (ch + gap) - gap;

  const baseFill = resolveToneFill(tone);
  const baseStroke = resolveToneStroke(tone);
  const heatOverlayFill = `light-dark(${baseStroke}, color-mix(in srgb, ${baseStroke} ${Math.round(DARK_HEAT_STROKE_WEIGHT * 100)}%, ${baseFill}))`;
  const hiFill = resolveToneFill(selectedTone);
  const hiStroke = resolveToneStroke(selectedTone);

  return (
    <g>
      {title && (
        <text
          x={gridX}
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

      {showLegend && (
        <g>
          {[0.05, 0.25, 0.5, 0.75, 1.0].map((lv, idx) => {
            const lx = gridX + gridW - (5 - idx) * 14;
            return (
              <g key={lv}>
                <rect
                  x={lx}
                  y={y + 2}
                  width={11}
                  height={11}
                  rx={RADIUS_SM}
                  fill={baseFill}
                  stroke={baseStroke}
                  strokeWidth={1}
                />
                <rect
                  x={lx}
                  y={y + 2}
                  width={11}
                  height={11}
                  rx={RADIUS_SM}
                  fill={baseStroke}
                  style={{ fill: heatOverlayFill }}
                  fillOpacity={HEAT_ALPHA_BASE + 0.42 * lv}
                />
              </g>
            );
          })}
          <text
            x={gridX + gridW - 76}
            y={y + 7.5}
            textAnchor="end"
            dominantBaseline="central"
            style={{
              fill: 'var(--wisp-muted)',
              fontFamily: 'var(--wisp-font-sans)',
              fontSize: 10,
            }}
          >
            低→高
          </text>
        </g>
      )}

      {colLabels &&
        colLabels.map((lbl, c) => (
          <text
            key={`cl-${c}`}
            x={gridX + c * (cellW + gap) + cellW / 2}
            y={gridY - 9}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fill: 'var(--wisp-muted)',
              fontFamily: fontVarFor(lbl, 'mono'),
              fontSize: 11,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lbl}
          </text>
        ))}

      {rowLabels &&
        rowLabels.map((lbl, r) => (
          <text
            key={`rl-${r}`}
            x={gridX - 7}
            y={gridY + r * (ch + gap) + ch / 2}
            textAnchor="end"
            dominantBaseline="central"
            style={{
              fill: 'var(--wisp-muted)',
              fontFamily: fontVarFor(lbl, 'mono'),
              fontSize: 11,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lbl}
          </text>
        ))}

      {values.map((row, r) =>
        row.map((val, c) => {
          const cx = gridX + c * (cellW + gap);
          const cy = gridY + r * (ch + gap);
          const key = `${r},${c}`;
          const isMasked = Boolean(masks?.[r]?.[c]);
          const isNull = val === null || val === undefined;
          const isSel = selected?.has(key) ?? false;
          const isSoft = softSelected?.has(key) ?? false;

          const heat = !isMasked && !isNull ? Math.max(0, Math.min(1, (val - lo) / (hi - lo))) : 0;

          const text = isMasked ? maskText : isNull ? '·' : format(val, r, c);

          return (
            <g key={key}>
              <rect
                x={cx}
                y={cy}
                width={cellW}
                height={ch}
                rx={RADIUS_SM}
                fill={isMasked ? resolveToneFill('mask') : baseFill}
                stroke={isMasked ? resolveToneStroke('mask') : baseStroke}
                strokeWidth={1}
                fillOpacity={isNull && !isMasked ? 0.35 : 1}
              />
              {!isMasked && !isNull && (
                <motion.rect
                  x={cx}
                  y={cy}
                  width={cellW}
                  height={ch}
                  rx={RADIUS_SM}
                  initial={false}
                  animate={{ fillOpacity: HEAT_ALPHA_BASE + HEAT_ALPHA_RANGE * heat }}
                  transition={highlightTransition}
                  fill={baseStroke}
                  style={{ fill: heatOverlayFill }}
                />
              )}
              {isSoft && !isSel && (
                <rect
                  x={cx}
                  y={cy}
                  width={cellW}
                  height={ch}
                  rx={RADIUS_SM}
                  fill={baseStroke}
                  style={{ fill: heatOverlayFill }}
                  fillOpacity={0.18}
                />
              )}
              <motion.rect
                x={cx + STRONG_STROKE / 2}
                y={cy + STRONG_STROKE / 2}
                width={cellW - STRONG_STROKE}
                height={ch - STRONG_STROKE}
                rx={RADIUS_SM}
                initial={false}
                animate={{ opacity: isSel ? 1 : 0 }}
                transition={highlightTransition}
                fill={hiFill}
                fillOpacity={0.28}
                stroke={hiStroke}
                strokeWidth={STRONG_STROKE}
              />
              <text
                x={cx + cellW / 2}
                y={cy + ch / 2}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: isMasked || isNull ? 'var(--wisp-muted)' : 'var(--wisp-fg)',
                  fontFamily: fontVarFor(text, 'mono'),
                  fontSize,
                  fontWeight: isSel ? 600 : 500,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {text}
              </text>
            </g>
          );
        }),
      )}

      {rowSums &&
        rowSums.map((sumStr, r) => (
          <text
            key={`rs-${r}`}
            x={gridX + gridW + 8}
            y={gridY + r * (ch + gap) + ch / 2}
            textAnchor="start"
            dominantBaseline="central"
            style={{
              fill: 'var(--wisp-fg)',
              fontFamily: 'var(--wisp-font-mono)',
              fontSize: 11,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {sumStr}
          </text>
        ))}

      {colSums &&
        colSums.map((sumStr, c) => (
          <text
            key={`cs-${c}`}
            x={gridX + c * (cellW + gap) + cellW / 2}
            y={gridY + gridH + 12}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fill: 'var(--wisp-fg)',
              fontFamily: 'var(--wisp-font-mono)',
              fontSize: 11,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {sumStr}
          </text>
        ))}
    </g>
  );
}
