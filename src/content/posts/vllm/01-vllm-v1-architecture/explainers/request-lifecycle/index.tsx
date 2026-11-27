import { useMemo, useState } from 'react';
import { BeatExplainer } from '@/explainers/kit';
import LifecycleStage from './LifecycleStage';
import { buildRequestLifecycleSteps, type ModeKey } from './steps';
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
      stageMinHeight={410}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={mode}
    >
      {(step, { dotToken }) => (
        <LifecycleStage
          state={step.state}
          playToken={dotToken}
          mode={mode}
          onSelectMode={setMode}
        />
      )}
    </BeatExplainer>
  );
}
