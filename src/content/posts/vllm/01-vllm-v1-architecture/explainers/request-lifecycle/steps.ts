import type { Step, Tone } from 'astro-wisp/explainers';
import type { BeatSpec } from '@/explainers/kit/motion';
export { MANIM_EASE, MORPH_SPRING, type BeatSpec } from '@/explainers/kit/motion';

export type LifecyclePhase = 'tokenize' | 'pack' | 'ipc' | 'schedule' | 'worker' | 'stream';

export type ModeKey = 'v1' | 'single';

export interface TokenCell {
  idx: number;
  text: string;
  id: number;
}

export interface LifecycleStepState {
  phase: LifecyclePhase;
  stepNum: number;
  activeTier: 'frontend' | 'ipc' | 'core' | 'worker';
  direction: 'forward' | 'return';
  formulaTex: string;
  v1StepMs: number;
  singleStepMs: number;
  gpuStallMs: number;
  payloadSummary: string;
  activeDetail: string;
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

export const BEAT_SCHEDULES: Record<LifecyclePhase, readonly BeatSpec[]> = {
  tokenize: [
    { at: 0, label: 'HTTP 请求抵达' },
    { at: 750, label: '卸载至线程池' },
    { at: 1550, label: '切出 4 枚词元' },
    { at: 2400, label: '生成输入校验' },
  ],
  pack: [
    { at: 0, label: '构造 Request 结构体' },
    { at: 800, label: '转成 int32 ndarray' },
    { at: 1650, label: '计算 16 B 连续载荷' },
    { at: 2550, label: 'msgspec 编码就绪' },
  ],
  ipc: [
    { at: 0, label: 'ROUTER 发出多帧' },
    { at: 800, label: 'DEALER 后台收帧' },
    { at: 1650, label: '零拷贝解码视图' },
    { at: 2550, label: '投递入 input_queue' },
  ],
  schedule: [
    { at: 0, label: '主循环取走请求' },
    { at: 850, label: '统一 token_budget 配额' },
    { at: 1750, label: '分配 KV 物理块' },
    { at: 2650, label: 'RPC 派发执行批' },
  ],
  worker: [
    { at: 0, label: 'ModelRunner 备批' },
    { at: 850, label: '1/16 分片前向计算' },
    { at: 1750, label: '采样产出 9906' },
    { at: 2650, label: '写回 output_queue' },
  ],
  stream: [
    { at: 0, label: 'PUSH 回传输出帧' },
    { at: 800, label: 'PULL 唤醒输出协程' },
    { at: 1650, label: 'DecodeStream 增量拼词' },
    { at: 2550, label: 'SSE 推送 “ world”' },
  ],
};

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
      label: 'HTTP 与分词',
      duration: 5000,
      caption:
        'FastAPI 收到提示词 “Hello vLLM” 后，AsyncLLM 将阻塞的 BPE 分词卸载至 renderer 线程池，切出长度 $L_{\\text{in}} = 4$ 的词元序列 $[15496, 2159, 44, 151645]$，主事件循环保持非阻塞。',
      state: {
        phase: 'tokenize',
        stepNum: 1,
        activeTier: 'frontend',
        direction: 'forward',
        formulaTex:
          '$\\text{"Hello vLLM"} \\;\\xrightarrow{\\text{Tokenizer}}\\;[15496,\\; 2159,\\; 44,\\; 151645],\\; L_{\\text{in}}=4$',
        v1StepMs: 3,
        singleStepMs: 3,
        gpuStallMs: 0,
        payloadSummary: 'prompt_token_ids = [15496, 2159, 44, 151645]',
        activeDetail: 'InputProcessor 在线程池完成分词与参数校验',
        tone: 'active',
      },
    },
    {
      label: '载荷打包',
      duration: 5200,
      caption:
        'InputProcessor 构造 EngineCoreRequest（关闭循环 GC 且启用数组紧凑布局）；发送前把 Python int 列表转为连续 int32 ndarray（$4 \\times 4 = 16\\text{ B}$）随帧带外传输。',
      state: {
        phase: 'pack',
        stepNum: 2,
        activeTier: 'frontend',
        direction: 'forward',
        formulaTex:
          '$4 \\times \\text{int32} = 16\\text{ B}\\;\\text{连续内存（替代逐个 Python int 对象）}$',
        v1StepMs: 0.2,
        singleStepMs: 3,
        gpuStallMs: 0,
        payloadSummary: 'EngineCoreRequest(array_like=True, gc=False, bytes=16B)',
        activeDetail: '构造紧凑结构体与连续 int32 缓冲',
        tone: 'active',
      },
    },
    {
      label: 'ZMQ 投递',
      duration: 5200,
      caption:
        'AsyncMPClient 通过 zmq.ROUTER 发送多帧消息，EngineCoreProc 的独立 input_thread（zmq.DEALER）在后台线程解码并推入 input_queue，不打断主调度循环。',
      state: {
        phase: 'ipc',
        stepNum: 3,
        activeTier: 'ipc',
        direction: 'forward',
        formulaTex:
          '$\\text{ROUTER} \\;\\xrightarrow{\\text{copy=False}}\\; \\text{DEALER} \\;\\longrightarrow\\; \\text{input\\_queue}$',
        v1StepMs: 0.3,
        singleStepMs: 0,
        gpuStallMs: 0,
        payloadSummary: 'Frame 0: ADD(0x00) | Frame 1: msgspec | Frame 2: 16B OOB',
        activeDetail: '后台 I/O 线程接管跨进程解码与入队',
        tone: 'done',
      },
    },
    {
      label: '调度派发',
      duration: 5400,
      caption:
        'EngineCore 主循环从 input_queue 取出请求，调用统一配额调度器扣减 $4$ 个 token 预算并分配 KV 物理块，再经 MultiprocExecutor 向各 Worker 下发本步批描述。',
      state: {
        phase: 'schedule',
        stepNum: 4,
        activeTier: 'core',
        direction: 'forward',
        formulaTex:
          '$T_{\\text{sched}} = 1\\text{ ms},\\; \\text{budget} \\leftarrow \\text{budget} - 4$',
        v1StepMs: 1,
        singleStepMs: 1,
        gpuStallMs: 0,
        payloadSummary: 'SchedulerOutput(req_0: 4 tok) -> Executor.execute_model',
        activeDetail: 'Scheduler 分配 KV 块并经 Executor 下发 RPC',
        tone: 'done',
      },
    },
    {
      label: '前向采样',
      duration: 5400,
      caption:
        '每张卡上的 Worker 驱动 GPUModelRunner 执行模型前向（如 405B 模型按 $810\\text{ GiB}/16 = 50.625\\text{ GiB}$ 本地分片计算）并采样得到新 token 9906，结果写入 output_queue。',
      state: {
        phase: 'worker',
        stepNum: 5,
        activeTier: 'worker',
        direction: 'return',
        formulaTex:
          '$M_{\\text{shard}} = \\frac{810\\text{ GiB}}{16} = 50.625\\text{ GiB/卡},\\; T_{\\text{gpu}} = 8\\text{ ms}$',
        v1StepMs: 8,
        singleStepMs: 8,
        gpuStallMs: 0,
        payloadSummary: 'ModelRunner -> sample_tokens() => new_token_ids=[9906]',
        activeDetail: 'Worker 完成分片前向、KV 写入与采样回传',
        tone: 'highlight',
      },
    },
    {
      label: '增量推送',
      duration: 5200,
      caption:
        'EngineCoreProc 的 output_thread 通过 zmq.PUSH 将 EngineCoreOutputs 送回前端 PULL 套接字；OutputProcessor 调用 DecodeStream 把 token 9906 增量解码为 “ world” 并经 SSE 推出。',
      state: {
        phase: 'stream',
        stepNum: 6,
        activeTier: 'frontend',
        direction: 'return',
        formulaTex:
          '$9906 \\;\\xrightarrow{\\text{DecodeStream}}\\; \\text{" world"} \\;\\xrightarrow{\\text{SSE}}\\; \\text{Client}$',
        v1StepMs: 2,
        singleStepMs: 2,
        gpuStallMs: 0,
        payloadSummary: 'EngineCoreOutputs -> RequestOutput(delta=" world")',
        activeDetail: 'OutputProcessor 与设备下一步执行并行推进',
        tone: 'highlight',
      },
    },
  ];
}
