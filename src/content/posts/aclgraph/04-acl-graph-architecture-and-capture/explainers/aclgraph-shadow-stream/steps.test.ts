import { describe, expect, it } from 'vitest';
import { BACKUP_COMPARE_MODES, buildAclGraphShadowStreamSteps } from './steps';

describe('aclgraph-shadow-stream steps model', () => {
  it('models both D2D backup and skip-backup counterfactual modes', () => {
    expect(BACKUP_COMPARE_MODES.with_d2d.badgeTone).toBe('done');
    expect(BACKUP_COMPARE_MODES.no_d2d.badgeTone).toBe('highlight');
  });

  it('produces 6 ordered steps with strictly increasing beats and balanced math', () => {
    const steps = buildAclGraphShadowStreamSteps();
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
