import { describe, expect, it } from 'vitest';
import {
  P_FULL,
  P_PURE_SWA,
  P_SINK_SWA,
  buildSinkNsaRouteSteps,
  computeSinkNsaSnapshot,
} from './steps';

describe('sink-nsa-route 8-token scale invariants', () => {
  it('matches the 8-token Attention Sink numerical example in prose', () => {
    const fullW = P_FULL[5] + P_FULL[6] + P_FULL[7];
    const pureW = P_PURE_SWA[5] + P_PURE_SWA[6] + P_PURE_SWA[7];
    const sinkW = P_SINK_SWA[5] + P_SINK_SWA[6] + P_SINK_SWA[7];
    expect(P_FULL[0]).toBeCloseTo(0.95, 3);
    expect(fullW).toBeCloseTo(0.0358, 4);
    expect(pureW).toBeCloseTo(1.0, 6);
    expect(P_SINK_SWA[0]).toBeCloseTo(0.9637, 4);
    expect(sinkW).toBeCloseTo(0.0363, 4);

    const pureSnap = computeSinkNsaSnapshot('pure_swa', 6.0);
    expect(pureSnap.windowAmp).toBeCloseTo(27.96, 2);

    const nsaSnap = computeSinkNsaSnapshot('nsa_3branch', 6.0);
    const total = nsaSnap.weights.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 6);
    expect(nsaSnap.midMass).toBeGreaterThan(0.4);
  });

  it('builds 4 valid mode steps with balanced math and clean captions', () => {
    const steps = buildSinkNsaRouteSteps();
    expect(steps).toHaveLength(4);
    for (const s of steps) {
      expect(s.label?.trim().length).toBeGreaterThan(0);
      expect(s.duration).toBeGreaterThanOrEqual(3600);
      expect(s.caption).not.toMatch(/`|\*\*|[!！]|[「」『』]/);
      const unescaped = s.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });
});
