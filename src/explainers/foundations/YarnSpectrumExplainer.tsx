import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import ByteLedgerBar from '@/explainers/kit/ByteLedgerBar';
import { MetricRow } from '@/explainers/kit/MetricRow';
import ProbabilityBars from '@/explainers/kit/ProbabilityBars';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, assertMaxHues } from '@/explainers/kit/motion';

export interface YarnSpectrumState {
  stepIndex: number;
  barsTitle: string;
  barItems: {
    label: string;
    sublabel?: string;
    bars: {
      value: number;
      tone: Tone;
      tag?: string;
      faded?: boolean;
      dashed?: boolean;
      highlight?: boolean;
    }[];
  }[];
  bandSegments: { value: number; label: string; sub?: string; tone: Tone; active?: boolean }[];
  bandTotalLabel: string;
  highlightCache: 'none' | 'gpu' | 'ascend';
  windowText: string;
  scaleText: string;
  tempText: string;
  ubNoteText: string;
}

const PAIR_LABELS = ['i=0', 'i=6', 'i=10', 'i=14', 'i=17', 'i=20', 'i=23', 'i=30'];
const YARN_EXTRAP = [1.0, 1.0, 1.0, 0.692, 0.462, 0.231, 0.0, 0.0];

export function buildYarnSpectrumSteps(): Step<YarnSpectrumState>[] {
  const tones: Tone[] = ['active', 'highlight', 'activation'];
  assertMaxHues(tones);

  const makeItems = (piVal: number, yarnVals: number[], highlightRamp: boolean) =>
    PAIR_LABELS.map((label, idx) => ({
      label,
      sublabel: idx < 3 ? '高频' : idx < 6 ? '斜坡' : '低频',
      bars: [
        { value: piVal, tone: 'neutral' as Tone, dashed: piVal === 0 },
        {
          value: yarnVals[idx],
          tone: (idx < 3 ? 'active' : idx < 6 ? 'highlight' : 'activation') as Tone,
          highlight: highlightRamp && idx >= 2 && idx <= 6,
          tag: `${yarnVals[idx].toFixed(2)}`,
        },
      ],
    }));

  return [
    {
      state: {
        stepIndex: 0,
        barsTitle: '外推保留系数 (4K 原生窗 s=1)',
        barItems: makeItems(1.0, [1, 1, 1, 1, 1, 1, 1, 1], false),
        bandSegments: [
          {
            value: 32,
            label: '全频段原生运行 (0..31)',
            sub: '4K 训练窗口',
            tone: 'active',
            active: true,
          },
        ],
        bandTotalLabel: 'd_rope=64 (32 复数对) · 无缩放',
        highlightCache: 'none',
        windowText: '4K 原生窗 (s = 1)',
        scaleText: 'theta_i = base^(-2i/d)',
        tempText: 'mscale = 1.000',
        ubNoteText: '未超出训练最大波长',
      },
      caption:
        '在 $L = 4096$ 原生训练窗内（$s=1$），所有 32 对旋转通道均按原始频率 $\\theta_i = 10000^{-2i/64}$ 旋转，无需插值也无需注意力温度补偿。',
    },
    {
      state: {
        stepIndex: 1,
        barsTitle: '朴素插值 PI (全频 / 40 = 0.025)',
        barItems: makeItems(0.025, [0.025, 0.025, 0.025, 0.025, 0.025, 0.025, 0.025, 0.025], false),
        bandSegments: [
          {
            value: 32,
            label: '全频段统一 / 40 (高频近邻分辨率受损)',
            sub: 'PI 均匀压缩',
            tone: 'highlight',
            active: true,
          },
        ],
        bandTotalLabel: '4K -> 128K (s=40) · 高频压缩 40x',
        highlightCache: 'none',
        windowText: 'PI 扩展 128K (s=40)',
        scaleText: '所有通道 theta_i / 40',
        tempText: '相邻 token 分辨力下降',
        ubNoteText: '短距离语法注意力易混叠',
      },
      caption:
        '直接按 $s = 40$ 做线性位置插值（PI）时，连原本每词转 $1\\;\\text{rad}$ 的高频通道 $i=0$ 也被压缩 40 倍到 $0.025\\;\\text{rad/tok}$，相邻字词相位挤成一团，损害局部语序判别。',
    },
    {
      state: {
        stepIndex: 2,
        barsTitle: 'YaRN 分频斜坡 (s=40, low=10, high=23)',
        barItems: makeItems(0.025, YARN_EXTRAP, true),
        bandSegments: [
          { value: 11, label: '高频保持 (>32圈)', sub: 'i=0..10', tone: 'active', active: true },
          {
            value: 12,
            label: '中频斜坡 (1~32圈)',
            sub: 'i=11..22',
            tone: 'highlight',
            active: true,
          },
          {
            value: 9,
            label: '低频插值 /40 (<1圈)',
            sub: 'i=23..31',
            tone: 'activation',
            active: true,
          },
        ],
        bandTotalLabel: 'mscale = 0.1*ln(40)+1 = 1.3689',
        highlightCache: 'none',
        windowText: 'YaRN 4K -> 128K (s=40)',
        scaleText: 'low=10, high=23 斜坡衔接',
        tempText: 'softmax_scale x mscale^2 = 1.8739',
        ubNoteText: 'DeepSeek-V3 实配参数',
      },
      caption:
        'YaRN 根据 4K 内旋转圈数划出边界 low=10, high=23：高频 $i \\le 10$ 保留原速（$1.00$），低频 $i \\ge 23$ 按 $40$ 倍插值缩放，中间 $10 < i < 23$ 由线性斜坡过渡；同时用 $\\text{mscale}^2 = 1.8739$ 调整注意力缩放系数。',
    },
    {
      state: {
        stepIndex: 3,
        barsTitle: 'YaRN 频谱与双后端 Cache 排布',
        barItems: makeItems(0.025, YARN_EXTRAP, false),
        bandSegments: [
          { value: 11, label: '高频保持', tone: 'active' },
          { value: 12, label: '中频斜坡', tone: 'highlight' },
          { value: 9, label: '低频插值', tone: 'activation' },
        ],
        bandTotalLabel: 'vLLM [S, d] vs vllm-ascend _cos_sin_flat',
        highlightCache: 'ascend',
        windowText: '双后端缓存对照',
        scaleText: 'GPU FlashInfer vs NPU npu_mrope',
        tempText: 'ACLGraph 固定缓冲地址',
        ubNoteText: 'Triton 核受 192 KB UB 限制分块',
      },
      caption:
        'vLLM 将预乘 mscale 的 cos/sin 拼成 $[S, \\text{rotary\\_dim}]$ 供 CUDA/FlashInfer 原地查找；vllm-ascend 则展平为交错连续表 _cos_sin_flat 与静态缓冲 _cos_mla/_sin_mla，防止 aclnnIndex 在运行时拷贝整张频率表并适配 ACL Graph 重放。',
    },
  ];
}

export default function YarnSpectrumExplainer({
  title = '图 3：YaRN 分频斜坡外推（low=10, high=23）、mscale 修正与 GPU/昇腾缓存排布',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildYarnSpectrumSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="YaRN 频段混合曲线与双硬件频率缓存布局">
      {(step) => {
        const s = step.state;
        const showCacheHighlight = s.highlightCache !== 'none';

        return (
          <Stage width={STAGE_W} height={414} label="YaRN 三频段斜坡与缓存排布">
            <ProbabilityBars
              x={16}
              y={10}
              w={648}
              h={154}
              title={s.barsTitle}
              maxValue={1.15}
              valueFormat={(v) => v.toFixed(2)}
              refLine={{
                value: 1.0,
                label: s.stepIndex === 0 ? '' : '原频保留 1.0',
                tone: 'active',
              }}
              legend={[
                { label: 'PI 参考', tone: 'neutral' },
                { label: 'YaRN 高频', tone: 'active' },
                { label: '中频斜坡', tone: 'highlight' },
                { label: '低频插值', tone: 'activation' },
              ]}
              items={s.barItems}
            />

            {/* GPU vs Ascend cos/sin cache layout */}
            <TensorBlock
              x={20}
              y={192}
              w={304}
              h={44}
              tone="active"
              name="vLLM GPU: cos_sin_cache [S_max, 64]"
              shape="cat(cos*mscale, sin*mscale) -> index_select"
              active={showCacheHighlight}
              splits={[{ ratio: 0.5, leftLabel: 'cos [32]', rightLabel: 'sin [32]' }]}
            />
            <TensorBlock
              x={356}
              y={192}
              w={304}
              h={44}
              tone="activation"
              name="vllm-ascend: _cos_sin_flat & _cos_mla"
              shape="repeated(cos,sin) -> 避开 aclnnIndex 整表拷贝"
              active={showCacheHighlight}
              splits={[{ ratio: 0.25 }, { ratio: 0.5 }, { ratio: 0.75 }]}
            />
            {(['cos0', 'sin0', 'cos1', 'sin1 ...'] as const).map((lbl, idx) => (
              <text
                key={lbl}
                x={356 + (idx + 0.5) * 76}
                y={214}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-fg)',
                  fontFamily: 'var(--wisp-font-mono)',
                  fontSize: 10.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {lbl}
              </text>
            ))}

            <ByteLedgerBar
              x={20}
              y={272}
              w={640}
              h={26}
              title="32 对旋转通道频段分布 (beta_fast=32, beta_slow=1)"
              totalLabel={s.bandTotalLabel}
              segments={s.bandSegments}
            />

            <MetricRow
              x={16}
              y={352}
              w={648}
              h={42}
              metrics={[
                { label: '长度扩展状态', value: s.windowText, tone: 'active', active: true },
                { label: '频谱斜坡边界', value: s.scaleText, tone: 'highlight' },
                { label: '温度与缩放', value: s.tempText, tone: 'activation' },
                { label: '片上/运行时笔记', value: s.ubNoteText, tone: 'neutral' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
