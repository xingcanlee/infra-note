/**
 * 读取集合图谱：把各种稀疏注意力的掩码形状并排画出来，附三项可比指标。
 *
 * 用在：DS 06、DS 12。
 */
import { useMemo } from 'react';
import { Explainer, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { toneFill, toneStroke } from 'astro-wisp/explainers/core';
import { maskAtlas, type MaskAtlasState, type MaskEntry } from '../core/mask-atlas';
import { Caption, Legend } from './primitives';

export interface MaskAtlasProps {
  /** 序列长度，默认 8 */
  l?: number;
  /** 计算「叠几层之后的可达范围」，默认 4 */
  layers?: number;
  title?: string;
}

const PX = 13; // 每个格子的边长（小格，便于并排多张）
const COL = 4; // 每行放几张
const LABEL = 20;
const VGAP = 52;

/** 一张掩码缩略图。 */
function MaskTile({ e, x, y, l, active, dim }: { e: MaskEntry; x: number; y: number; l: number; active: boolean; dim: boolean }) {
  const size = l * PX;
  return (
    <g transform={`translate(${x} ${y})`} opacity={dim ? 0.16 : 1}>
      <text x={0} y={-8} className="wisp-explainer__label" style={{ fill: active ? toneStroke('highlight') : 'var(--wisp-fg)' }}>
        {e.name}
      </text>
      {/* 格子：可读=绿，不读但在因果范围内=灰，未来=空 */}
      {e.grid.map((row, t) =>
        row.map((ok, s) => {
          const future = s > t;
          if (future) return null;
          return (
            <rect
              key={`${t},${s}`}
              x={s * PX}
              y={t * PX}
              width={PX - 1.5}
              height={PX - 1.5}
              rx={1.5}
              style={{
                fill: ok ? toneFill('v') : toneFill('mask'),
                stroke: ok ? toneStroke('v') : toneStroke('mask'),
                strokeWidth: 0.6,
              }}
            />
          );
        }),
      )}
      {active && (
        <rect x={-3} y={-3} width={size + 6} height={size + 6} rx={3} style={{ fill: 'none', stroke: toneStroke('highlight'), strokeWidth: 2 }} />
      )}
      <text x={0} y={size + 12} className="wisp-explainer__label" style={{ fill: 'var(--wisp-muted)' }}>
        {`${f(e.density * 100, 0)}% · 单步≤${e.maxRow}`}
      </text>
    </g>
  );
}

function Scene({ s, focus }: { s: MaskAtlasState; focus?: string[] }) {
  const hot = focusOf(focus, 'mask');
  const tileW = s.l * PX + 46;
  const tileH = s.l * PX + VGAP;
  const rows = Math.ceil(s.all.length / COL);
  const w = COL * tileW;
  const h = LABEL + rows * tileH + 26;

  return (
    <Stage width={w} height={h} label={`读取集合图谱：${s.all.length} 种稀疏注意力的掩码形状`}>
      <Caption x={0} y={6} text="横轴 = 被读取的位置 s，纵轴 = 当前位置 t（只画因果三角）" />
      {s.all.map((e, i) => (
        <MaskTile
          key={e.id}
          e={e}
          x={(i % COL) * tileW + 2}
          y={LABEL + Math.floor(i / COL) * tileH + 14}
          l={s.l}
          active={hot.has(String(i))}
          dim={i >= s.shown}
        />
      ))}
      <Legend
        x={0}
        y={h - 8}
        items={[
          { tone: 'v', text: '读' },
          { tone: 'mask', text: '不读' },
        ]}
        gap={74}
      />
    </Stage>
  );
}

export default function MaskAtlas({ l = 8, layers = 4, title }: MaskAtlasProps) {
  const steps = useMemo(() => maskAtlas(l, layers), [l, layers]);
  return (
    <Explainer steps={steps} title={title ?? '读取集合图谱：同一组输入下各种稀疏注意力的形状'}>
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
