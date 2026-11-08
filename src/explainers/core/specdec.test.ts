import { describe, expect, it } from 'vitest';
import { expectedTokensPerRound, specDecode } from './specdec';

const truth = ['我', '在', '读', '注意力', '机', '制', '的', '笔', '记', '。'];

const final = (hits: boolean[], k = 2) => {
  const tl = specDecode({ truth, k, hits });
  return tl[tl.length - 1].state;
};

describe('specDecode 正确性', () => {
  it('无论草稿好坏，输出都等于目标序列', () => {
    for (const hits of [[true], [false], [true, false], [false, true, true], [true, true, false, true]]) {
      expect(final(hits).committed).toEqual(truth);
    }
  });

  it('草稿全中时前向次数最少', () => {
    const good = final([true]);
    const bad = final([false]);
    expect(good.forwards).toBeLessThan(bad.forwards);
    expect(good.committed).toEqual(bad.committed); // 结果相同
  });

  it('草稿全错时退化为逐个生成（每轮仍产出 1 个）', () => {
    expect(final([false]).forwards).toBe(truth.length);
  });

  it('草稿全中、k=2 时每轮产出 3 个（2 个草稿 + 1 个奖励）', () => {
    // 10 个 token：每轮 3 个 → 4 轮（最后一轮不满）
    expect(final([true], 2).forwards).toBe(4);
    expect(final([true], 2).committed).toEqual(truth);
  });

  it('k 越大，全中时前向越少', () => {
    expect(final([true], 5).forwards).toBeLessThan(final([true], 2).forwards);
  });

  it('每轮至少产出一个 token，不会死循环', () => {
    const tl = specDecode({ truth, k: 4, hits: [false] });
    expect(tl[tl.length - 1].state.committed).toEqual(truth);
    expect(tl.length).toBeLessThan(200);
  });
});

describe('specDecode 时间线', () => {
  const tl = specDecode({ truth, k: 3, hits: [true, true, false] });

  it('每一步都有说明文字', () => {
    for (const s of tl) expect(s.caption.length).toBeGreaterThan(0);
  });

  it('每轮都是「草稿 → 验证 → 接受/拒绝」', () => {
    const phases = tl.map((s) => s.state.phase).filter((p) => p !== 'intro' && p !== 'done');
    for (let i = 0; i < phases.length; i += 3) {
      expect(phases[i]).toBe('draft');
      expect(phases[i + 1]).toBe('verify');
      expect(['accept', 'reject']).toContain(phases[i + 2]);
    }
  });

  it('验证步骤强调「一次前向检查全部候选」', () => {
    expect(tl.find((s) => s.state.phase === 'verify')!.caption).toContain('一次');
  });

  it('被拒时说明主模型的结果是免费补上的', () => {
    const rej = tl.find((s) => s.state.phase === 'reject');
    expect(rej).toBeDefined();
    expect(rej!.caption).toContain('免费');
  });

  it('末帧给出前向效率，并声明输出不变', () => {
    const last = tl[tl.length - 1].caption;
    expect(last).toMatch(/×/);
    expect(last).toContain('完全相同');
  });

  it('输入校验', () => {
    expect(() => specDecode({ truth, k: 0, hits: [true] })).toThrow(/每轮草稿数/);
    expect(() => specDecode({ truth, k: 2, hits: [] })).toThrow(/命中序列/);
  });
});

describe('expectedTokensPerRound', () => {
  it('接受率 0 时每轮只产出 1 个', () => {
    expect(expectedTokensPerRound(0, 4)).toBeCloseTo(1, 10);
  });

  it('接受率 1 时每轮产出 k+1 个（含奖励 token）', () => {
    expect(expectedTokensPerRound(1, 4)).toBeCloseTo(5, 10);
  });

  it('接受率越高，每轮产出越多', () => {
    expect(expectedTokensPerRound(0.9, 4)).toBeGreaterThan(expectedTokensPerRound(0.5, 4));
  });

  // DeepSeek-V3 §5.4.3：D=1（每轮多猜 1 个），第二个 token 接受率 85%–90%
  it('V3 的配置（k=1、接受率 85%–90%）给出 1.85–1.90 的每轮产出', () => {
    expect(expectedTokensPerRound(0.85, 1)).toBeCloseTo(1.85, 10);
    expect(expectedTokensPerRound(0.9, 1)).toBeCloseTo(1.9, 10);
  });

  it('k 增大时收益递减（接受率不变）', () => {
    const p = 0.8;
    const gain1 = expectedTokensPerRound(p, 2) - expectedTokensPerRound(p, 1);
    const gain2 = expectedTokensPerRound(p, 4) - expectedTokensPerRound(p, 3);
    expect(gain2).toBeLessThan(gain1);
  });
});
