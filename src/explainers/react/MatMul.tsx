import { useMemo, type ReactNode } from 'react';
import { matmul, type MatMulState } from '../core/algorithms/matmul';
import { formatNumber as f } from '../core/format';
import Player from './Player';
import Matrix, { CELL, LABEL_H, matrixHeight, matrixWidth } from './primitives/Matrix';
import Label from './primitives/Label';

export interface MatMulProps {
  a: number[][];
  b: number[][];
  title?: string;
}

const GAP = 28;
const PAD = 3; // 给描边留出空间，避免被 viewBox 裁切

/** 把 focus id（如 'a:1,0'）按矩阵名取出 "r,c" 键集合。 */
function pick(focus: string[] | undefined, m: string): Set<string> {
  const s = new Set<string>();
  for (const id of focus ?? []) if (id.startsWith(`${m}:`)) s.add(id.slice(2));
  return s;
}

function Formula({ s }: { s: MatMulState }): ReactNode {
  if (s.i === null || s.j === null) return <span className="wisp-explainer__muted">逐元素计算 C 的每个位置</span>;
  const { i, j } = s;
  const K = s.a[0].length;
  const cur = s.k ?? K - 1;
  const terms = Array.from({ length: K }, (_, k) => {
    const cls =
      k === cur && s.phase === 'multiply' ? 'is-current' : k > cur ? 'is-pending' : 'is-done';
    return (
      <span key={k}>
        {k > 0 && <span className={`wisp-explainer__op ${cls === 'is-pending' ? 'is-pending' : ''}`}> + </span>}
        <span className={`wisp-explainer__term ${cls}`}>{f(s.a[i][k])}×{f(s.b[k][j])}</span>
      </span>
    );
  });
  return (
    <>
      <span className="wisp-explainer__lhs">C[{i}][{j}]</span> = {terms} ={' '}
      <strong>{s.partial === null ? '' : f(s.partial)}</strong>
    </>
  );
}

function Scene({ s, focus }: { s: MatMulState; focus?: string[] }) {
  const m = s.a.length;
  const K = s.a[0].length;
  const n = s.b[0].length;

  const wA = matrixWidth(s.a);
  const wB = matrixWidth(s.b);
  const hB = matrixHeight(s.b);
  // 经典布局：B 在右上，A 在左下，C 在右下
  const bx = wA + GAP, by = 0;
  const ay = LABEL_H + hB + GAP;
  const vbW = wA + GAP + wB + 2 * PAD;
  const vbH = ay + LABEL_H + m * CELL + 2 * PAD;

  const softA = new Set<string>(), softB = new Set<string>();
  if (s.i !== null && s.j !== null) {
    for (let k = 0; k < K; k++) { softA.add(`${s.i},${k}`); softB.add(`${k},${s.j}`); }
  }

  return (
    <div className="wisp-explainer__scroll">
      <svg
        className="wisp-explainer__svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        style={{ minWidth: vbW * 0.72, maxWidth: vbW * 1.6 }}
        role="group"
        aria-label={`矩阵乘法 A(${m}×${K}) × B(${K}×${n}) = C(${m}×${n})`}
      >
        <g transform={`translate(${PAD} ${PAD})`}>
        <Matrix x={bx} y={by} label={`B  ${K}×${n}`} values={s.b} tone="k" highlight={pick(focus, 'b')} soft={softB} />
        <Matrix x={0} y={ay} label={`A  ${m}×${K}`} values={s.a} tone="q" highlight={pick(focus, 'a')} soft={softA} />
        <Matrix x={bx} y={ay} label={`C  ${m}×${n}`} values={s.c} tone="v" highlight={pick(focus, 'c')} />
        <Label x={wA / 2} y={LABEL_H + hB / 2} text="C = A × B" muted />
        </g>
      </svg>
    </div>
  );
}

export default function MatMul({ a, b, title }: MatMulProps) {
  const steps = useMemo(() => matmul(a, b), [a, b]);
  return (
    <figure className="wisp-wide wisp-explainer">
      {title && <figcaption className="wisp-explainer__title">{title}</figcaption>}
      <Player steps={steps} label={title ? `${title}：矩阵乘法讲解` : '矩阵乘法讲解'}>
        {(step) => (
          <>
            <Scene s={step.state} focus={step.focus} />
            <div className="wisp-explainer__formula" aria-hidden="true">
              <Formula s={step.state} />
            </div>
          </>
        )}
      </Player>
    </figure>
  );
}
