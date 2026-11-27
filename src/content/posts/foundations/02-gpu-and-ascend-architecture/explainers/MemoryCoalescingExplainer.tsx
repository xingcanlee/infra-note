import { useMemo, useState } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { InteractiveExplainer, LabSegmented } from '@/explainers/kit';
import ByteLedgerBar from '@/explainers/kit/ByteLedgerBar';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import {
  RADIUS,
  RADIUS_SM,
  STAGE_W,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
  useDiagramMotion,
  type AnyTone,
} from '@/explainers/kit/motion';

export type CoalescingMode = 'stride1' | 'misaligned' | 'stride2' | 'stride4' | 'ascend_biu';

export interface MemoryCoalescingState {
  mode: CoalescingMode;
  formulaTex: string;
  sectorsUsed: number;
  fetchedBytes: number;
  usefulBytes: number;
  efficiencyPct: number;
  metricPattern: string;
  metricTx: string;
  metricPayload: string;
  metricEfficiency: string;
}

const NUM_THREADS = 32;
const NUM_SECTORS = 16; // 16 x 32 B = 512 B (4 x 128 B Cache Lines)

function addressForThread(tid: number, mode: CoalescingMode): number {
  switch (mode) {
    case 'misaligned':
      return (tid + 1) * 4;
    case 'stride2':
      return tid * 8;
    case 'stride4':
      return tid * 16;
    case 'stride1':
    case 'ascend_biu':
    default:
      return tid * 4;
  }
}

function buildStateFor(mode: CoalescingMode): MemoryCoalescingState {
  switch (mode) {
    case 'misaligned':
      return {
        mode,
        formulaTex:
          '$a[\\text{tid}+1] \\;\\Longrightarrow\\; 5 \\times 32\\,\\text{B},\\; \\eta = 128/160 = 80\\%$',
        sectorsUsed: 5,
        fetchedBytes: 160,
        usefulBytes: 128,
        efficiencyPct: 80,
        metricPattern: '未对齐 $a[\\text{tid}+1]$',
        metricTx: '$5$ 个 $32\\;\\text{B}$ Sector',
        metricPayload: '$160\\;\\text{B} / 128\\;\\text{B}$',
        metricEfficiency: '$80.0\\%$ ($+25\\%$ 冗余)',
      };
    case 'stride2':
      return {
        mode,
        formulaTex:
          '$a[\\text{tid}\\times 2] \\;\\Longrightarrow\\; 8 \\times 32\\,\\text{B},\\; \\eta = 50\\%$',
        sectorsUsed: 8,
        fetchedBytes: 256,
        usefulBytes: 128,
        efficiencyPct: 50,
        metricPattern: '跨步 $a[\\text{tid}\\times 2]$',
        metricTx: '$8$ 个 $32\\;\\text{B}$ Sector',
        metricPayload: '$256\\;\\text{B} / 128\\;\\text{B}$',
        metricEfficiency: '$50.0\\%$ ($2\\times$ 带宽损耗)',
      };
    case 'stride4':
      return {
        mode,
        formulaTex:
          '$a[\\text{tid}\\times 4] \\;\\Longrightarrow\\; 16 \\times 32\\,\\text{B},\\; \\eta = 25\\%$',
        sectorsUsed: 16,
        fetchedBytes: 512,
        usefulBytes: 128,
        efficiencyPct: 25,
        metricPattern: '离散 $a[\\text{tid}\\times 4]$',
        metricTx: '$16$ 个 $32\\;\\text{B}$ Sector',
        metricPayload: '$512\\;\\text{B} / 128\\;\\text{B}$',
        metricEfficiency: '$25.0\\%$ ($4\\times$ 带宽浪涌)',
      };
    case 'ascend_biu':
      return {
        mode,
        formulaTex:
          '$\\text{BIU 合并} \\iff \\text{双端连续} \\Rightarrow \\text{HBM}\\to\\text{UB}\\xrightarrow{\\text{NZ}}\\text{L1}$',
        sectorsUsed: 4,
        fetchedBytes: 128,
        usefulBytes: 128,
        efficiencyPct: 100,
        metricPattern: '昇腾 BIU 块搬',
        metricTx: '先 UB 后 L1 规避直写',
        metricPayload: '双端连续满突发',
        metricEfficiency: '解锁 $5\\;\\text{TB/s}$ L2',
      };
    case 'stride1':
    default:
      return {
        mode: 'stride1',
        formulaTex:
          '$a[\\text{tid}] \\;\\Longrightarrow\\; 4 \\times 32\\,\\text{B Sector},\\; \\eta = 100\\%$',
        sectorsUsed: 4,
        fetchedBytes: 128,
        usefulBytes: 128,
        efficiencyPct: 100,
        metricPattern: '连续 $a[\\text{tid}]$',
        metricTx: '$4$ 个 $32\\;\\text{B}$ Sector',
        metricPayload: '$128\\;\\text{B} / 128\\;\\text{B}$',
        metricEfficiency: '$100\\%$ 有效带宽',
      };
  }
}

export function buildMemoryCoalescingSteps(): Step<MemoryCoalescingState>[] {
  assertMaxHues(['active', 'highlight', 'activation']);
  return [
    {
      label: '步长 1 连续',
      duration: 4600,
      state: buildStateFor('stride1'),
      caption: 'Warp 内 32 个相邻线程读取连续元素，合并为 4 个 32 B Sector，有效带宽达 100%。',
    },
    {
      label: '错位 +1',
      duration: 4600,
      state: buildStateFor('misaligned'),
      caption: '起始偏移 4 B 导致第 31 号线程跨入第 5 个 Sector，有效带宽降至 80%。',
    },
    {
      label: '步长 2',
      duration: 4600,
      state: buildStateFor('stride2'),
      caption: '步长为 2 时每 Sector 仅命中半数槽位，需搬运 256 B，有效带宽腰斩至 50%。',
    },
    {
      label: '步长 4 离散',
      duration: 4600,
      state: buildStateFor('stride4'),
      caption: '步长为 4 时跨满 4 条 128 B 缓存行（16 个 Sector），有效带宽跌至 25%。',
    },
    {
      label: '昇腾 BIU 块搬',
      duration: 4600,
      state: buildStateFor('ascend_biu'),
      caption: '昇腾 BIU 要求源与目的双端连续，需经 MTE2 连续搬入 192 KB UB 完成 ND2NZ 再送 L1。',
    },
  ];
}

// 16 个 32B Sector 分成 4 组 128B Cache Line，固定坐标便于连线与槽位平滑形变
function sectorX(si: number): number {
  const leftX = 21;
  const secW = 35;
  const intraGap = 4;
  const lineGap = 10;
  const lineIdx = Math.floor(si / 4);
  return leftX + si * (secW + intraGap) + lineIdx * (lineGap - intraGap);
}

export default function MemoryCoalescingExplainer({
  title = '图 4：GPU 32 字节 Sector 访存合并、昇腾 BIU 双端连续约束与双硬件存储金字塔',
}: {
  title?: string;
}) {
  assertMaxHues(['active', 'highlight', 'activation']);
  const { stepTransition } = useDiagramMotion();
  const [mode, setMode] = useState<CoalescingMode>('stride1');

  const s = useMemo(() => buildStateFor(mode), [mode]);
  const isAscend = mode === 'ascend_biu';
  const leftX = 21;
  const laneW = 18;
  const laneGap = 2;
  const laneStride = laneW + laneGap;
  const secW = 35;

  const caption = useMemo(() => {
    switch (mode) {
      case 'misaligned':
        return '仅因起始指针偏移 $4\\;\\text{B}$，$\\text{T0}\\dots \\text{T30}$ 落在首条 $128\\;\\text{B}$ 缓存行，而 $\\text{T31}$ 越界落入下一条缓存行的第 $5$ 个 Sector（$S_4$）；硬件被迫拉回 $160\\;\\text{B}$，有效带宽降至 $80.0\\%$。';
      case 'stride2':
        return '步长扩大为 $2$ 个 FP32 元素时，$32$ 条访存连线散开落入 $8$ 个 $32\\;\\text{B}$ Sector（横跨 $2$ 条 $128\\;\\text{B}$ 缓存行），每个 Sector 只有一半槽位被使用，有效 HBM 带宽利用率降至 $50.0\\%$。';
      case 'stride4':
        return '步长为 $4$ 个元素（$16\\;\\text{B}$）时，$32$ 个线程跨越整整 $4$ 条 $128\\;\\text{B}$ 缓存行（$16$ 个 Sector），每个 Sector 仅取走 $2$ 个 $4\\;\\text{B}$ 槽位；HBM 实搬 $512\\;\\text{B}$ 却仅用 $128\\;\\text{B}$，有效带宽仅剩 $25.0\\%$。';
      case 'ascend_biu':
        return '昇腾 AI Core 的 BIU（总线接口单元）仅在源端与目的端双双连续时才触发突发合并：工程上先由 MTE2 将连续向量搬入 $192\\;\\text{KB}$ UB，由 Vector SIMD 原地完成 ND2NZ 转置后再连续送往 L1，避免跨步直写掉档。';
      case 'stride1':
      default:
        return 'Warp 内 $32$ 个相邻线程读取连续 FP32 元素（字节 $0\\dots 127$），硬件将全部请求合并为第 0 条 $128\\;\\text{B}$ 缓存行内的 $4$ 个 $32\\;\\text{B}$ Sector（$S_0\\dots S_3$），有效带宽达到 $100\\%$。';
    }
  }, [mode]);

  const activeHits = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (let tid = 0; tid < NUM_THREADS; tid++) {
      const addr = addressForThread(tid, mode);
      const secIdx = Math.floor(addr / 32);
      const slotIdx = Math.floor((addr % 32) / 4);
      if (!map.has(secIdx)) map.set(secIdx, new Set());
      map.get(secIdx)!.add(slotIdx);
    }
    return map;
  }, [mode]);

  const wasteBytes = Math.max(0, s.fetchedBytes - s.usefulBytes);

  return (
    <InteractiveExplainer
      title={title}
      label="访存合并事务扇出与双硬件存储层级交互"
      stageMinHeight={520}
      formula={s.formulaTex}
      caption={caption}
      onReset={() => setMode('stride1')}
      controls={
        <LabSegmented
          ariaLabel="访存地址模式"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'stride1', label: '步长 1 连续' },
            { id: 'misaligned', label: '错位 +1' },
            { id: 'stride2', label: '步长 2' },
            { id: 'stride4', label: '步长 4 离散' },
            { id: 'ascend_biu', label: '昇腾 BIU 块搬' },
          ]}
        />
      }
    >
      <Stage width={STAGE_W} height={476} label="GPU 32B Sector 访存合并与存储金字塔">
        {!isAscend ? (
          <g>
            <SectionBox
              x={12}
              y={10}
              w={656}
              h={186}
              title="32 线程 Warp × 128 B 缓存行视图（4 × 128 B 缓存行 = 16 × 32 B Sector）"
              tone="active"
            />

            {Array.from({ length: NUM_THREADS }, (_, tid) => {
              const tx = leftX + tid * laneStride;
              const showIndex = tid === 0 || tid === 8 || tid === 16 || tid === 24 || tid === 31;
              return (
                <g key={tid}>
                  {showIndex && (
                    <text
                      x={tx + laneW / 2}
                      y={36}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fill: 'var(--wisp-muted)',
                        fontFamily: 'var(--wisp-font-mono)',
                        fontSize: 10,
                      }}
                    >
                      {`T${tid}`}
                    </text>
                  )}
                  <rect
                    x={tx}
                    y={44}
                    width={laneW}
                    height={16}
                    rx={RADIUS_SM}
                    fill={resolveToneFill('active')}
                    stroke={resolveToneStroke('active')}
                    strokeWidth={1.1}
                  />
                </g>
              );
            })}

            {/* 32 根连线平滑摆动到目标 32B Sector 槽位 */}
            {Array.from({ length: NUM_THREADS }, (_, tid) => {
              const addr = addressForThread(tid, mode);
              const secIdx = Math.floor(addr / 32);
              const slotIdx = Math.floor((addr % 32) / 4);
              const sx1 = leftX + tid * laneStride + laneW / 2;
              const sx2 = sectorX(secIdx) + ((slotIdx + 0.5) / 8) * secW;
              const overflow = mode === 'misaligned' && secIdx >= 4;
              return (
                <motion.line
                  key={tid}
                  x1={sx1}
                  y1={60}
                  initial={false}
                  animate={{ x2: sx2 }}
                  y2={122}
                  transition={stepTransition}
                  stroke={resolveToneStroke(overflow ? 'highlight' : 'active')}
                  strokeWidth={1.25}
                  strokeOpacity={0.76}
                />
              );
            })}

            {/* 4 条 128B Cache Line 括号标注 */}
            {[0, 1, 2, 3].map((lineIdx) => {
              const lx0 = sectorX(lineIdx * 4);
              const lx1 = sectorX(lineIdx * 4 + 3) + secW;
              const lineActive = Array.from({ length: 4 }, (_, k) =>
                activeHits.has(lineIdx * 4 + k),
              ).some(Boolean);
              return (
                <g key={lineIdx}>
                  <line
                    x1={lx0}
                    y1={116}
                    x2={lx1}
                    y2={116}
                    stroke={
                      lineActive
                        ? resolveToneStroke(
                            mode === 'misaligned' && lineIdx === 1 ? 'highlight' : 'active',
                          )
                        : 'var(--wisp-border)'
                    }
                    strokeWidth={1.2}
                  />
                  <text
                    x={(lx0 + lx1) / 2}
                    y={107}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fill: lineActive ? 'var(--wisp-fg)' : 'var(--wisp-muted)',
                      fontFamily: 'var(--wisp-font-mono)',
                      fontSize: 10,
                      fontWeight: lineActive ? 600 : 500,
                    }}
                  >
                    {`Line ${lineIdx} (128B)`}
                  </text>
                </g>
              );
            })}

            {/* 16 个固定位置的 32B Sector，状态与高亮槽位平滑过渡 */}
            {Array.from({ length: NUM_SECTORS }, (_, si) => {
              const bx = sectorX(si);
              const slotW = secW / 8;
              const slotsHit = activeHits.get(si);
              const hit = Boolean(slotsHit && slotsHit.size > 0);
              const hasOverflow = mode === 'misaligned' && si === 4;
              const tone: AnyTone = !hit ? 'neutral' : hasOverflow ? 'highlight' : 'active';
              return (
                <motion.g
                  key={si}
                  initial={false}
                  animate={{ opacity: hit ? 1 : 0.34 }}
                  transition={stepTransition}
                >
                  <rect
                    x={bx}
                    y={122}
                    width={secW}
                    height={26}
                    rx={RADIUS_SM}
                    fill="var(--wisp-surface)"
                    stroke={resolveToneStroke(tone)}
                    strokeWidth={hit ? 1.4 : 1}
                  />
                  {Array.from({ length: 8 }, (_, subIdx) => {
                    const used = slotsHit?.has(subIdx) ?? false;
                    return (
                      <motion.rect
                        key={subIdx}
                        x={bx + subIdx * slotW + 0.5}
                        y={123}
                        width={Math.max(2, slotW - 1)}
                        height={24}
                        rx={0}
                        initial={false}
                        animate={{
                          fillOpacity: used ? 0.96 : hit ? 0.25 : 0.1,
                        }}
                        transition={stepTransition}
                        fill={used ? resolveToneFill(tone) : 'var(--wisp-surface-2)'}
                        stroke={used ? resolveToneStroke(tone) : 'none'}
                        strokeWidth={used ? 0.8 : 0}
                      />
                    );
                  })}
                  <text
                    x={bx + secW / 2}
                    y={160}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fill: hit ? 'var(--wisp-fg)' : 'var(--wisp-muted)',
                      fontFamily: 'var(--wisp-font-mono)',
                      fontSize: 10,
                      fontWeight: hit ? 600 : 500,
                    }}
                  >
                    {`S${si}`}
                  </text>
                </motion.g>
              );
            })}

            <text
              x={22}
              y={180}
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 10.5,
              }}
            >
              实色格为线程有效读取（共 128 B）；同 Sector 内灰格为随 32 B 事务空拉回的冗余字节。
            </text>
          </g>
        ) : (
          <g>
            <SectionBox
              x={12}
              y={10}
              w={656}
              h={186}
              title="华为昇腾 BIU 块搬约束与片上 ND2NZ 中转通路"
              tone="activation"
            />
            {[
              {
                x: 28,
                y: 38,
                w: 168,
                h: 46,
                tone: 'neutral' as AnyTone,
                dashed: false,
                line1: 'HBM 稀疏 Token 读取',
                line2: '源端每行 512 B 连续',
                bold: false,
              },
              {
                x: 228,
                y: 38,
                w: 196,
                h: 46,
                tone: 'highlight' as AnyTone,
                dashed: true,
                line1: 'MTE2 跨步直写 L1',
                line2: '目的步长 B_TOPK × 32 B 断开',
                bold: false,
              },
              {
                x: 456,
                y: 38,
                w: 196,
                h: 46,
                tone: 'highlight' as AnyTone,
                dashed: false,
                line1: 'BIU 拒绝合并事务',
                line2: 'L2 实测吞吐大幅下降',
                bold: true,
              },
              {
                x: 28,
                y: 112,
                w: 168,
                h: 48,
                tone: 'activation' as AnyTone,
                dashed: false,
                line1: 'HBM 连续突发读入',
                line2: 'MTE2 写入 192 KB UB',
                bold: true,
              },
              {
                x: 228,
                y: 112,
                w: 196,
                h: 48,
                tone: 'activation' as AnyTone,
                dashed: false,
                line1: '源与目的双端连续',
                line2: 'BIU 触发满突发访存合并',
                bold: true,
              },
              {
                x: 456,
                y: 112,
                w: 196,
                h: 48,
                tone: 'active' as AnyTone,
                dashed: false,
                line1: 'Vector SIMD 转 FRACTAL_NZ',
                line2: '再经 MTE3 连续送 L1 喂 Cube',
                bold: true,
              },
            ].map((box, idx) => (
              <g key={idx}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={RADIUS}
                  fill={resolveToneFill(box.tone)}
                  stroke={resolveToneStroke(box.tone)}
                  strokeWidth={box.bold ? 1.6 : 1.2}
                  strokeDasharray={box.dashed ? '4 3' : undefined}
                />
                <text
                  x={box.x + box.w / 2}
                  y={box.y + box.h * 0.34}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11,
                    fontWeight: box.bold ? 700 : 600,
                  }}
                >
                  {box.line1}
                </text>
                <text
                  x={box.x + box.w / 2}
                  y={box.y + box.h * 0.72}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 10,
                  }}
                >
                  {box.line2}
                </text>
              </g>
            ))}

            <DataFlowArrow
              points={[
                [196, 61],
                [228, 61],
              ]}
              tone="highlight"
              dashed
              arrowEnd
            />
            <DataFlowArrow
              points={[
                [424, 61],
                [456, 61],
              ]}
              tone="highlight"
              dashed
              arrowEnd
            />
            <DataFlowArrow
              points={[
                [196, 136],
                [228, 136],
              ]}
              tone="activation"
              active
              flow
              continuous
              draw
              arrowEnd
            />
            <DataFlowArrow
              points={[
                [424, 136],
                [456, 136],
              ]}
              tone="active"
              active
              flow
              continuous
              draw
              arrowEnd
            />

            <text
              x={28}
              y={180}
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 10.5,
              }}
            >
              关键：借 UB 完成片上转置，让 GM-to-UB 与 UB-to-L1 两段搬运各自满足双端连续。
            </text>
          </g>
        )}

        {/* 平滑形变的有效带宽对比长条 */}
        <ByteLedgerBar
          x={16}
          y={222}
          w={648}
          h={24}
          title={
            isAscend
              ? '昇腾 BIU 合并带宽利用率（双端连续突发）'
              : `有效带宽占比：${s.efficiencyPct}%（实搬 ${s.fetchedBytes} B = 128 B 有效 + ${wasteBytes} B 冗余）`
          }
          totalLabel={`${s.fetchedBytes} B 总事务`}
          segments={
            wasteBytes > 0
              ? [
                  {
                    value: s.usefulBytes,
                    label: `有效载荷 ${s.usefulBytes} B (${s.efficiencyPct}%)`,
                    tone: isAscend ? 'activation' : 'active',
                    active: true,
                  },
                  {
                    value: wasteBytes,
                    label: `冗余空拉 ${wasteBytes} B`,
                    tone: 'highlight',
                  },
                ]
              : [
                  {
                    value: s.usefulBytes,
                    label: isAscend ? '双端连续突发 100% 合并' : '128 B 全有效利用 (100%)',
                    tone: isAscend ? 'activation' : 'active',
                    active: true,
                  },
                ]
          }
        />

        {/* 存储金字塔 */}
        <SectionBox
          x={12}
          y={260}
          w={656}
          h={150}
          title="双硬件存储金字塔（片内寄存器/UB -> 共享 L2 -> 片外 HBM）"
          tone="neutral"
        />

        {[
          {
            colTitle: 'NVIDIA GPU (H100 示例)',
            baseX: 24,
            tiers: [
              { id: 'reg', label: 'Registers · 256 KB/SM · ~1 拍', active: false },
              { id: 'smem', label: 'SMEM / L1 · 256 KB · 32-Bank · ~25 拍', active: false },
              { id: 'l2', label: 'L2 Cache · 50 MB · ~200 拍', active: false },
              { id: 'hbm', label: 'HBM3 · 80 GB · 3.35 TB/s · ~400+ 拍', active: !isAscend },
            ],
          },
          {
            colTitle: '华为昇腾 AI Core (1C2V 示例)',
            baseX: 348,
            tiers: [
              { id: 'l0', label: 'L0A/L0B & L0C (256 KB) · Cube 累加', active: false },
              { id: 'ub', label: 'L1 & Vector UB (192 KB/AIV) · 显式调度', active: isAscend },
              { id: 'l2', label: '共享 L2 Cache · ~5 TB/s · BIU 合并', active: isAscend },
              { id: 'hbm', label: 'HBM · ND / FRACTAL_NZ · MTE2/3', active: false },
            ],
          },
        ].map((col) => (
          <g key={col.colTitle}>
            <text
              x={col.baseX + 4}
              y={290}
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-fg)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {col.colTitle}
            </text>
            {col.tiers.map((tier, ti) => {
              const ty = 302 + ti * 25;
              const tone: AnyTone = tier.active
                ? isAscend
                  ? 'activation'
                  : 'highlight'
                : 'neutral';
              return (
                <g key={tier.id}>
                  <rect
                    x={col.baseX}
                    y={ty}
                    width={308}
                    height={21}
                    rx={RADIUS_SM}
                    fill={tier.active ? resolveToneFill(tone) : 'var(--wisp-surface)'}
                    stroke={tier.active ? resolveToneStroke(tone) : 'var(--wisp-border)'}
                    strokeWidth={tier.active ? 1.8 : 1}
                  />
                  <text
                    x={col.baseX + 10}
                    y={ty + 10.5}
                    dominantBaseline="central"
                    style={{
                      fill: tier.active ? 'var(--wisp-fg)' : 'var(--wisp-muted)',
                      fontFamily: 'var(--wisp-font-sans)',
                      fontSize: 10.5,
                      fontWeight: tier.active ? 700 : 500,
                    }}
                  >
                    {tier.label}
                  </text>
                </g>
              );
            })}
          </g>
        ))}

        <MetricRow
          x={12}
          y={420}
          w={656}
          h={46}
          metrics={[
            { label: '访存模式', value: s.metricPattern, tone: 'active', active: true },
            { label: '物理事务', value: s.metricTx, tone: 'neutral' },
            { label: '实搬 / 有效', value: s.metricPayload, tone: 'highlight', active: true },
            {
              label: '带宽结论',
              value: s.metricEfficiency,
              tone: isAscend ? 'activation' : 'neutral',
            },
          ]}
        />
      </Stage>
    </InteractiveExplainer>
  );
}
