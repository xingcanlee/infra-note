import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import { MetricRow, SectionBox, SwimlaneTimeline, assertMaxHues } from '@/explainers/kit';

export interface ClusterDboSynthState {
  stepIndex: number;
  phaseLabel: string;
  playhead: number;
  mode: 'serial' | 'dbo_mid' | 'dbo_full' | 'dbo_engram';
  cycleLatency: string;
  computeUtil: string;
  commHideRate: string;
  engramOverhead: string;
}

export function buildClusterDboSynthSteps(): Step<ClusterDboSynthState>[] {
  const tones: Tone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 单 Batch 串行基线：计算核在 EP All-to-All 期间彻底空等',
        playhead: 5.0,
        mode: 'serial',
        cycleLatency: '14.4 ms (双份总计)',
        computeUtil: '50% (大片空闲气泡)',
        commHideRate: '0% 通信掩盖',
        engramOverhead: '+0.8 ms 同步等待',
      },
      caption:
        '不启用 Dual-Batch Overlap (DBO) 时，算力流在 Dispatch A2A（1.8 ms）和 Combine A2A（1.8 ms）期间只能干等网络返回，加上 Engram 宿主查表阻塞，硬件利用率跌至一半。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · 切分 μB0 / μB1：注意力交替发射并掩盖 Dispatch A2A',
        playhead: 5.0,
        mode: 'dbo_mid',
        cycleLatency: '双微批交错启动',
        computeUtil: '算力空等大幅压缩',
        commHideRate: 'μB0/1 Dispatch 被遮蔽',
        engramOverhead: '待并入辅助流',
      },
      caption:
        '将批次切为 $\\mu B_0$ 与 $\\mu B_1$：μB0 进入 Dispatch A2A（1.8 ms）的瞬间算力流切去跑 μB1 Attn（1.4 ms），随后 μB0 MoE GEMM（2.2 ms）正好遮盖 μB1 Dispatch（1.8 ms）。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · 稳态全掩盖：MoE GEMM 与下层 Attn 完整收编 μB0/μB1 Combine A2A',
        playhead: 7.6,
        mode: 'dbo_full',
        cycleLatency: '9.4 ms (严格 ms 等比)',
        computeUtil: '>90% 算力连续饱和',
        commHideRate: '双 Combine A2A 均现身并隐藏',
        engramOverhead: '主计算与 EP 解耦',
      },
      caption:
        '关键闭环：μB1 MoE GEMM 掩盖 μB0 Combine A2A（1.8 ms），而紧随其后的 μB1 Combine A2A（7.6–9.4 ms）则由下一层的 μB0 Attn 与 mHC 计算无缝隐藏！',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · Host DDR Engram 异步预取并入全局调度窗',
        playhead: 6.8,
        mode: 'dbo_engram',
        cycleLatency: '9.4 ms (零新增阻塞)',
        computeUtil: '>90% 满载流水线',
        commHideRate: 'EP A2A + PCIe 全重叠',
        engramOverhead: '6.0 ms 查表完全隐藏',
      },
      caption:
        '借助独立预取流，100B 宿主内存 Engram 表的 6.0 ms PCIe/HCCS 跨总线查表在前面层 Attn + MoE 期间后台完成（与 UBatchContext 解耦协同），消费层仅用 wait_event 零拷贝接管。',
    },
  ];
}

export default function ClusterDboSynthExplainer({
  title = '图 3：集群级 Dual-Microbatch (DBO) 与异步 Engram 预取毫秒等比时间线',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildClusterDboSynthSteps(), []);

  return (
    <Explainer steps={steps} title={title} label={title}>
      {(step) => {
        const s = step.state;
        const isSerial = s.mode === 'serial';
        const showFullDbo = s.mode === 'dbo_full' || s.mode === 'dbo_engram';
        const showEngram = s.mode === 'dbo_engram';

        const lanes = isSerial
          ? [
              {
                title: 'Compute 流',
                subtitle: '单批串行算力',
                blocks: [
                  { start: 0.0, dur: 2.8, label: 'Attn (μB0+1)', tone: 'active' as const },
                  {
                    start: 2.8,
                    dur: 3.6,
                    label: '空等 Dispatch A2A',
                    tone: 'highlight' as const,
                    kind: 'bubble' as const,
                    dashed: true,
                  },
                  { start: 6.4, dur: 4.4, label: 'MoE GEMM', tone: 'active' as const },
                  {
                    start: 10.8,
                    dur: 3.6,
                    label: '空等 Combine A2A',
                    tone: 'highlight' as const,
                    kind: 'bubble' as const,
                    dashed: true,
                  },
                ],
              },
              {
                title: 'EP Comm 流',
                subtitle: 'NVLink/RDMA/HCCS',
                blocks: [
                  { start: 2.8, dur: 3.6, label: '全批 Dispatch A2A', tone: 'highlight' as const },
                  { start: 10.8, dur: 3.6, label: '全批 Combine A2A', tone: 'highlight' as const },
                ],
              },
              {
                title: 'Host Engram',
                subtitle: 'PCIe/UVA/RDMA',
                blocks: [
                  {
                    start: 14.4,
                    dur: 1.0,
                    label: '阻塞',
                    tone: 'highlight' as const,
                    kind: 'error' as const,
                  },
                ],
              },
            ]
          : [
              {
                title: 'Compute 流',
                subtitle: 'SM / Cube Core',
                blocks: [
                  { start: 0.0, dur: 1.4, label: 'μB0 Attn', tone: 'active' as const },
                  { start: 1.4, dur: 1.4, label: 'μB1 Attn', tone: 'active' as const },
                  {
                    start: 2.8,
                    dur: 0.4,
                    label: '等',
                    tone: 'neutral' as const,
                    kind: 'bubble' as const,
                    dashed: true,
                  },
                  { start: 3.2, dur: 2.2, label: 'μB0 GEMM', tone: 'active' as const },
                  {
                    start: 5.4,
                    dur: 2.2,
                    label: 'μB1 GEMM',
                    tone: 'active' as const,
                    active: showFullDbo,
                  },
                  ...(showFullDbo
                    ? [
                        {
                          start: 7.6,
                          dur: 1.8,
                          label: '下层 Attn+mHC',
                          tone: 'done' as const,
                          active: true,
                        },
                      ]
                    : []),
                ],
              },
              {
                title: 'EP Comm 流',
                subtitle: 'DeepEP / MC2',
                blocks: [
                  { start: 1.4, dur: 1.8, label: 'μB0 Disp A2A', tone: 'highlight' as const },
                  { start: 3.2, dur: 1.8, label: 'μB1 Disp A2A', tone: 'highlight' as const },
                  ...(showFullDbo
                    ? [
                        {
                          start: 5.4,
                          dur: 1.8,
                          label: 'μB0 Comb A2A',
                          tone: 'highlight' as const,
                          active: true,
                        },
                        {
                          start: 7.6,
                          dur: 1.8,
                          label: 'μB1 Comb A2A',
                          tone: 'highlight' as const,
                          active: true,
                        },
                      ]
                    : []),
                ],
              },
              {
                title: 'Host Engram',
                subtitle: 'PCIe / HCCS 预取',
                blocks: showEngram
                  ? [
                      {
                        start: 0.8,
                        dur: 6.0,
                        label: 'L14 Host DDR 100B 表异步预取 (6.0 ms)',
                        tone: 'done' as const,
                        active: true,
                      },
                      { start: 6.8, dur: 1.0, label: '就绪', tone: 'done' as const, dashed: true },
                    ]
                  : [
                      {
                        start: 0.8,
                        dur: 6.0,
                        label: '待重叠窗口 (6.0 ms)',
                        tone: 'neutral' as const,
                        kind: 'bubble' as const,
                        dashed: true,
                      },
                    ],
              },
            ];

        const syncEvents = isSerial
          ? []
          : [
              {
                fromLane: 1,
                at: 3.2,
                toLane: 0,
                toAt: 3.2,
                label: 'Disp就绪',
                tone: 'highlight' as const,
              },
              ...(showFullDbo
                ? [
                    {
                      fromLane: 1,
                      at: 9.4,
                      toLane: 0,
                      toAt: 9.4,
                      label: 'μB1 Comb闭环',
                      tone: 'done' as const,
                      active: true,
                    },
                  ]
                : []),
            ];

        return (
          <Stage width={680} height={336} label={s.phaseLabel}>
            <SectionBox
              x={10}
              y={8}
              w={660}
              h={252}
              tone={showFullDbo ? 'done' : 'neutral'}
              title="横轴严格按真实毫秒 (ms) 比例绘制：Attn 1.4 | Disp 1.8 | GEMM 2.2 | Comb 1.8"
            />
            <SwimlaneTimeline
              x={18}
              y={32}
              w={644}
              totalTime={16}
              unit="ms"
              ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16]}
              lanes={lanes}
              syncEvents={syncEvents}
              laneH={38}
              laneGap={22}
              gutterW={112}
              playhead={s.playhead}
            />

            <MetricRow
              x={10}
              y={276}
              w={660}
              h={44}
              gap={10}
              metrics={[
                {
                  label: '双微批单层周期',
                  value: s.cycleLatency,
                  tone: isSerial ? 'highlight' : 'done',
                  active: true,
                },
                { label: '算力核心占用', value: s.computeUtil, tone: 'active' },
                { label: 'EP A2A 重叠度', value: s.commHideRate, tone: 'highlight' },
                {
                  label: 'Host Engram 阻塞',
                  value: s.engramOverhead,
                  tone: showEngram ? 'done' : 'neutral',
                },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
