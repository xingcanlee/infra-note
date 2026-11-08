/**
 * MLA 的数据流时间线：压缩成 latent → 只缓存 latent → 用时再按 head 上投影。
 *
 * 用在：DS 04（共享 latent）、DS 05（矩阵吸收的对照）。
 */
import { cellId, formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';

export type MlaPhase = 'intro' | 'compress' | 'cache' | 'up-k' | 'up-v' | 'score' | 'done';

export interface MlaState {
  tokens: string[];
  /** 输入 hidden state（L × d） */
  x: number[][];
  /** 共享 latent 缓存（L × dC）；未写入为 null */
  c: (number | null)[][];
  /** 位置分支缓存（L × dR）；未写入为 null */
  pe: (number | null)[][];
  /** 当前 token 重建出的每个 head 的 K（nH × dK）；未算为 null */
  k: (number | null)[][];
  /** 当前 token 重建出的每个 head 的 V（nH × dV） */
  v: (number | null)[][];
  /** 当前处理到的 token / head */
  s: number | null;
  h: number | null;
  phase: MlaPhase;
  /** 对照：MLA 与 MHA 每 token 每层的缓存宽度 */
  widthMla: number;
  widthMha: number;
}

export interface MlaOptions {
  tokens: string[];
  /** 输入（L × d） */
  x: number[][];
  /** 下投影 W^DKV（d → dC） */
  wDkv: number[][];
  /** 位置分支投影 W^KR（d → dR） */
  wKr: number[][];
  /** 每个 head 的上投影 W^UK_h（dC → dK） */
  wUk: number[][][];
  /** 每个 head 的上投影 W^UV_h（dC → dV） */
  wUv: number[][][];
}

const matvec = (m: number[][], x: number[]): number[] => m.map((row) => row.reduce((a, w, i) => a + w * x[i], 0));

export function mlaFlow(opts: MlaOptions): Timeline<MlaState> {
  const { tokens, x, wDkv, wKr, wUk, wUv } = opts;
  const l = x.length;
  const dC = wDkv.length;
  const dR = wKr.length;
  const nH = wUk.length;
  const dK = wUk[0].length;
  const dV = wUv[0].length;
  if (wUv.length !== nH) throw new Error(`W^UK 与 W^UV 的 head 数必须相同：${nH}/${wUv.length}`);
  if (tokens.length !== l) throw new Error(`token 数（${tokens.length}）必须等于序列长度（${l}）`);

  const widthMla = dC + dR;
  const widthMha = nH * (dK + dV);

  const c: (number | null)[][] = Array.from({ length: l }, () => Array(dC).fill(null));
  const pe: (number | null)[][] = Array.from({ length: l }, () => Array(dR).fill(null));
  let k: (number | null)[][] = Array.from({ length: nH }, () => Array(dK).fill(null));
  let v: (number | null)[][] = Array.from({ length: nH }, () => Array(dV).fill(null));

  const snap = (phase: MlaPhase, s: number | null, h: number | null): MlaState => ({
    tokens,
    x,
    c: c.map((r) => r.slice()),
    pe: pe.map((r) => r.slice()),
    k: k.map((r) => r.slice()),
    v: v.map((r) => r.slice()),
    s,
    h,
    phase,
    widthMla,
    widthMha,
  });

  const tl: Timeline<MlaState> = [
    {
      state: snap('intro', null, null),
      caption: `${nH} 个 head、每个 head K/V 各 ${dK} 维：按 MHA 存法每 token 每层要 ${widthMha} 个数。MLA 改成只存一个 ${dC} 维的共享 latent 加 ${dR} 维位置分支，共 ${widthMla} 个数。`,
    },
  ];

  for (let s = 0; s < l; s++) {
    // ① 下投影：把 hidden state 压成一个所有 head 共享的 latent
    const cs = matvec(wDkv, x[s]);
    for (let i = 0; i < dC; i++) c[s][i] = cs[i];
    tl.push({
      state: snap('compress', s, null),
      caption: `压缩：c${s} = W^DKV · x${s} = [${cs.map((z) => f(z)).join(', ')}]。${x[0].length} 维压到 ${dC} 维，这一份被所有 ${nH} 个 head 共用。`,
      focus: [itemId('x', s), ...Array.from({ length: dC }, (_, i) => cellId('c', s, i))],
    });

    // ② 位置分支：RoPE 要用的那一小段单独走
    const peS = matvec(wKr, x[s]);
    for (let i = 0; i < dR; i++) pe[s][i] = peS[i];
    tl.push({
      state: snap('cache', s, null),
      caption: `入缓存：latent ${dC} 个数 + 位置分支 ${dR} 个数 = ${widthMla} 个数。同样一个 token，MHA 要存 ${widthMha} 个——省了 ${f(widthMha / widthMla, 1)} 倍。`,
      focus: [...Array.from({ length: dC }, (_, i) => cellId('c', s, i)), ...Array.from({ length: dR }, (_, i) => cellId('pe', s, i))],
    });
  }

  // ③ 读取时再按 head 上投影：缓存里没有 K/V，它们是算出来的
  const last = l - 1;
  k = Array.from({ length: nH }, () => Array(dK).fill(null));
  v = Array.from({ length: nH }, () => Array(dV).fill(null));
  const cLast = c[last].map((z) => z!);
  for (let h = 0; h < nH; h++) {
    const kh = matvec(wUk[h], cLast);
    k[h] = kh;
    tl.push({
      state: snap('up-k', last, h),
      caption: `上投影：head ${h} 的 Key = W^UK_${h} · c${last} = [${kh.map((z) => f(z)).join(', ')}]。同一个 latent，不同的 W^UK_h，得到不同的 Key——这是 MLA 与 MQA 的根本差别。`,
      focus: [...Array.from({ length: dC }, (_, i) => cellId('c', last, i)), ...Array.from({ length: dK }, (_, i) => cellId('k', h, i))],
    });

    const vh = matvec(wUv[h], cLast);
    v[h] = vh;
    tl.push({
      state: snap('up-v', last, h),
      caption: `上投影：head ${h} 的 Value = W^UV_${h} · c${last} = [${vh.map((z) => f(z)).join(', ')}]。每个 head 仍能从同一份历史里取出自己那一侧面。`,
      focus: [...Array.from({ length: dC }, (_, i) => cellId('c', last, i)), ...Array.from({ length: dV }, (_, i) => cellId('v', h, i))],
    });
  }

  tl.push({
    state: snap('done', last, null),
    caption: `缓存里从来没有出现完整的 K/V——它们是读取时由 latent 现算的。代价是多了上投影的计算，收益是缓存窄了 ${f(widthMha / widthMla, 1)} 倍。第 05 篇会说明这笔计算其实可以被"吸收"掉。`,
  });

  return tl;
}

/** MLA 与 MHA 的缓存宽度对照（元素个数，与存储精度无关）。 */
export function mlaWidths(cfg: { nH: number; dK: number; dV: number; dC: number; dR: number }) {
  const mla = cfg.dC + cfg.dR;
  const mha = cfg.nH * (cfg.dK + cfg.dV);
  return { mla, mha, ratio: mha / mla };
}
