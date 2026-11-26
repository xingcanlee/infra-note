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
import { BACKUP_COMPARE_MODES, buildAclGraphShadowStreamSteps, type ArgsBackupMode } from './steps';
import './style.css';

export { buildAclGraphShadowStreamSteps };

export default function AclGraphShadowStreamExplainer({ title }: { title?: string }) {
  const steps = useMemo(() => buildAclGraphShadowStreamSteps(), []);
  const [backupMode, setBackupMode] = useState<ArgsBackupMode>('with_d2d');
  const resolvedTitle = title ?? 'ACL Graph 影子模型流录制、D2D 参数备份与 Replay 握手';

  return (
    <BeatExplainer
      steps={steps}
      title={resolvedTitle}
      label={resolvedTitle}
      stageMinHeight={390}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={backupMode}
    >
      {(step, { beat }) => {
        const s = step.state;
        const activeMode = s.supportsBackupToggle ? BACKUP_COMPARE_MODES[backupMode] : null;
        const badgeTone = activeMode ? activeMode.badgeTone : s.badgeTone;
        const argsState = activeMode ? activeMode.argsBackupState : s.argsBackupState;
        const sqCqState = activeMode ? activeMode.sqCqState : s.sqCqState;
        const focusLabel = activeMode ? activeMode.focusLabel : s.focusLabel;

        const footerH = 44;
        const timelineY = 12;
        const timelineH = 180;
        const metricY = timelineY + timelineH + 14;
        const totalH = metricY + footerH + 12;

        const beatLanes: TimelineLane[] = s.lanes.map((lane, lIdx) => ({
          ...lane,
          blocks: lane.blocks.map((blk) => ({
            ...blk,
            tone: activeMode && lIdx === 2 ? activeMode.badgeTone : blk.tone,
            visible: lIdx === 0 ? true : lIdx === 1 ? beat >= 1 : beat >= 2,
          })),
        }));
        const beatSyncs: TimelineSyncEvent[] = s.syncEvents.map((ev) => ({
          ...ev,
          visible: beat >= (ev.toLane === 1 ? 1 : 2),
        }));

        const laneTopY = timelineY + 6 + 14 + (s.stepIndex === 0 ? 48 : 96);

        return (
          <div className="ass-wrap">
            {s.supportsBackupToggle && (
              <div className="ass-switcher">
                <span className="ass-switcher__label">反事实对比（临时参数区隔离）：</span>
                <div className="ass-switcher__group" role="group" aria-label="切换参数备份策略">
                  {(Object.keys(BACKUP_COMPARE_MODES) as ArgsBackupMode[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="ass-switcher__btn"
                      aria-pressed={backupMode === id}
                      onClick={() => setBackupMode(id)}
                    >
                      {BACKUP_COMPARE_MODES[id].label}
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
                totalTime={95}
                unit="μs"
                ticks={[0, 20, 40, 60, 80]}
                lanes={beatLanes}
                syncEvents={beatSyncs}
                playhead={beat >= 2 ? s.playhead : undefined}
                laneH={32}
                laneGap={16}
                gutterW={124}
              />

              <ActiveFocusFrame
                x={136}
                y={laneTopY - 1}
                w={STAGE_W - 152}
                h={34}
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
                    label: '当前阶段',
                    value: s.stepIndex <= 3 ? 'Capture 录制' : 'Replay 重放',
                    tone: 'active',
                    active: true,
                  },
                  {
                    label: 'Args 隔离状态',
                    value: argsState,
                    tone: badgeTone,
                    active: s.stepIndex >= 2,
                  },
                  {
                    label: 'Notify 握手',
                    value: s.notifyState,
                    tone: 'highlight',
                    active: s.stepIndex >= 3,
                  },
                  {
                    label: '队列绑定策略',
                    value: sqCqState,
                    tone: badgeTone,
                    active: s.stepIndex >= 4,
                  },
                ]}
              />
            </Stage>

            {activeMode && <p className="ass-note">{activeMode.note}</p>}
          </div>
        );
      }}
    </BeatExplainer>
  );
}
