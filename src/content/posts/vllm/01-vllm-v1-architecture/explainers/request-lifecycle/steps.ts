import type { Step, Tone } from 'astro-wisp/explainers';
export { MANIM_EASE, MORPH_SPRING } from '@/explainers/kit/motion';

export type LifecyclePhase = 'tokenize_pack' | 'ipc' | 'schedule_worker' | 'stream';

export type ModeKey = 'v1' | 'single';

export interface TokenCell {
  idx: number;
  text: string;
  id: number;
}

export interface LifecycleStepState {
  phase: LifecyclePhase;
  stepNum: number;
  activeCol: 'api' | 'core' | 'worker';
  direction: 'forward' | 'return';
  formulaTex: string;
  tokenBadge: string;
  tokenPos: { x: number; y: number };
  focusRect: { x: number; y: number; w: number; h: number };
  ipcForwardActive: boolean;
  rpcForwardActive: boolean;
  rpcReturnActive: boolean;
  ipcReturnActive: boolean;
  payloadSummary: string;
  tone: Tone;
}

export const PROMPT_TEXT = 'Hello vLLM';

export const PROMPT_TOKENS: readonly TokenCell[] = [
  { idx: 0, text: 'Hello', id: 15496 },
  { idx: 1, text: ' v', id: 2159 },
  { idx: 2, text: 'LLM', id: 44 },
  { idx: 3, text: '<eos>', id: 151645 },
];

export const OUTPUT_TOKENS: readonly TokenCell[] = [
  { idx: 0, text: ' world', id: 9906 },
  { idx: 1, text: '.', id: 0 },
];

export const MODE_SPECS: Record<
  ModeKey,
  { id: ModeKey; label: string; summary: string; formula: string }
> = {
  v1: {
    id: 'v1',
    label: 'V1 三层解耦',
    summary:
      '分词与增量解码在 Frontend 异步重叠，EngineCore 步间隔贴近 $T_{\\text{gpu}} = 8\\text{ ms}$，CPU 停顿为 $0\\text{ ms}$。',
    formula: '$T_{\\text{step}} = \\max(T_{\\text{sched}},\\; T_{\\text{gpu}}) = 8\\text{ ms}$',
  },
  single: {
    id: 'single',
    label: '单进程串行对照',
    summary:
      '分词 3 ms、调度 1 ms、GPU 8 ms 与解码 2 ms 挤在同一循环内顺序阻塞，单步总耗时拉长至 $14\\text{ ms}$。',
    formula: '$T_{\\text{naive}} = 3 + 1 + 8 + 2 = 14\\text{ ms}$',
  },
};

export function buildRequestLifecycleSteps(): Step<LifecycleStepState>[] {
  return [
    {
      label: 'HTTP 分词打包',
      duration: 4800,
      caption:
        'FastAPI 收到提示词 “Hello vLLM” 后，将阻塞的 BPE 分词卸载至 renderer 线程池切出 $[15496, 2159, 44, 151645]$，并构造关闭 GC 的 EngineCoreRequest 与 16 B 连续 int32 ndarray。',
      state: {
        phase: 'tokenize_pack',
        stepNum: 1,
        activeCol: 'api',
        direction: 'forward',
        formulaTex:
          '$\\text{"Hello vLLM"} \\;\\xrightarrow{\\text{Tokenizer}}\\; 4 \\times \\text{int32} = 16\\text{ B OOB}$',
        tokenBadge: '16 B ndarray',
        tokenPos: { x: 109, y: 118 },
        focusRect: { x: 8, y: 26, w: 202, h: 220 },
        ipcForwardActive: false,
        rpcForwardActive: false,
        rpcReturnActive: false,
        ipcReturnActive: false,
        payloadSummary: 'EngineCoreRequest(bytes=16B, gc=False)',
        tone: 'active',
      },
    },
    {
      label: 'ZMQ 零拷贝投递',
      duration: 4800,
      caption:
        'AsyncMPClient 通过 zmq.ROUTER 发出三帧消息（ADD、msgspec 主体、16 B 带外缓冲），EngineCoreProc 的独立 input_thread（DEALER）以 copy=False 零拷贝解码并推入 input_queue。',
      state: {
        phase: 'ipc',
        stepNum: 2,
        activeCol: 'core',
        direction: 'forward',
        formulaTex:
          '$\\text{ROUTER} \\;\\xrightarrow{\\text{copy=False}}\\; \\text{DEALER} \\;\\longrightarrow\\; \\text{input\\_queue}$',
        tokenBadge: '3 Frames OOB',
        tokenPos: { x: 225, y: 98 },
        focusRect: { x: 240, y: 26, w: 200, h: 98 },
        ipcForwardActive: true,
        rpcForwardActive: false,
        rpcReturnActive: false,
        ipcReturnActive: false,
        payloadSummary: 'Frame 0: ADD | Frame 1: msgspec | Frame 2: 16B OOB',
        tone: 'done',
      },
    },
    {
      label: '调度与前向采样',
      duration: 5000,
      caption:
        'EngineCore 扣除 $4$ 预算并分配 KV 块 B1 后经 MultiprocExecutor 下发任务；Worker 驱动 GPUModelRunner 执行 $1/16$ 分片前向（$8\\text{ ms}$）并采样新词元 9906 写回 output_queue。',
      state: {
        phase: 'schedule_worker',
        stepNum: 3,
        activeCol: 'worker',
        direction: 'forward',
        formulaTex:
          '$T_{\\text{sched}}=1\\text{ ms},\\; M_{\\text{shard}}=\\frac{810\\text{ GiB}}{16}=50.625\\text{ GiB},\\; T_{\\text{gpu}}=8\\text{ ms}$',
        tokenBadge: 'sched -> [9906]',
        tokenPos: { x: 571, y: 144 },
        focusRect: { x: 470, y: 26, w: 202, h: 220 },
        ipcForwardActive: false,
        rpcForwardActive: true,
        rpcReturnActive: true,
        ipcReturnActive: false,
        payloadSummary: 'SchedulerOutput -> sample_tokens() => [9906]',
        tone: 'highlight',
      },
    },
    {
      label: '增量流式推送',
      duration: 4800,
      caption:
        'output_thread 经 zmq.PUSH 回传 4 B 标量 9906，Frontend 的 DecodeStream 增量解码出 “ world” 并经 SSE 推出；与此同时 EngineCore 与 Worker 已并行启动 Step N+1（CPU 停顿 0 ms）。',
      state: {
        phase: 'stream',
        stepNum: 4,
        activeCol: 'api',
        direction: 'return',
        formulaTex:
          '$9906 \\;\\xrightarrow{\\text{PUSH/PULL}}\\; \\text{DecodeStream} \\;\\xrightarrow{\\text{SSE}}\\; \\text{" world"}$',
        tokenBadge: 'delta: " world"',
        tokenPos: { x: 109, y: 202 },
        focusRect: { x: 16, y: 170, w: 186, h: 68 },
        ipcForwardActive: false,
        rpcForwardActive: false,
        rpcReturnActive: false,
        ipcReturnActive: true,
        payloadSummary: 'EngineCoreOutputs -> RequestOutput(delta=" world")',
        tone: 'highlight',
      },
    },
  ];
}
