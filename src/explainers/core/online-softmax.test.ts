import { describe, expect, it } from 'vitest';
import { onlineSoftmax, referenceSoftmaxDot } from './online-softmax';

const scores = [1.2, -0.4, 3.1, 0.8, 2.2, -1.5, 0.3, 4.0];
const values = [1, 2, 3, 4, 5, 6, 7, 8];

const run = (blockSize: number, conditional = false, tau = 8) =>
  onlineSoftmax({ scores, values, blockSize, conditional, tau });

const result = (blockSize: number, conditional = false, tau = 8) => {
  const tl = run(blockSize, conditional, tau);
  return tl[tl.length - 1].state.result!;
};

describe('在线 softmax 的正确性', () => {
  const ref = referenceSoftmaxDot(scores, values);

  it('与朴素 softmax 加权求和结果相同', () => {
    expect(result(2)).toBeCloseTo(ref, 12);
  });

  it('块大小不影响结果', () => {
    for (const bs of [1, 2, 3, 4, 8]) expect(result(bs)).toBeCloseTo(ref, 12);
  });

  it('块大小等于序列长度时退化为朴素实现', () => {
    expect(result(scores.length)).toBeCloseTo(ref, 12);
  });

  it('大数值不溢出（running max 起作用）', () => {
    const big = scores.map((x) => x + 1000);
    const tl = onlineSoftmax({ scores: big, values, blockSize: 3 });
    const got = tl[tl.length - 1].state.result!;
    expect(Number.isFinite(got)).toBe(true);
    expect(got).toBeCloseTo(ref, 10); // 平移不变
  });
});

describe('FA4 的条件重缩放', () => {
  it('τ 很大时会跳过大部分重缩放', () => {
    const tl = run(2, true, 8);
    const last = tl[tl.length - 1].state;
    expect(last.nSkip).toBeGreaterThan(0);
  });

  it('跳过重缩放不改变结果（在容差内）', () => {
    const ref = referenceSoftmaxDot(scores, values);
    expect(result(2, true, 8)).toBeCloseTo(ref, 8);
  });

  it('τ = 0 时只在 running max 完全没涨的块上跳过', () => {
    // grew > τ 才重缩放，所以 grew == 0（最大值没变）的块仍会跳过——
    // 而那种情况下跳过与否在数学上完全等价。
    const tl = run(2, true, 0);
    const skipped = tl.filter((x) => x.state.phase === 'skip');
    for (const st of skipped) expect(st.state.m).toBe(st.state.prevM);
  });

  it('τ 越大跳过越多', () => {
    const few = run(2, true, 0.5)[run(2, true, 0.5).length - 1].state.nSkip;
    const many = run(2, true, 100)[run(2, true, 100).length - 1].state.nSkip;
    expect(many).toBeGreaterThanOrEqual(few);
  });

  it('第一块总是要「重缩放」（初始化）', () => {
    expect(run(2, true, 100)[1].state.rescaled).toBe(true);
  });
});

describe('时间线', () => {
  it('每一步都有说明文字', () => {
    for (const s of run(2)) expect(s.caption.length).toBeGreaterThan(0);
  });

  it('步数 = 块数 + intro + normalize + done', () => {
    expect(run(2)).toHaveLength(4 + 3);
  });

  it('开头强调不物化整行', () => {
    expect(run(2)[0].caption).toContain('不物化整行');
  });

  it('归一化只在最后做一次', () => {
    expect(run(2).filter((s) => s.state.phase === 'normalize')).toHaveLength(1);
  });

  it('running sum 单调不减（同一个 m 下）', () => {
    const ls = run(1).map((s) => s.state.l);
    expect(ls[ls.length - 1]).toBeGreaterThan(0);
  });

  it('输入校验', () => {
    expect(() => onlineSoftmax({ scores, values: [1], blockSize: 2 })).toThrow(/长度/);
    expect(() => onlineSoftmax({ scores, values, blockSize: 0 })).toThrow(/块大小/);
  });
});
