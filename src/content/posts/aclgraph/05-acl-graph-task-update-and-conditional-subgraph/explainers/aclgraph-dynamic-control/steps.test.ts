import { describe, expect, it } from 'vitest';
import { RESET_GUARD_MODES, SPEC_LOOP_CASES, buildAclGraphDynamicControlSteps } from './steps';

describe('aclgraph-dynamic-control steps model', () => {
  it('models both ExternalEvent guard and WHILE loop speculative cases', () => {
    expect(RESET_GUARD_MODES.with_reset.badgeTone).toBe('done');
    expect(RESET_GUARD_MODES.miss_reset.badgeTone).toBe('highlight');
    expect(SPEC_LOOP_CASES.case_3.iters).toBe(3);
    expect(SPEC_LOOP_CASES.case_4.iters).toBe(4);
    expect(SPEC_LOOP_CASES.case_1.iters).toBe(1);
  });

  it('produces 6 ordered steps with strictly increasing beats and balanced math', () => {
    const steps = buildAclGraphDynamicControlSteps();
    expect(steps).toHaveLength(6);

    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);

      const beats = step.state.beats;
      expect(beats.length).toBeGreaterThanOrEqual(4);
      expect(beats[0].at).toBe(0);
      for (let i = 1; i < beats.length; i++) {
        expect(beats[i].at).toBeGreaterThan(beats[i - 1].at);
      }
      expect((step.duration ?? 0) - beats[beats.length - 1].at).toBeGreaterThanOrEqual(1500);
    }
  });
});
