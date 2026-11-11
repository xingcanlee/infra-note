/**
 * 站点自己的 SVG 原语，补充主题的 Stage / Matrix / Cell / Label。
 *
 * 只允许使用令牌颜色（Tone / var(--wisp-*)）。两篇以上文章用到的形状都应放进这里，
 * 而不是在各个讲解里各写一份（design/writing-guide.md §4.2）。
 */
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { TexLabel } from 'astro-wisp/explainers';
import { toneFill, toneStroke, type Tone } from 'astro-wisp/explainers/core';

/** 带标签的圆角盒子：流程图、层结构、模块。 */
export function Box({
  x,
  y,
  w,
  h,
  label,
  labelTex,
  sub,
  tone,
  active = false,
  dim = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** 用 KaTeX 渲染的盒内公式标签。 */
  labelTex?: string;
  sub?: string;
  tone: Tone;
  /** 当前步骤正在发生的盒子 */
  active?: boolean;
  /** 本步与它无关 */
  dim?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <g opacity={dim ? 0.38 : 1}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        style={{ fill: toneFill(tone), stroke: toneStroke(tone), strokeWidth: 1.25 }}
      />
      <motion.rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}
        style={{ fill: 'none', stroke: toneStroke('highlight'), strokeWidth: 2.5 }}
      />
      {labelTex ? (
        <TexLabel
          x={x + w / 2}
          y={sub ? y + h / 2 - 7 : y + h / 2}
          width={w - 12}
          height={22}
          tex={labelTex}
        />
      ) : (
        <text
          x={x + w / 2}
          y={sub ? y + h / 2 - 7 : y + h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="wisp-explainer__cell-text"
          style={{ fill: 'var(--wisp-fg)' }}
        >
          {label}
        </text>
      )}
      {sub && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 9}
          textAnchor="middle"
          dominantBaseline="central"
          className="wisp-explainer__label"
          style={{ fill: 'var(--wisp-muted)' }}
        >
          {sub}
        </text>
      )}
    </g>
  );
}

/** 箭头。实线为数据流，虚线为索引 / 控制流（design/writing-guide.md §4.3）。 */
export function Arrow({
  from,
  to,
  tone = 'slate',
  dashed = false,
  active = false,
  label,
  labelTex,
}: {
  from: [number, number];
  to: [number, number];
  tone?: Tone;
  dashed?: boolean;
  active?: boolean;
  label?: string;
  labelTex?: string;
}) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const id = `arrow-${tone}-${dashed ? 'd' : 's'}`;
  const mid: [number, number] = [(x1 + x2) / 2, (y1 + y2) / 2];
  return (
    <g opacity={active ? 1 : 0.55}>
      <defs>
        <marker
          id={id}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: toneStroke(tone) }} />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        markerEnd={`url(#${id})`}
        style={{
          stroke: toneStroke(tone),
          strokeWidth: active ? 2 : 1.25,
          strokeDasharray: dashed ? '4 3' : undefined,
        }}
      />
      {labelTex ? (
        <TexLabel x={mid[0]} y={mid[1] - 6} width={72} height={22} tex={labelTex} muted />
      ) : label ? (
        <text
          x={mid[0]}
          y={mid[1] - 6}
          textAnchor="middle"
          className="wisp-explainer__label"
          style={{ fill: 'var(--wisp-muted)' }}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** 中英文与公式混排的舞台标签；公式片段必须给显式宽度，避免 foreignObject 被裁掉。 */
export function MixedLabel({
  x,
  y,
  parts,
  tone,
  gap = 4,
}: {
  x: number;
  y: number;
  parts: Array<{ text: string; width?: number } | { tex: string; width: number }>;
  tone?: Tone;
  gap?: number;
}) {
  const partWidth = (part: (typeof parts)[number]) =>
    'tex' in part ? part.width : (part.width ?? part.text.length * 14);
  return (
    <g>
      {parts.map((part, i) => {
        const width = partWidth(part);
        const cursor = x + parts.slice(0, i).reduce((sum, item) => sum + partWidth(item) + gap, 0);
        const node =
          'tex' in part ? (
            <TexLabel
              key={i}
              x={cursor}
              y={y}
              width={width}
              height={22}
              tex={part.tex}
              tone={tone}
              anchor="start"
            />
          ) : (
            <text
              key={i}
              x={cursor}
              y={y}
              dominantBaseline="central"
              className="wisp-explainer__label"
              style={{ fill: tone ? toneStroke(tone) : 'var(--wisp-fg)' }}
            >
              {part.text}
            </text>
          );
        return node;
      })}
    </g>
  );
}

/** 水平条：显存账本、缓存宽度、时间占比等「谁更长」的对照。 */
export function Bar({
  x,
  y,
  w,
  h,
  label,
  value,
  tone,
  active = false,
}: {
  x: number;
  y: number;
  /** 已按比例算好的像素宽度 */
  w: number;
  h: number;
  label: string;
  /** 右侧显示的数值文本 */
  value: string;
  tone: Tone;
  active?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <g>
      <text
        x={x - 8}
        y={y + h / 2}
        textAnchor="end"
        dominantBaseline="central"
        className="wisp-explainer__label"
        style={{ fill: 'var(--wisp-fg)' }}
      >
        {label}
      </text>
      <motion.rect
        x={x}
        y={y}
        height={h}
        rx={3}
        initial={false}
        animate={{ width: Math.max(w, 1) }}
        transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
        style={{ fill: toneFill(tone), stroke: toneStroke(tone), strokeWidth: active ? 2 : 1 }}
      />
      {/* 文本 x 与 rect 宽度用同一时长/缓动动画，避免动画期间文字悬空在最终位置 */}
      <motion.text
        y={y + h / 2}
        initial={false}
        animate={{ x: x + Math.max(w, 1) + 8 }}
        transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
        dominantBaseline="central"
        className="wisp-explainer__label"
        style={{ fill: 'var(--wisp-muted)' }}
      >
        {value}
      </motion.text>
    </g>
  );
}

/** 图例：把颜色语义写在画面里，避免读者回头翻约定。 */
export function Legend({
  x,
  y,
  items,
  gap = 108,
}: {
  x: number;
  y: number;
  items: Array<{ tone: Tone; text: string }>;
  gap?: number;
}) {
  return (
    <g>
      {items.map((it, i) => (
        <g key={it.text} transform={`translate(${x + i * gap} ${y})`}>
          <rect
            x={0}
            y={-5}
            width={10}
            height={10}
            rx={2}
            style={{ fill: toneFill(it.tone), stroke: toneStroke(it.tone), strokeWidth: 1 }}
          />
          <text
            x={15}
            y={0}
            dominantBaseline="central"
            className="wisp-explainer__label"
            style={{ fill: 'var(--wisp-muted)' }}
          >
            {it.text}
          </text>
        </g>
      ))}
    </g>
  );
}

/** 一行小标题，用于给画面分区。 */
export function Caption({ x, y, text, tone }: { x: number; y: number; text: string; tone?: Tone }) {
  return (
    <text
      x={x}
      y={y}
      dominantBaseline="central"
      className="wisp-explainer__label"
      style={{ fill: tone ? toneStroke(tone) : 'var(--wisp-muted)' }}
    >
      {text}
    </text>
  );
}

/** 把若干元素整体平移，减少坐标算术。 */
export function Group({
  x,
  y,
  children,
  dim = false,
}: {
  x: number;
  y: number;
  children: ReactNode;
  dim?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={dim ? 0.38 : 1}>
      {children}
    </g>
  );
}
