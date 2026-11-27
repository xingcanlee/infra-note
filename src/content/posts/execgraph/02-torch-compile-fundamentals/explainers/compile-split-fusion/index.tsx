import { useMemo, useState } from 'react';
import { Stage, toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, LabSegmented, SvgRichLabel } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import TensorBlock from '@/explainers/kit/TensorBlock';
import { STAGE_W, useDiagramMotion } from '@/explainers/kit/motion';
import { GUARD_MODES, buildCompileSplitFusionSteps, type GuardMode } from './steps';
import './style.css';

export { buildCompileSplitFusionSteps };

const MAX_US = 14000;
const BAR_MAX_W = 470;

export default function CompileSplitFusionExplainer({ title }: { title?: string }) {
  const steps = useMemo(() => buildCompileSplitFusionSteps(), []);
  const [guardMode, setGuardMode] = useState<GuardMode>('zero_one');
  const { stepTransition } = useDiagramMotion();
  const resolvedTitle = title ?? 'torch.compile 分段切图、降低 HBM 访存与 40 层残余发射墙 4 步推演';

  const guardOptions = useMemo(
    () =>
      (Object.keys(GUARD_MODES) as GuardMode[]).map((id) => ({
        id,
        label: GUARD_MODES[id].label,
      })),
    [],
  );

  return (
    <BeatExplainer
      steps={steps}
      title={resolvedTitle}
      label={resolvedTitle}
      stageMinHeight={290}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={guardMode}
    >
      {(step, { dotToken }) => {
        const s = step.state;
        const isDynamo = s.phase === 'dynamo_split';
        const isFused = s.phase === 'fuse' || s.phase === 'wall';
        const isSplit = isDynamo || isFused;
        const gSpec = GUARD_MODES[guardMode];

        const hostW = Math.max(12, Math.round((s.hostUs / MAX_US) * BAR_MAX_W));
        const devW = Math.max(12, Math.round((s.devUs / MAX_US) * BAR_MAX_W));

        const activeSubgraphFlow = s.phase !== 'eager';

        return (
          <div className="csf-stage">
            {isDynamo && (
              <div className="csf-switcher">
                <span className="csf-switcher__label">
                  反事实对比（动态批大小 [4, 8, 1, 16, 1]）：
                </span>
                <LabSegmented
                  options={guardOptions}
                  value={guardMode}
                  onChange={setGuardMode}
                  ariaLabel="切换 Guard 模式"
                />
              </div>
            )}

            <Stage width={STAGE_W} height={286} label={s.phaseLabel}>
              {/* 上半区：算子分段流 */}
              <TensorBlock
                x={14}
                y={28}
                w={136}
                h={60}
                labelMode="inside"
                name="Subgraph 0 (静态段)"
                shape={isFused ? 'QKV + Norm 融合' : 'Norm → QKV 投影'}
                tone={isSplit ? 'active' : 'neutral'}
                active={isDynamo}
              />

              <DataFlowArrow
                points={[
                  [150, 58],
                  [178, 58],
                ]}
                tone={isSplit ? 'active' : 'neutral'}
                active={activeSubgraphFlow}
                flow={activeSubgraphFlow}
                continuous
                dotToken={dotToken}
              />

              <TensorBlock
                x={178}
                y={28}
                w={142}
                h={60}
                labelMode="inside"
                name="Attention (splitting_op)"
                shape="依赖块表 · Eager 调度"
                tone={isSplit ? 'highlight' : 'neutral'}
                dashed={isSplit}
                active={isDynamo}
              />

              <DataFlowArrow
                points={[
                  [320, 58],
                  [350, 58],
                ]}
                tone={isFused ? 'done' : 'active'}
                active
                flow
                continuous
                dotToken={dotToken}
              />

              <TensorBlock
                x={350}
                y={28}
                w={184}
                h={60}
                labelMode="inside"
                name={isFused ? 'Subgraph 1 (SwiGLU 已融合)' : 'Subgraph 1 (silu + mul 未融合)'}
                shape={isFused ? '3 趟 HBM (240 KB)' : '5 趟 HBM (400 KB)'}
                tone={isFused ? 'done' : s.phase === 'eager' ? 'highlight' : 'active'}
                active={s.phase === 'eager' || s.phase === 'fuse'}
              />

              <DataFlowArrow
                points={[
                  [534, 58],
                  [560, 58],
                ]}
                tone={s.phase === 'wall' ? 'highlight' : isFused ? 'done' : 'active'}
                active
                flow
                continuous
                dotToken={dotToken}
              />

              <TensorBlock
                x={560}
                y={28}
                w={106}
                h={60}
                labelMode="inside"
                name={s.phase === 'wall' ? '残余 400 次发射' : '单层产出'}
                shape={s.phase === 'wall' ? '4800 μs > 3400 μs' : `${s.opsPerLayer} 个算子/层`}
                tone={s.phase === 'wall' ? 'highlight' : 'done'}
                active={s.phase === 'wall'}
              />

              {/* 下半区：Host vs Device 时间条对比 */}
              <SectionBox x={12} y={114} w={656} h={88} tone="neutral" dashed={false} />
              <SvgRichLabel
                x={22}
                y={132}
                width={520}
                height={18}
                fontSize={10.5}
                anchor="start"
                color="var(--wisp-fg)"
                text={
                  isDynamo
                    ? `Guard 编译次数：${gSpec.recompiles} 次（${gSpec.badge}）`
                    : '40 层 DeepSeek-V4.1-Flash 单步对比（Host 发射 vs Device 算力）：'
                }
              />

              <motion.rect
                x={22}
                y={148}
                height={16}
                rx={3}
                fill={toneFill('highlight')}
                stroke={toneStroke('highlight')}
                strokeWidth={1.25}
                initial={false}
                animate={{ width: hostW }}
                transition={stepTransition}
              />
              <motion.g initial={false} animate={{ x: 28 + hostW }} transition={stepTransition}>
                <text y={160} fontSize={10.5} fontWeight={600} fill="var(--wisp-fg)">
                  Host {s.hostUs} μs
                </text>
              </motion.g>

              <motion.rect
                x={22}
                y={172}
                height={16}
                rx={3}
                fill={toneFill('done')}
                stroke={toneStroke('done')}
                strokeWidth={1.25}
                initial={false}
                animate={{ width: devW }}
                transition={stepTransition}
              />
              <motion.g initial={false} animate={{ x: 28 + devW }} transition={stepTransition}>
                <text y={184} fontSize={10.5} fill="var(--wisp-muted)">
                  Device {s.devUs} μs{s.hostUs > s.devUs ? '（仍受限于 Host 发射）' : ''}
                </text>
              </motion.g>

              <ActiveFocusFrame
                x={s.focusRect.x}
                y={s.focusRect.y}
                w={s.focusRect.w}
                h={s.focusRect.h}
                tone={s.focusRect.tone}
                label={isDynamo ? gSpec.badge : s.focusRect.label}
                labelAlign={s.phase === 'wall' ? 'right' : 'left'}
                visible
              />

              <MetricRow
                x={12}
                y={220}
                w={656}
                h={50}
                metrics={[
                  {
                    label: 'SwiGLU HBM 访存',
                    value: `${s.hbmBytesKb} KB`,
                    tone: isFused ? 'done' : 'highlight',
                    active: s.phase === 'eager' || s.phase === 'fuse',
                  },
                  {
                    label: '单层算子数量',
                    value: `${s.opsPerLayer} 个`,
                    tone: 'active',
                    active: isDynamo || s.phase === 'fuse',
                  },
                  {
                    label: '40 层总发射次数',
                    value: `${s.launchesPerStep} 次`,
                    tone: s.phase === 'wall' ? 'highlight' : 'active',
                    active: s.phase === 'wall',
                  },
                  {
                    label: 'Host / Device 比',
                    value: `${(s.hostUs / s.devUs).toFixed(2)}×`,
                    tone: s.phase === 'wall' ? 'highlight' : 'done',
                    active: true,
                  },
                ]}
              />
            </Stage>

            <p className="csf-note">{isDynamo ? gSpec.summary : s.note}</p>
          </div>
        );
      }}
    </BeatExplainer>
  );
}
