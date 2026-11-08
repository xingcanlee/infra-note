/**
 * MLA 数据流动画：hidden state → 共享 latent（缓存这个）→ 按 head 上投影出 K/V。
 *
 * 用在：DS 04、DS 05。
 */
import { useMemo } from 'react';
import { Cell, Explainer, Label, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { mlaFlow, type MlaState } from '../core/mla';
import { Arrow, Caption, Legend } from './primitives';

export interface MLAFlowProps {
  tokens?: string[];
  title?: string;
}

const S = 32; // 格子边长
const ROW = 38;
const TOP = 30;
const X_X = 56; // hidden state 列
const X_C = 186; // latent 列
const X_PE = 320; // 位置分支列
const X_KV = 430; // 重建出的 K/V 列

/** 一行小格子。 */
function Row({
  x,
  y,
  values,
  tone,
  hot,
  prefix,
  idx,
}: {
  x: number;
  y: number;
  values: Array<number | null>;
  tone: 'q' | 'v' | 'k' | 'weight';
  hot: ReadonlySet<string>;
  prefix: string;
  idx: number;
}) {
  return (
    <>
      {values.map((val, i) => (
        <Cell
          key={`${prefix}-${idx}-${i}`}
          x={x + i * S}
          y={y}
          size={S - 3}
          tone={tone}
          empty={val === null}
          state={hot.has(`${idx},${i}`) ? 'strong' : 'none'}
          text={val === null ? '·' : f(val)}
        />
      ))}
    </>
  );
}

function Scene({ s, focus }: { s: MlaState; focus?: string[] }) {
  const l = s.tokens.length;
  const nH = s.k.length;
  const hotC = focusOf(focus, 'c');
  const hotPe = focusOf(focus, 'pe');
  const hotK = focusOf(focus, 'k');
  const hotV = focusOf(focus, 'v');
  const hotX = focusOf(focus, 'x');

  const dC = s.c[0].length;
  const dR = s.pe[0].length;
  const dK = s.k[0].length;
  const rows = Math.max(l, nH);
  const w = X_KV + (dK + s.v[0].length) * S + 70;
  const h = TOP + rows * ROW + 62;

  return (
    <Stage width={w} height={h} label={`MLA 数据流：${l} 个 token 压成 ${dC} 维共享 latent`}>
      <Caption x={X_X} y={12} text="hidden state" tone="q" />
      <Caption x={X_C} y={12} text={`共享 latent (${dC})`} tone="v" />
      <Caption x={X_PE} y={12} text={`位置 (${dR})`} tone="k" />
      <Caption x={X_KV} y={12} text="读取时按 head 重建 K / V" tone="weight" />

      {/* 缓存框：强调缓存里只有 latent 和位置分支 */}
      <rect
        x={X_C - 8}
        y={TOP - 8}
        width={dC * S + dR * S + 34}
        height={l * ROW + 10}
        rx={6}
        style={{ fill: 'none', stroke: 'var(--wisp-sem-v)', strokeWidth: 1.5, strokeDasharray: '5 3' }}
      />
      <Caption x={X_C - 8} y={TOP + l * ROW + 14} text={`↑ 缓存的全部内容：每 token ${s.widthMla} 个数`} tone="v" />

      {/* 每个 token 一行 */}
      {s.tokens.map((tok, i) => {
        const y = TOP + i * ROW;
        const cur = s.s === i;
        return (
          <g key={i} opacity={s.s === null || cur ? 1 : 0.45}>
            <Label x={X_X - 12} y={y + S / 2} text={tok} tone="q" anchor="end" />
            <Cell
              x={X_X}
              y={y}
              size={S - 3}
              tone="q"
              text={`x${i}`}
              state={hotX.has(String(i)) ? 'strong' : 'none'}
            />
            <Row x={X_C} y={y} values={s.c[i]} tone="v" hot={hotC} prefix="c" idx={i} />
            <Row x={X_PE} y={y} values={s.pe[i]} tone="k" hot={hotPe} prefix="pe" idx={i} />
            {cur && <Arrow from={[X_X + S + 4, y + S / 2]} to={[X_C - 12, y + S / 2]} tone="v" active label="W^DKV" />}
          </g>
        );
      })}

      {/* 当前 token 重建出的每个 head 的 K/V */}
      {s.k.map((kh, hh) => {
        const y = TOP + hh * ROW;
        const active = s.h === hh;
        return (
          <g key={`h${hh}`} opacity={s.h === null ? 0.5 : active ? 1 : 0.3}>
            <Label x={X_KV - 14} y={y + S / 2} text={`h${hh}`} tone="weight" anchor="end" />
            <Row x={X_KV} y={y} values={kh} tone="weight" hot={hotK} prefix="k" idx={hh} />
            <Row x={X_KV + dK * S + 10} y={y} values={s.v[hh]} tone="weight" hot={hotV} prefix="v" idx={hh} />
          </g>
        );
      })}

      <Caption
        x={X_X}
        y={h - 30}
        text={`同一 token：MLA 缓存 ${s.widthMla} 个数，MHA 需要 ${s.widthMha} 个数（${f(s.widthMha / s.widthMla, 1)} 倍）`}
      />
      <Legend
        x={X_X}
        y={h - 10}
        items={[
          { tone: 'q', text: '输入' },
          { tone: 'v', text: '缓存的 latent' },
          { tone: 'k', text: '位置分支' },
          { tone: 'weight', text: '现算的 K/V' },
        ]}
        gap={116}
      />
    </Stage>
  );
}

/** 固定的小整数权重：文章正文、动画、toy.py 三处用同一组数。 */
const W_DKV = [
  [1, 0, -1, 0, 1, 0, 0, -1],
  [0, 1, 0, 1, -1, 0, 1, 0],
  [-1, 0, 1, 0, 0, 1, 0, 1],
];
const W_KR = [
  [1, 0, 0, 1, 0, -1, 0, 0],
  [0, -1, 1, 0, 0, 0, 1, 0],
];
const W_UK = [
  [
    [1, 0, 1],
    [0, 1, -1],
    [1, -1, 0],
    [0, 1, 1],
  ],
  [
    [-1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, -1],
  ],
];
const W_UV = [
  [
    [0, 1, 1],
    [1, 0, -1],
    [-1, 1, 0],
    [1, 1, 0],
  ],
  [
    [1, -1, 1],
    [0, 1, 0],
    [1, 0, 1],
    [-1, 0, 1],
  ],
];
const X = [
  [1, 0, 2, -1, 0, 1, 1, 0],
  [0, 2, -1, 1, 1, 0, 0, 1],
  [2, -1, 0, 0, 1, 1, -1, 0],
  [-1, 1, 1, 0, 2, 0, 1, 1],
];

export default function MLAFlow({ tokens = ['我', '在', '读', '注意力'], title }: MLAFlowProps) {
  const steps = useMemo(
    () => mlaFlow({ tokens, x: X.slice(0, tokens.length), wDkv: W_DKV, wKr: W_KR, wUk: W_UK, wUv: W_UV }),
    [tokens],
  );
  return (
    <Explainer steps={steps} title={title ?? 'MLA：缓存一份共享 latent，读取时再按 head 重建 K/V'}>
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
