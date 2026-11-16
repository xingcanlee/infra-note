import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  ByteLedgerBar,
  DataFlowArrow,
  MetricRow,
  SectionBox,
  STAGE_W,
  TensorBlock,
  assertMaxHues,
} from '@/explainers/kit';

export interface MlaAbsorbState {
  phase: 'latent' | 'naive' | 'absorb_q' | 'mqa_dot' | 'v_up';
  activeNaive: boolean;
  activeAbsorb: boolean;
  showAbsorbedQ: boolean;
  showMqaResult: boolean;
  showVUp: boolean;
  focusArea: 'cache' | 'naive' | 'absorb_q' | 'mqa' | 'ledger';
}

export function buildMlaAbsorbSteps(): Step<MlaAbsorbState>[] {
  assertMaxHues(['blue', 'amber', 'green']);
  return [
    {
      state: {
        phase: 'latent',
        activeNaive: false,
        activeAbsorb: true,
        showAbsorbedQ: false,
        showMqaResult: false,
        showVUp: false,
        focusArea: 'cache',
      },
      caption:
        '步骤 1（写入共享潜空间）：将多头 K/V 联合压缩为每词元仅 576 维的单一缓存 $[c_s^{KV}\\,(512);\\, k_s^R\\,(64)]$，BF16 仅占 $1152\\text{ B/tok}$，FP8（DS-V3.2）进一步压至 $656\\text{ B/tok}$。',
    },
    {
      state: {
        phase: 'naive',
        activeNaive: true,
        activeAbsorb: false,
        showAbsorbedQ: false,
        showMqaResult: false,
        showVUp: false,
        focusArea: 'naive',
      },
      caption:
        '步骤 2（Naive 反例膨胀）：若解码时先把 $c_s^{KV}$ 乘以 $W^{UK}, W^{UV}$ 解压回 $128$ 个完整头，HBM 临时展开张量瞬间膨胀 $32\\times$（$512 \\to 16384$ 维），访存带宽红利被彻底吞噬。',
    },
    {
      state: {
        phase: 'absorb_q',
        activeNaive: false,
        activeAbsorb: true,
        showAbsorbedQ: true,
        showMqaResult: false,
        showVUp: false,
        focusArea: 'absorb_q',
      },
      caption:
        '步骤 3（矩阵吸收第一步 $q_t^C W^{UK}$）：利用乘法结合律把 $W^{UK}$ 从历史键值侧移至当前单步 Query 侧，计算 $q_t^{\\text{abs}} = q_t^C W^{UK} \\in \\mathbb{R}^{h \\times 512}$，完全不碰历史缓存。',
    },
    {
      state: {
        phase: 'mqa_dot',
        activeNaive: false,
        activeAbsorb: true,
        showAbsorbedQ: true,
        showMqaResult: true,
        showVUp: false,
        focusArea: 'mqa',
      },
      caption:
        '步骤 4（单头 MQA 点积与解耦 RoPE 合流）：将 $q_t^{\\text{abs}}$ 与旋转分支 $q_t^R \\in \\mathbb{R}^{h \\times 64}$ 拼接，直接在 $576$ 维潜空间与单拷贝 $[c_s^{KV}; k_s^R]$ 点积并加权求得潜输出 $u_t \\in \\mathbb{R}^{h \\times 512}$。',
    },
    {
      state: {
        phase: 'v_up',
        activeNaive: false,
        activeAbsorb: true,
        showAbsorbedQ: true,
        showMqaResult: true,
        showVUp: true,
        focusArea: 'ledger',
      },
      caption:
        '步骤 5（后置上投影 $u_t W^{UV}$ 与字节账本）：注意力归约完成后再一次性执行 $u_t W^{UV}$ 恢复各头输出并乘 $W^O$，输出与 Naive 路径逐位等价，同时缓存字节较标准 MHA 暴降 $98\\%$。',
    },
  ];
}

const STAGE_H = 564;

export default function MlaAbsorbExplainer({
  title = '图 1：MLA 矩阵吸收五步等价推演与 Per-Token 字节账本',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildMlaAbsorbSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="MLA 矩阵吸收与显存账本推演">
      {(step) => {
        const s = step.state;
        const focusRect =
          s.focusArea === 'cache'
            ? { x: 22, y: 180, w: 146, h: 102, label: '单拷贝潜缓存 576d' }
            : s.focusArea === 'naive'
              ? { x: 284, y: 46, w: 374, h: 88, label: 'Naive 解压膨胀（Decode 禁用）' }
              : s.focusArea === 'absorb_q'
                ? { x: 212, y: 188, w: 176, h: 94, label: '前吸收 q_t^C · W_UK^T' }
                : s.focusArea === 'mqa'
                  ? { x: 402, y: 188, w: 148, h: 94, label: '1 头 576d MQA 点积' }
                  : { x: 14, y: 306, w: 652, h: 248, label: 'Per-Layer KV 字节账本定格' };

        return (
          <Stage width={STAGE_W} height={STAGE_H} label="MLA 矩阵吸收架构图解">
            {/* 上方反例：Naive 展开路径 */}
            <SectionBox
              x={276}
              y={14}
              w={390}
              h={130}
              title="反例：Naive 路径（Prefill 适用，Decode 引发 32× HBM 带宽爆炸）"
              tone="blue"
            />
            <TensorBlock
              x={292}
              y={74}
              w={144}
              h={38}
              tone="blue"
              name="解压 K_C, V_C"
              shape="[S, 128, 128] = 16384"
              active={s.activeNaive}
              muted={!s.activeNaive}
            />
            <DataFlowArrow
              points={[
                [440, 93],
                [494, 93],
              ]}
              tone="active"
              active={s.activeNaive}
              dashed={!s.activeNaive}
              label="×16384"
            />
            <TensorBlock
              x={498}
              y={74}
              w={154}
              h={38}
              tone="blue"
              name="128 头 MHA 注意力"
              shape="q [128,192] · K_C+k^R"
              active={s.activeNaive}
              muted={!s.activeNaive}
            />

            {/* 左侧公共源：单拷贝 Paged KV Cache */}
            <SectionBox x={14} y={148} w={162} h={144} title="Paged KV（1 头共享）" tone="green" />
            <TensorBlock
              x={28}
              y={214}
              w={132}
              h={42}
              tone="green"
              name="联合潜缓存 [S, 576]"
              shape="512 NoPE + 64 RoPE"
              splits={[{ ratio: 512 / 576, leftLabel: 'c^KV 512', rightLabel: 'k^R 64' }]}
              stack={2}
              active={s.phase === 'latent' || s.phase === 'mqa_dot'}
            />
            <DataFlowArrow
              points={[
                [166, 224],
                [190, 224],
                [190, 93],
                [288, 93],
              ]}
              tone="active"
              active={s.activeNaive}
              dashed
              label="解压 W_UK/W_UV"
              labelPos={[226, 74]}
            />

            {/* 下方主推演：Decode 矩阵吸收等价路径 */}
            <SectionBox
              x={204}
              y={156}
              w={462}
              h={136}
              title="正解：Decode 吸收路径（仅搬运 576 维潜空间，无损等价 1 头 MQA）"
              tone="amber"
            />
            <TensorBlock
              x={218}
              y={216}
              w={164}
              h={42}
              tone="amber"
              name="吸收查询 [h, 576]"
              shape="512 (abs) + 64 (RoPE)"
              splits={[{ ratio: 512 / 576, leftLabel: 'q^C·W^UK', rightLabel: 'q^R' }]}
              active={s.showAbsorbedQ}
              muted={!s.activeAbsorb}
            />
            <DataFlowArrow
              points={[
                [166, 240],
                [216, 240],
              ]}
              tone="active"
              active={s.showMqaResult}
              flow={s.showMqaResult}
            />
            <DataFlowArrow
              points={[
                [384, 237],
                [408, 237],
              ]}
              tone="active"
              active={s.showMqaResult}
              flow={s.showMqaResult}
            />
            <TensorBlock
              x={410}
              y={216}
              w={132}
              h={42}
              tone="green"
              name="潜空间输出 u_t"
              shape="[h, 512] = p · c^KV"
              active={s.showMqaResult}
              muted={!s.showMqaResult}
            />
            <DataFlowArrow
              points={[
                [544, 237],
                [564, 237],
              ]}
              tone="active"
              active={s.showVUp}
              flow={s.showVUp}
            />
            <TensorBlock
              x={566}
              y={216}
              w={88}
              h={42}
              tone="amber"
              name="u_t W^UV"
              shape="[h, 128] → W^O"
              active={s.showVUp}
              muted={!s.showVUp}
            />

            {/* 底部字节账本 */}
            <ByteLedgerBar
              x={24}
              y={342}
              w={632}
              h={28}
              title="等比例容量对比（以 FP8 32768 B MHA 128H 为满格；BF16 MHA 达 65536 B）"
              totalLabel="32,768 B 刻度"
              segments={[
                {
                  value: 1152,
                  label: 'MLA BF16 1152 B / FP8 656 B',
                  tone: 'green',
                  active: s.phase === 'latent' || s.phase === 'v_up',
                },
                { value: 2944, label: 'GQA-8 4096 B', tone: 'blue', active: s.phase === 'v_up' },
                { value: 28672, label: '相比 MHA 32,768 B 省下的 87.5%~98% 空间', tone: 'slate' },
              ]}
            />
            <ByteLedgerBar
              x={24}
              y={440}
              w={632}
              h={28}
              title="DS-V3.2 fp8_ds_mla 构成（656 B/tok）"
              totalLabel="656 B 细账"
              segments={[
                {
                  value: 512,
                  label: 'FP8 c^KV (512 B)',
                  tone: 'green',
                  active: s.phase === 'latent' || s.phase === 'v_up',
                },
                {
                  value: 16,
                  label: '4×FP32 缩放 (16 B)',
                  tone: 'amber',
                  active: s.phase === 'v_up',
                },
                {
                  value: 128,
                  label: 'BF16 k^R (128 B)',
                  tone: 'blue',
                  active: s.phase === 'mqa_dot' || s.phase === 'v_up',
                },
              ]}
            />
            <MetricRow
              x={20}
              y={506}
              w={640}
              h={40}
              metrics={[
                { label: 'MHA 128H (FP8/BF16)', value: '32,768 / 65,536 B', tone: 'slate' },
                { label: 'GQA-8 (BF16)', value: '4,096 B', tone: 'blue' },
                {
                  label: 'MLA BF16 (512+64)',
                  value: '1,152 B',
                  tone: 'amber',
                  active: s.phase === 'latent',
                },
                {
                  label: 'MLA FP8 (V3.2)',
                  value: '656 B',
                  tone: 'green',
                  active: s.phase === 'v_up',
                },
              ]}
            />

            <ActiveFocusFrame
              x={focusRect.x}
              y={focusRect.y}
              w={focusRect.w}
              h={focusRect.h}
              tone="highlight"
              label={focusRect.label}
              visible
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
