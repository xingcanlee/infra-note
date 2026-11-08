import { describe, expect, it } from 'vitest';
import { attention, maskedSoftmax } from './attention';
import { causal, slidingWindow } from './masks';
import { TOKENS, toyQKV } from './toy';

const toks = [...TOKENS];
const { q, k, v } = toyQKV(4, 4);

describe('maskedSoftmax', () => {
  it('非空权重之和为 1', () => {
    const w = maskedSoftmax([1, 2, 3]);
    expect(w.reduce<number>((a, x) => a + (x ?? 0), 0)).toBeCloseTo(1, 12);
  });
  it('被掩盖的位置权重为 null，不参与归一化', () => {
    const w = maskedSoftmax([1, null, 1]);
    expect(w[1]).toBeNull();
    expect(w[0]).toBeCloseTo(0.5, 12);
    expect(w[2]).toBeCloseTo(0.5, 12);
  });
  it('大数值不溢出（先减最大值）', () => {
    const w = maskedSoftmax([1000, 1000]);
    expect(w[0]).toBeCloseTo(0.5, 12);
  });
  it('全部被掩盖时返回全 null', () => {
    expect(maskedSoftmax([null, null])).toEqual([null, null]);
  });
});

describe('attention 时间线', () => {
  const tl = attention({ tokens: toks, q, k, v });

  it('每一步都有说明文字', () => {
    for (const s of tl) expect(s.caption.length).toBeGreaterThan(0);
  });

  it('第一步什么都还没算，最后一步全部算完', () => {
    expect(tl[0].state.phase).toBe('intro');
    expect(tl[0].state.out.every((r) => r.every((x) => x === null))).toBe(true);
    const last = tl[tl.length - 1].state;
    expect(last.phase).toBe('done');
    expect(last.out.every((r) => r.every((x) => x !== null))).toBe(true);
  });

  it('因果掩码下第 t 行恰好有 t+1 个权重', () => {
    const last = tl[tl.length - 1].state;
    for (let t = 0; t < 4; t++) {
      expect(last.weights[t].filter((x) => x !== null)).toHaveLength(t + 1);
    }
  });

  it('每行权重之和为 1', () => {
    const last = tl[tl.length - 1].state;
    for (let t = 0; t < 4; t++) {
      const sum = last.weights[t].reduce<number>((a, x) => a + (x ?? 0), 0);
      expect(sum).toBeCloseTo(1, 12);
    }
  });

  it('输出等于按权重加权的 V（与一次性计算一致）', () => {
    const last = tl[tl.length - 1].state;
    for (let t = 0; t < 4; t++) {
      for (let i = 0; i < v[0].length; i++) {
        const want = last.weights[t].reduce<number>((acc, w, s) => acc + (w ?? 0) * v[s][i], 0);
        expect(last.out[t][i]!).toBeCloseTo(want, 12);
      }
    }
  });

  it('第 0 行只读自己，因此输出就是 v0', () => {
    const last = tl[tl.length - 1].state;
    expect(last.out[0].map((x) => x!)).toEqual(v[0]);
  });

  it('状态是快照，后面的步骤不会改写前面的', () => {
    const introOut = tl[0].state.out;
    expect(introOut.every((r) => r.every((x) => x === null))).toBe(true);
  });
});

describe('attention 换 mask', () => {
  it('滑动窗口把每行的权重数封顶', () => {
    const tl = attention({ tokens: toks, q, k, v, mask: slidingWindow(2) });
    const last = tl[tl.length - 1].state;
    for (let t = 0; t < 4; t++) {
      expect(last.weights[t].filter((x) => x !== null).length).toBeLessThanOrEqual(2);
    }
  });

  it('被排除的位置在时间线里出现 mask 步骤', () => {
    const tl = attention({ tokens: toks, q, k, v, mask: slidingWindow(2) });
    expect(tl.some((s) => s.state.phase === 'mask')).toBe(true);
  });

  it('窗口足够大时与因果结果相同', () => {
    const a = attention({ tokens: toks, q, k, v, mask: causal });
    const b = attention({ tokens: toks, q, k, v, mask: slidingWindow(4) });
    expect(b[b.length - 1].state.out).toEqual(a[a.length - 1].state.out);
  });
});

describe('attention 输入校验', () => {
  it('Q/K/V 行数不一致时报错', () => {
    expect(() => attention({ tokens: toks, q, k: k.slice(0, 3), v })).toThrow(/行数/);
  });
  it('token 数与序列长度不一致时报错', () => {
    expect(() => attention({ tokens: ['a'], q, k, v })).toThrow(/token/);
  });
});
