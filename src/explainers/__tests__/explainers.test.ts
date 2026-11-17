import type { ComponentType } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Step } from 'astro-wisp/explainers';
import { describe, expect, it, vi } from 'vitest';

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
    },
  );
});
