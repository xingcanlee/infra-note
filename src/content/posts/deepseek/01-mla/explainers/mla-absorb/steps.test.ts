import { describe, expect, it } from 'vitest';
import {
  COMPUTE_WIDTH_MHA,
  COMPUTE_WIDTH_MQA,
  COMPUTE_WIDTH_RATIO,
  DSV3_DC,
  DSV3_DH,
  DSV3_DR,
  DSV3_HEADS,
  KV_COMPRESS_RATIO,
  MHA_KV_BYTES_PER_TOK,
  MHA_KV_ELEM_PER_TOK,
  MLA_KV_BYTES_PER_TOK,
  MLA_KV_ELEM_PER_TOK,
  buildMlaAbsorbSteps,
} from './steps';

describe('mla-absorb DeepSeek-V3 scale invariants', () => {
  it('matches DeepSeek-V3 production dimensions and bandwidth/compute ratios', () => {
    expect(DSV3_HEADS).toBe(128);
    expect(DSV3_DH).toBe(128);
    expect(DSV3_DC).toBe(512);
    expect(DSV3_DR).toBe(64);
    expect(MHA_KV_ELEM_PER_TOK).toBe(32768);
    expect(MHA_KV_BYTES_PER_TOK).toBe(65536);
    expect(MLA_KV_ELEM_PER_TOK).toBe(576);
    expect(MLA_KV_BYTES_PER_TOK).toBe(1152);
    expect(KV_COMPRESS_RATIO).toBeCloseTo(56.89, 2);
    expect(COMPUTE_WIDTH_MHA).toBe(320);
    expect(COMPUTE_WIDTH_MQA).toBe(1088);
    expect(COMPUTE_WIDTH_RATIO).toBeCloseTo(3.4, 1);
  });

  it('builds 4 valid BeatExplainer steps with balanced math and clean captions', () => {
    const steps = buildMlaAbsorbSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.label)).toEqual([
      '从 h_t 压缩',
      '展开与 RoPE 阻塞',
      '解耦与矩阵吸收',
      '双路径切换',
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
