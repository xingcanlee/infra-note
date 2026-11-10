/**
 * KV Cache 的增长动画：prefill 建表、decode 读全表并追加一行。
 *
 * 用在：DS 02（缓存是什么）、DS 03/04（换 scheme 看缓存宽度变化）、DS 11（跨层复用）。
 */
import { useMemo } from 'react';
import {
  CELL,
  Cell,
  Explainer,
  Label,
  Stage,
  focusOf,
  formatNumber as f,
} from 'astro-wisp/explainers';
import { cacheTimeline, humanBytes, type CacheConfig, type CacheState } from '../core/kv-cache';
import { Caption, Legend } from './primitives';
import { DIMS, TOKENS } from '../core/toy';

export interface KVCacheViewProps {
  tokens?: string[];
  prefill?: number;
  cfg?: CacheConfig;
  /** 账本：层数与每标量字节数，用于把 toy 规模换算成真实显存量级 */
  layers?: number;
  bytesPerScalar?: number;
  title?: string;
}

const GUT = 70;
const TOP = 26;
const SMALL = 30; // 缓存格子比注意力格子小，便于显示多列

function Scene({
  s,
  focus,
  layers,
  bytes,
}: {
  s: CacheState;
  focus?: string[];
  layers: number;
  bytes: number;
}) {
  const l = s.tokens.length;
  const cols = s.rows[0].length;
  const gridW = cols * SMALL;
  const panelX = GUT + gridW + 36;
  const w = panelX + 230;
  const h = TOP + l * CELL + 44;
  const hotRows = focusOf(focus, 'row');

  const liveBytes = s.scheme.perToken * s.cached * layers * bytes;

  return (
    <Stage width={w} height={h} label={`KV Cache：${s.cached} / ${l} 行已缓存`}>
      <Caption x={0} y={TOP / 2} text="缓存" tone="v" />
      <Caption x={GUT} y={TOP / 2} text={`每 token ${s.scheme.perToken} 个数`} tone="v" />

      {s.tokens.map((tok, t) => {
        const filled = s.rows[t][0] !== null;
        const reading = s.reading.includes(t);
        const isCur = s.cur === t;
        return (
          <g key={t} opacity={filled ? 1 : 0.4}>
            <Label
              x={GUT - 10}
              y={TOP + t * CELL + CELL / 2}
              text={`${t} ${tok}`}
              tone={isCur ? 'q' : 'v'}
              anchor="end"
            />
            {s.rows[t].map((val, c) => (
              <Cell
                key={c}
                x={GUT + c * SMALL}
                y={TOP + t * CELL + (CELL - SMALL) / 2}
                size={SMALL - 3}
                tone={filled ? 'v' : 'mask'}
                empty={val === null}
                state={hotRows.has(String(t)) || reading ? 'strong' : 'none'}
                text={val === null ? '·' : f(val)}
              />
            ))}
          </g>
        );
      })}

      {/* 右侧账本 */}
      <g>
        <Caption x={panelX} y={TOP + 6} text={`方案：${s.scheme.name}`} tone="q" />
        {/* 名称与公式分两行：MHA/GQA 公式加前缀约 250px，超过面板预算 230px 会被右缘裁切 */}
        <Caption x={panelX} y={TOP + 28} text="宽度（每 token 每层）" />
        <Caption x={panelX} y={TOP + 50} text={s.scheme.formula} />
        <Caption x={panelX} y={TOP + 72} text={`已缓存 ${s.cached} 行 × ${layers} 层`} />
        <Caption
          x={panelX}
          y={TOP + 94}
          text={`≈ ${humanBytes(liveBytes)}（${bytes} 字节/数）`}
          tone="v"
        />
        <Caption x={panelX} y={TOP + 124} text="本轮如果不用缓存：" />
        <Caption
          x={panelX}
          y={TOP + 146}
          text={`要重算 ${s.recomputeWithout} 个 token 的 K/V`}
          tone="error"
        />
      </g>

      <Legend
        x={GUT}
        y={h - 14}
        items={[
          { tone: 'v', text: '已缓存' },
          { tone: 'mask', text: '还没有' },
          { tone: 'q', text: '本轮生成' },
        ]}
        gap={100}
      />
    </Stage>
  );
}

export default function KVCacheView({
  tokens,
  prefill = 2,
  cfg,
  layers = 61,
  bytesPerScalar = 2,
  title,
}: KVCacheViewProps) {
  const steps = useMemo(() => {
    const config: CacheConfig = cfg ?? { scheme: 'mha', nH: DIMS.nH, dK: DIMS.dK, dV: DIMS.dV };
    return cacheTimeline({ tokens: tokens ?? [...TOKENS], prefill, cfg: config });
  }, [tokens, prefill, cfg]);
  return (
    <Explainer steps={steps} title={title ?? 'KV Cache：prefill 建表，decode 读表再追加'}>
      {(step) => <Scene s={step.state} focus={step.focus} layers={layers} bytes={bytesPerScalar} />}
    </Explainer>
  );
}
