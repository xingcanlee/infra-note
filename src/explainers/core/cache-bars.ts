/**
 * 四种 KV Cache 方案的宽度对照时间线：逐条揭示 MHA → GQA → MQA → MLA，
 * 每一步说明这一行的宽度是怎么算出来的、相对 MHA 省了多少。
 *
 * 用在：DS 02（账本）、DS 03（MQA/GQA）、DS 04（MLA）。
 */
import { formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';
import {
  cacheBytes,
  humanBytes,
  schemeComparison,
  type CacheConfig,
  type SchemeInfo,
} from './kv-cache';

export interface CacheBarsState {
  /** 已揭示的方案（按顺序） */
  shown: SchemeInfo[];
  /** 全部方案，用于算出条形图的比例上限 */
  all: SchemeInfo[];
  /** 当前高亮的方案下标 */
  cur: number | null;
  /** 账本参数 */
  tokens: number;
  layers: number;
  bytes: number;
}

export interface CacheBarsOptions {
  base: Omit<CacheConfig, 'scheme'>;
  /** 账本按多少 token、多少层、每标量多少字节计算 */
  tokens?: number;
  layers?: number;
  bytesPerScalar?: number;
}

export function cacheBarsTimeline(opts: CacheBarsOptions): Timeline<CacheBarsState> {
  const { base } = opts;
  const tokens = opts.tokens ?? 32768;
  const layers = opts.layers ?? 61;
  const bytes = opts.bytesPerScalar ?? 2;
  const all = schemeComparison(base);
  const mha = all[0];

  const snap = (n: number, cur: number | null): CacheBarsState => ({
    shown: all.slice(0, n),
    all,
    cur,
    tokens,
    layers,
    bytes,
  });

  const tl: Timeline<CacheBarsState> = [
    {
      state: snap(0, null),
      caption: `同一个模型配置（${base.nH} 个 head，$d_k = d_v = ${base.dK}$），按 ${tokens} 个 token、${layers} 层、每个数 ${bytes} 字节算账。`,
    },
  ];

  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    const total = cacheBytes(
      { ...base, scheme: s.id, nGroups: base.nGroups, dC: base.dC, dR: base.dR },
      tokens,
      layers,
      bytes,
    );
    const ratio = s.perToken / mha.perToken;
    const rel =
      i === 0
        ? '这是基线。'
        : `相对 MHA 是 ${f(ratio * 100, 1)}%，省掉 ${f((1 - ratio) * 100, 1)}%。`;
    tl.push({
      state: snap(i + 1, i),
      caption: `${s.name}：每 token 每层 ${s.perToken} 个数（${s.formula}）→ 全长 ${humanBytes(total)}。${rel}${s.describe}`,
      focus: [itemId('bar', i)],
    });
  }

  tl.push({
    state: snap(all.length, null),
    caption: `注意纵向对比的前提：同一个 $n_h$ 和 $d_k$。MQA 省得最多但所有 head 共用一份历史；MLA 省得接近 MQA，却让每个 head 仍能算出自己的 K/V——这是第 04 篇要解释的关键。`,
  });
  return tl;
}
