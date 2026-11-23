import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import SwimlaneTimeline, {
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit/SwimlaneTimeline';
import {
  RADIUS,
  RADIUS_SM,
  STAGE_W,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
  type AnyTone,
} from '@/explainers/kit/motion';

type WarpCellState = 'issue' | 'stall' | 'ready';

interface CycleRowCell {
  cycle: number;
  state: WarpCellState;
}

export interface MicroarchLatencyState {
  stepIndex: number;
  mode: 'gpu' | 'ascend';
  phaseTitle: string;
  warpCount?: number;
  warpRows?: { label: string; cells: CycleRowCell[] }[];
  schedulerRow?: (number | null)[];
  ascendLanes?: readonly TimelineLane[];
  ascendSync?: readonly TimelineSyncEvent[];
  metricMode: string;
  metricConcurrency: string;
  metricUtil: string;
  metricTakeaway: string;
}

const TOTAL_CYCLES = 12;
const STALL_CYCLES = 5;

/**
 * 确定性单发行 Warp 调度模拟器：
 * 每个 Warp 发射 1 拍 -> 等 HBM 5 拍 -> 重新就绪；调度器每拍至多挑 1 个就绪 Warp 发射。
 */
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
      let state: WarpCellState;
      if (w === picked) {
        state = 'issue';
      } else if (readyAt[w] > c) {
        state = 'stall';
      } else {
        state = 'ready';
      }
      rows[w].push({ cycle: c, state });
    }
  }

  return {
    warpRows: rows.map((cells, w) => ({ label: `Warp ${w}`, cells })),
    schedulerRow,
    busyCount,
  };
}

export function buildMicroarchLatencySteps(): Step<MicroarchLatencyState>[] {
  const tones: AnyTone[] = ['active', 'highlight', 'activation'];
  assertMaxHues(tones);

  const sim2 = simulateWarpSchedule(2);
  const sim6 = simulateWarpSchedule(6);
  const sim9 = simulateWarpSchedule(9);

  const serialAscendLanes: TimelineLane[] = [
    {
      title: 'MTE2 搬入',
      subtitle: 'HBM -> L1 / UB',
      blocks: [
        { start: 0, dur: 4, label: 'T0', tone: 'activation', active: true },
        { start: 4, dur: 10, label: '闲置等待', tone: 'neutral', kind: 'bubble', dashed: true },
        { start: 14, dur: 4, label: 'T1', tone: 'activation', active: true },
        { start: 18, dur: 10, label: '闲置等待', tone: 'neutral', kind: 'bubble', dashed: true },
      ],
    },
    {
      title: 'Cube 矩阵乘',
      subtitle: '16x16x16 MMAD',
      blocks: [
        { start: 0, dur: 4, label: '等数', tone: 'neutral', kind: 'bubble', dashed: true },
        { start: 4, dur: 6, label: 'T0 GEMM', tone: 'active', active: true },
        { start: 10, dur: 8, label: '闲置空等', tone: 'neutral', kind: 'bubble', dashed: true },
        { start: 18, dur: 6, label: 'T1 GEMM', tone: 'active', active: true },
        { start: 24, dur: 4, label: '闲置', tone: 'neutral', kind: 'bubble', dashed: true },
      ],
    },
    {
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
      title: 'Vector 归约',
      subtitle: '192 KB UB (1C2V)',
      blocks: [
        { start: 0, dur: 12, label: '空等前序', tone: 'neutral', kind: 'bubble', dashed: true },
        { start: 12, dur: 2, label: 'V0', tone: 'highlight', active: true },
        { start: 14, dur: 12, label: '空等前序', tone: 'neutral', kind: 'bubble', dashed: true },
        { start: 26, dur: 2, label: 'V1', tone: 'highlight', active: true },
      ],
    },
  ];

  const serialSync: TimelineSyncEvent[] = [
    { fromLane: 0, at: 4, toLane: 1, toAt: 4, tone: 'activation', dashed: true },
    { fromLane: 1, at: 10, toLane: 2, toAt: 10, tone: 'active', dashed: true },
    { fromLane: 2, at: 12, toLane: 3, toAt: 12, tone: 'highlight', dashed: true },
  ];

  const overlapAscendLanes: TimelineLane[] = [
    {
      title: 'MTE2 搬入',
      subtitle: 'Ping-Pong 双缓冲',
      blocks: [
        { start: 0, dur: 4, label: 'T0 (Buf A)', tone: 'activation', active: true },
        { start: 4, dur: 4, label: 'T1 (Buf B)', tone: 'activation', active: true },
        { start: 10, dur: 4, label: 'T2 (Buf A)', tone: 'activation', active: true },
        { start: 16, dur: 4, label: 'T3 (Buf B)', tone: 'activation', active: true },
      ],
    },
    {
      title: 'Cube 矩阵乘',
      subtitle: '稳态零空泡连跑',
      blocks: [
        { start: 0, dur: 4, label: '启动填充', tone: 'neutral', kind: 'bubble', dashed: true },
        { start: 4, dur: 6, label: 'T0 GEMM', tone: 'active', active: true },
        { start: 10, dur: 6, label: 'T1 GEMM', tone: 'active', active: true },
        { start: 16, dur: 6, label: 'T2 GEMM', tone: 'active', active: true },
        { start: 22, dur: 6, label: 'T3 GEMM', tone: 'active', active: true },
      ],
    },
    {
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
      title: 'Vector 归约',
      subtitle: '双 AIV 掩盖于 Cube 后',
      blocks: [
        { start: 0, dur: 12, label: '预留期', tone: 'neutral', kind: 'bubble', dashed: true },
        { start: 12, dur: 4, label: 'T0 Vec', tone: 'highlight', active: true },
        { start: 18, dur: 4, label: 'T1 Vec', tone: 'highlight', active: true },
        { start: 24, dur: 4, label: 'T2 Vec', tone: 'highlight', active: true },
      ],
    },
  ];

  const overlapSync: TimelineSyncEvent[] = [
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
      label: 'BufB 预取完成',
      tone: 'activation',
      active: true,
    },
    { fromLane: 1, at: 10, toLane: 2, toAt: 10, tone: 'active', active: true },
    { fromLane: 2, at: 12, toLane: 3, toAt: 12, label: 'CV 并行', tone: 'highlight', active: true },
  ];

  return [
    {
      state: {
        stepIndex: 0,
        mode: 'gpu',
        phaseTitle: 'NVIDIA SM · 2 个驻留 Warp（就绪池过浅，空转率 67%）',
        warpCount: 2,
        warpRows: sim2.warpRows,
        schedulerRow: sim2.schedulerRow,
        metricMode: 'SIMT Warp 切换',
        metricConcurrency: '$2$ 个活跃 Warp',
        metricUtil: `$${sim2.busyCount}/12\\;(33\\%)$`,
        metricTakeaway: '等待间隙暴露算力闲置',
      },
      caption:
        '仅驻留 $2$ 个 Warp 时，调度器在 C1–C2 依次发射后便面对双双等待访存的空档，其余 $8$ 拍只能空转；此时急需增加驻留线程块来扩充就绪 Warp 池。',
    },
    {
      state: {
        stepIndex: 1,
        mode: 'gpu',
        phaseTitle: 'NVIDIA SM · 6 个驻留 Warp（延迟完全隐藏，调度器 100% 满载）',
        warpCount: 6,
        warpRows: sim6.warpRows,
        schedulerRow: sim6.schedulerRow,
        metricMode: 'SIMT Warp 切换',
        metricConcurrency: '$6$ 个活跃 Warp',
        metricUtil: `$${sim6.busyCount}/12\\;(100\\%)$`,
        metricTakeaway: '零开销切换藏住访存等待',
      },
      caption:
        '驻留增至 $6$ 个 Warp（恰等于 $1$ 拍发射配 $5$ 拍访存延迟）：W1–W5 依次填充等待空档时，W0 恰好完成访存回到就绪态，SM 以零上下文切换代价实现 $100\\%$ 满拍发射。',
    },
    {
      state: {
        stepIndex: 2,
        mode: 'gpu',
        phaseTitle: 'NVIDIA SM · 9 个驻留 Warp（吞吐不再增加，多余 Warp 进入就绪排队）',
        warpCount: 9,
        warpRows: sim9.warpRows,
        schedulerRow: sim9.schedulerRow,
        metricMode: 'Occupancy 边际权衡',
        metricConcurrency: '$9$ 个活跃 Warp',
        metricUtil: `$${sim9.busyCount}/12\\;(100\\%)$`,
        metricTakeaway: '过多 Warp 挤占寄存器/SMEM',
      },
      caption:
        '超过掩盖延迟所需阈值继续堆高 Warp 数，调度器依旧受限于单拍发射上界；多余 Warp 只能在就绪态排队却平白切薄每线程寄存器与 SMEM 分块预算，这正是 FlashAttention 宁可压低 Occupancy 也要换大分块的根因。',
    },
    {
      state: {
        stepIndex: 3,
        mode: 'ascend',
        phaseTitle: '昇腾 AI Core · 单缓冲串行基线（无 SIMT 池，MTE2/Cube/Vector 依次空等）',
        ascendLanes: serialAscendLanes,
        ascendSync: serialSync,
        metricMode: '显式多队列 (单缓冲)',
        metricConcurrency: '无并行重叠 ($1$ Tile/轮)',
        metricUtil: 'Cube $12/28\\;(43\\%)$',
        metricTakeaway: '57% 周期耗在等搬运与归约',
      },
      caption:
        '昇腾 DaVinci 核没有几十个常驻 Warp 互相顶班；若不做软件双缓冲，MTE2 搬数、Cube 矩阵乘与 Vector 归约沿单块依次串行，Cube 计算单元有超过一半时间在等数据。',
    },
    {
      state: {
        stepIndex: 4,
        mode: 'ascend',
        phaseTitle: '昇腾 AI Core · Ping-Pong 双缓冲 + 1C2V CV 流水线重叠',
        ascendLanes: overlapAscendLanes,
        ascendSync: overlapSync,
        metricMode: '显式双缓冲 + CV 重叠',
        metricConcurrency: '$A/B$ 双槽 + $1\\text{C}2\\text{V}$',
        metricUtil: 'Cube 稳态 $100\\%$',
        metricTakeaway: '异步队列接力代替 Warp 池',
      },
      caption:
        '通过将片上 L1/UB 对半拆分为 Buf A 与 Buf B，Scalar 核向 MTE2、Cube、FixPipe 与双 Vector 核下发异步跨队列接力：算块 $T_0$ 时预取 $T_1$ 并收尾前序 Vector 归约，不用硬件 Warp 池同样跑满 Cube 阵列。',
    },
  ];
}

export default function MicroarchLatencyExplainer({
  title = '图 3：延迟隐藏机制对比——NVIDIA SM Warp 调度与 Occupancy vs 昇腾双缓冲与 CV 流水',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildMicroarchLatencySteps(), []);

  return (
    <Explainer steps={steps} title={title} label="GPU Warp 调度与昇腾显式流水延迟隐藏交互">
      {(step) => {
        const s = step.state;
        const gridX = 100;
        const colW = 45;
        const colGap = 2;
        const rowH = 22;
        const rowGap = 3;
        const rowStartY = 84;
        const warpRows = s.warpRows ?? [];
        const schedulerRow = s.schedulerRow ?? [];
        const schedY = rowStartY + 9 * (rowH + rowGap) + 12;

        return (
          <Stage width={STAGE_W} height={476} label="GPU Warp 调度与昇腾双缓冲流水对比">
            <SvgRichLabel
              x={16}
              y={22}
              width={STAGE_W - 32}
              height={22}
              text={s.phaseTitle}
              fontSize={12.5}
              fontWeight={600}
              color="var(--wisp-fg)"
              anchor="start"
            />

            {s.mode === 'gpu' ? (
              <g>
                <SectionBox
                  x={16}
                  y={40}
                  w={648}
                  h={362}
                  title="SM 12 拍 Warp 调度状态矩阵"
                  tone="active"
                />

                {/* Legend pills on top-right row cleanly clear of title */}
                {[
                  { label: '发射 Issue', tone: 'active' as AnyTone, x: 378, dashed: false },
                  { label: '访存等 Stall', tone: 'neutral' as AnyTone, x: 472, dashed: true },
                  { label: '就绪排队 Ready', tone: 'highlight' as AnyTone, x: 566, dashed: false },
                ].map((item) => (
                  <g key={item.label}>
                    <rect
                      x={item.x}
                      y={46}
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
                      y={52}
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

                {/* Cycle column headers C1..C12 */}
                {Array.from({ length: TOTAL_CYCLES }, (_, ci) => {
                  const cx = gridX + ci * (colW + colGap) + colW / 2;
                  return (
                    <text
                      key={ci}
                      x={cx}
                      y={71}
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

                {/* Warp rows */}
                {warpRows.map((row, wi) => {
                  const ry = rowStartY + wi * (rowH + rowGap);
                  return (
                    <g key={row.label}>
                      <text
                        x={gridX - 10}
                        y={ry + rowH / 2}
                        textAnchor="end"
                        dominantBaseline="central"
                        style={{
                          fill: 'var(--wisp-fg)',
                          fontFamily: 'var(--wisp-font-mono)',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {row.label}
                      </text>
                      {row.cells.map((cell) => {
                        const cx = gridX + cell.cycle * (colW + colGap);
                        const tone: AnyTone =
                          cell.state === 'issue'
                            ? 'active'
                            : cell.state === 'ready'
                              ? 'highlight'
                              : 'neutral';
                        const lbl =
                          cell.state === 'issue'
                            ? 'Issue'
                            : cell.state === 'ready'
                              ? 'Ready'
                              : 'Stall';
                        return (
                          <g key={cell.cycle}>
                            <rect
                              x={cx}
                              y={ry}
                              width={colW}
                              height={rowH}
                              rx={RADIUS_SM}
                              fill={resolveToneFill(tone)}
                              stroke={resolveToneStroke(tone)}
                              strokeWidth={cell.state === 'issue' ? 1.5 : 1}
                              strokeDasharray={cell.state === 'stall' ? '3 2' : undefined}
                              fillOpacity={cell.state === 'stall' ? 0.45 : 0.95}
                            />
                            <text
                              x={cx + colW / 2}
                              y={ry + rowH / 2}
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{
                                fill:
                                  cell.state === 'stall' ? 'var(--wisp-muted)' : 'var(--wisp-fg)',
                                fontFamily: 'var(--wisp-font-mono)',
                                fontSize: 9.5,
                                fontWeight: cell.state === 'issue' ? 700 : 500,
                              }}
                            >
                              {lbl}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* Divider & Bottom Scheduler summary row */}
                <line
                  x1={28}
                  y1={schedY - 8}
                  x2={658}
                  y2={schedY - 8}
                  stroke="var(--wisp-border)"
                  strokeWidth={1}
                />
                <text
                  x={gridX - 10}
                  y={schedY + 15}
                  textAnchor="end"
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-sem-active)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  Warp 调度器
                </text>
                {schedulerRow.map((picked, ci) => {
                  const cx = gridX + ci * (colW + colGap);
                  const isBusy = picked !== null;
                  const tone: AnyTone = isBusy ? 'active' : 'neutral';
                  return (
                    <g key={ci}>
                      <rect
                        x={cx}
                        y={schedY}
                        width={colW}
                        height={30}
                        rx={RADIUS}
                        fill={resolveToneFill(tone)}
                        stroke={resolveToneStroke(tone)}
                        strokeWidth={isBusy ? 1.8 : 1}
                        strokeDasharray={isBusy ? undefined : '4 3'}
                        fillOpacity={isBusy ? 1 : 0.35}
                      />
                      <text
                        x={cx + colW / 2}
                        y={schedY + 15}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{
                          fill: isBusy ? 'var(--wisp-fg)' : 'var(--wisp-muted)',
                          fontFamily: isBusy ? 'var(--wisp-font-mono)' : 'var(--wisp-font-sans)',
                          fontSize: 10.5,
                          fontWeight: isBusy ? 700 : 500,
                        }}
                      >
                        {isBusy ? `W${picked}` : '空闲'}
                      </text>
                    </g>
                  );
                })}

                <text
                  x={32}
                  y={380}
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11,
                  }}
                >
                  规则：每 Warp 发射 1 拍后等待 HBM 5 拍；SM 处理块凭寄存器常驻 0 拍切换到就绪 Warp
                  隐藏延迟。
                </text>
              </g>
            ) : (
              <g>
                <SectionBox
                  x={16}
                  y={40}
                  w={648}
                  h={362}
                  title="昇腾 DaVinci AI Core · 显式硬件异步队列时序（无硬件 SIMT 线程束池）"
                  tone="activation"
                />
                <SwimlaneTimeline
                  x={28}
                  y={74}
                  w={608}
                  totalTime={28}
                  unit="拍"
                  ticks={[0, 7, 14, 21, 28]}
                  gutterW={116}
                  laneH={40}
                  laneGap={16}
                  title={
                    s.stepIndex === 3
                      ? '单缓冲基线：MTE2 / Cube / FixPipe / Vector 依次串行停等'
                      : '双缓冲乒乓：Buf A/B 预取与 CV 并行接力，稳态连续喂饱 Cube'
                  }
                  lanes={s.ascendLanes ?? []}
                  syncEvents={s.ascendSync}
                />
                <text
                  x={32}
                  y={368}
                  dominantBaseline="central"
                  style={{
                    fill: 'var(--wisp-muted)',
                    fontFamily: 'var(--wisp-font-sans)',
                    fontSize: 11,
                  }}
                >
                  说明：昇腾靠 Scalar 控制核显式排布搬算重叠（受 MTE2 单核 16 个挂起队列项与 UB 192
                  KB 容量边界约束）。
                </text>
              </g>
            )}

            <MetricRow
              x={16}
              y={416}
              w={648}
              h={46}
              metrics={[
                { label: '延迟隐藏机制', value: s.metricMode, tone: 'highlight', active: true },
                { label: '驻留 / 缓冲拓扑', value: s.metricConcurrency, tone: 'neutral' },
                {
                  label: '发射 / 算力利用率',
                  value: s.metricUtil,
                  tone: s.mode === 'gpu' ? 'active' : 'activation',
                  active: true,
                },
                { label: '关键微架构约束', value: s.metricTakeaway, tone: 'neutral' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
