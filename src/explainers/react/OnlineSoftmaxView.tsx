/**
 * 在线 softmax 动画：分块遍历，只维护 m / ℓ / O 三个标量。
 *
 * 用在：DS 18。
 */
import { useMemo } from 'react';
import { Explainer, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { toneFill, toneStroke } from 'astro-wisp/explainers/core';
import { onlineSoftmax, type OSState } from '../core/online-softmax';
import { Box, Caption, Legend } from './primitives';

export interface OnlineSoftmaxViewProps {
  scores?: number[];
  values?: number[];
  blockSize?: number;
  conditional?: boolean;
  tau?: number;
  title?: string;
}

const CW = 52;
const CH = 34;
const LEFT = 68;
const TOP = 44;

function Scene({ s, focus }: { s: OSState; focus?: string[] }) {
  const hot = focusOf(focus, 'score');
  const n = s.scores.length;
  // 宽度取内容最大右缘（分数行 vs 标量盒子行，结果框右缘 LEFT+486+168=722）+ 24px 余量。
  const contentRight = Math.max(LEFT + n * CW, LEFT + 486 + 168);
  const w = contentRight + 24;
  const h = TOP + CH + 150;
  const curStart = s.block * s.blockSize;

  return (
    <Stage
      width={w}
      height={h}
      label={`在线 softmax：${n} 个分数分成 ${Math.ceil(n / s.blockSize)} 块`}
    >
      <Caption x={0} y={14} text="分数（从不整行物化）" tone="k" />

      {/* 分块边界 */}
      {Array.from({ length: Math.ceil(n / s.blockSize) }, (_, b) => (
        <rect
          key={`b${b}`}
          x={LEFT + b * s.blockSize * CW - 3}
          y={TOP - 5}
          width={Math.min(s.blockSize, n - b * s.blockSize) * CW}
          height={CH + 10}
          rx={4}
          style={{
            fill: 'none',
            stroke:
              b === s.block && s.phase !== 'intro' ? toneStroke('highlight') : 'var(--wisp-border)',
            strokeWidth: b === s.block && s.phase !== 'intro' ? 2 : 1,
            strokeDasharray: '4 3',
          }}
        />
      ))}

      {s.scores.map((v, i) => {
        const seen = i < s.seen;
        const isCur = s.phase !== 'intro' && i >= curStart && i < curStart + s.blockSize;
        return (
          <g key={i} opacity={seen || isCur ? 1 : 0.3}>
            <rect
              x={LEFT + i * CW}
              y={TOP}
              width={CW - 6}
              height={CH}
              rx={3}
              style={{
                fill: toneFill(isCur ? 'k' : seen ? 'visited' : 'mask'),
                stroke: toneStroke(isCur ? 'k' : seen ? 'visited' : 'mask'),
                strokeWidth: hot.has(String(i)) ? 2.2 : 1,
              }}
            />
            <text
              x={LEFT + i * CW + (CW - 6) / 2}
              y={TOP + CH / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="wisp-explainer__cell-text"
              style={{ fill: 'var(--wisp-fg)' }}
            >
              {f(v)}
            </text>
          </g>
        );
      })}

      {/* 三个标量状态 */}
      <Caption x={0} y={TOP + CH + 30} text="全程只保留这三个标量：" tone="done" />
      <Box
        x={LEFT}
        y={TOP + CH + 44}
        w={150}
        h={34}
        labelTex={`m = ${s.m === -Infinity ? '-\\infty' : f(s.m)}`}
        sub="running max"
        tone="q"
        active={s.phase === 'rescale'}
      />
      <Box
        x={LEFT + 162}
        y={TOP + CH + 44}
        w={150}
        h={34}
        labelTex={`\\ell = ${f(s.l)}`}
        sub="running sum"
        tone="v"
      />
      <Box
        x={LEFT + 324}
        y={TOP + CH + 44}
        w={150}
        h={34}
        labelTex={`O = ${f(s.o)}`}
        sub="未归一化输出"
        tone="activation"
      />

      {s.result !== null && (
        <Box
          x={LEFT + 486}
          y={TOP + CH + 44}
          w={168}
          h={34}
          labelTex={`O / \\ell = ${f(s.result)}`}
          sub="最后归一化一次"
          tone="done"
          active
        />
      )}

      <Caption
        x={0}
        y={TOP + CH + 100}
        text={
          s.conditional
            ? `条件重缩放（τ=${s.tau}）：重缩放 ${s.nRescale} 次，跳过 ${s.nSkip} 次`
            : `已处理 ${s.seen} / ${n} 个分数 · 重缩放 ${s.nRescale} 次`
        }
        tone={s.phase === 'skip' ? 'done' : undefined}
      />
      <Legend
        x={0}
        y={TOP + CH + 124}
        items={[
          { tone: 'k', text: '当前块' },
          { tone: 'visited', text: '已处理' },
          { tone: 'mask', text: '还没看' },
        ]}
        gap={96}
      />
    </Stage>
  );
}

const SCORES = [1.2, -0.4, 3.1, 0.8, 2.2, -1.5, 0.3, 4.0];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8];

export default function OnlineSoftmaxView({
  scores = SCORES,
  values = VALUES,
  blockSize = 2,
  conditional = false,
  tau = 8,
  title,
}: OnlineSoftmaxViewProps) {
  const steps = useMemo(
    () => onlineSoftmax({ scores, values, blockSize, conditional, tau }),
    [scores, values, blockSize, conditional, tau],
  );
  return (
    <Explainer steps={steps} title={title ?? '在线 softmax：分块遍历，只维护三个标量'}>
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
