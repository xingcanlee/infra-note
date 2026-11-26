import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { DataFlowArrow, RADIUS, RADIUS_SM, fitTextMetrics } from '@/explainers/kit';
import { LANE_LABELS, MANIM_EASE, MORPH_SPRING, type PdArrowSpec, type PdStepState } from './steps';

export interface PdFlowStageProps {
  state: PdStepState;
  beat: number;
  playToken?: number;
  reducedMotion?: boolean;
}

const LANE_Y = [78, 134, 190, 246] as const;
const LANE_H = 44;
const AXIS_X0 = 136;
const AXIS_W = 528;

const TOPO_NODES = [
  { key: 'proxy', x: 14, w: 126, title: 'Proxy / Meta', sub: '路由调度' },
  { key: 'p_hbm', x: 178, w: 132, title: 'P 节点 HBM', sub: '源显存块' },
  { key: 'd_dram', x: 348, w: 144, title: 'D 节点 DRAM', sub: '2 MiB 大页' },
  { key: 'd_hbm', x: 530, w: 136, title: 'D 节点 HBM', sub: '目标解码' },
] as const;

function PdTopologyMinimap({
  phase,
  beat,
  playToken,
}: {
  phase: PdStepState['phase'];
  beat: number;
  playToken: number;
}) {
  const isPull = phase === 'pull-compute' || phase === 'pull-drain';
  const isPush = phase === 'push-prealloc' || phase === 'push-overlap';
  const isD2rhStage = phase === 'd2rh-stage';
  const isD2rhHit = phase === 'd2rh-hit';

  const nodeActive = {
    proxy: true,
    p_hbm: !isD2rhHit,
    d_dram: isD2rhStage || isD2rhHit,
    d_hbm: phase !== 'pull-compute',
  };

  return (
    <g aria-label="PD 分离传输硬件路径拓扑对比">
      {TOPO_NODES.map((n) => {
        const active = nodeActive[n.key];
        const isSkippedP = n.key === 'p_hbm' && isD2rhHit;
        const tone =
          isD2rhHit && n.key === 'd_dram'
            ? 'done'
            : isPush && n.key === 'd_hbm'
              ? 'highlight'
              : 'active';
        return (
          <g key={n.key} opacity={isSkippedP ? 0.35 : active ? 1 : 0.45}>
            <rect
              x={n.x}
              y={16}
              width={n.w}
              height={36}
              rx={RADIUS}
              fill={active ? toneFill(tone) : 'var(--wisp-surface)'}
              stroke={active ? toneStroke(tone) : 'var(--wisp-border)'}
              strokeWidth={active ? 1.4 : 1}
              strokeDasharray={isSkippedP ? '4 3' : undefined}
            />
            <text
              x={n.x + n.w / 2}
              y={32}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={700}
              fontFamily="var(--wisp-font-mono)"
              fill="var(--wisp-fg)"
            >
              {n.title}
            </text>
            <text
              x={n.x + n.w / 2}
              y={45}
              textAnchor="middle"
              fontSize={9.5}
              fontFamily="var(--wisp-font-sans)"
              fill="var(--wisp-muted)"
            >
              {isSkippedP ? '已跳过计算' : n.sub}
            </text>
          </g>
        );
      })}

      {/* Pull 路径 */}
      {isPull && (
        <>
          <DataFlowArrow
            points={[
              [140, 34],
              [178, 34],
            ]}
            tone="active"
            active={true}
            flow={phase === 'pull-compute' && beat <= 1}
            dotToken={playToken}
          />
          {phase === 'pull-drain' && (
            <DataFlowArrow
              points={[
                [244, 16],
                [244, 6],
                [598, 6],
                [598, 16],
              ]}
              tone="active"
              active={beat >= 1}
              draw={true}
              flow={beat === 1 || beat === 2}
              dotToken={playToken}
              label="RDMA 整批反拉"
              labelPos={[421, 7]}
            />
          )}
        </>
      )}

      {/* Push 路径 */}
      {isPush && (
        <>
          {phase === 'push-prealloc' ? (
            <DataFlowArrow
              points={[
                [77, 16],
                [77, 6],
                [598, 6],
                [598, 16],
              ]}
              tone="highlight"
              active={beat >= 0}
              draw={true}
              flow={beat <= 2}
              dotToken={playToken}
              label="先路由 D 预分配并登快照"
              labelPos={[340, 7]}
            />
          ) : (
            <DataFlowArrow
              points={[
                [244, 16],
                [244, 6],
                [598, 6],
                [598, 16],
              ]}
              tone="highlight"
              active={beat >= 0}
              draw={true}
              flow={beat <= 2}
              dotToken={playToken}
              label="算完即推写 D HBM（逐层掩盖）"
              labelPos={[421, 7]}
            />
          )}
        </>
      )}

      {/* D2RH 冷未命中两跳路径 */}
      {isD2rhStage && (
        <>
          <DataFlowArrow
            points={[
              [310, 34],
              [348, 34],
            ]}
            tone="active"
            active={beat >= 1}
            draw={true}
            flow={beat === 1}
            dotToken={playToken}
            label="Hop1"
            labelPos={[329, 20]}
          />
          <DataFlowArrow
            points={[
              [492, 34],
              [530, 34],
            ]}
            tone="done"
            active={beat >= 3}
            visible={beat >= 2}
            draw={true}
            flow={beat === 3}
            dotToken={playToken}
            label="H2D"
            labelPos={[511, 20]}
          />
        </>
      )}

      {/* D2RH 前缀命中短路 */}
      {isD2rhHit && (
        <>
          <DataFlowArrow
            points={[
              [77, 16],
              [77, 6],
              [420, 6],
              [420, 16],
            ]}
            tone="done"
            active={beat >= 0}
            draw={true}
            flow={beat <= 1}
            dotToken={playToken}
            label="HostCacheKey 命中短路 P 节点"
            labelPos={[250, 7]}
          />
          <DataFlowArrow
            points={[
              [492, 34],
              [530, 34],
            ]}
            tone="active"
            active={beat >= 2}
            draw={true}
            flow={beat >= 2}
            dotToken={playToken}
            label="H2D"
            labelPos={[511, 20]}
          />
        </>
      )}
    </g>
  );
}

function msToX(ms: number, axisMaxMs: number): number {
  return AXIS_X0 + (ms / axisMaxMs) * AXIS_W;
}

function renderArrow(arrow: PdArrowSpec, axisMaxMs: number, beat: number, playToken: number) {
  const visible = beat >= arrow.beatMin;
  const x = msToX(arrow.atMs, axisMaxMs);
  const y1 = LANE_Y[arrow.fromLane] + LANE_H / 2;
  const y2 = LANE_Y[arrow.toLane] + LANE_H / 2;
  const dir = y2 > y1 ? 1 : -1;
  const startY = y1 + dir * 15;
  const endY = y2 - dir * 15;
  const midY = (startY + endY) / 2 + (arrow.labelDy ?? 0);

  return (
    <DataFlowArrow
      key={arrow.id}
      points={[
        [x, startY],
        [x, endY],
      ]}
      tone={arrow.tone}
      active={visible}
      visible={visible}
      draw={true}
      dashed={arrow.tone === 'highlight'}
      flow={visible}
      dotToken={visible ? playToken : 0}
      label={arrow.label}
      labelPos={[x, midY]}
    />
  );
}

export default function PdFlowStage({
  state,
  beat,
  playToken = 0,
  reducedMotion = false,
}: PdFlowStageProps) {
  const markerX = msToX(state.markerMs, state.axisMaxMs);

  return (
    <div className="pd-flow-stage">
      <div className="pd-flow-metrics">
        <div className="pd-metric-card">
          <span className="pd-metric-card__label">当前传输模式</span>
          <span className="pd-metric-card__val">{state.modeName}</span>
        </div>
        <div className="pd-metric-card wisp-kit-tone" data-tone="highlight">
          <span className="pd-metric-card__label">P 端 HBM 持块时长</span>
          <span className="pd-metric-card__val">{state.pHoldMs}</span>
        </div>
        <div className="pd-metric-card wisp-kit-tone" data-tone="done">
          <span className="pd-metric-card__label">首字延迟 TTFT</span>
          <span className="pd-metric-card__val">{state.ttftMs}</span>
        </div>
        <div className="pd-metric-card wisp-kit-tone" data-tone="active">
          <span className="pd-metric-card__label">P 端释放条件</span>
          <span className="pd-metric-card__val">{state.releaseRule}</span>
        </div>
      </div>

      <div className="pd-flow-canvas-wrap wisp-kit-svg-frame">
        <svg
          className="pd-flow-svg"
          viewBox="0 0 680 304"
          role="img"
          aria-label={`${state.modeName} 四泳道时序图`}
        >
          {/* 顶部硬件拓扑微图 */}
          <PdTopologyMinimap phase={state.phase} beat={beat} playToken={playToken} />

          {/* 泳道区时间刻度尺 */}
          <line
            x1={AXIS_X0}
            y1={70}
            x2={msToX(state.axisMaxMs, state.axisMaxMs)}
            y2={70}
            stroke="var(--wisp-border)"
            strokeWidth={1}
          />
          {state.ticks.map((tick) => {
            const tx = msToX(tick, state.axisMaxMs);
            return (
              <g key={tick}>
                <line
                  x1={tx}
                  y1={66}
                  x2={tx}
                  y2={296}
                  stroke="var(--wisp-border)"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  opacity={0.55}
                />
                <text
                  x={tx}
                  y={63}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="var(--wisp-font-mono)"
                  fill="var(--wisp-muted)"
                >
                  {tick} ms
                </text>
              </g>
            );
          })}

          {/* 四条硬件与控制面泳道 */}
          {LANE_LABELS.map((lane) => {
            const y = LANE_Y[lane.idx];
            return (
              <g key={lane.idx}>
                <rect
                  x={4}
                  y={y}
                  width={124}
                  height={LANE_H}
                  rx={RADIUS}
                  fill="var(--wisp-surface)"
                  stroke="var(--wisp-border)"
                  strokeWidth={1}
                />
                <text
                  x={12}
                  y={y + 18}
                  fontSize={11}
                  fontWeight={600}
                  fontFamily="var(--wisp-font-sans)"
                  fill="var(--wisp-fg)"
                >
                  {lane.title}
                </text>
                <text
                  x={12}
                  y={y + 34}
                  fontSize={10}
                  fontFamily="var(--wisp-font-sans)"
                  fill="var(--wisp-muted)"
                >
                  {lane.sub}
                </text>
                <rect
                  x={AXIS_X0}
                  y={y}
                  width={AXIS_W}
                  height={LANE_H}
                  rx={RADIUS}
                  fill="var(--wisp-bg)"
                  stroke="var(--wisp-border)"
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {/* 阶段时间块（带拍内展开动效） */}
          {state.blocks.map((blk) => {
            const visible = beat >= blk.beatMin;
            const x = msToX(blk.startMs, state.axisMaxMs);
            const w = Math.max(20, ((blk.endMs - blk.startMs) / state.axisMaxMs) * AXIS_W);
            const y = LANE_Y[blk.lane] + 6;
            const h = LANE_H - 12;
            const stroke = blk.tone === 'slate' ? 'var(--wisp-border)' : toneStroke(blk.tone);
            const fill = blk.tone === 'slate' ? 'var(--wisp-surface)' : toneFill(blk.tone);
            const showLabel = w >= 22;
            const metrics = fitTextMetrics(blk.label, Math.max(12, w - 6), 11, 10, 'sans');

            return (
              <motion.g
                key={`${state.phase}-${blk.id}`}
                initial={false}
                animate={{
                  opacity: visible ? 1 : 0.14,
                  scaleX: visible ? 1 : 0.9,
                }}
                style={{ transformOrigin: `${x}px ${y + h / 2}px` }}
                transition={reducedMotion ? { duration: 0 } : MORPH_SPRING}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={RADIUS_SM}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={blk.tone === 'slate' ? 1 : 1.5}
                  strokeDasharray={blk.dashed ? '4 3' : undefined}
                />
                {showLabel && (
                  <text
                    x={x + w / 2}
                    y={y + h / 2 + 3.5}
                    textAnchor="middle"
                    fontSize={metrics.fontSize}
                    textLength={metrics.textLength}
                    lengthAdjust={metrics.textLength ? 'spacingAndGlyphs' : undefined}
                    fontWeight={600}
                    fontFamily="var(--wisp-font-sans)"
                    fill="var(--wisp-fg)"
                  >
                    {blk.label}
                  </text>
                )}
              </motion.g>
            );
          })}

          {/* 跨泳道动态传输箭头（含脉冲流与标签防压） */}
          {state.arrows.map((arrow) => renderArrow(arrow, state.axisMaxMs, beat, playToken))}

          {/* 里程碑游标平滑滑动 */}
          <motion.g
            initial={false}
            animate={{ x: markerX }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.35, ease: MANIM_EASE }}
          >
            <line
              x1={0}
              y1={66}
              x2={0}
              y2={296}
              stroke="var(--wisp-accent)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          </motion.g>
        </svg>
      </div>

      <div className="pd-flow-legend">
        <span className="pd-legend-item">
          <span className="pd-legend-swatch wisp-kit-tone" data-tone="active" />
          计算或主动读写传输
        </span>
        <span className="pd-legend-item">
          <span className="pd-legend-swatch wisp-kit-tone" data-tone="highlight" />
          HBM 延迟锁或逐层写出重叠
        </span>
        <span className="pd-legend-item">
          <span className="pd-legend-swatch wisp-kit-tone" data-tone="done" />
          释放确认与首字解码就绪
        </span>
      </div>
    </div>
  );
}
