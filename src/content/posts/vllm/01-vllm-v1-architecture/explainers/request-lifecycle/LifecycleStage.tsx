import { RichText } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { IpcStage, MiniPipelineStrip, PackStage, TokenizeStage } from './FrontendAndIpcStages';
import { ScheduleStage, StreamStage, WorkerStage } from './CoreAndWorkerStages';
import { MODE_SPECS, MORPH_SPRING, type LifecycleStepState, type ModeKey } from './steps';

interface LifecycleStageProps {
  state: LifecycleStepState;
  beat: number;
  playToken: number;
  mode: ModeKey;
  onSelectMode: (m: ModeKey) => void;
}

export default function LifecycleStage({
  state,
  beat,
  playToken,
  mode,
  onSelectMode,
}: LifecycleStageProps) {
  const { phase, stepNum } = state;
  const modeInfo = MODE_SPECS[mode];
  const isV1 = mode === 'v1';

  return (
    <div className="vllm-lc-stage">
      <div className="wisp-kit-svg-frame">
        <svg
          className="vllm-lc-svg"
          viewBox="0 0 680 248"
          role="img"
          aria-label="vLLM V1 三层进程请求生命周期动态推演"
        >
          <MiniPipelineStrip phase={phase} stepNum={stepNum} />
          {phase === 'tokenize' && <TokenizeStage beat={beat} playToken={playToken} />}
          {phase === 'pack' && <PackStage beat={beat} playToken={playToken} />}
          {phase === 'ipc' && <IpcStage beat={beat} playToken={playToken} />}
          {phase === 'schedule' && <ScheduleStage beat={beat} playToken={playToken} />}
          {phase === 'worker' && <WorkerStage beat={beat} playToken={playToken} />}
          {phase === 'stream' && <StreamStage beat={beat} playToken={playToken} />}
        </svg>
      </div>

      {/* 底部架构执行模式对照（全屏自动保持紧凑不挤占舞台高度） */}
      <div className="vllm-lc-footer">
        <div className="vllm-lc-mode-bar">
          <div className="vllm-lc-mode-group" role="group" aria-label="架构执行模式对照">
            {(['v1', 'single'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className="vllm-lc-mode-btn"
                aria-pressed={mode === key}
                onClick={() => onSelectMode(key)}
              >
                {MODE_SPECS[key].label}
              </button>
            ))}
          </div>
          <span className="vllm-lc-mode-eq">
            <RichText text={modeInfo.formula} />
          </span>
        </div>

        <div className="vllm-lc-bar-track" aria-hidden="true">
          <div className="vllm-lc-bar-row">
            {isV1 ? (
              <>
                <motion.span
                  className="vllm-lc-bar-seg vllm-lc-bar-seg--done"
                  initial={false}
                  animate={{ width: '57%' }}
                  transition={MORPH_SPRING}
                >
                  EngineCore 步进 8 ms（调度 + GPU 重叠）
                </motion.span>
                <motion.span
                  className="vllm-lc-bar-seg vllm-lc-bar-seg--active"
                  initial={false}
                  animate={{ width: '43%' }}
                  transition={MORPH_SPRING}
                >
                  Frontend 异步分词/解码并行（GPU 停顿 0 ms）
                </motion.span>
              </>
            ) : (
              <>
                <motion.span
                  className="vllm-lc-bar-seg vllm-lc-bar-seg--highlight"
                  initial={false}
                  animate={{ width: '21%' }}
                  transition={MORPH_SPRING}
                >
                  分词 3ms
                </motion.span>
                <motion.span
                  className="vllm-lc-bar-seg vllm-lc-bar-seg--done"
                  initial={false}
                  animate={{ width: '65%' }}
                  transition={MORPH_SPRING}
                >
                  调度 1ms + GPU 8ms
                </motion.span>
                <motion.span
                  className="vllm-lc-bar-seg vllm-lc-bar-seg--highlight"
                  initial={false}
                  animate={{ width: '14%' }}
                  transition={MORPH_SPRING}
                >
                  解码 2ms
                </motion.span>
              </>
            )}
          </div>
        </div>

        <p className="vllm-lc-note">
          <RichText text={modeInfo.summary} />
        </p>
      </div>
    </div>
  );
}
