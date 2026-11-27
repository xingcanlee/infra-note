import { describe, expect, it } from 'vitest';
import { BACKUP_COMPARE_MODES, buildAclGraphShadowStreamSteps } from './steps';

describe('aclgraph-shadow-stream steps model', () => {
  it('models both D2D backup and skip-backup counterfactual modes', () => {
    expect(BACKUP_COMPARE_MODES.with_d2d.badgeTone).toBe('done');
    expect(BACKUP_COMPARE_MODES.no_d2d.badgeTone).toBe('highlight');
  });

  it('produces 4 ordered steps with persistent 3 lanes and balanced math', () => {
    const steps = buildAclGraphShadowStreamSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.label)).toEqual([
      'Eager 基线发射',
      '捕获与影子流备份',
      '图闭合与延迟绑定',
      '满载零开销重放',
    ]);

    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.state.lanes).toHaveLength(3);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });
});
