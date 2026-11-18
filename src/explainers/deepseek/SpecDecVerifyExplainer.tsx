import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import { SlotStrip } from '@/explainers/kit/PointerBoard';
import ProbabilityBars from '@/explainers/kit/ProbabilityBars';
import { assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface SpecDecVerifyState {
  stepIndex: number;
  phaseLabel: string;
  slotStatuses: ('normal' | 'active' | 'selected' | 'error' | 'masked' | 'empty')[];
  slotTones: AnyTone[];
  slotSubs: string[];
  showResidual: boolean;
  showFinalDist: boolean;
  acceptRatio: string;
  decisionText: string;
  tvDistance: string;
  emittedTokens: string;
}

const VOCAB = ['A', 'B', 'C', 'D'];
const DRAFT_Q = [0.2, 0.5, 0.2, 0.1];
const TARGET_P = [0.35, 0.25, 0.3, 0.1];
const RESIDUAL_NORM = [0.6, 0.0, 0.4, 0.0];
const ACCEPT_RATES = [1.0, 0.5, 1.0, 1.0];

export function buildSpecDecVerifySteps(): Step<SpecDecVerifyState>[] {
  const tones: AnyTone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · Draft 分布 q 与 Target 单步校验分布 p',
        slotStatuses: ['active', 'active', 'active', 'active', 'empty'],
        slotTones: ['active', 'active', 'active', 'active', 'neutral'],
        slotSubs: ['k=1: A', 'k=2: B*', 'k=3: C', 'k=4: D', 'Bonus'],
        showResidual: false,
        showFinalDist: false,
        acceptRatio: '待校验',
        decisionText: '提交 K=4 候选',
        tvDistance: '理论 0.000',
        emittedTokens: '待产出',
      },
      caption:
        '小模型/DSpark 一次提出 4 个草稿 token（关注位置 $k=2$ 提案 B，其草稿概率 $q(B)=0.50$ 高于大模型目标概率 $p(B)=0.25$），Target 模型并行前向算完 5 组 logits。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · 接受准则 r <= min(1, p(x)/q(x))',
        slotStatuses: ['selected', 'active', 'masked', 'masked', 'empty'],
        slotTones: ['done', 'highlight', 'neutral', 'neutral', 'neutral'],
        slotSubs: ['k=1 接受', 'k=2 拒绝', '废弃', '废弃', '无 Bonus'],
        showResidual: false,
        showFinalDist: false,
        acceptRatio: 'p(B)/q(B) = 0.50',
        decisionText: 'u=0.72 > 0.50 拒收',
        tvDistance: '需残差重采样',
        emittedTokens: '前缀 A 已确认',
      },
      caption:
        '位置 $k=1$（A）满足 $p/q \\ge 1$ 直接接收；位置 $k=2$（B）接收概率上限仅 $\\min(1, 0.25/0.50)=0.50$，随机数 $u=0.72 > 0.50$ 触发拒绝并截断后续 C/D。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · 归一化正残差分布 norm(max(0, p - q))',
        slotStatuses: ['selected', 'active', 'masked', 'masked', 'empty'],
        slotTones: ['done', 'highlight', 'neutral', 'neutral', 'neutral'],
        slotSubs: ['已接收 A', '重采样位置', '截断', '截断', '跳过'],
        showResidual: true,
        showFinalDist: false,
        acceptRatio: 'Σmax(0,p-q)=0.25',
        decisionText: 'P_res(A)=0.60, C=0.40',
        tvDistance: 'TV -> 0.000',
        emittedTokens: '准备补抽 1 token',
      },
      caption:
        '仅在被目标分布低估的词（$p > q$）上构造非负残差 $\\max(0, p-q)=[0.15, 0, 0.10, 0]$，归一化后得到 $\\mathrm{norm}(\\max(0, p-q)) = [0.60, 0, 0.40, 0]$，精确补偿拒绝质量。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · 精确无损分布等价性证明 P_final == p',
        slotStatuses: ['selected', 'selected', 'masked', 'masked', 'empty'],
        slotTones: ['done', 'done', 'neutral', 'neutral', 'neutral'],
        slotSubs: ['t+1: A', 't+2: A*', '已抛弃', '已抛弃', '下一轮'],
        showResidual: true,
        showFinalDist: true,
        acceptRatio: 'min(p,q)+max(0,p-q)',
        decisionText: '采样出 A (补正)',
        tvDistance: 'ΔTV = 0.0000',
        emittedTokens: '单步产出 2 token',
      },
      caption:
        '对任意词 $x$，直接接受概率 $\\min(p(x), q(x))$ 与「拒绝后从残差重采中 $x$」的概率 $0.25 \\times \\frac{\\max(0,p(x)-q(x))}{0.25}$ 相加恒等于 $p(x)$，严格无损。',
    },
    {
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · 全接收情景与第 K+1 个 Bonus token',
        slotStatuses: ['selected', 'selected', 'selected', 'selected', 'selected'],
        slotTones: ['done', 'done', 'done', 'done', 'done'],
        slotSubs: ['t+1: A', 't+2: B', 't+3: C', 't+4: D', 't+5: Bonus'],
        showResidual: false,
        showFinalDist: true,
        acceptRatio: '全部命中 p>=q/u',
        decisionText: '直接从 p_{K+1} 采样',
        tvDistance: 'ΔTV = 0.0000',
        emittedTokens: '单步产出 K+1 = 5',
      },
      caption:
        '若 $K=4$ 个草稿全部通过校验，因 Target 前向本身已算完第 $K+1$ 位的 logits，可直接从 $p_{K+1}$ 采样额外第 5 个 Bonus token，实现 5 倍上限加速且保持完全同分布。',
    },
  ];
}

export default function SpecDecVerifyExplainer({
  title = '图 1：Speculative Decoding 无损拒绝采样与数学等价证明',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildSpecDecVerifySteps(), []);

  return (
    <Explainer steps={steps} title={title} label={title}>
      {(step) => {
        const s = step.state;
        const slotLabels = ['D0: A', 'D1: B', 'D2: C', 'D3: D', 'Bonus'];
        const slots = slotLabels.map((lbl, idx) => ({
          id: `sd${idx}`,
          label: idx === 1 && s.stepIndex === 3 ? 'D1->A*' : lbl,
          sub: s.slotSubs[idx],
          tone: s.slotTones[idx],
          status: s.slotStatuses[idx],
        }));

        const leftBars = VOCAB.map((tok, i) => ({
          label: tok,
          sublabel: s.showFinalDist
            ? `终=${TARGET_P[i].toFixed(2)}`
            : `p/q=${(TARGET_P[i] / DRAFT_Q[i]).toFixed(1)}`,
          bars: s.showFinalDist
            ? [
                { value: Math.min(TARGET_P[i], DRAFT_Q[i]), tone: 'active' as const },
                { value: TARGET_P[i], tone: 'done' as const, highlight: true },
              ]
            : [
                { value: DRAFT_Q[i], tone: 'active' as const },
                {
                  value: TARGET_P[i],
                  tone: 'done' as const,
                  highlight: i === 1 && s.stepIndex === 1,
                },
              ],
        }));

        const rightBars = VOCAB.map((tok, i) => ({
          label: tok,
          sublabel: s.showResidual
            ? `残差=${RESIDUAL_NORM[i].toFixed(2)}`
            : `通过率=${ACCEPT_RATES[i].toFixed(2)}`,
          bars: s.showResidual
            ? [
                {
                  value: RESIDUAL_NORM[i],
                  tone: 'highlight' as const,
                  highlight: RESIDUAL_NORM[i] > 0,
                },
              ]
            : [
                {
                  value: ACCEPT_RATES[i],
                  tone: (ACCEPT_RATES[i] < 1 ? 'highlight' : 'done') as AnyTone,
                },
              ],
        }));

        return (
          <Stage width={680} height={364} label={s.phaseLabel}>
            <SectionBox
              x={12}
              y={10}
              w={656}
              h={86}
              tone={s.stepIndex === 4 ? 'done' : 'neutral'}
              title="Target 单次前向并行校验 K=4 草稿序列与 Bonus 位置"
            />
            <SlotStrip x={34} y={36} slots={slots} slotW={112} gap={12} slotH={38} />

            <ActiveFocusFrame
              x={12}
              y={108}
              w={324}
              h={184}
              tone={s.showFinalDist ? 'done' : 'active'}
              label={s.showFinalDist ? '边缘分布恒等 P_final = p' : '位置 k=2 分布对比'}
              visible={true}
            />
            <ProbabilityBars
              x={18}
              y={118}
              w={312}
              h={168}
              maxValue={0.65}
              items={leftBars}
              valueFormat={(v) => v.toFixed(2).replace(/^0(?=\.)/, '')}
              legend={
                s.showFinalDist
                  ? [
                      { label: 'min(p,q)', tone: 'active' },
                      { label: 'P_final=p', tone: 'done' },
                    ]
                  : [
                      { label: 'Draft q', tone: 'active' },
                      { label: 'Target p', tone: 'done' },
                    ]
              }
            />

            <ActiveFocusFrame
              x={348}
              y={108}
              w={320}
              h={184}
              tone="highlight"
              label={s.showResidual ? '残差重采样 norm(max(0,p-q))' : '位置接收概率 min(1,p/q)'}
              visible={s.stepIndex >= 1}
            />
            <ProbabilityBars
              x={354}
              y={118}
              w={308}
              h={168}
              maxValue={1.25}
              items={rightBars}
              valueFormat={(v) => v.toFixed(2)}
              legend={
                s.showResidual
                  ? [{ label: '归一化残差', tone: 'highlight' }]
                  : [{ label: '接受上限', tone: 'done' }]
              }
            />

            <MetricRow
              x={12}
              y={304}
              w={656}
              h={44}
              gap={10}
              metrics={[
                { label: '接收条件 / 质量', value: s.acceptRatio, tone: 'active' },
                { label: '采样决策', value: s.decisionText, tone: 'highlight', active: true },
                { label: '分布偏差 ΔTV', value: s.tvDistance, tone: 'done' },
                { label: '单步有效产出', value: s.emittedTokens, tone: 'done' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
