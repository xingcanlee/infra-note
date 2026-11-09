/**
 * MoE 路由动画：打分 → 分组 → top-k → 归一化 → 专家计算 → 共享专家。
 *
 * 用在：DS 13。
 */
import { useMemo } from 'react';
import { Explainer, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { toneFill, toneStroke } from 'astro-wisp/explainers/core';
import { routing, type RouteState } from '../core/routing';
import { Arrow, Box, Caption, Legend } from './primitives';

export interface RoutingFlowProps {
  tokens?: string[];
  logits?: number[][];
  topk?: number;
  nGroups?: number;
  topkGroups?: number;
  bias?: number[];
  nShared?: number;
  title?: string;
}

const EW = 92; // 专家框宽
const EH = 54;
const GAP = 14;
const TOKEN_X = 0;
const EXPERT_X = 176;
const TOP = 46;

function Scene({ s, focus }: { s: RouteState; focus?: string[] }) {
  const hot = focusOf(focus, 'expert');
  const hotShared = focusOf(focus, 'shared');
  const n = s.nExperts;
  const barMax = 110;
  const maxScore = Math.max(...s.scores, 0.0001);
  // 打分文本从 EXPERT_X+EW+16+barMax+10 起，最长组合 "−1.2 → −0.96  w=0.35" ≈155px，再留 23px 右余量。
  const w = EXPERT_X + EW + 16 + barMax + 178;
  const h = TOP + n * (EH + GAP) + 92;

  return (
    <Stage width={w} height={h} label={`MoE 路由：${n} 个专家中选 ${s.chosen.length} 个`}>
      <Caption x={TOKEN_X} y={14} text="当前 token" tone="q" />
      <Box
        x={TOKEN_X}
        y={TOP + (n * (EH + GAP)) / 2 - 28}
        w={120}
        h={56}
        label={s.tokens[s.t]}
        sub={`位置 ${s.t}`}
        tone="q"
        active={s.phase === 'score'}
      />

      <Caption x={EXPERT_X} y={14} text={`${n} 个路由专家`} tone="weight" />
      <Caption x={EXPERT_X + EW + 16} y={14} text="gate 打分" />

      {Array.from({ length: n }, (_, i) => {
        const y = TOP + i * (EH + GAP);
        const isChosen = s.chosen.includes(i);
        const isComputed = s.computed.includes(i);
        const groupKept = s.keptGroups.length === 0 || s.keptGroups.includes(s.group[i]);
        const dim = s.phase !== 'intro' && s.phase !== 'score' && (!groupKept || (s.chosen.length > 0 && !isChosen));
        const score = s.scores[i] ?? 0;
        const sel = s.selScores[i];
        const widx = s.chosen.indexOf(i);

        return (
          <g key={i}>
            <Box
              x={EXPERT_X}
              y={y}
              w={EW}
              h={EH}
              label={`专家 ${i}`}
              sub={s.group.length && s.keptGroups.length ? `组 ${s.group[i]}` : undefined}
              tone={isComputed ? 'done' : isChosen ? 'weight' : 'mask'}
              active={hot.has(String(i))}
              dim={dim}
            />
            {/* 打分条 */}
            <rect
              x={EXPERT_X + EW + 16}
              y={y + EH / 2 - 7}
              width={Math.max((score / maxScore) * barMax, 1)}
              height={14}
              rx={3}
              style={{ fill: toneFill(isChosen ? 'weight' : 'mask'), stroke: toneStroke(isChosen ? 'weight' : 'mask'), strokeWidth: 1 }}
              opacity={dim ? 0.3 : 1}
            />
            <text
              x={EXPERT_X + EW + 16 + barMax + 10}
              y={y + EH / 2}
              dominantBaseline="central"
              className="wisp-explainer__label"
              style={{ fill: 'var(--wisp-muted)' }}
              opacity={dim ? 0.3 : 1}
            >
              {f(score)}
              {sel !== null && sel !== score ? ` → ${f(sel)}` : ''}
              {widx >= 0 && s.weights[widx] !== null && s.weights[widx] !== undefined ? `  w=${f(s.weights[widx]!)}` : ''}
            </text>
            {isChosen && (
              <Arrow from={[TOKEN_X + 124, TOP + (n * (EH + GAP)) / 2]} to={[EXPERT_X - 6, y + EH / 2]} tone="weight" active={hot.has(String(i))} />
            )}
          </g>
        );
      })}

      {/* 共享专家 */}
      {Array.from({ length: s.nShared }, (_, i) => (
        <Box
          key={`sh${i}`}
          x={EXPERT_X}
          y={TOP + n * (EH + GAP) + 8}
          w={EW}
          h={EH - 12}
          label={`共享专家 ${i}`}
          tone="activation"
          active={hotShared.has(String(i))}
        />
      ))}
      <Caption
        x={EXPERT_X + EW + 16}
        y={TOP + n * (EH + GAP) + 8 + (EH - 12) / 2}
        text="每个 token 都过，不参与路由"
        tone="activation"
      />

      <Caption
        x={TOKEN_X}
        y={h - 34}
        text={s.activated ? `本轮激活 ${s.activated} / ${n + s.nShared} 个专家` : `每个 token 只激活其中一小部分`}
        tone="done"
      />
      <Legend
        x={TOKEN_X}
        y={h - 12}
        items={[
          { tone: 'weight', text: '被选中' },
          { tone: 'done', text: '已计算' },
          { tone: 'mask', text: '未激活' },
          { tone: 'activation', text: '共享' },
        ]}
        gap={96}
      />
    </Stage>
  );
}

const LOGITS = [
  [2.1, 0.3, -0.5, 1.4, 0.8, -1.2],
  [-0.4, 1.9, 0.6, -0.8, 2.2, 0.1],
];

export default function RoutingFlow({
  tokens = ['读', '注意力'],
  logits = LOGITS,
  topk = 2,
  nGroups = 2,
  topkGroups = 1,
  bias,
  nShared = 1,
  title,
}: RoutingFlowProps) {
  const steps = useMemo(
    () => routing({ tokens, logits, topk, nGroups, topkGroups, bias, nShared }),
    [tokens, logits, topk, nGroups, topkGroups, bias, nShared],
  );
  return (
    <Explainer steps={steps} title={title ?? 'MoE 路由：每个 token 只激活少数专家'}>
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
