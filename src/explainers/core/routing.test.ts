import { describe, expect, it } from 'vitest';
import { activationRatio, routing, type RouteOptions } from './routing';

const base: RouteOptions = {
  tokens: ['读', '注意力'],
  logits: [
    [2.1, 0.3, -0.5, 1.4, 0.8, -1.2],
    [-0.4, 1.9, 0.6, -0.8, 2.2, 0.1],
  ],
  topk: 2,
  nGroups: 2,
  topkGroups: 1,
  nShared: 1,
};

const lastFor = (t: number, tl: ReturnType<typeof routing>) =>
  [...tl].reverse().find((s) => s.state.t === t && s.state.phase === 'shared')!.state;

describe('routing 选择', () => {
  const tl = routing(base);

  it('每一步都有说明文字', () => {
    for (const s of tl) expect(s.caption.length).toBeGreaterThan(0);
  });

  it('每个 token 恰好选出 topk 个专家', () => {
    for (const t of [0, 1]) expect(lastFor(t, tl).chosen).toHaveLength(2);
  });

  it('选中的专家都来自被保留的组', () => {
    for (const t of [0, 1]) {
      const st = lastFor(t, tl);
      for (const i of st.chosen) expect(st.keptGroups).toContain(st.group[i]);
    }
  });

  it('不同 token 可以选到不同的专家', () => {
    expect(lastFor(0, tl).chosen).not.toEqual(lastFor(1, tl).chosen);
  });

  it('权重之和为 1（route_scale 为 1 时）', () => {
    for (const t of [0, 1]) {
      const sum = lastFor(t, tl).weights.reduce<number>((a, x) => a + (x ?? 0), 0);
      expect(sum).toBeCloseTo(1, 12);
    }
  });

  it('打分用 softmax 时所有专家分数之和为 1', () => {
    const st = tl.find((s) => s.state.phase === 'score')!.state;
    expect(st.scores.reduce((a, x) => a + x, 0)).toBeCloseTo(1, 12);
  });
});

describe('均衡 bias', () => {
  it('bias 改变选谁', () => {
    // 同一个不分组的配置，只差一个 bias
    const ungrouped = { ...base, nGroups: 1, topkGroups: 1 };
    const noBias = lastFor(0, routing(ungrouped));
    const withBias = lastFor(0, routing({ ...ungrouped, bias: [0, 5, 0, 0, 0, 0] }));
    expect(noBias.chosen).not.toContain(1); // 原本分数太低，选不上
    expect(withBias.chosen).toContain(1); // 被 bias 顶了进来
  });

  it('bias 不进入最终权重：权重仍由原始分数决定', () => {
    const st = lastFor(0, routing({ ...base, nGroups: 1, topkGroups: 1, bias: [0, 5, 0, 0, 0, 0] }));
    // 权重按 raw 分数归一化，所以被 bias 顶进来的专家 1 权重仍然很小
    const idx = st.chosen.indexOf(1);
    const other = 1 - idx;
    expect(st.weights[idx]!).toBeLessThan(st.weights[other]!);
  });

  it('时间线里出现 bias 步骤且说明了它不影响权重', () => {
    const tl = routing({ ...base, bias: [0, 5, 0, 0, 0, 0] });
    const step = tl.find((s) => s.state.phase === 'bias')!;
    expect(step.caption).toContain('不进入最终权重');
  });
});

describe('分组', () => {
  it('不分组时可以从全部专家里选', () => {
    const tl = routing({ ...base, nGroups: 1, topkGroups: 1 });
    expect(tl.some((s) => s.state.phase === 'group')).toBe(false);
  });

  it('分组会淘汰整组专家', () => {
    const st = lastFor(0, routing(base));
    expect(st.keptGroups).toHaveLength(1);
    const dropped = st.group.filter((g) => !st.keptGroups.includes(g));
    expect(dropped.length).toBeGreaterThan(0);
  });

  it('专家数不能被组数整除时报错', () => {
    expect(() => routing({ ...base, nGroups: 4 })).toThrow(/整除/);
  });

  it('topk 超过专家数时报错', () => {
    expect(() => routing({ ...base, topk: 99 })).toThrow(/topk/);
  });
});

describe('activationRatio', () => {
  it('V3 671B：256 个路由专家里激活 8 个，另加 1 个共享', () => {
    const r = activationRatio(256, 8, 1);
    expect(r).toBeCloseTo(9 / 257, 12);
    expect(r).toBeLessThan(0.04);
  });

  it('激活比例随专家总数下降', () => {
    expect(activationRatio(256, 8, 1)).toBeLessThan(activationRatio(64, 8, 1));
  });
});
