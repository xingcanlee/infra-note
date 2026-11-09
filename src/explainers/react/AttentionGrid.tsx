/**
 * 注意力分步动画。换一个 mask 就能演示因果注意力、滑动窗口、选块、top-k……
 *
 * 用在：DS 01（因果注意力）、DS 06–12（各种稀疏读取集合）。
 */
import { useMemo } from 'react';
import { CELL, Cell, Explainer, Label, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { attention, type AttnState } from '../core/attention';
import { causal, maskCatalog, type MaskFn } from '../core/masks';
import { Caption, Legend } from './primitives';
import { DIMS, TOKENS, toyQKV } from '../core/toy';

export interface AttentionGridProps {
  tokens?: string[];
  q?: number[][];
  k?: number[][];
  v?: number[][];
  /** `maskCatalog()` 中的读取集合 id，默认 causal。必须是可序列化的字符串。 */
  mask?: string;
  title?: string;
  /** 右侧是否显示输出矩阵，默认显示 */
  showOutput?: boolean;
}

const GUT = 64; // 左侧 token 标签宽
const GAP = 32;
const TOP = 26; // 顶部列标签

function maskFor(id: string): MaskFn {
  const match = maskCatalog().find((candidate) => candidate.id === id);
  if (!match) throw new Error(`未知的注意力 mask：${id}`);
  return match.fn;
}

function Scene({ s, focus, showOutput }: { s: AttnState; focus?: string[]; showOutput: boolean }) {
  const l = s.tokens.length;
  const dv = s.v[0].length;
  const gridW = l * CELL;
  const outX = GUT + gridW + GAP;
  const w = GUT + gridW + (showOutput ? GAP + dv * CELL : 0) + 40;
  const h = TOP + l * CELL + 34;

  const hotScores = focusOf(focus, 'scores');
  const hotWeights = focusOf(focus, 'weights');
  const hotOut = focusOf(focus, 'out');
  // logits 用整张矩阵的绝对值上限做同一色阶，读者才能跨行比较强弱。
  const scoreCeiling = Math.max(
    1e-9,
    ...s.scores.flatMap((row, t) =>
      row.map((score, c) => (s.allowed[t][c] && score !== null ? Math.abs(score) : 0)),
    ),
  );

  /** 归一化之后显示权重，否则显示 logits。 */
  const showWeights = (t: number) => s.weights[t].some((x) => x !== null);

  return (
    <Stage width={w} height={h} label={`注意力矩阵：${l} 个位置，每行显示该位置读取的历史`}>
      {/* 列标签：被读取的位置 s */}
      <Caption x={0} y={TOP / 2} text="读取 →" />
      {s.tokens.map((tok, c) => (
        <Label key={`col-${c}`} x={GUT + c * CELL + CELL / 2} y={TOP / 2} text={tok} tone="k" />
      ))}

      {/* 每一行：位置 t */}
      {s.tokens.map((tok, t) => {
        const isCur = s.t === t;
        const useW = showWeights(t);
        return (
          <g key={`row-${t}`} opacity={s.t === null || isCur ? 1 : 0.45}>
            <Label x={GUT - 10} y={TOP + t * CELL + CELL / 2} text={tok} tone="q" anchor="end" />
            {Array.from({ length: l }, (_, c) => {
              const allowed = s.allowed[t][c];
              const future = c > t;
              const weight = s.weights[t][c];
              const score = s.scores[t][c];
              const hasWeight = useW && weight !== null;
              const val = hasWeight ? weight : score;
              const key = `${t},${c}`;
              // 未来位置：留空；读取集合之外：灰（mask）；集合内：按是否已归一化着色
              const tone = future || !allowed ? 'mask' : hasWeight ? 'v' : 'k';
              const strong = hotScores.has(key) || hotWeights.has(key);
              // 权重按 0–1 的概率直接映射；logits 共用整张矩阵的绝对值上限。
              // sqrt 让 0.03 这类小权重仍有可见层级，同时保持大小顺序。
              const heat = val === null
                ? 0
                : hasWeight
                  ? Math.sqrt(Math.min(1, Math.max(0, val)))
                  : Math.min(1, Math.abs(val) / scoreCeiling);
              const fillOpacity = future ? 0.08 : !allowed ? 0.2 : 0.12;
              return (
                <Cell
                  key={key}
                  x={GUT + c * CELL}
                  y={TOP + t * CELL}
                  size={CELL - 4}
                  tone={tone}
                  empty={val === null}
                  fillOpacity={fillOpacity}
                  heat={future || !allowed || val === null ? undefined : heat}
                  state={strong ? 'strong' : isCur ? 'soft' : 'none'}
                  text={future ? '' : !allowed ? '×' : val === null ? '·' : f(val)}
                />
              );
            })}
          </g>
        );
      })}

      {/* 输出矩阵 */}
      {showOutput && (
        <>
          <Caption x={outX} y={TOP / 2} text="输出" tone="v" />
          {s.out.map((row, t) =>
            row.map((val, c) => (
              <Cell
                key={`o-${t},${c}`}
                x={outX + c * CELL}
                y={TOP + t * CELL}
                size={CELL - 4}
                tone="v"
                empty={val === null}
                state={hotOut.has(`${t},${c}`) ? 'strong' : s.t === t ? 'soft' : 'none'}
                text={val === null ? '·' : f(val)}
              />
            )),
          )}
        </>
      )}

      <Legend
        x={GUT}
        y={h - 12}
        items={[
          { tone: 'k', text: '打分（越浓越强）' },
          { tone: 'v', text: '权重（越浓越大）' },
          { tone: 'mask', text: '不读（×）' },
        ]}
        gap={146}
      />
    </Stage>
  );
}

export default function AttentionGrid({ tokens, q, k, v, mask, title, showOutput = true }: AttentionGridProps) {
  const steps = useMemo(() => {
    const toks = tokens ?? [...TOKENS].slice(0, DIMS.L);
    const base = toyQKV(toks.length, DIMS.dK);
    return attention({ tokens: toks, q: q ?? base.q, k: k ?? base.k, v: v ?? base.v, mask: mask ? maskFor(mask) : causal });
  }, [tokens, q, k, v, mask]);

  return (
    <Explainer steps={steps} title={title ?? '注意力：打分 → 掩码 → softmax → 加权求和'}>
      {(step) => <Scene s={step.state} focus={step.focus} showOutput={showOutput} />}
    </Explainer>
  );
}
