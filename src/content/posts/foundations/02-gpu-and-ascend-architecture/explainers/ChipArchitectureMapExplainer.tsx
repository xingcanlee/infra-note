import { useMemo } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
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
  formulaTex: string;
  platform: 'gpu' | 'ascend';
  focus: 'gpu_warp' | 'gpu_block' | 'ascend_core' | 'ascend_bus';
  rightBadge: string;
  hbmSpecTex: string;
  hbmFooter: string;
}

export function buildChipArchitectureMapSteps(): Step<ChipArchitectureMapState>[] {
  const tones: AnyTone[] = ['active', 'activation', 'highlight'];
  assertMaxHues(tones);

  return [
    {
      label: 'Warp 与 SM 阵列',
      duration: 4600,
      state: {
        stepIndex: 0,
        formulaTex:
          '$1\\text{ Warp} = 32\\text{ Threads} \\;\\longleftrightarrow\\; 132\\;\\text{SMs (H100)}$',
        platform: 'gpu',
        focus: 'gpu_warp',
        rightBadge: 'NVIDIA H100 SXM',
        hbmSpecTex: '$80\\;\\text{GB} \\cdot 3.35\\;\\text{TB/s}$',
        hbmFooter: '约 $400+$ 周期片外延迟；Warp 锁步发射并由全卡 132 个 SM 并行吞吐请求',
      },
      caption:
        'NVIDIA GPU 的最小执行单位是单个 Thread（线程），相邻 $32$ 个线程（$T_0\\dots T_{31}$）组成硬件锁步调度的 Warp（线程束）；全卡共有 $132$ 个同类 SM 并行分派不同线程块。',
    },
    {
      label: 'Block 驻留片上',
      duration: 4600,
      state: {
        stepIndex: 1,
        formulaTex:
          '$1\\text{ Block} \\le 32\\text{ Warps} \\;\\mapsto\\; 228\\;\\text{KB SMEM} \\longleftrightarrow 50\\;\\text{MB L2}$',
        platform: 'gpu',
        focus: 'gpu_block',
        rightBadge: 'NVIDIA H100 SXM',
        hbmSpecTex: '$80\\;\\text{GB} \\cdot 3.35\\;\\text{TB/s}$',
        hbmFooter: 'Thread Block 驻留 SM 内借 228 KB SMEM 与 256 KB 寄存器复用数据，减少 HBM 往返',
      },
      caption:
        '多个 Warp 聚合成 Thread Block（CTA）后整体驻留到单一物理 SM 上直至结束：同块内线程借 SMEM 共享内存与 $256\\;\\text{KB}$ 寄存器交换数据，未命中部分穿过 $50\\;\\text{MB}$ L2 落回 HBM。',
    },
    {
      label: '昇腾 1C2V 核',
      duration: 4600,
      state: {
        stepIndex: 2,
        formulaTex:
          '$1\\text{ AI Core} = \\text{Scalar} + 1\\times\\text{Cube}(16^3) + 2\\times\\text{AIV}(192\\;\\text{KB UB})$',
        platform: 'ascend',
        focus: 'ascend_core',
        rightBadge: '华为昇腾 1C2V',
        hbmSpecTex: '显式 MTE2/3 · 无透明 L1',
        hbmFooter: '核内不设透明硬件 L1 Cache，程序员须按 192 KB UB 与 256 KB L0C 容量显式编排分块',
      },
      caption:
        '切换至华为昇腾 DaVinci AI Core（$1\\text{C}2\\text{V}$ 簇）：芯片取消数十个锁步 Warp 池，改为由 Scalar 控制核向 $1$ 个 $16\\times 16\\times 16$ Cube 脉动阵列与 $2$ 个各自独占 $192\\;\\text{KB}$ UB 的长向量 Vector 核派发异步任务。',
    },
    {
      label: 'MTE 搬运数据环',
      duration: 4600,
      state: {
        stepIndex: 3,
        formulaTex:
          '$\\text{HBM}\\xrightarrow{\\text{MTE2}}\\text{L1}\\xrightarrow{\\text{MTE1}}\\text{Cube}\\xrightarrow{\\text{Fix}}\\text{UB}\\xrightarrow{\\text{MTE3}}\\text{HBM}$',
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
    <BeatExplainer
      steps={steps}
      title={title}
      label="芯片级执行模型与物理硬件嵌套地图"
      stageMinHeight={652}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { dotToken }) => {
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
                on: s.focus === 'gpu_warp' || s.focus === 'gpu_block',
                x: 308,
                w: 80,
              },
              {
                id: 'm',
                label: 'L2 / HBM',
                tone: 'highlight' as AnyTone,
                on: s.focus === 'gpu_block',
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
                fontSize: 10,
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
                {(() => {
                  const smActive = s.focus === 'gpu_block' || s.focus === 'gpu_warp';
                  const blkActive = s.focus === 'gpu_block';
                  const warpActive = s.focus === 'gpu_warp';
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
                        strokeWidth={blkActive ? 2 : 1.4}
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

                      <rect
                        x={34}
                        y={102}
                        width={346}
                        height={140}
                        rx={RADIUS}
                        fill={blkActive ? resolveToneFill('active') : 'var(--wisp-surface)'}
                        fillOpacity={blkActive ? 0.35 : 0.45}
                        stroke={resolveToneStroke(blkActive || warpActive ? 'active' : 'neutral')}
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
                              fill={warpActive ? resolveToneFill('active') : 'var(--wisp-surface)'}
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
                                fontSize: 10,
                                fontWeight: warpActive ? 700 : 500,
                              }}
                            >
                              {tid}
                            </text>
                          </g>
                        );
                      })}

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

                      <rect
                        x={34}
                        y={248}
                        width={346}
                        height={24}
                        rx={RADIUS_SM}
                        fill={blkActive ? resolveToneFill('active') : 'var(--wisp-surface)'}
                        fillOpacity={blkActive ? 0.45 : 0.7}
                        stroke={resolveToneStroke(blkActive ? 'active' : 'neutral')}
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

                      {[
                        { t1: 'Register file', t2: '256 KB/SM', t3: '每线程私有' },
                        { t1: 'Shared mem', t2: '上限 228 KB', t3: '块内显式共享' },
                        { t1: 'L1 cache', t2: '共用 256 KB 池', t3: '硬件自动缓存' },
                        { t1: 'Warp sched.', t2: '4 个调度器', t3: '每拍发射就绪' },
                      ].map((u, ui) => {
                        const ux = 34 + ui * 88;
                        const lit = blkActive;
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
                              strokeWidth={lit ? 1.5 : 1}
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
                                fontSize: 10,
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
                                fontSize: 10,
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

                {[
                  { id: 'SM 1', blk: 'Thread Block 2', y: 76 },
                  { id: 'SM 2', blk: 'Thread Block 3', y: 176 },
                  { id: 'SM 3', blk: 'Thread Block 4', y: 276 },
                ].map((sm) => {
                  const chipOn = s.focus === 'gpu_warp' || s.focus === 'gpu_block';
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
                        strokeWidth={s.focus === 'gpu_warp' ? 1.7 : 1.1}
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
                          fontSize: 10,
                        }}
                      >
                        Reg · SMEM · L1 · 调度器
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

                <rect
                  x={24}
                  y={376}
                  width={632}
                  height={40}
                  rx={RADIUS}
                  fill={s.focus === 'gpu_block' ? resolveToneFill('highlight') : 'var(--wisp-bg)'}
                  stroke={resolveToneStroke('highlight')}
                  strokeWidth={s.focus === 'gpu_block' ? 2 : 1.3}
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

                {/* GPU 数据流脉冲：HBM -> L2 -> SMEM / SM 阵列 */}
                <DataFlowArrow
                  points={[
                    [164, 458],
                    [164, 416],
                  ]}
                  tone="highlight"
                  active
                  flow
                  continuous
                  draw
                  dotToken={dotToken}
                  arrowEnd
                />
                <DataFlowArrow
                  points={[
                    [164, 376],
                    [164, 356],
                  ]}
                  tone="activation"
                  active={s.focus === 'gpu_block'}
                  flow={s.focus === 'gpu_block'}
                  continuous
                  draw
                  dotToken={dotToken}
                  arrowEnd
                />
                <DataFlowArrow
                  points={[
                    [495, 376],
                    [495, 366],
                  ]}
                  tone="activation"
                  active
                  flow
                  continuous
                  draw
                  dotToken={dotToken}
                  arrowEnd
                />
              </g>
            ) : (
              <g>
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
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  L0B 64 KB (NZ)
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
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  L0A
                </text>

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
                        rx={0}
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
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        MAC
                      </text>
                    </g>
                  );
                })}

                <rect
                  x={42}
                  y={244}
                  width={68}
                  height={24}
                  rx={RADIUS_SM}
                  fill={s.focus === 'ascend_bus' ? resolveToneFill('activation') : 'var(--wisp-bg)'}
                  stroke={resolveToneStroke('activation')}
                  strokeWidth={1.1}
                />
                <text
                  x={76}
                  y={256}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  L1 Buf
                </text>

                <rect
                  x={116}
                  y={244}
                  width={84}
                  height={24}
                  rx={RADIUS_SM}
                  fill={resolveToneFill('highlight')}
                  stroke={resolveToneStroke('highlight')}
                  strokeWidth={1.1}
                />
                <text
                  x={158}
                  y={256}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-fg)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 10,
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
                    fontSize: 10,
                  }}
                >
                  FP32 累加 · 须经 FixPipe 迁出
                </text>

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
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {`AIV ${aivIdx} · SIMD 长向量单元`}
                      </text>
                      {Array.from({ length: 8 }, (_, lane) => {
                        const lx = 230 + lane * 19;
                        return (
                          <g key={lane}>
                            <rect
                              x={lx}
                              y={ay + 20}
                              width={17}
                              height={18}
                              rx={0}
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
                                fontSize: 10,
                              }}
                            >
                              {`V${lane}`}
                            </text>
                          </g>
                        );
                      })}
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
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        UB 192 KB (显式调度)
                      </text>
                    </g>
                  );
                })}

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
                          fontSize: 10,
                        }}
                      >
                        {m.sub}
                      </text>
                    </g>
                  );
                })}

                {s.focus === 'ascend_core' && (
                  <g>
                    <DataFlowArrow
                      points={[
                        [121, 125],
                        [121, 134],
                      ]}
                      tone="activation"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                    <DataFlowArrow
                      points={[
                        [305, 125],
                        [305, 134],
                      ]}
                      tone="activation"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                  </g>
                )}

                {s.focus === 'ascend_bus' && (
                  <g>
                    <DataFlowArrow
                      points={[
                        [77, 458],
                        [77, 416],
                      ]}
                      tone="highlight"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                    <DataFlowArrow
                      points={[
                        [77, 376],
                        [77, 356],
                      ]}
                      tone="highlight"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                    <DataFlowArrow
                      points={[
                        [77, 316],
                        [77, 268],
                      ]}
                      tone="highlight"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                    <DataFlowArrow
                      points={[
                        [55, 244],
                        [55, 232],
                      ]}
                      tone="active"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                    <DataFlowArrow
                      points={[
                        [158, 232],
                        [158, 244],
                      ]}
                      tone="active"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                    <DataFlowArrow
                      points={[
                        [200, 256],
                        [216, 256],
                        [216, 283],
                        [230, 283],
                      ]}
                      tone="activation"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                    <DataFlowArrow
                      points={[
                        [350, 293],
                        [350, 316],
                      ]}
                      tone="highlight"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                    <DataFlowArrow
                      points={[
                        [350, 356],
                        [350, 376],
                      ]}
                      tone="highlight"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                    <DataFlowArrow
                      points={[
                        [350, 416],
                        [350, 458],
                      ]}
                      tone="highlight"
                      active
                      flow
                      continuous
                      draw
                      dotToken={dotToken}
                      arrowEnd
                    />
                  </g>
                )}

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
                          fontSize: 10,
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
                    fontSize: 10,
                  }}
                >
                  并行计算
                </text>

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

            <rect
              x={12}
              y={458}
              width={656}
              height={88}
              rx={RADIUS}
              fill={
                s.focus === 'gpu_block' || s.focus === 'ascend_bus'
                  ? resolveToneFill('highlight')
                  : 'var(--wisp-surface)'
              }
              fillOpacity={s.focus === 'gpu_block' || s.focus === 'ascend_bus' ? 0.42 : 0.75}
              stroke={resolveToneStroke('highlight')}
              strokeWidth={s.focus === 'gpu_block' || s.focus === 'ascend_bus' ? 2 : 1.3}
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
                fontSize: 10,
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
    </BeatExplainer>
  );
}
