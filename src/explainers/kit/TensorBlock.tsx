import { TexLabel } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  RADIUS,
  fitTextMetrics,
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
  fillOpacity?: number;
}

/**
 * 张量实体化基础构件：
 * - 长宽比例真实映射张量尺寸
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
  fillOpacity,
}: TensorBlockProps) {
  const { stepTransition } = useDiagramMotion();
  const fill = muted ? 'var(--wisp-surface)' : resolveToneFill(tone);
  const stroke = muted ? 'var(--wisp-muted)' : resolveToneStroke(tone);
  const strokeWidth = active ? 2.25 : tone === 'neutral' ? 1 : 1.25;
  const effectiveAlpha = fillOpacity ?? (muted ? 0.55 : 1);

  const stackLayers = stack > 1 ? Array.from({ length: stack - 1 }, (_, i) => stack - 1 - i) : [];

  return (
    <motion.g initial={false} animate={{ opacity: muted ? 0.62 : 1 }} transition={stepTransition}>
      {stackLayers.map((layerIdx) => (
        <rect
          key={layerIdx}
          x={x + layerIdx * 4}
          y={y - layerIdx * 4}
          width={w}
          height={h}
          rx={RADIUS}
          fill="var(--wisp-surface)"
          stroke={stroke}
          strokeWidth={1}
          opacity={0.78}
        />
      ))}

      <motion.rect
        initial={false}
        animate={{ x, y, width: w, height: h }}
        transition={stepTransition}
        rx={RADIUS}
        fill={fill}
        fillOpacity={effectiveAlpha}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dashed ? '4 3' : undefined}
      />

      {subgrid?.cols &&
        subgrid.cols > 1 &&
        Array.from({ length: subgrid.cols - 1 }, (_, idx) => {
          const gx = x + ((idx + 1) * w) / subgrid.cols!;
          return (
            <line
              key={`c${idx}`}
              x1={gx}
              y1={y + 2}
              x2={gx}
              y2={y + h - 2}
              stroke={stroke}
              strokeOpacity={0.28}
              strokeWidth={0.85}
            />
          );
        })}

      {subgrid?.rows &&
        subgrid.rows > 1 &&
        Array.from({ length: subgrid.rows - 1 }, (_, idx) => {
          const gy = y + ((idx + 1) * h) / subgrid.rows!;
          return (
            <line
              key={`r${idx}`}
              x1={x + 2}
              y1={gy}
              x2={x + w - 2}
              y2={gy}
              stroke={stroke}
              strokeOpacity={0.28}
              strokeWidth={0.85}
            />
          );
        })}

      {splits?.map((sp, i) => {
        const axis = sp.axis ?? 'x';
        if (axis === 'x') {
          const sx = x + w * sp.ratio;
          const lw = sx - x;
          const rw = x + w - sx;
          return (
            <g key={i}>
              <line
                x1={sx}
                y1={y + 1}
                x2={sx}
                y2={y + h - 1}
                stroke={stroke}
                strokeWidth={1.35}
                strokeDasharray="4 3"
              />
              {sp.leftLabel &&
                lw >= 30 &&
                h >= 22 &&
                (() => {
                  const lf = fitTextMetrics(sp.leftLabel, lw - 6, 10.5, 7.5, 'mono');
                  return (
                    <text
                      x={x + lw / 2}
                      y={y + h / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      textLength={lf.textLength}
                      lengthAdjust={lf.textLength ? 'spacingAndGlyphs' : undefined}
                      style={{
                        fill: 'var(--wisp-fg)',
                        fontFamily: 'var(--wisp-font-mono)',
                        fontSize: lf.fontSize,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {sp.leftLabel}
                    </text>
                  );
                })()}
              {sp.rightLabel &&
                rw >= 30 &&
                h >= 22 &&
                (() => {
                  const rf = fitTextMetrics(sp.rightLabel, rw - 6, 10.5, 7.5, 'mono');
                  return (
                    <text
                      x={sx + rw / 2}
                      y={y + h / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      textLength={rf.textLength}
                      lengthAdjust={rf.textLength ? 'spacingAndGlyphs' : undefined}
                      style={{
                        fill: 'var(--wisp-fg)',
                        fontFamily: 'var(--wisp-font-mono)',
                        fontSize: rf.fontSize,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {sp.rightLabel}
                    </text>
                  );
                })()}
            </g>
          );
        }
        const sy = y + h * sp.ratio;
        const th = sy - y;
        const bh = y + h - sy;
        return (
          <g key={i}>
            <line
              x1={x + 1}
              y1={sy}
              x2={x + w - 1}
              y2={sy}
              stroke={stroke}
              strokeWidth={1.35}
              strokeDasharray="4 3"
            />
            {sp.leftLabel && th >= 18 && w >= 36 && (
              <text
                x={x + w / 2}
                y={y + th / 2}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-fg)',
                  fontFamily: 'var(--wisp-font-mono)',
                  fontSize: 10.5,
                }}
              >
                {sp.leftLabel}
              </text>
            )}
            {sp.rightLabel && bh >= 18 && w >= 36 && (
              <text
                x={x + w / 2}
                y={sy + bh / 2}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-fg)',
                  fontFamily: 'var(--wisp-font-mono)',
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
              x={x + w / 2}
              y={y - 12 - (stack - 1) * 4}
              width={texWidth}
              height={22}
              tex={texName}
              tone={tone === 'neutral' ? undefined : tone}
            />
          ) : (
            name && (
              <text
                x={x + w / 2}
                y={y - 10 - (stack - 1) * 4}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: active ? stroke : 'var(--wisp-fg)',
                  fontFamily: 'var(--wisp-font-sans)',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {name}
              </text>
            )
          )}
          {shape && (
            <text
              x={x + w / 2}
              y={y + h + 11}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {shape}
            </text>
          )}
          {detail && (
            <text
              x={x + w / 2}
              y={y + h + (shape ? 24 : 11)}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: stroke,
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 10.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {detail}
            </text>
          )}
        </>
      ) : (
        <>
          {name &&
            (() => {
              const nf = fitTextMetrics(name, Math.max(20, w - 8), 12.5, 8, 'sans');
              return (
                <text
                  x={x + w / 2}
                  y={y + h / 2 - (shape ? 8 : 0)}
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
            })()}
          {shape &&
            (() => {
              const sf = fitTextMetrics(shape, Math.max(20, w - 8), 11, 7.5, 'mono');
              return (
                <text
                  x={x + w / 2}
                  y={y + h / 2 + (name ? 9 : 0)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  textLength={sf.textLength}
                  lengthAdjust={sf.textLength ? 'spacingAndGlyphs' : undefined}
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: sf.fontSize,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {shape}
                </text>
              );
            })()}
        </>
      )}
    </motion.g>
  );
}
