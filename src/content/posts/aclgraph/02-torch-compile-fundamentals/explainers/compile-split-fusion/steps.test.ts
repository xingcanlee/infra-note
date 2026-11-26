import { describe, expect, it } from 'vitest';
import { BEAT_SCHEDULES, GUARD_MODES, buildCompileSplitFusionSteps } from './steps';

describe('compile-split-fusion steps model', () => {
  it('models exact HBM reduction and 40-layer residual launch wall', () => {
    const steps = buildCompileSplitFusionSteps();
    expect(steps).toHaveLength(5);
    expect(steps[0].state.hbmBytesKb).toBe(400);
    expect(steps[3].state.hbmBytesKb).toBe(240);
    expect(steps[4].state.hostUs).toBe(4800);
    expect(steps[4].state.devUs).toBe(3400);
    expect(GUARD_MODES.zero_one.recompiles).toBe(2);
    expect(GUARD_MODES.no_guard.recompiles).toBe(1);
  });

  it('has strictly increasing beats, >= 3600ms duration, and clean prose', () => {
    const steps = buildCompileSplitFusionSteps();
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
      expect((step.duration ?? 0) - schedule[schedule.length - 1].at).toBeGreaterThanOrEqual(1500);
    }
  });
});
