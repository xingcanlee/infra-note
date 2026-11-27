import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('virtual:wisp/locale', () => ({ lang: 'zh-CN' }));

import MooncakePdFlowExplainer, { buildMooncakePdFlowSteps } from './index';
import { PD_MODES } from './steps';

describe('MooncakePdFlowExplainer', () => {
  it('defines 4 PD transfer modes with balanced math and clean copy', () => {
    expect(PD_MODES.map((m) => m.id)).toEqual(['pull', 'push', 'd2rh', 'host-hit']);

    const steps = buildMooncakePdFlowSteps();
    expect(steps).toHaveLength(4);

    for (const mode of PD_MODES) {
      expect(mode.tabLabel.trim().length).toBeGreaterThan(0);
      expect(mode.caption).not.toMatch(/`|\*\*|[「」『』!！]/);
      const unescaped = mode.caption.replace(/\\\$/g, '');
      expect((unescaped.match(/\$/g) ?? []).length % 2).toBe(0);
      expect(mode.lanes).toHaveLength(4);
    }
  });

  it('renders SSR markup with InteractiveExplainer LabSegmented, SwimlaneTimeline, and KaTeX math', () => {
    const html = renderToStaticMarkup(
      createElement(MooncakePdFlowExplainer, {
        title: '图 1：Mooncake PD 分离四模式时序交互实验',
      }),
    );
    expect(html).toContain('wisp-lab__seg');
    expect(html).toContain('Pull 算完拉取');
    expect(html).toContain('Push 逐层重叠');
    expect(html).toContain('D2RH 驻留 Host');
    expect(html).toContain('Host 前缀命中');
    expect(html).toContain('<svg');
    expect(html).toMatch(/wisp-tex|katex/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\brx=["']2["']/);
    expect(html).not.toMatch(/\bNaN\b/);
    expect(html).not.toContain('undefined');
  });

  it('uses @layer utilities and zero hardcoded hex colors in style.css', () => {
    const css = readFileSync(resolve(import.meta.dirname, 'style.css'), 'utf8');
    expect(css).toContain('@layer utilities');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
