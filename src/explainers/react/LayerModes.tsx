/**
 * CSA2 的跨层复用动画：逐层展开 Full / Reindex / Reuse，并画出复用来源。
 *
 * 用在：DS 21（CSA2）。
 */
import { useMemo } from 'react';
import { Explainer, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { toneStroke } from 'astro-wisp/explainers/core';
import { layerModeFlow, type LayerMode, type LayerState } from '../core/layer-modes';
import { Box, Caption, Legend, legendRight } from './primitives';

export interface LayerModesProps {
  modes?: LayerMode[];
  title?: string;
}

const ROW = 46;
const TOP = 40;
const LEFT = 56;
const BOXW = 168;
const KV_X = 268;
const TK_X = 400;

const TONE: Record<LayerMode, 'done' | 'weight' | 'mask'> = {
  full: 'done',
  reindex: 'weight',
  reuse: 'mask',
};
const LABEL: Record<LayerMode, string> = { full: 'Full', reindex: 'Reindex', reuse: 'Reuse' };

function Scene({ s, focus }: { s: LayerState; focus?: string[] }) {
  const hot = focusOf(focus, 'layer');
  const legendItems = [
    { tone: 'done' as const, text: 'Full（都自己算）' },
    { tone: 'weight' as const, text: 'Reindex（共享 KV，重打分）' },
    { tone: 'mask' as const, text: 'Reuse（全复用）' },
  ];
  const legendGap = 216;
  const w = Math.max(TK_X + 240, legendRight(LEFT, legendItems, legendGap));
  const h = TOP + s.nLayers * ROW + 86;

  return (
    <Stage width={w} height={h} pad={10} label={`CSA2 跨层复用：${s.nLayers} 层的 mode 分配`}>
      <Caption x={LEFT} y={14} text="层与 mode" tone="q" />
      <Caption x={KV_X} y={14} text="main KV 来自" tone="v" />
      <Caption x={TK_X} y={14} text="Top-K 来自" tone="k" />

      {s.modes.map((m, l) => {
        const seen = l <= s.cur;
        const y = TOP + l * ROW;
        return (
          <g key={l} opacity={seen ? 1 : 0.25}>
            <Box
              x={LEFT}
              y={y}
              w={BOXW}
              h={ROW - 10}
              label={`第 ${l} 层 · ${LABEL[m]}`}
              tone={TONE[m]}
              active={hot.has(String(l))}
            />
            <text
              x={KV_X}
              y={y + (ROW - 10) / 2}
              dominantBaseline="central"
              className="wisp-explainer__label"
              style={{ fill: toneStroke('v') }}
            >
              {seen && s.kvFrom[l] !== null
                ? s.kvFrom[l] === l
                  ? '本层生成'
                  : `← 第 ${s.kvFrom[l]} 层`
                : ''}
            </text>
            <text
              x={TK_X}
              y={y + (ROW - 10) / 2}
              dominantBaseline="central"
              className="wisp-explainer__label"
              style={{ fill: toneStroke('k') }}
            >
              {seen && s.topkFrom[l] !== null
                ? s.topkFrom[l] === l
                  ? '本层打分'
                  : `← 第 ${s.topkFrom[l]} 层`
                : ''}
            </text>
          </g>
        );
      })}

      <Caption
        x={LEFT}
        y={h - 44}
        text={`已生成 ${s.nKv} 份 main KV · 跑了 ${s.nIndexer} 次 indexer（若每层都 Full 则各需 ${s.nLayers} 次）`}
        tone="done"
      />
      <Caption
        x={LEFT}
        y={h - 24}
        text={
          s.phase === 'done'
            ? `缓存降到 ${f((s.nKv / s.nLayers) * 100, 0)}%，indexer 降到 ${f((s.nIndexer / s.nLayers) * 100, 0)}%`
            : '三种 mode 都要算本层自己的 main Q 与 SWA KV'
        }
      />
      <Legend x={LEFT} y={h - 4} items={legendItems} gap={legendGap} />
    </Stage>
  );
}

const DEFAULT: LayerMode[] = [
  'full',
  'reindex',
  'reuse',
  'reuse',
  'full',
  'reindex',
  'reuse',
  'reuse',
];

export default function LayerModes({ modes = DEFAULT, title }: LayerModesProps) {
  const steps = useMemo(() => layerModeFlow({ modes }), [modes]);
  return (
    <Explainer
      steps={steps}
      title={title ?? 'CSA2：每层 Full / Reindex / Reuse，缓存与索引分开复用'}
    >
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
