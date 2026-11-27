import { RichText } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  ActiveFocusFrame,
  DataFlowArrow,
  RADIUS,
  RADIUS_SM,
  resolveToneFill,
  resolveToneStroke,
  type AnyTone,
} from '@/explainers/kit';
import { MODE_SPECS, MORPH_SPRING, type LifecycleStepState, type ModeKey } from './steps';

interface LifecycleStageProps {
  state: LifecycleStepState;
  playToken: number;
  mode: ModeKey;
  onSelectMode: (m: ModeKey) => void;
}

interface SubCardProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  active: boolean;
  tone: AnyTone;
}

function ProcessSubCard({ x, y, w, h, title, sub, active, tone }: SubCardProps) {
  const fill = active ? resolveToneFill(tone) : 'var(--wisp-bg)';
  const stroke = active ? resolveToneStroke(tone) : 'var(--wisp-border)';
  return (
    <g>
      <motion.rect
        initial={false}
        animate={{ strokeWidth: active ? 1.5 : 1, fillOpacity: active ? 1 : 0.85 }}
        transition={MORPH_SPRING}
        x={x}
        y={y}
        width={w}
        height={h}
        rx={RADIUS_SM}
        fill={fill}
        stroke={stroke}
      />
      <text
        x={x + w / 2}
        y={y + 20}
        textAnchor="middle"
        className="vllm-lc-mono-sm"
        fontWeight={700}
      >
        {title}
      </text>
      <text x={x + w / 2} y={y + 38} textAnchor="middle" className="vllm-lc-note-svg">
        {sub}
      </text>
    </g>
  );
}

export default function LifecycleStage({
  state,
  playToken,
  mode,
  onSelectMode,
}: LifecycleStageProps) {
  const modeInfo = MODE_SPECS[mode];
  const isV1 = mode === 'v1';
  const p = state.phase;

  const col1Stroke =
    state.activeCol === 'api' ? resolveToneStroke(state.tone) : 'var(--wisp-border)';
  const col2Stroke = state.activeCol === 'core' ? resolveToneStroke('done') : 'var(--wisp-border)';
  const col3Stroke =
    state.activeCol === 'worker' ? resolveToneStroke('highlight') : 'var(--wisp-border)';

  return (
    <div className="vllm-lc-stage">
      <div className="wisp-kit-svg-frame">
        <svg
          className="vllm-lc-svg"
          viewBox="0 0 680 260"
          role="img"
          aria-label="vLLM V1 三层进程请求生命周期持久化架构图"
        >
          {/* 顶部三列角色标题 */}
          <text x={109} y={16} textAnchor="middle" className="vllm-lc-group-title">
            {isV1 ? 'Tier 1 · APIServer (前端进程)' : '阶段 A · 前端串行入口'}
          </text>
          <text x={340} y={16} textAnchor="middle" className="vllm-lc-group-title">
            {isV1 ? 'Tier 2 · EngineCore (调度核心)' : '阶段 B · 同进程阻塞调度'}
          </text>
          <text x={571} y={16} textAnchor="middle" className="vllm-lc-group-title">
            {isV1 ? 'Tier 3 · Worker (设备执行)' : '阶段 C · 同步 GPU 前向'}
          </text>

          {/* 列 1: APIServer */}
          <rect
            x={12}
            y={30}
            width={194}
            height={212}
            rx={RADIUS}
            fill="var(--wisp-surface)"
            stroke={col1Stroke}
            strokeWidth={state.activeCol === 'api' ? 1.5 : 1}
          />
          <ProcessSubCard
            x={22}
            y={42}
            w={174}
            h={52}
            title="FastAPI + Renderer"
            sub='"Hello vLLM" -> [15496..151645]'
            active={p === 'tokenize_pack'}
            tone="active"
          />
          <ProcessSubCard
            x={22}
            y={106}
            w={174}
            h={52}
            title="EngineCoreRequest"
            sub="int32 ndarray · 16 B OOB"
            active={p === 'tokenize_pack' || p === 'ipc'}
            tone="active"
          />
          <ProcessSubCard
            x={22}
            y={174}
            w={174}
            h={56}
            title="DecodeStream -> SSE"
            sub='9906 -> delta: " world"'
            active={p === 'stream'}
            tone="highlight"
          />

          {/* 进程墙 1: ZMQ IPC */}
          <line
            x1={225}
            y1={30}
            x2={225}
            y2={242}
            stroke="var(--wisp-border)"
            strokeWidth={1.25}
            strokeDasharray={isV1 ? '4 3' : undefined}
          />
          <rect
            x={208}
            y={36}
            width={34}
            height={18}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
            stroke="var(--wisp-border)"
          />
          <text x={225} y={48} textAnchor="middle" className="vllm-lc-mono-sm">
            {isV1 ? 'IPC' : '串行'}
          </text>

          {/* 列 2: EngineCore */}
          <rect
            x={244}
            y={30}
            width={192}
            height={212}
            rx={RADIUS}
            fill="var(--wisp-surface)"
            stroke={col2Stroke}
            strokeWidth={state.activeCol === 'core' ? 1.5 : 1}
          />
          <ProcessSubCard
            x={254}
            y={42}
            w={172}
            h={52}
            title="input_thread -> queue"
            sub="DEALER copy=False 零拷贝"
            active={p === 'ipc'}
            tone="done"
          />
          <ProcessSubCard
            x={254}
            y={106}
            w={172}
            h={52}
            title="Scheduler + KVPool"
            sub="budget - 4 · 分配块 B1"
            active={p === 'schedule_worker'}
            tone="done"
          />
          <ProcessSubCard
            x={254}
            y={174}
            w={172}
            h={56}
            title="output_thread (PUSH)"
            sub={isV1 ? 'Step N+1 并行零停顿' : '阻塞等待 Decode 结束'}
            active={p === 'stream'}
            tone="done"
          />

          {/* 边界 2: MultiprocExecutor RPC */}
          <line
            x1={455}
            y1={30}
            x2={455}
            y2={242}
            stroke="var(--wisp-border)"
            strokeWidth={1.25}
            strokeDasharray={isV1 ? '4 3' : undefined}
          />
          <rect
            x={438}
            y={36}
            width={34}
            height={18}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
            stroke="var(--wisp-border)"
          />
          <text x={455} y={48} textAnchor="middle" className="vllm-lc-mono-sm">
            RPC
          </text>

          {/* 列 3: Worker */}
          <rect
            x={474}
            y={30}
            width={194}
            height={212}
            rx={RADIUS}
            fill="var(--wisp-surface)"
            stroke={col3Stroke}
            strokeWidth={state.activeCol === 'worker' ? 1.5 : 1}
          />
          <ProcessSubCard
            x={484}
            y={42}
            w={174}
            h={52}
            title="GPUModelRunner"
            sub="slot_mapping [4,5,6,7]"
            active={p === 'schedule_worker'}
            tone="highlight"
          />
          <ProcessSubCard
            x={484}
            y={106}
            w={174}
            h={52}
            title="1/16 分片前向 (8 ms)"
            sub="50.625 GiB · 写入 KV B1"
            active={p === 'schedule_worker'}
            tone="highlight"
          />
          <ProcessSubCard
            x={484}
            y={174}
            w={174}
            h={56}
            title="sample_tokens()"
            sub="output_queue <- [9906]"
            active={p === 'schedule_worker' || p === 'stream'}
            tone="highlight"
          />

          {/* 跨列持久化 DataFlowArrows (Forward 上轨 + Return 下轨) */}
          <DataFlowArrow
            points={[
              [196, 128],
              [225, 128],
              [225, 68],
              [254, 68],
            ]}
            tone="done"
            active={state.ipcForwardActive}
            flow={state.ipcForwardActive}
            continuous={true}
            draw={state.ipcForwardActive}
            dotToken={state.ipcForwardActive ? playToken : 0}
            label="ZMQ"
            labelPos={[225, 98]}
          />
          <DataFlowArrow
            points={[
              [426, 132],
              [455, 132],
              [455, 68],
              [484, 68],
            ]}
            tone="highlight"
            active={state.rpcForwardActive}
            flow={state.rpcForwardActive}
            continuous={true}
            draw={state.rpcForwardActive}
            dotToken={state.rpcForwardActive ? playToken : 0}
            label="批派发"
            labelPos={[455, 100]}
          />
          <DataFlowArrow
            points={[
              [484, 202],
              [426, 202],
            ]}
            tone="highlight"
            active={state.rpcReturnActive}
            flow={state.rpcReturnActive}
            continuous={true}
            draw={state.rpcReturnActive}
            dotToken={state.rpcReturnActive ? playToken : 0}
            label="9906"
            labelPos={[455, 186]}
          />
          <DataFlowArrow
            points={[
              [254, 202],
              [196, 202],
            ]}
            tone="done"
            active={state.ipcReturnActive}
            flow={state.ipcReturnActive}
            continuous={true}
            draw={state.ipcReturnActive}
            dotToken={state.ipcReturnActive ? playToken : 0}
            label="PUSH"
            labelPos={[225, 186]}
          />

          {/* 移动的请求载荷令牌 (跨三列平滑插值) */}
          <motion.g
            initial={false}
            animate={{ x: state.tokenPos.x, y: state.tokenPos.y }}
            transition={MORPH_SPRING}
            style={{ pointerEvents: 'none' }}
          >
            <rect
              x={-52}
              y={-11}
              width={104}
              height={22}
              rx={RADIUS_SM}
              fill={resolveToneFill(state.tone)}
              stroke={resolveToneStroke(state.tone)}
              strokeWidth={1.75}
            />
            <text x={0} y={3.5} textAnchor="middle" className="vllm-lc-mono-sm" fontWeight={700}>
              {state.tokenBadge}
            </text>
          </motion.g>

          <ActiveFocusFrame
            x={state.focusRect.x}
            y={state.focusRect.y}
            w={state.focusRect.w}
            h={state.focusRect.h}
            tone={state.tone}
            visible={true}
          />
        </svg>
      </div>

      {/* 底部架构执行模式对照 */}
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
