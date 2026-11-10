import { describe, expect, it } from 'vitest';
import { absorbCost, absorbFlow, type AbsorbOptions } from './absorb';

const base: Omit<AbsorbOptions, 'mode'> = {
  q: [1, -1, 2, 0],
  wUk: [
    [1, 0, 1],
    [0, 1, -1],
    [1, -1, 0],
    [0, 1, 1],
  ],
  c: [
    [-1, 0, 2],
    [1, 2, 0],
    [0, -1, 1],
    [2, 1, -1],
  ],
};

const finalScores = (mode: 'naive' | 'absorb') => {
  const tl = absorbFlow({ ...base, mode });
  return tl[tl.length - 1].state.scores;
};

describe('absorbFlow 等价性', () => {
  it('两种计算顺序给出完全相同的打分', () => {
    const a = finalScores('naive');
    const b = finalScores('absorb');
    expect(a.every((x) => x !== null)).toBe(true);
    for (let i = 0; i < a.length; i++) expect(b[i]!).toBeCloseTo(a[i]!, 12);
  });

  it('打分与手算一致：q̃ = (W^UK)ᵀq，再与 latent 内积', () => {
    // q = [1,−1,2,0]；(W^UK)ᵀq 的第 0 项 = 1·1 + 0·(−1) + 1·2 + 0·0 = 3
    //                          第 1 项 = 0·1 + 1·(−1) + (−1)·2 + 1·0 = −3
    //                          第 2 项 = 1·1 + (−1)·(−1) + 0·2 + 1·0 = 2
    const tl = absorbFlow({ ...base, mode: 'absorb' });
    const folded = tl.find((s) => s.state.phase === 'fold')!.state.qTilde;
    expect(folded).toEqual([3, -3, 2]);
    // c0 = [−1,0,2] → q̃ᵀc0 = 3·(−1) + (−3)·0 + 2·2 = 1
    expect(finalScores('absorb')[0]!).toBeCloseTo(1, 12);
  });
});

describe('absorbFlow 代价', () => {
  it('吸收顺序的每位置乘法数等于 latent 维度', () => {
    const tl = absorbFlow({ ...base, mode: 'absorb' });
    expect(tl[0].state.perToken).toBe(3);
  });

  it('朴素顺序的每位置乘法数包含整个展开矩阵', () => {
    const tl = absorbFlow({ ...base, mode: 'naive' });
    expect(tl[0].state.perToken).toBe(4 * 3 + 4);
  });

  it('只有朴素顺序会物化 K', () => {
    expect(absorbFlow({ ...base, mode: 'naive' })[0].state.materializesK).toBe(true);
    expect(absorbFlow({ ...base, mode: 'absorb' })[0].state.materializesK).toBe(false);
  });

  it('吸收顺序的总乘法数更少，且差距随历史增长', () => {
    const short = absorbCost(4, 4, 3);
    const long = absorbCost(4096, 4, 3);
    expect(short.absorb).toBeLessThan(short.naive);
    expect(long.naive / long.absorb).toBeGreaterThan(short.naive / short.absorb);
  });

  it('V3 量级下吸收把每位置的乘法从 d_k×d_c 降到 d_c', () => {
    // qk_nope_head_dim = 128、kv_lora_rank = 512
    const cost = absorbCost(1, 128, 512);
    expect(cost.naive).toBe(128 * 512 + 128);
    expect(cost.absorb).toBe(128 * 512 + 512);
    const many = absorbCost(4096, 128, 512);
    expect(many.naive / many.absorb).toBeGreaterThan(50);
  });

  it('朴素顺序物化的 K 元素数随历史线性增长', () => {
    expect(absorbCost(4096, 128, 512).naiveKElems).toBe(4096 * 128);
  });
});

describe('absorbFlow 时间线', () => {
  it('每一步都有说明文字', () => {
    for (const mode of ['naive', 'absorb'] as const) {
      for (const s of absorbFlow({ ...base, mode })) expect(s.caption.length).toBeGreaterThan(0);
    }
  });

  it('吸收模式有且只有一次折叠步骤', () => {
    const folds = absorbFlow({ ...base, mode: 'absorb' }).filter((s) => s.state.phase === 'fold');
    expect(folds).toHaveLength(1);
  });

  it('朴素模式每个历史位置都有一次展开步骤', () => {
    const expands = absorbFlow({ ...base, mode: 'naive' }).filter(
      (s) => s.state.phase === 'expand',
    );
    expect(expands).toHaveLength(base.c.length);
  });

  it('吸收模式从不展开 K', () => {
    for (const s of absorbFlow({ ...base, mode: 'absorb' })) {
      expect(s.state.k.every((r) => r.every((x) => x === null))).toBe(true);
    }
  });

  it('维度不匹配时报错', () => {
    expect(() => absorbFlow({ ...base, mode: 'absorb', q: [1, 2] })).toThrow(/Query 维度/);
    expect(() => absorbFlow({ ...base, mode: 'absorb', c: [[1, 2]] })).toThrow(/latent 维度/);
  });
});
