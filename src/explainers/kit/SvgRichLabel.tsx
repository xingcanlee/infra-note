import { RichText, hasInlineMath, plainInlineMath } from 'astro-wisp/explainers';
import { estimateTextWidth, fontVarFor } from './motion';

export interface SvgRichLabelProps {
  x: number;
  y: number;
  text: string;
  width?: number;
  height?: number;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
  family?: 'sans' | 'mono';
  className?: string;
}

const JUSTIFY = { start: 'flex-start', middle: 'center', end: 'flex-end' } as const;
const TEXT_ANCHOR = { start: 'start', middle: 'middle', end: 'end' } as const;

/**
 * 支持行内 KaTeX (`$...$`) 的 SVG 文本标签：
 * - 纯文本直接输出原生 `<text>`，零 `<foreignObject>` 开销；
 * - 含 `$...$` 时自动切换 `<foreignObject>` + `<RichText>` 渲染公式。
 */
export default function SvgRichLabel({
  x,
  y,
  text,
  width,
  height,
  fontSize = 12,
  fontWeight = 500,
  color = 'var(--wisp-fg)',
  anchor = 'middle',
  family = 'sans',
}: SvgRichLabelProps) {
  if (!hasInlineMath(text)) {
    return (
      <text
        x={x}
        y={y}
        textAnchor={TEXT_ANCHOR[anchor]}
        dominantBaseline="central"
        style={{
          fill: color,
          fontFamily: family === 'mono' ? fontVarFor(text, 'mono') : 'var(--wisp-font-sans)',
          fontSize,
          fontWeight,
          fontVariantNumeric: family === 'mono' ? 'tabular-nums' : undefined,
        }}
      >
        {text}
      </text>
    );
  }

  const plain = plainInlineMath(text);
  const estW = width ?? Math.max(48, Math.ceil(estimateTextWidth(plain, fontSize, family)) + 28);
  const h = height ?? Math.max(24, Math.ceil(fontSize * 1.95));
  const left = anchor === 'middle' ? x - estW / 2 : anchor === 'end' ? x - estW : x;

  return (
    <foreignObject
      x={left}
      y={y - h / 2}
      width={estW}
      height={h}
      style={{ overflow: 'visible', pointerEvents: 'none' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: JUSTIFY[anchor],
          width: '100%',
          height: '100%',
          color,
          fontFamily: family === 'mono' ? 'var(--wisp-font-mono)' : 'var(--wisp-font-sans)',
          fontSize,
          fontWeight,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
        }}
      >
        <RichText text={text} />
      </div>
    </foreignObject>
  );
}
