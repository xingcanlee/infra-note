import { useMemo } from 'react';
import { BeatExplainer } from '@/explainers/kit';
import PrepareInputsStage from './PrepareInputsStage';
import { BEAT_SCHEDULES, buildPrepareInputsSteps } from './steps';
import './style.css';

export { buildPrepareInputsSteps };

export interface PrepareInputsExplainerProps {
  title?: string;
}

export default function PrepareInputsExplainer({ title }: PrepareInputsExplainerProps) {
  const steps = useMemo(() => buildPrepareInputsSteps(), []);

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={430}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat, dotToken }) => (
        <PrepareInputsStage state={step.state} beat={beat} playToken={dotToken} />
      )}
    </BeatExplainer>
  );
}
