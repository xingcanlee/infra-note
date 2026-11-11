import { describe, expect, it } from 'vitest';
import { cacheBarsTimeline } from './cache-bars';
import {
  cacheBytes,
  cacheTimeline,
  humanBytes,
  schemeComparison,
  schemeInfo,
  type CacheConfig,
} from './kv-cache';
import { TOKENS } from './toy';

const base = { nH: 8, dK: 128, dV: 128, nGroups: 2, dC: 512, dR: 64 };

describe('schemeInfo', () => {
  it('MHA 每 token 存 n_h × (d_k + d_v)', () => {
    expect(schemeInfo({ ...base, scheme: 'mha' }).perToken).toBe(8 * 256);
  });
  it('MQA 只存一份 K/V', () => {
    expect(schemeInfo({ ...base, scheme: 'mqa' }).perToken).toBe(256);
  });
  it('GQA 介于两者之间', () => {
    const g = schemeInfo({ ...base, scheme: 'gqa' }).perToken;
    expect(g).toBe(2 * 256);
    expect(g).toBeGreaterThan(schemeInfo({ ...base, scheme: 'mqa' }).perToken);
    expect(g).toBeLessThan(schemeInfo({ ...base, scheme: 'mha' }).perToken);
  });
  it('MLA 存 latent 加位置分支', () => {
    expect(schemeInfo({ ...base, scheme: 'mla' }).perToken).toBe(512 + 64);
  });
  it('GQA 的组数必须整除 head 数', () => {
    expect(() => schemeInfo({ ...base, scheme: 'gqa', nGroups: 3 })).toThrow(/整除/);
  });
  it('MLA 缺少 d_c 时报错', () => {
    expect(() => schemeInfo({ nH: 8, dK: 128, dV: 128, scheme: 'mla' })).toThrow(/d_c/);
  });
});

describe('cacheBytes', () => {
  it('按 token × 层 × 字节线性增长', () => {
    const cfg: CacheConfig = { ...base, scheme: 'mqa' };
    expect(cacheBytes(cfg, 1, 1, 2)).toBe(256 * 2);
    expect(cacheBytes(cfg, 1000, 61, 2)).toBe(256 * 1000 * 61 * 2);
  });
  it('MLA 的账本显著小于 MHA', () => {
    const a = cacheBytes({ ...base, scheme: 'mha' }, 4096, 61);
    const b = cacheBytes({ ...base, scheme: 'mla' }, 4096, 61);
    expect(b / a).toBeLessThan(0.3);
  });
});

describe('humanBytes', () => {
  it('按 1024 进制换算', () => {
    expect(humanBytes(512)).toBe('512 B');
    expect(humanBytes(2048)).toBe('2 KiB');
    expect(humanBytes(1024 ** 3)).toBe('1 GiB');
  });
});

describe('schemeComparison', () => {
  it('按 MHA → GQA → MQA → MLA 顺序给出四种方案', () => {
    expect(schemeComparison(base).map((s) => s.id)).toEqual(['mha', 'gqa', 'mqa', 'mla']);
  });
  it('宽度单调不增', () => {
    const w = schemeComparison(base).map((s) => s.perToken);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[1]).toBeGreaterThan(w[2]);
  });
});

describe('cacheTimeline', () => {
  const tl = cacheTimeline({
    tokens: [...TOKENS],
    prefill: 2,
    cfg: { nH: 2, dK: 4, dV: 4, scheme: 'mha' },
  });

  it('第一步完成 prefill', () => {
    expect(tl[0].state.phase).toBe('prefill');
    expect(tl[0].state.cached).toBe(2);
  });

  it('每轮 decode 都有「读」和「追加」两步', () => {
    expect(tl.filter((s) => s.state.phase === 'read')).toHaveLength(2);
    expect(tl.filter((s) => s.state.phase === 'append')).toHaveLength(2);
  });

  it('缓存行数单调增长到序列长度', () => {
    const counts = tl.map((s) => s.state.cached);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[counts.length - 1]).toBe(4);
  });

  it('读的时候读全部已缓存位置', () => {
    const reads = tl.filter((s) => s.state.phase === 'read');
    expect(reads[0].state.reading).toEqual([0, 1]);
    expect(reads[1].state.reading).toEqual([0, 1, 2]);
  });

  it('不用缓存时的重算量等于当前序列长度', () => {
    const reads = tl.filter((s) => s.state.phase === 'read');
    expect(reads.map((s) => s.state.recomputeWithout)).toEqual([3, 4]);
  });

  it('每一步都有说明文字', () => {
    for (const s of tl) expect(s.caption.length).toBeGreaterThan(0);
  });

  it('prefill 超出序列长度时报错', () => {
    expect(() =>
      cacheTimeline({
        tokens: [...TOKENS],
        prefill: 9,
        cfg: { nH: 2, dK: 4, dV: 4, scheme: 'mha' },
      }),
    ).toThrow(/prefill/);
  });
});

describe('cacheBarsTimeline', () => {
  const tl = cacheBarsTimeline({ base, tokens: 4096, layers: 61 });

  it('逐条揭示四种方案', () => {
    expect(tl[0].state.shown).toHaveLength(0);
    expect(tl.map((s) => s.state.shown.length)).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it('说明文字里给出了宽度公式', () => {
    expect(tl[1].caption).toContain('$n_h \\times (d_k + d_v)');
  });

  it('除基线外都给出相对 MHA 的比例', () => {
    for (const s of tl.slice(2, 5)) expect(s.caption).toMatch(/相对 MHA/);
  });
});
