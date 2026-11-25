import { describe, expect, it } from 'vitest';
import {
  ALL_CONV_RESULTS,
  BEAT_SCHEDULES,
  CONV_TOKENS,
  PROBE_POSITIONS,
  buildShortConvSteps,
  computeDilatedConvAt,
  silu,
} from './steps';

describe('ShortConv steps model', () => {
  it('continues the main 5-token example into 10 tokens and matches all 10 scan outputs', () => {
    expect(CONV_TOKENS.slice(0, 5).map((t) => t.text)).toEqual(['北京', '是', '中国', '的', '首']);
    expect(CONV_TOKENS).toHaveLength(10);
    expect(PROBE_POSITIONS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    expect(ALL_CONV_RESULTS.map((r) => r.y)).toEqual([0.5, 1, 2, 1.75, 1, 2, 2.25, -0.75, -0.5, 3]);

    const at2 = computeDilatedConvAt(2);
    expect(at2.taps.filter((t) => t.isPad)).toHaveLength(3);

    const at4 = computeDilatedConvAt(4);
    expect(at4.taps.filter((t) => t.isPad)).toHaveLength(2);

    const at9 = computeDilatedConvAt(9);
    expect(at9.taps.every((t) => !t.isPad)).toBe(true);
    expect(at9.siluY).toBeCloseTo(silu(3), 6);
    expect(at9.out).toBeCloseTo(5 + silu(3), 6);
  });

  it('produces 5 ordered steps with balanced math delimiters and clean prose', () => {
    const steps = buildShortConvSteps();
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.state.phase)).toEqual([
      'pad',
      'dilation',
      'early',
      'full',
      'tradeoff',
    ]);
    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });

  it('defines >= 4 strictly increasing beats per phase with >= 1500ms settle pause', () => {
    const steps = buildShortConvSteps();
    for (const step of steps) {
      const schedule = BEAT_SCHEDULES[step.state.phase];
      expect(schedule.length).toBeGreaterThanOrEqual(4);
      expect(schedule[0].at).toBe(0);
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].at).toBeGreaterThan(schedule[i - 1].at);
      }
      for (const beat of schedule) {
        expect(beat.label.trim().length).toBeGreaterThan(0);
        expect(beat.label).not.toMatch(/`|\*\*|[「」『』!！]/);
      }
      const lastBeat = schedule[schedule.length - 1];
      expect((step.duration ?? 0) - lastBeat.at).toBeGreaterThanOrEqual(1500);
    }
  });
});
