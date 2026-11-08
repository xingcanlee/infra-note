import { describe, expect, it } from 'vitest';
import { maskAtlas, maskEntries } from './mask-atlas';

describe('maskEntries', () => {
  const entries = maskEntries(8, 4);

  it('每种机制都给出三项指标', () => {
    for (const e of entries) {
      expect(e.density).toBeGreaterThan(0);
      expect(e.density).toBeLessThanOrEqual(1);
      expect(e.maxRow).toBeGreaterThanOrEqual(1);
      expect(e.reach).toBeGreaterThanOrEqual(0);
    }
  });

  it('因果基线密度为 1、单步代价随 L 增长、单层即可看到开头', () => {
    const causal = entries.find((e) => e.id === 'causal')!;
    expect(causal.density).toBe(1);
    expect(causal.maxRow).toBe(8);
    expect(causal.reach).toBe(0);
  });

  it('滑动窗口把单步代价封顶，但单层看不到开头', () => {
    const swa = entries.find((e) => e.id === 'swa')!;
    expect(swa.maxRow).toBe(2);
    expect(swa.density).toBeLessThan(1);
    expect(swa.reach).toBeGreaterThan(0);
  });

  it('窗口叠层之后可达范围会扩大', () => {
    const swa = entries.find((e) => e.id === 'swa')!;
    expect(swa.reachDeep).toBeLessThan(swa.reach);
  });

  it('加锚点后单层就能看到开头', () => {
    const sink = entries.find((e) => e.id === 'sink')!;
    expect(sink.reach).toBe(0);
  });

  it('多分支并集的密度高于单个窗口分支', () => {
    const swa = entries.find((e) => e.id === 'swa')!;
    const nsa = entries.find((e) => e.id === 'nsa')!;
    expect(nsa.density).toBeGreaterThan(swa.density);
  });

  it('掩码矩阵的形状是 L × L', () => {
    for (const e of entries) {
      expect(e.grid).toHaveLength(8);
      for (const row of e.grid) expect(row).toHaveLength(8);
    }
  });
});

describe('maskAtlas 时间线', () => {
  const tl = maskAtlas(8, 4);

  it('逐个揭示，首帧为空、末帧全部揭示', () => {
    expect(tl[0].state.shown).toBe(0);
    expect(tl[tl.length - 1].state.shown).toBe(tl[0].state.all.length);
  });

  it('步数 = 机制数 + 首尾两帧', () => {
    expect(tl).toHaveLength(tl[0].state.all.length + 2);
  });

  it('每一步都有说明文字，且揭示步骤带上密度', () => {
    for (const s of tl) expect(s.caption.length).toBeGreaterThan(0);
    for (const s of tl.slice(1, -1)) expect(s.caption).toMatch(/密度/);
  });

  it('说明文字区分「单步代价是否随序列长度增长」', () => {
    const causalStep = tl.find((s) => s.caption.startsWith('因果'))!;
    const swaStep = tl.find((s) => s.caption.startsWith('滑动窗口'))!;
    expect(causalStep.caption).toContain('随序列长度增长');
    expect(swaStep.caption).toContain('与序列长度无关');
  });
});
