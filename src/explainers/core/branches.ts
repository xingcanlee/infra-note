/**
 * 多分支注意力：每条分支各自决定「读哪些位置」，再按 gate 权重合并。
 *
 * NSA（压缩 / 选块 / 窗口）、CSA（压缩+稀疏 / 窗口）、HCA（重压缩 / 窗口）都是这个结构，
 * 区别只在分支的构成与各自的读取集合。
 *
 * 画面固定看一个 query 位置 t 的一行，因此每条分支是一条长度为 L 的条带。
 *
 * 用在：DS 08（NSA）、DS 10（CSA）、DS 11（HCA）。
 */
import { formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';
import type { MaskFn } from './masks';

export interface BranchSpec {
  id: string;
  name: string;
  /** 一句话说明这条分支负责什么 */
  role: string;
  /** 这条分支的读取集合 */
  fn: MaskFn;
  /** gate 权重（0–1） */
  gate: number;
  /** 这条分支读的是原始 token 还是压缩条目 */
  unit?: 'token' | 'block';
}

export interface BranchState {
  l: number;
  /** 当前 query 位置 */
  t: number;
  branches: BranchSpec[];
  /** 每条分支的读取标记（与 branches 对齐）；未揭示为 null */
  reads: (boolean[] | null)[];
  /** 已揭示的分支数 */
  shown: number;
  /** 当前高亮的分支 */
  cur: number | null;
  /** 是否已经进入合并阶段 */
  merged: boolean;
  /** 合并后的总读取集合（并集） */
  union: boolean[] | null;
  phase: 'intro' | 'branch' | 'gate' | 'merge' | 'done';
}

export interface BranchOptions {
  l: number;
  /** 看哪个 query 位置，默认最后一个 */
  t?: number;
  branches: BranchSpec[];
}

/** 这条分支在位置 t 读了几个。 */
export const branchCount = (b: BranchSpec, t: number, l: number): number => {
  let n = 0;
  for (let s = 0; s <= t; s++) if (b.fn(t, s, l)) n++;
  return n;
};

export function branchFlow(opts: BranchOptions): Timeline<BranchState> {
  const { l, branches } = opts;
  const t = opts.t ?? l - 1;
  if (branches.length === 0) throw new Error('至少要有一条分支');
  if (t < 0 || t >= l) throw new Error(`query 位置（${t}）必须在 0…${l - 1} 之间`);

  const reads: (boolean[] | null)[] = branches.map(() => null);

  const snap = (over: Partial<BranchState> & { phase: BranchState['phase'] }): BranchState => ({
    l,
    t,
    branches,
    reads: reads.map((r) => (r ? r.slice() : null)),
    shown: reads.filter(Boolean).length,
    cur: null,
    merged: false,
    union: null,
    ...over,
  });

  const tl: Timeline<BranchState> = [
    {
      state: snap({ phase: 'intro' }),
      caption: `看位置 ${t} 这一行：它要读哪些历史？单独一条分支做不到「近处精细 + 远处够得着」，所以用 ${branches.length} 条分支分工。`,
    },
  ];

  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    reads[i] = Array.from({ length: l }, (_, s) => b.fn(t, s, l));
    const n = branchCount(b, t, l);
    tl.push({
      state: snap({ phase: 'branch', cur: i }),
      caption: `${b.name}：${b.role}。在位置 ${t} 读 ${n} 个${b.unit === 'block' ? '压缩条目' : '原始 token'}。`,
      focus: [itemId('branch', i)],
    });
  }

  tl.push({
    state: snap({ phase: 'gate' }),
    caption: `每条分支各自算一遍注意力，再按 gate 权重 [${branches.map((b) => f(b.gate)).join(', ')}] 加权求和。gate 由当前 token 的特征算出，所以不同 token 可以倚重不同分支。`,
    focus: branches.map((_, i) => itemId('gate', i)),
  });

  const union = Array.from({ length: l }, (_, s) => branches.some((b) => b.fn(t, s, l)));
  const total = union.filter(Boolean).length;
  tl.push({
    state: snap({ phase: 'merge', merged: true, union }),
    caption: `合并后这一行总共覆盖 ${total} / ${t + 1} 个历史位置。注意三条分支用的是各自独立的 K/V，不是同一份——这样每条分支才能学到不同的模式。`,
  });

  tl.push({
    state: snap({ phase: 'done', merged: true, union }),
    caption: `关键性质：每条分支的读取量都有上限，所以合并后的单步代价也有上限——与序列长度无关。这正是第 06 篇那三个指标里最要紧的一条。`,
  });

  return tl;
}
