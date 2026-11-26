import { describe, expect, it } from 'vitest';
import {
  BEAT_SCHEDULES,
  LAYER_BOUNDARY_SPECS,
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

  it('produces 5 ordered steps with strictly increasing beats and valid boundary modes', () => {
    const steps = buildMegaMhcPassSteps();
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.state.totalD)).toEqual([20, 14, 10, 10, 10]);
    expect(Object.keys(LAYER_BOUNDARY_SPECS)).toEqual(['normal', 'engram']);

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
