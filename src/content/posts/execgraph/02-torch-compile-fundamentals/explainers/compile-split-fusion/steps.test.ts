import { describe, expect, it } from 'vitest';
import { GUARD_MODES, buildCompileSplitFusionSteps } from './steps';

describe('compile-split-fusion steps model', () => {
  it('models exact HBM reduction and 40-layer residual launch wall across 4 steps', () => {
    const steps = buildCompileSplitFusionSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.label)).toEqual([
      'Eager 逐算子发射',
      'Dynamo 守卫切图',
      'Inductor 算子融合',
      '残余发射墙',
    ]);
    expect(steps[0].state.hbmBytesKb).toBe(400);
    expect(steps[2].state.hbmBytesKb).toBe(240);
    expect(steps[3].state.hostUs).toBe(4800);
    expect(steps[3].state.devUs).toBe(3400);
    expect(GUARD_MODES.zero_one.recompiles).toBe(2);
    expect(GUARD_MODES.no_guard.recompiles).toBe(1);
  });

  it('has >= 3600ms duration and clean prose', () => {
    const steps = buildCompileSplitFusionSteps();
    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });
});
