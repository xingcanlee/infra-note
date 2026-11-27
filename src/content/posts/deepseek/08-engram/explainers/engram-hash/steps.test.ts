import { describe, expect, it } from 'vitest';
import {
  ORDER_DEMO,
  SCENARIOS,
  TOTAL_ROWS,
  buildEngramHashSteps,
  computeRollingHash,
  computeSlots,
} from './steps';

describe('EngramHash steps model', () => {
  it('computes exact rolling XOR hashes, order sensitivity, and slot indices matching 08-engram article', () => {
    expect(ORDER_DEMO).toEqual({
      a: 12,
      b: 88,
      rawXor: 84,
      sameXor: 0,
      fwd: 348,
      rev: 588,
    });

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

  it('produces 4 unified steps from normalization and rolling XOR to bucket lookup and gating', () => {
    const steps = buildEngramHashSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.state.phase)).toEqual(['normalize', 'xor', 'lookup', 'gate']);
    expect(steps.map((s) => s.label)).toEqual([
      '词表归一与后缀',
      '奇乘子滚动异或',
      '素数取模查桶',
      '碰撞与门控融合',
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
