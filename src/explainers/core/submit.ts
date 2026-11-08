/**
 * 提交时间线：CPU 把 kernel 提交给设备，设备执行。两条车道各自排队。
 *
 * 这个模型只解释「为什么 decode 会被提交开销卡住」以及「图模式消掉了哪一段」，
 * 不是性能模拟器：launch / exec 的耗时是示意参数，不是任何真实硬件的测量值。
 *
 * 三种模式：
 *  - eager    ：每个算子单独提交，CPU 提交 N 次
 *  - piecewise：能捕获的连续片段各打包成一张图，attention 之类的算子仍单独提交
 *  - full     ：整轮打包成一张图，CPU 只提交 1 次
 *
 * 用在：vLLM 00、01、03；DS 19。
 */
import { formatNumber as f, itemId, type Timeline } from 'astro-wisp/explainers/core';

export type SubmitMode = 'eager' | 'piecewise' | 'full';

export interface OpSpec {
  name: string;
  /** 设备上执行多久（示意单位） */
  exec: number;
  /** 是否是图捕获不了的算子（如需要动态 shape 的 attention） */
  graphBreak?: boolean;
  /**
   * 这个算子之后 CPU 必须等设备算完才能继续（如 .item()、.cpu()、打印张量）。
   *
   * 同步点会把两条车道强行对齐：CPU 不能再提前跑在设备前面，于是「提交被执行掩盖」
   * 这件事不再成立。它同时也是图捕获的硬障碍（见 vLLM 系列第 04 篇）。
   */
  sync?: boolean;
}

export interface Launch {
  /** 这次提交覆盖了哪些算子（下标） */
  ops: number[];
  cpuStart: number;
  cpuEnd: number;
  devStart: number;
  devEnd: number;
  /** 是一次图 replay 还是逐算子提交 */
  kind: 'op' | 'graph';
  /** 这次提交之后 CPU 被同步点阻塞 */
  sync?: boolean;
}

export interface SubmitState {
  mode: SubmitMode;
  ops: OpSpec[];
  launches: Launch[];
  /** 已经走到第几次提交 */
  done: number;
  /** CPU 提交总耗时 */
  cpuTotal: number;
  /** 设备执行总耗时 */
  devTotal: number;
  /** 整轮墙钟时间 */
  wall: number;
  /** 设备因为等提交而空闲的时间 */
  bubble: number;
  /** 提交次数 */
  nLaunch: number;
  /** CPU 被同步点阻塞的次数 */
  nSync: number;
  cur: number | null;
}

export interface SubmitOptions {
  mode: SubmitMode;
  ops: OpSpec[];
  /** 每次逐算子提交的 CPU 开销 */
  launchCost?: number;
  /** 一次图 replay 的 CPU 开销 */
  graphLaunchCost?: number;
}

/** 把算子按模式切成若干次提交。 */
export function planLaunches(opts: SubmitOptions): Launch[] {
  const { mode, ops } = opts;
  const lc = opts.launchCost ?? 1;
  const glc = opts.graphLaunchCost ?? 1.2;

  // 分组：每组是一次提交
  const groups: Array<{ ops: number[]; kind: 'op' | 'graph' }> = [];
  if (mode === 'eager') {
    ops.forEach((_, i) => groups.push({ ops: [i], kind: 'op' }));
  } else if (mode === 'full') {
    if (ops.some((o) => o.graphBreak)) {
      throw new Error('full 模式要求所有算子都能被捕获；存在 graphBreak 的算子时只能用 piecewise');
    }
    if (ops.some((o) => o.sync)) {
      throw new Error('full 模式要求整段没有 CPU 同步点；同步点会打断捕获');
    }
    groups.push({ ops: ops.map((_, i) => i), kind: 'graph' });
  } else {
    let cur: number[] = [];
    ops.forEach((o, i) => {
      if (o.graphBreak) {
        if (cur.length) groups.push({ ops: cur, kind: 'graph' });
        cur = [];
        groups.push({ ops: [i], kind: 'op' }); // 图外算子单独提交
      } else {
        cur.push(i);
      }
    });
    if (cur.length) groups.push({ ops: cur, kind: 'graph' });
  }

  // 排两条车道：CPU 串行提交；设备串行执行，且不能早于对应提交完成。
  // 遇到同步点，CPU 要等设备追上来才能继续提交下一组。
  const launches: Launch[] = [];
  let cpu = 0;
  let dev = 0;
  for (const g of groups) {
    const cost = g.kind === 'graph' ? glc : lc;
    const cpuStart = cpu;
    const cpuEnd = cpu + cost;
    cpu = cpuEnd;
    const execSum = g.ops.reduce((a, i) => a + ops[i].exec, 0);
    const devStart = Math.max(dev, cpuEnd);
    const devEnd = devStart + execSum;
    dev = devEnd;
    const sync = g.ops.some((i) => ops[i].sync);
    if (sync) cpu = Math.max(cpu, devEnd); // CPU 阻塞，等设备算完
    launches.push({ ops: g.ops, cpuStart, cpuEnd, devStart, devEnd, kind: g.kind, sync });
  }
  return launches;
}

export function submitStats(launches: Launch[], ops: OpSpec[]) {
  const nSync = launches.filter((l) => l.sync).length;
  const cpuTotal = launches.reduce((a, l) => a + (l.cpuEnd - l.cpuStart), 0);
  const devTotal = ops.reduce((a, o) => a + o.exec, 0);
  const wall = launches.length ? launches[launches.length - 1].devEnd : 0;
  let bubble = 0;
  let prevDevEnd = 0;
  for (const l of launches) {
    bubble += Math.max(0, l.devStart - prevDevEnd);
    prevDevEnd = l.devEnd;
  }
  return { cpuTotal, devTotal, wall, bubble, nLaunch: launches.length, nSync };
}

export function submitFlow(opts: SubmitOptions): Timeline<SubmitState> {
  const { mode, ops } = opts;
  if (ops.length === 0) throw new Error('至少要有一个算子');
  const launches = planLaunches(opts);
  const stats = submitStats(launches, ops);

  const snap = (done: number, cur: number | null): SubmitState => ({
    mode,
    ops,
    launches: launches.slice(0, done),
    done,
    ...stats,
    cur,
  });

  const modeName = mode === 'eager' ? 'eager（逐算子提交）' : mode === 'full' ? 'full graph（整轮一次 replay）' : 'piecewise（分段图）';

  const tl: Timeline<SubmitState> = [
    {
      state: snap(0, null),
      caption: `${modeName}：${ops.length} 个算子，设备执行合计 ${f(stats.devTotal)}。上面一条是 CPU 提交，下面一条是设备执行。`,
    },
  ];

  launches.forEach((l, i) => {
    const names = l.ops.map((o) => ops[o].name).join('、');
    const wait = l.devStart - (i === 0 ? 0 : launches[i - 1].devEnd);
    const waitMsg = wait > 0.001 ? `设备空等了 ${f(wait)}——它在等 CPU 把活交下来。` : '设备接着上一段继续跑，没有空档。';
    tl.push({
      state: snap(i + 1, i),
      caption:
        (l.kind === 'graph'
          ? `第 ${i + 1} 次提交：一次 replay 覆盖 ${l.ops.length} 个算子（${names}）。${waitMsg}`
          : `第 ${i + 1} 次提交：单个算子 ${names}。${waitMsg}`) +
        (l.sync ? ` 这里有一个同步点：CPU 必须停下来等设备算完（到 ${f(l.devEnd)}）才能继续提交。` : ''),
      focus: [itemId('launch', i)],
    });
  });

  tl.push({
    state: snap(launches.length, null),
    caption: `合计：提交 ${stats.nLaunch} 次、CPU 花 ${f(stats.cpuTotal)}，设备干活 ${f(stats.devTotal)}，墙钟 ${f(stats.wall)}，其中设备空闲 ${f(stats.bubble)}（占 ${f((stats.bubble / stats.wall) * 100, 1)}%）。设备越快、算子越碎，这个空闲占比越大。`,
  });

  return tl;
}

/** 一层 decode 的示意算子序列。attention 标记为图外算子。 */
export function decodeLayerOps(nLayers = 2): OpSpec[] {
  const ops: OpSpec[] = [];
  for (let i = 0; i < nLayers; i++) {
    ops.push({ name: `L${i}·norm`, exec: 0.3 });
    ops.push({ name: `L${i}·qkv`, exec: 0.8 });
    ops.push({ name: `L${i}·attn`, exec: 1.0, graphBreak: true });
    ops.push({ name: `L${i}·out`, exec: 0.6 });
    ops.push({ name: `L${i}·ffn`, exec: 1.2 });
  }
  return ops;
}
