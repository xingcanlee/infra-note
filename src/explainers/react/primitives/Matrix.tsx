import { formatNumber } from '../../core/format';
import Cell, { type Tone } from './Cell';
import Label from './Label';

export const CELL = 44;
export const LABEL_H = 24;

export interface MatrixProps {
  x: number;
  y: number;
  label: string;
  values: (number | null)[][];
  tone: Tone;
  /** 强高亮的单元，键为 "r,c" */
  highlight?: ReadonlySet<string>;
  /** 弱高亮（整行 / 整列），键为 "r,c" */
  soft?: ReadonlySet<string>;
}

export const matrixWidth = (values: unknown[][]) => values[0].length * CELL;
export const matrixHeight = (values: unknown[][]) => values.length * CELL;

/** 带标签的矩阵。(x, y) 是标签左上角，矩阵本体在标签下方 LABEL_H 处。 */
export default function Matrix({ x, y, label, values, tone, highlight, soft }: MatrixProps) {
  const w = matrixWidth(values);
  return (
    <g role="img" aria-label={`${label}：${values.length} 行 ${values[0].length} 列`}>
      <Label x={x + w / 2} y={y + LABEL_H / 2} text={label} tone={tone} />
      {values.map((row, r) =>
        row.map((v, c) => {
          const key = `${r},${c}`;
          return (
            <Cell
              key={key}
              x={x + c * CELL}
              y={y + LABEL_H + r * CELL}
              size={CELL - 4}
              text={v === null ? '·' : formatNumber(v)}
              empty={v === null}
              tone={tone}
              state={highlight?.has(key) ? 'strong' : soft?.has(key) ? 'soft' : 'none'}
            />
          );
        }),
      )}
    </g>
  );
}
