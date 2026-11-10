import { describe, expect, it } from 'vitest';
import { decodeLayerOps, planLaunches, submitFlow, submitStats, type OpSpec } from './submit';

const ops = decodeLayerOps(2);
const plan = (mode: 'eager' | 'piecewise' | 'full', o: OpSpec[] = ops) =>
  planLaunches({ mode, ops: o, launchCost: 1, graphLaunchCost: 1.2 });

describe('planLaunches 分组', () => {
  it('eager：每个算子一次提交', () => {
    expect(plan('eager')).toHaveLength(ops.length);
    expect(plan('eager').every((l) => l.kind === 'op')).toBe(true);
  });

  it('piecewise：在 graphBreak 处切开，图外算子单独提交', () => {
    const ls = plan('piecewise');
    const breaks = ops.filter((o) => o.graphBreak).length;
    expect(ls.filter((l) => l.kind === 'op')).toHaveLength(breaks);
    // 每个 attention 自成一次提交
    for (const l of ls.filter((x) => x.kind === 'op')) {
      expect(l.ops).toHaveLength(1);
      expect(ops[l.ops[0]].graphBreak).toBe(true);
    }
  });

  it('piecewise 的提交次数远少于 eager', () => {
    expect(plan('piecewise').length).toBeLessThan(plan('eager').length);
  });

  it('full：只有一次提交，覆盖全部算子', () => {
    const clean = ops.map((o) => ({ ...o, graphBreak: false }));
    const ls = plan('full', clean);
    expect(ls).toHaveLength(1);
    expect(ls[0].ops).toHaveLength(clean.length);
    expect(ls[0].kind).toBe('graph');
  });

  it('存在 graphBreak 时 full 模式报错', () => {
    expect(() => plan('full')).toThrow(/full 模式/);
  });

  it('每次提交覆盖的算子互不重叠，且合起来是全部算子', () => {
    for (const mode of ['eager', 'piecewise'] as const) {
      const seen = plan(mode).flatMap((l) => l.ops);
      expect(new Set(seen).size).toBe(ops.length);
      expect(seen.sort((a, b) => a - b)).toEqual(ops.map((_, i) => i));
    }
  });
});

describe('两条车道的排程', () => {
  it('设备不能早于对应的提交完成就开始', () => {
    for (const mode of ['eager', 'piecewise'] as const) {
      for (const l of plan(mode)) expect(l.devStart).toBeGreaterThanOrEqual(l.cpuEnd);
    }
  });

  it('设备车道不重叠（串行执行）', () => {
    const ls = plan('eager');
    for (let i = 1; i < ls.length; i++)
      expect(ls[i].devStart).toBeGreaterThanOrEqual(ls[i - 1].devEnd);
  });

  it('CPU 车道不重叠（串行提交）', () => {
    const ls = plan('eager');
    for (let i = 1; i < ls.length; i++)
      expect(ls[i].cpuStart).toBeGreaterThanOrEqual(ls[i - 1].cpuEnd);
  });
});

describe('submitStats', () => {
  it('设备干活总量与模式无关——图模式不改变计算量', () => {
    const a = submitStats(plan('eager'), ops).devTotal;
    const b = submitStats(plan('piecewise'), ops).devTotal;
    expect(a).toBe(b);
  });

  it('提交开销越大，eager 的设备空闲越多', () => {
    const cheap = submitStats(planLaunches({ mode: 'eager', ops, launchCost: 0.1 }), ops);
    const costly = submitStats(planLaunches({ mode: 'eager', ops, launchCost: 2 }), ops);
    expect(costly.bubble).toBeGreaterThan(cheap.bubble);
  });

  it('piecewise 的墙钟不长于 eager', () => {
    expect(submitStats(plan('piecewise'), ops).wall).toBeLessThanOrEqual(
      submitStats(plan('eager'), ops).wall,
    );
  });

  it('算子越碎（设备执行越短），提交开销占比越高', () => {
    const tiny = ops.map((o) => ({ ...o, exec: 0.05 }));
    const big = ops.map((o) => ({ ...o, exec: 5 }));
    const rt = submitStats(planLaunches({ mode: 'eager', ops: tiny, launchCost: 1 }), tiny);
    const rb = submitStats(planLaunches({ mode: 'eager', ops: big, launchCost: 1 }), big);
    expect(rt.bubble / rt.wall).toBeGreaterThan(rb.bubble / rb.wall);
  });

  it('设备足够慢时没有空闲（提交被完全掩盖）', () => {
    const slow = ops.map((o) => ({ ...o, exec: 20 }));
    const r = submitStats(planLaunches({ mode: 'eager', ops: slow, launchCost: 0.5 }), slow);
    expect(r.bubble).toBeCloseTo(0.5, 10); // 只有第一次提交无法被掩盖
  });
});

describe('同步点', () => {
  const withSync = (): OpSpec[] => {
    const o = decodeLayerOps(2).map((x) => ({ ...x }));
    o[4].sync = true; // 第一层 ffn 之后 .item() 一下
    return o;
  };

  it('同步点之后 CPU 不能早于设备结束就继续提交', () => {
    const o = withSync();
    const ls = planLaunches({ mode: 'eager', ops: o, launchCost: 0.2 });
    const i = ls.findIndex((l) => l.sync);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(ls[i + 1].cpuStart).toBeGreaterThanOrEqual(ls[i].devEnd);
  });

  it('同步点让墙钟变长（CPU 不能再跑在设备前面）', () => {
    const clean = decodeLayerOps(2);
    const o = withSync();
    const a = submitStats(planLaunches({ mode: 'eager', ops: clean, launchCost: 0.2 }), clean);
    const b = submitStats(planLaunches({ mode: 'eager', ops: o, launchCost: 0.2 }), o);
    expect(b.wall).toBeGreaterThan(a.wall);
    expect(b.nSync).toBe(1);
  });

  it('没有同步点时 nSync 为 0', () => {
    expect(submitStats(plan('eager'), ops).nSync).toBe(0);
  });

  it('存在同步点时 full 模式报错——同步点打断捕获', () => {
    const o = withSync().map((x) => ({ ...x, graphBreak: false }));
    expect(() => planLaunches({ mode: 'full', ops: o })).toThrow(/同步点/);
  });

  it('时间线会点出同步点', () => {
    const o = withSync();
    const tl = submitFlow({ mode: 'eager', ops: o, launchCost: 0.2 });
    expect(tl.some((s) => s.caption.includes('同步点'))).toBe(true);
  });
});

describe('submitFlow 时间线', () => {
  it('每一步都有说明文字', () => {
    for (const s of submitFlow({ mode: 'piecewise', ops }))
      expect(s.caption.length).toBeGreaterThan(0);
  });

  it('步数 = 提交次数 + 首尾两帧', () => {
    const tl = submitFlow({ mode: 'piecewise', ops });
    expect(tl).toHaveLength(plan('piecewise').length + 2);
  });

  it('逐次展开，首帧未提交、末帧全部提交', () => {
    const tl = submitFlow({ mode: 'eager', ops });
    expect(tl[0].state.launches).toHaveLength(0);
    expect(tl[tl.length - 1].state.launches).toHaveLength(ops.length);
  });

  it('末帧给出空闲占比', () => {
    const tl = submitFlow({ mode: 'eager', ops, launchCost: 2 });
    expect(tl[tl.length - 1].caption).toMatch(/设备空闲/);
  });

  it('空算子列表报错', () => {
    expect(() => submitFlow({ mode: 'eager', ops: [] })).toThrow(/至少/);
  });
});
