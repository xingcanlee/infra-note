import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
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

export interface MemoryCoalescingState {
  stepIndex: number;
  mode: 'gpu' | 'ascend';
  titleText: string;
  strideKind?: 'contiguous' | 'misaligned' | 'strided2' | 'strided8';
  sectorsShown: number;
  sectorsTotal: number;
  fetchedBytes: number;
  efficiencyText: string;
  activeTierGpu?: 'reg' | 'smem' | 'l2' | 'hbm';
  activeTierAscend?: 'l0' | 'ub' | 'l2' | 'hbm';
  metricPattern: string;
  metricTx: string;
  metricPayload: string;
  metricEfficiency: string;
}

const NUM_THREADS = 32;

function addressForThread(tid: number, kind: MemoryCoalescingState['strideKind']): number {
  switch (kind) {
    case 'misaligned':
      return (tid + 1) * 4;
    case 'strided2':
      return tid * 8;
    case 'strided8':
      return tid * 32;
    case 'contiguous':
    default:
      return tid * 4;
  }
}

export function buildMemoryCoalescingSteps(): Step<MemoryCoalescingState>[] {
  const tones: AnyTone[] = ['active', 'highlight', 'activation'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        mode: 'gpu',
        titleText: '连续对齐读取 a[tid]（32 线程紧凑落入 4 个 32 B Sector，100% 满载）',
        strideKind: 'contiguous',
        sectorsShown: 4,
        sectorsTotal: 4,
        fetchedBytes: 128,
        efficiencyText: '100% 有效',
        activeTierGpu: 'hbm',
        metricPattern: '连续 $a[\\text{tid}]$',
        metricTx: '$4$ 个 $32\\;\\text{B}$ Sector',
        metricPayload: '$128\\;\\text{B} / 128\\;\\text{B}$',
        metricEfficiency: '$100\\%$ 有效带宽',
      },
      caption:
        'Warp 内 $32$ 个相邻线程读取相邻的 FP32 元素（字节 $0\\dots 127$），硬件将其严格合并为 $4$ 次连续的 $32\\;\\text{B}$ 事务，$128\\;\\text{B}$ 传输全部转化为有效计算数据。',
    },
    {
      state: {
        stepIndex: 1,
        mode: 'gpu',
        titleText: '首地址偏移 4 B：a[tid + 1]（跨界多触发第 5 个 Sector，浪费 32 B）',
        strideKind: 'misaligned',
        sectorsShown: 5,
        sectorsTotal: 5,
        fetchedBytes: 160,
        efficiencyText: '80% 有效',
        activeTierGpu: 'hbm',
        metricPattern: '未对齐 $a[\\text{tid}+1]$',
        metricTx: '$5$ 个 $32\\;\\text{B}$ Sector',
        metricPayload: '$160\\;\\text{B} / 128\\;\\text{B}$',
        metricEfficiency: '$80.0\\%$ ($+25\\%$ 冗余)',
      },
      caption:
        '仅仅因为起始指针偏了 $4$ 个字节，$\\text{T0}\\dots \\text{T6}$ 落在首段末尾，而 $\\text{T31}$ 越界滑入第 $5$ 个 Sector；硬件多拉回 $32\\;\\text{B}$ 无效边角数据，有效带宽降为 $80\\%$。',
    },
    {
      state: {
        stepIndex: 2,
        mode: 'gpu',
        titleText: '跨步访存 a[tid * 2]（隔元读取拆散至 8 个 Sector，带宽减半）',
        strideKind: 'strided2',
        sectorsShown: 8,
        sectorsTotal: 8,
        fetchedBytes: 256,
        efficiencyText: '50% 有效',
        activeTierGpu: 'hbm',
        metricPattern: '跨步 $a[\\text{tid}\\times 2]$',
        metricTx: '$8$ 个 $32\\;\\text{B}$ Sector',
        metricPayload: '$256\\;\\text{B} / 128\\;\\text{B}$',
        metricEfficiency: '$50.0\\%$ ($2\\times$ 带宽损耗)',
      },
      caption:
        '当步长扩大为 $2$（例如读取二维矩阵跨行切片），每个 $32\\;\\text{B}$ Sector 中只有一半元素被 Warp 取走，另一半随事务空跑，有效 HBM 带宽利用率瞬间腰斩至 $50\\%$。',
    },
    {
      state: {
        stepIndex: 3,
        mode: 'gpu',
        titleText: '大步长离散读 a[tid * 8]（每个线程独占 1 个 32 B Sector，仅 12.5% 有效）',
        strideKind: 'strided8',
        sectorsShown: 32,
        sectorsTotal: 32,
        fetchedBytes: 1024,
        efficiencyText: '12.5% 有效',
        activeTierGpu: 'hbm',
        metricPattern: '大跨步 $a[\\text{tid}\\times 8]$',
        metricTx: '$32$ 个 $32\\;\\text{B}$ Sector',
        metricPayload: '$1024\\;\\text{B} / 128\\;\\text{B}$',
        metricEfficiency: '$12.5\\%$ ($8\\times$ 带宽浪涌)',
      },
      caption:
        '步长为 $8$ 个元素（$32\\;\\text{B}$）时，$32$ 个线程各占 $1$ 个完整 Sector：Warp 仅需 $128\\;\\text{B}$，HBM 却被迫搬运 $1024\\;\\text{B}$，超过 $87.5\\%$ 的显存吞吐被白白丢弃。',
    },
    {
      state: {
        stepIndex: 4,
        mode: 'ascend',
        titleText: '昇腾 BIU 访存合并规则：仅当源与目的双端连续时合并，先 UB 再 SIMD 转分形',
        sectorsShown: 4,
        sectorsTotal: 4,
        fetchedBytes: 128,
        efficiencyText: '双端连续',
        activeTierAscend: 'ub',
        metricPattern: '昇腾 BIU 合并规则',
        metricTx: '先 UB 后 L1 规避直写',
        metricPayload: '双端连续满突发',
        metricEfficiency: '解锁 $5\\;\\text{TB/s}$ L2',
      },
      caption:
        '昇腾 AI Core 内部的 BIU（Bus Interface Unit，总线接口单元）只会在源地址与目的地址同时连续时才触发访存合并。若用 MTE2 从 HBM 连续读入却跨步直写 L1 做分形转换，L2 带宽利用率骤降；工程上先连续读入 $192\\;\\text{KB}$ UB（Unified Buffer，片上统一缓存），由 Vector SIMD 原地完成 ND2NZ 再连续迁往 L1。',
    },
  ];
}

export default function MemoryCoalescingExplainer({
  title = '图 4：GPU 32 字节 Sector 访存合并、昇腾 BIU 双端连续约束与双硬件存储金字塔',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildMemoryCoalescingSteps(), []);
  const { stepTransition } = useDiagramMotion();

  return (
    <Explainer steps={steps} title={title} label="访存合并事务扇出与双硬件存储层级交互">
      {(step) => {
        const s = step.state;
        // 32 threads aligned across x=21..659 (each 18w + 2 gap => 32*18 + 31*2 = 638px)
        const leftX = 21;
        const laneW = 18;
        const laneGap = 2;
        const laneStride = laneW + laneGap; // 20px
        const fullW = 638;

        const secGap = s.sectorsShown === 32 ? 2 : s.sectorsShown === 8 ? 8 : 12;
        const secW = (fullW - (s.sectorsShown - 1) * secGap) / s.sectorsShown;

        return (
          <Stage width={STAGE_W} height={472} label="GPU 32B Sector 访存合并与存储金字塔">
            <SvgRichLabel
              x={16}
              y={20}
              width={STAGE_W - 32}
              height={22}
              text={s.titleText}
              fontSize={12.5}
              fontWeight={600}
              color="var(--wisp-fg)"
              anchor="start"
            />

            {s.mode === 'gpu' ? (
              <g>
                <SectionBox
                  x={12}
                  y={36}
                  w={656}
                  h={196}
                  title="Warp 访存合并事务扇出（32 线程 x 4 B = 128 B 有效请求 -> 32 B 对齐 HBM Sector）"
                  tone="active"
                />

                {/* Top row: 32 thread lanes */}
                {Array.from({ length: NUM_THREADS }, (_, tid) => {
                  const tx = leftX + tid * laneStride;
                  const showIndex =
                    tid === 0 || tid === 8 || tid === 16 || tid === 24 || tid === 31;
                  return (
                    <g key={tid}>
                      {showIndex && (
                        <text
                          x={tx + laneW / 2}
                          y={65}
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{
                            fill: 'var(--wisp-muted)',
                            fontFamily: 'var(--wisp-font-mono)',
                            fontSize: 9.5,
                          }}
                        >
                          {`T${tid}`}
                        </text>
                      )}
                      <rect
                        x={tx}
                        y={74}
                        width={laneW}
                        height={18}
                        rx={RADIUS_SM}
                        fill={resolveToneFill('active')}
                        stroke={resolveToneStroke('active')}
                        strokeWidth={1.2}
                      />
                    </g>
                  );
                })}

                {/* Wires from each thread center down to its exact byte slot inside touched Sector */}
                {Array.from({ length: NUM_THREADS }, (_, tid) => {
                  const addr = addressForThread(tid, s.strideKind);
                  const secIdx = Math.floor(addr / 32);
                  const slotIdx = Math.floor((addr % 32) / 4);
                  const sx1 = leftX + tid * laneStride + laneW / 2;
                  const sx2 = leftX + secIdx * (secW + secGap) + ((slotIdx + 0.5) / 8) * secW;
                  return (
                    <motion.line
                      key={tid}
                      x1={sx1}
                      y1={92}
                      initial={false}
                      animate={{ x2: sx2 }}
                      y2={166}
                      transition={stepTransition}
                      stroke={resolveToneStroke(
                        secIdx >= 4 && s.strideKind === 'misaligned' ? 'highlight' : 'active',
                      )}
                      strokeWidth={1.2}
                      strokeOpacity={0.72}
                    />
                  );
                })}

                {/* Bottom row: 32B sectors with proportional 8-slot subfill */}
                {Array.from({ length: s.sectorsShown }, (_, si) => {
                  const bx = leftX + si * (secW + secGap);
                  const slotW = secW / 8;
                  const activeSlots = new Set<number>();
                  for (let tid = 0; tid < NUM_THREADS; tid++) {
                    const addr = addressForThread(tid, s.strideKind);
                    if (Math.floor(addr / 32) === si) {
                      activeSlots.add(Math.floor((addr % 32) / 4));
                    }
                  }
                  const hasOverflow = s.strideKind === 'misaligned' && si === 4;
                  const tone: AnyTone = hasOverflow ? 'highlight' : 'active';
                  const showSecLbl =
                    s.sectorsShown <= 8 ||
                    si === 0 ||
                    si === 8 ||
                    si === 16 ||
                    si === 24 ||
                    si === 31;

                  return (
                    <g key={si}>
                      <rect
                        x={bx}
                        y={166}
                        width={secW}
                        height={28}
                        rx={RADIUS_SM}
                        fill="var(--wisp-surface)"
                        stroke={resolveToneStroke(tone)}
                        strokeWidth={1.3}
                      />
                      {Array.from({ length: 8 }, (_, subIdx) => {
                        const used = activeSlots.has(subIdx);
                        return (
                          <rect
                            key={subIdx}
                            x={bx + subIdx * slotW + 0.5}
                            y={167}
                            width={Math.max(1.5, slotW - 1)}
                            height={26}
                            rx={1}
                            fill={used ? resolveToneFill(tone) : 'var(--wisp-surface-2)'}
                            fillOpacity={used ? 0.95 : 0.45}
                            stroke={used ? resolveToneStroke(tone) : 'none'}
                            strokeWidth={used ? 0.8 : 0}
                          />
                        );
                      })}
                      {showSecLbl && (
                        <text
                          x={bx + secW / 2}
                          y={207}
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{
                            fill: 'var(--wisp-muted)',
                            fontFamily: 'var(--wisp-font-mono)',
                            fontSize: 9.5,
                          }}
                        >
                          {`S${si}`}
                        </text>
                      )}
                    </g>
                  );
                })}

                <text
                  x={22}
                  y={222}
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11,
                  }}
                >
                  说明：每个 32 B Sector 含 8 个 4 B
                  槽位；实色格为线程有效读取，灰格为随事务空拉回的浪费带宽。
                </text>
              </g>
            ) : (
              <g>
                <SectionBox
                  x={12}
                  y={36}
                  w={656}
                  h={196}
                  title="华为昇腾 BIU 访存合并约束与片上 ND2NZ 中转通路"
                  tone="activation"
                />

                {[
                  {
                    x: 28,
                    y: 66,
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
                    y: 66,
                    w: 196,
                    h: 46,
                    tone: 'highlight' as AnyTone,
                    dashed: true,
                    line1: 'MTE2 跨步直写 L1',
                    line2: '目的步长 B_TOPK x 32 B 断开',
                    bold: false,
                  },
                  {
                    x: 456,
                    y: 66,
                    w: 196,
                    h: 46,
                    tone: 'highlight' as AnyTone,
                    dashed: false,
                    line1: 'BIU 拒绝合并事务',
                    line2: '实测 L2 带宽利用率骤降',
                    bold: true,
                  },
                  {
                    x: 28,
                    y: 142,
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
                    y: 142,
                    w: 196,
                    h: 48,
                    tone: 'activation' as AnyTone,
                    dashed: false,
                    line1: '源与目的双端连续',
                    line2: 'BIU 触发满吞吐访存合并',
                    bold: true,
                  },
                  {
                    x: 456,
                    y: 142,
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

                {[
                  { x1: 196, y1: 89, x2: 228, y2: 89, tone: 'highlight' as AnyTone, dashed: true },
                  { x1: 424, y1: 89, x2: 456, y2: 89, tone: 'highlight' as AnyTone, dashed: true },
                  {
                    x1: 196,
                    y1: 166,
                    x2: 228,
                    y2: 166,
                    tone: 'activation' as AnyTone,
                    dashed: false,
                  },
                  { x1: 424, y1: 166, x2: 456, y2: 166, tone: 'active' as AnyTone, dashed: false },
                ].map((edge, idx) => (
                  <line
                    key={idx}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke={resolveToneStroke(edge.tone)}
                    strokeWidth={1.8}
                    strokeDasharray={edge.dashed ? '4 3' : undefined}
                  />
                ))}

                <text
                  x={28}
                  y={214}
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11,
                  }}
                >
                  说明：绕开跨步直写 L1 的核心技巧是借 UB 完成片上转置，让 GM-to-UB 与 UB-to-L1
                  两段搬运各自满足双端连续。
                </text>
              </g>
            )}

            {/* Middle Dual Memory Hierarchy Pyramid */}
            <SectionBox
              x={12}
              y={242}
              w={656}
              h={154}
              title="双硬件存储金字塔（从核心内部向上到片外显存：容量放大、带宽收窄、延时显著拉长）"
              tone="neutral"
            />

            {[
              {
                colTitle: 'NVIDIA GPU (H100 示例)',
                baseX: 24,
                tiers: [
                  {
                    id: 'reg',
                    label: 'Registers · 256 KB/SM · 线程私有 · ~1 拍',
                    tone: 'active' as AnyTone,
                    active: s.activeTierGpu === 'reg',
                  },
                  {
                    id: 'smem',
                    label: 'SMEM / L1 · 256 KB · 32-Bank · ~25 拍',
                    tone: 'active' as AnyTone,
                    active: s.activeTierGpu === 'smem',
                  },
                  {
                    id: 'l2',
                    label: 'L2 Cache · 50 MB · 全卡共享 · ~200 拍',
                    tone: 'neutral' as AnyTone,
                    active: s.activeTierGpu === 'l2',
                  },
                  {
                    id: 'hbm',
                    label: 'HBM3 · 80 GB · 3.35 TB/s · ~400+ 拍',
                    tone: 'highlight' as AnyTone,
                    active: s.activeTierGpu === 'hbm',
                  },
                ],
              },
              {
                colTitle: '华为昇腾 AI Core (1C2V 示例)',
                baseX: 348,
                tiers: [
                  {
                    id: 'l0',
                    label: 'L0A/L0B & L0C (256 KB) · Cube 专用累加',
                    tone: 'activation' as AnyTone,
                    active: s.activeTierAscend === 'l0',
                  },
                  {
                    id: 'ub',
                    label: 'L1 & Vector UB (192 KB/AIV) · 显式调度',
                    tone: 'activation' as AnyTone,
                    active: s.activeTierAscend === 'ub',
                  },
                  {
                    id: 'l2',
                    label: '共享 L2 Cache · ~5 TB/s · BIU 合并目标',
                    tone: 'activation' as AnyTone,
                    active: s.activeTierAscend === 'l2',
                  },
                  {
                    id: 'hbm',
                    label: 'HBM · ND / FRACTAL_NZ · MTE2/3 显式搬运',
                    tone: 'neutral' as AnyTone,
                    active: s.activeTierAscend === 'hbm',
                  },
                ],
              },
            ].map((col) => (
              <g key={col.colTitle}>
                <text
                  x={col.baseX + 4}
                  y={273}
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  {col.colTitle}
                </text>
                {col.tiers.map((tier, ti) => {
                  const ty = 285 + ti * 26;
                  const tone = tier.active ? tier.tone : 'neutral';
                  return (
                    <g key={tier.id}>
                      <rect
                        x={col.baseX}
                        y={ty}
                        width={308}
                        height={22}
                        rx={RADIUS_SM}
                        fill={tier.active ? resolveToneFill(tone) : 'var(--wisp-surface)'}
                        stroke={tier.active ? resolveToneStroke(tone) : 'var(--wisp-border)'}
                        strokeWidth={tier.active ? 1.8 : 1}
                      />
                      <text
                        x={col.baseX + 10}
                        y={ty + 11}
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
              y={410}
              w={656}
              h={46}
              metrics={[
                { label: '访存访问模式', value: s.metricPattern, tone: 'active', active: true },
                { label: '物理事务开销', value: s.metricTx, tone: 'neutral' },
                {
                  label: '实搬 / 有效字节',
                  value: s.metricPayload,
                  tone: 'highlight',
                  active: true,
                },
                {
                  label: '带宽利用结论',
                  value: s.metricEfficiency,
                  tone: s.mode === 'ascend' ? 'activation' : 'neutral',
                },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
