import { useMemo, useState } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { InteractiveExplainer, LabSegmented, LabSlider } from '@/explainers/kit';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SwimlaneTimeline, {
  type TimelineBlock,
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit/SwimlaneTimeline';
import {
  RADIUS_SM,
  STAGE_W,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
  useDiagramMotion,
  type AnyTone,
} from '@/explainers/kit/motion';

type WarpCellState = 'issue' | 'stall' | 'ready';

export type LatencyArchMode = 'gpu' | 'ascend';
export type AscendBufferMode = 'serial' | 'pingpong';

interface CycleRowCell {
  cycle: number;
  state: WarpCellState;
}

export interface MicroarchLatencyState {
  mode: LatencyArchMode;
  warpCount: number;
  ascendMode: AscendBufferMode;
  formulaTex: string;
}

const TOTAL_CYCLES = 12;
const STALL_CYCLES = 5;
const MAX_WARPS = 9;

function simulateWarpSchedule(numWarps: number): {
  warpRows: { label: string; cells: CycleRowCell[] }[];
  schedulerRow: (number | null)[];
  busyCount: number;
} {
  const readyAt = new Array<number>(numWarps).fill(0);
  const rows: CycleRowCell[][] = Array.from({ length: numWarps }, () => []);
  const schedulerRow: (number | null)[] = [];
  let rrCursor = 0;
  let busyCount = 0;

  for (let c = 0; c < TOTAL_CYCLES; c++) {
    let picked: number | null = null;
    for (let offset = 0; offset < numWarps; offset++) {
      const idx = (rrCursor + offset) % numWarps;
      if (readyAt[idx] <= c) {
        picked = idx;
        break;
      }
    }

    if (picked !== null) {
      rrCursor = (picked + 1) % numWarps;
      readyAt[picked] = c + 1 + STALL_CYCLES;
      busyCount++;
    }
    schedulerRow.push(picked);

    for (let w = 0; w < numWarps; w++) {
      const state: WarpCellState = w === picked ? 'issue' : readyAt[w] > c ? 'stall' : 'ready';
      rows[w].push({ cycle: c, state });
    }
  }

  return {
    warpRows: rows.map((cells, w) => ({ label: `Warp ${w}`, cells })),
    schedulerRow,
    busyCount,
  };
}

function buildGpuIssueTimeline(schedulerRow: (number | null)[]): TimelineLane[] {
  const blocks: TimelineBlock[] = schedulerRow.map((picked, c) =>
    picked !== null
      ? { start: c, dur: 1, label: `W${picked}`, tone: 'active', active: true }
      : { start: c, dur: 1, label: '空泡', tone: 'neutral', kind: 'bubble', dashed: true },
  );
  return [
    {
      id: 'issue',
      title: 'SM 发射流',
      subtitle: '每拍至多 1 Warp',
      blocks,
    },
  ];
}

function buildAscendTimeline(ascendMode: AscendBufferMode): {
  lanes: TimelineLane[];
  syncEvents: TimelineSyncEvent[];
} {
  if (ascendMode === 'serial') {
    return {
      lanes: [
        {
          id: 'mte2',
          title: 'MTE2 搬入',
          subtitle: 'HBM -> L1 / UB',
          blocks: [
            { start: 0, dur: 4, label: 'T0', tone: 'activation', active: true },
            { start: 4, dur: 10, label: '空泡', tone: 'neutral', kind: 'bubble', dashed: true },
            { start: 14, dur: 4, label: 'T1', tone: 'activation', active: true },
            { start: 18, dur: 10, label: '空泡', tone: 'neutral', kind: 'bubble', dashed: true },
          ],
        },
        {
          id: 'cube',
          title: 'Cube 矩阵乘',
          subtitle: '16×16×16 MMAD',
          blocks: [
            { start: 0, dur: 4, label: '等数', tone: 'neutral', kind: 'bubble', dashed: true },
            { start: 4, dur: 6, label: 'T0 GEMM', tone: 'active', active: true },
            { start: 10, dur: 8, label: '空泡', tone: 'neutral', kind: 'bubble', dashed: true },
            { start: 18, dur: 6, label: 'T1 GEMM', tone: 'active', active: true },
            { start: 24, dur: 4, label: '空泡', tone: 'neutral', kind: 'bubble', dashed: true },
          ],
        },
        {
          id: 'fixpipe',
          title: 'FixPipe 迁出',
          subtitle: 'L0C -> UB',
          blocks: [
            { start: 0, dur: 10, label: '等待', tone: 'neutral', kind: 'bubble', dashed: true },
            { start: 10, dur: 2, label: 'T0', tone: 'highlight', active: true },
            { start: 12, dur: 12, label: '等待', tone: 'neutral', kind: 'bubble', dashed: true },
            { start: 24, dur: 2, label: 'T1', tone: 'highlight', active: true },
          ],
        },
        {
          id: 'vector',
          title: 'Vector 归约',
          subtitle: '192 KB UB (1C2V)',
          blocks: [
            { start: 0, dur: 12, label: '空等前序', tone: 'neutral', kind: 'bubble', dashed: true },
            { start: 12, dur: 2, label: 'V0', tone: 'highlight', active: true },
            {
              start: 14,
              dur: 12,
              label: '空等前序',
              tone: 'neutral',
              kind: 'bubble',
              dashed: true,
            },
            { start: 26, dur: 2, label: 'V1', tone: 'highlight', active: true },
          ],
        },
      ],
      syncEvents: [
        { fromLane: 0, at: 4, toLane: 1, toAt: 4, tone: 'activation', dashed: true },
        { fromLane: 1, at: 10, toLane: 2, toAt: 10, tone: 'active', dashed: true },
        { fromLane: 2, at: 12, toLane: 3, toAt: 12, tone: 'highlight', dashed: true },
      ],
    };
  }

  return {
    lanes: [
      {
        id: 'mte2',
        title: 'MTE2 搬入',
        subtitle: 'Ping-Pong 双缓冲',
        blocks: [
          { start: 0, dur: 4, label: 'T0', tone: 'activation', active: true },
          { start: 4, dur: 4, label: 'T1 (BufB)', tone: 'activation', active: true },
          { start: 10, dur: 4, label: 'T2 (BufA)', tone: 'activation', active: true },
          { start: 16, dur: 4, label: 'T3 (BufB)', tone: 'activation', active: true },
        ],
      },
      {
        id: 'cube',
        title: 'Cube 矩阵乘',
        subtitle: '稳态零空泡连跑',
        blocks: [
          { start: 0, dur: 4, label: '等数', tone: 'neutral', kind: 'bubble', dashed: true },
          { start: 4, dur: 6, label: 'T0 GEMM', tone: 'active', active: true },
          { start: 10, dur: 6, label: 'T1 GEMM', tone: 'active', active: true },
          { start: 16, dur: 6, label: 'T2 GEMM', tone: 'active', active: true },
          { start: 22, dur: 6, label: 'T3 GEMM', tone: 'active', active: true },
        ],
      },
      {
        id: 'fixpipe',
        title: 'FixPipe 迁出',
        subtitle: '与下一块计算并行',
        blocks: [
          { start: 0, dur: 10, label: '等首块', tone: 'neutral', kind: 'bubble', dashed: true },
          { start: 10, dur: 2, label: 'T0', tone: 'highlight', active: true },
          { start: 16, dur: 2, label: 'T1', tone: 'highlight', active: true },
          { start: 22, dur: 2, label: 'T2', tone: 'highlight', active: true },
        ],
      },
      {
        id: 'vector',
        title: 'Vector 归约',
        subtitle: '双 AIV 掩盖于 Cube 后',
        blocks: [
          { start: 0, dur: 12, label: '预留期', tone: 'neutral', kind: 'bubble', dashed: true },
          { start: 12, dur: 4, label: 'V0', tone: 'highlight', active: true },
          { start: 18, dur: 4, label: 'V1', tone: 'highlight', active: true },
          { start: 24, dur: 4, label: 'V2', tone: 'highlight', active: true },
        ],
      },
    ],
    syncEvents: [
      {
        fromLane: 0,
        at: 4,
        toLane: 1,
        toAt: 4,
        label: 'BufA 就绪',
        tone: 'activation',
        active: true,
      },
      {
        fromLane: 0,
        at: 8,
        toLane: 1,
        toAt: 10,
        label: 'BufB Prefetch',
        tone: 'activation',
        active: true,
      },
      { fromLane: 1, at: 10, toLane: 2, toAt: 10, tone: 'active', active: true },
      {
        fromLane: 2,
        at: 12,
        toLane: 3,
        toAt: 12,
        label: 'CV 并行',
        tone: 'highlight',
        active: true,
      },
    ],
  };
}

export function buildMicroarchLatencySteps(): Step<MicroarchLatencyState>[] {
  assertMaxHues(['active', 'highlight', 'activation']);
  return [
    {
      label: '2 Warp 饥饿',
      duration: 4600,
      state: {
        mode: 'gpu',
        warpCount: 2,
        ascendMode: 'serial',
        formulaTex: '$W=2 < 6 \\;\\Longrightarrow\\; \\text{Util}=33\\%$',
      },
      caption: '仅驻留 2 个 Warp 时，调度器每轮发射后留出大量空泡。',
    },
    {
      label: '6 Warp 满载',
      duration: 4600,
      state: {
        mode: 'gpu',
        warpCount: 6,
        ascendMode: 'serial',
        formulaTex: '$W=1+5=6 \\;\\Longrightarrow\\; \\text{Util}=100\\%$',
      },
      caption: '驻留增至 6 个 Warp 时恰好掩盖 5 拍 HBM 延迟，空泡完全消除。',
    },
    {
      label: '昇腾串行',
      duration: 4600,
      state: {
        mode: 'ascend',
        warpCount: 6,
        ascendMode: 'serial',
        formulaTex:
          '$T = T_{\\text{MTE2}} + T_{\\text{Cube}} + T_{\\text{FixPipe}} + T_{\\text{Vec}}$',
      },
      caption: '昇腾单缓冲下搬运与计算依次空等，Cube 利用率仅 43%。',
    },
    {
      label: '昇腾乒乓',
      duration: 4600,
      state: {
        mode: 'ascend',
        warpCount: 6,
        ascendMode: 'pingpong',
        formulaTex:
          '$\\text{Ping-Pong }(A/B) + 1\\text{C}2\\text{V} \\;\\Longrightarrow\\; \\text{Cube 稳态 } 100\\%$',
      },
      caption: '启用乒乓双缓冲与 CV 并行后，Cube 稳态连续满载消除空泡。',
    },
  ];
}

export default function MicroarchLatencyExplainer({
  title = '图 3：延迟隐藏机制对比——NVIDIA SM Warp 调度与 Occupancy vs 昇腾双缓冲与 CV 流水',
}: {
  title?: string;
}) {
  assertMaxHues(['active', 'highlight', 'activation']);
  const { stepTransition } = useDiagramMotion();
  const [archMode, setArchMode] = useState<LatencyArchMode>('gpu');
  const [warpCount, setWarpCount] = useState(2);
  const [ascendMode, setAscendMode] = useState<AscendBufferMode>('serial');

  const gpuSim = useMemo(() => simulateWarpSchedule(warpCount), [warpCount]);
  const gpuLanes = useMemo(() => buildGpuIssueTimeline(gpuSim.schedulerRow), [gpuSim.schedulerRow]);
  const ascendTimeline = useMemo(() => buildAscendTimeline(ascendMode), [ascendMode]);

  const utilPct = Math.round((gpuSim.busyCount / TOTAL_CYCLES) * 100);
  const bubbleCount = TOTAL_CYCLES - gpuSim.busyCount;

  const formulaTex =
    archMode === 'gpu'
      ? `$W=${warpCount}\\; (${warpCount < 6 ? '< 1+5' : warpCount === 6 ? '= 1+5' : '> 6'}) \\;\\Longrightarrow\\; \\text{发射率 } ${gpuSim.busyCount}/12\\;(${utilPct}\\%)$`
      : ascendMode === 'serial'
        ? '$\\text{串行等待}:\\; T = T_{\\text{MTE2}} + T_{\\text{Cube}} + T_{\\text{FixPipe}} + T_{\\text{Vec}}\\;(43\\%)$'
        : '$\\text{乒乓双缓冲 }(A/B) + 1\\text{C}2\\text{V} \\;\\Longrightarrow\\; \\text{Cube 稳态 } 100\\%$';

  const caption =
    archMode === 'gpu'
      ? warpCount < 6
        ? `当前驻留 $${warpCount}$ 个 Warp：每 Warp 发射 1 拍后需等 HBM 5 拍，就绪池不足 6 个，12 拍内仍有 ${bubbleCount} 拍处于空闲空泡，SM 发射率仅为 $${utilPct}\\%$。向右拖动滑块扩充 Warp 池可逐步填满流水线。`
        : warpCount === 6
          ? '恰等于 $1$ 拍发射配 $5$ 拍访存延迟（$W=6$）：当 W1–W5 依次填充空档时，W0 恰好完成访存回到就绪态，Swimlane 中的空泡彻底归零，SM 达到 $100\\%$ 满拍发射。'
          : `继续堆高到 $${warpCount}$ 个 Warp，SM 发射率依然封顶 $100\\%$（单拍至多发 1 个 Warp），多余 Warp 只能在橙色 Ready 队列排队，同时平白摊薄每线程寄存器与 SMEM 分块预算。`
      : ascendMode === 'serial'
        ? '昇腾 DaVinci 核没有几十个常驻 Warp 互相顶班；单缓冲串行执行时，MTE2 搬数、Cube 矩阵乘、FixPipe 迁出与 Vector 归约依次停等，Cube 计算单元有 $57\\%$ 周期在空等前序。'
        : '切换到乒乓双缓冲（Buf A/B）：Scalar 核向多条硬件异步队列派发接力，算块 $T_0$ 时 Prefetch $T_1$ 并把前序 Vector 归约掩盖在 Cube 后方，不用硬件 Warp 池同样实现 Cube 稳态零空泡。';

  const gridX = 93;
  const colW = 44;
  const colGap = 3;
  const rowH = 19;
  const rowGap = 3;
  const rowStartY = 58;

  return (
    <InteractiveExplainer
      title={title}
      label="GPU Warp 调度与昇腾显式流水延迟隐藏交互"
      stageMinHeight={510}
      formula={formulaTex}
      caption={caption}
      onReset={() => {
        setArchMode('gpu');
        setWarpCount(2);
        setAscendMode('serial');
      }}
      controls={
        <>
          <LabSegmented
            ariaLabel="硬件微架构对比模式"
            value={archMode}
            onChange={setArchMode}
            options={[
              { id: 'gpu', label: 'GPU Warp 切换' },
              { id: 'ascend', label: '昇腾 Cube-Vector' },
            ]}
          />
          {archMode === 'gpu' ? (
            <LabSlider
              label="驻留 Warp 数"
              min={2}
              max={MAX_WARPS}
              step={1}
              value={warpCount}
              valueText={`${warpCount} Warps`}
              onChange={setWarpCount}
            />
          ) : (
            <LabSegmented
              ariaLabel="昇腾双缓冲开关"
              value={ascendMode}
              onChange={setAscendMode}
              options={[
                { id: 'serial', label: '串行等待' },
                { id: 'pingpong', label: '乒乓双缓冲' },
              ]}
            />
          )}
        </>
      }
    >
      <Stage width={STAGE_W} height={452} label="GPU Warp 调度与昇腾双缓冲流水对比">
        {archMode === 'gpu' ? (
          <g>
            <SectionBox
              x={16}
              y={12}
              w={648}
              h={368}
              title={`NVIDIA SM · ${warpCount} 个驻留 Warp（1 拍发射 + 5 拍 HBM 延迟，零切换开销）`}
              tone="active"
            />

            {[
              { label: '发射 Issue', tone: 'active' as AnyTone, x: 378, dashed: false },
              { label: '访存等 Stall', tone: 'neutral' as AnyTone, x: 472, dashed: true },
              { label: '就绪排队 Ready', tone: 'highlight' as AnyTone, x: 566, dashed: false },
            ].map((item) => (
              <g key={item.label}>
                <rect
                  x={item.x}
                  y={21}
                  width={12}
                  height={12}
                  rx={RADIUS_SM}
                  fill={resolveToneFill(item.tone)}
                  stroke={resolveToneStroke(item.tone)}
                  strokeWidth={1.2}
                  strokeDasharray={item.dashed ? '3 2' : undefined}
                />
                <text
                  x={item.x + 17}
                  y={27}
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 10.5,
                  }}
                >
                  {item.label}
                </text>
              </g>
            ))}

            {Array.from({ length: TOTAL_CYCLES }, (_, ci) => {
              const cx = gridX + ci * (colW + colGap) + colW / 2;
              return (
                <text
                  key={ci}
                  x={cx}
                  y={45}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-mono)',
                    fontSize: 10.5,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {`C${ci + 1}`}
                </text>
              );
            })}

            {Array.from({ length: MAX_WARPS }, (_, wi) => {
              const active = wi < warpCount;
              const row = gpuSim.warpRows[wi];
              const ry = rowStartY + wi * (rowH + rowGap);
              return (
                <motion.g
                  key={wi}
                  initial={false}
                  animate={{ opacity: active ? 1 : 0.14 }}
                  transition={stepTransition}
                >
                  <text
                    x={gridX - 10}
                    y={ry + rowH / 2}
                    textAnchor="end"
                    dominantBaseline="central"
                    style={{
                      fill: active ? 'var(--wisp-fg)' : 'var(--wisp-muted)',
                      fontFamily: 'var(--wisp-font-mono)',
                      fontSize: 10.5,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {`Warp ${wi}`}
                  </text>
                  {Array.from({ length: TOTAL_CYCLES }, (_, ci) => {
                    const cx = gridX + ci * (colW + colGap);
                    const cell = row?.cells[ci];
                    const st = cell?.state ?? 'stall';
                    const tone: AnyTone = !active
                      ? 'neutral'
                      : st === 'issue'
                        ? 'active'
                        : st === 'ready'
                          ? 'highlight'
                          : 'neutral';
                    const lbl = !active
                      ? '—'
                      : st === 'issue'
                        ? 'Issue'
                        : st === 'ready'
                          ? 'Ready'
                          : 'Stall';
                    return (
                      <g key={ci}>
                        <rect
                          x={cx}
                          y={ry}
                          width={colW}
                          height={rowH}
                          rx={RADIUS_SM}
                          fill={resolveToneFill(tone)}
                          stroke={resolveToneStroke(tone)}
                          strokeWidth={active && st === 'issue' ? 1.5 : 1}
                          strokeDasharray={!active || st === 'stall' ? '3 2' : undefined}
                          fillOpacity={!active ? 0.2 : st === 'stall' ? 0.42 : 0.95}
                        />
                        <text
                          x={cx + colW / 2}
                          y={ry + rowH / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{
                            fill:
                              !active || st === 'stall' ? 'var(--wisp-muted)' : 'var(--wisp-fg)',
                            fontFamily: 'var(--wisp-font-mono)',
                            fontSize: 10,
                            fontWeight: active && st === 'issue' ? 700 : 500,
                          }}
                        >
                          {lbl}
                        </text>
                      </g>
                    );
                  })}
                </motion.g>
              );
            })}

            <SwimlaneTimeline
              x={24}
              y={266}
              w={630}
              totalTime={TOTAL_CYCLES}
              unit="拍"
              ticks={[0, 3, 6, 9, 12]}
              gutterW={69}
              laneH={34}
              laneGap={8}
              title={`SM 调度器发射泳道（发射 ${gpuSim.busyCount}/12 拍，空泡 ${bubbleCount} 拍）`}
              lanes={gpuLanes}
            />
          </g>
        ) : (
          <g>
            <SectionBox
              x={16}
              y={12}
              w={648}
              h={368}
              title="昇腾 DaVinci AI Core · 显式硬件异步队列时序（无硬件 SIMT 线程束池）"
              tone="activation"
            />
            <SwimlaneTimeline
              x={28}
              y={48}
              w={608}
              totalTime={28}
              unit="拍"
              ticks={[0, 7, 14, 21, 28]}
              gutterW={116}
              laneH={40}
              laneGap={16}
              title={
                ascendMode === 'serial'
                  ? '单缓冲基线：MTE2 / Cube / FixPipe / Vector 依次串行停等（57% 空泡）'
                  : '双缓冲乒乓：Buf A/B Prefetch 与 CV 并行接力，稳态连续喂饱 Cube（零空泡）'
              }
              lanes={ascendTimeline.lanes}
              syncEvents={ascendTimeline.syncEvents}
            />
            <text
              x={32}
              y={356}
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-muted)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 11,
              }}
            >
              说明：昇腾靠 Scalar 控制核显式排布搬算重叠（受 MTE2 单核 16 个挂起队列项与 UB 192 KB
              容量约束）。
            </text>
          </g>
        )}

        <MetricRow
          x={16}
          y={392}
          w={648}
          h={46}
          metrics={[
            {
              label: '延迟隐藏机制',
              value:
                archMode === 'gpu'
                  ? 'SIMT Warp 切换'
                  : ascendMode === 'serial'
                    ? '单缓冲串行'
                    : '乒乓双缓冲 + CV',
              tone: 'highlight',
              active: true,
            },
            {
              label: '驻留 / 缓冲拓扑',
              value:
                archMode === 'gpu'
                  ? `$${warpCount}$ 个活跃 Warp`
                  : ascendMode === 'serial'
                    ? '单槽 ($1$ Tile/轮)'
                    : '$A/B$ 双槽 + $1\\text{C}2\\text{V}$',
              tone: 'neutral',
            },
            {
              label: '发射 / 算力利用率',
              value:
                archMode === 'gpu'
                  ? `$${gpuSim.busyCount}/12\\;(${utilPct}\\%)$`
                  : ascendMode === 'serial'
                    ? 'Cube $12/28\\;(43\\%)$'
                    : 'Cube 稳态 $100\\%$',
              tone: archMode === 'gpu' ? 'active' : 'activation',
              active: true,
            },
            {
              label: '关键微架构权衡',
              value:
                archMode === 'gpu'
                  ? warpCount < 6
                    ? `尚余 ${bubbleCount} 拍空泡`
                    : warpCount === 6
                      ? '零成本藏住延迟'
                      : '挤占 Reg/SMEM'
                  : ascendMode === 'serial'
                    ? '57% 周期空等搬运'
                    : '异步队列等效满载',
              tone: 'neutral',
            },
          ]}
        />
      </Stage>
    </InteractiveExplainer>
  );
}
