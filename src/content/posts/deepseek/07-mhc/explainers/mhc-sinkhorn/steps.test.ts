import { describe, expect, it } from 'vitest';
import {
  SK_M0,
  SK_M1_COL,
  SK_M1_ROW,
  SK_M20,
  buildMhcSinkhornSteps,
  computeSinkhornSnapshot,
} from './steps';

describe('mhc-sinkhorn steps model', () => {
  it('converges 2x2 Sinkhorn-Knopp matrix across k=0..20 and col/row half-steps', () => {
    expect(SK_M0).toEqual([
      [1.0, 3.0],
      [1.0, 1.0],
    ]);

    const s0 = computeSinkhornSnapshot(0, 'row');
    expect(s0.colSums).toEqual([2, 4]);
    expect(s0.rowSums).toEqual([4, 2]);
    expect(s0.maxErr).toBeCloseTo(3.0, 6);

    const s1Col = computeSinkhornSnapshot(1, 'col');
    expect(SK_M1_COL[0][0]).toBeCloseTo(0.5, 6);
    expect(SK_M1_COL[0][1]).toBeCloseTo(0.75, 6);
    expect(s1Col.colSums[0]).toBeCloseTo(1.0, 6);
    expect(s1Col.colSums[1]).toBeCloseTo(1.0, 6);
    expect(s1Col.rowSums[0]).toBeCloseTo(1.25, 6);
    expect(s1Col.rowSums[1]).toBeCloseTo(0.75, 6);

    const s1Row = computeSinkhornSnapshot(1, 'row');
    expect(SK_M1_ROW[0][0]).toBeCloseTo(0.4, 6);
    expect(SK_M1_ROW[1][0]).toBeCloseTo(2 / 3, 6);
    expect(s1Row.rowSums[0]).toBeCloseTo(1.0, 6);
    expect(s1Row.rowSums[1]).toBeCloseTo(1.0, 6);
    expect(s1Row.maxColErr).toBeCloseTo(1 / 15, 6);

    for (const row of SK_M20) {
      expect(row[0] + row[1]).toBeCloseTo(1.0, 5);
    }
    for (const c of [0, 1]) {
      expect(SK_M20[0][c] + SK_M20[1][c]).toBeCloseTo(1.0, 5);
    }
  });

  it('produces 4 valid reference steps with balanced math delimiters and clean text', () => {
    const steps = buildMhcSinkhornSteps();
    expect(steps).toHaveLength(4);
    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });
});
