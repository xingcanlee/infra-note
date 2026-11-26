import { Fragment, useMemo, useState } from 'react';
import { RichText, toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, SvgRichLabel } from '@/explainers/kit';
import {
  BEAT_SCHEDULES,
  MANIM_EASE,
  STABILITY_MODES,
  buildMhcSinkhornSteps,
  type MhcSinkhornState,
  type StabilityMode,
} from './steps';
import './style.css';

export { buildMhcSinkhornSteps };

export interface MhcSinkhornExplainerProps {
  title?: string;
}

function StreamStage({
  state,
  beat,
  playToken,
}: {
  state: MhcSinkhornState;
  beat: number;
  playToken: number;
}) {
  const isCalc = state.phase === 'single_layer';
  const showPre = !isCalc || beat >= 1;
  const showRes = !isCalc || beat >= 2;
  const showOut = !isCalc || beat >= 3;

  return (
    <div className="mhc-sk-stage">
      <svg className="mhc-sk-svg" viewBox="0 0 680 128" aria-label="四流超连接数据流向图">
        <rect
          x={12}
          y={12}
          width={144}
          height={96}
          rx={4}
          fill="var(--wisp-surface)"
          stroke="var(--wisp-border)"
          strokeWidth={1.25}
        />
        <SvgRichLabel
          x={20}
          y={20}
          width={128}
          height={20}
          fontSize={10.5}
          anchor="start"
          color="var(--wisp-fg)"
          text={'输入四流 $\\mathbf{x}_l$'}
        />
        <text x={20} y={56} fontSize={10} fill="var(--wisp-muted)">
          {isCalc ? '[10, 20, 30, 40]' : '[4, C] 并行残差'}
        </text>
        <text x={20} y={76} fontSize={10} fill="var(--wisp-muted)">
          {isCalc ? '总和 100 · 均值 25' : '算子宽度保持 C'}
        </text>

        <motion.path
          d="M 156 42 L 222 42"
          fill="none"
          stroke={toneStroke('done')}
          strokeWidth={1.75}
          initial={false}
          animate={{ opacity: showRes ? 1 : 0.25 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        />
        <motion.path
          d="M 156 80 L 222 80"
          fill="none"
          stroke={toneStroke('active')}
          strokeWidth={1.75}
          initial={false}
          animate={{ opacity: showPre ? 1 : 0.25 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        />

        {playToken > 0 && showRes && (
          <motion.circle
            key={`res-dot-${state.phase}-${playToken}`}
            r={3}
            fill={toneStroke('done')}
            initial={{ cx: 156, cy: 42, opacity: 0 }}
            animate={{ cx: [156, 222], cy: 42, opacity: [0, 1, 0] }}
            transition={{ duration: 0.7, ease: MANIM_EASE }}
          />
        )}

        <rect
          x={224}
          y={12}
          width={212}
          height={44}
          rx={4}
          fill={showRes ? toneFill('done') : 'var(--wisp-surface)'}
          stroke={showRes ? toneStroke('done') : 'var(--wisp-border)'}
          strokeWidth={1.5}
        />
        <SvgRichLabel
          x={234}
          y={18}
          width={192}
          height={18}
          fontSize={10.5}
          anchor="start"
          color="var(--wisp-fg)"
          text={'主干 Res $\\mathcal{H}_l^{\\mathrm{res}}\\mathbf{x}_l$'}
        />
        <text x={234} y={46} fontSize={10} fill="var(--wisp-muted)">
          {isCalc ? '得 [19, 24, 26, 31]（和=100）' : '双随机矩阵跨流混合'}
        </text>

        <rect
          x={224}
          y={64}
          width={212}
          height={44}
          rx={4}
          fill={showPre ? toneFill('active') : 'var(--wisp-surface)'}
          stroke={showPre ? toneStroke('active') : 'var(--wisp-border)'}
          strokeWidth={1.5}
        />
        <SvgRichLabel
          x={234}
          y={70}
          width={192}
          height={18}
          fontSize={10.5}
          anchor="start"
          color="var(--wisp-fg)"
          text={'旁路 Pre → $\\mathcal{F}$ → Post'}
        />
        <text x={234} y={98} fontSize={10} fill="var(--wisp-muted)">
          {isCalc ? '19.0 → +4.0 → [+4.8,+3.2,+2,+6]' : '压回 [1, C] 计算后扩回 4 流'}
        </text>

        <motion.path
          d="M 436 34 L 502 52 M 436 86 L 502 68"
          fill="none"
          stroke="var(--wisp-fg)"
          strokeWidth={1.5}
          initial={false}
          animate={{ opacity: showOut ? 1 : 0.25 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        />

        <rect
          x={504}
          y={12}
          width={164}
          height={96}
          rx={4}
          fill={showOut ? toneFill('done') : 'var(--wisp-surface)'}
          stroke={showOut ? toneStroke('done') : 'var(--wisp-border)'}
          strokeWidth={showOut ? 1.75 : 1.25}
        />
        <SvgRichLabel
          x={514}
          y={20}
          width={144}
          height={20}
          fontSize={10.5}
          anchor="start"
          color="var(--wisp-fg)"
          text={'输出四流 $\\mathbf{x}_{l+1}$'}
        />
        <text x={514} y={56} fontSize={10} fontWeight={600} fill="var(--wisp-fg)">
          {isCalc ? '[23.8, 27.2, 28.0, 37.0]' : '[4, C] 写回下一子层'}
        </text>
        <text x={514} y={76} fontSize={10} fill="var(--wisp-muted)">
          {isCalc ? 'RMSNorm 仅在旁路内部' : '直连主干不插入 Norm'}
        </text>
      </svg>

      <div className="mhc-sk-grid-2">
        <div className="mhc-sk-card">
          <div className="mhc-sk-card__head">
            <span>输入与 Res 混合值（首维）</span>
            <span
              className="mhc-sk-badge"
              style={{
                background: toneFill('done'),
                borderColor: toneStroke('done'),
              }}
            >
              均值守恒 25.0
            </span>
          </div>
          <div className="mhc-sk-streams">
            {state.inputStreams.map((val, idx) => (
              <div
                key={`stream-${idx}`}
                className="mhc-sk-cell"
                style={{
                  background: showOut ? toneFill('done') : 'var(--wisp-surface)',
                  borderColor: showOut ? toneStroke('done') : 'var(--wisp-border)',
                }}
              >
                <span>{showOut ? state.outputStreams[idx].toFixed(1) : val.toFixed(1)}</span>
                <span className="mhc-sk-cell__sub">
                  流 {idx} · Res {state.hRes[idx].toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mhc-sk-card">
          <div className="mhc-sk-card__head">
            <span>旁路单流汇总与写回权重</span>
            <span
              className="mhc-sk-badge"
              style={{
                background: toneFill('active'),
                borderColor: toneStroke('active'),
              }}
            >
              <RichText text={`$h^{\\mathrm{in}}=${state.hIn.toFixed(1)}$`} />
            </span>
          </div>
          <div className="mhc-sk-streams">
            {state.postWeights.map((pw, idx) => (
              <div
                key={`pw-${idx}`}
                className="mhc-sk-cell"
                style={{
                  background: showPre ? toneFill('active') : 'var(--wisp-surface)',
                  borderColor: showPre ? toneStroke('active') : 'var(--wisp-border)',
                }}
              >
                <span>+{state.hPost[idx].toFixed(1)}</span>
                <span className="mhc-sk-cell__sub">Post {pw.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SinkhornNormStage({ state, beat }: { state: MhcSinkhornState; beat: number }) {
  const mat = state.sinkhornMatrix;
  const tone = state.phase === 'exp_init' ? 'active' : 'done';
  const focusCol = state.phase === 'col_norm' && beat >= 1 ? (beat >= 2 ? 1 : 0) : -1;
  const focusRow = state.phase === 'row_norm' && beat >= 1 ? (beat >= 2 ? 1 : 0) : -1;

  return (
    <div className="mhc-sk-stage">
      <div className="mhc-sk-grid-2">
        <div className="mhc-sk-card">
          <div className="mhc-sk-card__head">
            <span>2×2 矩阵交替归一化状态</span>
            <span
              className="mhc-sk-badge"
              style={{ background: toneFill(tone), borderColor: toneStroke(tone) }}
            >
              {state.phase === 'exp_init'
                ? '全正初值'
                : state.phase === 'col_norm'
                  ? '列归一 Tc'
                  : '行归一 Tr'}
            </span>
          </div>
          <div className="mhc-sk-mat-2x2">
            {mat.map((row, ri) => (
              <Fragment key={`row-${ri}`}>
                {row.map((val, ci) => {
                  const active = ri === focusRow || ci === focusCol;
                  return (
                    <div
                      key={`m-${ri}-${ci}`}
                      className="mhc-sk-cell"
                      style={{
                        background: active ? toneFill(tone) : 'var(--wisp-surface)',
                        borderColor: active ? toneStroke(tone) : 'var(--wisp-border)',
                      }}
                    >
                      <span>{val.toFixed(2)}</span>
                      <span className="mhc-sk-cell__sub">
                        ({ri},{ci})
                      </span>
                    </div>
                  );
                })}
                <div key={`rsum-${ri}`} className="mhc-sk-sum-pill">
                  行和 {state.rowSums[ri].toFixed(2)}
                </div>
              </Fragment>
            ))}
            <div className="mhc-sk-sum-pill">列和 {state.colSums[0].toFixed(2)}</div>
            <div className="mhc-sk-sum-pill">列和 {state.colSums[1].toFixed(2)}</div>
            <div className="mhc-sk-sum-pill">20 轮后 → 1.00</div>
          </div>
        </div>

        <div className="mhc-sk-card">
          <div className="mhc-sk-card__head">
            <span>为何不能只用普通 Softmax</span>
            <span className="mhc-sk-badge">前向 + 反向守恒</span>
          </div>
          <svg className="mhc-sk-svg" viewBox="0 0 310 124" aria-label="Sinkhorn 与 Softmax 对比">
            <rect
              x={4}
              y={8}
              width={302}
              height={50}
              rx={4}
              fill={toneFill('error')}
              stroke={toneStroke('error')}
              strokeWidth={1.25}
            />
            <text x={14} y={28} fontSize={11} fontWeight={600} fill="var(--wisp-fg)">
              单侧 Softmax：仅保证行和 = 1
            </text>
            <text x={14} y={46} fontSize={10} fill="var(--wisp-muted)">
              列和可远大于 1，反向梯度随层数连乘仍然失衡
            </text>

            <rect
              x={4}
              y={66}
              width={302}
              height={50}
              rx={4}
              fill={toneFill('done')}
              stroke={toneStroke('done')}
              strokeWidth={1.5}
            />
            <text x={14} y={86} fontSize={11} fontWeight={600} fill="var(--wisp-fg)">
              Sinkhorn-Knopp：行和 = 1 且列和 = 1
            </text>
            <text x={14} y={104} fontSize={10} fill="var(--wisp-muted)">
              落在 Birkhoff 多面体内，乘法封闭且谱范数不超过 1
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}

function MultiLayerCompareStage({
  mode,
  onSelectMode,
  beat,
}: {
  mode: StabilityMode;
  onSelectMode: (next: StabilityMode) => void;
  beat: number;
}) {
  const spec = STABILITY_MODES[mode];
  const tone = mode === 'hc' ? 'error' : mode === 'sinkhorn_5' ? 'active' : 'done';
  const showDetail = beat >= 1;

  return (
    <div className="mhc-sk-stage">
      <div className="mhc-sk-switcher">
        <span style={{ fontSize: '0.75rem', color: 'var(--wisp-muted)' }}>
          反事实对比（60 子层连乘复合矩阵）：
        </span>
        <div className="mhc-sk-switcher__group" role="group" aria-label="切换连乘稳定方案">
          {(Object.keys(STABILITY_MODES) as StabilityMode[]).map((id) => (
            <button
              key={id}
              type="button"
              className="mhc-sk-switcher__btn"
              aria-pressed={mode === id}
              onClick={() => onSelectMode(id)}
            >
              {STABILITY_MODES[id].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mhc-sk-grid-2">
        <div className="mhc-sk-card">
          <div className="mhc-sk-card__head">
            <span>27B 第 60 子层连乘复合矩阵</span>
            <span
              className="mhc-sk-badge"
              style={{ background: toneFill(tone), borderColor: toneStroke(tone) }}
            >
              {spec.badge}
            </span>
          </div>
          <div className="mhc-sk-mat-4x4">
            {spec.matrix60.flatMap((row, ri) =>
              row.map((val, ci) => (
                <div
                  key={`c60-${ri}-${ci}`}
                  className="mhc-sk-cell"
                  style={{
                    background: toneFill(tone),
                    borderColor: toneStroke(tone),
                  }}
                >
                  <span>{val > 0 && mode === 'hc' ? `+${val.toFixed(1)}` : val.toFixed(2)}</span>
                </div>
              )),
            )}
          </div>
        </div>

        <div className="mhc-sk-card">
          <div className="mhc-sk-card__head">
            <span>复合增益与行列和边界</span>
            <span
              className="mhc-sk-badge"
              style={{ background: toneFill(tone), borderColor: toneStroke(tone) }}
            >
              {spec.gainText}
            </span>
          </div>
          <svg className="mhc-sk-svg" viewBox="0 0 310 92" aria-label="60 子层复合增益条">
            <rect
              x={4}
              y={10}
              width={302}
              height={16}
              rx={3}
              fill="var(--wisp-surface)"
              stroke="var(--wisp-border)"
            />
            <motion.rect
              x={4}
              y={10}
              height={16}
              rx={3}
              fill={toneFill(tone)}
              stroke={toneStroke(tone)}
              strokeWidth={1.5}
              initial={false}
              animate={{ width: Math.round(302 * (spec.barPct / 100)) }}
              transition={{ duration: 0.35, ease: MANIM_EASE }}
            />
            <text x={6} y={46} fontSize={10.5} fill="var(--wisp-fg)">
              行和区间：{spec.rowSumRange} · 列和区间：{spec.colSumRange}
            </text>
            <text x={6} y={66} fontSize={10} fill="var(--wisp-muted)">
              {showDetail ? spec.summary.slice(0, 29) : '正在对比 60 子层复合矩阵边界'}
            </text>
            <text x={6} y={82} fontSize={10} fill="var(--wisp-muted)">
              {showDetail ? spec.summary.slice(29) : ''}
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function MhcSinkhornExplainer({ title }: MhcSinkhornExplainerProps) {
  const steps = useMemo(() => buildMhcSinkhornSteps(), []);
  const [mode, setMode] = useState<StabilityMode>('hc');

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={350}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={mode}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        if (s.phase === 'expand' || s.phase === 'single_layer') {
          return <StreamStage state={s} beat={beat} playToken={dotToken} />;
        }
        if (s.phase === 'multi_layer') {
          return <MultiLayerCompareStage mode={mode} onSelectMode={setMode} beat={beat} />;
        }
        return <SinkhornNormStage state={s} beat={beat} />;
      }}
    </BeatExplainer>
  );
}
