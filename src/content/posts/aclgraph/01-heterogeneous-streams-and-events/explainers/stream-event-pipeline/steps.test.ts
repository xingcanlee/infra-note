import { describe, expect, it } from 'vitest';
import { RACE_COMPARE_MODES, buildStreamEventPipelineSteps } from './steps';

describe('stream-event-pipeline steps model', () => {
  it('models both race and Fork-Join safe timelines accurately', () => {
    expect(RACE_COMPARE_MODES.no_sync.syncEvents).toHaveLength(0);
    expect(RACE_COMPARE_MODES.with_event.syncEvents).toHaveLength(2);
    const safeK4 = RACE_COMPARE_MODES.with_event.lanes[1].blocks.find((b) =>
      b.label.includes('K4'),
    );
    expect(safeK4?.start).toBe(70);
  });

  it('produces 5 valid steps with strictly increasing beats and balanced math', () => {
    const steps = buildStreamEventPipelineSteps();
    expect(steps).toHaveLength(5);

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
