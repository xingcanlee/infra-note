import { useCallback, useMemo, useState } from 'react';
import { Stage } from 'astro-wisp/explainers';
import { InteractiveExplainer, LabSegmented } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SwimlaneTimeline from '@/explainers/kit/SwimlaneTimeline';
import { STAGE_W, assertMaxHues } from '@/explainers/kit/motion';
import {
  STREAM_MODE_ORDER,
  STREAM_PIPELINE_MODES,
  buildStreamEventPipelineSteps,
  type StreamPipelineMode,
} from './steps';
import './style.css';

export { buildStreamEventPipelineSteps };

const TOTAL_TIME = 110;
const TIMELINE_X = 16;
const TIMELINE_Y = 24;
const TIMELINE_W = STAGE_W - 32;
const GUTTER_W = 112;
const LANE_H = 40;
const LANE_GAP = 32;
const TOP_PAD = 18;
const TRACK_X = TIMELINE_X + GUTTER_W;
const TRACK_W = TIMELINE_W - GUTTER_W;
const TRACK_Y = TIMELINE_Y + TOP_PAD;

function toTimelineX(t: number): number {
  return TRACK_X + (Math.max(0, Math.min(TOTAL_TIME, t)) / TOTAL_TIME) * TRACK_W;
}

function lanePortY(fromLane: number, toLane: number): { y0: number; y1: number } {
  const fromTop = TRACK_Y + fromLane * (LANE_H + LANE_GAP);
  const toTop = TRACK_Y + toLane * (LANE_H + LANE_GAP);
  if (toLane > fromLane) {
    return { y0: fromTop + LANE_H, y1: toTop };
  }
  return { y0: fromTop, y1: toTop + LANE_H };
}

export default function StreamEventPipelineExplainer({ title }: { title?: string }) {
  assertMaxHues(['active', 'highlight', 'done']);
  const [mode, setMode] = useState<StreamPipelineMode>('single_fifo');
  const [dotToken, setDotToken] = useState(0);

  const spec = STREAM_PIPELINE_MODES[mode];
  const resolvedTitle = title ?? '单流排队、多流 Event 同步、发射气泡与主机同步陷阱交互推演';

  const modeOptions = useMemo(
    () => STREAM_MODE_ORDER.map((id) => ({ id, label: STREAM_PIPELINE_MODES[id].label })),
    [],
  );

  const handleModeChange = useCallback((next: StreamPipelineMode) => {
    setMode(next);
    setDotToken((k) => k + 1);
  }, []);

  const handleReset = useCallback(() => {
    setMode('single_fifo');
    setDotToken((k) => k + 1);
  }, []);

  const timelineBoxY = 10;
  const timelineBoxH = 246;
  const metricY = timelineBoxY + timelineBoxH + 14;
  const footerH = 50;
  const totalH = metricY + footerH + 10;

  const focusY =
    TRACK_Y + (spec.focusLane === 'forkjoin' || spec.focusLane === 1 ? LANE_H + LANE_GAP : 0) - 6;
  const focusH = (spec.focusLane === 'forkjoin' ? LANE_H * 2 + LANE_GAP : LANE_H) + 8;

  return (
    <InteractiveExplainer
      title={resolvedTitle}
      label={resolvedTitle}
      stageMinHeight={330}
      formula={spec.formulaTex}
      caption={spec.caption}
      onReset={handleReset}
      controls={
        <LabSegmented
          options={modeOptions}
          value={mode}
          onChange={handleModeChange}
          ariaLabel="切换异构流调度模式"
        />
      }
    >
      <div className="sep-wrap">
        <Stage width={STAGE_W} height={totalH} label={spec.phaseLabel}>
          <SectionBox
            x={8}
            y={timelineBoxY}
            w={STAGE_W - 16}
            h={timelineBoxH}
            tone="neutral"
            dashed={false}
          />

          <SwimlaneTimeline
            x={TIMELINE_X}
            y={TIMELINE_Y}
            w={TIMELINE_W}
            totalTime={TOTAL_TIME}
            unit="μs"
            ticks={[0, 25, 50, 75, 100]}
            lanes={spec.lanes}
            playhead={spec.playhead}
            laneH={LANE_H}
            laneGap={LANE_GAP}
            gutterW={GUTTER_W}
          />

          {spec.arrows.map((arrow) => {
            const x0 = toTimelineX(arrow.at);
            const x1 = toTimelineX(arrow.toAt);
            const { y0, y1 } = lanePortY(arrow.fromLane, arrow.toLane);
            return (
              <DataFlowArrow
                key={arrow.id}
                points={[
                  [x0, y0],
                  [x1, y1],
                ]}
                tone={arrow.tone}
                active={arrow.active}
                dashed={arrow.dashed}
                flow
                continuous
                dotToken={dotToken}
                label={arrow.label}
              />
            );
          })}

          <ActiveFocusFrame
            x={TRACK_X - 4}
            y={focusY - 1}
            w={TRACK_W + 8}
            h={focusH + 2}
            tone={spec.badgeTone}
            label={spec.focusLabel}
            labelAlign={spec.focusLane === 0 ? 'left' : 'right'}
            visible
          />

          <MetricRow
            x={8}
            y={metricY}
            w={STAGE_W - 16}
            h={footerH}
            metrics={[
              {
                label: 'CPU 发射耗时',
                value: spec.hostCost,
                tone: 'active',
                active: mode === 'launch_bubble' || mode === 'host_sync_trap',
              },
              {
                label: 'Device 跨度',
                value: spec.deviceSpan,
                tone: 'done',
                active: mode === 'single_fifo' || mode === 'dual_event',
              },
              {
                label: '同步机制',
                value: spec.syncMechanism,
                tone: spec.badgeTone,
                active: mode === 'dual_event' || mode === 'host_sync_trap',
              },
              {
                label: '流水线状态',
                value: spec.orderSafety,
                tone: spec.badgeTone,
                active: true,
              },
            ]}
          />
        </Stage>

        <p className="sep-note">{spec.note}</p>
      </div>
    </InteractiveExplainer>
  );
}
