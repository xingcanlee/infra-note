import { useMemo } from 'react';
import { BeatExplainer } from '@/explainers/kit';
import PdFlowStage from './PdFlowStage';
import { BEAT_SCHEDULES, buildMooncakePdFlowSteps } from './steps';
import './style.css';

export { buildMooncakePdFlowSteps };

export interface MooncakePdFlowExplainerProps {
  title?: string;
}

export default function MooncakePdFlowExplainer({ title }: MooncakePdFlowExplainerProps) {
  const steps = useMemo(() => buildMooncakePdFlowSteps(), []);

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={390}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { beat, dotToken, reducedMotion }) => (
        <PdFlowStage
          state={step.state}
          beat={beat}
          playToken={dotToken}
          reducedMotion={reducedMotion}
        />
      )}
    </BeatExplainer>
  );
}
