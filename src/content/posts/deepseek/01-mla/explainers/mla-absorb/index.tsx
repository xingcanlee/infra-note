import { useState } from 'react';
import { RichText, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, LabSegmented, RADIUS, SvgRichLabel } from '@/explainers/kit';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { useDiagramMotion } from '@/explainers/kit/motion';
import { MODE_METRICS, buildMlaAbsorbSteps, type MlaAbsorbState, type MlaExecMode } from './steps';
import './style.css';

export { buildMlaAbsorbSteps };

export interface MlaAbsorbExplainerProps {
  title?: string;
}

const MODE_OPTIONS = [
  { id: 'decode_mqa' as const, label: 'Decode (MQA 吸收)' },
  { id: 'prefill_mha' as const, label: 'Prefill (MHA 展开)' },
] as const;

export default function MlaAbsorbExplainer({ title }: MlaAbsorbExplainerProps) {
  const steps = buildMlaAbsorbSteps();
  const [execMode, setExecMode] = useState<MlaExecMode>('decode_mqa');
  const activeModeSpec = MODE_METRICS[execMode];
  const { stepTransition } = useDiagramMotion();

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label="MLA 从隐状态 h_t 到 RoPE 解耦与矩阵吸收推演"
      stageMinHeight={390}
      getFormula={(s) => s.state.formulaTex}
      replayTrigger={execMode}
    >
      {(step, ctx) => {
        const st: MlaAbsorbState = step.state;
        const isCompress = st.phase === 'compress';
        const isBlock = st.phase === 'expand_rope_block';
        const isAbsorb = st.phase === 'decouple_absorb';
        const isInflection = st.phase === 'dual_inflection';

        const mqaActive = isAbsorb || (isInflection && execMode === 'decode_mqa');
        const mhaActive = isBlock || (isInflection && execMode === 'prefill_mha');

        // 持久化实体 1：W^{UK}（展开时位于下层 KV 侧，吸收时左移上跃至 Query 侧）
        const wukGeom = mqaActive
          ? {
              x: 262,
              y: 114,
              w: 104,
              h: 50,
              tone: 'active' as const,
              name: '$(W^{UK})^\\top \\to \\tilde{q}^C$',
              shape: '左移吸收 · 512 维',
            }
          : {
              x: 264,
              y: 184,
              w: 66,
              h: 44,
              tone: isBlock ? ('highlight' as const) : ('active' as const),
              name: '$W^{UK}$',
              shape: isBlock ? '上投影 K' : '展开 K',
            };

        // 持久化实体 2：核心 KV 张量（展开时在底部膨胀为 128 头 32×，吸收时收敛为中路直读 c_j^{KV}）
        const kvCoreGeom = mqaActive
          ? {
              x: 388,
              y: 114,
              w: 116,
              h: 50,
              tone: 'done' as const,
              name: '$\\tilde{o} = \\sum_j \\alpha_j c_j^{KV}$',
              shape: '直读 512 维缓存',
              stack: 1 as const,
              subgrid: undefined,
            }
          : {
              x: 350,
              y: 178,
              w: 136,
              h: 54,
              tone: isBlock ? ('highlight' as const) : ('active' as const),
              name: isBlock ? '展开 128 头 KV' : 'Prefill 展开 KV',
              shape: '32,768 元素 (32×)',
              stack: 2 as const,
              subgrid: { cols: 6 },
            };

        // 持久化实体 3：W^{UV}（展开时位于下层 Value 侧，吸收时右移越过求和与 W^O 合并）
        const wuvGeom = mqaActive
          ? {
              x: 526,
              y: 114,
              w: 72,
              h: 50,
              tone: 'done' as const,
              name: '$W^O W^{UV}$',
              shape: '右移吸收',
            }
          : {
              x: 508,
              y: 184,
              w: 74,
              h: 44,
              tone: 'active' as const,
              name: '$W^{UV}$',
              shape: '128 头 V',
            };

        // 持久化实体 4：RoPE 模块（Step 2 夹在 Q/K 间阻断吸收，Step 3 剥离上移为独立 64 维支路）
        const ropeGeom = isBlock
          ? {
              x: 262,
              y: 118,
              w: 130,
              h: 34,
              tone: 'highlight' as const,
              name: '$R_{t-j}$ 夹在中间',
              shape: '阻断权重合并',
            }
          : {
              x: 388,
              y: 40,
              w: 156,
              h: 40,
              tone: mqaActive ? ('highlight' as const) : ('active' as const),
              name: '独立 RoPE：$(q_i^R)^\\top k_j^R$',
              shape: '64 维不阻塞吸收',
            };

        const readRatio = isCompress
          ? 1152 / 65536
          : isBlock
            ? 1.0
            : isAbsorb
              ? 1152 / 65536
              : activeModeSpec.kvReadRatio;

        const computeRatio = isCompress
          ? 0.3
          : isBlock
            ? 0.29
            : isAbsorb
              ? 0.94
              : activeModeSpec.computeRatio;

        return (
          <div className="mla-exp-stage-stack">
            {isInflection && (
              <div className="mla-exp-toolbar">
                <LabSegmented
                  options={MODE_OPTIONS}
                  value={execMode}
                  onChange={setExecMode}
                  ariaLabel="切换 Decode 与 Prefill 执行路径"
                />
                <span className="mla-exp-mode-hint">
                  <RichText text={activeModeSpec.arithmeticHint} />
                </span>
              </div>
            )}

            <div className="wisp-kit-svg-frame">
              <svg
                viewBox="0 0 680 334"
                role="img"
                aria-label="MLA 从隐状态 h_t 到低秩压缩、RoPE 解耦与双向矩阵吸收图"
              >
                {/* 左侧持久区域：1. 从隐状态 h_t 下投影写入缓存 */}
                <rect
                  x={10}
                  y={10}
                  width={234}
                  height={252}
                  rx={RADIUS}
                  fill="var(--wisp-surface)"
                  stroke={isCompress ? toneStroke('active') : 'var(--wisp-border)'}
                  strokeWidth={isCompress ? 1.5 : 1}
                />
                <SvgRichLabel
                  x={20}
                  y={24}
                  anchor="start"
                  fontSize={11}
                  fontWeight={700}
                  color="var(--wisp-fg)"
                  text={'1. 从隐状态 $h_t$ 压缩'}
                />

                {/* 持久起点：隐状态 h_t */}
                <TensorBlock
                  x={16}
                  y={96}
                  w={50}
                  h={92}
                  tone={isCompress ? 'active' : 'neutral'}
                  name={'$h_t$'}
                  shape="7168 维"
                  labelMode="inside"
                  active={isCompress}
                  dimmed={!isCompress}
                />

                {/* h_t -> c_t^Q */}
                <DataFlowArrow
                  points={[
                    [66, 122],
                    [88, 122],
                    [88, 60],
                    [114, 60],
                  ]}
                  active={isCompress || mhaActive || mqaActive}
                  flow={isCompress}
                  muted={!isCompress && !mhaActive && !mqaActive}
                  dotToken={ctx.dotToken}
                  tone="active"
                  label={'$W^{DQ}$'}
                  labelPos={[88, 92]}
                />

                <TensorBlock
                  x={116}
                  y={38}
                  w={116}
                  h={44}
                  tone={isCompress || !mhaActive ? 'active' : 'active'}
                  name={'$c_t^Q$ 压缩'}
                  shape="1536 维（随算完释放）"
                  labelMode="inside"
                  active={isCompress || isBlock}
                />

                {/* h_t -> HBM KV 缓存 */}
                <DataFlowArrow
                  points={[
                    [66, 162],
                    [88, 162],
                    [88, 206],
                    [114, 206],
                  ]}
                  active={isCompress}
                  flow={isCompress}
                  dotToken={ctx.dotToken}
                  tone="done"
                  label={'$W^{DKV}$'}
                  labelPos={[88, 186]}
                />

                <TensorBlock
                  x={116}
                  y={184}
                  w={118}
                  h={44}
                  tone="done"
                  name="HBM KV 缓存"
                  shape="576 维 · 1,152 B/tok"
                  labelMode="above"
                  active={isCompress || mqaActive}
                  splits={[
                    {
                      ratio: 512 / 576,
                      leftLabel: '512 NoPE',
                      rightLabel: '64 R',
                    },
                  ]}
                />

                {/* 右侧持久区域：2. 体积对照 / 展开阻塞 / 解耦吸收 / 双路径拐点 */}
                <rect
                  x={252}
                  y={10}
                  width={418}
                  height={252}
                  rx={RADIUS}
                  fill="var(--wisp-surface)"
                  stroke={
                    mqaActive
                      ? toneStroke('done')
                      : mhaActive
                        ? toneStroke('highlight')
                        : 'var(--wisp-border)'
                  }
                  strokeWidth={mqaActive || mhaActive ? 1.5 : 1}
                />
                <SvgRichLabel
                  x={262}
                  y={24}
                  anchor="start"
                  fontSize={11}
                  fontWeight={700}
                  color="var(--wisp-fg)"
                  text={
                    isCompress
                      ? '2. 与 128 头 MHA KV 显存对比（降 56.9×）'
                      : isBlock
                        ? '2. 直接上投影展开：32× 膨胀与 RoPE 阻塞'
                        : mqaActive
                          ? '2. 解耦 RoPE 并完成 K/V 双向吸收（免解压直读）'
                          : '2. Prefill 窄头宽展开 MHA（省 3.4× 计算量）'
                  }
                />

                {/* Step 1 专属对比面板：完全用 opacity 控显隐，绝不干扰 Step 2-4 */}
                <motion.g
                  initial={false}
                  animate={{ opacity: isCompress ? 1 : 0 }}
                  transition={stepTransition}
                  style={{ pointerEvents: 'none' }}
                >
                  <TensorBlock
                    x={274}
                    y={52}
                    w={374}
                    h={54}
                    tone="highlight"
                    name="基线 128 头 MHA KV（未压缩）"
                    shape="32,768 元素 · 65,536 B / tok（BF16）"
                    labelMode="inside"
                    stack={2}
                    subgrid={{ cols: 8 }}
                  />
                  <DataFlowArrow
                    points={[
                      [461, 108],
                      [461, 178],
                    ]}
                    active={isCompress}
                    flow={isCompress}
                    dotToken={ctx.dotToken}
                    tone="done"
                    label="低秩下投影 56.9× 压缩"
                    labelPos={[461, 143]}
                  />
                  <TensorBlock
                    x={318}
                    y={180}
                    w={144}
                    h={46}
                    tone="done"
                    name="MLA 写入缓存"
                    shape="576 维 · 1,152 B/tok"
                    labelMode="inside"
                  />
                  <TensorBlock
                    x={476}
                    y={180}
                    w={156}
                    h={46}
                    tone="active"
                    name="单 token 省显存"
                    shape="65,536 B → 1,152 B"
                    labelMode="inside"
                  />
                </motion.g>

                {/* Step 2-4 主计算与矩阵吸收舞台（Step 1 时整体 opacity: 0 完全隐藏无背影） */}
                <motion.g
                  initial={false}
                  animate={{ opacity: isCompress ? 0 : 1 }}
                  transition={stepTransition}
                  style={{ pointerEvents: isCompress ? 'none' : 'auto' }}
                >
                  {/* 顶排：c_t^Q 生成 q_t^C (Step 2/4 MHA) 或独立 q_t^R (Step 3/4 MQA) */}
                  <DataFlowArrow
                    points={[
                      [232, 58],
                      [260, 58],
                    ]}
                    active={true}
                    flow={true}
                    dotToken={ctx.dotToken}
                    tone="active"
                  />
                  <TensorBlock
                    x={262}
                    y={38}
                    w={92}
                    h={42}
                    tone={mqaActive ? 'highlight' : 'active'}
                    name={mqaActive ? '$q_{t,i}^R$' : '$q_{t,i}^C$'}
                    shape={mqaActive ? '64 维位置查询' : '$W_i^{UQ} c_t^Q$'}
                    labelMode="inside"
                  />

                  {/* MQA 吸收态：独立 RoPE 连线与 c_t^Q 直连吸收查询的连线 */}
                  {mqaActive && (
                    <>
                      <DataFlowArrow
                        points={[
                          [354, 59],
                          [386, 59],
                        ]}
                        active={true}
                        flow={true}
                        dotToken={ctx.dotToken}
                        tone="highlight"
                      />
                      <DataFlowArrow
                        points={[
                          [446, 80],
                          [446, 112],
                        ]}
                        active={true}
                        flow={true}
                        dotToken={ctx.dotToken}
                        tone="highlight"
                      />
                      <DataFlowArrow
                        points={[
                          [232, 68],
                          [244, 68],
                          [244, 139],
                          [260, 139],
                        ]}
                        active={true}
                        flow={true}
                        dotToken={ctx.dotToken}
                        tone="active"
                      />
                      <DataFlowArrow
                        points={[
                          [366, 139],
                          [386, 139],
                        ]}
                        active={true}
                        flow={true}
                        dotToken={ctx.dotToken}
                        tone="active"
                      />
                      <DataFlowArrow
                        points={[
                          [234, 206],
                          [446, 206],
                          [446, 166],
                        ]}
                        active={true}
                        flow={true}
                        dotToken={ctx.dotToken}
                        tone="done"
                        label={'直读 $c_j^{KV}$ (512 维)'}
                        labelPos={[342, 206]}
                      />
                      <DataFlowArrow
                        points={[
                          [504, 139],
                          [524, 139],
                        ]}
                        active={true}
                        flow={true}
                        dotToken={ctx.dotToken}
                        tone="done"
                      />
                      <DataFlowArrow
                        points={[
                          [598, 139],
                          [614, 139],
                        ]}
                        active={true}
                        flow={true}
                        dotToken={ctx.dotToken}
                        tone="done"
                      />
                    </>
                  )}

                  {/* MHA 展开态连线（Step 2 RoPE 阻断 & Step 4 Prefill） */}
                  {!mqaActive && (
                    <>
                      <DataFlowArrow
                        points={[
                          [234, 206],
                          [262, 206],
                        ]}
                        active={mhaActive}
                        flow={mhaActive}
                        dotToken={ctx.dotToken}
                        tone={isBlock ? 'highlight' : 'active'}
                      />
                      <DataFlowArrow
                        points={[
                          [330, 206],
                          [348, 206],
                        ]}
                        active={mhaActive}
                        flow={mhaActive}
                        dotToken={ctx.dotToken}
                        tone={isBlock ? 'highlight' : 'active'}
                      />
                      <DataFlowArrow
                        points={[
                          [486, 206],
                          [506, 206],
                        ]}
                        active={mhaActive}
                        flow={mhaActive}
                        dotToken={ctx.dotToken}
                        tone="active"
                      />
                      <DataFlowArrow
                        points={[
                          [582, 206],
                          [598, 206],
                          [598, 139],
                          [614, 139],
                        ]}
                        active={mhaActive}
                        flow={mhaActive}
                        dotToken={ctx.dotToken}
                        tone="done"
                      />
                      {isBlock && (
                        <>
                          <DataFlowArrow
                            points={[
                              [308, 80],
                              [308, 116],
                            ]}
                            active={true}
                            dashed={true}
                            dotToken={ctx.dotToken}
                            tone="highlight"
                          />
                          <DataFlowArrow
                            points={[
                              [308, 182],
                              [308, 152],
                            ]}
                            active={true}
                            dashed={true}
                            dotToken={ctx.dotToken}
                            tone="highlight"
                          />
                        </>
                      )}
                      {!isBlock && (
                        <DataFlowArrow
                          points={[
                            [354, 59],
                            [386, 59],
                          ]}
                          active={true}
                          flow={true}
                          dotToken={ctx.dotToken}
                          tone="active"
                        />
                      )}
                    </>
                  )}

                  {/* 持久化实体 1..4：随步骤真正滑移与形变 */}
                  <TensorBlock
                    key="rope-entity"
                    x={ropeGeom.x}
                    y={ropeGeom.y}
                    w={ropeGeom.w}
                    h={ropeGeom.h}
                    tone={ropeGeom.tone}
                    name={ropeGeom.name}
                    shape={ropeGeom.shape}
                    labelMode="inside"
                  />
                  <TensorBlock
                    key="wuk-entity"
                    x={wukGeom.x}
                    y={wukGeom.y}
                    w={wukGeom.w}
                    h={wukGeom.h}
                    tone={wukGeom.tone}
                    name={wukGeom.name}
                    shape={wukGeom.shape}
                    labelMode="inside"
                  />
                  <TensorBlock
                    key="kv-core-entity"
                    x={kvCoreGeom.x}
                    y={kvCoreGeom.y}
                    w={kvCoreGeom.w}
                    h={kvCoreGeom.h}
                    tone={kvCoreGeom.tone}
                    name={kvCoreGeom.name}
                    shape={kvCoreGeom.shape}
                    stack={kvCoreGeom.stack}
                    subgrid={kvCoreGeom.subgrid}
                    labelMode="inside"
                  />
                  <TensorBlock
                    key="wuv-entity"
                    x={wuvGeom.x}
                    y={wuvGeom.y}
                    w={wuvGeom.w}
                    h={wuvGeom.h}
                    tone={wuvGeom.tone}
                    name={wuvGeom.name}
                    shape={wuvGeom.shape}
                    labelMode="inside"
                  />

                  <TensorBlock
                    x={616}
                    y={114}
                    w={46}
                    h={50}
                    tone="done"
                    name={'$u_t$'}
                    shape={mqaActive ? '576/512' : '192/128'}
                    labelMode="inside"
                    active={true}
                  />
                </motion.g>

                {/* 底部双指标动画对比条：HBM 单 token 读 vs 注意力计算宽度 */}
                <rect
                  x={10}
                  y={274}
                  width={660}
                  height={48}
                  rx={RADIUS}
                  fill="var(--wisp-surface)"
                  stroke="var(--wisp-border)"
                  strokeWidth={1}
                />
                <text x={22} y={292} fontSize={10.5} fontWeight={600} fill="var(--wisp-fg)">
                  HBM 单 token 读
                </text>
                <rect x={120} y={283} width={196} height={11} rx={3} fill="var(--wisp-bg)" />
                <motion.rect
                  x={120}
                  y={283}
                  height={11}
                  rx={3}
                  initial={false}
                  animate={{ width: Math.max(12, Math.round(readRatio * 196)) }}
                  transition={stepTransition}
                  fill={readRatio > 0.5 ? toneStroke('highlight') : toneStroke('done')}
                />
                <text x={120} y={309} fontSize={10} fill="var(--wisp-muted)">
                  {isBlock
                    ? '32,768 元素 (65,536 B 等效)'
                    : isInflection
                      ? activeModeSpec.kvReadBytes
                      : '1,152 B / tok（576 维 BF16）'}
                </text>

                <text x={350} y={292} fontSize={10.5} fontWeight={600} fill="var(--wisp-fg)">
                  注意力计算宽度
                </text>
                <rect x={446} y={283} width={212} height={11} rx={3} fill="var(--wisp-bg)" />
                <motion.rect
                  x={446}
                  y={283}
                  height={11}
                  rx={3}
                  initial={false}
                  animate={{ width: Math.max(14, Math.round(computeRatio * 212)) }}
                  transition={stepTransition}
                  fill={computeRatio > 0.5 ? toneStroke('highlight') : toneStroke('active')}
                />
                <text x={446} y={309} fontSize={10} fill="var(--wisp-muted)">
                  {isBlock
                    ? 'QK: 192 + V: 128 = 320 维'
                    : isInflection
                      ? activeModeSpec.computeWidth
                      : 'QK: 576 + V: 512 = 1,088 维'}
                </text>
              </svg>
            </div>
          </div>
        );
      }}
    </BeatExplainer>
  );
}
