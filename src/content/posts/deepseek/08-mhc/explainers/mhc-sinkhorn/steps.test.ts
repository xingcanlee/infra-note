import { describe, expect, it } from 'vitest';
import {
  BEAT_SCHEDULES,
  H_IN,
  H_POST,
  H_RES,
  OUTPUT_STREAMS,
  SK_M0,
  SK_M1_COL,
  SK_M1_ROW,
  SK_M20,
  STABILITY_MODES,
  buildMhcSinkhornSteps,
} from './steps';

describe('mhc-sinkhorn steps model', () => {
  it('computes exact single-sublayer hand-trace values', () => {
    expect(H_IN).toBeCloseTo(19.0, 6);
    expect(H_RES).toEqual([19.0, 24.0, 26.0, 31.0]);
    expect(H_RES.reduce((a, b) => a + b, 0)).toBeCloseTo(100.0, 6);
    expect(H_POST).toEqual([4.8, 3.2, 2.0, 6.0]);
    expect(OUTPUT_STREAMS).toEqual([23.8, 27.2, 28.0, 37.0]);
  });

  it('converges 2x2 Sinkhorn-Knopp matrix to doubly stochastic', () => {
    expect(SK_M0).toEqual([
      [1.0, 3.0],
      [1.0, 1.0],
    ]);
    expect(SK_M1_COL[0][0]).toBeCloseTo(0.5, 6);
    expect(SK_M1_COL[0][1]).toBeCloseTo(0.75, 6);
    expect(SK_M1_ROW[0][0]).toBeCloseTo(0.4, 6);
    expect(SK_M1_ROW[1][0]).toBeCloseTo(2 / 3, 6);

    for (const row of SK_M20) {
      expect(row[0] + row[1]).toBeCloseTo(1.0, 5);
    }
    for (const c of [0, 1]) {
      expect(SK_M20[0][c] + SK_M20[1][c]).toBeCloseTo(1.0, 5);
    }
  });

  it('produces 6 valid steps with strictly increasing beat schedules and clean text', () => {
    const steps = buildMhcSinkhornSteps();
    expect(steps).toHaveLength(6);
    expect(Object.keys(STABILITY_MODES)).toEqual(['hc', 'sinkhorn_5', 'sinkhorn_20']);

    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);

      const schedule = BEAT_SCHEDULES[step.state.phase];
      expect(schedule.length).toBeGreaterThanOrEqual(4);
      expect(schedule[0].at).toBe(0);
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].at).toBeGreaterThan(schedule[i - 1].at);
      }
      const lastBeat = schedule[schedule.length - 1];
      expect((step.duration ?? 0) - lastBeat.at).toBeGreaterThanOrEqual(1500);
    }
  });
});
