import { describe, expect, it } from 'vitest';
import {
  ALL_SLOTS,
  INDEX_SCORES,
  RELU_HEAD0,
  RELU_HEAD1,
  TOPK_2_SLOTS,
  TOPK_3_SLOTS,
  buildDsaLightningIndexSteps,
} from './steps';

describe('dsa-lightning-index 8-slot micro-example invariants', () => {
  it('computes exact ReLU weighted index scores and Top-K slot subsets', () => {
    expect(RELU_HEAD0).toEqual([0, 3.2, 0.4, 4.1, 0, 2.0, 0, 3.8]);
    expect(RELU_HEAD1).toEqual([0, 1.2, 0, 2.0, 0, 1.2, 0.4, 1.0]);
    expect(INDEX_SCORES).toEqual([0.0, 3.8, 0.4, 5.1, 0.0, 2.6, 0.2, 4.3]);
    expect(TOPK_2_SLOTS).toEqual([3, 7]);
    expect(TOPK_3_SLOTS).toEqual([1, 3, 7]);
    expect(ALL_SLOTS).toHaveLength(8);
  });

  it('builds 4 valid BeatExplainer steps with balanced math and clean captions', () => {
    const steps = buildDsaLightningIndexSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.label)).toEqual([
      '双头原始点积',
      'ReLU 负分归零',
      '加权求和索引分',
      '稀疏 Gather',
    ]);
    for (const s of steps) {
      expect(s.label?.trim().length).toBeGreaterThan(0);
      expect(s.duration).toBeGreaterThanOrEqual(3600);
      expect(s.caption.trim().length).toBeGreaterThan(0);
      expect(s.caption).not.toMatch(/`|\*\*|[!！]|[「」『』]/);
      const unescaped = s.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
      expect(s.state.formulaTex.trim().length).toBeGreaterThan(0);
    }
  });
});
