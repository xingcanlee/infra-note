import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  HeatmapMatrix,
  MetricRow,
  ProbabilityBars,
  assertMaxHues,
} from '@/explainers/kit';

export interface EngramGateState {
  stepIndex: number;
  phaseLabel: string;
  matrixValues: (number | null)[][];
  alphaStreamsA: number[];
  alphaStreamsB: number[];
  kvRatio: string;
  gateFormula: string;
  convStatus: string;
  injectDelta: string;
}

const STREAM_LABELS = ['HC0', 'HC1', 'HC2', 'HC3'];
const COL_LABELS = ['语境A 点积', '语境B 点积', 'α_A 水果', 'α_B 公司'];

function fmtDot(v: number | null): string {
  return v === null ? '—' : v.toFixed(2);
}

export function buildEngramGateSteps(): Step<EngramGateState>[] {
  const tones: Tone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 同形多义 N-gram "Apple" 的静态检索初值',
        matrixValues: [
          [0.0, 0.0, null, null],
          [0.0, 0.0, null, null],
          [0.0, 0.0, null, null],
          [0.0, 0.0, null, null],
        ],
        alphaStreamsA: [0.5, 0.5, 0.5, 0.5],
        alphaStreamsB: [0.5, 0.5, 0.5, 0.5],
        kvRatio: 'K=4d, V=1d (4:1)',
        gateFormula: '待计算 W_K e_t',
        convStatus: 'V3.5: δ=3 | V4.1: 移除',
        injectDelta: 'α_t 未分化',
      },
      caption:
        '静态 N-gram 查表对“Apple pie”和“Apple Inc.”取回完全相同的 $e_t$；随后经 wkv 投影成 4 条流独立 Key（总宽 $4d$）与 1 条共享 Value（宽 $d$）。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · RMSNorm 对齐与 Signed-Sqrt 内积鉴权',
        matrixValues: [
          [-1.82, 2.15, 0.14, 0.89],
          [-1.54, 1.92, 0.17, 0.86],
          [-1.21, 1.74, 0.21, 0.84],
          [-2.06, 2.31, 0.12, 0.91],
        ],
        alphaStreamsA: [0.14, 0.17, 0.21, 0.12],
        alphaStreamsB: [0.89, 0.86, 0.84, 0.91],
        kvRatio: 'K=5120, V=1280',
        gateFormula: 'σ(signed_sqrt(q·k / √d))',
        convStatus: '抑制歧义噪声',
        injectDelta: '语境B比语境A高 5.8×',
      },
      caption:
        '对每条残差流执行 $\\operatorname{RMSNorm}(h_t^{(m)})^\\top \\operatorname{RMSNorm}(W_K^{(m)} e_t)/\\sqrt{d}$，再经 $\\operatorname{sign}(z)\\sqrt{|z|}$ 拉开动态范围并过 $\\sigma$：无关语境 A 的 $\\alpha_t$ 被压低至 0.12–0.21。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · 共享 Value 门控调制 α_t · (W_V e_t)',
        matrixValues: [
          [-1.82, 2.15, 0.14, 0.89],
          [-1.54, 1.92, 0.17, 0.86],
          [-1.21, 1.74, 0.21, 0.84],
          [-2.06, 2.31, 0.12, 0.91],
        ],
        alphaStreamsA: [0.14, 0.17, 0.21, 0.12],
        alphaStreamsB: [0.89, 0.86, 0.84, 0.91],
        kvRatio: 'wkv 合并线性层',
        gateFormula: 'y = α_t ⊙ v_t',
        convStatus: 'V4.1 在 post/pre 间注入',
        injectDelta: 'HC3 强写入 +0.91',
      },
      caption:
        '标量门控 $\\alpha_t^{(m)}$ 与共享值向量 $v_t = W_V e_t$ 相乘；实装源码 _fused_engram_post_wkv_kernel 将 RMSNorm、点积、signed-sqrt 与写入残差流融为单 kernel。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · 论文 ShortConv (δ=3) vs V4.1 无状态工程化取舍',
        matrixValues: [
          [-1.82, 2.15, 0.14, 0.89],
          [-1.54, 1.92, 0.17, 0.86],
          [-1.21, 1.74, 0.21, 0.84],
          [-2.06, 2.31, 0.12, 0.91],
        ],
        alphaStreamsA: [0.14, 0.17, 0.21, 0.12],
        alphaStreamsB: [0.89, 0.86, 0.84, 0.91],
        kvRatio: 'V4.1 仅保留 WKV+Gate',
        gateFormula: 'α_t=0 屏蔽图像占位',
        convStatus: '零 Decode 历史状态缓存',
        injectDelta: '无状态可 CUDA Graph',
      },
      caption:
        '原论文在门控后接空洞 $\\delta=3$ 的因果 ShortConv 汇聚无重叠 N-gram；DeepSeek-V4.1 部署去掉卷积使 Engram 保持无状态执行，并在多模态图像 token 上置零门控掩码。',
    },
  ];
}

export default function EngramGateExplainer({
  title = '图 2：Engram 上下文门控消歧与多流调制机制',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildEngramGateSteps(), []);

  return (
    <Explainer steps={steps} title={title} label={title}>
      {(step) => {
        const s = step.state;
        const barItems = STREAM_LABELS.map((lbl, idx) => ({
          label: lbl,
          sublabel: `αB=${s.alphaStreamsB[idx].toFixed(2)}`,
          bars: [
            {
              value: s.alphaStreamsA[idx],
              tone: 'highlight' as const,
              dashed: s.stepIndex >= 1,
            },
            {
              value: s.alphaStreamsB[idx],
              tone: 'done' as const,
              highlight: s.stepIndex >= 1,
            },
          ],
        }));

        const selected =
          s.stepIndex >= 1 ? new Set(['0,3', '1,3', '2,3', '3,3']) : new Set<string>();

        return (
          <Stage width={680} height={342} label={s.phaseLabel}>
            <ActiveFocusFrame
              x={10}
              y={14}
              w={330}
              h={236}
              tone="active"
              label="4 条流点积与门控 α"
              visible={s.stepIndex <= 1}
            />
            <HeatmapMatrix
              x={16}
              y={26}
              values={s.matrixValues}
              tone="active"
              cellW={62}
              cellH={34}
              gap={5}
              min={-2.2}
              max={2.4}
              format={fmtDot}
              selected={selected}
              selectedTone="done"
              rowLabels={STREAM_LABELS}
              colLabels={COL_LABELS}
              rowLabelW={44}
              title="语境 A（水果）vs 语境 B（公司）"
            />

            <ActiveFocusFrame
              x={350}
              y={14}
              w={320}
              h={236}
              tone="done"
              label="门控对比 α_t ∈ (0,1)"
              visible={s.stepIndex >= 2}
            />
            <ProbabilityBars
              x={356}
              y={26}
              w={308}
              h={214}
              maxValue={1.08}
              items={barItems}
              title="虚线 α=0.5"
              valueFormat={(v) => v.toFixed(2)}
              refLine={{ value: 0.5, label: '', tone: 'neutral' }}
              legend={[
                { label: '语境 A (抑制)', tone: 'highlight' },
                { label: '语境 B (放行)', tone: 'done' },
              ]}
            />

            <MetricRow
              x={10}
              y={266}
              w={660}
              h={44}
              gap={10}
              metrics={[
                { label: 'WKV 投影比', value: s.kvRatio, tone: 'active' },
                { label: 'Signed-Sqrt 门控', value: s.gateFormula, tone: 'done', active: true },
                { label: '状态演进', value: s.convStatus, tone: 'highlight' },
                { label: '消歧效果', value: s.injectDelta, tone: 'done' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
