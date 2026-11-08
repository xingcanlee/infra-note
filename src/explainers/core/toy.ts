/**
 * 全站共用的 toy 输入。
 *
 * 所有系列文章的数值例子都从这里取，使读者能在不同机制之间横向对照同一组输入。
 * 参数见 `design/series-plan.md` §共用 toy 输入。
 */

/** 共用的 4 token 序列。 */
export const TOKENS = ['我', '在', '读', '注意力'] as const;

/** 共用维度。 */
export const DIMS = {
  /** 序列长度 */
  L: 4,
  /** 模型隐藏维度 */
  d: 8,
  /** head 数 */
  nH: 2,
  /** 每个 head 的 Key / Value 维度 */
  dK: 4,
  dV: 4,
  /** MLA 压缩维（latent） */
  dC: 3,
  /** MLA 位置分支维 */
  dR: 2,
} as const;

/**
 * 确定性的小整数矩阵：用一个固定的线性同余式生成 −2…3 范围内的值。
 *
 * 不用随机数，保证文章里印出的数字、动画里显示的数字、读者本地跑 toy 代码得到的数字完全一致。
 */
export function toyMatrix(rows: number, cols: number, seed = 1): number[][] {
  const out: number[][] = [];
  let x = seed * 7 + 3;
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      x = (x * 13 + 7) % 23;
      row.push((x % 6) - 2);
    }
    out.push(row);
  }
  return out;
}

/**
 * 共用的 Q / K / V（4 × 4）。
 *
 * 这组数字同时出现在文章正文（手算示例）、动画画面和读者本地的 toy 代码里，
 * 三处必须一致，因此写死而不是生成。核对点：q2·k0 = 9，除以 √4 得 e[2][0] = 4.5。
 */
export const TOY_Q = [
  [1, 2, 0, -1],
  [3, -2, 1, 0],
  [-1, 1, 2, 3],
  [0, -1, -2, 1],
] as const;

export const TOY_K = [
  [-2, 1, 3, 0],
  [1, 0, -1, 2],
  [2, 3, 0, -2],
  [-1, -2, 1, 1],
] as const;

export const TOY_V = [
  [0, 3, -1, 2],
  [1, -1, 2, 0],
  [3, 0, 1, -2],
  [-2, 2, 0, 3],
] as const;

const clone = (m: ReadonlyArray<ReadonlyArray<number>>): number[][] => m.map((r) => [...r]);

/**
 * 注意力相关讲解与文章共用的 Q / K / V。
 *
 * 默认（4 × 4）返回上面写死的那组；其他尺寸退回到确定性生成，仍然可复现。
 */
export function toyQKV(l: number = DIMS.L, dk: number = DIMS.dK) {
  if (l === 4 && dk === 4) return { q: clone(TOY_Q), k: clone(TOY_K), v: clone(TOY_V) };
  return {
    q: toyMatrix(l, dk, 1),
    k: toyMatrix(l, dk, 2),
    v: toyMatrix(l, dk, 3),
  };
}
