import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  ByteLedgerBar,
  DataFlowArrow,
  HeatmapMatrix,
  MetricRow,
  SectionBox,
  STAGE_W,
  TensorBlock,
  assertMaxHues,
} from '@/explainers/kit';

export interface Csa2HsiState {
  phase: 'axes' | 'modes' | 'hsi_l1' | 'hsi_l2' | 'inv_ced';
  hsiGrid: (number | null)[][];
  hsiMasks: boolean[][];
  selected: Set<string>;
  focusArea: 'ledger' | 'modes' | 'hsi' | 'inv';
}

const BLK_COLS = ['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];
const LAYER_ROWS = ['L20(Full)', 'L24(Reidx)', 'L28(Reidx)'];

export function buildCsa2HsiSteps(): Step<Csa2HsiState>[] {
  assertMaxHues(['blue', 'amber', 'green']);

  const fullMatrix: (number | null)[][] = [
    [1.2, 4.9, 0.8, 3.6, 1.5, 5.4, 0.6, 2.1],
    [1.0, 4.5, 0.9, 3.8, 1.2, 5.1, 0.7, 1.8],
    [1.4, 4.2, 0.6, 4.1, 1.1, 4.7, 0.9, 2.0],
  ];
  const fullMasks = fullMatrix.map((r) => r.map(() => false));

  // L1 粗块海选保留 B1, B3, B5（后续 Reindex 层完全跳过其余 5 块）
  const candMatrix: (number | null)[][] = [
    [1.2, 4.9, 0.8, 3.6, 1.5, 5.4, 0.6, 2.1],
    [null, 4.5, null, 3.8, null, 5.1, null, null],
    [null, 4.2, null, 4.1, null, 4.7, null, null],
  ];
  const candMasks = candMatrix.map((r) => r.map((v) => v === null));

  // L2 精筛 Top-K：各 Reindex 层在候选池内自由挑选不同精确位置
  const l1Selected = new Set<string>(['0,1', '0,3', '0,5']);
  const l2Selected = new Set<string>(['0,1', '0,5', '1,1', '1,5', '2,3', '2,5']);

  return [
    {
      state: {
        phase: 'axes',
        hsiGrid: fullMatrix,
        hsiMasks: fullMasks,
        selected: new Set<string>(),
        focusArea: 'ledger',
      },
      caption:
        '步骤 1（三维乘法压缩账本）：位宽轴从 MLA BF16 $1152\\text{ B}$ → V4 $584\\text{ B}$ → V4.1 NVFP4 $288\\text{ B}$（$256\\text{ B}$ E2M1 + $32\\text{ B}$ per-16 E4M3），叠乘序列 $m=2/1$ 与跨层 $2.5$ 份收敛到全网 $890\\text{ B/tok}$。',
    },
    {
      state: {
        phase: 'modes',
        hsiGrid: fullMatrix,
        hsiMasks: fullMasks,
        selected: new Set<string>(),
        focusArea: 'modes',
      },
      caption:
        '步骤 2（CSA2 三态分工解耦）：$40$ 层静态划为 Full（写主 KV+索引）、Reindex（复用缓存但重算索引）与 Reuse（两者全复用，Decode 仅跑 $11$ 个融合核）。',
    },
    {
      state: {
        phase: 'hsi_l1',
        hsiGrid: candMatrix,
        hsiMasks: candMasks,
        selected: l1Selected,
        focusArea: 'hsi',
      },
      caption:
        '步骤 3（HSI L1 粗块海选池）：解码器首层 L20 (Full) 全扫描时顺便按每 $8$ 槽位取块内最大值，挑选 Top-2048 粗块拼成固定容量 $16,384$ 的共享候选池（示意中选中 B1, B3, B5）。',
    },
    {
      state: {
        phase: 'hsi_l2',
        hsiGrid: candMatrix,
        hsiMasks: candMasks,
        selected: l2Selected,
        focusArea: 'hsi',
      },
      caption:
        '步骤 4（HSI L2 恒定开销重索引）：后续 Reindex 层（L24..L36）只扫描该固定 $16,384$ 候选池（$1\\text{M}$ 上下文下仅占 $1.64\\%$）并自选 Top-512，单步索引开销变为常数 $O(1)$。',
    },
    {
      state: {
        phase: 'inv_ced',
        hsiGrid: candMatrix,
        hsiMasks: candMasks,
        selected: l2Selected,
        focusArea: 'inv',
      },
      caption:
        '步骤 5（输出逆 RoPE $R_{-n}$ 与 CED 减半）：主注意力输出末 $64$ 维乘 $R_{-n}$ 恢复相对位置；配合 CED 后半 $20$ 层由 $H_{L/2}$ 直接投影全局 KV 及 $n_{\\text{win}}=128$ 有界重放，Prefill 算力砍半。',
    },
  ];
}

const STAGE_H = 450;

export default function Csa2HsiExplainer({
  title = '图 1：DeepSeek-V4.1 CSA2 三维压缩、HSI 两级稀疏索引与逆 RoPE 恢复',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildCsa2HsiSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="CSA2 三维压缩与两级分层稀疏索引">
      {(step) => {
        const s = step.state;
        const focusRect =
          s.focusArea === 'ledger'
            ? { x: 14, y: 10, w: 652, h: 110, label: '单槽字节三级压榨：1152 B → 288 B' }
            : s.focusArea === 'modes'
              ? { x: 20, y: 160, w: 224, h: 192, label: '40L Full / Reindex / Reuse' }
              : s.focusArea === 'hsi'
                ? { x: 268, y: 160, w: 392, h: 192, label: 'HSI 两级候选筛选（1.64% @ 1M）' }
                : { x: 14, y: 380, w: 652, h: 62, label: 'R_{-n} 逆旋转与 CED 2.00x 加速' };

        return (
          <Stage width={STAGE_W} height={STAGE_H} label="CSA2 三维压缩与 HSI 分层索引">
            {/* 顶部：1152 B -> 576 B -> 288 B NVFP4 等比例对比条 */}
            <ByteLedgerBar
              x={22}
              y={46}
              w={636}
              h={26}
              title="条目位宽演进比例尺：BF16 (1152 B) → FP8 (576~584 B) → NVFP4 (288 B = 256B E2M1 + 32B E4M3)"
              totalLabel="单槽 1152 B 基准"
              segments={[
                {
                  value: 256,
                  label: 'V4.1 E2M1 载荷 (256 B)',
                  tone: 'green',
                  active: s.phase === 'axes',
                },
                {
                  value: 32,
                  label: 'per-16 E4M3 (32 B)',
                  tone: 'amber',
                  active: s.phase === 'axes',
                },
                { value: 288, label: '较 FP8 576 B 再省 50%', tone: 'blue' },
                { value: 576, label: '较 MLA BF16 1152 B 省 75%', tone: 'slate' },
              ]}
            />

            {/* 左下：三态静态分工 */}
            <SectionBox
              x={14}
              y={130}
              w={236}
              h={230}
              title="CSA2 三模式与全网 2.5 份 KV"
              tone="blue"
            />
            <TensorBlock
              x={28}
              y={176}
              w={208}
              h={48}
              labelMode="inside"
              tone="blue"
              name="Full Mode（L2/8/14 + L20）"
              shape="写 2.5 份主 KV + 产出 L1 候选"
              active={s.phase === 'modes' || s.phase === 'hsi_l1'}
            />
            <TensorBlock
              x={28}
              y={236}
              w={208}
              h={48}
              labelMode="inside"
              tone="amber"
              name="Reindex Mode（L24/28/32/36）"
              shape="复用主 KV · 仅重扫 16,384 候选"
              active={s.phase === 'modes' || s.phase === 'hsi_l2'}
            />
            <TensorBlock
              x={28}
              y={296}
              w={208}
              h={48}
              labelMode="inside"
              tone="green"
              name="Reuse Mode（30 层）+ R_{-n}"
              shape="直读 Top-512 · Decode 仅 11 核"
              active={s.phase === 'modes' || s.phase === 'inv_ced'}
            />

            <DataFlowArrow
              points={[
                [240, 200],
                [266, 200],
              ]}
              tone="active"
              active={s.phase === 'hsi_l1'}
              flow={s.phase === 'hsi_l1'}
            />

            {/* 右下：HSI 两级稀疏索引热图 */}
            <SectionBox
              x={262}
              y={130}
              w={404}
              h={230}
              title="Hierarchical Sparse Index（HSI：L1 粗块 → L2 精筛）"
              tone="amber"
            />
            <HeatmapMatrix
              x={276}
              y={184}
              values={s.hsiGrid}
              masks={s.hsiMasks}
              tone={s.phase === 'hsi_l1' ? 'blue' : 'amber'}
              cellW={33}
              cellH={34}
              gap={5}
              min={0}
              max={6.0}
              rowLabelW={62}
              rowLabels={LAYER_ROWS}
              colLabels={BLK_COLS}
              selected={s.selected}
              selectedTone="green"
              format={(v) => v.toFixed(1)}
              fontSize={10}
            />

            <MetricRow
              x={14}
              y={392}
              w={652}
              h={44}
              metrics={[
                {
                  label: '整网 40L 全局 KV',
                  value: '890 B/tok (2.5×[288+68])',
                  tone: 'green',
                  active: s.phase === 'axes',
                },
                {
                  label: 'HSI 1M 候选扫描占比',
                  value: '16,384 / 1M = 1.64%',
                  tone: 'amber',
                  active: s.phase === 'hsi_l2',
                },
                {
                  label: '索引计算总量缩减',
                  value: '14.8×（较全层重算）',
                  tone: 'blue',
                  active: s.phase === 'modes' || s.phase === 'hsi_l2',
                },
                {
                  label: '输出还原与 CED 加速',
                  value: 'R_{-n} 逆旋 · Prefill 2.00×',
                  tone: 'green',
                  active: s.phase === 'inv_ced',
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
