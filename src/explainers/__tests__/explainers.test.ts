import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ComponentType } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Step } from 'astro-wisp/explainers';
import { describe, expect, it, vi } from 'vitest';
import ActiveFocusFrame from '../kit/ActiveFocusFrame';
import ByteLedgerBar from '../kit/ByteLedgerBar';
import HeatmapMatrix, {
  DARK_HEAT_STROKE_WEIGHT,
  HEAT_ALPHA_BASE,
  HEAT_ALPHA_RANGE,
} from '../kit/HeatmapMatrix';
import InteractiveExplainer, { LabSegmented, LabSlider } from '../kit/InteractiveExplainer';
import TensorBlock from '../kit/TensorBlock';
import { fitTextMetrics } from '../kit/motion';

vi.mock('virtual:wisp/locale', () => ({ lang: 'zh-CN' }));

import CausalAttentionExplainer, {
  buildCausalAttentionSteps,
} from '@/content/posts/foundations/03-attention-and-rope/explainers/CausalAttentionExplainer';
import ChipArchitectureMapExplainer, {
  buildChipArchitectureMapSteps,
} from '@/content/posts/foundations/02-gpu-and-ascend-architecture/explainers/ChipArchitectureMapExplainer';
import KvCacheStepExplainer, {
  buildKvCacheStepSteps,
} from '@/content/posts/foundations/04-kv-cache-and-gqa/explainers/KvCacheStepExplainer';
import MemoryCoalescingExplainer, {
  buildMemoryCoalescingSteps,
} from '@/content/posts/foundations/02-gpu-and-ascend-architecture/explainers/MemoryCoalescingExplainer';
import MicroarchLatencyExplainer, {
  buildMicroarchLatencySteps,
} from '@/content/posts/foundations/02-gpu-and-ascend-architecture/explainers/MicroarchLatencyExplainer';
import OnlineSoftmaxExplainer, {
  buildOnlineSoftmaxSteps,
} from '@/content/posts/foundations/05-flash-attention/explainers/OnlineSoftmaxExplainer';
import RooflineExplainer, {
  buildRooflineSteps,
} from '@/content/posts/foundations/01-workload-and-roofline/explainers/RooflineExplainer';
import RopeRotationExplainer, {
  buildRopeRotationSteps,
} from '@/content/posts/foundations/03-attention-and-rope/explainers/RopeRotationExplainer';

import EpDispatchExplainer, {
  buildEpDispatchSteps,
} from '@/content/posts/distributed/02-parallelism-and-disaggregation/explainers/EpDispatchExplainer';
import RingCollectivesExplainer, {
  buildRingCollectivesSteps,
} from '@/content/posts/distributed/01-interconnects-and-collectives/explainers/RingCollectivesExplainer';

import MoeRoutingAlignExplainer, {
  buildMoeRoutingAlignSteps,
} from '@/content/posts/deepseek/06-moe/explainers/MoeRoutingAlignExplainer';
import MlaAbsorbExplainer, {
  buildMlaAbsorbSteps,
} from '@/content/posts/deepseek/01-mla/explainers/mla-absorb';
import SinkNsaRouteExplainer, {
  buildSinkNsaRouteSteps,
} from '@/content/posts/deepseek/02-swa-and-nsa/explainers/sink-nsa-route';
import DsaLightningIndexExplainer, {
  buildDsaLightningIndexSteps,
} from '@/content/posts/deepseek/03-dsa/explainers/dsa-lightning-index';
import EngramHashExplainer, {
  buildEngramHashSteps,
} from '@/content/posts/deepseek/08-engram/explainers/engram-hash';
import MegaMhcPassExplainer, {
  buildMegaMhcPassSteps,
} from '@/content/posts/deepseek/07-mhc/explainers/mega-mhc-pass';
import MhcSinkhornExplainer, {
  buildMhcSinkhornSteps,
} from '@/content/posts/deepseek/07-mhc/explainers/mhc-sinkhorn';
import ShortConvExplainer, {
  buildShortConvSteps,
} from '@/content/posts/deepseek/08-engram/explainers/short-conv';
import SpecDecVerifyExplainer, {
  buildSpecDecVerifySteps,
} from '@/content/posts/deepseek/09-mtp-and-dspark/explainers/SpecDecVerifyExplainer';

import PagedSchedulerExplainer, {
  buildPagedSchedulerSteps,
} from '@/content/posts/vllm/04-continuous-batching-and-scheduler/explainers/PagedSchedulerExplainer';
import PrepareInputsExplainer, {
  buildPrepareInputsSteps,
} from '@/content/posts/vllm/05-worker-and-model-runner-v2/explainers/prepare-inputs';
import RequestLifecycleExplainer, {
  buildRequestLifecycleSteps,
} from '@/content/posts/vllm/01-vllm-v1-architecture/explainers/request-lifecycle';

import MooncakePdFlowExplainer, {
  buildMooncakePdFlowSteps,
} from '@/content/posts/vllm-ascend/05-mooncake-pd-and-kv-pool/explainers/mooncake-pd-flow';

import AclGraphDynamicControlExplainer, {
  buildAclGraphDynamicControlSteps,
} from '@/content/posts/execgraph/06-acl-graph-task-update-and-conditional-subgraph/explainers/aclgraph-dynamic-control';
import AclGraphShadowStreamExplainer, {
  buildAclGraphShadowStreamSteps,
} from '@/content/posts/execgraph/05-acl-graph-architecture-and-capture/explainers/aclgraph-shadow-stream';
import CompileSplitFusionExplainer, {
  buildCompileSplitFusionSteps,
} from '@/content/posts/execgraph/02-torch-compile-fundamentals/explainers/compile-split-fusion';
import StreamEventPipelineExplainer, {
  buildStreamEventPipelineSteps,
} from '@/content/posts/execgraph/01-heterogeneous-streams-and-events/explainers/stream-event-pipeline';

interface ExplainerEntry {
  name: string;
  kind: 'step' | 'lab';
  Component: ComponentType<{ title?: string }>;
  buildSteps?: () => Step<unknown>[];
}

const ALL_EXPLAINERS: ExplainerEntry[] = [
  { name: 'Roofline', kind: 'lab', Component: RooflineExplainer, buildSteps: buildRooflineSteps },
  {
    name: 'ChipArchitectureMap',
    kind: 'step',
    Component: ChipArchitectureMapExplainer,
    buildSteps: buildChipArchitectureMapSteps,
  },
  {
    name: 'MicroarchLatency',
    kind: 'lab',
    Component: MicroarchLatencyExplainer,
    buildSteps: buildMicroarchLatencySteps,
  },
  {
    name: 'MemoryCoalescing',
    kind: 'lab',
    Component: MemoryCoalescingExplainer,
    buildSteps: buildMemoryCoalescingSteps,
  },
  {
    name: 'CausalAttention',
    kind: 'step',
    Component: CausalAttentionExplainer,
    buildSteps: buildCausalAttentionSteps,
  },
  {
    name: 'RopeRotation',
    kind: 'lab',
    Component: RopeRotationExplainer,
    buildSteps: buildRopeRotationSteps,
  },
  {
    name: 'KvCacheStep',
    kind: 'step',
    Component: KvCacheStepExplainer,
    buildSteps: buildKvCacheStepSteps,
  },
  {
    name: 'OnlineSoftmax',
    kind: 'step',
    Component: OnlineSoftmaxExplainer,
    buildSteps: buildOnlineSoftmaxSteps,
  },
  {
    name: 'RingCollectives',
    kind: 'step',
    Component: RingCollectivesExplainer,
    buildSteps: buildRingCollectivesSteps,
  },
  {
    name: 'EpDispatch',
    kind: 'step',
    Component: EpDispatchExplainer,
    buildSteps: buildEpDispatchSteps,
  },
  {
    name: 'MlaAbsorb',
    kind: 'step',
    Component: MlaAbsorbExplainer,
    buildSteps: buildMlaAbsorbSteps,
  },
  {
    name: 'SinkNsaRoute',
    kind: 'lab',
    Component: SinkNsaRouteExplainer,
    buildSteps: buildSinkNsaRouteSteps,
  },
  {
    name: 'DsaLightningIndex',
    kind: 'step',
    Component: DsaLightningIndexExplainer,
    buildSteps: buildDsaLightningIndexSteps,
  },
  {
    name: 'MoeRoutingAlign',
    kind: 'step',
    Component: MoeRoutingAlignExplainer,
    buildSteps: buildMoeRoutingAlignSteps,
  },
  {
    name: 'EngramHash',
    kind: 'step',
    Component: EngramHashExplainer,
    buildSteps: buildEngramHashSteps,
  },
  {
    name: 'ShortConv',
    kind: 'lab',
    Component: ShortConvExplainer,
    buildSteps: buildShortConvSteps,
  },
  {
    name: 'MhcSinkhorn',
    kind: 'lab',
    Component: MhcSinkhornExplainer,
    buildSteps: buildMhcSinkhornSteps,
  },
  {
    name: 'MegaMhcPass',
    kind: 'step',
    Component: MegaMhcPassExplainer,
    buildSteps: buildMegaMhcPassSteps,
  },
  {
    name: 'SpecDecVerify',
    kind: 'lab',
    Component: SpecDecVerifyExplainer,
    buildSteps: buildSpecDecVerifySteps,
  },
  {
    name: 'RequestLifecycle',
    kind: 'step',
    Component: RequestLifecycleExplainer,
    buildSteps: buildRequestLifecycleSteps,
  },
  {
    name: 'PagedScheduler',
    kind: 'step',
    Component: PagedSchedulerExplainer,
    buildSteps: buildPagedSchedulerSteps,
  },
  {
    name: 'PrepareInputs',
    kind: 'step',
    Component: PrepareInputsExplainer,
    buildSteps: buildPrepareInputsSteps,
  },
  {
    name: 'MooncakePdFlow',
    kind: 'lab',
    Component: MooncakePdFlowExplainer,
    buildSteps: buildMooncakePdFlowSteps,
  },
  {
    name: 'StreamEventPipeline',
    kind: 'lab',
    Component: StreamEventPipelineExplainer,
    buildSteps: buildStreamEventPipelineSteps,
  },
  {
    name: 'CompileSplitFusion',
    kind: 'step',
    Component: CompileSplitFusionExplainer,
    buildSteps: buildCompileSplitFusionSteps,
  },
  {
    name: 'AclGraphShadowStream',
    kind: 'step',
    Component: AclGraphShadowStreamExplainer,
    buildSteps: buildAclGraphShadowStreamSteps,
  },
  {
    name: 'AclGraphDynamicControl',
    kind: 'step',
    Component: AclGraphDynamicControlExplainer,
    buildSteps: buildAclGraphDynamicControlSteps,
  },
];

describe('all 27 interactive SVG explainers', () => {
  it('covers exact 27 explainers across all 6 series (17 step + 10 lab)', () => {
    expect(ALL_EXPLAINERS).toHaveLength(27);
    expect(ALL_EXPLAINERS.filter((e) => e.kind === 'step')).toHaveLength(17);
    expect(ALL_EXPLAINERS.filter((e) => e.kind === 'lab')).toHaveLength(10);
  });

  it.each(ALL_EXPLAINERS)(
    '$name ($kind) renders clean SSR SVG with KaTeX math and no inner beat progress chrome',
    ({ name, kind, Component, buildSteps }) => {
      if (kind === 'step') {
        expect(buildSteps, `${name} missing buildSteps`).toBeDefined();
        const steps = buildSteps!();
        expect(steps.length, `${name} step count`).toBeGreaterThanOrEqual(2);
        expect(steps.length, `${name} step count`).toBeLessThanOrEqual(6);

        for (const [idx, step] of steps.entries()) {
          expect(step.label?.trim().length, `${name} step ${idx} empty label`).toBeGreaterThan(0);
          expect(step.duration, `${name} step ${idx} duration >= 3600`).toBeGreaterThanOrEqual(
            3600,
          );
          expect(step.caption.trim().length, `${name} step ${idx} empty caption`).toBeGreaterThan(
            0,
          );
          expect(step.caption, `${name} step ${idx} literal markdown`).not.toMatch(/`|\*\*/);
          expect(step.caption, `${name} step ${idx} click prompt`).not.toMatch(
            /点击上方任意|点击.*聚焦/,
          );
          const unescaped = step.caption.replace(/\\\$/g, '');
          const dollars = (unescaped.match(/\$/g) ?? []).length;
          expect(dollars % 2, `${name} step ${idx} unbalanced $: ${step.caption}`).toBe(0);
        }
      }

      const defaultMarkup = renderToStaticMarkup(createElement(Component));
      expect(defaultMarkup, `${name} default markup literal markdown`).not.toMatch(/`|\*\*/);

      const markup = renderToStaticMarkup(createElement(Component, { title: `图 1：${name}` }));
      expect(markup).toContain('<svg');
      expect(markup, `${name} should not emit inner fake beat progress bar`).not.toContain(
        'wisp-kit-banner__progress',
      );
      expect(markup, `${name} should not emit inner sub-beat counter`).not.toContain(
        'wisp-kit-banner__beat',
      );
      if (kind === 'step') {
        expect(markup, `${name} should use BeatExplainer kit shell`).toContain('wisp-kit-shell');
        expect(markup, `${name} should use streamlined lab controls bar`).toContain(
          'wisp-lab__controls',
        );
        expect(markup, `${name} should not emit legacy step count`).not.toContain(
          'wisp-explainer__count',
        );
      } else {
        expect(markup, `${name} should use InteractiveExplainer lab shell`).toContain('wisp-lab');
        expect(markup, `${name} should expose interactive controls`).toContain(
          'wisp-lab__controls',
        );
      }
      expect(markup, `${name} should not ask user to click deterministic elements`).not.toMatch(
        /点击上方任意|点击.*聚焦/,
      );
      expect(markup, `${name} SSR markup should render KaTeX/.wisp-tex math`).toMatch(
        /wisp-tex|katex/,
      );
      expect(markup).not.toMatch(/\bNaN\b/);
      expect(markup).not.toContain('undefined');
      expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(markup, `${name} emitted rx="2"`).not.toMatch(/\brx=["']2["']/);
    },
  );
});

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function blendSrgb(topHex: string, bottomHex: string, alpha: number): string {
  const top = parseInt(topHex.slice(1), 16);
  const bot = parseInt(bottomHex.slice(1), 16);
  const parts = [16, 8, 0].map((shift) =>
    Math.round(((top >> shift) & 255) * alpha + ((bot >> shift) & 255) * (1 - alpha))
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${parts.join('')}`;
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe('explainer kit primitive invariants', () => {
  it('ByteLedgerBar renders all <polyline> leader lines before label <text> elements in DOM order', () => {
    const svg = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(ByteLedgerBar, {
          x: 24,
          y: 40,
          w: 632,
          segments: [
            { value: 1152, label: 'MLA BF16 1152 B', tone: 'green', active: true },
            { value: 2944, label: 'GQA-8 4096 B', tone: 'blue' },
            { value: 28672, label: 'MHA 32768 B', tone: 'slate' },
          ],
        }),
      ),
    );

    const lastPolylineIdx = svg.lastIndexOf('<polyline');
    const firstCalloutLabelIdx = svg.indexOf('MLA BF16 1152 B');
    const secondCalloutLabelIdx = svg.indexOf('GQA-8 4096 B');
    const insideLabelIdx = svg.indexOf('MHA 32768 B');
    expect(lastPolylineIdx).toBeGreaterThan(-1);
    expect(firstCalloutLabelIdx).toBeGreaterThan(lastPolylineIdx);
    expect(secondCalloutLabelIdx).toBeGreaterThan(lastPolylineIdx);
    expect(insideLabelIdx).toBeGreaterThan(lastPolylineIdx);
    expect(svg).not.toMatch(/\brx=["']2["']/);
  });

  it('TensorBlock never silently omits narrow split labels and ActiveFocusFrame exposes data-focus-target', () => {
    const svg = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(TensorBlock, {
          x: 28,
          y: 40,
          w: 132,
          h: 42,
          tone: 'green',
          splits: [{ ratio: 512 / 576, leftLabel: 'c_KV 512', rightLabel: 'k_R 64' }],
        }),
        createElement(TensorBlock, {
          x: 218,
          y: 40,
          w: 164,
          h: 42,
          tone: 'amber',
          splits: [{ ratio: 512 / 576, leftLabel: 'q_C·W_UK', rightLabel: 'q_R' }],
        }),
        createElement(ActiveFocusFrame, { x: 10, y: 20, w: 120, h: 80, visible: true }),
      ),
    );
    expect(svg).toContain('c_KV 512');
    expect(svg).toContain('k_R 64');
    expect(svg).toContain('q_C·W_UK');
    expect(svg).toContain('q_R');
    expect(svg).toContain('data-focus-target=""');
  });

  it('fitTextMetrics clamps minimum font size to 10px and avoids excessive textLength squashing', () => {
    const small = fitTextMetrics('超长标签测试文本内容', 40, 12, 7.5, 'sans');
    expect(small.fontSize).toBeGreaterThanOrEqual(10);
    expect(small.textLength).toBeUndefined();

    const mild = fitTextMetrics('1234567890', 58, 11, 8, 'mono');
    expect(mild.fontSize).toBe(10);
    expect(mild.textLength).toBe(58);
  });

  it('HeatmapMatrix dark-mode blended cell backgrounds achieve WCAG AA (>= 4.5:1) against #e6e6e3 for all 8 hues', () => {
    const palettePath = resolve(import.meta.dirname, '../../../design/palette.json');
    const palette = JSON.parse(readFileSync(palettePath, 'utf8')) as {
      color: {
        base: { fg: { dark: string } };
        hue: Record<string, { stroke: { dark: string }; fill: { dark: string } }>;
      };
    };
    const darkFg = palette.color.base.fg.dark;
    expect(darkFg.toLowerCase()).toBe('#e6e6e3');

    const maxOverlayAlpha = HEAT_ALPHA_BASE + HEAT_ALPHA_RANGE;
    for (const [hueName, pair] of Object.entries(palette.color.hue)) {
      if (hueName.startsWith('$')) continue;
      const darkOverlayColor = blendSrgb(pair.stroke.dark, pair.fill.dark, DARK_HEAT_STROKE_WEIGHT);
      const blendedBg = blendSrgb(darkOverlayColor, pair.fill.dark, maxOverlayAlpha);
      const ratio = contrastRatio(darkFg, blendedBg);
      expect(ratio, `dark heatmap ${hueName} (${blendedBg}) vs ${darkFg}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }

    const heatmapSvg = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(HeatmapMatrix, {
          x: 0,
          y: 0,
          tone: 'highlight',
          values: [
            [0, 0.5],
            [0.8, 1.0],
          ],
          selected: new Set(['1,1']),
          showLegend: true,
        }),
      ),
    );
    expect(heatmapSvg).toContain('color-mix(');
    expect(heatmapSvg).not.toMatch(/\brx=["']2["']/);
  });

  it('ActiveFocusFrame prevents (2x, 2y) double-offset bug and supports KaTeX badge labels', () => {
    const svg = renderToStaticMarkup(
      createElement(
        'svg',
        null,
        createElement(ActiveFocusFrame, {
          x: 24,
          y: 36,
          w: 180,
          h: 96,
          visible: true,
          label: '阶段 $Q_1$',
        }),
      ),
    );
    expect(svg).toMatch(/<rect[^>]*data-focus-target=""/);
    expect(svg).toContain('x="24"');
    expect(svg).toContain('y="36"');
    // Visible animated rect uses translateX(24px) translateY(36px), so it must NOT also have x="24" or y="36"
    const visibleRect = svg
      .match(/<rect[^>]*>/g)
      ?.find((r) => !r.includes('data-focus-target') && r.includes('translateX(24px)'));
    expect(visibleRect).toBeDefined();
    expect(visibleRect).not.toMatch(/\bx=["']24["']/);
    expect(visibleRect).not.toMatch(/\by=["']36["']/);
    expect(svg).toMatch(/wisp-tex|katex/);
  });

  it('InteractiveExplainer renders lab controls, formula, SVG stage, and dynamic caption cleanly in SSR', () => {
    const html = renderToStaticMarkup(
      createElement(InteractiveExplainer, {
        title: '图 1：微实验',
        formula: '$y = 2x$',
        caption: '实时说明 $x = 3$。',
        controls: createElement(
          'div',
          null,
          createElement(LabSegmented, {
            options: [
              { id: 'a', label: '模式 A' },
              { id: 'b', label: '模式 B' },
            ],
            value: 'a',
            onChange: () => {},
            ariaLabel: '切换模式',
          }),
          createElement(LabSlider, {
            label: '参数 x',
            min: 1,
            max: 8,
            value: 3,
            valueText: '3',
            onChange: () => {},
          }),
        ),
        children: createElement('svg', { viewBox: '0 0 100 40' }),
      }),
    );
    expect(html).toContain('wisp-lab');
    expect(html).toContain('wisp-lab__controls');
    expect(html).toContain('wisp-lab__seg-btn');
    expect(html).toContain('wisp-lab__slider');
    expect(html).toContain('<svg');
    expect(html).toMatch(/wisp-tex|katex/);
    expect(html).not.toContain('wisp-kit-banner__progress');
  });

  it('kit.css preserves content-fitted fullscreen sizing and overrides Stage max-width cap', () => {
    const kitCss = readFileSync(resolve(import.meta.dirname, '../kit/kit.css'), 'utf8');
    expect(kitCss).toContain('.wisp-explainer__dialog:has(.wisp-kit-shell)');
    expect(kitCss).toContain('height: fit-content;');
    expect(kitCss).toContain('max-width: min(100%, 1100px) !important;');
  });

  it('all explainer CSS/TSX files across 6 series reference defined --wisp-* tokens and valid formulaTex escaping', () => {
    function walk(dir: string): string[] {
      const files: string[] = [];
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          files.push(...walk(full));
        } else {
          files.push(full);
        }
      }
      return files;
    }

    const wispRoot = resolve(import.meta.dirname, '../../../node_modules/astro-wisp');
    const definedTokens = new Set<string>();
    for (const file of walk(wispRoot).filter((f) => f.endsWith('.css'))) {
      const css = readFileSync(file, 'utf8');
      for (const m of css.matchAll(/(--wisp-[a-z0-9-]+)\s*:/g)) {
        definedTokens.add(m[1]);
      }
    }

    const postsDir = resolve(import.meta.dirname, '../../content/posts');
    const explainerFiles = walk(postsDir).filter(
      (f) => f.includes('explainers') && (f.endsWith('.tsx') || f.endsWith('.css')),
    );
    expect(explainerFiles.length).toBeGreaterThan(0);

    for (const file of explainerFiles) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/var\((--wisp-[a-z0-9-]+)\)/g)) {
        expect(definedTokens.has(m[1]), `Undefined token ${m[1]} in ${file}`).toBe(true);
      }
      if (file.endsWith('.tsx')) {
        // Double-quoted JSX attributes containing $...$ pass literal \\ to KaTeX instead of \; require {'...'} expressions.
        const badJsxMath = src.match(/\w+="[^"]*\$[^"]*\\\\[^"]*"/g);
        expect(badJsxMath, `Double-escaped JSX math attr in ${file}`).toBeNull();
      }
    }

    for (const entry of ALL_EXPLAINERS) {
      if (!entry.buildSteps) continue;
      for (const step of entry.buildSteps()) {
        const tex = (step.state as { formulaTex?: string } | undefined)?.formulaTex ?? '';
        expect(tex, `Unescaped control char in ${entry.name} formulaTex`).not.toMatch(/[\t\r\f\b]/);
      }
    }
  });
});
