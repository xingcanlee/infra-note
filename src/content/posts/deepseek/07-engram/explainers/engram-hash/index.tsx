import { useMemo, useState } from 'react';
import { BeatExplainer } from '@/explainers/kit';
import BucketAndLookupStage from './BucketAndLookupStage';
import CollisionAndGatherStage from './CollisionAndGatherStage';
import OfflineSetupStage from './OfflineSetupStage';
import SuffixAndXorStage from './SuffixAndXorStage';
import { BEAT_SCHEDULES, buildEngramHashSteps, type ScenarioSpec } from './steps';
import './style.css';

export { buildEngramHashSteps };

export interface EngramHashExplainerProps {
  title?: string;
}

export default function EngramHashExplainer({ title }: EngramHashExplainerProps) {
  const steps = useMemo(() => buildEngramHashSteps(), []);
  const [scenario, setScenario] = useState<ScenarioSpec['id']>('china');

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={520}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={scenario}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        const stageGroup =
          s.phase === 'normalize' || s.phase === 'multipliers'
            ? 'offline'
            : s.phase === 'suffix' || s.phase === 'xor'
              ? 'suffix-xor'
              : s.phase === 'bucket' || s.phase === 'lookup'
                ? 'bucket-lookup'
                : 'collision-gather';

        return (
          <>
            {stageGroup === 'offline' && (
              <OfflineSetupStage state={s} beat={beat} playToken={dotToken} />
            )}
            {stageGroup === 'suffix-xor' && (
              <SuffixAndXorStage state={s} beat={beat} playToken={dotToken} />
            )}
            {stageGroup === 'bucket-lookup' && (
              <BucketAndLookupStage state={s} beat={beat} playToken={dotToken} />
            )}
            {stageGroup === 'collision-gather' && (
              <CollisionAndGatherStage
                state={s}
                beat={beat}
                playToken={dotToken}
                scenario={scenario}
                onSelectScenario={setScenario}
              />
            )}
          </>
        );
      }}
    </BeatExplainer>
  );
}
