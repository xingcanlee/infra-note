import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import TensorBlock from '../kit/TensorBlock';
import { fitTextMetrics } from '../kit/motion';

vi.mock('virtual:wisp/locale', () => ({ lang: 'zh-CN' }));

import CausalAttentionExplainer, {
  buildCausalAttentionSteps,
} from '../foundations/CausalAttentionExplainer';
import FlashMlaSeesawExplainer, {
  buildFlashMlaSeesawSteps,
} from '../foundations/FlashMlaSeesawExplainer';
import ForwardPassExplainer, { buildForwardPassSteps } from '../foundations/ForwardPassExplainer';
import KvCacheStepExplainer, { buildKvCacheStepSteps } from '../foundations/KvCacheStepExplainer';
import OnlineSoftmaxExplainer, {
  buildOnlineSoftmaxSteps,
} from '../foundations/OnlineSoftmaxExplainer';
import OutlierQuantExplainer, {
  buildOutlierQuantSteps,
} from '../foundations/OutlierQuantExplainer';
import RooflineExplainer, { buildRooflineSteps } from '../foundations/RooflineExplainer';
import RopeRotationExplainer, {
  buildRopeRotationSteps,
} from '../foundations/RopeRotationExplainer';
import YarnSpectrumExplainer, {
  buildYarnSpectrumSteps,
} from '../foundations/YarnSpectrumExplainer';

import DboTimelineExplainer, { buildDboTimelineSteps } from '../distributed/DboTimelineExplainer';
import EpDispatchExplainer, { buildEpDispatchSteps } from '../distributed/EpDispatchExplainer';
import RingCollectivesExplainer, {
  buildRingCollectivesSteps,
} from '../distributed/RingCollectivesExplainer';

import ClusterDboSynthExplainer, {
  buildClusterDboSynthSteps,
} from '../deepseek/ClusterDboSynthExplainer';
import Csa2HsiExplainer, { buildCsa2HsiSteps } from '../deepseek/Csa2HsiExplainer';
import CsaRingExplainer, { buildCsaRingSteps } from '../deepseek/CsaRingExplainer';
import DsaIndexerExplainer, { buildDsaIndexerSteps } from '../deepseek/DsaIndexerExplainer';
import DsparkChainExplainer, { buildDsparkChainSteps } from '../deepseek/DsparkChainExplainer';
import EngramGateExplainer, { buildEngramGateSteps } from '../deepseek/EngramGateExplainer';
import EngramPrimeHashExplainer, {
  buildEngramPrimeHashSteps,
} from '../deepseek/EngramPrimeHashExplainer';
import MlaAbsorbExplainer, { buildMlaAbsorbSteps } from '../deepseek/MlaAbsorbExplainer';
import MoeRoutingAlignExplainer, {
  buildMoeRoutingAlignSteps,
} from '../deepseek/MoeRoutingAlignExplainer';
import NsaThreeBranchExplainer, {
  buildNsaThreeBranchSteps,
} from '../deepseek/NsaThreeBranchExplainer';
import SinkSwaExplainer, { buildSinkSwaSteps } from '../deepseek/SinkSwaExplainer';
import SpecDecVerifyExplainer, {
  buildSpecDecVerifySteps,
} from '../deepseek/SpecDecVerifyExplainer';
import V41LayerStepExplainer, { buildV41LayerStepSteps } from '../deepseek/V41LayerStepExplainer';

import AscendAclGraphExplainer, { buildAscendAclGraphSteps } from '../vllm/AscendAclGraphExplainer';
import AsyncLaunchQueueExplainer, {
  buildAsyncLaunchQueueSteps,
} from '../vllm/AsyncLaunchQueueExplainer';
import CudaGraphBoundariesExplainer, {
  buildCudaGraphBoundariesSteps,
} from '../vllm/CudaGraphBoundariesExplainer';
import DpDispatchConsensusExplainer, {
  buildDpDispatchConsensusSteps,
} from '../vllm/DpDispatchConsensusExplainer';
import PagedSchedulerExplainer, { buildPagedSchedulerSteps } from '../vllm/PagedSchedulerExplainer';
import ProfilerSignaturesExplainer, {
  buildProfilerSignaturesSteps,
} from '../vllm/ProfilerSignaturesExplainer';

interface ExplainerEntry {
  name: string;
  Component: ComponentType<{ title?: string }>;
  buildSteps: () => Step<unknown>[];
}

const ALL_EXPLAINERS: ExplainerEntry[] = [
  { name: 'ForwardPass', Component: ForwardPassExplainer, buildSteps: buildForwardPassSteps },
  { name: 'Roofline', Component: RooflineExplainer, buildSteps: buildRooflineSteps },
  {
    name: 'CausalAttention',
    Component: CausalAttentionExplainer,
    buildSteps: buildCausalAttentionSteps,
  },
  { name: 'RopeRotation', Component: RopeRotationExplainer, buildSteps: buildRopeRotationSteps },
  { name: 'YarnSpectrum', Component: YarnSpectrumExplainer, buildSteps: buildYarnSpectrumSteps },
  { name: 'KvCacheStep', Component: KvCacheStepExplainer, buildSteps: buildKvCacheStepSteps },
  { name: 'OnlineSoftmax', Component: OnlineSoftmaxExplainer, buildSteps: buildOnlineSoftmaxSteps },
  {
    name: 'FlashMlaSeesaw',
    Component: FlashMlaSeesawExplainer,
    buildSteps: buildFlashMlaSeesawSteps,
  },
  { name: 'OutlierQuant', Component: OutlierQuantExplainer, buildSteps: buildOutlierQuantSteps },
  {
    name: 'RingCollectives',
    Component: RingCollectivesExplainer,
    buildSteps: buildRingCollectivesSteps,
  },
  { name: 'EpDispatch', Component: EpDispatchExplainer, buildSteps: buildEpDispatchSteps },
  { name: 'DboTimeline', Component: DboTimelineExplainer, buildSteps: buildDboTimelineSteps },
  { name: 'MlaAbsorb', Component: MlaAbsorbExplainer, buildSteps: buildMlaAbsorbSteps },
  { name: 'SinkSwa', Component: SinkSwaExplainer, buildSteps: buildSinkSwaSteps },
  {
    name: 'NsaThreeBranch',
    Component: NsaThreeBranchExplainer,
    buildSteps: buildNsaThreeBranchSteps,
  },
  { name: 'DsaIndexer', Component: DsaIndexerExplainer, buildSteps: buildDsaIndexerSteps },
  { name: 'CsaRing', Component: CsaRingExplainer, buildSteps: buildCsaRingSteps },
  { name: 'Csa2Hsi', Component: Csa2HsiExplainer, buildSteps: buildCsa2HsiSteps },
  {
    name: 'MoeRoutingAlign',
    Component: MoeRoutingAlignExplainer,
    buildSteps: buildMoeRoutingAlignSteps,
  },
  {
    name: 'EngramPrimeHash',
    Component: EngramPrimeHashExplainer,
    buildSteps: buildEngramPrimeHashSteps,
  },
  { name: 'EngramGate', Component: EngramGateExplainer, buildSteps: buildEngramGateSteps },
  { name: 'SpecDecVerify', Component: SpecDecVerifyExplainer, buildSteps: buildSpecDecVerifySteps },
  { name: 'DsparkChain', Component: DsparkChainExplainer, buildSteps: buildDsparkChainSteps },
  { name: 'V41LayerStep', Component: V41LayerStepExplainer, buildSteps: buildV41LayerStepSteps },
  {
    name: 'ClusterDboSynth',
    Component: ClusterDboSynthExplainer,
    buildSteps: buildClusterDboSynthSteps,
  },
  {
    name: 'PagedScheduler',
    Component: PagedSchedulerExplainer,
    buildSteps: buildPagedSchedulerSteps,
  },
  {
    name: 'AsyncLaunchQueue',
    Component: AsyncLaunchQueueExplainer,
    buildSteps: buildAsyncLaunchQueueSteps,
  },
  {
    name: 'CudaGraphBoundaries',
    Component: CudaGraphBoundariesExplainer,
    buildSteps: buildCudaGraphBoundariesSteps,
  },
  {
    name: 'DpDispatchConsensus',
    Component: DpDispatchConsensusExplainer,
    buildSteps: buildDpDispatchConsensusSteps,
  },
  {
    name: 'AscendAclGraph',
    Component: AscendAclGraphExplainer,
    buildSteps: buildAscendAclGraphSteps,
  },
  {
    name: 'ProfilerSignatures',
    Component: ProfilerSignaturesExplainer,
    buildSteps: buildProfilerSignaturesSteps,
  },
];

describe('all 31 interactive SVG explainers', () => {
  it('covers exact 31 explainers across all 4 series', () => {
    expect(ALL_EXPLAINERS).toHaveLength(31);
  });

  it.each(ALL_EXPLAINERS)(
    '$name has 4-6 valid steps, balanced KaTeX delimiters, and clean SSR SVG',
    ({ name, Component, buildSteps }) => {
      const steps = buildSteps();
      expect(steps.length, `${name} step count`).toBeGreaterThanOrEqual(4);
      expect(steps.length, `${name} step count`).toBeLessThanOrEqual(6);

      for (const [idx, step] of steps.entries()) {
        expect(step.caption.trim().length, `${name} step ${idx} empty caption`).toBeGreaterThan(0);
        expect(step.caption, `${name} step ${idx} literal markdown`).not.toMatch(/`|\*\*/);
        const unescaped = step.caption.replace(/\\\$/g, '');
        const dollars = (unescaped.match(/\$/g) ?? []).length;
        expect(dollars % 2, `${name} step ${idx} unbalanced $: ${step.caption}`).toBe(0);
      }

      const defaultMarkup = renderToStaticMarkup(createElement(Component));
      expect(defaultMarkup, `${name} default markup literal markdown`).not.toMatch(/`|\*\*/);

      const markup = renderToStaticMarkup(createElement(Component, { title: `图 1：${name}` }));
      expect(markup).toContain('<svg');
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
});
