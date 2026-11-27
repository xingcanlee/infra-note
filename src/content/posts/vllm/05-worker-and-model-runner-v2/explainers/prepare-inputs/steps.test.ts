import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('virtual:wisp/locale', () => ({ lang: 'zh-CN' }));

import PrepareInputsExplainer, { buildPrepareInputsSteps } from './index';
import { STAGED_DIFFS_STEP2, TRACE_STEP1, TRACE_STEP2 } from './steps';

describe('PrepareInputsExplainer steps and SSR', () => {
  it('computes exact Step 1 and Step 2 tensor indices and slot mappings', () => {
    expect(TRACE_STEP1.reqIndices).toEqual([0, 0, 0, 1, 1, 2, 2, 2, 2, 2]);
    expect(TRACE_STEP1.positions).toEqual([0, 1, 2, 0, 1, 0, 1, 2, 3, 4]);
    expect(TRACE_STEP1.tokenIndices).toEqual([0, 1, 2, 12, 13, 24, 25, 26, 27, 28]);
    expect(TRACE_STEP1.blockTableIndices).toEqual([0, 0, 1, 6, 6, 12, 12, 13, 13, 14]);
    expect(TRACE_STEP1.blockNumbers).toEqual([1, 1, 2, 3, 3, 4, 4, 5, 5, 6]);
    expect(TRACE_STEP1.blockOffsets).toEqual([0, 1, 0, 0, 1, 0, 1, 0, 1, 0]);
    expect(TRACE_STEP1.slotMapping).toEqual([2, 3, 4, 6, 7, 8, 9, 10, 11, 12]);
    expect(TRACE_STEP1.queryStartLoc).toEqual([0, 3, 5, 10]);
    expect(TRACE_STEP1.seqLens).toEqual([3, 2, 5]);

    expect(STAGED_DIFFS_STEP2.map((d) => [d.row, d.start, d.values])).toEqual([
      [1, 1, [7]],
      [2, 3, [8]],
    ]);

    expect(TRACE_STEP2.reqIndices).toEqual([0, 1, 2, 2, 2]);
    expect(TRACE_STEP2.positions).toEqual([3, 2, 5, 6, 7]);
    expect(TRACE_STEP2.tokenIndices).toEqual([3, 14, 29, 30, 31]);
    expect(TRACE_STEP2.blockTableIndices).toEqual([1, 7, 14, 15, 15]);
    expect(TRACE_STEP2.blockNumbers).toEqual([2, 7, 6, 8, 8]);
    expect(TRACE_STEP2.blockOffsets).toEqual([1, 0, 1, 0, 1]);
    expect(TRACE_STEP2.slotMapping).toEqual([5, 14, 13, 16, 17]);
    expect(TRACE_STEP2.queryStartLoc).toEqual([0, 1, 2, 5]);
    expect(TRACE_STEP2.seqLens).toEqual([4, 3, 8]);
  });

  it('produces 4 ordered steps with valid captions and balanced KaTeX', () => {
    const steps = buildPrepareInputsSteps();
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.state.phase)).toEqual([
      'init',
      'step1_map',
      'staged_write',
      'async_gather',
    ]);

    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
    }
  });

  it('renders SSR markup with wisp-kit banner, persistent CPU/GPU layout, and KaTeX', () => {
    const html = renderToStaticMarkup(
      createElement(PrepareInputsExplainer, {
        title: '图 2：ModelRunner V2 永久行状态与输入元数据组装推演',
      }),
    );
    expect(html).toContain('wisp-kit-shell');
    expect(html).toContain('wisp-lab__controls');
    expect(html).toContain('<svg');
    expect(html).toContain('RequestState');
    expect(html).toContain('BlockTables');
    expect(html).toMatch(/wisp-tex|katex/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\brx=["']2["']/);
  });
});
