import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export type CompilePhase = 'eager' | 'dynamo_split' | 'fuse' | 'wall';
export type GuardMode = 'zero_one' | 'no_guard';

export interface CompileStepState {
  phase: CompilePhase;
  phaseLabel: string;
  formulaTex: string;
  hbmBytesKb: number;
  opsPerLayer: number;
  launchesPerStep: number;
  hostUs: number;
  devUs: number;
  focusRect: { x: number; y: number; w: number; h: number; label: string; tone: AnyTone };
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
    label: '0/1 步长特化 (默认 Guard)',
    batches: [4, 8, 1, 16, 1],
    recompiles: 2,
    badge: '触发 2 份特化产物与分支重新编译',
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

export function buildCompileSplitFusionSteps(): Step<CompileStepState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: 'Eager 逐算子发射',
      duration: 4300,
      state: {
        phase: 'eager',
        phaseLabel: 'Step 1 · Eager 逐算子发射与五趟 HBM 搬运',
        formulaTex: '$\\text{SwiGLU}_{\\text{eager}}: 5\\text{ 趟 HBM} = 400\\,\\text{KB}\\;(B=8)$',
        hbmBytesKb: 400,
        opsPerLayer: 28,
        launchesPerStep: 1120,
        hostUs: 13440,
        devUs: 3400,
        focusRect: {
          x: 346,
          y: 24,
          w: 192,
          h: 68,
          label: '未融合 silu + mul (5 趟 HBM)',
          tone: 'highlight',
        },
        note: 'Eager 下既要交每层 28 次发射费，又要在 silu 与 mul 之间多写多读一遍 80 KB 激活张量。',
      },
      caption:
        '在 PyTorch Eager 模式下执行 SwiGLU 时，silu 算完必须先写回 HBM，紧接着 mul 再从 HBM 读回来，白白多出两趟显存搬运与 1120 次主机发射。',
    },
    {
      label: 'Dynamo 守卫切图',
      duration: 4500,
      state: {
        phase: 'dynamo_split',
        phaseLabel: 'Step 2 · Dynamo PEP 523 守卫追踪与 Attention 切图边界',
        formulaTex:
          '$\\text{FX} \\xrightarrow{\\text{splitting\\_ops}} [\\text{Subgraph}_0,\\; \\text{Attn},\\; \\text{Subgraph}_1]$',
        hbmBytesKb: 400,
        opsPerLayer: 18,
        launchesPerStep: 720,
        hostUs: 8640,
        devUs: 3400,
        focusRect: {
          x: 174,
          y: 24,
          w: 150,
          h: 68,
          label: 'splitting_ops 切出 Eager 边界',
          tone: 'active',
        },
        note: '上方可切换默认 0/1 步长特化 Guard 与 vLLM 无 Guard 动态追踪，观察批大小跳变时的重新编译差异。',
      },
      caption:
        'TorchDynamo 通过 PEP 523 提取 FX 图并按 splitting_ops 将动态 Attention 留作隔离岛；同时可切换上方 Guard 模式对比批大小跳变时的重新编译次数。',
    },
    {
      label: 'Inductor 算子融合',
      duration: 4300,
      state: {
        phase: 'fuse',
        phaseLabel: 'Step 3 · Inductor / npugraph_ex 算子融合降访存',
        formulaTex:
          '$400\\,\\text{KB} \\xrightarrow{-40\\%} 240\\,\\text{KB}, \\quad 28\\text{ ops} \\to 10\\text{ ops}$',
        hbmBytesKb: 240,
        opsPerLayer: 10,
        launchesPerStep: 400,
        hostUs: 4800,
        devUs: 3400,
        focusRect: {
          x: 346,
          y: 24,
          w: 192,
          h: 68,
          label: 'SwiGLU 片上融合 (-40% HBM)',
          tone: 'done',
        },
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
        phaseLabel: 'Step 4 · 40 层残余 400 次发射墙仍超算力 1.41 倍',
        formulaTex:
          '$T_{\\text{host}} = 4800\\,\\mu\\text{s} = 1.41\\times T_{\\text{dev}} = 3400\\,\\mu\\text{s}$',
        hbmBytesKb: 240,
        opsPerLayer: 10,
        launchesPerStep: 400,
        hostUs: 4800,
        devUs: 3400,
        focusRect: {
          x: 10,
          y: 112,
          w: 660,
          h: 92,
          label: 'Host 4800 μs 仍高于 Device 3400 μs',
          tone: 'highlight',
        },
        note: '即便算子已压到每层 10 个，40 层单步仍要 CPU 下发 400 次指令，必须外包静态执行图消除主机墙。',
      },
      caption:
        '在 40 层 DeepSeek-V4.1-Flash 上，编译融合后的 400 次主机下发仍需 4800 微秒，依然达到 3400 微秒设备计算时间的 1.41 倍。',
    },
  ];
}
