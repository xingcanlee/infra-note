import { useMemo } from 'react';
import { BeatExplainer } from '@/explainers/kit';
import PrepareInputsStage from './PrepareInputsStage';
import { buildPrepareInputsSteps } from './steps';
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
      wide
      stageMinHeight={430}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { dotToken }) => <PrepareInputsStage state={step.state} playToken={dotToken} />}
    </BeatExplainer>
  );
}
