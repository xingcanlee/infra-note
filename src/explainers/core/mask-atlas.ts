/**
 * 读取集合图谱：逐个揭示各种稀疏注意力的掩码形状，并给出三项可比指标。
 *
 * 指标的意义（文章 06 的核心表格）：
 *  - density   ：相对因果基线的可读格子比例，衡量「总共省了多少」
 *  - maxRow    ：单步最多读几个位置，衡量「每步代价是否随 L 增长」——这是 decode 真正关心的
 *  - reach     ：单层能看到的最早位置，衡量「远处的信息还拿不拿得到」
 *
 * 用在：DS 06（总览）、DS 12（机制对照）。
 */
import { formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';
import { maskCatalog, maskDensity, maskMatrix, receptiveField, rowCounts, type MaskSpec } from './masks';

export interface MaskEntry {
  id: string;
  name: string;
  describe: string;
  /** L × L 的可读矩阵 */
  grid: boolean[][];
  /** 相对因果基线的密度 */
  density: number;
  /** 单步最多读多少个位置 */
  maxRow: number;
  /** 单层下最后一个位置能看到的最早位置 */
  reach: number;
  /** 叠 nLayers 层之后能看到的最早位置 */
  reachDeep: number;
}

export interface MaskAtlasState {
  /** 全部机制（固定），用于稳定布局 */
  all: MaskEntry[];
  /** 已揭示的个数 */
  shown: number;
  /** 当前高亮 */
  cur: number | null;
  l: number;
  layers: number;
}

export function maskEntries(l: number, layers = 4, specs: MaskSpec[] = maskCatalog(l)): MaskEntry[] {
  return specs.map((m) => ({
    id: m.id,
    name: m.name,
    describe: m.describe,
    grid: maskMatrix(l, m.fn),
    density: maskDensity(l, m.fn),
    maxRow: Math.max(...rowCounts(l, m.fn)),
    reach: receptiveField(l, m.fn, l - 1, 1),
    reachDeep: receptiveField(l, m.fn, l - 1, layers),
  }));
}

export function maskAtlas(l = 8, layers = 4): Timeline<MaskAtlasState> {
  const all = maskEntries(l, layers);
  const snap = (shown: number, cur: number | null): MaskAtlasState => ({ all, shown, cur, l, layers });

  const tl: Timeline<MaskAtlasState> = [
    {
      state: snap(0, null),
      caption: `序列长 ${l}。下面逐个揭示各种「读取集合」。看三件事：省了多少（密度）、每步最多读几个（单步代价）、以及远处还能不能看到（可达范围）。`,
    },
  ];

  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    const capped = e.maxRow < l ? `单步最多读 ${e.maxRow} 个——与序列长度无关` : `单步最多读 ${e.maxRow} 个——随序列长度增长`;
    const far =
      e.reach === 0
        ? '单层就能直接看到序列开头'
        : e.reachDeep === 0
          ? `单层只能看到位置 ${e.reach}，但叠 ${layers} 层后可间接到达开头`
          : `单层只能看到位置 ${e.reach}，叠 ${layers} 层后也只到位置 ${e.reachDeep}`;
    tl.push({
      state: snap(i + 1, i),
      caption: `${e.name}：${e.describe}。密度 ${f(e.density * 100, 1)}%（相对因果基线）；${capped}；${far}。`,
      focus: [itemId('mask', i)],
    });
  }

  tl.push({
    state: snap(all.length, null),
    caption: `同一张图里可以看出两条独立的轴：「总共省多少」和「每步代价有没有上限」。decode 关心的是后者——只有单步代价被封顶，长上下文的每个 token 才不会越来越慢。`,
  });
  return tl;
}
