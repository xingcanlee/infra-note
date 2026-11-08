/**
 * CSA2 的跨层复用：每层静态指定 Full / Reindex / Reuse 三种 mode 之一。
 *
 * 三种 mode 的区别只在「这一层自己算什么、复用什么」（V4.1 §2.3.1）：
 *   Full    ：生成 main KV 与 indexer K，跑 indexer，产生新的 Top-K
 *   Reindex ：复用最近 Full 层的 main KV 与 indexer K，但用自己的 indexer Q 重新打分
 *   Reuse   ：复用最近可用的 main KV，也复用最近一次产生的 Top-K，不打分
 *
 * 三种 mode 都计算本层自己的 main Q 和 SWA KV。
 *
 * 用在：DS 21（CSA2）。
 */
import { itemId, formatNumber as f, type Timeline } from 'astro-wisp/explainers/core';

export type LayerMode = 'full' | 'reindex' | 'reuse';

export interface LayerState {
  modes: LayerMode[];
  /** 已处理到第几层（-1 表示还没开始） */
  cur: number;
  /** 每层使用的 main KV 来自哪一层 */
  kvFrom: (number | null)[];
  /** 每层使用的 Top-K 来自哪一层 */
  topkFrom: (number | null)[];
  /** 累计：生成了几份 main KV、跑了几次 indexer */
  nKv: number;
  nIndexer: number;
  nLayers: number;
  phase: 'intro' | 'layer' | 'done';
}

export interface LayerModeOptions {
  modes: LayerMode[];
}

export function layerModeFlow(opts: LayerModeOptions): Timeline<LayerState> {
  const { modes } = opts;
  const n = modes.length;
  if (n === 0) throw new Error('至少要有一层');
  if (modes[0] !== 'full') throw new Error('第一层必须是 Full——没有可复用的来源');

  const kvFrom: (number | null)[] = Array(n).fill(null);
  const topkFrom: (number | null)[] = Array(n).fill(null);
  let nKv = 0;
  let nIndexer = 0;
  let lastFull = -1; // 最近一个 Full 层（main KV 与 indexer K 的来源）
  let lastTopk = -1; // 最近一次产生 Top-K 的层

  const snap = (over: Partial<LayerState> & { phase: LayerState['phase'] }): LayerState => ({
    modes,
    cur: -1,
    kvFrom: kvFrom.slice(),
    topkFrom: topkFrom.slice(),
    nKv,
    nIndexer,
    nLayers: n,
    ...over,
  });

  const tl: Timeline<LayerState> = [
    {
      state: snap({ phase: 'intro' }),
      caption: `${n} 层，每层静态指定一种 mode。注意：**三种 mode 都要算本层自己的 main Q 和 SWA KV**，区别只在 main KV 与 Top-K 是自己算还是复用。`,
    },
  ];

  for (let l = 0; l < n; l++) {
    const m = modes[l];
    let caption: string;

    if (m === 'full') {
      nKv++;
      nIndexer++;
      lastFull = l;
      lastTopk = l;
      kvFrom[l] = l;
      topkFrom[l] = l;
      caption = `第 ${l} 层 · Full：自己生成 main KV 和 indexer K，跑一次 indexer 产生新的 Top-K。这是后面几层的复用来源。`;
    } else if (m === 'reindex') {
      nIndexer++;
      lastTopk = l;
      kvFrom[l] = lastFull;
      topkFrom[l] = l;
      caption = `第 ${l} 层 · Reindex：复用第 ${lastFull} 层的 main KV 与 indexer K（**不新增缓存**），但用自己的 indexer Q 重新打分 → 新的 Top-K。KV 共享，选择可变。`;
    } else {
      kvFrom[l] = lastFull;
      topkFrom[l] = lastTopk;
      caption = `第 ${l} 层 · Reuse：main KV 复用第 ${lastFull} 层，Top-K 也复用第 ${lastTopk} 层的结果。不算 indexer Q、不打分，直接做稀疏注意力——**最省的一档**。`;
    }

    tl.push({
      state: snap({ phase: 'layer', cur: l }),
      caption,
      focus: [itemId('layer', l)],
    });
  }

  const dense = n; // 每层都 Full 时的份数
  tl.push({
    state: snap({ phase: 'done', cur: n - 1 }),
    caption: `合计：${nKv} 份 main KV（每层都 Full 要 ${dense} 份，省 ${f((1 - nKv / dense) * 100, 0)}%）、${nIndexer} 次 indexer（省 ${f((1 - nIndexer / dense) * 100, 0)}%）。缓存共享与索引复用是**两件可以分开调的事**。`,
  });

  return tl;
}

/** 统计一组 mode 的开销。 */
export function modeCost(modes: LayerMode[]) {
  const nKv = modes.filter((m) => m === 'full').length;
  const nIndexer = modes.filter((m) => m === 'full' || m === 'reindex').length;
  return {
    nKv,
    nIndexer,
    nLayers: modes.length,
    kvRatio: nKv / modes.length,
    indexerRatio: nIndexer / modes.length,
  };
}
