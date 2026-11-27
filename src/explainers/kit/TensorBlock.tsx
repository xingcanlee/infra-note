import { TexLabel, hasInlineMath, plainInlineMath } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
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
  useDiagramMotion,
  type AnyTone,
} from './motion';

export interface TensorSplit {
  /** 分割线位置比例（0 < ratio < 1） */
  ratio: number;
  /** 'x' 为纵向虚线切分列/通道，'y' 为横向虚线切分行/头组 */
  axis?: 'x' | 'y';
  /** 虚线旁或第一分区的短标注 */
  leftLabel?: string;
  rightLabel?: string;
}

export interface TensorBlockProps {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: AnyTone;
  name?: string;
  texName?: string;
  texWidth?: number;
  /** 张量维度标注，固定单行 mono tabular-nums，例如 '[B, S, D]' */
  shape?: string;
  detail?: string;
  /** 'above' 将 name 放块上方、shape 放块下方；'inside' 放块内（适合足够高大的矩阵块） */
  labelMode?: 'above' | 'inside';
  /** 3D 堆叠层数（1=2D，2/3=多头或分块堆叠实体感） */
  stack?: 1 | 2 | 3;
  /** 切分虚线定义 */
  splits?: readonly TensorSplit[];
  /** 可选内部网格线数量（体现块内分片矩阵网格） */
  subgrid?: { rows?: number; cols?: number };
  active?: boolean;
  muted?: boolean;
  dashed?: boolean;
  visible?: boolean;
  dimmed?: boolean;
  fillOpacity?: number;
}

/**
 * 张量结构基础构件：
 * - 长宽比例与位置支持 Motion 连续插值形变
 * - 切分处自动绘制虚线，多维张量支持 3D 堆叠背页
 * - 维度使用 JetBrains Mono + tabular-nums，与连线零重叠
 */
export default function TensorBlock({
  x,
  y,
  w,
  h,
  tone = 'neutral',
  name,
  texName,
  texWidth = 64,
  shape,
  detail,
  labelMode = 'above',
  stack = 1,
  splits,
  subgrid,
  active = false,
  muted = false,
  dashed = false,
  visible = true,
  dimmed = false,
  fillOpacity,
}: TensorBlockProps) {
  const { stepTransition } = useDiagramMotion();
  const fill = muted ? 'var(--wisp-surface)' : resolveToneFill(tone);
  const stroke = muted ? 'var(--wisp-muted)' : resolveToneStroke(tone);
  const strokeWidth = active ? 2 : tone === 'neutral' ? 1 : 1.25;
  const effectiveAlpha = fillOpacity ?? (muted ? 0.55 : 1);
  const groupOpacity = !visible ? 0.14 : dimmed ? 0.34 : muted ? 0.62 : 1;

  const stackLayers = stack > 1 ? Array.from({ length: stack - 1 }, (_, i) => stack - 1 - i) : [];

  return (
    <motion.g initial={false} animate={{ x, y, opacity: groupOpacity }} transition={stepTransition}>
      {stackLayers.map((layerIdx) => (
        <motion.rect
          key={layerIdx}
          initial={false}
          x={layerIdx * 4}
          y={-layerIdx * 4}
          animate={{ width: w, height: h }}
          transition={stepTransition}
          rx={RADIUS}
          fill="var(--wisp-surface)"
          stroke={stroke}
          strokeWidth={1}
          opacity={0.78}
        />
      ))}

      <motion.rect
        initial={false}
        x={0}
        y={0}
        animate={{ width: w, height: h, fillOpacity: effectiveAlpha, strokeWidth }}
        transition={stepTransition}
        rx={RADIUS}
        fill={fill}
        stroke={stroke}
        strokeDasharray={dashed ? '4 3' : undefined}
      />

      {subgrid?.cols &&
        subgrid.cols > 1 &&
        Array.from({ length: subgrid.cols - 1 }, (_, idx) => {
          const gx = ((idx + 1) * w) / subgrid.cols!;
          return (
            <line
              key={`c${idx}`}
              x1={gx}
              y1={2}
              x2={gx}
              y2={h - 2}
              stroke={stroke}
              strokeOpacity={0.28}
              strokeWidth={1}
            />
          );
        })}

      {subgrid?.rows &&
        subgrid.rows > 1 &&
        Array.from({ length: subgrid.rows - 1 }, (_, idx) => {
          const gy = ((idx + 1) * h) / subgrid.rows!;
          return (
            <line
              key={`r${idx}`}
              x1={2}
              y1={gy}
              x2={w - 2}
              y2={gy}
              stroke={stroke}
              strokeOpacity={0.28}
              strokeWidth={1}
            />
          );
        })}

      {splits?.map((sp, i) => {
        const axis = sp.axis ?? 'x';
        if (axis === 'x') {
          const leftKind = sp.leftLabel ? fontKindFor(sp.leftLabel, 'mono') : 'mono';
          const rightKind = sp.rightLabel ? fontKindFor(sp.rightLabel, 'mono') : 'mono';
          const minLeftW = sp.leftLabel
            ? Math.max(38, Math.ceil(estimateTextWidth(sp.leftLabel, 10, leftKind)) + 8)
            : 0;
          const minRightW = sp.rightLabel
            ? Math.max(38, Math.ceil(estimateTextWidth(sp.rightLabel, 10, rightKind)) + 8)
            : 0;
          const rawSx = w * sp.ratio;
          const sx =
            (sp.leftLabel || sp.rightLabel) && minLeftW + minRightW <= w
              ? Math.max(minLeftW, Math.min(w - minRightW, rawSx))
              : rawSx;
          const lw = sx;
          const rw = w - sx;

          const renderSplitLabel = (
            text: string,
            partX: number,
            partW: number,
            side: 'left' | 'right',
            kind: 'mono' | 'sans',
          ) => {
            if (partW >= 30 && h >= 22) {
              const fit = fitTextMetrics(text, partW - 6, 10.5, 10, kind);
              return (
                <text
                  x={partX + partW / 2}
                  y={h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  textLength={fit.textLength}
                  lengthAdjust={fit.textLength ? 'spacingAndGlyphs' : undefined}
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: fontVarFor(text, 'mono'),
                    fontSize: fit.fontSize,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {text}
                </text>
              );
            }
            const badgeW = Math.max(32, Math.ceil(estimateTextWidth(text, 10, kind)) + 10);
            const anchorX = partX + partW / 2;
            const badgeY = side === 'left' ? -16 : h + 16;
            const tickY0 = side === 'left' ? 0 : h;
            const tickY1 = side === 'left' ? badgeY + 7 : badgeY - 7;
            return (
              <g>
                <line
                  x1={anchorX}
                  y1={tickY0}
                  x2={anchorX}
                  y2={tickY1}
                  stroke={stroke}
                  strokeWidth={1}
                />
                <rect
                  x={anchorX - badgeW / 2}
                  y={badgeY - 7}
                  width={badgeW}
                  height={14}
                  rx={RADIUS_SM}
                  fill="var(--wisp-bg)"
                  stroke={stroke}
                  strokeWidth={1}
                />
                <text
                  x={anchorX}
                  y={badgeY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: fontVarFor(text, 'mono'),
                    fontSize: 10,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {text}
                </text>
              </g>
            );
          };

          return (
            <g key={i}>
              <motion.line
                initial={false}
                animate={{ x1: sx, x2: sx, y2: h - 1 }}
                transition={stepTransition}
                y1={1}
                stroke={stroke}
                strokeWidth={1.25}
                strokeDasharray="4 3"
              />
              {sp.leftLabel && renderSplitLabel(sp.leftLabel, 0, lw, 'left', leftKind)}
              {sp.rightLabel && renderSplitLabel(sp.rightLabel, sx, rw, 'right', rightKind)}
            </g>
          );
        }
        const sy = h * sp.ratio;
        const th = sy;
        const bh = h - sy;
        return (
          <g key={i}>
            <motion.line
              initial={false}
              animate={{ y1: sy, y2: sy, x2: w - 1 }}
              transition={stepTransition}
              x1={1}
              stroke={stroke}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            {sp.leftLabel && th >= 18 && w >= 36 && (
              <text
                x={w / 2}
                y={th / 2}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-fg)',
                  fontFamily: fontVarFor(sp.leftLabel, 'mono'),
                  fontSize: 10.5,
                }}
              >
                {sp.leftLabel}
              </text>
            )}
            {sp.rightLabel && bh >= 18 && w >= 36 && (
              <text
                x={w / 2}
                y={sy + bh / 2}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-fg)',
                  fontFamily: fontVarFor(sp.rightLabel, 'mono'),
                  fontSize: 10.5,
                }}
              >
                {sp.rightLabel}
              </text>
            )}
          </g>
        );
      })}

      {labelMode === 'above' ? (
        <>
          {texName ? (
            <TexLabel
              x={w / 2}
              y={-12 - (stack - 1) * 4}
              width={texWidth}
              height={22}
              tex={texName}
              tone={tone === 'neutral' ? undefined : tone}
            />
          ) : (
            name &&
            (hasInlineMath(name) ? (
              <SvgRichLabel
                x={w / 2}
                y={-11 - (stack - 1) * 4}
                width={Math.max(w + 24, 96)}
                height={22}
                text={name}
                fontSize={12.5}
                fontWeight={600}
              />
            ) : (
              <text
                x={w / 2}
                y={-10 - (stack - 1) * 4}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-fg)',
                  fontFamily: 'var(--wisp-font-sans)',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {name}
              </text>
            ))
          )}
          {shape &&
            (hasInlineMath(shape) ? (
              <SvgRichLabel
                x={w / 2}
                y={h + 11}
                width={Math.max(w + 24, 96)}
                height={20}
                text={shape}
                fontSize={11}
                color="var(--wisp-muted)"
                family={fontKindFor(plainInlineMath(shape), 'mono')}
              />
            ) : (
              <text
                x={w / 2}
                y={h + 11}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-muted)',
                  fontFamily: fontVarFor(shape, 'mono'),
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {shape}
              </text>
            ))}
          {detail &&
            (hasInlineMath(detail) ? (
              <SvgRichLabel
                x={w / 2}
                y={h + (shape ? 24 : 11)}
                width={Math.max(w + 24, 96)}
                height={20}
                text={detail}
                fontSize={10.5}
                color="var(--wisp-muted)"
                family={fontKindFor(plainInlineMath(detail), 'mono')}
              />
            ) : (
              <text
                x={w / 2}
                y={h + (shape ? 24 : 11)}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-muted)',
                  fontFamily: fontVarFor(detail, 'mono'),
                  fontSize: 10.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {detail}
              </text>
            ))}
        </>
      ) : (
        <>
          {name &&
            (hasInlineMath(name) ? (
              <SvgRichLabel
                x={w / 2}
                y={h / 2 - (shape ? 8 : 0)}
                width={Math.max(24, w - 6)}
                height={20}
                text={name}
                fontSize={12.5}
                fontWeight={600}
              />
            ) : (
              (() => {
                const nf = fitTextMetrics(name, Math.max(20, w - 8), 12.5, 10, 'sans');
                return (
                  <text
                    x={w / 2}
                    y={h / 2 - (shape ? 8 : 0)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    textLength={nf.textLength}
                    lengthAdjust={nf.textLength ? 'spacingAndGlyphs' : undefined}
                    style={{
                      fill: 'var(--wisp-fg)',
                      fontFamily: 'var(--wisp-font-sans)',
                      fontSize: nf.fontSize,
                      fontWeight: 600,
                    }}
                  >
                    {name}
                  </text>
                );
              })()
            ))}
          {shape &&
            (hasInlineMath(shape) ? (
              <SvgRichLabel
                x={w / 2}
                y={h / 2 + (name ? 9 : 0)}
                width={Math.max(24, w - 6)}
                height={18}
                text={shape}
                fontSize={11}
                color="var(--wisp-muted)"
                family={fontKindFor(plainInlineMath(shape), 'mono')}
              />
            ) : (
              (() => {
                const shapeKind = fontKindFor(shape, 'mono');
                const sf = fitTextMetrics(shape, Math.max(20, w - 8), 11, 10, shapeKind);
                return (
                  <text
                    x={w / 2}
                    y={h / 2 + (name ? 9 : 0)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    textLength={sf.textLength}
                    lengthAdjust={sf.textLength ? 'spacingAndGlyphs' : undefined}
                    style={{
                      fill: 'var(--wisp-muted)',
                      fontFamily: fontVarFor(shape, 'mono'),
                      fontSize: sf.fontSize,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {shape}
                  </text>
                );
              })()
            ))}
        </>
      )}
    </motion.g>
  );
}
