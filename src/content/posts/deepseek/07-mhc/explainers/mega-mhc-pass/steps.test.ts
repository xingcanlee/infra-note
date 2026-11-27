import { describe, expect, it } from 'vitest';
import {
  SINGLE_PASS_SEGMENTS,
  SPLIT_4_SEGMENTS,
  TWO_PASS_SEGMENTS,
  buildMegaMhcPassSteps,
} from './steps';

describe('mega-mhc-pass steps model', () => {
  it('enforces exact HBM IO ledger progression 20d -> 14d -> 10d', () => {
    const sumD = (segs: readonly { costD: number }[]) => segs.reduce((acc, s) => acc + s.costD, 0);
    expect(sumD(SPLIT_4_SEGMENTS)).toBe(20);
    expect(sumD(TWO_PASS_SEGMENTS)).toBe(14);
    expect(sumD(SINGLE_PASS_SEGMENTS)).toBe(10);
  });

  it('produces 4 ordered steps from split baseline to single-pass lower bound', () => {
    const steps = buildMegaMhcPassSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.label)).toEqual([
      '四算子基线',
      '两遍融合受阻',
      '错位时移重组',
      '单遍融合下界',
    ]);
    expect(steps.map((s) => s.state.totalD)).toEqual([20, 14, 10, 10]);
    expect(steps.map((s) => s.state.hbmTrips)).toEqual([4, 2, 1, 1]);

    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });
});
