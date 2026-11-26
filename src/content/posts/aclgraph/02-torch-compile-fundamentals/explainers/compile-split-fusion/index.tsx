import { useMemo, useState } from 'react';
import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, SvgRichLabel } from '@/explainers/kit';
import {
  BEAT_SCHEDULES,
  GUARD_MODES,
  MANIM_EASE,
  buildCompileSplitFusionSteps,
  type GuardMode,
} from './steps';
import './style.css';

export { buildCompileSplitFusionSteps };

export default function CompileSplitFusionExplainer({ title }: { title?: string }) {
  const steps = useMemo(() => buildCompileSplitFusionSteps(), []);
  const [guardMode, setGuardMode] = useState<GuardMode>('zero_one');

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={330}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={guardMode}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        const isDynamo = s.phase === 'dynamo';
        const isFused = s.phase === 'fuse' || s.phase === 'wall';
        const isSplit = s.phase === 'split' || isFused;
        const gSpec = GUARD_MODES[guardMode];

        return (
          <div className="csf-stage">
            {isDynamo && (
              <div className="csf-switcher">
                <span style={{ fontSize: '0.75rem', color: 'var(--wisp-muted)' }}>
                  反事实对比（动态批大小 [4, 8, 1, 16, 1]）：
                </span>
                <div className="csf-switcher__group" role="group" aria-label="切换 Guard 模式">
                  {(Object.keys(GUARD_MODES) as GuardMode[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="csf-switcher__btn"
                      aria-pressed={guardMode === id}
                      onClick={() => setGuardMode(id)}
                    >
                      {GUARD_MODES[id].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <svg className="csf-svg" viewBox="0 0 680 156" aria-label="编译切图与算子融合演进图">
              {/* 上半区：算子分段流 */}
              <rect
                x={12}
                y={10}
                width={148}
                height={52}
                rx={4}
                fill={toneFill('active')}
                stroke={toneStroke('active')}
                strokeWidth={1.5}
              />
              <text
                x={86}
                y={32}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--wisp-fg)"
              >
                Subgraph 0 (静态段)
              </text>
              <text x={86} y={49} textAnchor="middle" fontSize={10} fill="var(--wisp-muted)">
                {isFused ? 'QKV + Norm 融合核' : 'Norm → QKV 投影'}
              </text>

              <rect
                x={182}
                y={10}
                width={148}
                height={52}
                rx={4}
                fill={isSplit ? toneFill('highlight') : 'var(--wisp-surface)'}
                stroke={isSplit ? toneStroke('highlight') : 'var(--wisp-border)'}
                strokeWidth={isSplit ? 1.5 : 1}
                strokeDasharray={isSplit ? '4 3' : undefined}
              />
              <text
                x={256}
                y={32}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--wisp-fg)"
              >
                Attention (splitting_op)
              </text>
              <text x={256} y={49} textAnchor="middle" fontSize={10} fill="var(--wisp-muted)">
                依赖块表 · 留给 Eager 调度
              </text>

              <rect
                x={352}
                y={10}
                width={180}
                height={52}
                rx={4}
                fill={isFused ? toneFill('done') : toneFill('active')}
                stroke={isFused ? toneStroke('done') : toneStroke('active')}
                strokeWidth={1.5}
              />
              <text
                x={442}
                y={32}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--wisp-fg)"
              >
                {isFused ? 'Subgraph 1 (SwiGLU 已融合)' : 'Subgraph 1 (silu + mul 未融)'}
              </text>
              <text x={442} y={49} textAnchor="middle" fontSize={10} fill="var(--wisp-muted)">
                {isFused ? '3 趟 HBM (240 KB)' : '5 趟 HBM (400 KB)'}
              </text>

              <rect
                x={550}
                y={10}
                width={118}
                height={52}
                rx={4}
                fill={toneFill(s.phase === 'wall' ? 'highlight' : 'done')}
                stroke={toneStroke(s.phase === 'wall' ? 'highlight' : 'done')}
                strokeWidth={1.5}
              />
              <text
                x={609}
                y={32}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--wisp-fg)"
              >
                {s.phase === 'wall' ? '残余 400 次发射' : '单层产出'}
              </text>
              <text x={609} y={49} textAnchor="middle" fontSize={10} fill="var(--wisp-muted)">
                {s.phase === 'wall' ? '4800 μs > 3400 μs' : `${s.opsPerLayer} 个算子/层`}
              </text>

              <path
                d="M 160 36 L 182 36 M 330 36 L 352 36 M 532 36 L 550 36"
                fill="none"
                stroke="var(--wisp-fg)"
                strokeWidth={1.5}
              />

              {dotToken > 0 && (
                <motion.circle
                  key={`csf-dot-${s.phase}-${dotToken}`}
                  r={3}
                  fill={toneStroke(isFused ? 'done' : 'active')}
                  initial={{ cx: 16, cy: 36, opacity: 0 }}
                  animate={{ cx: [16, 256, 442, 660], cy: 36, opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 0.9, ease: MANIM_EASE }}
                />
              )}

              {/* 下半区：Host vs Device 时间条对比 */}
              <rect
                x={12}
                y={82}
                width={656}
                height={62}
                rx={4}
                fill="var(--wisp-surface)"
                stroke="var(--wisp-border)"
              />
              <SvgRichLabel
                x={22}
                y={88}
                width={380}
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
                y={110}
                height={12}
                rx={3}
                fill={toneFill('highlight')}
                stroke={toneStroke('highlight')}
                strokeWidth={1.25}
                initial={false}
                animate={{ width: Math.round((s.hostUs / 14000) * 480) }}
                transition={{ duration: 0.35, ease: MANIM_EASE }}
              />
              <text
                x={28 + Math.round((s.hostUs / 14000) * 480)}
                y={120}
                fontSize={10}
                fontWeight={600}
                fill="var(--wisp-fg)"
              >
                Host {s.hostUs} μs
              </text>

              <motion.rect
                x={22}
                y={126}
                height={12}
                rx={3}
                fill={toneFill('done')}
                stroke={toneStroke('done')}
                strokeWidth={1.25}
                initial={false}
                animate={{ width: Math.round((s.devUs / 14000) * 480) }}
                transition={{ duration: 0.35, ease: MANIM_EASE }}
              />
              <text
                x={28 + Math.round((s.devUs / 14000) * 480)}
                y={136}
                fontSize={10}
                fill="var(--wisp-muted)"
              >
                Device {s.devUs} μs{' '}
                {beat >= 2 && s.hostUs > s.devUs ? '（仍受限于 Host 发射）' : ''}
              </text>
            </svg>

            <div className="csf-metrics">
              <div className="csf-card">
                <span className="csf-card__lbl">SwiGLU HBM 访存</span>
                <span className="csf-card__val">{s.hbmBytesKb} KB</span>
              </div>
              <div className="csf-card">
                <span className="csf-card__lbl">单层算子数量</span>
                <span className="csf-card__val">{s.opsPerLayer} 个</span>
              </div>
              <div className="csf-card">
                <span className="csf-card__lbl">40 层总发射次数</span>
                <span className="csf-card__val">{s.launchesPerStep} 次</span>
              </div>
              <div className="csf-card">
                <span className="csf-card__lbl">Host / Device 比</span>
                <span className="csf-card__val">{(s.hostUs / s.devUs).toFixed(2)}×</span>
              </div>
            </div>

            <p className="csf-note">{isDynamo ? gSpec.summary : s.note}</p>
          </div>
        );
      }}
    </BeatExplainer>
  );
}
