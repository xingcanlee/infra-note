import { describe, expect, it } from 'vitest';
import {
  ALL_CONV_RESULTS_D1,
  ALL_CONV_RESULTS_D4,
  CONV_TOKENS,
  PROBE_POSITIONS,
  buildShortConvSteps,
  computeDilatedConvAt,
  silu,
} from './steps';

describe('ShortConv steps model', () => {
  it('computes exact 1D causal dilated conv (k=4) for both d=1 and d=4', () => {
    expect(CONV_TOKENS.slice(0, 5).map((t) => t.text)).toEqual(['北京', '是', '中国', '的', '首']);
    expect(CONV_TOKENS).toHaveLength(10);
    expect(PROBE_POSITIONS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // d=1 at t=2: taps = [2, 1, 0, -1(pad)] -> 0.5*4 + 0.25*2 - 0.5*1 + 0 = 2.0
    const d1At2 = computeDilatedConvAt(2, 1);
    expect(d1At2.taps.filter((t) => t.isPad)).toHaveLength(1);
    expect(d1At2.y).toBeCloseTo(2.0, 6);

    // d=1 at t=9: taps = [9, 8, 7, 6] -> 0.5*5 + 0.25*2 - 0.5*0 + 1.0*4 = 7.0
    const d1At9 = ALL_CONV_RESULTS_D1[9];
    expect(d1At9.taps.every((t) => !t.isPad)).toBe(true);
    expect(d1At9.y).toBeCloseTo(7.0, 6);

    // d=4 at t=9: taps = [9, 5, 1, -3(pad)] -> 0.5*5 + 0.25*2 - 0.5*2 + 0 = 2.0
    const d4At9 = ALL_CONV_RESULTS_D4[9];
    expect(d4At9.taps.filter((t) => t.isPad)).toHaveLength(1);
    expect(d4At9.y).toBeCloseTo(2.0, 6);
    expect(d4At9.siluY).toBeCloseTo(silu(2.0), 6);
    expect(d4At9.out).toBeCloseTo(5 + silu(2.0), 6);
  });

  it('produces 4 valid reference steps with balanced math delimiters and clean prose', () => {
    const steps = buildShortConvSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.state.phase)).toEqual(['pad', 'dilation', 'scan', 'tradeoff']);
    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });
});
