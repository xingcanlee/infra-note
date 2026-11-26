import type { Step } from 'astro-wisp/explainers';
import { type BeatSpec, assertMaxHues } from '@/explainers/kit/motion';
export { MANIM_EASE, MORPH_SPRING, type BeatSpec } from '@/explainers/kit/motion';

export type CompilePhase = 'eager' | 'dynamo' | 'split' | 'fuse' | 'wall';
export type GuardMode = 'zero_one' | 'no_guard';

export interface CompileStepState {
  phase: CompilePhase;
  formulaTex: string;
  hbmBytesKb: number;
  opsPerLayer: number;
  launchesPerStep: number;
  hostUs: number;
  devUs: number;
  note: string;
}

export const GUARD_MODES: Record<
  GuardMode,
  {
    id: GuardMode;
    label: string;
    batches: readonly number[];
    recompiles: number;
    badge: string;
    summary: string;
  }
> = {
  zero_one: {
    id: 'zero_one',
    label: '开启 0/1 步长特化（默认 Guard）',
    batches: [4, 8, 1, 16, 1],
    recompiles: 2,
    badge: '触发 2 份特化产物与分支重编',
    summary:
      'bs=1 落入常量特化分支，与 bs>1 符号分支来回切换；若遇 %128 模余 Guard 还会引发线上抖动。',
  },
  no_guard: {
    id: 'no_guard',
    label: 'vLLM 无 Guard 动态追踪',
    batches: [4, 8, 1, 16, 1],
    recompiles: 1,
    badge: '全程仅 1 份通用 FX 图',
    summary:
      'vLLM 禁用运行时 Guard 校验并统一用符号尺寸追踪，再交由 PiecewiseBackend 按分段区间复用产物。',
  },
};

export const BEAT_SCHEDULES: Record<CompilePhase, readonly BeatSpec[]> = {
  eager: [
    { at: 0, label: '逐算子下发 SwiGLU 节点' },
    { at: 750, label: 'silu 写回完整中间张量' },
    { at: 1550, label: 'mul 重读中间值再写回' },
    { at: 2350, label: '累计 5 趟 HBM 访存 (400KB)' },
  ],
  dynamo: [
    { at: 0, label: 'PEP 523 拦截 Python 栈帧' },
    { at: 750, label: '提取 FX 计算图并设 SymInt' },
    { at: 1550, label: '遇 .item() 触发 Graph Break' },
    { at: 2350, label: '对比 0/1 特化与无 Guard 追踪' },
  ],
  split: [
    { at: 0, label: 'AOTAutograd 消除原地写别名' },
    { at: 750, label: '按 splitting_ops 定位 Attention' },
    { at: 1550, label: '将整网拆成纯张量静态分段' },
    { at: 2350, label: '保留动态 Attention 在夹缝中执行' },
  ],
  fuse: [
    { at: 0, label: 'GPU Inductor / 昇腾 npugraph_ex' },
    { at: 750, label: 'SwiGLU 融合成单趟读写 (240KB)' },
    { at: 1550, label: '单层算子由 28 个压到 10 个' },
    { at: 2350, label: '逐元素显存搬运直降 40%' },
  ],
  wall: [
    { at: 0, label: '乘上 40 层 V4.1-Flash 解码' },
    { at: 750, label: '仍剩 400 次主机发射 (4800 μs)' },
    { at: 1550, label: '对比残余设备计算 3400 μs' },
    { at: 2350, label: '发射仍超算力 1.41 倍，需静态图' },
  ],
};

export function buildCompileSplitFusionSteps(): Step<CompileStepState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: 'Eager 双税',
      duration: 4300,
      state: {
        phase: 'eager',
        formulaTex: '$\\text{SwiGLU}_{\\text{eager}}: 5\\text{ 趟 HBM} = 400\\,\\text{KB}\\;(B=8)$',
        hbmBytesKb: 400,
        opsPerLayer: 28,
        launchesPerStep: 1120,
        hostUs: 13440,
        devUs: 3400,
        note: 'Eager 下既要交每层 28 次发射费，又要在 silu 与 mul 之间多写多读一遍 80 KB 激活张量。',
      },
      caption:
        '在 PyTorch Eager 模式下执行 SwiGLU 时，silu 算完必须先写回 HBM，紧接着 mul 再从 HBM 读回来，白白多出两趟显存搬运。',
    },
    {
      label: '抓图守卫',
      duration: 4400,
      state: {
        phase: 'dynamo',
        formulaTex: '$\\text{PEP 523} \\to \\text{FX Graph} \\;(\\text{SymInt } s_0)$',
        hbmBytesKb: 400,
        opsPerLayer: 28,
        launchesPerStep: 1120,
        hostUs: 13440,
        devUs: 3400,
        note: '下方可切换默认 0/1 步长特化 Guard 与 vLLM 无 Guard 动态追踪，观察批大小跳变时的重编差异。',
      },
      caption:
        'TorchDynamo 通过 PEP 523 接管 Python 字节码提取 FX 图，但批大小在 1 与多请求间切换时，默认 0/1 特化与模余 Guard 容易诱发重复编译。',
    },
    {
      label: '分段切图',
      duration: 4300,
      state: {
        phase: 'split',
        formulaTex:
          '$\\text{FX} \\xrightarrow{\\text{splitting\\_ops}} [\\text{Subgraph}_0,\\; \\text{Attn},\\; \\text{Subgraph}_1]$',
        hbmBytesKb: 400,
        opsPerLayer: 18,
        launchesPerStep: 720,
        hostUs: 8640,
        devUs: 3400,
        note: 'AOTAutograd 先把原位修改函数化为无副作用 Core ATen IR，再按 Attention 算子切出静态可编译段。',
      },
      caption:
        '动态 Attention 依赖请求块表与变长序列元数据，编译框架通过 splitting_ops 把它留作 Eager 隔离岛，仅编译前后纯张量分段。',
    },
    {
      label: '算子融合',
      duration: 4300,
      state: {
        phase: 'fuse',
        formulaTex:
          '$400\\,\\text{KB} \\xrightarrow{-40\\%} 240\\,\\text{KB}, \\quad 28\\text{ ops} \\to 10\\text{ ops}$',
        hbmBytesKb: 240,
        opsPerLayer: 10,
        launchesPerStep: 400,
        hostUs: 4800,
        devUs: 3400,
        note: 'GPU Inductor 生成融合 Triton 算子，昇腾 npugraph_ex 则经模式匹配替换为融合 aclnn/NNAL 算子。',
      },
      caption:
        '后端融合让 silu 与 mul 在片上寄存器一趟完成，HBM 搬运量从 400 KB 降到 240 KB，单层算子数从 28 个压缩至 10 个。',
    },
    {
      label: '残余发射墙',
      duration: 4400,
      state: {
        phase: 'wall',
        formulaTex:
          '$T_{\\text{host}} = 4800\\,\\mu\\text{s} = 1.41\\times T_{\\text{dev}} = 3400\\,\\mu\\text{s}$',
        hbmBytesKb: 240,
        opsPerLayer: 10,
        launchesPerStep: 400,
        hostUs: 4800,
        devUs: 3400,
        note: '即便算子已压到每层 10 个，40 层单步仍要 CPU 下发 400 次指令，必须外包静态执行图消除主机墙。',
      },
      caption:
        '在 40 层 DeepSeek-V4.1-Flash 上，编译融合后的 400 次主机下发仍需 4800 微秒，依然达到 3400 微秒设备计算时间的 1.41 倍。',
    },
  ];
}
