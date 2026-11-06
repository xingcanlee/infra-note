export interface LabelProps {
  x: number;
  y: number;
  text: string;
  tone?: 'q' | 'k' | 'v';
  anchor?: 'start' | 'middle' | 'end';
  muted?: boolean;
}

/** SVG 文本标签。 */
export default function Label({ x, y, text, tone, anchor = 'middle', muted = false }: LabelProps) {
  const fill = tone ? `var(--wisp-sem-${tone})` : muted ? 'var(--wisp-muted)' : 'var(--wisp-fg)';
  return (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" className="wisp-explainer__label" style={{ fill }}>
      {text}
    </text>
  );
}
