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

  it('produces 4 ordered steps with balanced math and clean prose', () => {
    const steps = buildAclGraphDynamicControlSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.label)).toEqual([
      '静态图动态断点',
      '槽位划定与护栏',
      '条件复位与切换',
      '固件派发设备循环',
    ]);

    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });
});
