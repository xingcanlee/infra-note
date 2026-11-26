import { useMemo, useState } from 'react';
import { BeatExplainer } from '@/explainers/kit';
import LifecycleStage from './LifecycleStage';
import { BEAT_SCHEDULES, buildRequestLifecycleSteps, type ModeKey } from './steps';
import './style.css';

export { buildRequestLifecycleSteps };

export interface RequestLifecycleExplainerProps {
  title?: string;
}

export default function RequestLifecycleExplainer({ title }: RequestLifecycleExplainerProps) {
  const steps = useMemo(() => buildRequestLifecycleSteps(), []);
  const [mode, setMode] = useState<ModeKey>('v1');

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={396}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={mode}
    >
      {(step, { beat, dotToken }) => (
        <LifecycleStage
          state={step.state}
          beat={beat}
          playToken={dotToken}
          mode={mode}
          onSelectMode={setMode}
        />
      )}
    </BeatExplainer>
  );
}
