import { useMemo, useState } from 'react';
import { Stage } from 'astro-wisp/explainers';
import { BeatExplainer, SvgBeatGroup } from '@/explainers/kit';
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
  const resolvedTitle = title ?? 'TaskGrp 参数原地更新与 CondHandle 条件子图推演';

  return (
    <BeatExplainer
      steps={steps}
      title={resolvedTitle}
      label={resolvedTitle}
      stageMinHeight={388}
      getBeats={(step) => step.state.beats}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={`${guardMode}-${specCase}`}
    >
      {(step, { beat }) => {
        const s = step.state;
        const resetSpec = s.supportsResetToggle ? RESET_GUARD_MODES[guardMode] : null;
        const loopSpec = s.supportsLoopToggle ? SPEC_LOOP_CASES[specCase] : null;

        const sqPatchMode = resetSpec ? resetSpec.sqPatchMode : s.sqPatchMode;
        const condValueText = loopSpec ? loopSpec.condText : s.condValueText;
        const activeTone = resetSpec ? resetSpec.badgeTone : s.badgeTone;
        const focusLabel = resetSpec
          ? resetSpec.focusLabel
          : loopSpec
            ? `WHILE 迭代 ${loopSpec.iters} 轮后自动退出`
            : s.focusRect.label;

        const boxH = 178;
        const metricY = boxH + 18;
        const totalH = metricY + 56;
        const flowPhase = beat >= 2 ? 1 : 0;

        return (
          <div className="adc-wrap">
            {s.supportsResetToggle && (
              <div className="adc-switcher">
                <span className="adc-switcher__label">
                  反事实对比（ExternalEvent 防读写冲突）：
                </span>
                <div className="adc-switcher__group" role="group" aria-label="切换护栏模式">
                  {(Object.keys(RESET_GUARD_MODES) as GuardEventMode[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="adc-switcher__btn"
                      aria-pressed={guardMode === id}
                      onClick={() => setGuardMode(id)}
                    >
                      {RESET_GUARD_MODES[id].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {s.supportsLoopToggle && (
              <div className="adc-switcher">
                <span className="adc-switcher__label">反事实对比（WHILE 投机草稿置信度）：</span>
                <div className="adc-switcher__group" role="group" aria-label="切换草稿序列">
                  {(Object.keys(SPEC_LOOP_CASES) as SpecCaseId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="adc-switcher__btn"
                      aria-pressed={specCase === id}
                      onClick={() => setSpecCase(id)}
                    >
                      {SPEC_LOOP_CASES[id].label}
                    </button>
                  ))}
                </div>
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

              <TensorBlock
                x={20}
                y={56}
                w={120}
                h={44}
                labelMode="inside"
                name="K1..K2 静态段"
                detail="Norm + QKV"
                tone="neutral"
              />

              <DataFlowArrow
                points={[
                  [140, 78],
                  [172, 78],
                ]}
                tone="neutral"
                flow={flowPhase > 0}
              />

              <TensorBlock
                x={172}
                y={56}
                w={136}
                h={44}
                labelMode="inside"
                name={s.slot2Label}
                detail="isUpdateSinkSqe=1"
                tone={resetSpec ? resetSpec.badgeTone : s.slot2Tone}
                active={s.stepIndex === 1 || s.stepIndex === 2}
              />

              <DataFlowArrow
                points={[
                  [308, 78],
                  [368, 78],
                ]}
                tone="neutral"
                flow={flowPhase > 0}
              />

              <TensorBlock
                x={368}
                y={56}
                w={140}
                h={44}
                labelMode="inside"
                name={s.condTaskLabel}
                detail="SQE+1 notify wait"
                tone={s.condTaskTone}
                active={s.stepIndex >= 3}
              />

              <DataFlowArrow
                points={[
                  [508, 78],
                  [542, 78],
                ]}
                tone="neutral"
                flow={flowPhase > 0}
              />

              <TensorBlock
                x={542}
                y={56}
                w={120}
                h={44}
                labelMode="inside"
                name="K4 后续算子"
                detail="OutProj"
                tone="neutral"
              />

              <SvgBeatGroup visible={s.showExtEvent && beat >= 1}>
                <TensorBlock
                  x={172}
                  y={124}
                  w={136}
                  h={46}
                  labelMode="inside"
                  name={
                    guardMode === 'miss_reset' && s.supportsResetToggle
                      ? '漏掉 Reset'
                      : 'update_stream'
                  }
                  detail={
                    guardMode === 'miss_reset' && s.supportsResetToggle
                      ? '提前覆盖老槽位'
                      : 'ExtEvent Wait+Reset'
                  }
                  tone={resetSpec ? resetSpec.badgeTone : 'done'}
                  active={s.stepIndex === 2}
                />
                <DataFlowArrow
                  points={[
                    [240, 124],
                    [240, 102],
                  ]}
                  tone={resetSpec ? resetSpec.badgeTone : 'done'}
                  active={s.stepIndex === 2}
                  flow={flowPhase > 0}
                />
              </SvgBeatGroup>

              <SvgBeatGroup visible={s.showCondHandle && beat >= 1}>
                <TensorBlock
                  x={20}
                  y={124}
                  w={132}
                  h={46}
                  labelMode="inside"
                  name="CondHandle"
                  detail="8B *devAddr_"
                  tone="highlight"
                  active={s.stepIndex === 3}
                />
                <DataFlowArrow
                  points={[
                    [152, 147],
                    [368, 94],
                  ]}
                  tone="highlight"
                  dashed
                  active={s.stepIndex === 3}
                  flow={flowPhase > 0}
                />
              </SvgBeatGroup>

              <SvgBeatGroup visible={s.showSubGraphs && beat >= 2}>
                <TensorBlock
                  x={358}
                  y={124}
                  w={144}
                  h={46}
                  labelMode="inside"
                  name={loopSpec ? `SubGraph (${loopSpec.iters} 轮)` : 'SubGraph 0 (True)'}
                  detail="subModelNotify_"
                  tone="done"
                  active={s.activeBranch === 'left' || s.activeBranch === 'loop'}
                />
                <TensorBlock
                  x={522}
                  y={124}
                  w={140}
                  h={46}
                  labelMode="inside"
                  name={s.activeBranch === 'loop' ? '退出写 *devAddr_=0' : 'SubGraph 1 (Else)'}
                  detail="共享 Notify 唤醒"
                  tone={s.activeBranch === 'loop' ? 'active' : 'neutral'}
                  dashed={s.activeBranch !== 'loop'}
                  active={s.activeBranch === 'right' || s.activeBranch === 'loop'}
                />
                <DataFlowArrow
                  points={[
                    [438, 100],
                    [430, 124],
                  ]}
                  tone="done"
                  active
                  flow={flowPhase > 0}
                />
              </SvgBeatGroup>

              <ActiveFocusFrame
                x={s.focusRect.x}
                y={s.focusRect.y}
                w={s.focusRect.w}
                h={s.focusRect.h}
                tone={activeTone}
                label={focusLabel}
                visible={beat >= 3}
              />

              <MetricRow
                x={8}
                y={metricY}
                w={STAGE_W - 16}
                h={44}
                revealed={beat >= 3}
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
                    active: s.stepIndex === 2,
                  },
                  {
                    label: '设备条件字',
                    value: condValueText,
                    tone: 'highlight',
                    active: s.stepIndex >= 3,
                  },
                  {
                    label: '子图控制模式',
                    value:
                      s.activeBranch === 'loop'
                        ? 'WHILE 芯片内循环'
                        : s.showSubGraphs
                          ? 'IF / SWITCH 唤醒'
                          : '常规序列',
                    tone: 'done',
                    active: s.stepIndex >= 4,
                  },
                ]}
              />
            </Stage>

            {resetSpec && <p className="adc-note">{resetSpec.note}</p>}
            {loopSpec && <p className="adc-note">{loopSpec.summary}</p>}
          </div>
        );
      }}
    </BeatExplainer>
  );
}
