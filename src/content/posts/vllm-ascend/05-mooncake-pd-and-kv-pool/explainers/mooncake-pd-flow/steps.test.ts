import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('virtual:wisp/locale', () => ({ lang: 'zh-CN' }));

import MooncakePdFlowExplainer, { buildMooncakePdFlowSteps } from './index';
import { BEAT_SCHEDULES } from './steps';

describe('MooncakePdFlowExplainer', () => {
  it('defines 6 valid steps with balanced math, >= 3600ms duration, and clean copy', () => {
    const steps = buildMooncakePdFlowSteps();
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.state.phase)).toEqual([
      'pull-compute',
      'pull-drain',
      'push-prealloc',
      'push-overlap',
      'd2rh-stage',
      'd2rh-hit',
    ]);

    for (const step of steps) {
      expect(step.label?.trim().length).toBeGreaterThan(0);
      expect(step.duration).toBeGreaterThanOrEqual(3600);
      expect(step.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = step.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);

      const schedule = BEAT_SCHEDULES[step.state.phase];
      expect(schedule.length).toBeGreaterThanOrEqual(4);
      expect(schedule[0].at).toBe(0);
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].at).toBeGreaterThan(schedule[i - 1].at);
      }
      for (const beat of schedule) {
        expect(beat.label.trim().length).toBeGreaterThan(0);
        expect(beat.label).not.toMatch(/`|\*\*|[「」『』!！]/);
      }
      const lastBeat = schedule[schedule.length - 1];
      expect((step.duration ?? 0) - lastBeat.at).toBeGreaterThanOrEqual(1500);
    }
  });

  it('renders SSR markup with wisp-kit-banner, progress bar, KaTeX math, and zero hex/rx=2', () => {
    const html = renderToStaticMarkup(
      createElement(MooncakePdFlowExplainer, {
        title: '图 1：Mooncake Pull、Layerwise Push 与 D2RH 三模式动态推演',
      }),
    );
    expect(html).toContain('wisp-kit-banner');
    expect(html).toContain('wisp-kit-banner__progress');
    expect(html).toMatch(/wisp-tex|katex/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\brx=["']2["']/);
    expect(html).not.toMatch(/点击上方任意|点击.*聚焦/);
  });

  it('uses @layer utilities and zero hardcoded hex colors in style.css', () => {
    const css = readFileSync(resolve(import.meta.dirname, 'style.css'), 'utf8');
    expect(css).toContain('@layer utilities');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
