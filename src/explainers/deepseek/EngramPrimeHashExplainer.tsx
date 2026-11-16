import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import {
  MetricRow,
  PointerArcs,
  SectionBox,
  SlotStrip,
  TensorBlock,
  assertMaxHues,
} from '@/explainers/kit';

export interface EngramPrimeHashState {
  stepIndex: number;
  phaseLabel: string;
  showCanonical: boolean;
  showArcs: boolean;
  activeHeads: number[];
  showConcat: boolean;
  vocabAfterNorm: string;
  ngramOrder: string;
  hashOps: string;
  embedShape: string;
}

const TOKEN_SLOTS_RAW = [
  { id: 't0', label: 'The', sub: 'id=791', tone: 'neutral' as Tone },
  { id: 't1', label: '▁Apple', sub: 'id=18924', tone: 'active' as Tone },
  { id: 't2', label: '▁Inc', sub: 'id=9527', tone: 'active' as Tone },
  { id: 't3', label: '▁stock', sub: 'id=12041', tone: 'neutral' as Tone },
];

const TOKEN_SLOTS_CANON = [
  { id: 't0', label: 'the', sub: 'P=402', tone: 'neutral' as Tone, status: 'normal' as const },
  { id: 't1', label: 'apple', sub: 'P=6119', tone: 'active' as Tone, status: 'active' as const },
  { id: 't2', label: 'inc', sub: 'P=3318', tone: 'active' as Tone, status: 'active' as const },
  {
    id: 't3',
    label: 'stock',
    sub: 'P=5190',
    tone: 'highlight' as Tone,
    status: 'selected' as const,
  },
];

const PRIME_HEADS = [
  { id: 'h0', label: 'P0', sub: '646409', offset: 14218 },
  { id: 'h1', label: 'P1', sub: '646421', offset: 88103 },
  { id: 'h2', label: 'P2', sub: '646433', offset: 204917 },
  { id: 'h3', label: 'P3', sub: '646439', offset: 319044 },
  { id: 'h4', label: 'P4', sub: '646447', offset: 481220 },
  { id: 'h5', label: 'P5', sub: '646453', offset: 519802 },
  { id: 'h6', label: 'P6', sub: '646471', offset: 602119 },
  { id: 'h7', label: 'P7', sub: '646489', offset: 639405 },
];

export function buildEngramPrimeHashSteps(): Step<EngramPrimeHashState>[] {
  const tones: Tone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · CompressedTokenizer 词表规范化 P(x_t)',
        showCanonical: true,
        showArcs: false,
        activeHeads: [],
        showConcat: false,
        vocabAfterNorm: '129,280 -> 99,124 (-23%)',
        ngramOrder: '待提取',
        hashOps: 'NFKC + Lowercase',
        embedShape: '[B, T, —]',
      },
      caption:
        '通过 CompressedTokenizer 将大小写、空格和变体拼写映射为规范 ID $P(x_t)$，在不损失实体语义的前提下压缩约 23% 词表冗余并提升 N-gram 命中率。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · 多阶后缀 N-gram 滑动提取与奇数乘数混洗',
        showCanonical: true,
        showArcs: true,
        activeHeads: [0, 1],
        showConcat: false,
        vocabAfterNorm: '99,124 等价类',
        ngramOrder: '2-gram + 3-gram',
        hashOps: '⊕ (P(x_{t-k}) · m_k)',
        embedShape: '[B, T, 16 heads]',
      },
      caption:
        '为位置 $t$ 同时提取 2-gram $(x_{t-1},x_t)$ 与 3-gram $(x_{t-2},x_{t-1},x_t)$ 后缀，用各层独立奇数乘数 $m_k$ 相乘后按位异或 $\\oplus$，避免乘积溢出 int64。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · K=8 互异素数取模 O(1) 无碰撞寻址',
        showCanonical: true,
        showArcs: true,
        activeHeads: [0, 1, 2, 3, 4, 5, 6, 7],
        showConcat: false,
        vocabAfterNorm: '8 互异大素数模',
        ngramOrder: '每阶 K=8 头',
        hashOps: 'O(1) 无 GEMM 查表',
        embedShape: '16 × [d_head]',
      },
      caption:
        '将混洗哈希值分别对 $K=8$ 个互不重复的大素数 $P_j$ 取模并叠加 offsets，每个头映射到宿主内存大表的独立素数桶区间，直接完成 $O(1)$ 并行读取。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · 多头嵌入向量拼接 e_t',
        showCanonical: true,
        showArcs: true,
        activeHeads: [0, 1, 2, 3, 4, 5, 6, 7],
        showConcat: true,
        vocabAfterNorm: 'FP8 / MXFP4 存储',
        ngramOrder: '2-gram + 3-gram',
        hashOps: '单次 PCIe/HCCS 预取',
        embedShape: 'e_t [B, T, 1280]',
      },
      caption:
        '将 2-gram 与 3-gram 各自取出的 8 头子向量直接拼接为 $e_t$（论文配置 1024 维；DeepSeek-V4.1 检查点 1280 维），零计算量注入下文门控投影。',
    },
  ];
}

export default function EngramPrimeHashExplainer({
  title = '图 1：Engram 词表规范化、奇数乘数 XOR 混洗与 K=8 素数多头查表',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildEngramPrimeHashSteps(), []);

  return (
    <Explainer steps={steps} title={title} label={title}>
      {(step) => {
        const s = step.state;
        const topSlots = s.showCanonical ? TOKEN_SLOTS_CANON : TOKEN_SLOTS_RAW;
        const headSlots = PRIME_HEADS.map((h, i) => {
          const isActive = s.activeHeads.includes(i);
          return {
            id: h.id,
            label: `${h.label}%${h.sub}`,
            sub: isActive ? `idx=${h.offset}` : '待寻址',
            tone: (isActive ? 'done' : 'neutral') as Tone,
            status: (isActive ? 'selected' : 'empty') as 'selected' | 'empty',
          };
        });

        const topCenters = [108, 260, 412, 564];
        const headCenters = Array.from({ length: 8 }, (_, idx) => 22 + 36 + idx * 80);

        const arcs = s.showArcs
          ? [
              {
                fromX: topCenters[1],
                fromY: 84,
                toX: headCenters[1],
                toY: 144,
                tone: 'active' as const,
                active: true,
                arcOffset: 8,
                label: '3-gram ⊕',
              },
              {
                fromX: topCenters[2],
                fromY: 84,
                toX: headCenters[3],
                toY: 144,
                tone: 'active' as const,
                active: true,
                arcOffset: -10,
              },
              {
                fromX: topCenters[3],
                fromY: 84,
                toX: headCenters[5],
                toY: 144,
                tone: 'highlight' as const,
                active: true,
                arcOffset: 4,
                label: '2-gram %P_j',
              },
              {
                fromX: topCenters[3],
                fromY: 84,
                toX: headCenters[7],
                toY: 144,
                tone: 'highlight' as const,
                active: s.activeHeads.length > 2,
                arcOffset: -16,
              },
            ]
          : [];

        return (
          <Stage width={680} height={404} label={s.phaseLabel}>
            <SectionBox
              x={14}
              y={10}
              w={652}
              h={82}
              tone={s.stepIndex === 0 ? 'active' : 'neutral'}
              title="1. CompressedTokenizer 规范映射 P(x_t) -> 多阶后缀滑窗 (t-2, t-1, t)"
            />
            <SlotStrip x={36} y={34} slots={topSlots} slotW={140} gap={12} slotH={38} />

            <PointerArcs arcs={arcs} />

            <SectionBox
              x={14}
              y={134}
              w={652}
              h={76}
              tone={s.stepIndex === 2 ? 'done' : 'neutral'}
              title="2. 每阶 K=8 互异素数取模桶（32-bit 整数查表，0 矩阵乘法）"
            />
            <SlotStrip
              x={22}
              y={156}
              slots={headSlots}
              slotW={72}
              gap={8}
              slotH={38}
              fontSize={10.5}
            />

            <TensorBlock
              x={14}
              y={242}
              w={652}
              h={34}
              tone={s.showConcat ? 'done' : 'neutral'}
              name="3. 多头拼接向量 Concat"
              shape={s.showConcat ? '[e_2g(H0..7), e_3g(H0..7)]' : '等待聚拢 16 路查表结果'}
              splits={[
                { ratio: 0.5, axis: 'x', leftLabel: '2-gram H0..7', rightLabel: '3-gram H0..7' },
              ]}
              active={s.showConcat}
              dashed={!s.showConcat}
            />

            <MetricRow
              x={14}
              y={304}
              w={652}
              h={42}
              gap={12}
              metrics={[
                { label: '词表压缩', value: s.vocabAfterNorm, tone: 'active' },
                { label: '查表复杂度', value: s.hashOps, tone: 'done' },
                { label: '拼接张量', value: s.embedShape, tone: 'highlight', active: s.showConcat },
              ]}
            />

            <MetricRow
              x={14}
              y={354}
              w={652}
              h={40}
              gap={12}
              metrics={[
                { label: '后缀阶数', value: s.ngramOrder, tone: 'neutral' },
                { label: 'V4.1 表精度', value: 'FP8 / MXFP4 (group=32)', tone: 'neutral' },
                { label: '层间独立性', value: 'Seed = 10007 × layer_id', tone: 'active' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
