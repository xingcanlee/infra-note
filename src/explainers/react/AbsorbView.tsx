/**
 * 矩阵吸收动画：同一个打分式子的两种计算顺序并排对照。
 *
 * 用在：DS 05。
 */
import { useMemo } from 'react';
import { Cell, Explainer, Label, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { absorbFlow, type AbsorbMode, type AbsorbState } from '../core/absorb';
import { Caption, Legend } from './primitives';

export interface AbsorbViewProps {
  mode?: AbsorbMode;
  title?: string;
}

const S = 34;
const ROW = 40;
// 顶部留一整行给 'q̃（已吸收 Wᵁᴷ）' / 'q（内容分支）' 标题（≈135px 宽），格行从 TOP-30=28 开始，不再压字。
const TOP = 58;
const X_LAT = 92;

function Scene({ s, focus }: { s: AbsorbState; focus?: string[] }) {
  const l = s.c.length;
  const dC = s.c[0].length;
  const dK = s.wUk.length;
  const hotC = focusOf(focus, 'c');
  const hotK = focusOf(focus, 'k');
  const hotQt = focusOf(focus, 'qt');
  const hotScore = focusOf(focus, 'scores');

  const xK = X_LAT + dC * S + 44;
  const xScore = s.mode === 'naive' ? xK + dK * S + 40 : xK;
  const w = xScore + 150;
  const h = TOP + Math.max(l, 2) * ROW + 86;

  return (
    <Stage
      width={w}
      height={h}
      label={`${s.mode === 'naive' ? '朴素' : '吸收'}顺序：${l} 个历史位置的打分`}
    >
      {/* 当前 Query */}
      <Caption
        x={0}
        y={10}
        text={s.mode === 'absorb' ? 'q̃（已吸收 Wᵁᴷ）' : 'q（内容分支）'}
        tone="q"
      />
      {s.mode === 'absorb'
        ? s.qTilde.map((val, i) => (
            <Cell
              key={`qt${i}`}
              x={X_LAT + i * S}
              y={TOP - 30}
              size={S - 4}
              tone="q"
              empty={val === null}
              state={hotQt.has(`0,${i}`) ? 'strong' : 'none'}
              text={val === null ? '·' : f(val)}
            />
          ))
        : s.q.map((val, i) => (
            <Cell
              key={`q${i}`}
              x={X_LAT + i * S}
              y={TOP - 30}
              size={S - 4}
              tone="q"
              text={f(val)}
            />
          ))}

      {/* 历史 latent：缓存里真正存着的 */}
      <Caption x={X_LAT} y={TOP + l * ROW + 14} text={`↑ 缓存：${l} × ${dC} 个 latent`} tone="v" />
      {s.c.map((row, i) => {
        const cur = s.s === i;
        return (
          <g key={i} opacity={s.s === null || cur ? 1 : 0.4}>
            <Label x={X_LAT - 12} y={TOP + i * ROW + S / 2} text={`c${i}`} tone="v" anchor="end" />
            {row.map((val, j) => (
              <Cell
                key={j}
                x={X_LAT + j * S}
                y={TOP + i * ROW}
                size={S - 4}
                tone="v"
                text={f(val)}
                state={hotC.has(`${i},${j}`) ? 'strong' : 'none'}
              />
            ))}
          </g>
        );
      })}

      {/* naive 才会物化出来的 K */}
      {s.mode === 'naive' && (
        <>
          <Caption x={xK} y={10} text="展开出的 K（占显存）" tone="weight" />
          {s.k.map((row, i) => (
            <g key={i} opacity={s.s === null || s.s === i ? 1 : 0.4}>
              {row.map((val, j) => (
                <Cell
                  key={j}
                  x={xK + j * S}
                  y={TOP + i * ROW}
                  size={S - 4}
                  tone="weight"
                  empty={val === null}
                  state={hotK.has(`${i},${j}`) ? 'strong' : 'none'}
                  text={val === null ? '·' : f(val)}
                />
              ))}
            </g>
          ))}
        </>
      )}

      {/* 打分结果 */}
      <Caption x={xScore} y={10} text="打分" tone="activation" />
      {s.scores.map((val, i) => (
        <Cell
          key={i}
          x={xScore}
          y={TOP + i * ROW}
          size={S - 4}
          tone="activation"
          empty={val === null}
          state={hotScore.has(`0,${i}`) ? 'strong' : 'none'}
          text={val === null ? '·' : f(val)}
        />
      ))}

      <Caption
        x={0}
        y={h - 42}
        text={`每个历史位置 ${s.perToken} 次乘法 · 累计 ${s.mults} 次 · ${s.materializesK ? `物化 ${l}×${dK} 个 Key 元素` : '不物化 Key'}`}
        tone={s.mode === 'naive' ? 'error' : 'done'}
      />
      <Legend
        x={0}
        y={h - 16}
        items={[
          { tone: 'q', text: 'Query' },
          { tone: 'v', text: '缓存的 latent' },
          { tone: 'weight', text: '临时展开的 K' },
          { tone: 'activation', text: '打分' },
        ]}
        gap={118}
      />
    </Stage>
  );
}

/** 固定小整数：文章正文、动画、toy.py 用同一组数。 */
const Q = [1, -1, 2, 0];
const W_UK = [
  [1, 0, 1],
  [0, 1, -1],
  [1, -1, 0],
  [0, 1, 1],
];
const C = [
  [-1, 0, 2],
  [1, 2, 0],
  [0, -1, 1],
  [2, 1, -1],
];

export default function AbsorbView({ mode = 'absorb', title }: AbsorbViewProps) {
  const steps = useMemo(() => absorbFlow({ mode, q: Q, wUk: W_UK, c: C }), [mode]);
  return (
    <Explainer
      steps={steps}
      title={
        title ??
        (mode === 'naive'
          ? '朴素顺序：先展开 K，再打分'
          : '吸收顺序：先折进 Query，直接用 latent 打分')
      }
    >
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
