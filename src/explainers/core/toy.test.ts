import { describe, expect, it } from 'vitest';
import { DIMS, TOKENS, TOY_K, TOY_Q, TOY_V, toyMatrix, toyQKV } from './toy';

describe('toy 输入', () => {
  it('token 数与 DIMS.L 一致', () => {
    expect(TOKENS).toHaveLength(DIMS.L);
  });

  it('默认 Q/K/V 就是文章里写死的那一组', () => {
    const { q, k, v } = toyQKV();
    expect(q).toEqual(TOY_Q.map((r) => [...r]));
    expect(k).toEqual(TOY_K.map((r) => [...r]));
    expect(v).toEqual(TOY_V.map((r) => [...r]));
  });

  it('返回的是副本，讲解改动不会污染常量', () => {
    const a = toyQKV();
    a.q[0][0] = 999;
    expect(toyQKV().q[0][0]).toBe(1);
  });

  // 文章 01 的手算示例：q2·k0 = 2+1+6+0 = 9，e[2][0] = 9/√4 = 4.5
  it('正文的手算示例成立：q2·k0 = 9，缩放后为 4.5', () => {
    const { q, k } = toyQKV();
    const dot = q[2].reduce((acc, x, i) => acc + x * k[0][i], 0);
    expect(dot).toBe(9);
    expect(dot / Math.sqrt(4)).toBe(4.5);
  });

  it('其他尺寸退回确定性生成，两次调用结果相同', () => {
    expect(toyQKV(6, 3)).toEqual(toyQKV(6, 3));
    expect(toyQKV(6, 3).q).toHaveLength(6);
    expect(toyQKV(6, 3).q[0]).toHaveLength(3);
  });

  it('toyMatrix 形状正确且数值落在 −2…3', () => {
    const m = toyMatrix(5, 7);
    expect(m).toHaveLength(5);
    for (const row of m) {
      expect(row).toHaveLength(7);
      for (const x of row) {
        expect(x).toBeGreaterThanOrEqual(-2);
        expect(x).toBeLessThanOrEqual(3);
      }
    }
  });
});
