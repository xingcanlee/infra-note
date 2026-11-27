import { useMemo, useState } from 'react';
import { Stage } from 'astro-wisp/explainers';
import { BeatExplainer, LabSegmented } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SwimlaneTimeline, { type TimelineLane } from '@/explainers/kit/SwimlaneTimeline';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W } from '@/explainers/kit/motion';
import { BACKUP_COMPARE_MODES, buildAclGraphShadowStreamSteps, type ArgsBackupMode } from './steps';
import './style.css';

export { buildAclGraphShadowStreamSteps };

const TOTAL_TIME = 95;
const TIMELINE_X = 16;
const TIMELINE_Y = 22;
const TIMELINE_W = STAGE_W - 32;
const GUTTER_W = 124;
const LANE_H = 36;
const LANE_GAP = 28;
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

export default function AclGraphShadowStreamExplainer({ title }: { title?: string }) {
  const steps = useMemo(() => buildAclGraphShadowStreamSteps(), []);
  const [backupMode, setBackupMode] = useState<ArgsBackupMode>('with_d2d');
  const resolvedTitle =
    title ?? 'ACL Graph 影子模型流重定向、D2D 参数备份与 EndGraph Notify 握手 4 步推演';

  const backupOptions = useMemo(
    () =>
      (Object.keys(BACKUP_COMPARE_MODES) as ArgsBackupMode[]).map((id) => ({
        id,
        label: BACKUP_COMPARE_MODES[id].label,
      })),
    [],
  );

  return (
    <BeatExplainer
      steps={steps}
      title={resolvedTitle}
      label={resolvedTitle}
      stageMinHeight={400}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={backupMode}
    >
      {(step, { dotToken }) => {
        const s = step.state;
        const activeMode = s.supportsBackupToggle ? BACKUP_COMPARE_MODES[backupMode] : null;
        const badgeTone = activeMode ? activeMode.badgeTone : s.badgeTone;
        const argsState = activeMode ? activeMode.argsBackupState : s.argsBackupState;
        const sqCqState = activeMode ? activeMode.sqCqState : s.sqCqState;
        const focusLabel = activeMode ? activeMode.focusLabel : s.focusLabel;
        const memory = activeMode ? activeMode.memory : s.memory;
        const noteText = activeMode ? activeMode.note : s.note;

        const lanes: TimelineLane[] = s.lanes.map((lane, lIdx) => ({
          ...lane,
          blocks: lane.blocks.map((blk) => ({
            ...blk,
            tone: activeMode && lIdx === 2 ? activeMode.badgeTone : blk.tone,
          })),
        }));

        const timelineBoxY = 10;
        const timelineBoxH = 220;
        const memBoxY = timelineBoxY + timelineBoxH + 16;
        const memBoxH = 88;
        const metricY = memBoxY + memBoxH + 14;
        const footerH = 48;
        const totalH = metricY + footerH + 10;

        const focusRect =
          s.focusLane === 'memory'
            ? { x: 10, y: memBoxY + 2, w: STAGE_W - 20, h: memBoxH - 4 }
            : s.focusLane === 'handshake'
              ? {
                  x: TRACK_X - 4,
                  y: TRACK_Y + LANE_H + LANE_GAP - 2,
                  w: TRACK_W + 8,
                  h: LANE_H * 2 + LANE_GAP + 4,
                }
              : s.focusLane === 1
                ? {
                    x: TRACK_X - 4,
                    y: TRACK_Y + LANE_H + LANE_GAP - 2,
                    w: TRACK_W + 8,
                    h: LANE_H + 4,
                  }
                : {
                    x: TRACK_X - 4,
                    y: TRACK_Y + 2 * (LANE_H + LANE_GAP) - 2,
                    w: TRACK_W + 8,
                    h: LANE_H + 4,
                  };

        return (
          <div className="ass-wrap">
            {s.supportsBackupToggle && (
              <div className="ass-switcher">
                <span className="ass-switcher__label">反事实对比（临时参数区隔离）：</span>
                <LabSegmented
                  options={backupOptions}
                  value={backupMode}
                  onChange={setBackupMode}
                  ariaLabel="切换参数备份策略"
                />
              </div>
            )}

            <Stage width={STAGE_W} height={totalH} label={s.phaseLabel}>
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
                ticks={[0, 20, 40, 60, 80]}
                lanes={lanes}
                playhead={s.playhead}
                laneH={LANE_H}
                laneGap={LANE_GAP}
                gutterW={GUTTER_W}
              />

              {s.arrows.map((arrow) => {
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
                    tone={activeMode ? activeMode.badgeTone : arrow.tone}
                    active={arrow.active}
                    dashed={arrow.dashed}
                    flow
                    continuous
                    dotToken={dotToken}
                    label={arrow.label}
                  />
                );
              })}

              {/* 统一参数显存地址与物理通道生命周期区 */}
              <SectionBox
                x={8}
                y={memBoxY}
                w={STAGE_W - 16}
                h={memBoxH}
                title="参数显存地址与物理队列生命周期"
                tone="neutral"
                dashed={false}
              />

              <TensorBlock
                x={20}
                y={memBoxY + 32}
                w={176}
                h={44}
                labelMode="inside"
                name={memory.srcTitle}
                shape={memory.srcDetail}
                tone={memory.srcTone}
                active={s.stepIndex === 1 && backupMode === 'no_d2d'}
              />

              <DataFlowArrow
                points={[
                  [196, memBoxY + 54],
                  [252, memBoxY + 54],
                ]}
                tone={memory.copyTone}
                active={memory.copyActive}
                muted={!memory.copyActive}
                flow={memory.copyActive}
                continuous
                dotToken={dotToken}
                label={memory.copyLabel}
              />

              <TensorBlock
                x={252}
                y={memBoxY + 32}
                w={186}
                h={44}
                labelMode="inside"
                name={memory.bufTitle}
                shape={memory.bufDetail}
                tone={memory.bufTone}
                active={s.stepIndex === 1 || s.stepIndex === 2}
              />

              <DataFlowArrow
                points={[
                  [438, memBoxY + 54],
                  [492, memBoxY + 54],
                ]}
                tone={memory.bindTone}
                active={memory.bindActive}
                muted={!memory.bindActive}
                flow={memory.bindActive}
                continuous
                dotToken={dotToken}
                label={memory.bindLabel}
              />

              <TensorBlock
                x={492}
                y={memBoxY + 32}
                w={168}
                h={44}
                labelMode="inside"
                name={memory.dstTitle}
                shape={memory.dstDetail}
                tone={memory.dstTone}
                active={s.stepIndex >= 2}
              />

              <ActiveFocusFrame
                x={focusRect.x}
                y={focusRect.y}
                w={focusRect.w}
                h={focusRect.h}
                tone={badgeTone}
                label={focusLabel}
                labelAlign="right"
                visible
              />

              <MetricRow
                x={8}
                y={metricY}
                w={STAGE_W - 16}
                h={footerH}
                metrics={[
                  {
                    label: '当前阶段',
                    value:
                      s.stepIndex === 0
                        ? 'Eager 基准'
                        : s.stepIndex === 1
                          ? 'Capture 录制'
                          : s.stepIndex === 2
                            ? '闭合 + BuildSqCq'
                            : 'Replay 重放',
                    tone: 'active',
                    active: true,
                  },
                  {
                    label: 'Args 隔离状态',
                    value: argsState,
                    tone: badgeTone,
                    active: s.stepIndex >= 1,
                  },
                  {
                    label: 'Notify 握手',
                    value: s.notifyState,
                    tone: 'highlight',
                    active: s.stepIndex >= 2,
                  },
                  {
                    label: '队列绑定策略',
                    value: sqCqState,
                    tone: badgeTone,
                    active: s.stepIndex >= 2,
                  },
                ]}
              />
            </Stage>

            <p className="ass-note">{noteText}</p>
          </div>
        );
      }}
    </BeatExplainer>
  );
}
