import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import {
  MetricRow,
  SectionBox,
  SlotStrip,
  SwimlaneTimeline,
  assertMaxHues,
} from '@/explainers/kit';

export interface DsparkChainState {
  stepIndex: number;
  phaseLabel: string;
  playhead: number;
  acceptedPrefix: number;
  draftPassText: string;
  markovText: string;
  cutoffText: string;
  speedupText: string;
}

export function buildDsparkChainSteps(): Step<DsparkChainState>[] {
  const tones: Tone[] = ['highlight', 'active', 'done'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · V3 串行自回归 MTP 的启动墙与重计算瓶颈',
        playhead: 2.2,
        acceptedPrefix: 2,
        draftPassText: 'V3: K=4 次串行前向',
        markovText: '无独立 Markov 头',
        cutoffText: '固定深度 K=2..4',
        speedupText: '基准时延 11.8 ms',
      },
      caption:
        'DeepSeek-V3 风格 MTP 每向前猜 1 步都要完整重跑一次包含全量激活与路由的 Decoder 块并等待上一 token 写回，$K=4$ 步严格串行耗时约 8.8 ms。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · V4.1 DSpark 单次并行 SWA 块前向提取全槽特征',
        playhead: 2.2,
        acceptedPrefix: 4,
        draftPassText: 'DSpark: 1-Pass 3层SWA',
        markovText: '主干 aux -> Context KV',
        cutoffText: '同时产 K=5 槽位特征',
        speedupText: 'Draft 骨架仅 1.6 ms',
      },
      caption:
        'V4.1 DeepseekV41DSparkModel 先用 main_proj + context_wkv_proj 把目标层隐藏状态预投进 SWA 缓存，随后 1 次并行前向穿过 3 层非因果 SWA 块算完所有草稿位特征。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · r=256 低秩 Markov 转移链与在线置信度截断',
        playhead: 3.0,
        acceptedPrefix: 4,
        draftPassText: '1-Pass 骨架 + 链式头',
        markovText: 'W1[prev]@W2 (r=256)',
        cutoffText: 'a_j < τ 在位点 4 截断',
        speedupText: '规避无效尾部 Verify',
      },
      caption:
        '并行产生 base_logits 后，DSparkMarkovHead 以极轻量的秩 $r=256$ 嵌入快速左到右补足词间转移偏置，同时 DSparkConfidenceHead 按置信度 $a_j$ 提前截断低概率长尾。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · Target 单次并行检验与自适应速度收益',
        playhead: 6.0,
        acceptedPrefix: 5,
        draftPassText: '1-Pass 并行草稿',
        markovText: '零 KV 重算补全依存',
        cutoffText: '平均命中 ~4.2 tok/step',
        speedupText: '6.0 vs 11.8 ms (-49%)',
      },
      caption:
        'Target 主模型一次前向并行核验截断后的连续草稿树/链；相比 V3 串行 MTP，DSpark 将单轮“草稿+检验”时延压缩约 49%，且保留高命中率。',
    },
  ];
}

export default function DsparkChainExplainer({
  title = '图 2：DeepSeek-V3 串行 MTP 与 V4.1 DSpark 轻量并行草稿链对比',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildDsparkChainSteps(), []);

  return (
    <Explainer steps={steps} title={title} label={title}>
      {(step) => {
        const s = step.state;
        const timelineLanes = [
          {
            title: 'V3 串行 MTP',
            subtitle: 'K=4 步严格串行',
            blocks: [
              { start: 0.0, dur: 2.2, label: 'MTP k=1', tone: 'highlight' as const },
              { start: 2.2, dur: 2.2, label: 'MTP k=2', tone: 'highlight' as const },
              { start: 4.4, dur: 2.2, label: 'MTP k=3', tone: 'highlight' as const },
              { start: 6.6, dur: 2.2, label: 'MTP k=4', tone: 'highlight' as const },
              { start: 8.8, dur: 3.0, label: 'Target Verify', tone: 'done' as const },
            ],
          },
          {
            title: 'V4.1 DSpark',
            subtitle: '1-Pass + r=256',
            blocks: [
              {
                start: 0.0,
                dur: 0.7,
                label: 'Ctx',
                tone: 'active' as const,
                active: s.stepIndex === 1,
              },
              {
                start: 0.7,
                dur: 1.5,
                label: '3层SWA 并行',
                tone: 'active' as const,
                active: s.stepIndex === 1,
              },
              {
                start: 2.2,
                dur: 0.8,
                label: 'Markov',
                tone: 'highlight' as const,
                active: s.stepIndex === 2,
              },
              {
                start: 3.0,
                dur: 3.0,
                label: 'Target Verify',
                tone: 'done' as const,
                active: s.stepIndex === 3,
              },
              {
                start: 6.0,
                dur: 5.8,
                label: '节省时延 5.8 ms (-49%)',
                tone: 'done' as const,
                kind: 'bubble' as const,
                dashed: true,
              },
            ],
          },
        ];

        const syncEvents =
          s.stepIndex === 2
            ? [
                {
                  fromLane: 1,
                  at: 3.0,
                  toLane: 0,
                  toAt: 8.8,
                  label: 'Verify 提前 5.8ms',
                  tone: 'done' as const,
                  active: false,
                  dashed: true,
                },
              ]
            : s.stepIndex === 3
              ? [
                  {
                    fromLane: 1,
                    at: 6.0,
                    toLane: 0,
                    toAt: 11.8,
                    label: '端到端节省 5.8ms',
                    tone: 'done' as const,
                    active: true,
                    dashed: true,
                  },
                ]
              : [];

        const confScores = [
          { id: 'c0', label: 'Anchor', sub: '目标基准', score: 1.0 },
          { id: 'c1', label: 'D1', sub: 'a=0.94', score: 0.94 },
          { id: 'c2', label: 'D2', sub: 'a=0.87', score: 0.87 },
          { id: 'c3', label: 'D3', sub: 'a=0.79', score: 0.79 },
          { id: 'c4', label: 'D4', sub: 'a=0.68', score: 0.68 },
          { id: 'c5', label: 'D5 (截)', sub: 'a=0.31 < τ', score: 0.31 },
        ];

        const slots = confScores.map((c, idx) => {
          const isCutoff = idx === 5 && s.stepIndex >= 2;
          const isActive = idx <= s.acceptedPrefix && !isCutoff;
          return {
            id: c.id,
            label: c.label,
            sub: c.sub,
            tone: (isCutoff ? 'highlight' : isActive ? 'done' : 'neutral') as Tone,
            status: (isCutoff ? 'masked' : isActive ? 'selected' : 'empty') as
              'masked' | 'selected' | 'empty',
          };
        });

        return (
          <Stage width={680} height={364} label={s.phaseLabel}>
            <SwimlaneTimeline
              x={12}
              y={10}
              w={656}
              totalTime={12}
              unit="ms"
              ticks={[0, 3, 6, 9, 12]}
              lanes={timelineLanes}
              syncEvents={syncEvents}
              laneH={38}
              laneGap={22}
              gutterW={104}
              playhead={s.playhead}
              title="单轮草稿生成与 Target 并行检验时间线（按真实耗时 ms 等比缩放）"
            />

            <SectionBox
              x={12}
              y={174}
              w={656}
              h={106}
              tone={s.stepIndex === 2 ? 'highlight' : 'neutral'}
              title="DSpark 链式 Markov 转移偏置与 DSparkConfidenceHead 在线预算截断"
            />
            <SlotStrip x={28} y={206} slots={slots} slotW={96} gap={10} slotH={38} />

            <MetricRow
              x={12}
              y={298}
              w={656}
              h={44}
              gap={10}
              metrics={[
                { label: 'Draft 骨架执行', value: s.draftPassText, tone: 'active' },
                { label: '序列依赖建模', value: s.markovText, tone: 'highlight' },
                {
                  label: '在线长度控制',
                  value: s.cutoffText,
                  tone: 'done',
                  active: s.stepIndex >= 2,
                },
                {
                  label: '步间端到端收益',
                  value: s.speedupText,
                  tone: 'done',
                  active: s.stepIndex === 3,
                },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
