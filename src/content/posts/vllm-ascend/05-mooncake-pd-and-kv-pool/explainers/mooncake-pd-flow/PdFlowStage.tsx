import { Stage } from 'astro-wisp/explainers';
import {
  DataFlowArrow,
  MetricRow,
  RADIUS,
  STAGE_W,
  SwimlaneTimeline,
  resolveToneFill,
  resolveToneStroke,
  type MetricItem,
} from '@/explainers/kit';
import { PD_AXIS_MAX_MS, PD_TICKS, type PdModeSpec } from './steps';

export interface PdFlowStageProps {
  modeSpec: PdModeSpec;
  flowToken: number;
}

const TOPO_NODES = [
  { key: 'pNode', x: 14, w: 140, title: 'P 节点 HBM', sub: '预填充 8.0 ms' },
  { key: 'rdma', x: 188, w: 136, title: 'RDMA 跨机', sub: '4 x 1.5 ms' },
  { key: 'host', x: 358, w: 144, title: 'D Host DRAM', sub: '2 MiB 大页池' },
  { key: 'dNode', x: 536, w: 130, title: 'D 节点 HBM', sub: '解码 1.0 ms' },
] as const;

export default function PdFlowStage({ modeSpec, flowToken }: PdFlowStageProps) {
  const { pathActive, pathTone } = modeSpec;

  const metrics: MetricItem[] = [
    {
      label: '传输模式',
      value: modeSpec.tabLabel,
      tone: pathTone,
      active: true,
    },
    {
      label: 'P 端显存锁定',
      value: modeSpec.vramLock,
      tone: modeSpec.id === 'host-hit' ? 'done' : 'highlight',
      active: true,
    },
    {
      label: '首字延迟 TTFT',
      value: modeSpec.ttft,
      tone: 'done',
      active: true,
    },
    {
      label: 'P 端释放条件',
      value: modeSpec.releaseRule,
      tone: 'active',
    },
  ];

  return (
    <div className="pd-flow-stage">
      <Stage width={STAGE_W} height={404} label={`${modeSpec.modeName} 四层 PD 分离泳道时序`}>
        {/* 顶部硬件拓扑微条 + 数据流向箭头 */}
        {TOPO_NODES.map((n) => {
          const active = pathActive[n.key];
          const tone = !active
            ? 'mask'
            : n.key === 'host' && modeSpec.id === 'host-hit'
              ? 'done'
              : pathTone;
          const fill = active ? resolveToneFill(tone) : 'var(--wisp-surface)';
          const stroke = active ? resolveToneStroke(tone) : 'var(--wisp-border)';
          return (
            <g key={n.key} opacity={active ? 1 : 0.36}>
              <rect
                x={n.x}
                y={10}
                width={n.w}
                height={36}
                rx={RADIUS}
                fill={fill}
                stroke={stroke}
                strokeWidth={active ? 1.5 : 1}
                strokeDasharray={!active ? '4 3' : undefined}
              />
              <text
                x={n.x + n.w / 2}
                y={24}
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
                y={38}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--wisp-font-sans)"
                fill="var(--wisp-muted)"
              >
                {active ? n.sub : '跳过'}
              </text>
            </g>
          );
        })}

        {/* P -> RDMA */}
        <DataFlowArrow
          points={[
            [154, 28],
            [188, 28],
          ]}
          tone={pathTone}
          active={pathActive.pNode && pathActive.rdma}
          muted={!pathActive.pNode}
          flow={pathActive.pNode && pathActive.rdma}
          continuous={true}
          dotToken={flowToken}
        />
        {/* RDMA -> D HBM (Pull / Push direct) or RDMA -> Host DRAM (D2RH) */}
        <DataFlowArrow
          points={
            modeSpec.id === 'd2rh'
              ? [
                  [324, 28],
                  [358, 28],
                ]
              : [
                  [256, 46],
                  [256, 56],
                  [601, 56],
                  [601, 46],
                ]
          }
          tone={pathTone}
          active={
            pathActive.rdma &&
            (modeSpec.id === 'd2rh' || modeSpec.id === 'pull' || modeSpec.id === 'push')
          }
          visible={pathActive.rdma}
          muted={!pathActive.rdma}
          flow={pathActive.rdma}
          continuous={true}
          dotToken={flowToken}
          label={modeSpec.id === 'd2rh' ? 'Hop1' : modeSpec.id === 'push' ? 'Push' : 'Pull'}
          labelPos={modeSpec.id === 'd2rh' ? [341, 16] : [428, 56]}
        />
        {/* Host DRAM -> D HBM (D2RH / Host Hit) */}
        <DataFlowArrow
          points={[
            [502, 28],
            [536, 28],
          ]}
          tone={modeSpec.id === 'host-hit' ? 'done' : 'active'}
          active={pathActive.host}
          visible={pathActive.host}
          muted={!pathActive.host}
          flow={pathActive.host}
          continuous={true}
          dotToken={flowToken}
          label="H2D"
          labelPos={[519, 16]}
        />

        {/* 单一 4 层 PD 分离 SwimlaneTimeline（固定 0..24 ms 标尺，平滑平移重叠） */}
        <SwimlaneTimeline
          x={12}
          y={70}
          w={STAGE_W - 24}
          totalTime={PD_AXIS_MAX_MS}
          unit="ms"
          ticks={PD_TICKS}
          lanes={modeSpec.lanes}
          syncEvents={modeSpec.syncEvents}
          laneH={36}
          laneGap={22}
          gutterW={116}
          playhead={modeSpec.ttftMs}
          title={`${modeSpec.modeName} · ${modeSpec.pathLabel}`}
        />

        <MetricRow x={12} y={342} w={STAGE_W - 24} h={50} metrics={metrics} />
      </Stage>
    </div>
  );
}
