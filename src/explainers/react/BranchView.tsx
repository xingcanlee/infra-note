/**
 * 多分支注意力动画：每条分支一条读取条带，最后按 gate 合并。
 *
 * 用在：DS 08（NSA）、DS 10（CSA）、DS 11（HCA）。
 */
import { useMemo } from 'react';
import { Explainer, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { toneFill, toneStroke, type Tone } from 'astro-wisp/explainers/core';
import { branchCount, branchFlow, type BranchSpec, type BranchState } from '../core/branches';
import {
  blockSelect,
  slidingWindow,
  strided,
  union as maskUnion,
  type MaskFn,
} from '../core/masks';
import { Caption, Legend } from './primitives';

export interface BranchViewProps {
  l?: number;
  t?: number;
  /** Astro serializes island props, so custom mask functions may be absent on the client. */
  branches?: Array<Omit<BranchSpec, 'fn'> & { fn?: MaskFn }>;
  title?: string;
}

const PX = 17;
const ROWH = 54;
const LEFT = 128;
const TOP = 40;
const TONES: Tone[] = ['v', 'weight', 'k', 'activation'];

function resolveBranch(b: Omit<BranchSpec, 'fn'> & { fn?: MaskFn }): BranchSpec {
  if (typeof b.fn === 'function') return b as BranchSpec;
  const fn: MaskFn =
    b.id === 'csa'
      ? (t, s) => s <= t && s % 4 === 0 && s < t - 2
      : b.id === 'hca'
        ? (t, s) => s <= t && s % 8 === 0 && s < Math.floor(t / 8) * 8
        : b.id === 'win'
          ? slidingWindow(4)
          : // shortcut: new serialized branch ids use causal reads, add an ID-specific resolver when introducing one
            (t, s) => s <= t;
  return { ...b, fn };
}

function Strip({
  y,
  l,
  t,
  reads,
  tone,
  active,
}: {
  y: number;
  l: number;
  t: number;
  reads: boolean[] | null;
  tone: Tone;
  active: boolean;
}) {
  return (
    <>
      {Array.from({ length: l }, (_, s) => {
        const future = s > t;
        const on = reads?.[s] ?? false;
        return (
          <rect
            key={s}
            x={LEFT + s * PX}
            y={y}
            width={PX - 2}
            height={20}
            rx={2}
            style={{
              fill: future ? 'none' : on ? toneFill(tone) : toneFill('mask'),
              stroke: future ? 'var(--wisp-border)' : on ? toneStroke(tone) : toneStroke('mask'),
              strokeWidth: on && active ? 1.8 : 0.7,
            }}
            opacity={reads === null ? 0.18 : 1}
          />
        );
      })}
    </>
  );
}

function Scene({ s, focus }: { s: BranchState; focus?: string[] }) {
  const hotB = focusOf(focus, 'branch');
  const hotG = focusOf(focus, 'gate');
  const n = s.branches.length;
  const w = LEFT + s.l * PX + 160;
  const h = TOP + n * ROWH + (s.merged ? ROWH + 16 : 0) + 56;

  return (
    <Stage width={w} height={h} label={`多分支注意力：位置 ${s.t} 的 ${n} 条读取分支`}>
      <Caption x={LEFT} y={12} text={`历史位置 0 … ${s.l - 1}（当前 query 在位置 ${s.t}）`} />
      {/* 当前位置标记 */}
      <rect
        x={LEFT + s.t * PX}
        y={TOP - 12}
        width={PX - 2}
        height={5}
        rx={1}
        style={{ fill: toneStroke('q') }}
      />

      {s.branches.map((b, i) => {
        const y = TOP + i * ROWH;
        const active = hotB.has(String(i)) || hotG.has(String(i));
        const cnt = branchCount(b, s.t, s.l);
        return (
          <g key={b.id} opacity={s.reads[i] === null ? 0.35 : 1}>
            <text
              x={LEFT - 12}
              y={y + 10}
              textAnchor="end"
              className="wisp-explainer__label"
              style={{ fill: toneStroke(TONES[i % TONES.length]) }}
            >
              {b.name}
            </text>
            <Strip
              y={y}
              l={s.l}
              t={s.t}
              reads={s.reads[i]}
              tone={TONES[i % TONES.length]}
              active={active}
            />
            <text
              x={LEFT + s.l * PX + 12}
              y={y + 10}
              dominantBaseline="central"
              className="wisp-explainer__label"
              style={{ fill: 'var(--wisp-muted)' }}
            >
              {s.reads[i] === null ? '' : `读 ${cnt} 个 · gate ${f(b.gate)}`}
            </text>
            <text
              x={LEFT - 12}
              y={y + 26}
              textAnchor="end"
              className="wisp-explainer__label"
              style={{ fill: 'var(--wisp-muted)' }}
            >
              {b.unit === 'block' ? '压缩条目' : '原始 token'}
            </text>
          </g>
        );
      })}

      {s.merged && s.union && (
        <g>
          <line
            x1={LEFT - 100}
            y1={TOP + n * ROWH - 8}
            x2={LEFT + s.l * PX}
            y2={TOP + n * ROWH - 8}
            style={{ stroke: 'var(--wisp-border)', strokeWidth: 1 }}
          />
          <text
            x={LEFT - 12}
            y={TOP + n * ROWH + 18}
            textAnchor="end"
            className="wisp-explainer__label"
            style={{ fill: toneStroke('done') }}
          >
            合并覆盖
          </text>
          <Strip y={TOP + n * ROWH + 8} l={s.l} t={s.t} reads={s.union} tone="done" active />
          <text
            x={LEFT + s.l * PX + 12}
            y={TOP + n * ROWH + 18}
            dominantBaseline="central"
            className="wisp-explainer__label"
            style={{ fill: 'var(--wisp-muted)' }}
          >
            {`共 ${s.union.filter(Boolean).length} / ${s.t + 1} 个`}
          </text>
        </g>
      )}

      <Legend
        x={LEFT}
        y={h - 14}
        items={[
          { tone: 'v', text: '分支读到' },
          { tone: 'mask', text: '没读' },
          { tone: 'done', text: '合并覆盖' },
        ]}
        gap={104}
      />
    </Stage>
  );
}

/** NSA 的三条分支（形状按 toy 规模缩小，比例关系与论文一致）。 */
export function nsaBranches(blockL = 4, keepBlocks = 2, win = 4): BranchSpec[] {
  const compressed: MaskFn = (t, s) => s <= t && s % blockL === 0; // 每块一个压缩条目
  return [
    {
      id: 'cmp',
      name: '压缩分支',
      role: '每 l 个 token 压成一个条目，提供粗粒度的全局视野',
      fn: compressed,
      gate: 0.3,
      unit: 'block',
    },
    {
      id: 'slc',
      name: '选块分支',
      role: '按压缩分支的注意力分数挑出最相关的几个块，读其中的原始 token',
      fn: blockSelect(blockL, keepBlocks),
      gate: 0.5,
    },
    {
      id: 'win',
      name: '窗口分支',
      role: '最近 w 个 token，保证局部细节不丢',
      fn: slidingWindow(win),
      gate: 0.2,
    },
  ];
}

export default function BranchView({ l = 16, t, branches, title }: BranchViewProps) {
  const bs = useMemo(() => (branches ? branches.map(resolveBranch) : nsaBranches()), [branches]);
  const steps = useMemo(() => branchFlow({ l, t, branches: bs }), [l, t, bs]);
  return (
    <Explainer steps={steps} title={title ?? '多分支注意力：分工读取，再按 gate 合并'}>
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}

export { maskUnion, strided };
