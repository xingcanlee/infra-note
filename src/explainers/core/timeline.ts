/** 一帧：渲染器只依赖 state 即可完整绘制。focus 是需要高亮的单元 id，如 'a:1,1'。 */
export type Step<S> = { state: S; caption: string; focus?: string[] };
export type Timeline<S> = Step<S>[];

/** 把索引限制在 [0, length-1]；空时间线返回 0。非整数向下取整，NaN 视为 0。 */
export function clampIndex(i: number, length: number): number {
  if (length <= 0 || Number.isNaN(i)) return 0;
  return Math.min(Math.max(Math.floor(i), 0), length - 1);
}

export const isFirst = (i: number): boolean => i <= 0;
export const isLast = (i: number, length: number): boolean => i >= length - 1;

/** 取第 i 步（越界时夹紧）；空时间线抛错。 */
export function stepAt<S>(tl: Timeline<S>, i: number): Step<S> {
  if (tl.length === 0) throw new Error('时间线为空');
  return tl[clampIndex(i, tl.length)];
}

/** 单元 id：`cellId('a', 1, 0)` => 'a:1,0'。 */
export const cellId = (m: string, r: number, c: number): string => `${m}:${r},${c}`;
