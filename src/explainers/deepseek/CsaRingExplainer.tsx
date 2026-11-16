import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  ByteLedgerBar,
  MetricRow,
  PointerArcs,
  SectionBox,
  SlotStrip,
  STAGE_W,
  TensorBlock,
  assertMaxHues,
} from '@/explainers/kit';

export interface CsaRingState {
  phase: 'ring' | 'csa_fold' | 'hca_swa' | 'inv_rope' | 'ledger';
  focusArea: 'ring' | 'csa' | 'hca' | 'rope' | 'ledger';
}

export function buildCsaRingSteps(): Step<CsaRingState>[] {
  assertMaxHues(['blue', 'amber', 'green']);
  return [
    {
      state: { phase: 'ring', focusArea: 'ring' },
      caption:
        '步骤 1（流式环形尾缓冲 StateCache）：新到词元先投影 $[C^a, C^b, Z^a, Z^b]$，尚未凑满步长 $m=4$ 的尾部行暂存进定长 FP32 环形槽位，凑满整组再触发写回。',
    },
    {
      state: { phase: 'csa_fold', focusArea: 'csa' },
      caption:
        '步骤 2（CSA 重叠双窗门控折块 $m=4, 2m=8$）：从相邻 $8$ 个位置切窗叠加偏置 $B^a, B^b$，沿时间维做逐通道 Softmax 折叠成 $C_i^{\\text{Comp}}$，净压缩 $1/4$ 且消除边界撕裂。',
    },
    {
      state: { phase: 'hca_swa', focusArea: 'hca' },
      caption:
        '步骤 3（HCA $m^{\\prime}=128$ 交错与 SWA 兜底）：重度压缩层 HCA 以 $128$ 倍非重叠折叠取消索引器直接全块读取，并由局部 SWA（$n_{\\text{win}}=128$）覆盖未闭合块内近邻依赖。',
    },
    {
      state: { phase: 'inv_rope', focusArea: 'rope' },
      caption:
        '步骤 4（共享 KV 逆旋转 $R_{-t}$）：由于压缩潜向量 $C^{\\text{Comp}}$ 兼任 Key 与 Value 且末 $64$ 维带有绝对旋转 $R_{k_{\\text{pos}}}$，注意力输出端必须施加 $-t$ 逆 RoPE 恢复相对距离。',
    },
    {
      state: { phase: 'ledger', focusArea: 'ledger' },
      caption:
        '步骤 5（V4 混合精简与整网账本）：单条主缓存压至 $584\\text{ B}$（$448\\text{ B}$ FP8 + $8\\text{ B}$ 缩放 + $128\\text{ B}$ BF16 RoPE），叠乘 CSA/HCA 交错后全网缓存降至 V3.2 的 $7\\%$。',
    },
  ];
}

const STREAM_TOKENS = [
  { id: 't0', label: 't0', sub: '0.10' },
  { id: 't1', label: 't1', sub: '0.45' },
  { id: 't2', label: 't2', sub: '0.15' },
  { id: 't3', label: 't3', sub: '0.08' },
  { id: 't4', label: 't4', sub: '0.06' },
  { id: 't5', label: 't5', sub: '0.04' },
  { id: 't6', label: 't6', sub: '0.07' },
  { id: 't7', label: 't7', sub: '0.05' },
  { id: 't8', label: 't8', sub: 'Ring0' },
  { id: 't9', label: 't9', sub: 'Ring1' },
];

const COMP_BLOCKS = [
  { id: 'c0', label: 'C0^Comp', sub: 't0..t7 折' },
  { id: 'c1', label: 'C1^Comp', sub: 't4..t7+后' },
  { id: 'hca', label: 'HCA 块', sub: 'm′=128' },
  { id: 'swa', label: 'SWA 窗', sub: '近 128 词' },
];

const STAGE_H = 414;

export default function CsaRingExplainer({
  title = '图 1：DeepSeek-V4 CSA 重叠门控折叠、环形尾缓存与输出逆 RoPE 推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildCsaRingSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="DeepSeek-V4 CSA 序列折块与逆旋转">
      {(step) => {
        const s = step.state;
        const streamSlots = STREAM_TOKENS.map((t, idx) => {
          const isRing = idx >= 8;
          const isWin0 = idx < 4;
          const isWin1 = idx >= 4 && idx < 8;
          return {
            id: t.id,
            label: t.label,
            sub: t.sub,
            topTag: isRing ? 'Ring' : isWin0 ? 'W0' : 'W1',
            tone: (isRing ? 'amber' : isWin0 || isWin1 ? 'blue' : 'slate') as
              'amber' | 'blue' | 'slate',
            status: (isRing
              ? s.phase === 'ring'
                ? 'selected'
                : 'active'
              : s.phase === 'csa_fold'
                ? 'selected'
                : 'normal') as 'selected' | 'active' | 'normal',
          };
        });

        const blockSlots = COMP_BLOCKS.map((b, idx) => ({
          id: b.id,
          label: b.label,
          sub: b.sub,
          tone: (idx < 2 ? 'blue' : 'green') as 'blue' | 'green',
          status: ((idx < 2 && s.phase === 'csa_fold') || (idx >= 2 && s.phase === 'hca_swa')
            ? 'selected'
            : 'normal') as 'selected' | 'normal',
        }));

        // 顶部 slotW=40, gap=4 => slot idx centerX = 24 + idx * 44 + 20 = 44 + idx * 44
        // 下方 slotW=92, gap=10 => block idx centerX = 24 + idx * 102 + 46 = 70 + idx * 102
        const foldArcs = [
          {
            fromX: 44 + 0 * 44,
            fromY: 110,
            toX: 70,
            toY: 156,
            arcOffset: -6,
            tone: 'blue' as const,
            active: s.phase === 'csa_fold',
            flow: s.phase === 'csa_fold',
          },
          {
            fromX: 44 + 1 * 44,
            fromY: 110,
            toX: 70,
            toY: 156,
            arcOffset: 4,
            tone: 'blue' as const,
            active: s.phase === 'csa_fold',
            flow: s.phase === 'csa_fold',
            label: '0.45',
          },
          {
            fromX: 44 + 4 * 44,
            fromY: 110,
            toX: 70,
            toY: 156,
            arcOffset: 8,
            tone: 'blue' as const,
            dashed: true,
            active: s.phase === 'csa_fold',
          },
          {
            fromX: 44 + 4 * 44,
            fromY: 110,
            toX: 172,
            toY: 156,
            arcOffset: -4,
            tone: 'amber' as const,
            active: s.phase === 'csa_fold',
            label: '重叠 2m',
          },
          {
            fromX: 44 + 7 * 44,
            fromY: 110,
            toX: 172,
            toY: 156,
            arcOffset: 6,
            tone: 'amber' as const,
            active: s.phase === 'csa_fold',
          },
          {
            fromX: 44 + 8 * 44,
            fromY: 110,
            toX: 376,
            toY: 156,
            arcOffset: -12,
            tone: 'green' as const,
            active: s.phase === 'hca_swa' || s.phase === 'ring',
            label: 'SWA',
          },
        ];

        const focusRect =
          s.focusArea === 'ring'
            ? { x: 372, y: 46, w: 94, h: 68, label: 'FP32 环形尾槽' }
            : s.focusArea === 'csa'
              ? { x: 20, y: 46, w: 350, h: 156, label: 'CSA m=4 (2m=8 重叠折叠)' }
              : s.focusArea === 'hca'
                ? { x: 222, y: 150, w: 206, h: 50, label: 'HCA 128x + SWA 兜底' }
                : s.focusArea === 'rope'
                  ? { x: 494, y: 46, w: 164, h: 156, label: 'R_{-t} 还原相对位置' }
                  : { x: 14, y: 228, w: 652, h: 174, label: 'V4 584 B 布局与 7% 整网压缩' };

        return (
          <Stage width={STAGE_W} height={STAGE_H} label="DeepSeek-V4 CSA 序列折块与逆旋转图解">
            <SectionBox
              x={14}
              y={14}
              w={462}
              h={198}
              title="1. 流式输入与门控折块（CSA 重叠 2m=8 vs 环形尾缓冲 vs HCA 128x）"
              tone="blue"
            />
            <SlotStrip
              x={24}
              y={76}
              slots={streamSlots}
              slotW={40}
              slotH={32}
              gap={4}
              fontSize={11}
            />
            <SlotStrip
              x={24}
              y={158}
              slots={blockSlots}
              slotW={92}
              slotH={34}
              gap={10}
              fontSize={11}
            />
            <PointerArcs arcs={foldArcs} />

            {/* 右侧：共享 KV 逆 RoPE 恢复流程 */}
            <SectionBox x={486} y={14} w={180} h={198} title="2. 共享 KV 与逆 RoPE" tone="amber" />
            <TensorBlock
              x={500}
              y={72}
              w={152}
              h={34}
              tone="blue"
              name="CoreAttn 输出 o_t"
              shape="[-64:] 含绝对 R_{k_pos}"
              active={s.phase === 'inv_rope'}
              muted={s.phase !== 'inv_rope'}
            />
            <TensorBlock
              x={500}
              y={150}
              w={152}
              h={36}
              tone="amber"
              name="R_{-t} · o_t[-64:]"
              shape="还原相对位置 k_pos - t"
              active={s.phase === 'inv_rope'}
              muted={s.phase !== 'inv_rope'}
            />

            <ByteLedgerBar
              x={24}
              y={264}
              w={632}
              h={28}
              title="DeepSeek-V4 单压缩条目布局（584 B/entry，叠乘 m=4/128 后降至 V3.2 的 7%~10%）"
              totalLabel="584 B/entry"
              segments={[
                {
                  value: 448,
                  label: 'FP8 NoPE (448 B)',
                  tone: 'green',
                  active: s.phase === 'ledger',
                },
                { value: 8, label: 'FP8 Scale (8 B)', tone: 'amber', active: s.phase === 'ledger' },
                {
                  value: 128,
                  label: 'BF16 RoPE 64d (128 B)',
                  tone: 'blue',
                  active: s.phase === 'inv_rope' || s.phase === 'ledger',
                },
              ]}
            />

            <MetricRow
              x={20}
              y={346}
              w={640}
              h={42}
              metrics={[
                {
                  label: 'CSA 压缩倍率',
                  value: 'm=4（2m=8 重叠+FP4索引）',
                  tone: 'blue',
                  active: s.phase === 'csa_fold',
                },
                {
                  label: 'HCA 压缩倍率',
                  value: 'm′=128（免索引稠密全块）',
                  tone: 'green',
                  active: s.phase === 'hca_swa',
                },
                {
                  label: 'V4-Flash 43L 1M 实测',
                  value: 'KV 7% · FLOPs 10% (相对 V3.2)',
                  tone: 'amber',
                  active: s.phase === 'ledger',
                },
                { label: '仍存跨层冗余', value: '单层独立写存 → V4.1 CSA2 解法', tone: 'slate' },
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
