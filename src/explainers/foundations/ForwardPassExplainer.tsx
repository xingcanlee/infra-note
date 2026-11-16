import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  ByteLedgerBar,
  DataFlowArrow,
  MetricRow,
  STAGE_W,
  TensorBlock,
  assertMaxHues,
} from '@/explainers/kit';

export interface ForwardPassState {
  stepIndex: number;
  activeStage: 'norm1' | 'qkv' | 'attn' | 'swiglu' | 'residual';
  focusFrame: { x: number; y: number; w: number; h: number; label: string };
  opClass: string;
  tensorShape: string;
  flopsText: string;
  ioPattern: string;
  bytesSegments: {
    value: number;
    label: string;
    sub?: string;
    tone: Tone;
    active?: boolean;
  }[];
  totalBytesLabel: string;
}

export function buildForwardPassSteps(): Step<ForwardPassState>[] {
  const tones: Tone[] = ['active', 'highlight', 'activation'];
  assertMaxHues(tones);

  const baseSegments = [
    { value: 256, label: 'Norm/Res', sub: '256 B', tone: 'activation' as Tone },
    { value: 640, label: 'QKV+O 权重/激活', sub: '640 B', tone: 'active' as Tone },
    { value: 768, label: 'SwiGLU 3矩阵', sub: '768 B', tone: 'highlight' as Tone },
  ];

  return [
    {
      state: {
        stepIndex: 0,
        activeStage: 'norm1',
        focusFrame: { x: 16, y: 18, w: 184, h: 104, label: 'Stage 1 · 输入与 RMSNorm' },
        opClass: 'Vector 规约+逐元素',
        tensorShape: 'X -> X_hat [2, 4, 8]',
        flopsText: '192 FLOPs',
        ioPattern: '内存带宽主导 (1:1 读写)',
        bytesSegments: [{ ...baseSegments[0], active: true }, baseSegments[1], baseSegments[2]],
        totalBytesLabel: 'BF16 激活流量 256 B (Norm+Res)',
      },
      caption:
        '输入批张量 $X \\in \\mathbb{R}^{2 \\times 4 \\times 8}$（$B=2, S=4, D=8$）首先进入 RMSNorm：计算均方根后逐元素缩放。此类 Vector 算子每读 1 次张量只做少量运算，在 GPU 上走 CUDA Core，在昇腾上走 Vector UB。',
    },
    {
      state: {
        stepIndex: 1,
        activeStage: 'qkv',
        focusFrame: { x: 214, y: 18, w: 214, h: 104, label: 'Stage 2 · GQA 线性投影' },
        opClass: 'GEMM 矩阵乘',
        tensorShape: 'Q [2,4,8], K/V [2,4,4]',
        flopsText: '2,048 FLOPs',
        ioPattern: 'Prefill 复用权重 · 算力主导',
        bytesSegments: [baseSegments[0], { ...baseSegments[1], active: true }, baseSegments[2]],
        totalBytesLabel: 'QKV 投影参数 + 激活 ~448 B',
      },
      caption:
        '随后 $\\hat{X}$ 乘以 $W_Q, W_K, W_V$：按照 2:1 GQA 比例，$Q$ 宽度保持 $[2,4,8]$（64 px 宽），而 $K, V$ 等比例缩半为 $[2,4,4]$（32 px 宽），投影总浮点量 $2 \\times 8 \\times 8 \\times (8+4+4) = 2048$ FLOPs。',
    },
    {
      state: {
        stepIndex: 2,
        activeStage: 'attn',
        focusFrame: { x: 442, y: 18, w: 200, h: 104, label: 'Stage 3 · 注意力与残差相加' },
        opClass: 'Batched GEMM + Softmax',
        tensorShape: 'O_attn [2, 4, 8]',
        flopsText: '2,048 FLOPs',
        ioPattern: 'O(S^2) 分数需片上融合',
        bytesSegments: [baseSegments[0], { ...baseSegments[1], active: true }, baseSegments[2]],
        totalBytesLabel: '含 O 投影与残差写回 ~640 B',
      },
      caption:
        '2 个查询头与各自共享的 1 个 KV 头做因果点积加权后，输出经 $W_O$ 映回 $[2,4,8]$，再与入口 $X$ 执行残差相加 $X_{\\text{mid}} = X + \\text{Attn}$。',
    },
    {
      state: {
        stepIndex: 3,
        activeStage: 'swiglu',
        focusFrame: { x: 16, y: 164, w: 516, h: 108, label: 'Stage 4 · SwiGLU 双升维与门控降维' },
        opClass: 'GEMM (3矩阵) + SiLU*',
        tensorShape: 'Gate/Up [2,4,16] -> [2,4,8]',
        flopsText: '6,144 FLOPs',
        ioPattern: '占全层 GEMM 约 60% 算力',
        bytesSegments: [baseSegments[0], baseSegments[1], { ...baseSegments[2], active: true }],
        totalBytesLabel: 'SwiGLU 激活中间流 768 B (宽度翻倍)',
      },
      caption:
        '经过第二层 RMSNorm 后，特征进入 SwiGLU：Gate 与 Up 将宽度等比例放大 $2\\times$ 至 $[2,4,16]$（128 px 宽），经 $\\text{SiLU}(g) \\cdot u$ 门控融合（vLLM 调 _C.silu_and_mul，昇腾调 npu_swiglu）再由 Down 压回 $[2,4,8]$。',
    },
    {
      state: {
        stepIndex: 4,
        activeStage: 'residual',
        focusFrame: { x: 554, y: 164, w: 92, h: 108, label: 'Stage 5 · 残差输出' },
        opClass: 'Elementwise Add',
        tensorShape: 'Y = X_mid + Down [2,4,8]',
        flopsText: '10,240 FLOPs (全层)',
        ioPattern: 'Tensor Core/Cube vs Vector 分野',
        bytesSegments: [
          { ...baseSegments[0], active: true },
          { ...baseSegments[1], active: true },
          { ...baseSegments[2], active: true },
        ],
        totalBytesLabel: '整层 GEMM 算力 >95%，Vector 决定零碎搬运上限',
      },
      caption:
        '最终残差相加输出 $Y \\in \\mathbb{R}^{2 \\times 4 \\times 8}$。从计算与字节账本看：GEMM 算子吃掉全层绝大多数 FLOPs（由 Tensor Core / Cube 承担），而 Norm/SiLU/Residual 却频繁决定片上 SRAM / UB 的读写压力。',
    },
  ];
}

export default function ForwardPassExplainer({
  title = '图 1：Transformer 单层前向全链路（[B=2, S=4, D=8] 等比例张量演化）',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildForwardPassSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="单层前向张量与字节流交互拆解">
      {(step) => {
        const s = step.state;
        const isNorm1 = s.activeStage === 'norm1';
        const isQkv = s.activeStage === 'qkv';
        const isAttn = s.activeStage === 'attn';
        const isSwiglu = s.activeStage === 'swiglu';
        const isRes = s.activeStage === 'residual';

        return (
          <Stage width={STAGE_W} height={416} label="Transformer 单层前向流转与张量比例">
            {/* Row 1: X -> RMSNorm1 -> QKV -> Attn -> Res1 */}
            <TensorBlock
              x={24}
              y={52}
              w={64}
              h={44}
              stack={2}
              tone={isNorm1 ? 'active' : 'neutral'}
              name="输入 X"
              shape="[2,4,8]"
              active={isNorm1}
            />
            <DataFlowArrow
              points={[
                [92, 74],
                [116, 74],
              ]}
              tone="active"
              active={isNorm1}
              flow={isNorm1}
            />

            <TensorBlock
              x={120}
              y={52}
              w={64}
              h={44}
              stack={2}
              tone="activation"
              name="RMSNorm1"
              shape="[2,4,8]"
              active={isNorm1}
            />
            <DataFlowArrow
              points={[
                [188, 74],
                [218, 74],
              ]}
              tone="active"
              active={isQkv}
              flow={isQkv}
            />

            <TensorBlock
              x={222}
              y={52}
              w={64}
              h={44}
              stack={2}
              tone="active"
              name="Q 投影"
              shape="[2,4,8]"
              active={isQkv || isAttn}
            />
            <TensorBlock
              x={312}
              y={52}
              w={32}
              h={44}
              stack={2}
              tone="highlight"
              name="K"
              shape="[2,4,4]"
              active={isQkv || isAttn}
            />
            <TensorBlock
              x={376}
              y={52}
              w={32}
              h={44}
              stack={2}
              tone="highlight"
              name="V"
              shape="[2,4,4]"
              active={isQkv || isAttn}
            />

            <DataFlowArrow
              points={[
                [414, 74],
                [446, 74],
              ]}
              tone="active"
              active={isAttn}
              flow={isAttn}
            />

            <TensorBlock
              x={450}
              y={52}
              w={64}
              h={44}
              stack={2}
              tone="active"
              name="Attn+O"
              shape="[2,4,8]"
              active={isAttn}
            />
            <DataFlowArrow
              points={[
                [518, 74],
                [562, 74],
              ]}
              tone="activation"
              active={isAttn}
            />

            <TensorBlock
              x={566}
              y={52}
              w={64}
              h={44}
              stack={2}
              tone="activation"
              name="X_mid"
              shape="[2,4,8]"
              active={isAttn || isRes}
            />

            {/* Connecting X_mid down to Row 2 RMSNorm2 */}
            <DataFlowArrow
              points={[
                [598, 118],
                [598, 134],
                [10, 134],
                [10, 226],
                [20, 226],
              ]}
              tone="activation"
              dashed
              active={isSwiglu}
            />

            {/* Row 2: RMSNorm2 -> Gate [2,4,16] -> Up [2,4,16] -> Down [2,4,8] -> Y [2,4,8] */}
            <TensorBlock
              x={24}
              y={204}
              w={64}
              h={44}
              stack={2}
              tone="activation"
              name="RMSNorm2"
              shape="[2,4,8]"
              active={isSwiglu}
            />
            <DataFlowArrow
              points={[
                [92, 226],
                [118, 226],
              ]}
              tone="highlight"
              active={isSwiglu}
              flow={isSwiglu}
            />

            <TensorBlock
              x={122}
              y={204}
              w={128}
              h={44}
              stack={2}
              tone="highlight"
              name="Gate = SiLU(X*W_g)"
              shape="[2,4,16] (2x 宽)"
              active={isSwiglu}
            />
            <TensorBlock
              x={266}
              y={204}
              w={128}
              h={44}
              stack={2}
              tone="highlight"
              name="Up = X*W_u & g*u"
              shape="[2,4,16] (2x 宽)"
              active={isSwiglu}
            />
            <DataFlowArrow
              points={[
                [400, 226],
                [428, 226],
              ]}
              tone="active"
              active={isSwiglu}
              flow={isSwiglu}
            />

            <TensorBlock
              x={432}
              y={204}
              w={64}
              h={44}
              stack={2}
              tone="active"
              name="Down"
              shape="[2,4,8]"
              active={isSwiglu || isRes}
            />
            <DataFlowArrow
              points={[
                [500, 226],
                [562, 226],
              ]}
              tone="activation"
              active={isRes}
              flow={isRes}
            />

            <TensorBlock
              x={566}
              y={204}
              w={64}
              h={44}
              stack={2}
              tone="activation"
              name="输出 Y"
              shape="[2,4,8]"
              active={isRes}
            />
            <DataFlowArrow
              points={[
                [636, 74],
                [662, 74],
                [662, 226],
                [636, 226],
              ]}
              tone="activation"
              dashed
              active={isRes}
              label="+X_mid"
              labelPos={[650, 135]}
            />

            <ActiveFocusFrame
              x={s.focusFrame.x}
              y={s.focusFrame.y}
              w={s.focusFrame.w}
              h={s.focusFrame.h}
              tone={isSwiglu ? 'highlight' : isNorm1 || isRes ? 'activation' : 'active'}
              label={s.focusFrame.label}
            />

            {/* Row 3: Byte ledger */}
            <ByteLedgerBar
              x={24}
              y={304}
              w={632}
              h={26}
              title="算子字节与计算分布对比 (固定 8 token 剖面)"
              totalLabel={s.totalBytesLabel}
              segments={s.bytesSegments}
            />

            {/* Row 4: Metrics */}
            <MetricRow
              x={24}
              y={356}
              w={632}
              h={42}
              metrics={[
                { label: '当前算子类型', value: s.opClass, tone: 'active', active: true },
                { label: '核心张量形状', value: s.tensorShape, tone: 'highlight' },
                { label: '阶段 FLOPs', value: s.flopsText, tone: 'activation' },
                { label: '硬件受限特征', value: s.ioPattern, tone: 'neutral' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
