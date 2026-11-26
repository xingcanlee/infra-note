import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RequestLifecycleExplainer, { buildRequestLifecycleSteps } from './index';
import { BEAT_SCHEDULES, PROMPT_TOKENS } from './steps';

vi.mock('virtual:wisp/locale', () => ({ lang: 'zh-CN' }));

describe('RequestLifecycleExplainer', () => {
  it('defines 6 ordered lifecycle steps with valid beats, math, and tokens', () => {
    expect(PROMPT_TOKENS.map((t) => t.id)).toEqual([15496, 2159, 44, 151645]);

    const steps = buildRequestLifecycleSteps();
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.state.phase)).toEqual([
      'tokenize',
      'pack',
      'ipc',
      'schedule',
      'worker',
      'stream',
    ]);

    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption.trim().length).toBeGreaterThan(0);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      expect(step.caption).not.toMatch(/点击上方任意|点击.*聚焦/);

      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);

      const schedule = BEAT_SCHEDULES[step.state.phase];
      expect(schedule.length).toBeGreaterThanOrEqual(4);
      expect(schedule[0].at).toBe(0);
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].at).toBeGreaterThan(schedule[i - 1].at);
      }
      const lastBeat = schedule[schedule.length - 1];
      expect((step.duration ?? 0) - lastBeat.at).toBeGreaterThanOrEqual(1500);
    }
  });

  it('renders clean SSR markup with BeatExplainer banner, progress bar, and KaTeX math', () => {
    const markup = renderToStaticMarkup(
      createElement(RequestLifecycleExplainer, {
        title: '图 1：vLLM V1 请求全生命周期推演',
      }),
    );
    expect(markup).toContain('<svg');
    expect(markup).toContain('wisp-kit-banner');
    expect(markup).toContain('wisp-kit-banner__progress');
    expect(markup).toMatch(/wisp-tex|katex/);
    expect(markup).not.toMatch(/`|\*\*/);
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(markup).not.toMatch(/\brx=["']2["']/);
    expect(markup).not.toMatch(/\bNaN\b/);
    expect(markup).not.toContain('undefined');
  });
});
