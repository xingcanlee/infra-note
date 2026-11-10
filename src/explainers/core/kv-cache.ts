/**
 * KV Cache 的增长与显存账本。
 *
 * 同一套表示支撑 MHA / MQA / GQA / MLA 四种方案：它们的区别只是
 * 「每个 token 在缓存里占多宽」以及「这一宽度是共享的还是压缩的」。
 */
import { cellId, formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';

/** 缓存方案。 */
export type CacheScheme = 'mha' | 'mqa' | 'gqa' | 'mla';

export interface CacheConfig {
  scheme: CacheScheme;
  /** Query head 数 */
  nH: number;
  /** 每个 head 的 K / V 维度 */
  dK: number;
  dV: number;
  /** GQA 的组数（每组共享一份 K/V）；仅 scheme = 'gqa' 时有意义 */
  nGroups?: number;
  /** MLA 的 latent 维与位置分支维；仅 scheme = 'mla' 时有意义 */
  dC?: number;
  dR?: number;
}

export interface SchemeInfo {
  id: CacheScheme;
  name: string;
  /** 每个 token、每层缓存的标量个数 */
  perToken: number;
  /** 一句话说明这一宽度是怎么来的 */
  formula: string;
  describe: string;
}

/** 每个 token 每层需要缓存多少个标量，以及这个数字是怎么来的。 */
export function schemeInfo(cfg: CacheConfig): SchemeInfo {
  const { nH, dK, dV } = cfg;
  switch (cfg.scheme) {
    case 'mha':
      return {
        id: 'mha',
        name: 'MHA',
        perToken: nH * (dK + dV),
        formula: `n_h × (d_k + d_v) = ${nH} × (${dK} + ${dV})`,
        describe: '每个 head 存自己的 K 和 V，缓存最宽，表达力最强。',
      };
    case 'mqa':
      return {
        id: 'mqa',
        name: 'MQA',
        perToken: dK + dV,
        formula: `d_k + d_v = ${dK} + ${dV}`,
        describe: '所有 Query head 共享同一份 K/V，缓存最小，但历史表示被迫统一。',
      };
    case 'gqa': {
      const g = cfg.nGroups ?? 1;
      if (g <= 0 || nH % g !== 0) throw new Error(`GQA 的组数（${g}）必须整除 head 数（${nH}）`);
      return {
        id: 'gqa',
        name: `GQA g=${g}`,
        perToken: g * (dK + dV),
        formula: `g × (d_k + d_v) = ${g} × (${dK} + ${dV})`,
        describe: '每组 head 共享一份 K/V，在 MHA 与 MQA 之间取折中。',
      };
    }
    case 'mla': {
      const dc = cfg.dC ?? 0;
      const dr = cfg.dR ?? 0;
      if (dc <= 0) throw new Error('MLA 需要给出 latent 维度 d_c');
      return {
        id: 'mla',
        name: 'MLA',
        perToken: dc + dr,
        formula: `d_c + d_r = ${dc} + ${dr}`,
        describe:
          '缓存一份所有 head 共享的低维 latent，加一条位置分支；每个 head 仍能算出不同的 K/V。',
      };
    }
  }
}

/** 缓存字节数 = 层数 × token 数 × 每 token 标量数 × 每标量字节数 × 2（K 与 V 已含在 perToken 中）。 */
export function cacheBytes(
  cfg: CacheConfig,
  tokens: number,
  layers: number,
  bytesPerScalar = 2,
): number {
  return schemeInfo(cfg).perToken * tokens * layers * bytesPerScalar;
}

/** 人类可读的字节数。 */
export function humanBytes(n: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  let x = n;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${f(x, 2)} ${units[i]}`;
}

/** 几种方案在同一配置下的对照（用于柱状对照动画与文章表格）。 */
export function schemeComparison(base: Omit<CacheConfig, 'scheme'>): SchemeInfo[] {
  return [
    schemeInfo({ ...base, scheme: 'mha' }),
    schemeInfo({ ...base, scheme: 'gqa' }),
    schemeInfo({ ...base, scheme: 'mqa' }),
    schemeInfo({ ...base, scheme: 'mla' }),
  ];
}

// ───────────────────────── 分步时间线 ─────────────────────────

export type CachePhase = 'prefill' | 'read' | 'append' | 'done';

export interface CacheState {
  tokens: string[];
  /** 已经进入缓存的 token 数 */
  cached: number;
  /** 本轮正在生成的 token 下标（prefill 阶段为 null） */
  cur: number | null;
  /** 本轮读取的缓存位置 */
  reading: number[];
  /** 缓存内容：每行一个 token，列为该方案的缓存宽度（示意值） */
  rows: (number | null)[][];
  scheme: SchemeInfo;
  phase: CachePhase;
  /** 不用缓存时，本轮需要重算的 token 数（用于对照） */
  recomputeWithout: number;
}

export interface CacheTimelineOptions {
  tokens: string[];
  /** prefill 的 token 数，其余为逐个 decode */
  prefill: number;
  cfg: CacheConfig;
  /** 缓存宽度在画面上显示为几列（示意，不等于真实维度） */
  cols?: number;
}

/**
 * 演示 prefill 建立缓存、decode 逐个追加并读取全部历史。
 *
 * 同时给出「不用缓存要重算多少」，这是 02 篇的核心对照。
 */
export function cacheTimeline(opts: CacheTimelineOptions): Timeline<CacheState> {
  const { tokens, prefill, cfg } = opts;
  const info = schemeInfo(cfg);
  const cols = opts.cols ?? Math.min(info.perToken, 6);
  const l = tokens.length;
  if (prefill < 1 || prefill > l) throw new Error(`prefill（${prefill}）必须在 1…${l} 之间`);

  const rows: (number | null)[][] = Array.from({ length: l }, () => Array(cols).fill(null));
  let cached = 0;

  const snap = (
    phase: CachePhase,
    cur: number | null,
    reading: number[],
    recompute: number,
  ): CacheState => ({
    tokens,
    cached,
    cur,
    reading: reading.slice(),
    rows: rows.map((r) => r.slice()),
    scheme: info,
    phase,
    recomputeWithout: recompute,
  });

  const fill = (i: number) => {
    for (let c = 0; c < cols; c++) rows[i][c] = ((i + 1) * (c + 2)) % 7;
  };

  const tl: Timeline<CacheState> = [];

  // prefill：整段输入一次算完，K/V 全部写入缓存
  for (let i = 0; i < prefill; i++) fill(i);
  cached = prefill;
  tl.push({
    state: snap('prefill', null, [], prefill),
    caption: `prefill：前 ${prefill} 个 token 一次送进模型，算出的 K/V 写入缓存。${info.name} 下每个 token 每层占 ${info.perToken} 个数（${info.formula}）。`,
    focus: Array.from({ length: prefill }, (_, i) => itemId('row', i)),
  });

  // decode：每轮一个 token
  for (let t = prefill; t < l; t++) {
    const reading = Array.from({ length: cached }, (_, i) => i);
    tl.push({
      state: snap('read', t, reading, t + 1),
      caption: `decode 第 ${t - prefill + 1} 轮：生成「${tokens[t]}」需要读 ${cached} 个历史位置的 K/V。缓存命中，不必重算。`,
      focus: reading.map((i) => itemId('row', i)),
    });
    fill(t);
    cached = t + 1;
    tl.push({
      state: snap('append', t, [], t + 1),
      caption: `追加：把「${tokens[t]}」自己的 K/V 写进缓存第 ${t} 行。缓存现在有 ${cached} 行——它随序列长度线性增长，这就是显存压力的来源。`,
      focus: [itemId('row', t), cellId('row', t, 0)],
    });
  }

  tl.push({
    state: snap('done', null, [], l),
    caption: `完成。用缓存：每轮只算 1 个 token 的 K/V；不用缓存：第 ${l} 轮要把前 ${l} 个 token 全部重算一遍。代价是显存里长期压着 ${l} 行 × ${info.perToken} 个数 × 层数。`,
  });
  return tl;
}
