import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  ByteLedgerBar,
  HeatmapMatrix,
  MetricRow,
  SectionBox,
  SlotStrip,
  STAGE_W,
  assertMaxHues,
} from '@/explainers/kit';

export interface DsaIndexerState {
  phase: 'score' | 'topk' | 'gather' | 'ledger' | 'crossover';
  heatValues: (number | null)[][];
  heatMasks: boolean[][];
  selectedHeat: Set<string>;
  slotStatus: ('normal' | 'active' | 'selected' | 'masked')[];
  slotSub: string[];
  focusArea: 'slots' | 'heat' | 'ledger' | 'cross';
}

const SLOTS_S = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
const QUERIES_Q = ['q4', 'q5', 'q6', 'q7'];

export function buildDsaIndexerSteps(): Step<DsaIndexerState>[] {
  assertMaxHues(['blue', 'amber', 'green']);

  // I_{t,s} 示例打分（已经 ReLU 截断非负）
  const rawScores = [0.0, 3.8, 0.4, 5.1, 0.0, 2.6, 0.2, 4.3];
  const fullHeat: (number | null)[][] = [
    [0.0, 3.2, 0.5, 4.4, 1.1, null, null, null],
    [0.0, 3.5, 0.3, 4.8, 0.0, 2.9, null, null],
    [0.0, 3.6, 0.2, 5.0, 0.0, 2.4, 3.7, null],
    rawScores,
  ];

  // Top-3 稀疏保留（类比生产 Top-k = 2048）
  const topHeat: (number | null)[][] = [
    [null, 3.2, null, 4.4, 1.1, null, null, null],
    [null, 3.5, null, 4.8, null, 2.9, null, null],
    [null, 3.6, null, 5.0, null, null, 3.7, null],
    [null, 3.8, null, 5.1, null, null, null, 4.3],
  ];

  const baseMasks = fullHeat.map((row) => row.map((v) => v === null));
  const topMasks = topHeat.map((row) => row.map((v) => v === null));
  const selectedHeat = new Set<string>(['3,1', '3,3', '3,7']);

  return [
    {
      state: {
        phase: 'score',
        heatValues: fullHeat,
        heatMasks: baseMasks,
        selectedHeat: new Set<string>(),
        slotStatus: [
          'masked',
          'active',
          'active',
          'active',
          'masked',
          'active',
          'active',
          'active',
        ],
        slotSub: ['0.0', '3.8', '0.4', '5.1', '0.0', '2.6', '0.2', '4.3'],
        focusArea: 'slots',
      },
      caption:
        '步骤 1（Lightning Indexer FP8 ReLU 打分）：用 $H^I=64$ 个轻量索引头与 $1$ 头共享 $k_s^I$ 做点积并取 $\\operatorname{ReLU}$，无关槽位 $s_0, s_4$ 直接归零，免去全局 Softmax 归约。',
    },
    {
      state: {
        phase: 'topk',
        heatValues: fullHeat,
        heatMasks: baseMasks,
        selectedHeat,
        slotStatus: [
          'masked',
          'selected',
          'masked',
          'selected',
          'masked',
          'normal',
          'masked',
          'selected',
        ],
        slotSub: ['0.0', 'Top-2', '淘汰', 'Top-1', '0.0', '淘汰', '淘汰', 'Top-3'],
        focusArea: 'slots',
      },
      caption:
        '步骤 2（Top-$k$ 离散索引筛选）：对每步打分排序截取前 $k$ 个关键位置（生产环境 $k=2048$，本例示为 $k=3$ 选中 $\\{s_1, s_3, s_7\\}$），细粒度定位关键历史 token，摆脱固定块切分约束。',
    },
    {
      state: {
        phase: 'gather',
        heatValues: topHeat,
        heatMasks: topMasks,
        selectedHeat,
        slotStatus: [
          'masked',
          'selected',
          'masked',
          'selected',
          'masked',
          'masked',
          'masked',
          'selected',
        ],
        slotSub: ['跳过', '读取', '跳过', '读取', '跳过', '跳过', '跳过', '读取'],
        focusArea: 'heat',
      },
      caption:
        '步骤 3（FlashMLA 稀疏按索引 Gather）：主模型 $128$ 个高精度查询头在 MQA 模式下只从 HBM 搬运选中下标对应的潜向量 $[c_s^{KV}; k_s^R]$，核心复杂度从 $O(L^2)$ 降至 $O(Lk)$。',
    },
    {
      state: {
        phase: 'ledger',
        heatValues: topHeat,
        heatMasks: topMasks,
        selectedHeat,
        slotStatus: [
          'masked',
          'selected',
          'masked',
          'selected',
          'masked',
          'masked',
          'masked',
          'selected',
        ],
        slotSub: ['跳过', '656B', '跳过', '656B', '跳过', '跳过', '跳过', '656B'],
        focusArea: 'ledger',
      },
      caption:
        '步骤 4（656 B 主 KV 与 132 B 索引器双缓存对账）：主 KV 存 $512\\text{ B}$ FP8 NoPE + $16\\text{ B}$（4×FP32）缩放 + $128\\text{ B}$ BF16 RoPE 共 $656\\text{ B}$，索引缓存仅占 $128\\text{ B} + 4\\text{ B} = 132\\text{ B}$。',
    },
    {
      state: {
        phase: 'crossover',
        heatValues: topHeat,
        heatMasks: topMasks,
        selectedHeat,
        slotStatus: [
          'masked',
          'selected',
          'masked',
          'selected',
          'masked',
          'masked',
          'masked',
          'selected',
        ],
        slotSub: ['跳过', '读取', '跳过', '读取', '跳过', '跳过', '跳过', '读取'],
        focusArea: 'cross',
      },
      caption:
        '步骤 5（长短序列算力交叉点）：序列短于约 $3000$ 个 token 时非连续 Gather 略慢于稠密 MLA；越过 $3000$ 并推向 $128\\text{K}$ 后，Hopper CTA Cluster 稀疏 Kernel 达到 $410\\text{ TFLOPS}$ 超越稠密基线。',
    },
  ];
}

const STAGE_H = 468;

export default function DsaIndexerExplainer({
  title = '图 1：DeepSeek-V3.2 DSA 闪电索引器、Top-K 按索引 Gather 与 656 B + 132 B 账本',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildDsaIndexerSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="DSA 闪电索引器与双精度账本">
      {(step) => {
        const s = step.state;
        const slotItems = SLOTS_S.map((id, idx) => ({
          id,
          label: id,
          sub: s.slotSub[idx],
          topTag:
            idx === 1 || idx === 3 || idx === 7
              ? s.phase !== 'score'
                ? 'Top'
                : undefined
              : undefined,
          tone: (s.slotStatus[idx] === 'selected'
            ? 'green'
            : s.slotStatus[idx] === 'active'
              ? 'amber'
              : 'slate') as 'green' | 'amber' | 'slate',
          status: s.slotStatus[idx],
        }));

        const focusRect =
          s.focusArea === 'slots'
            ? { x: 20, y: 48, w: 344, h: 146, label: 'FP8 ReLU 索引筛选 (k=3/2048)' }
            : s.focusArea === 'heat'
              ? { x: 390, y: 48, w: 268, h: 146, label: 'O(Lk) 按索引 Gather' }
              : s.focusArea === 'ledger'
                ? { x: 14, y: 218, w: 652, h: 168, label: '656 B 主缓存 + 132 B 索引缓存' }
                : { x: 14, y: 396, w: 652, h: 60, label: 'L≈3000 吞吐交叉点与 410 TFLOPS' };

        return (
          <Stage width={STAGE_W} height={STAGE_H} label="DSA 索引打分、稀疏收集与字节构成">
            <SectionBox
              x={14}
              y={12}
              w={356}
              h={194}
              title="Lightning Indexer 历史槽位（1 头 FP8 键 k_s^I）"
              tone="amber"
            />
            <text
              x={24}
              y={70}
              textAnchor="start"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-fg)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              {'查询 q7 对 s0..s7 的 ReLU 索引分 I_{7,s}'}
            </text>
            <SlotStrip
              x={24}
              y={104}
              slots={slotItems}
              slotW={38}
              slotH={36}
              gap={4}
              fontSize={11}
            />

            <SectionBox
              x={382}
              y={12}
              w={284}
              h={194}
              title="主模型注意力（128 头共享 1 KV 潜槽）"
              tone="green"
            />
            <HeatmapMatrix
              x={396}
              y={64}
              values={s.heatValues}
              masks={s.heatMasks}
              tone={s.phase === 'score' ? 'amber' : 'green'}
              cellW={24}
              cellH={22}
              gap={3}
              min={0}
              max={5.5}
              rowLabelW={32}
              rowLabels={QUERIES_Q}
              colLabels={SLOTS_S}
              selected={s.selectedHeat}
              selectedTone="amber"
              format={(v) => v.toFixed(1)}
              fontSize={10}
            />

            {/* 成比例字节条：656 B 主 KV vs 132 B 索引缓存 */}
            <ByteLedgerBar
              x={22}
              y={254}
              w={636}
              h={26}
              title="主模型稀疏缓存 fp8_ds_mla（按字节严格成比例）"
              totalLabel="656 B/tok"
              segments={[
                {
                  value: 512,
                  label: 'FP8 E4M3 c_s^KV (512 B)',
                  tone: 'green',
                  active: s.phase === 'ledger',
                },
                {
                  value: 16,
                  label: '4×FP32 缩放 (16 B)',
                  tone: 'amber',
                  active: s.phase === 'ledger',
                },
                {
                  value: 128,
                  label: 'BF16 k_s^R (128 B)',
                  tone: 'blue',
                  active: s.phase === 'ledger',
                },
              ]}
            />

            {/* 132 / 656 * 636 ≈ 128 px 严格等比例宽度 */}
            <ByteLedgerBar
              x={22}
              y={334}
              w={128}
              h={24}
              title="IndexerCache 132 B (20.1%)"
              segments={[
                {
                  value: 128,
                  label: '128B k^I',
                  tone: 'amber',
                  active: s.phase === 'score' || s.phase === 'ledger',
                },
                { value: 4, label: '4B ue8m0 缩放', tone: 'blue', active: s.phase === 'ledger' },
              ]}
            />

            <MetricRow
              x={14}
              y={408}
              w={652}
              h={42}
              metrics={[
                {
                  label: '核心注意力复杂度',
                  value: 'O(L²) → O(Lk), k=2048',
                  tone: 'green',
                  active: s.phase === 'gather',
                },
                {
                  label: '128K×62L 主 KV',
                  value: '8.72 GiB → 4.96 GiB',
                  tone: 'blue',
                  active: s.phase === 'ledger',
                },
                {
                  label: 'L≈3000 吞吐拐点',
                  value: '<3K 稠密优 · >3K 稀疏反超',
                  tone: 'amber',
                  active: s.phase === 'crossover',
                },
                {
                  label: 'H800 CTA Cluster 基准',
                  value: '最高 410 TFLOPS',
                  tone: 'green',
                  active: s.phase === 'crossover',
                },
              ]}
            />

            <ActiveFocusFrame
              x={focusRect.x}
              y={focusRect.y}
              w={focusRect.w}
              h={focusRect.h}
              tone="highlight"
              label={focusRect.label}
              visible
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
