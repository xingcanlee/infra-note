import { useMemo, useState } from 'react';
import { Stage } from 'astro-wisp/explainers';
import { BeatExplainer, LabSegmented } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W } from '@/explainers/kit/motion';
import {
  RESET_GUARD_MODES,
  SPEC_LOOP_CASES,
  buildAclGraphDynamicControlSteps,
  type GuardEventMode,
  type SpecCaseId,
} from './steps';
import './style.css';

export { buildAclGraphDynamicControlSteps };

export default function AclGraphDynamicControlExplainer({ title }: { title?: string }) {
  const steps = useMemo(() => buildAclGraphDynamicControlSteps(), []);
  const [guardMode, setGuardMode] = useState<GuardEventMode>('with_reset');
  const [specCase, setSpecCase] = useState<SpecCaseId>('case_3');
  const resolvedTitle =
    title ?? 'TaskGrp 原地覆写、ExternalEvent 防护与 CondHandle 设备侧条件子图 4 步推演';

  const guardOptions = useMemo(
    () =>
      (Object.keys(RESET_GUARD_MODES) as GuardEventMode[]).map((id) => ({
        id,
        label: RESET_GUARD_MODES[id].label,
      })),
    [],
  );

  const specOptions = useMemo(
    () =>
      (Object.keys(SPEC_LOOP_CASES) as SpecCaseId[]).map((id) => ({
        id,
        label: SPEC_LOOP_CASES[id].label,
      })),
    [],
  );

  return (
    <BeatExplainer
      steps={steps}
      title={resolvedTitle}
      label={resolvedTitle}
      stageMinHeight={330}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={`${guardMode}-${specCase}`}
    >
      {(step, { dotToken }) => {
        const s = step.state;
        const resetSpec = s.supportsResetToggle ? RESET_GUARD_MODES[guardMode] : null;
        const loopSpec = s.supportsLoopToggle ? SPEC_LOOP_CASES[specCase] : null;

        const sqPatchMode = resetSpec ? resetSpec.sqPatchMode : s.sqPatchMode;
        const condValueText = loopSpec ? loopSpec.condText : s.condValueText;
        const activeTone = resetSpec ? resetSpec.badgeTone : s.badgeTone;
        const focusLabel = resetSpec
          ? resetSpec.focusLabel
          : loopSpec
            ? `WHILE 迭代 ${loopSpec.iters} 轮后写 0 自动退出`
            : s.focusRect.label;
        const noteText = resetSpec ? resetSpec.note : loopSpec ? loopSpec.summary : s.note;

        const boxH = 246;
        const metricY = boxH + 22;
        const totalH = metricY + 60;

        const isLoop = s.activeBranch === 'loop';
        const isCondActive = s.condHandleActive;
        const isSubActive = s.subGraphsActive;
        const isExtActive = s.extActive;

        return (
          <div className="adc-wrap">
            {s.supportsResetToggle && (
              <div className="adc-switcher">
                <span className="adc-switcher__label">
                  反事实对比（ExternalEvent 防读写冲突）：
                </span>
                <LabSegmented
                  options={guardOptions}
                  value={guardMode}
                  onChange={setGuardMode}
                  ariaLabel="切换护栏模式"
                />
              </div>
            )}

            {s.supportsLoopToggle && (
              <div className="adc-switcher">
                <span className="adc-switcher__label">反事实对比（WHILE 投机草稿置信度）：</span>
                <LabSegmented
                  options={specOptions}
                  value={specCase}
                  onChange={setSpecCase}
                  ariaLabel="切换草稿序列"
                />
              </div>
            )}

            <Stage width={STAGE_W} height={totalH} label={s.phaseLabel}>
              <SectionBox
                x={8}
                y={10}
                w={STAGE_W - 16}
                h={boxH}
                title="父图主逻辑流与动态控制节点（TaskGrp 原地更新 + CondHandle 条件子图）"
                tone="neutral"
                dashed={false}
              />

              {/* 主流顶排：K1..K2 -> TaskGrp[0] -> CondTask -> K4 */}
              <TensorBlock
                x={20}
                y={58}
                w={120}
                h={50}
                labelMode="inside"
                name="K1..K2 静态段"
                shape="Norm + QKV"
                tone="neutral"
              />

              <DataFlowArrow
                points={[
                  [140, 83],
                  [172, 83],
                ]}
                tone="active"
                active
                flow
                continuous
                dotToken={dotToken}
              />

              <TensorBlock
                x={172}
                y={58}
                w={136}
                h={50}
                labelMode="inside"
                name={s.slot2Label}
                shape={s.slot2Detail}
                tone={resetSpec ? resetSpec.badgeTone : s.slot2Tone}
                active={s.stepIndex <= 1}
              />

              <DataFlowArrow
                points={[
                  [308, 83],
                  [368, 83],
                ]}
                tone={s.stepIndex === 0 ? 'highlight' : 'active'}
                active
                flow
                continuous
                dotToken={dotToken}
              />

              <TensorBlock
                x={368}
                y={58}
                w={140}
                h={50}
                labelMode="inside"
                name={s.condTaskLabel}
                shape={s.condTaskDetail}
                tone={s.condTaskTone}
                active={s.stepIndex >= 2 || s.stepIndex === 0}
              />

              <DataFlowArrow
                points={[
                  [508, 83],
                  [542, 83],
                ]}
                tone={s.stepIndex >= 1 ? 'done' : 'highlight'}
                active={s.stepIndex >= 1}
                muted={s.stepIndex === 0}
                flow={s.stepIndex >= 1}
                continuous
                dotToken={dotToken}
              />

              <TensorBlock
                x={542}
                y={58}
                w={120}
                h={50}
                labelMode="inside"
                name="K4 后续算子"
                shape="OutProj"
                tone={s.stepIndex >= 2 ? 'done' : 'neutral'}
                muted={s.stepIndex === 0}
              />

              {/* 下排左：CondHandle 8B 条件字 */}
              <TensorBlock
                x={20}
                y={178}
                w={132}
                h={52}
                labelMode="inside"
                name="CondHandle"
                shape={isCondActive ? '8B *devAddr_ 自动复位' : '8B *devAddr_ (未启用)'}
                tone={isCondActive ? 'active' : 'neutral'}
                muted={!isCondActive}
                active={s.stepIndex === 2}
              />
              <DataFlowArrow
                points={[
                  [86, 178],
                  [86, 142],
                  [412, 142],
                  [412, 108],
                ]}
                tone={s.stepIndex >= 3 ? 'done' : 'active'}
                dashed
                active={isCondActive}
                muted={!isCondActive}
                flow={isCondActive}
                continuous
                dotToken={dotToken}
                label={isCondActive ? 'H2D/读条件字' : undefined}
                labelPos={[334, 142]}
              />

              {/* 下排中：update_stream + ExternalEvent */}
              <TensorBlock
                x={172}
                y={178}
                w={136}
                h={52}
                labelMode="inside"
                name={
                  resetSpec && guardMode === 'miss_reset'
                    ? '漏掉 Reset'
                    : isExtActive
                      ? 'update_stream'
                      : 'update_stream (未启用)'
                }
                shape={
                  resetSpec && guardMode === 'miss_reset'
                    ? '提前覆写老槽位'
                    : isExtActive
                      ? 'ExtEvent Wait+Reset'
                      : '等待 TaskGrp 划定槽位'
                }
                tone={resetSpec ? resetSpec.badgeTone : isExtActive ? 'done' : 'neutral'}
                muted={!isExtActive}
                active={s.stepIndex === 1}
              />
              <DataFlowArrow
                points={[
                  [240, 178],
                  [240, 108],
                ]}
                tone={resetSpec ? resetSpec.badgeTone : 'done'}
                active={isExtActive}
                muted={!isExtActive}
                flow={isExtActive}
                continuous
                dotToken={dotToken}
              />

              {/* 下排右：SubGraph 0 / SubGraph 1 / WHILE 循环支路 */}
              <TensorBlock
                x={358}
                y={178}
                w={144}
                h={52}
                labelMode="inside"
                name={
                  loopSpec
                    ? `WHILE (${loopSpec.iters} 轮校验)`
                    : isSubActive
                      ? 'SubGraph 0 (True)'
                      : 'SubGraph 0 (预置)'
                }
                shape="subModelNotify_"
                tone={isSubActive ? 'done' : 'neutral'}
                muted={!isSubActive}
                active={isSubActive && (s.activeBranch === 'left' || isLoop)}
              />
              <TensorBlock
                x={522}
                y={178}
                w={140}
                h={52}
                labelMode="inside"
                name={
                  isLoop
                    ? '退出写 *devAddr_=0'
                    : isSubActive
                      ? 'SubGraph 1 (Else)'
                      : 'SubGraph 1 (预置)'
                }
                shape="共享 Notify 唤醒父流"
                tone={isLoop ? 'active' : 'neutral'}
                dashed={!isLoop}
                muted={!isSubActive}
                active={isLoop}
              />

              <DataFlowArrow
                points={[
                  [438, 108],
                  [430, 178],
                ]}
                tone="done"
                active={isSubActive}
                muted={!isSubActive}
                flow={isSubActive}
                continuous
                dotToken={dotToken}
              />

              <DataFlowArrow
                points={[
                  [502, 204],
                  [522, 204],
                ]}
                tone="done"
                active={isLoop}
                muted={!isLoop}
                flow={isLoop}
                continuous
                dotToken={dotToken}
              />

              <DataFlowArrow
                points={[
                  [592, 178],
                  [602, 108],
                ]}
                tone="done"
                active={isSubActive}
                muted={!isSubActive}
                flow={isSubActive}
                continuous
                dotToken={dotToken}
                label={isSubActive ? 'Notify' : undefined}
                labelPos={[624, 142]}
              />

              <ActiveFocusFrame
                x={s.focusRect.x}
                y={s.focusRect.y}
                w={s.focusRect.w}
                h={s.focusRect.h}
                tone={activeTone}
                label={focusLabel}
                visible
              />

              <MetricRow
                x={8}
                y={metricY}
                w={STAGE_W - 16}
                h={48}
                metrics={[
                  {
                    label: 'CPU 往返同步',
                    value: s.hostCpuTrips,
                    tone: activeTone,
                    active: true,
                  },
                  {
                    label: 'TaskGrp 参数更新',
                    value: sqPatchMode,
                    tone: activeTone,
                    active: s.stepIndex === 1,
                  },
                  {
                    label: '设备条件字',
                    value: condValueText,
                    tone: s.stepIndex >= 2 ? 'active' : 'neutral',
                    active: s.stepIndex >= 2,
                  },
                  {
                    label: '子图控制模式',
                    value: isLoop
                      ? 'WHILE 芯片内循环'
                      : isSubActive
                        ? 'IF / SWITCH 唤醒'
                        : '常规序列',
                    tone: isSubActive ? 'done' : 'neutral',
                    active: s.stepIndex >= 3,
                  },
                ]}
              />
            </Stage>

            <p className="adc-note">{noteText}</p>
          </div>
        );
      }}
    </BeatExplainer>
  );
}
