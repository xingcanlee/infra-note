import { describe, expect, it } from 'vitest';
import { STREAM_MODE_ORDER, STREAM_PIPELINE_MODES, buildStreamEventPipelineSteps } from './steps';

describe('stream-event-pipeline modes model', () => {
  it('models all 4 stream scheduling modes with persistent lanes', () => {
    expect(STREAM_MODE_ORDER).toEqual([
      'single_fifo',
      'dual_event',
      'launch_bubble',
      'host_sync_trap',
    ]);

    for (const id of STREAM_MODE_ORDER) {
      const mode = STREAM_PIPELINE_MODES[id];
      expect(mode.lanes).toHaveLength(3);
      expect(mode.lanes.map((l) => l.id)).toEqual(['host', 'sq0', 'sq1']);
      expect(mode.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = mode.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }

    const k4Dual = STREAM_PIPELINE_MODES.dual_event.lanes[1].blocks.find((b) =>
      b.label.includes('K4'),
    );
    expect(k4Dual?.start).toBe(70);
    expect(STREAM_PIPELINE_MODES.dual_event.arrows).toHaveLength(2);
  });

  it('keeps buildStreamEventPipelineSteps compatible with 4 valid entries', () => {
    const steps = buildStreamEventPipelineSteps();
    expect(steps).toHaveLength(4);
    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
    }
  });
});
