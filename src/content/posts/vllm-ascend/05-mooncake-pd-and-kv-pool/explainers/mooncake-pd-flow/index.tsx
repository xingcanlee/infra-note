import { useMemo, useState } from 'react';
import { InteractiveExplainer, LabSegmented } from '@/explainers/kit';
import PdFlowStage from './PdFlowStage';
import { PD_MODES, buildMooncakePdFlowSteps, type PdModeId } from './steps';
import './style.css';

export { buildMooncakePdFlowSteps };

export interface MooncakePdFlowExplainerProps {
  title?: string;
}

export default function MooncakePdFlowExplainer({
  title = '图 1：Mooncake PD 分离四模式时序交互实验',
}: MooncakePdFlowExplainerProps) {
  const [mode, setMode] = useState<PdModeId>('pull');
  const [flowToken, setFlowToken] = useState(0);

  const modeSpec = useMemo(() => PD_MODES.find((m) => m.id === mode) ?? PD_MODES[0], [mode]);
  const options = useMemo(() => PD_MODES.map((m) => ({ id: m.id, label: m.tabLabel })), []);

  const handleSelectMode = (next: PdModeId) => {
    setMode(next);
    setFlowToken((t) => t + 1);
  };

  return (
    <InteractiveExplainer
      title={title}
      label="Mooncake PD 分离四模式时序实验"
      wide
      stageMinHeight={390}
      formula={modeSpec.formulaTex}
      caption={modeSpec.caption}
      onReset={() => handleSelectMode('pull')}
      controls={
        <LabSegmented
          ariaLabel="Mooncake PD 传输模式切换"
          options={options}
          value={mode}
          onChange={handleSelectMode}
        />
      }
    >
      <PdFlowStage modeSpec={modeSpec} flowToken={flowToken} />
    </InteractiveExplainer>
  );
}
