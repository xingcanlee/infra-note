import { useMemo, useState } from 'react';
import { Stage } from 'astro-wisp/explainers';
import { BeatExplainer } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SwimlaneTimeline, {
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit/SwimlaneTimeline';
import { STAGE_W } from '@/explainers/kit/motion';
import { RACE_COMPARE_MODES, buildStreamEventPipelineSteps, type StreamSyncMode } from './steps';
import './style.css';

export { buildStreamEventPipelineSteps };

export default function StreamEventPipelineExplainer({ title }: { title?: string }) {
  const steps = useMemo(() => buildStreamEventPipelineSteps(), []);
  const [syncMode, setSyncMode] = useState<StreamSyncMode>('with_event');
  const resolvedTitle = title ?? 'Host 异步入队、双流 Event 同步与 Fork-Join 并发流水线';

  return (
    <BeatExplainer
      steps={steps}
      title={resolvedTitle}
      label={resolvedTitle}
      stageMinHeight={388}
      getBeats={(step) => step.state.beats}
      getFormula={(step) =>
        step.state.supportsRaceToggle
          ? RACE_COMPARE_MODES[syncMode].formulaTex
          : step.state.formulaTex
      }
      replayTrigger={syncMode}
    >
      {(step, { beat }) => {
        const s = step.state;
        const activeMode = s.supportsRaceToggle ? RACE_COMPARE_MODES[syncMode] : null;
        const lanes = activeMode ? activeMode.lanes : s.lanes;
        const syncEvents = activeMode ? activeMode.syncEvents : s.syncEvents;
        const syncMechanism = activeMode ? activeMode.syncMechanism : s.syncMechanism;
        const orderSafety = activeMode ? activeMode.orderSafety : s.orderSafety;
        const badgeTone = activeMode ? activeMode.badgeTone : s.badgeTone;
        const focusLabel = activeMode ? activeMode.focusLabel : s.focusLabel;

        const footerH = 44;
        const timelineY = 12;
        const timelineH = 180;
        const metricY = timelineY + timelineH + 14;
        const totalH = metricY + footerH + 12;

        const beatLanes: TimelineLane[] = lanes.map((lane, lIdx) => ({
          ...lane,
          blocks: lane.blocks.map((blk) => ({
            ...blk,
            visible: lIdx === 0 ? true : lIdx === 1 ? beat >= 1 : beat >= 2,
          })),
        }));
        const beatSyncs: TimelineSyncEvent[] = syncEvents.map((ev) => ({
          ...ev,
          visible: beat >= (ev.toLane === 1 ? 1 : 2),
        }));

        const laneTopY =
          timelineY +
          6 +
          14 +
          (s.focusLane === 'forkjoin' || s.focusLane === 1 ? 48 : s.focusLane === 2 ? 96 : 0);
        const focusH = s.focusLane === 'forkjoin' ? 82 : 34;

        return (
          <div className="sep-wrap">
            {s.supportsRaceToggle && (
              <div className="sep-switcher">
                <span className="sep-switcher__label">反事实对比（多流跨队列协同）：</span>
                <div className="sep-switcher__group" role="group" aria-label="切换同步方式">
                  {(Object.keys(RACE_COMPARE_MODES) as StreamSyncMode[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="sep-switcher__btn"
                      aria-pressed={syncMode === id}
                      onClick={() => setSyncMode(id)}
                    >
                      {RACE_COMPARE_MODES[id].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Stage width={STAGE_W} height={totalH} label={s.phaseLabel}>
              <SectionBox
                x={8}
                y={timelineY - 2}
                w={STAGE_W - 16}
                h={timelineH + 6}
                tone="neutral"
                dashed={false}
              />
              <SwimlaneTimeline
                x={16}
                y={timelineY + 6}
                w={STAGE_W - 32}
                totalTime={110}
                unit="μs"
                ticks={[0, 25, 50, 75, 100]}
                lanes={beatLanes}
                syncEvents={beatSyncs}
                playhead={beat >= 2 ? s.playhead : undefined}
                laneH={32}
                laneGap={16}
                gutterW={112}
              />

              <ActiveFocusFrame
                x={124}
                y={laneTopY - 1}
                w={STAGE_W - 140}
                h={focusH}
                tone={badgeTone}
                label={focusLabel}
                visible={beat >= 3}
              />

              <MetricRow
                x={8}
                y={metricY}
                w={STAGE_W - 16}
                h={footerH}
                revealed={beat >= 3}
                metrics={[
                  {
                    label: 'CPU 发射耗时',
                    value: s.hostCost,
                    tone: 'active',
                    active: s.stepIndex === 0,
                  },
                  {
                    label: 'Device 端跨度',
                    value: s.deviceSpan,
                    tone: 'done',
                    active: s.stepIndex === 1 || s.stepIndex === 3,
                  },
                  {
                    label: '同步机制',
                    value: syncMechanism,
                    tone: badgeTone,
                    active: s.stepIndex >= 2,
                  },
                  {
                    label: '执行结果',
                    value: orderSafety,
                    tone: badgeTone,
                    active: s.stepIndex >= 2,
                  },
                ]}
              />
            </Stage>

            {activeMode && <p className="sep-note">{activeMode.note}</p>}
          </div>
        );
      }}
    </BeatExplainer>
  );
}
