import { useMemo, useState, type ReactElement } from 'react';
import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, SvgRichLabel } from '@/explainers/kit';
import {
  BEAT_SCHEDULES,
  LAYER_BOUNDARY_SPECS,
  MANIM_EASE,
  buildMegaMhcPassSteps,
  type LayerKind,
  type MegaMhcStepState,
} from './steps';
import './style.css';

export { buildMegaMhcPassSteps };

export interface MegaMhcPassExplainerProps {
  title?: string;
}

function IoLedgerStage({
  state,
  beat,
  playToken,
}: {
  state: MegaMhcStepState;
  beat: number;
  playToken: number;
}) {
  const isShift = state.phase === 'shift_dep';
  const showShiftArrow = !isShift || beat >= 1;

  return (
    <div className="mega-stage">
      <div className="mega-io-row">
        <div className="mega-io-row__head">
          <span>单子层 HBM 读写切分对比（基准满槽 = 20d）</span>
          <span
            className="mega-badge"
            style={{
              background: toneFill(state.totalD === 10 ? 'done' : 'highlight'),
              borderColor: toneStroke(state.totalD === 10 ? 'done' : 'highlight'),
            }}
          >
            合计 {state.totalD}d · {state.hbmTrips} 趟 Kernel
          </span>
        </div>

        <svg className="mega-svg" viewBox="0 0 680 96" aria-label="HBM 字节比例条与依赖链路">
          {
            state.segments.reduce<{ x: number; nodes: ReactElement[] }>(
              (acc, seg, idx) => {
                const w = Math.round((seg.costD / 20) * 656);
                const active = idx <= beat || state.phase === 'single_pass';
                const tone = seg.tone === 'neutral' ? undefined : seg.tone;
                const fill = active && tone ? toneFill(tone) : 'var(--wisp-surface)';
                const stroke = active && tone ? toneStroke(tone) : 'var(--wisp-border)';
                acc.nodes.push(
                  <g key={seg.label}>
                    <motion.rect
                      x={acc.x}
                      y={8}
                      width={Math.max(w - 4, 48)}
                      height={44}
                      rx={4}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={active ? 1.5 : 1}
                      initial={false}
                      animate={{ opacity: active ? 1 : 0.45 }}
                      transition={{ duration: 0.25, ease: MANIM_EASE }}
                    />
                    <text
                      x={acc.x + Math.max(w - 4, 48) / 2}
                      y={27}
                      textAnchor="middle"
                      fontSize={10.5}
                      fontWeight={600}
                      fill="var(--wisp-fg)"
                    >
                      {seg.label}
                    </text>
                    <text
                      x={acc.x + Math.max(w - 4, 48) / 2}
                      y={43}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--wisp-muted)"
                    >
                      {seg.costD}d
                    </text>
                  </g>,
                );
                return { x: acc.x + w, nodes: acc.nodes };
              },
              { x: 12, nodes: [] },
            ).nodes
          }

          {state.totalD < 20 && (
            <rect
              x={12 + Math.round((state.totalD / 20) * 656)}
              y={8}
              width={656 - Math.round((state.totalD / 20) * 656)}
              height={44}
              rx={4}
              fill="var(--wisp-surface)"
              stroke="var(--wisp-border)"
              strokeDasharray="4 3"
            />
          )}
          {state.totalD < 20 && (
            <text
              x={
                12 +
                Math.round((state.totalD / 20) * 656) +
                (656 - Math.round((state.totalD / 20) * 656)) / 2
              }
              y={34}
              textAnchor="middle"
              fontSize={10.5}
              fill="var(--wisp-muted)"
            >
              省下 {20 - state.totalD}d 显存往返（-{Math.round(((20 - state.totalD) / 20) * 100)}%）
            </text>
          )}

          <SvgRichLabel
            x={14}
            y={64}
            width={650}
            height={22}
            fontSize={10.5}
            anchor="start"
            color="var(--wisp-fg)"
            text={
              isShift
                ? showShiftArrow
                  ? '时移解除依赖：当前子层直接用上层算好的 $A_{l-1}$ 聚合，并把新算出的 $A_l$ 递给下一子层'
                  : '原依赖冲突：$A_l$ 需等全维归约完才能聚合'
                : `关键机制：${state.blockerNote}`
            }
          />

          {playToken > 0 && (
            <motion.circle
              key={`mega-pulse-${state.phase}-${playToken}`}
              r={3}
              fill={toneStroke(state.totalD === 10 ? 'done' : 'active')}
              initial={{ cx: 16, cy: 56, opacity: 0 }}
              animate={{
                cx: [16, 12 + Math.round((state.totalD / 20) * 656)],
                cy: 56,
                opacity: [0, 1, 0],
              }}
              transition={{ duration: 0.85, ease: MANIM_EASE }}
            />
          )}
        </svg>
      </div>

      <div className="mega-bar-track">
        {state.segments.map((seg, idx) => {
          const active = idx <= beat || state.phase === 'single_pass';
          const tone = seg.tone === 'neutral' ? undefined : seg.tone;
          return (
            <div
              key={seg.label}
              className="mega-bar-seg"
              style={{
                flex: seg.costD,
                background: active && tone ? toneFill(tone) : 'var(--wisp-surface)',
                borderColor: active && tone ? toneStroke(tone) : 'var(--wisp-border)',
              }}
            >
              <span>
                {seg.label}（{seg.costD}d）
              </span>
              <span className="mega-bar-seg__sub">{seg.detail}</span>
            </div>
          );
        })}
      </div>

      <div className="mega-note-box">{state.blockerNote}</div>
    </div>
  );
}

function BoundaryCompareStage({
  layerKind,
  onSelectKind,
}: {
  layerKind: LayerKind;
  onSelectKind: (kind: LayerKind) => void;
}) {
  const spec = LAYER_BOUNDARY_SPECS[layerKind];
  const isEngram = layerKind === 'engram';

  return (
    <div className="mega-stage">
      <div className="mega-switcher">
        <span style={{ fontSize: '0.75rem', color: 'var(--wisp-muted)' }}>
          反事实对比（层位边界切分）：
        </span>
        <div className="mega-switcher__group" role="group" aria-label="切换层位模式">
          {(Object.keys(LAYER_BOUNDARY_SPECS) as LayerKind[]).map((id) => (
            <button
              key={id}
              type="button"
              className="mega-switcher__btn"
              aria-pressed={layerKind === id}
              onClick={() => onSelectKind(id)}
            >
              {LAYER_BOUNDARY_SPECS[id].label}
            </button>
          ))}
        </div>
      </div>

      <svg className="mega-svg" viewBox="0 0 680 120" aria-label="GPU 与 NPU 边界融合对照">
        <rect
          x={12}
          y={10}
          width={318}
          height={98}
          rx={4}
          fill={toneFill(isEngram ? 'highlight' : 'active')}
          stroke={toneStroke(isEngram ? 'highlight' : 'active')}
          strokeWidth={1.5}
        />
        <text x={24} y={32} fontSize={11} fontWeight={600} fill="var(--wisp-fg)">
          NVIDIA GPU（vLLM）：{spec.gpuIo}
        </text>
        <text x={24} y={54} fontSize={10} fill="var(--wisp-muted)">
          {spec.gpuPath}
        </text>
        <text x={24} y={84} fontSize={10} fill="var(--wisp-fg)">
          {isEngram ? '显式拆出 [T, 4, d] 给 Engram' : '常规层保持 10d 单遍延迟融合'}
        </text>

        <rect
          x={350}
          y={10}
          width={318}
          height={98}
          rx={4}
          fill={toneFill('done')}
          stroke={toneStroke('done')}
          strokeWidth={1.5}
        />
        <text x={362} y={32} fontSize={11} fontWeight={600} fill="var(--wisp-fg)">
          Huawei Ascend NPU（vllm-ascend）：{spec.npuIo}
        </text>
        <text x={362} y={54} fontSize={10} fill="var(--wisp-muted)">
          {spec.npuPath}
        </text>
        <text x={362} y={84} fontSize={10} fill="var(--wisp-fg)">
          {isEngram ? '四流本已展开，直接读写 AscendEngram' : '每子层尾部 npu_hc_post 成对写回'}
        </text>
      </svg>

      <div className="mega-two-col">
        <div className="mega-hw-card">
          <div className="mega-hw-card__title">
            <span>GPU 路径判断</span>
            <span
              className="mega-badge"
              style={{
                background: toneFill(isEngram ? 'highlight' : 'active'),
                borderColor: toneStroke(isEngram ? 'highlight' : 'active'),
              }}
            >
              {spec.gpuIo}
            </span>
          </div>
          <p className="mega-hw-card__body">{spec.gpuPath}</p>
        </div>
        <div className="mega-hw-card">
          <div className="mega-hw-card__title">
            <span>NPU 路径判断</span>
            <span
              className="mega-badge"
              style={{ background: toneFill('done'), borderColor: toneStroke('done') }}
            >
              {spec.npuIo}
            </span>
          </div>
          <p className="mega-hw-card__body">{spec.npuPath}</p>
        </div>
      </div>

      <div className="mega-note-box">{spec.summary}</div>
    </div>
  );
}

export default function MegaMhcPassExplainer({ title }: MegaMhcPassExplainerProps) {
  const steps = useMemo(() => buildMegaMhcPassSteps(), []);
  const [layerKind, setLayerKind] = useState<LayerKind>('normal');

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={310}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={layerKind}
    >
      {(step, { beat, dotToken }) => {
        if (step.state.phase === 'boundary') {
          return <BoundaryCompareStage layerKind={layerKind} onSelectKind={setLayerKind} />;
        }
        return <IoLedgerStage state={step.state} beat={beat} playToken={dotToken} />;
      }}
    </BeatExplainer>
  );
}
