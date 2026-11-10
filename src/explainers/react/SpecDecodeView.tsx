/**
 * 推测解码动画：草稿提出若干候选，主模型一次验证，从第一个不符处截断。
 *
 * 用在：DS 14（MTP）、DS 17（DSpark）。
 */
import { useMemo } from 'react';
import { Explainer, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { toneFill, toneStroke } from 'astro-wisp/explainers/core';
import { specDecode, type SpecState } from '../core/specdec';
import { Caption, Legend } from './primitives';

export interface SpecDecodeViewProps {
  truth?: string[];
  k?: number;
  hits?: boolean[];
  title?: string;
}

const CELL = 62;
const H = 34;
const LEFT = 86;
const TOP = 40;

function Chip({
  x,
  y,
  text,
  tone,
  strong = false,
  dashed = false,
}: {
  x: number;
  y: number;
  text: string;
  tone: 'done' | 'q' | 'error' | 'mask' | 'weight';
  strong?: boolean;
  dashed?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={CELL - 6}
        height={H}
        rx={4}
        style={{
          fill: toneFill(tone),
          stroke: toneStroke(tone),
          strokeWidth: strong ? 2.2 : 1,
          strokeDasharray: dashed ? '4 3' : undefined,
        }}
      />
      <text
        x={x + (CELL - 6) / 2}
        y={y + H / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="wisp-explainer__cell-text"
        style={{ fill: 'var(--wisp-fg)' }}
      >
        {text}
      </text>
    </g>
  );
}

function Scene({ s, focus }: { s: SpecState; focus?: string[] }) {
  const hot = focusOf(focus, 'draft');
  const base =
    s.committed.length - (s.phase === 'accept' || s.phase === 'reject' ? s.accepted + 1 : 0);
  const start = Math.max(
    0,
    s.phase === 'draft' || s.phase === 'verify' ? s.committed.length : base,
  );
  // 图例整行右缘 = LEFT + 3×160 + 57 = 623，比格子行（LEFT+8×62=582）更右，w 余量取 56 保证图例不贴边。
  const w = LEFT + Math.max(s.truth.length, 8) * CELL + 56;
  const h = TOP + 3 * (H + 22) + 76;

  const rows = [
    { label: '目标序列', y: TOP, tone: 'mask' as const },
    { label: '草稿提出', y: TOP + H + 22, tone: 'weight' as const },
    { label: '已确定', y: TOP + 2 * (H + 22), tone: 'done' as const },
  ];

  return (
    <Stage
      width={w}
      height={h}
      label={`推测解码：第 ${s.round} 轮，已产出 ${s.committed.length}/${s.truth.length}`}
    >
      {rows.map((r) => (
        <Caption key={r.label} x={0} y={r.y + H / 2} text={r.label} tone={r.tone} />
      ))}

      {/* 目标序列（主模型真正会生成的） */}
      {s.truth.map((t, i) => (
        <Chip key={`t${i}`} x={LEFT + i * CELL} y={TOP} text={t} tone="mask" />
      ))}

      {/* 本轮草稿 */}
      {s.draft.map((d, j) => {
        const i = start + j;
        const correct = d === s.truth[i];
        const rejected = s.rejectedAt !== null && j >= s.rejectedAt;
        const shown = s.phase !== 'intro';
        if (!shown) return null;
        return (
          <Chip
            key={`d${j}`}
            x={LEFT + i * CELL}
            y={TOP + H + 22}
            text={d}
            tone={s.phase === 'draft' ? 'weight' : rejected ? 'error' : correct ? 'done' : 'weight'}
            strong={hot.has(String(j))}
            dashed={s.phase === 'draft'}
          />
        );
      })}

      {/* 已确定的输出 */}
      {s.committed.map((c, i) => (
        <Chip key={`c${i}`} x={LEFT + i * CELL} y={TOP + 2 * (H + 22)} text={c} tone="done" />
      ))}

      <Caption
        x={0}
        y={h - 40}
        text={`第 ${s.round} 轮 · 主模型前向 ${s.forwards} 次 · 已产出 ${s.committed.length} 个 token`}
      />
      <Caption
        x={0}
        y={h - 20}
        text={
          s.forwards > 0
            ? `逐个生成需要 ${s.committed.length} 次前向，这里用了 ${s.forwards} 次 → ${f(s.committed.length / s.forwards, 2)}× 前向效率`
            : '逐个生成：每次前向只出 1 个 token'
        }
        tone="done"
      />
      <Legend
        x={LEFT}
        y={h - 2}
        items={[
          { tone: 'mask', text: '主模型真正会生成的' },
          { tone: 'weight', text: '草稿候选' },
          { tone: 'error', text: '被拒' },
          { tone: 'done', text: '已确定' },
        ]}
        gap={160}
      />
    </Stage>
  );
}

export default function SpecDecodeView({
  truth = ['我', '在', '读', '注意力', '机', '制'],
  k = 2,
  hits = [true, true, false, true, true, true],
  title,
}: SpecDecodeViewProps) {
  const steps = useMemo(() => specDecode({ truth, k, hits }), [truth, k, hits]);
  return (
    <Explainer steps={steps} title={title ?? '推测解码：草稿提出、主模型一次验证、从不符处截断'}>
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
