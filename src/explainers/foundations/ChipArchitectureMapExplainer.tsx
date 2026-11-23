import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
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

export interface ChipArchitectureMapState {
  stepIndex: number;
  platform: 'gpu' | 'ascend';
  focus: 'gpu_warp' | 'gpu_block' | 'gpu_chip' | 'ascend_core' | 'ascend_bus';
  rightBadge: string;
  hbmSpecTex: string;
  hbmFooter: string;
}

export function buildChipArchitectureMapSteps(): Step<ChipArchitectureMapState>[] {
  const tones: AnyTone[] = ['active', 'activation', 'highlight'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        platform: 'gpu',
        focus: 'gpu_warp',
        rightBadge: 'NVIDIA H100 SXM',
        hbmSpecTex: '$80\\;\\text{GB} \\cdot 3.35\\;\\text{TB/s}$',
        hbmFooter: '约 $400+$ 周期访问延迟；优化首要目标即削减片外 HBM 往返并提高命中复用',
      },
      caption:
        'NVIDIA GPU 的最小执行单位是单个 Thread（线程），相邻 $32$ 个线程（$T_0\\dots T_{31}$）组成一个硬件锁步调度的 Warp（线程束），同一个时钟周期执行相同指令、各自读取私有寄存器中的数据。',
    },
    {
      state: {
        stepIndex: 1,
        platform: 'gpu',
        focus: 'gpu_block',
        rightBadge: 'NVIDIA H100 SXM',
        hbmSpecTex: '$80\\;\\text{GB} \\cdot 3.35\\;\\text{TB/s}$',
        hbmFooter: '约 $400+$ 周期访问延迟；Thread Block 在 SM 内借 SMEM 共享输入以减少全局读回',
      },
      caption:
        '多个 Warp 聚合成 Thread Block（CTA）后整体驻留到单一物理 SM 上直至结束：同块内线程可经 SMEM 共享内存交换数据，SM 再凭 $256\\;\\text{KB}$ 寄存器堆与 $4$ 组调度器分派执行。',
    },
    {
      state: {
        stepIndex: 2,
        platform: 'gpu',
        focus: 'gpu_chip',
        rightBadge: 'NVIDIA H100 SXM',
        hbmSpecTex: '$80\\;\\text{GB} \\cdot 3.35\\;\\text{TB/s}$',
        hbmFooter:
          '全卡 $132$ 个 SM 共同面对有限 HBM 带宽；GQA 与权重分块优先命中片上 $50\\;\\text{MB}$ 的 L2 Cache',
      },
      caption:
        '上升到整芯视角，全卡共有 $132$ 个同类 SM 并行消耗 Grid 中独立的 Thread Block，跨 SM 的公共权重与 GQA 键值经 $50\\;\\text{MB}$ 硬件 L2 Cache 汇总复用，未命中的数据再穿过总线落回片外 HBM。',
    },
    {
      state: {
        stepIndex: 3,
        platform: 'ascend',
        focus: 'ascend_core',
        rightBadge: '华为昇腾 1C2V',
        hbmSpecTex: '显式 MTE2/3 · 无透明 L1',
        hbmFooter: '核内不设透明硬件 L1 Cache，程序员须按 192 KB UB 与 256 KB L0C 容量显式编排分块',
      },
      caption:
        '切换至华为昇腾 DaVinci AI Core（$1\\text{C}2\\text{V}$ 簇）：芯片取消数十个锁步 Warp 池，改为由 Scalar 核向 $1$ 个 $16\\times 16\\times 16$ Cube 脉动阵列与 $2$ 个各自独占 $192\\;\\text{KB}$ UB 的长向量 Vector 核下发异步指令。',
    },
    {
      state: {
        stepIndex: 4,
        platform: 'ascend',
        focus: 'ascend_bus',
        rightBadge: '华为昇腾 1C2V',
        hbmSpecTex: '共享 L2：$\\sim 5\\;\\text{TB/s}$ · FRACTAL_NZ',
        hbmFooter:
          'BIU 仅在源与目的地址双端连续时合并访存，稀疏场景先经 MTE2 入 UB 转分形再喂入 Cube',
      },
      caption:
        '昇腾全芯的数据搬运完全由软件显式控制：MTE2 从 HBM/L2 拉数进入 L1 与 UB，MTE1 馈送 L0A/L0B 喂饱 Cube 累加至 L0C，再由 FixPipe 迁往双 AIV 的 UB 完成归约并经 MTE3 写回片外 HBM。',
    },
  ];
}

export default function ChipArchitectureMapExplainer({
  title = '图 1：芯片级执行模型与物理硬件映射（NVIDIA H100 GPU vs 华为昇腾 1C2V NPU）',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildChipArchitectureMapSteps(), []);
  const { highlightTransition } = useDiagramMotion();

  return (
    <Explainer steps={steps} title={title} label="芯片级执行模型与物理硬件嵌套地图">
      {(step) => {
        const s = step.state;
        const isGpu = s.platform === 'gpu';
        const dieTone: AnyTone = s.focus === 'ascend_bus' ? 'activation' : 'neutral';

        const breadcrumbs = isGpu
          ? [
              {
                id: 't',
                label: 'Thread',
                tone: 'active' as AnyTone,
                on: s.focus === 'gpu_warp',
                x: 14,
                w: 68,
              },
              {
                id: 'w',
                label: 'Warp (32)',
                tone: 'active' as AnyTone,
                on: s.focus === 'gpu_warp',
                x: 98,
                w: 86,
              },
              {
                id: 'b',
                label: 'Block (CTA)',
                tone: 'active' as AnyTone,
                on: s.focus === 'gpu_block',
                x: 200,
                w: 92,
              },
              {
                id: 's',
                label: 'SM ×132',
                tone: 'activation' as AnyTone,
                on: s.focus === 'gpu_block' || s.focus === 'gpu_chip',
                x: 308,
                w: 80,
              },
              {
                id: 'm',
                label: 'L2 / HBM',
                tone: 'highlight' as AnyTone,
                on: s.focus === 'gpu_chip',
                x: 404,
                w: 88,
              },
            ]
          : [
              {
                id: 'sc',
                label: 'Scalar 核',
                tone: 'activation' as AnyTone,
                on: s.focus === 'ascend_core',
                x: 14,
                w: 84,
              },
              {
                id: 'cv',
                label: 'Cube + 2×AIV',
                tone: 'active' as AnyTone,
                on: s.focus === 'ascend_core',
                x: 114,
                w: 114,
              },
              {
                id: 'aic',
                label: 'AI Core (1C2V)',
                tone: 'activation' as AnyTone,
                on: s.focus === 'ascend_core' || s.focus === 'ascend_bus',
                x: 244,
                w: 112,
              },
              {
                id: 'bus',
                label: 'MTE / L2 / HBM',
                tone: 'highlight' as AnyTone,
                on: s.focus === 'ascend_bus',
                x: 372,
                w: 116,
              },
            ];

        return (
          <Stage width={STAGE_W} height={556} label="GPU SM 与昇腾 AI Core 芯片物理与执行层级图">
            {/* 1. Top hierarchy breadcrumb pills */}
            {breadcrumbs.map((b, bi) => {
              const stroke = b.on ? resolveToneStroke(b.tone) : 'var(--wisp-border)';
              const fill = b.on ? resolveToneFill(b.tone) : 'var(--wisp-surface)';
              return (
                <g key={b.id}>
                  <motion.rect
                    x={b.x}
                    y={10}
                    width={b.w}
                    height={24}
                    rx={RADIUS}
                    fill={fill}
                    stroke={stroke}
                    initial={false}
                    animate={{ strokeWidth: b.on ? 1.8 : 1 }}
                    transition={highlightTransition}
                  />
                  <circle
                    cx={b.x + 11}
                    cy={22}
                    r={3.5}
                    fill={b.on ? resolveToneStroke(b.tone) : 'var(--wisp-muted)'}
                  />
                  <text
                    x={b.x + 20}
                    y={22}
                    dominantBaseline="central"
                    style={{
                      fill: b.on ? 'var(--wisp-fg)' : 'var(--wisp-muted)',
                      fontFamily: 'var(--wisp-font-sans)',
                      fontSize: 11,
                      fontWeight: b.on ? 700 : 500,
                    }}
                  >
                    {b.label}
                  </text>
                  {bi < breadcrumbs.length - 1 && (
                    <text
                      x={b.x + b.w + 8}
                      y={22}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fill: 'var(--wisp-muted)',
                        fontFamily: 'var(--wisp-font-sans)',
                        fontSize: 12,
                      }}
                    >
                      →
                    </text>
                  )}
                </g>
              );
            })}

            {/* Right architecture pill */}
            <rect
              x={542}
              y={10}
              width={126}
              height={24}
              rx={RADIUS}
              fill={isGpu ? resolveToneFill('active') : resolveToneFill('activation')}
              stroke={isGpu ? resolveToneStroke('active') : resolveToneStroke('activation')}
              strokeWidth={1.3}
            />
            <text
              x={605}
              y={22}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-fg)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {s.rightBadge}
            </text>

            {/* 2. ON-CHIP SILICON DIE OUTER BOX */}
            <rect
              x={12}
              y={42}
              width={656}
              height={384}
              rx={RADIUS}
              fill="var(--wisp-surface)"
              fillOpacity={0.28}
              stroke={dieTone === 'neutral' ? 'var(--wisp-border)' : resolveToneStroke(dieTone)}
              strokeWidth={1.2}
              strokeDasharray="5 4"
            />
            <rect
              x={22}
              y={51}
              width={62}
              height={17}
              rx={RADIUS_SM}
              fill="var(--wisp-surface-2)"
              stroke="var(--wisp-border)"
              strokeWidth={1}
            />
            <text
              x={53}
              y={59.5}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 9.5,
                fontWeight: 700,
              }}
            >
              ON-CHIP
            </text>
            <text
              x={92}
              y={59.5}
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {isGpu ? 'GPU DIE（片上硅片）' : 'NPU DIE（达芬奇架构片上硅片）'}
            </text>

            {isGpu ? (
              <g>
                {/* Left Expanded SM 0 */}
                {(() => {
                  const smActive = s.focus === 'gpu_block' || s.focus === 'gpu_chip';
                  return (
                    <g>
                      <rect
                        x={24}
                        y={76}
                        width={366}
                        height={290}
                        rx={RADIUS}
                        fill="var(--wisp-bg)"
                        stroke={resolveToneStroke(smActive ? 'activation' : 'neutral')}
                        strokeWidth={smActive ? 2 : 1.3}
                      />
                      <text
                        x={34}
                        y={90}
                        dominantBaseline="central"
                        style={{
                          fill: resolveToneStroke('activation'),
                          fontFamily: 'var(--wisp-font-sans)',
                          fontSize: 11.5,
                          fontWeight: 700,
                        }}
                      >
                        SM 0 核心计算单元（含 4 个硬件处理块）
                      </text>

                      {/* Thread Block 0 */}
                      {(() => {
                        const blkActive = s.focus === 'gpu_block';
                        const warpActive = s.focus === 'gpu_warp';
                        return (
                          <g>
                            <rect
                              x={34}
                              y={102}
                              width={346}
                              height={140}
                              rx={RADIUS}
                              fill={blkActive ? resolveToneFill('active') : 'var(--wisp-surface)'}
                              fillOpacity={blkActive ? 0.35 : 0.45}
                              stroke={resolveToneStroke(
                                blkActive || warpActive ? 'active' : 'neutral',
                              )}
                              strokeWidth={blkActive ? 2 : 1.3}
                            />
                            <text
                              x={44}
                              y={114}
                              dominantBaseline="central"
                              style={{
                                fill: resolveToneStroke('active'),
                                fontFamily: 'var(--wisp-font-sans)',
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              Thread Block 0 / CTA（共享 SMEM，块内同步）
                            </text>

                            {/* Warp 0 with 32 literal thread boxes 0..31 */}
                            <rect
                              x={44}
                              y={124}
                              width={326}
                              height={66}
                              rx={RADIUS_SM}
                              fill={warpActive ? resolveToneFill('active') : 'var(--wisp-bg)'}
                              fillOpacity={warpActive ? 0.45 : 0.9}
                              stroke={resolveToneStroke(warpActive ? 'active' : 'neutral')}
                              strokeWidth={warpActive ? 1.8 : 1.1}
                              strokeDasharray={warpActive ? undefined : '4 2'}
                            />
                            <text
                              x={54}
                              y={134}
                              dominantBaseline="central"
                              style={{
                                fill: 'var(--wisp-fg)',
                                fontFamily: 'var(--wisp-font-sans)',
                                fontSize: 10,
                                fontWeight: warpActive ? 700 : 600,
                              }}
                            >
                              Warp 0 · 32 threads，SIMT 同周期锁步执行
                            </text>

                            {Array.from({ length: 32 }, (_, tid) => {
                              const row = Math.floor(tid / 16);
                              const col = tid % 16;
                              const cx = 56 + col * 19;
                              const cy = 144 + row * 19;
                              return (
                                <g key={tid}>
                                  <rect
                                    x={cx}
                                    y={cy}
                                    width={17}
                                    height={16}
                                    rx={RADIUS_SM}
                                    fill={
                                      warpActive ? resolveToneFill('active') : 'var(--wisp-surface)'
                                    }
                                    stroke={resolveToneStroke(warpActive ? 'active' : 'neutral')}
                                    strokeWidth={warpActive ? 1.3 : 0.9}
                                  />
                                  <text
                                    x={cx + 8.5}
                                    y={cy + 8}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    style={{
                                      fill: warpActive ? 'var(--wisp-fg)' : 'var(--wisp-muted)',
                                      fontFamily: 'var(--wisp-font-mono)',
                                      fontSize: 8.5,
                                      fontWeight: warpActive ? 700 : 500,
                                    }}
                                  >
                                    {tid}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Warp 1 collapsed */}
                            <rect
                              x={44}
                              y={195}
                              width={326}
                              height={22}
                              rx={RADIUS_SM}
                              fill="var(--wisp-bg)"
                              stroke="var(--wisp-border)"
                              strokeWidth={1}
                              strokeDasharray="4 3"
                            />
                            <text
                              x={54}
                              y={206}
                              dominantBaseline="central"
                              style={{
                                fill: 'var(--wisp-muted)',
                                fontFamily: 'var(--wisp-font-sans)',
                                fontSize: 10.5,
                              }}
                            >
                              Warp 1 · 32 threads（独立指令流，就绪可 0 拍切入）
                            </text>

                            <text
                              x={207}
                              y={229}
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{
                                fill: 'var(--wisp-muted)',
                                fontFamily: 'var(--wisp-font-sans)',
                                fontSize: 10,
                              }}
                            >
                              ⋮ 单块至多 32 Warps（1024 线程） · 单 SM 至多 64 Warps
                            </text>
                          </g>
                        );
                      })()}

                      {/* Thread Block 1 */}
                      <rect
                        x={34}
                        y={248}
                        width={346}
                        height={24}
                        rx={RADIUS_SM}
                        fill={
                          s.focus === 'gpu_block'
                            ? resolveToneFill('active')
                            : 'var(--wisp-surface)'
                        }
                        fillOpacity={s.focus === 'gpu_block' ? 0.45 : 0.7}
                        stroke={resolveToneStroke(s.focus === 'gpu_block' ? 'active' : 'neutral')}
                        strokeWidth={1.1}
                        strokeDasharray="4 3"
                      />
                      <text
                        x={44}
                        y={260}
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-fg)',
                          fontFamily: 'var(--wisp-font-sans)',
                          fontSize: 10.5,
                        }}
                      >
                        Thread Block 1 · 资源余量充足时与 Block 0 同驻该 SM
                      </text>

                      {/* 4 SM Hardware unit cards */}
                      {[
                        { t1: 'Register file', t2: '256 KB/SM', t3: '每线程私有' },
                        { t1: 'Shared mem', t2: '上限 228 KB', t3: '块内显式共享' },
                        { t1: 'L1 cache', t2: '共用 256 KB 池', t3: '硬件自动缓存' },
                        { t1: 'Warp sched.', t2: '4 个调度器', t3: '每拍发射就绪' },
                      ].map((u, ui) => {
                        const ux = 34 + ui * 88;
                        const lit = s.focus === 'gpu_block' || s.focus === 'gpu_chip';
                        return (
                          <g key={u.t1}>
                            <rect
                              x={ux}
                              y={280}
                              width={82}
                              height={76}
                              rx={RADIUS_SM}
                              fill={lit ? resolveToneFill('activation') : 'var(--wisp-surface)'}
                              fillOpacity={lit ? 0.5 : 0.85}
                              stroke={resolveToneStroke(lit ? 'activation' : 'neutral')}
                              strokeWidth={lit ? 1.4 : 1}
                            />
                            <text
                              x={ux + 41}
                              y={297}
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{
                                fill: 'var(--wisp-fg)',
                                fontFamily: 'var(--wisp-font-sans)',
                                fontSize: 10.5,
                                fontWeight: 700,
                              }}
                            >
                              {u.t1}
                            </text>
                            <text
                              x={ux + 41}
                              y={318}
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{
                                fill: resolveToneStroke('activation'),
                                fontFamily: 'var(--wisp-font-mono)',
                                fontSize: 9.5,
                                fontWeight: 600,
                              }}
                            >
                              {u.t2}
                            </text>
                            <text
                              x={ux + 41}
                              y={338}
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{
                                fill: 'var(--wisp-muted)',
                                fontFamily: 'var(--wisp-font-sans)',
                                fontSize: 9.5,
                              }}
                            >
                              {u.t3}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}

                {/* Collapsed Sibling SMs 1..3 */}
                {[
                  { id: 'SM 1', blk: 'Thread Block 2', y: 76 },
                  { id: 'SM 2', blk: 'Thread Block 3', y: 176 },
                  { id: 'SM 3', blk: 'Thread Block 4', y: 276 },
                ].map((sm) => {
                  const chipOn = s.focus === 'gpu_chip';
                  return (
                    <g key={sm.id}>
                      <rect
                        x={402}
                        y={sm.y}
                        width={186}
                        height={90}
                        rx={RADIUS}
                        fill="var(--wisp-bg)"
                        stroke={resolveToneStroke(chipOn ? 'activation' : 'neutral')}
                        strokeWidth={chipOn ? 1.8 : 1.1}
                      />
                      <text
                        x={412}
                        y={sm.y + 16}
                        dominantBaseline="central"
                        style={{
                          fill: resolveToneStroke(chipOn ? 'activation' : 'neutral'),
                          fontFamily: 'var(--wisp-font-mono)',
                          fontSize: 11.5,
                          fontWeight: 700,
                        }}
                      >
                        {sm.id}
                      </text>
                      <rect
                        x={412}
                        y={sm.y + 28}
                        width={166}
                        height={24}
                        rx={RADIUS_SM}
                        fill="var(--wisp-surface)"
                        stroke={resolveToneStroke('active')}
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                      <text
                        x={495}
                        y={sm.y + 40}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-fg)',
                          fontFamily: 'var(--wisp-font-sans)',
                          fontSize: 10.5,
                        }}
                      >
                        {sm.blk}
                      </text>
                      <rect
                        x={412}
                        y={sm.y + 58}
                        width={166}
                        height={22}
                        rx={RADIUS_SM}
                        fill={resolveToneFill('activation')}
                        fillOpacity={0.35}
                        stroke="var(--wisp-border)"
                        strokeWidth={1}
                      />
                      <text
                        x={495}
                        y={sm.y + 69}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-muted)',
                          fontFamily: 'var(--wisp-font-sans)',
                          fontSize: 9.5,
                        }}
                      >
                        Reg · SMEM · L1 · 调度器
                      </text>
                    </g>
                  );
                })}

                {/* Far-right 132 SM scale indicator */}
                {[196, 206, 216].map((cy) => (
                  <circle key={cy} cx={628} cy={cy} r={2.5} fill="var(--wisp-muted)" />
                ))}
                <text
                  x={628}
                  y={236}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 10.5,
                    fontWeight: 600,
                  }}
                >
                  至多 132
                </text>
                <text
                  x={628}
                  y={251}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 10,
                  }}
                >
                  SMs (H100)
                </text>

                {/* L2 Cache bar */}
                <rect
                  x={24}
                  y={376}
                  width={632}
                  height={40}
                  rx={RADIUS}
                  fill={s.focus === 'gpu_chip' ? resolveToneFill('highlight') : 'var(--wisp-bg)'}
                  stroke={resolveToneStroke('highlight')}
                  strokeWidth={s.focus === 'gpu_chip' ? 2 : 1.3}
                />
                <text
                  x={38}
                  y={396}
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  L2 Cache · 50 MB（全卡 SM 共享 · 硬件自动管理 · 复用权重与 GQA 键值 · ~200 周期）
                </text>
              </g>
            ) : (
              <g>
                {/* Left Expanded Ascend AI Core 0 (1C2V) */}
                <rect
                  x={24}
                  y={76}
                  width={380}
                  height={290}
                  rx={RADIUS}
                  fill="var(--wisp-bg)"
                  stroke={resolveToneStroke('activation')}
                  strokeWidth={s.focus === 'ascend_core' ? 2 : 1.4}
                />
                <text
                  x={34}
                  y={90}
                  dominantBaseline="central"
                  style={{
                    fill: resolveToneStroke('activation'),
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  AI Core 0 · 达芬奇 1C2V 异构执行簇（1 Cube + 2 Vector）
                </text>

                {/* Scalar control bar */}
                <rect
                  x={34}
                  y={101}
                  width={360}
                  height={24}
                  rx={RADIUS_SM}
                  fill={
                    s.focus === 'ascend_core'
                      ? resolveToneFill('activation')
                      : 'var(--wisp-surface)'
                  }
                  stroke={resolveToneStroke('activation')}
                  strokeWidth={1.2}
                />
                <text
                  x={214}
                  y={113}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 10.5,
                    fontWeight: 600,
                  }}
                >
                  Scalar 控制核 · 译码并向 MTE / Cube / Vector 写入异步队列
                </text>

                {/* Left 1x Cube Unit with 4x4 literal MAC systolic array */}
                <rect
                  x={34}
                  y={132}
                  width={174}
                  height={176}
                  rx={RADIUS_SM}
                  fill="var(--wisp-surface)"
                  fillOpacity={0.55}
                  stroke={resolveToneStroke('active')}
                  strokeWidth={s.focus === 'ascend_core' ? 1.6 : 1.1}
                />
                <text
                  x={42}
                  y={144}
                  dominantBaseline="central"
                  style={{
                    fill: resolveToneStroke('active'),
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 10.5,
                    fontWeight: 700,
                  }}
                >
                  1× Cube 矩阵核 (16×16×16)
                </text>

                {/* L0B top strip & L0A left strip flanking 4x4 MAC systolic array */}
                <rect
                  x={72}
                  y={154}
                  width={126}
                  height={16}
                  rx={RADIUS_SM}
                  fill={resolveToneFill('active')}
                  stroke={resolveToneStroke('active')}
                  strokeWidth={1}
                />
                <text
                  x={135}
                  y={162}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 9.5,
                    fontWeight: 600,
                  }}
                >
                  L0B 64 KB（FRACTAL_NZ）
                </text>

                <rect
                  x={42}
                  y={174}
                  width={26}
                  height={58}
                  rx={RADIUS_SM}
                  fill={resolveToneFill('active')}
                  stroke={resolveToneStroke('active')}
                  strokeWidth={1}
                />
                <text
                  x={55}
                  y={203}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 9.5,
                    fontWeight: 600,
                  }}
                >
                  L0A
                </text>

                {/* 4x4 MAC cells */}
                {Array.from({ length: 16 }, (_, idx) => {
                  const r = Math.floor(idx / 4);
                  const c = idx % 4;
                  const mx = 72 + c * 32;
                  const my = 174 + r * 15;
                  return (
                    <g key={idx}>
                      <rect
                        x={mx}
                        y={my}
                        width={30}
                        height={13}
                        rx={1}
                        fill={resolveToneFill('active')}
                        stroke={resolveToneStroke('active')}
                        strokeWidth={1}
                      />
                      <text
                        x={mx + 15}
                        y={my + 6.5}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-fg)',
                          fontFamily: 'var(--wisp-font-mono)',
                          fontSize: 7.5,
                          fontWeight: 600,
                        }}
                      >
                        MAC
                      </text>
                    </g>
                  );
                })}

                {/* L1 Buffer & L0C Accumulator */}
                <rect
                  x={42}
                  y={240}
                  width={68}
                  height={28}
                  rx={RADIUS_SM}
                  fill={s.focus === 'ascend_bus' ? resolveToneFill('activation') : 'var(--wisp-bg)'}
                  stroke={resolveToneStroke('activation')}
                  strokeWidth={1.1}
                />
                <text
                  x={76}
                  y={254}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 9.5,
                    fontWeight: 600,
                  }}
                >
                  L1 Buffer
                </text>

                <rect
                  x={116}
                  y={240}
                  width={84}
                  height={28}
                  rx={RADIUS_SM}
                  fill={resolveToneFill('highlight')}
                  stroke={resolveToneStroke('highlight')}
                  strokeWidth={1.1}
                />
                <text
                  x={158}
                  y={254}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 9.5,
                    fontWeight: 600,
                  }}
                >
                  L0C 256 KB
                </text>

                <text
                  x={121}
                  y={288}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 9.5,
                  }}
                >
                  FP32 累加 · 须经 FixPipe 迁出
                </text>

                {/* Right 2x Vector Cores (AIV 0 & AIV 1) with literal SIMD lanes + UB 192 KB */}
                <rect
                  x={216}
                  y={132}
                  width={178}
                  height={176}
                  rx={RADIUS_SM}
                  fill="var(--wisp-surface)"
                  fillOpacity={0.55}
                  stroke={resolveToneStroke('activation')}
                  strokeWidth={s.focus === 'ascend_core' ? 1.6 : 1.1}
                />
                <text
                  x={224}
                  y={144}
                  dominantBaseline="central"
                  style={{
                    fill: resolveToneStroke('activation'),
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 10.5,
                    fontWeight: 700,
                  }}
                >
                  2× Vector 向量核（1C2V）
                </text>

                {[0, 1].map((aivIdx) => {
                  const ay = 154 + aivIdx * 76;
                  return (
                    <g key={aivIdx}>
                      <rect
                        x={222}
                        y={ay}
                        width={166}
                        height={70}
                        rx={RADIUS_SM}
                        fill="var(--wisp-bg)"
                        stroke={resolveToneStroke('activation')}
                        strokeWidth={1.1}
                      />
                      <text
                        x={230}
                        y={ay + 11}
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-fg)',
                          fontFamily: 'var(--wisp-font-sans)',
                          fontSize: 9.5,
                          fontWeight: 700,
                        }}
                      >
                        {`AIV ${aivIdx} · SIMD 长向量单元`}
                      </text>
                      {/* 8 SIMD vector lanes */}
                      {Array.from({ length: 8 }, (_, lane) => {
                        const lx = 230 + lane * 19;
                        return (
                          <g key={lane}>
                            <rect
                              x={lx}
                              y={ay + 20}
                              width={17}
                              height={18}
                              rx={1}
                              fill={resolveToneFill('activation')}
                              stroke={resolveToneStroke('activation')}
                              strokeWidth={0.9}
                            />
                            <text
                              x={lx + 8.5}
                              y={ay + 29}
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{
                                fill: 'var(--wisp-fg)',
                                fontFamily: 'var(--wisp-font-mono)',
                                fontSize: 7.5,
                              }}
                            >
                              {`V${lane}`}
                            </text>
                          </g>
                        );
                      })}
                      {/* Dedicated UB 192 KB */}
                      <rect
                        x={230}
                        y={ay + 43}
                        width={150}
                        height={20}
                        rx={RADIUS_SM}
                        fill={
                          s.focus === 'ascend_bus'
                            ? resolveToneFill('highlight')
                            : resolveToneFill('activation')
                        }
                        fillOpacity={0.45}
                        stroke={resolveToneStroke(
                          s.focus === 'ascend_bus' ? 'highlight' : 'activation',
                        )}
                        strokeWidth={1.1}
                      />
                      <text
                        x={305}
                        y={ay + 53}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-fg)',
                          fontFamily: 'var(--wisp-font-mono)',
                          fontSize: 9.5,
                          fontWeight: 600,
                        }}
                      >
                        UB 192 KB（显式指令管理）
                      </text>
                    </g>
                  );
                })}

                {/* 4 Explicit DMA / Data Pipes */}
                {[
                  { id: 'MTE2', sub: 'HBM→L1/UB', tone: 'highlight' as AnyTone },
                  { id: 'MTE1', sub: 'L1→L0A/B', tone: 'active' as AnyTone },
                  { id: 'FixPipe', sub: 'L0C→UB', tone: 'activation' as AnyTone },
                  { id: 'MTE3', sub: 'UB→HBM', tone: 'highlight' as AnyTone },
                ].map((m, mi) => {
                  const mx = 34 + mi * 91;
                  const lit = s.focus === 'ascend_bus';
                  return (
                    <g key={m.id}>
                      <rect
                        x={mx}
                        y={316}
                        width={86}
                        height={40}
                        rx={RADIUS_SM}
                        fill={lit ? resolveToneFill(m.tone) : 'var(--wisp-surface)'}
                        stroke={resolveToneStroke(lit ? m.tone : 'neutral')}
                        strokeWidth={lit ? 1.6 : 1}
                      />
                      <text
                        x={mx + 43}
                        y={330}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-fg)',
                          fontFamily: 'var(--wisp-font-mono)',
                          fontSize: 10.5,
                          fontWeight: 700,
                        }}
                      >
                        {m.id}
                      </text>
                      <text
                        x={mx + 43}
                        y={346}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-muted)',
                          fontFamily: 'var(--wisp-font-mono)',
                          fontSize: 9,
                        }}
                      >
                        {m.sub}
                      </text>
                    </g>
                  );
                })}

                {/* Collapsed Sibling AI Cores 1..3 */}
                {[1, 2, 3].map((ci) => {
                  const ay = 76 + (ci - 1) * 100;
                  return (
                    <g key={ci}>
                      <rect
                        x={414}
                        y={ay}
                        width={174}
                        height={90}
                        rx={RADIUS}
                        fill="var(--wisp-bg)"
                        stroke="var(--wisp-border)"
                        strokeWidth={1.1}
                      />
                      <text
                        x={424}
                        y={ay + 16}
                        dominantBaseline="central"
                        style={{
                          fill: resolveToneStroke('activation'),
                          fontFamily: 'var(--wisp-font-mono)',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {`AI Core ${ci} (1C2V)`}
                      </text>
                      <rect
                        x={424}
                        y={ay + 28}
                        width={154}
                        height={24}
                        rx={RADIUS_SM}
                        fill="var(--wisp-surface)"
                        stroke={resolveToneStroke('activation')}
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                      <text
                        x={501}
                        y={ay + 40}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-fg)',
                          fontFamily: 'var(--wisp-font-sans)',
                          fontSize: 10,
                        }}
                      >
                        {`Cube + AIV×2 · Block ${ci}`}
                      </text>
                      <rect
                        x={424}
                        y={ay + 58}
                        width={154}
                        height={22}
                        rx={RADIUS_SM}
                        fill={resolveToneFill('activation')}
                        fillOpacity={0.35}
                        stroke="var(--wisp-border)"
                        strokeWidth={1}
                      />
                      <text
                        x={501}
                        y={ay + 69}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-muted)',
                          fontFamily: 'var(--wisp-font-mono)',
                          fontSize: 9.5,
                        }}
                      >
                        L1 · L0 · 2×UB · MTE
                      </text>
                    </g>
                  );
                })}

                {[196, 206, 216].map((cy) => (
                  <circle key={cy} cx={628} cy={cy} r={2.5} fill="var(--wisp-muted)" />
                ))}
                <text
                  x={628}
                  y={236}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 10.5,
                    fontWeight: 600,
                  }}
                >
                  多 AI Core
                </text>
                <text
                  x={628}
                  y={251}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 9.5,
                  }}
                >
                  并行计算
                </text>

                {/* Shared L2 Cache bar */}
                <rect
                  x={24}
                  y={376}
                  width={632}
                  height={40}
                  rx={RADIUS}
                  fill={s.focus === 'ascend_bus' ? resolveToneFill('highlight') : 'var(--wisp-bg)'}
                  stroke={resolveToneStroke('highlight')}
                  strokeWidth={s.focus === 'ascend_bus' ? 2 : 1.3}
                />
                <text
                  x={38}
                  y={396}
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  Shared L2 Cache · ~5 TB/s（跨核共享复用 · 仅源与目的双端连续时触发 BIU 访存合并）
                </text>
              </g>
            )}

            {/* 3. Memory Bus divider */}
            <line
              x1={12}
              y1={442}
              x2={668}
              y2={442}
              stroke="var(--wisp-border)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <rect
              x={248}
              y={431}
              width={184}
              height={22}
              rx={RADIUS_SM}
              fill="var(--wisp-bg)"
              stroke="var(--wisp-border)"
              strokeWidth={1}
            />
            <text
              x={340}
              y={442}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 10.5,
                fontWeight: 600,
              }}
            >
              {isGpu ? '↕ memory bus (32B Sector)' : '↕ MTE2 / MTE3 memory bus'}
            </text>

            {/* 4. OFF-CHIP HBM Container */}
            <rect
              x={12}
              y={458}
              width={656}
              height={88}
              rx={RADIUS}
              fill={
                s.focus === 'gpu_chip' || s.focus === 'ascend_bus'
                  ? resolveToneFill('highlight')
                  : 'var(--wisp-surface)'
              }
              fillOpacity={s.focus === 'gpu_chip' || s.focus === 'ascend_bus' ? 0.42 : 0.75}
              stroke={resolveToneStroke('highlight')}
              strokeWidth={s.focus === 'gpu_chip' || s.focus === 'ascend_bus' ? 2 : 1.3}
            />
            <rect
              x={24}
              y={467}
              width={66}
              height={17}
              rx={RADIUS_SM}
              fill={resolveToneFill('highlight')}
              stroke={resolveToneStroke('highlight')}
              strokeWidth={1}
            />
            <text
              x={57}
              y={475.5}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fill: resolveToneStroke('highlight'),
                fontFamily: 'var(--wisp-font-mono)',
                fontSize: 9.5,
                fontWeight: 700,
              }}
            >
              OFF-CHIP
            </text>
            <text
              x={98}
              y={475.5}
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-fg)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              HBM（片外主显存 / Global Memory）
            </text>

            <SvgRichLabel
              x={656}
              y={475.5}
              width={260}
              height={22}
              text={s.hbmSpecTex}
              fontSize={11}
              fontWeight={600}
              color="var(--wisp-sem-highlight)"
              anchor="end"
              family="mono"
            />

            {(isGpu
              ? ['模型权重 (ND)', 'KV Cache', '激活张量', '未融合中间缓冲']
              : ['FRACTAL_NZ 权重', 'PA / PA_NZ KV', '激活张量', '稀疏索引与缓冲']
            ).map((chip, ci) => {
              const cx = 24 + ci * 158;
              return (
                <g key={chip}>
                  <rect
                    x={cx}
                    y={493}
                    width={148}
                    height={22}
                    rx={RADIUS_SM}
                    fill={resolveToneFill('highlight')}
                    stroke={resolveToneStroke('highlight')}
                    strokeWidth={1}
                  />
                  <text
                    x={cx + 74}
                    y={504}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fill: 'var(--wisp-fg)',
                      fontFamily: 'var(--wisp-font-sans)',
                      fontSize: 10.5,
                      fontWeight: 600,
                    }}
                  >
                    {chip}
                  </text>
                </g>
              );
            })}

            <SvgRichLabel
              x={24}
              y={531}
              width={632}
              height={20}
              text={s.hbmFooter}
              fontSize={10.5}
              fontWeight={500}
              color="var(--wisp-muted)"
              anchor="start"
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
