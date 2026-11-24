import { describe, expect, it } from 'vitest';
import {
  BEAT_SCHEDULES,
  SCENARIOS,
  TOTAL_ROWS,
  buildEngramHashSteps,
  computeRollingHash,
  computeSlots,
} from './steps';

describe('EngramHash steps model', () => {
  it('computes exact rolling XOR hashes and slot indices matching 07-engram article arithmetic', () => {
    const china = computeRollingHash(88, 12, 308);
    expect(china).toEqual({
      prod0: 264,
      prod1: 84,
      h2: 348,
      prod2: 2772,
      h3: 2952,
    });
    expect(computeSlots(china.h2, china.h3).map((s) => s.slot)).toEqual([3, 10, 16, 24]);

    const chief = computeRollingHash(88, 12, 729);
    expect(chief.h2).toBe(348);
    expect(chief.h3).toBe(6397);
    expect(computeSlots(chief.h2, chief.h3).map((s) => s.slot)).toEqual([3, 10, 18, 24]);

    expect(SCENARIOS.china.slots).toEqual([3, 10, 16, 24]);
    expect(SCENARIOS.new_chief.slots).toEqual([3, 10, 18, 24]);
    expect(SCENARIOS.poem.slots).toEqual([3, 10, 13, 27]);
    expect(TOTAL_ROWS).toBe(36);
  });

  it('produces 6 labeled steps with balanced math delimiters and clean prose', () => {
    const steps = buildEngramHashSteps();
    expect(steps).toHaveLength(6);
    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });

  it('defines >= 4 strictly increasing beats per phase with >= 1500ms settle pause', () => {
    const steps = buildEngramHashSteps();
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
