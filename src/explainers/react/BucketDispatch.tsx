/**
 * 图桶选路动画：逐个检查候选图的六项条件，命中或回退 eager。
 *
 * 用在：vLLM 05、06。
 */
import { useMemo } from 'react';
import { Explainer, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { toneFill, toneStroke } from 'astro-wisp/explainers/core';
import { dispatchFlow, type BatchReq, type DispatchState, type GraphDesc } from '../core/dispatch';
import { Box, Caption, Legend } from './primitives';

export interface BucketDispatchProps {
  graphs?: GraphDesc[];
  req?: BatchReq;
  title?: string;
}

const LEFT = 0;
const TOP = 52;
const ROW = 44;
const BOXW = 190;
const CHECK_X = 236;
// 最长检查名 'ubatch 数（必须相等）' ≈148px + 文本偏移 14 = 162px 足迹，列距取 168。
const CHECK_COL = 168;

function Scene({ s, focus }: { s: DispatchState; focus?: string[] }) {
  const hot = focusOf(focus, 'graph');
  // 第三列右缘 = CHECK_X + 2×CHECK_COL + 162 = 734，再留 18px 余量。
  const w = CHECK_X + 2 * CHECK_COL + 180;
  const h = TOP + s.graphs.length * ROW + 120;

  return (
    <Stage width={w} height={h} label={`图桶选路：${s.graphs.length} 个候选`}>
      {/* 本轮请求 */}
      <Caption x={LEFT} y={12} text="本轮 batch" tone="q" />
      <Box
        x={LEFT}
        y={22}
        w={BOXW + 300}
        h={22}
        label={`${s.req.numReqs} 个请求 · ${s.req.numTokens} token · ${
          s.req.uniformTokenCount !== null
            ? `每请求 ${s.req.uniformTokenCount}（统一）`
            : '长度不统一'
        } · LoRA ${s.req.numActiveLoras ?? 0}`}
        tone="q"
        active={s.phase === 'intro'}
      />

      {s.graphs.map((g, i) => {
        const examined = i < s.examined;
        const isCur = s.cur === i;
        const isMatch = s.matched === i;
        const y = TOP + i * ROW;
        return (
          <g key={i} opacity={examined ? 1 : 0.3}>
            <Box
              x={LEFT}
              y={y}
              w={BOXW}
              h={ROW - 10}
              label={`图 ${i}：${g.cgMode}`}
              sub={`${g.numTokens} token · ${g.numReqs === null ? '不限请求' : `${g.numReqs} 请求`}`}
              tone={isMatch ? 'done' : examined ? 'mask' : 'weight'}
              active={hot.has(String(i))}
            />
            {isCur && s.checks && (
              <g>
                {s.checks.map((c, j) => (
                  <g
                    key={c.name}
                    transform={`translate(${CHECK_X + (j % 3) * CHECK_COL} ${y + (j < 3 ? 2 : 18)})`}
                  >
                    <rect
                      x={0}
                      y={0}
                      width={10}
                      height={10}
                      rx={2}
                      style={{
                        fill: toneFill(c.ok ? 'done' : 'error'),
                        stroke: toneStroke(c.ok ? 'done' : 'error'),
                        strokeWidth: 1,
                      }}
                    />
                    <text
                      x={14}
                      y={5}
                      dominantBaseline="central"
                      className="wisp-explainer__label"
                      style={{ fill: 'var(--wisp-muted)' }}
                    >
                      {c.name}
                    </text>
                  </g>
                ))}
              </g>
            )}
            {isMatch && (
              <g style={{ color: toneStroke('done') }}>
                {/* Lucide check 图标（不用 ✓ 字符） */}
                <path
                  d="M20 6 9 17l-5-5"
                  transform={`translate(${CHECK_X} ${y + (ROW - 10) / 2 - 8}) scale(0.667)`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text
                  x={CHECK_X + 22}
                  y={y + (ROW - 10) / 2}
                  dominantBaseline="central"
                  className="wisp-explainer__label"
                  style={{ fill: 'currentColor' }}
                >
                  {`命中 · padding ${s.padTokens} 个 token（${f((s.padTokens / g.numTokens) * 100, 1)}%）`}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {s.fellBack && (
        <Box
          x={LEFT}
          y={TOP + s.graphs.length * ROW + 6}
          w={BOXW + 220}
          h={26}
          label="回退 eager（cg_mode = NONE）——静默发生，只是变慢"
          tone="error"
          active
        />
      )}

      <Legend
        x={LEFT}
        y={h - 14}
        items={[
          { tone: 'weight', text: '未检查' },
          { tone: 'mask', text: '不兼容' },
          { tone: 'done', text: '命中' },
          { tone: 'error', text: '回退' },
        ]}
        gap={96}
      />
    </Stage>
  );
}

/** 默认：一组 decode 图 + 一组 PIECEWISE 图。 */
const DEFAULT_GRAPHS: GraphDesc[] = [
  { cgMode: 'FULL', numTokens: 2, numReqs: 2, uniformTokenCount: 1, maxQueryLen: 1 },
  { cgMode: 'FULL', numTokens: 4, numReqs: 4, uniformTokenCount: 1, maxQueryLen: 1 },
  { cgMode: 'FULL', numTokens: 8, numReqs: 8, uniformTokenCount: 1, maxQueryLen: 1 },
  { cgMode: 'PIECEWISE', numTokens: 16, numReqs: null, uniformTokenCount: null, maxQueryLen: null },
];

const DEFAULT_REQ: BatchReq = { numReqs: 3, numTokens: 3, uniformTokenCount: 1, maxQueryLen: 1 };

export default function BucketDispatch({
  graphs = DEFAULT_GRAPHS,
  req = DEFAULT_REQ,
  title,
}: BucketDispatchProps) {
  const steps = useMemo(() => dispatchFlow(graphs, req), [graphs, req]);
  return (
    <Explainer steps={steps} title={title ?? '图桶选路：逐个检查候选，命中或回退'}>
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
