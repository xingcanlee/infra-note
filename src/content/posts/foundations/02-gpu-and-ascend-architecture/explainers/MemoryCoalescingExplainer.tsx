import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, SvgBeatGroup, defaultBeats, type BeatSpec } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import {
  MANIM_EASE,
  RADIUS,
  RADIUS_SM,
  STAGE_W,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
  type AnyTone,
} from '@/explainers/kit/motion';

export interface MemoryCoalescingState {
  stepIndex: number;
  mode: 'gpu' | 'ascend';
  formulaTex: string;
  beats: BeatSpec[];
  strideKind?: 'contiguous' | 'misaligned' | 'strided2' | 'strided8';
  sectorsShown: number;
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
      label: '连续对齐',
      duration: 4600,
      state: {
        stepIndex: 0,
        mode: 'gpu',
        formulaTex:
          '$a[\\text{tid}] \\;\\Longrightarrow\\; 4 \\times 32\\,\\text{B Sector},\\; \\eta = 100\\%$',
        beats: defaultBeats([
          '检视 T0..T31 连续地址',
          '线性并入 4 个 32B Sector',
          '映射片外 HBM 层级定位',
          '确认 100% 有效带宽',
        ]),
        strideKind: 'contiguous',
        sectorsShown: 4,
        activeTierGpu: 'hbm',
        metricPattern: '连续 $a[\\text{tid}]$',
        metricTx: '$4$ 个 $32\\;\\text{B}$ Sector',
        metricPayload: '$128\\;\\text{B} / 128\\;\\text{B}$',
        metricEfficiency: '$100\\%$ 有效带宽',
      },
      caption:
        'Warp 内 $32$ 个相邻线程读取相邻的 FP32 元素（字节 $0\\dots 127$），硬件将其合并为 $4$ 次连续的 $32\\;\\text{B}$ 事务，$128\\;\\text{B}$ 传输全部转化为有效计算数据。',
    },
    {
      label: '首址错位',
      duration: 4600,
      state: {
        stepIndex: 1,
        mode: 'gpu',
        formulaTex:
          '$a[\\text{tid}+1] \\;\\Longrightarrow\\; 5 \\times 32\\,\\text{B},\\; \\eta = 128/160 = 80\\%$',
        beats: defaultBeats([
          '读取偏移 4B 的 32 线程地址',
          'T31 跨界拉出第 5 个 Sector',
          '高亮 HBM 额外传输损耗',
          '核算 80% 带宽折扣',
        ]),
        strideKind: 'misaligned',
        sectorsShown: 5,
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
      label: '步长 2 访存',
      duration: 4600,
      state: {
        stepIndex: 2,
        mode: 'gpu',
        formulaTex:
          '$a[\\text{tid}\\times 2] \\;\\Longrightarrow\\; 8 \\times 32\\,\\text{B},\\; \\eta = 50\\%$',
        beats: defaultBeats([
          '展开步长 2 稀疏访存模式',
          '落入 8 个半满 Sector 槽位',
          '点亮 HBM3 事务放大路径',
          '计算带宽腰斩 50%',
        ]),
        strideKind: 'strided2',
        sectorsShown: 8,
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
      label: '大跨步离散',
      duration: 4600,
      state: {
        stepIndex: 3,
        mode: 'gpu',
        formulaTex:
          '$a[\\text{tid}\\times 8] \\;\\Longrightarrow\\; 32 \\times 32\\,\\text{B},\\; \\eta = 12.5\\%$',
        beats: defaultBeats([
          '锁定步长 32B 离散线程向量',
          '扇出占满全部 32 个 Sector',
          '聚焦片外显存 8× 传输浪涌',
          '汇总 87.5% 浪费结论',
        ]),
        strideKind: 'strided8',
        sectorsShown: 32,
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
      label: '昇腾 BIU',
      duration: 4600,
      state: {
        stepIndex: 4,
        mode: 'ascend',
        formulaTex:
          '$\\text{BIU 合并} \\iff \\text{双端连续} \\Rightarrow \\text{HBM}\\to\\text{UB}\\xrightarrow{\\text{NZ}}\\text{L1}$',
        beats: defaultBeats([
          '剖析跨步直写 L1 失败原因',
          '改道先连续读入 192KB UB',
          '在存储金字塔点亮 UB 中转',
          '确认解锁 5TB/s 合并带宽',
        ]),
        sectorsShown: 4,
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

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label="访存合并事务扇出与双硬件存储层级交互"
      stageMinHeight={544}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        const leftX = 21;
        const laneW = 18;
        const laneGap = 2;
        const laneStride = laneW + laneGap;
        const fullW = 638;

        const secGap = s.sectorsShown === 32 ? 2 : s.sectorsShown === 8 ? 8 : 12;
        const secW = (fullW - (s.sectorsShown - 1) * secGap) / s.sectorsShown;
        const stepTransition = { duration: 0.36, ease: MANIM_EASE };

        return (
          <Stage width={STAGE_W} height={448} label="GPU 32B Sector 访存合并与存储金字塔">
            {s.mode === 'gpu' ? (
              <g>
                <SectionBox
                  x={12}
                  y={12}
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
                          y={41}
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
                        y={50}
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

                {/* Wires from each thread down to Sector slot */}
                <SvgBeatGroup visible={beat >= 1}>
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
                        y1={68}
                        initial={false}
                        animate={{ x2: sx2 }}
                        y2={142}
                        transition={stepTransition}
                        stroke={resolveToneStroke(
                          secIdx >= 4 && s.strideKind === 'misaligned' ? 'highlight' : 'active',
                        )}
                        strokeWidth={1.2}
                        strokeOpacity={0.72}
                      />
                    );
                  })}
                </SvgBeatGroup>

                {/* Bottom row: 32B sectors */}
                <SvgBeatGroup visible={beat >= 1} dimmed={beat < 1}>
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
                          y={142}
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
                              y={143}
                              width={Math.max(1.5, slotW - 1)}
                              height={26}
                              rx={0}
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
                            y={183}
                            textAnchor="middle"
                            dominantBaseline="central"
                            style={{
                              fill: 'var(--wisp-muted)',
                              fontFamily: 'var(--wisp-font-mono)',
                              fontSize: 10,
                            }}
                          >
                            {`S${si}`}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </SvgBeatGroup>

                <text
                  x={22}
                  y={198}
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
                  y={12}
                  w={656}
                  h={196}
                  title="华为昇腾 BIU 访存合并约束与片上 ND2NZ 中转通路"
                  tone="activation"
                />

                {[
                  {
                    row: 0,
                    x: 28,
                    y: 42,
                    w: 168,
                    h: 46,
                    tone: 'neutral' as AnyTone,
                    dashed: false,
                    line1: 'HBM 稀疏 Token 读取',
                    line2: '源端每行 512 B 连续',
                    bold: false,
                  },
                  {
                    row: 0,
                    x: 228,
                    y: 42,
                    w: 196,
                    h: 46,
                    tone: 'highlight' as AnyTone,
                    dashed: true,
                    line1: 'MTE2 跨步直写 L1',
                    line2: '目的步长 B_TOPK x 32 B 断开',
                    bold: false,
                  },
                  {
                    row: 0,
                    x: 456,
                    y: 42,
                    w: 196,
                    h: 46,
                    tone: 'highlight' as AnyTone,
                    dashed: false,
                    line1: 'BIU 拒绝合并事务',
                    line2: '实测 L2 带宽利用率骤降',
                    bold: true,
                  },
                  {
                    row: 1,
                    x: 28,
                    y: 118,
                    w: 168,
                    h: 48,
                    tone: 'activation' as AnyTone,
                    dashed: false,
                    line1: 'HBM 连续突发读入',
                    line2: 'MTE2 写入 192 KB UB',
                    bold: true,
                  },
                  {
                    row: 1,
                    x: 228,
                    y: 118,
                    w: 196,
                    h: 48,
                    tone: 'activation' as AnyTone,
                    dashed: false,
                    line1: '源与目的双端连续',
                    line2: 'BIU 触发满吞吐访存合并',
                    bold: true,
                  },
                  {
                    row: 1,
                    x: 456,
                    y: 118,
                    w: 196,
                    h: 48,
                    tone: 'active' as AnyTone,
                    dashed: false,
                    line1: 'Vector SIMD 转 FRACTAL_NZ',
                    line2: '再经 MTE3 连续送 L1 喂 Cube',
                    bold: true,
                  },
                ].map((box, idx) => (
                  <SvgBeatGroup key={idx} visible={box.row === 0 || beat >= 1}>
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
                  </SvgBeatGroup>
                ))}

                <DataFlowArrow
                  points={[
                    [196, 65],
                    [228, 65],
                  ]}
                  tone="highlight"
                  dashed
                  arrowEnd
                />
                <DataFlowArrow
                  points={[
                    [424, 65],
                    [456, 65],
                  ]}
                  tone="highlight"
                  dashed
                  arrowEnd
                />
                <DataFlowArrow
                  points={[
                    [196, 142],
                    [228, 142],
                  ]}
                  tone="activation"
                  active
                  visible={beat >= 1}
                  draw={beat >= 1}
                  dotToken={beat >= 1 ? dotToken : 0}
                  arrowEnd
                />
                <DataFlowArrow
                  points={[
                    [424, 142],
                    [456, 142],
                  ]}
                  tone="active"
                  active
                  visible={beat >= 1}
                  draw={beat >= 1}
                  dotToken={beat >= 1 ? dotToken : 0}
                  arrowEnd
                />

                <text
                  x={28}
                  y={190}
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
              y={220}
              w={656}
              h={154}
              dimmed={beat < 2}
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
              <SvgBeatGroup key={col.colTitle} dimmed={beat < 2}>
                <text
                  x={col.baseX + 4}
                  y={251}
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
                  const ty = 263 + ti * 26;
                  const tone = tier.active && beat >= 2 ? tier.tone : 'neutral';
                  const isActive = Boolean(tier.active && beat >= 2);
                  return (
                    <g key={tier.id}>
                      <rect
                        x={col.baseX}
                        y={ty}
                        width={308}
                        height={22}
                        rx={RADIUS_SM}
                        fill={isActive ? resolveToneFill(tone) : 'var(--wisp-surface)'}
                        stroke={isActive ? resolveToneStroke(tone) : 'var(--wisp-border)'}
                        strokeWidth={isActive ? 1.8 : 1}
                      />
                      <text
                        x={col.baseX + 10}
                        y={ty + 11}
                        dominantBaseline="central"
                        style={{
                          fill: isActive ? 'var(--wisp-fg)' : 'var(--wisp-muted)',
                          fontFamily: 'var(--wisp-font-sans)',
                          fontSize: 10.5,
                          fontWeight: isActive ? 700 : 500,
                        }}
                      >
                        {tier.label}
                      </text>
                    </g>
                  );
                })}
              </SvgBeatGroup>
            ))}

            <MetricRow
              x={12}
              y={386}
              w={656}
              h={46}
              revealed={beat >= 3}
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
    </BeatExplainer>
  );
}
