/**
 * KV Cache 宽度与显存账本的条形对照动画。
 *
 * 用在：DS 02、DS 03、DS 04。
 */
import { useMemo } from 'react';
import { Explainer, Stage, focusOf } from 'astro-wisp/explainers';
import { cacheBarsTimeline, type CacheBarsState } from '../core/cache-bars';
import { humanBytes } from '../core/kv-cache';
import { Bar, Caption } from './primitives';
import { DIMS } from '../core/toy';

export interface CacheBarsProps {
  nH?: number;
  dK?: number;
  dV?: number;
  nGroups?: number;
  dC?: number;
  dR?: number;
  tokens?: number;
  layers?: number;
  bytesPerScalar?: number;
  title?: string;
}

const LEFT = 86;
const BAR_H = 26;
const ROW = 42;
const MAXW = 300;
const TONES = ['q', 'k', 'weight', 'v'] as const;

function Scene({ s, focus }: { s: CacheBarsState; focus?: string[] }) {
  const max = Math.max(...s.all.map((x) => x.perToken));
  const hot = focusOf(focus, 'bar');
  const w = LEFT + MAXW + 120;
  const h = 28 + s.all.length * ROW + 10;

  return (
    <Stage
      width={w}
      height={h}
      label={`KV Cache 宽度对照：${s.shown.length} / ${s.all.length} 个方案`}
    >
      <Caption
        x={LEFT}
        y={10}
        text={`每 token 每层缓存的标量数（${s.tokens} token × ${s.layers} 层 × ${s.bytes} 字节）`}
      />
      {s.all.map((info, i) => {
        const shown = i < s.shown.length;
        const total = info.perToken * s.tokens * s.layers * s.bytes;
        return (
          <g key={info.id} opacity={shown ? 1 : 0.18}>
            <Bar
              x={LEFT}
              y={28 + i * ROW}
              w={shown ? (info.perToken / max) * MAXW : 0}
              h={BAR_H}
              label={info.name}
              value={shown ? `${info.perToken} → ${humanBytes(total)}` : ''}
              tone={TONES[i]}
              active={hot.has(String(i))}
            />
          </g>
        );
      })}
    </Stage>
  );
}

export default function CacheBars({
  nH = DIMS.nH,
  dK = DIMS.dK,
  dV = DIMS.dV,
  nGroups = 1,
  dC = DIMS.dC,
  dR = DIMS.dR,
  tokens = 4096,
  layers = 61,
  bytesPerScalar = 2,
  title,
}: CacheBarsProps) {
  const steps = useMemo(
    () =>
      cacheBarsTimeline({ base: { nH, dK, dV, nGroups, dC, dR }, tokens, layers, bytesPerScalar }),
    [nH, dK, dV, nGroups, dC, dR, tokens, layers, bytesPerScalar],
  );
  return (
    <Explainer steps={steps} title={title ?? '同一配置下四种缓存方案的宽度'}>
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
