import { useMemo, useState } from 'react';
import { RichText, toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, SvgRichLabel } from '@/explainers/kit';
import {
  ALL_CONV_RESULTS,
  BEAT_SCHEDULES,
  CONV_TOKENS,
  LEFT_PAD,
  MANIM_EASE,
  MORPH_SPRING,
  PROBE_POSITIONS,
  WEIGHTS,
  buildShortConvSteps,
  computeDilatedConvAt,
  tapTone,
  type ConvTap,
} from './steps';
import './style.css';

export { buildShortConvSteps };

export interface ShortConvExplainerProps {
  title?: string;
}

const PAD_X = 17;
const CELL_W = 34;

function cellLeft(col: number): number {
  return PAD_X + col * CELL_W;
}

function cellCenter(col: number): number {
  return PAD_X + col * CELL_W + CELL_W / 2;
}

function formatDotTex(taps: readonly ConvTap[]): string {
  return taps
    .map((t, idx) => {
      const absW = Math.abs(t.weight);
      const term = `${absW}\\times ${t.xVal}`;
      if (idx === 0) return t.weight < 0 ? `-${term}` : term;
      return t.weight < 0 ? ` - ${term}` : ` + ${term}`;
    })
    .join('');
}

interface ConvScanCanvasProps {
  focusPos: number;
  dilation?: number;
  combVisible?: boolean;
  padVisible?: boolean;
  revealedUpTo: number;
  highlightPrefix5?: boolean;
  playToken: number;
  tag: string;
}

function ConvScanCanvas({
  focusPos,
  dilation = 3,
  combVisible = true,
  padVisible = true,
  revealedUpTo,
  highlightPrefix5 = false,
  playToken,
  tag,
}: ConvScanCanvasProps) {
  const res = computeDilatedConvAt(focusPos, dilation);
  const tapMap = new Map(res.taps.map((t) => [t.srcPos, t]));
  const baseCenter = cellCenter(9); // t = 0 的中心 x = 340
  const outCenterX = cellCenter(focusPos + 9);
  const leftmostLocalX = -3 * dilation * CELL_W;

  return (
    <svg className="sc-scan-svg" viewBox="0 0 680 232" aria-label="19 格刚性卷积核横向扫描轨道">
      {/* 区域引导标签：左补零区 vs 10 词实词区 */}
      <SvgRichLabel
        x={PAD_X + 2}
        y={54}
        width={180}
        height={18}
        fontSize={9.5}
        anchor="start"
        color="var(--wisp-muted)"
        text={'左补零区 $t = -9 \\dots -1$'}
      />
      <SvgRichLabel
        x={cellLeft(9) + 2}
        y={54}
        width={330}
        height={18}
        fontSize={9.5}
        anchor="start"
        color="var(--wisp-muted)"
        text={'10 词输入序列 $t = 0 \\dots 9$（承接“北京 是 中国 的 首…”）'}
      />

      {/* 19 个输入格（col 0..8 为 9 个独立 0 格，col 9..18 为 10 个实词格） */}
      {Array.from({ length: LEFT_PAD }, (_, i) => {
        const srcPos = i - LEFT_PAD;
        const x = cellLeft(i);
        const hitTap = combVisible ? tapMap.get(srcPos) : undefined;
        const fill = hitTap
          ? toneFill('highlight')
          : padVisible
            ? 'var(--wisp-surface)'
            : 'var(--wisp-bg)';
        const stroke = hitTap ? toneStroke('highlight') : 'var(--wisp-border)';
        return (
          <motion.g
            key={`pad-${srcPos}`}
            initial={false}
            animate={{ opacity: padVisible ? 1 : 0.2 }}
            transition={{ duration: 0.28, ease: MANIM_EASE }}
          >
            <rect
              x={x + 1}
              y={64}
              width={CELL_W - 2}
              height={54}
              rx={3}
              fill={fill}
              stroke={stroke}
              strokeWidth={hitTap ? 1.6 : 1}
              strokeDasharray={hitTap ? undefined : '3 2'}
            />
            <text
              x={x + CELL_W / 2}
              y={78}
              textAnchor="middle"
              fontSize={8.5}
              fill="var(--wisp-muted)"
            >
              {srcPos}
            </text>
            <text
              x={x + CELL_W / 2}
              y={96}
              textAnchor="middle"
              fontSize={9}
              fill="var(--wisp-muted)"
            >
              pad
            </text>
            <text
              x={x + CELL_W / 2}
              y={111}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--wisp-fg)"
            >
              0
            </text>
          </motion.g>
        );
      })}

      {CONV_TOKENS.map((tok) => {
        const col = tok.pos + LEFT_PAD;
        const x = cellLeft(col);
        const hitTap = combVisible ? tapMap.get(tok.pos) : undefined;
        const isCurrent = combVisible && tok.pos === focusPos;
        const tone = hitTap
          ? tapTone(hitTap.tapIdx, false)
          : highlightPrefix5 && tok.inPrefix5
            ? 'active'
            : null;
        const fill = tone ? toneFill(tone) : 'var(--wisp-surface)';
        const stroke = tone ? toneStroke(tone) : 'var(--wisp-border)';

        return (
          <g key={`in-${tok.pos}`}>
            <rect
              x={x + 1}
              y={64}
              width={CELL_W - 2}
              height={54}
              rx={3}
              fill={fill}
              stroke={stroke}
              strokeWidth={isCurrent ? 2 : hitTap ? 1.5 : 1}
            />
            <text
              x={x + CELL_W / 2}
              y={78}
              textAnchor="middle"
              fontSize={8.5}
              fill="var(--wisp-muted)"
            >
              t={tok.pos}
            </text>
            <text
              x={x + CELL_W / 2}
              y={96}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={600}
              fill="var(--wisp-fg)"
            >
              {tok.text}
            </text>
            <text
              x={x + CELL_W / 2}
              y={111}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--wisp-fg)"
            >
              x={tok.xVal}
            </text>
          </g>
        );
      })}

      {/* 中部汇聚连线：从当前被 4 根齿踩中的输入格底部汇聚到输出格 y_t 顶部 */}
      {combVisible &&
        res.taps.map((tap) => {
          const sx = cellCenter(tap.srcPos + LEFT_PAD);
          const stroke = tap.isPad ? 'var(--wisp-muted)' : toneStroke(tapTone(tap.tapIdx, false));
          const wireD = `M ${sx} 118 L ${sx} 138 L ${outCenterX} 152 L ${outCenterX} 174`;

          return (
            <g key={`wire-${tap.tapIdx}`}>
              <motion.path
                d={wireD}
                fill="none"
                stroke={stroke}
                strokeWidth={tap.isPad ? 1.25 : 1.75}
                strokeDasharray={tap.isPad ? '3 3' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={{ opacity: tap.isPad ? 0.55 : 0.95 }}
                transition={{ duration: 0.25 }}
              />
              {playToken > 0 && !tap.isPad && (
                <motion.circle
                  key={`sc-wdot-${tag}-${focusPos}-${tap.tapIdx}-${playToken}`}
                  r={2.8}
                  fill={stroke}
                  initial={{ cx: sx, cy: 118, opacity: 0 }}
                  animate={{
                    cx: [sx, sx, outCenterX, outCenterX],
                    cy: [118, 138, 152, 174],
                    opacity: [0, 1, 1, 0],
                  }}
                  transition={{ duration: 0.42, times: [0, 0.25, 0.72, 1], ease: MANIM_EASE }}
                />
              )}
            </g>
          );
        })}

      {combVisible && (
        <motion.g initial={false} animate={{ x: outCenterX - 340 }} transition={MORPH_SPRING}>
          <circle
            cx={340}
            cy={152}
            r={8.5}
            fill={toneFill('done')}
            stroke={toneStroke('done')}
            strokeWidth={1.5}
          />
          <SvgRichLabel
            x={340}
            y={152}
            width={18}
            height={18}
            fontSize={10}
            fontWeight={700}
            text={'$\\Sigma$'}
          />
        </motion.g>
      )}

      {/* 左下留白区：实时卷积 KaTeX 乘加公式卡 */}
      <g>
        <rect
          x={PAD_X + 1}
          y={132}
          width={292}
          height={92}
          rx={4}
          fill="var(--wisp-surface)"
          stroke="var(--wisp-border)"
          strokeWidth={1}
        />
        <SvgRichLabel
          x={PAD_X + 12}
          y={146}
          width={272}
          height={20}
          fontSize={10.5}
          fontWeight={700}
          anchor="start"
          text={
            combVisible
              ? `卷积核落位：$t=${focusPos}$（“${res.tokenText}”，$x_${focusPos}=${res.xAtPos}$）`
              : '卷积核等待落位'
          }
        />
        <SvgRichLabel
          x={PAD_X + 12}
          y={166}
          width={272}
          height={18}
          fontSize={9.5}
          anchor="start"
          color="var(--wisp-muted)"
          text={
            combVisible
              ? `抽头下标：$[${res.taps
                  .slice()
                  .reverse()
                  .map((t) => t.srcPos)
                  .join(',\\;')}] $`
              : '左补零准备就绪'
          }
        />
        <SvgRichLabel
          x={PAD_X + 12}
          y={189}
          width={272}
          height={22}
          fontSize={10}
          fontWeight={600}
          anchor="start"
          text={
            combVisible
              ? `$y_${focusPos} = ${formatDotTex(res.taps)}$`
              : '$y_t = \\sum_{i=0}^{3} w_i \\cdot x_{t - i\\delta}$'
          }
        />
        <SvgRichLabel
          x={PAD_X + 12}
          y={211}
          width={272}
          height={20}
          fontSize={11}
          fontWeight={700}
          anchor="start"
          color={toneStroke('done')}
          text={combVisible ? `$= ${res.y.toFixed(2)}$` : '$y_0 = \\dots$'}
        />
      </g>

      {/* 右下输出轨道 y_0..y_9（严格对齐上方 t=0..9） */}
      {CONV_TOKENS.map((tok) => {
        const col = tok.pos + LEFT_PAD;
        const x = cellLeft(col);
        const evalItem = ALL_CONV_RESULTS[tok.pos];
        const isCurrent = combVisible && tok.pos === focusPos;
        const isDone = tok.pos <= revealedUpTo;
        const fill = isCurrent ? toneFill('active') : isDone ? toneFill('done') : 'var(--wisp-bg)';
        const stroke = isCurrent
          ? toneStroke('active')
          : isDone
            ? toneStroke('done')
            : 'var(--wisp-border)';

        return (
          <g key={`out-${tok.pos}`}>
            <rect
              x={x + 1}
              y={176}
              width={CELL_W - 2}
              height={48}
              rx={3}
              fill={fill}
              stroke={stroke}
              strokeWidth={isCurrent ? 2 : 1}
            />
            <SvgRichLabel
              x={x + CELL_W / 2}
              y={189}
              width={30}
              height={16}
              fontSize={9.5}
              color="var(--wisp-muted)"
              text={`$y_${tok.pos}$`}
            />
            <text
              x={x + CELL_W / 2}
              y={212}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={isDone || isCurrent ? 700 : 400}
              fill="var(--wisp-fg)"
            >
              {isDone || isCurrent ? evalItem.y.toFixed(2) : '…'}
            </text>
          </g>
        );
      })}

      {/* 顶部刚性四齿卷积核梳子：作为整体沿轨道逐格平移 */}
      <motion.g
        initial={false}
        animate={{
          x: focusPos * CELL_W,
          opacity: combVisible ? 1 : 0,
        }}
        transition={MORPH_SPRING}
      >
        <motion.line
          y1={19}
          y2={19}
          stroke={toneStroke('done')}
          strokeWidth={2}
          strokeLinecap="round"
          initial={false}
          animate={{ x1: baseCenter + leftmostLocalX, x2: baseCenter }}
          transition={MORPH_SPRING}
        />

        {([3, 2, 1, 0] as const).map((tapIdx) => {
          const offsetX = -tapIdx * dilation * CELL_W;
          const isCur = tapIdx === 0;
          const toothTone = isCur ? 'active' : 'done';
          const srcPos = focusPos - tapIdx * dilation;
          const isPad = srcPos < 0;
          const fill = isPad ? 'var(--wisp-surface)' : toneFill(toothTone);
          const stroke = isPad ? 'var(--wisp-muted)' : toneStroke(toothTone);

          return (
            <motion.g
              key={`tooth-${tapIdx}`}
              initial={false}
              animate={{ x: baseCenter + offsetX }}
              transition={MORPH_SPRING}
            >
              <line
                x1={0}
                y1={32}
                x2={0}
                y2={61}
                stroke={stroke}
                strokeWidth={isPad ? 1.4 : 1.85}
                strokeDasharray={isPad ? '3 2' : undefined}
                strokeLinecap="round"
              />
              <path
                d="M -3.5 56 L 0 61 L 3.5 56"
                fill="none"
                stroke={stroke}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x={-16}
                y={5}
                width={32}
                height={27}
                rx={4}
                fill={fill}
                stroke={stroke}
                strokeWidth={isCur ? 1.75 : 1.4}
              />
              <SvgRichLabel
                x={0}
                y={14}
                width={30}
                height={14}
                fontSize={9}
                fontWeight={700}
                text={`$w_${tapIdx}$`}
              />
              <text
                x={0}
                y={27.5}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={600}
                fill="var(--wisp-muted)"
              >
                {WEIGHTS[tapIdx]}
              </text>
            </motion.g>
          );
        })}
      </motion.g>
    </svg>
  );
}

export default function ShortConvExplainer({ title }: ShortConvExplainerProps) {
  const steps = useMemo(() => buildShortConvSteps(), []);
  const [probePos, setProbePos] = useState<number>(9);

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={492}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={probePos}
    >
      {(step, { beat, dotToken }) => {
        const phase = step.state.phase;

        if (phase === 'pad') {
          const padOpen = beat >= 1;
          const combIn = beat >= 2;
          const outReady = beat >= 3;

          return (
            <div className="sc-stage">
              <ConvScanCanvas
                focusPos={0}
                combVisible={combIn}
                padVisible={padOpen}
                revealedUpTo={outReady ? 0 : -1}
                highlightPrefix5={!combIn}
                playToken={dotToken}
                tag="pad"
              />

              <div className="sc-two-col">
                <motion.div
                  className="sc-info-card wisp-kit-tone"
                  data-tone={padOpen ? 'highlight' : 'slate'}
                  initial={false}
                  animate={{ opacity: padOpen ? 1 : 0.3 }}
                >
                  <span className="sc-info-card__title">
                    <RichText text={'为什么左侧展开 $9$ 个独立 $0$？'} />
                  </span>
                  <p className="sc-info-card__body">
                    <RichText
                      text={
                        '核长 $k=4$、空洞 $\\delta=3$ 时卷积核总跨度为 $(k-1)\\delta = 9$ 格；四齿核起步对准 $t=0$ 时，历史三齿正好落入 $t=-9, -6, -3$ 三个补零格。'
                      }
                    />
                  </p>
                </motion.div>

                <motion.div
                  className="sc-info-card wisp-kit-tone"
                  data-tone={outReady ? 'done' : 'slate'}
                  initial={false}
                  animate={{ opacity: outReady ? 1 : 0.3 }}
                >
                  <span className="sc-info-card__title">手算约定与 PyTorch 核顺序</span>
                  <p className="sc-info-card__body">
                    <RichText
                      text={
                        '图中齿针从左到右为 $[w_3=1.0,\\; w_2=-0.5,\\; w_1=0.25,\\; w_0=0.5]$，与 PyTorch 核张量从左到右的存储顺序一致。'
                      }
                    />
                  </p>
                </motion.div>
              </div>
            </div>
          );
        }

        if (phase === 'dilation') {
          const curDilation = beat === 0 ? 1 : 3;
          const alignedOn = beat >= 2;
          const torchOn = beat >= 3;

          return (
            <div className="sc-stage">
              <ConvScanCanvas
                focusPos={9}
                dilation={curDilation}
                combVisible={true}
                padVisible={true}
                revealedUpTo={9}
                playToken={dotToken}
                tag={`dil-${curDilation}`}
              />

              <div className="sc-two-col">
                <motion.div
                  className="sc-info-card wisp-kit-tone"
                  data-tone={beat === 0 ? 'highlight' : 'done'}
                  initial={false}
                >
                  <span className="sc-info-card__title">
                    <RichText
                      text={
                        beat === 0
                          ? '$\\delta = 1$：紧邻四齿窗口高度重叠'
                          : '$\\delta = 3$：齿距拉伸对齐 3-gram 边界'
                      }
                    />
                  </span>
                  <p className="sc-info-card__body">
                    <RichText
                      text={
                        alignedOn
                          ? '空洞设为 $\\delta=3$ 后四齿落点依次为 $t-9, t-6, t-3, t$，刚好串联起互不重叠的 3-gram 语义块。'
                          : '连续卷积步幅只有 $1$ 格，四个权重挤在末尾 $[6, 7, 8, 9]$ 上，感受野覆盖短且与 3-gram 重叠。'
                      }
                    />
                  </p>
                </motion.div>

                <motion.div
                  className="sc-info-card wisp-kit-tone"
                  data-tone={torchOn ? 'active' : 'slate'}
                  initial={false}
                  animate={{ opacity: torchOn ? 1 : 0.35 }}
                >
                  <span className="sc-info-card__title">PyTorch 卷积核参数对照</span>
                  <p className="sc-info-card__body">
                    <RichText
                      text={
                        '传入 $\\text{padding} = 9$ 与 $\\text{dilation} = 3$ 后截断至长度 $T$，核张量从左到右排列为 $[1.0,\\; -0.5,\\; 0.25,\\; 0.5]$。'
                      }
                    />
                  </p>
                </motion.div>
              </div>
            </div>
          );
        }

        if (phase === 'early') {
          const scanPos = Math.min(4, beat);
          const res = ALL_CONV_RESULTS[scanPos];

          return (
            <div className="sc-stage">
              <ConvScanCanvas
                focusPos={scanPos}
                combVisible={true}
                padVisible={true}
                revealedUpTo={scanPos}
                playToken={dotToken}
                tag={`early-${scanPos}`}
              />

              <div className="sc-taps-grid">
                {res.taps.map((tap) => (
                  <motion.div
                    key={tap.tapIdx}
                    className="sc-tap-card wisp-kit-tone"
                    data-tone={tapTone(tap.tapIdx, tap.isPad)}
                    initial={false}
                    animate={{ opacity: tap.isPad ? 0.65 : 1 }}
                  >
                    <div className="sc-tap-card__head">
                      <RichText text={`$w_${tap.tapIdx} = ${WEIGHTS[tap.tapIdx]}$`} />
                      <span className="sc-cell__pos">
                        <RichText
                          text={
                            tap.isPad
                              ? `$t=${tap.srcPos}$ 补 $0$`
                              : `$t=${tap.srcPos}$ “${tap.tokenText}”`
                          }
                        />
                      </span>
                    </div>
                    <span className="sc-tap-card__math">
                      <RichText
                        text={`$${tap.weight} \\times ${tap.xVal} = ${tap.term.toFixed(2)}$`}
                      />
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        }

        if (phase === 'full') {
          const scanPos = Math.min(9, 5 + beat);
          const res = ALL_CONV_RESULTS[scanPos];
          const siluDone = beat >= 5;

          return (
            <div className="sc-stage">
              <ConvScanCanvas
                focusPos={scanPos}
                combVisible={true}
                padVisible={true}
                revealedUpTo={scanPos}
                playToken={dotToken}
                tag={`full-${scanPos}`}
              />

              <div className="sc-two-col">
                <div className="sc-result-pill wisp-kit-tone" data-tone="done">
                  <RichText text={`当前输出 $y_${scanPos}$（$t=${scanPos}$ “${res.tokenText}”）`} />
                  <span className="sc-mono-badge">
                    <RichText text={`$y_${scanPos} = ${res.y.toFixed(2)}$`} />
                  </span>
                </div>

                <motion.div
                  className="sc-result-pill wisp-kit-tone"
                  data-tone={siluDone ? 'active' : 'slate'}
                  initial={false}
                  animate={{ opacity: siluDone ? 1 : 0.35 }}
                >
                  <RichText text={'$\\operatorname{SiLU}$ 激活 + 残差写回'} />
                  <span className="sc-mono-badge">
                    <RichText
                      text={
                        siluDone
                          ? `$5 + \\operatorname{SiLU}(3.00) = 5 + ${res.siluY.toFixed(2)} = ${res.out.toFixed(2)}$`
                          : `$x_${scanPos} + \\operatorname{SiLU}(y_${scanPos})$`
                      }
                    />
                  </span>
                </motion.div>
              </div>
            </div>
          );
        }

        // 第 5 步：t=0..9 全位置自由滑窗核验 + 工程取舍
        const evalProbe = ALL_CONV_RESULTS[probePos];
        const depthwiseLit = beat >= 1;
        const cacheLit = beat >= 2;
        const dropLit = beat >= 3;

        return (
          <div className="sc-stage">
            <div className="sc-switcher">
              <span className="sc-cell__pos">
                <RichText text={'滑窗位置选择（$t = 0 \\dots 9$）：'} />
              </span>
              <div className="sc-switcher__group" role="group" aria-label="选择卷积核滑窗目标位置">
                {PROBE_POSITIONS.map((pos) => {
                  const tok = CONV_TOKENS[pos];
                  return (
                    <button
                      key={pos}
                      type="button"
                      className="sc-switcher__btn"
                      aria-pressed={probePos === pos}
                      onClick={() => setProbePos(pos)}
                    >
                      {pos}:{tok.text}
                    </button>
                  );
                })}
              </div>
            </div>

            <ConvScanCanvas
              focusPos={probePos}
              combVisible={true}
              padVisible={true}
              revealedUpTo={probePos}
              playToken={dotToken}
              tag={`probe-${probePos}`}
            />

            <div className="sc-two-col">
              <motion.div
                className="sc-info-card wisp-kit-tone"
                data-tone={depthwiseLit ? 'done' : 'slate'}
                initial={false}
                animate={{ opacity: depthwiseLit ? 1 : 0.3 }}
              >
                <span className="sc-info-card__title">
                  <RichText
                    text={`$t=${probePos}$ 实测：$y_${probePos} = ${evalProbe.y.toFixed(2)}$（$\\operatorname{SiLU}$ 后 $${evalProbe.siluY.toFixed(2)}$）`}
                  />
                </span>
                <p className="sc-info-card__body">
                  <RichText
                    text={
                      '训练期配合 Depthwise 分组将参数量由 $4d^2$ 压到 $4d$，整条序列一次并行扫完。'
                    }
                  />
                </p>
              </motion.div>

              <motion.div
                className="sc-info-card wisp-kit-tone"
                data-tone={dropLit ? 'highlight' : cacheLit ? 'active' : 'slate'}
                initial={false}
                animate={{ opacity: cacheLit ? 1 : 0.3 }}
              >
                <span className="sc-info-card__title">V4.1 舍弃原因：Decode 跨步滑窗状态</span>
                <p className="sc-info-card__body">
                  <RichText
                    text={
                      '高并发推理须为每个请求维护 $t-3, t-6, t-9$ 历史缓存并阻碍静态图；V4.1 移除短卷积，换取全模块纯无状态。'
                    }
                  />
                </p>
              </motion.div>
            </div>
          </div>
        );
      }}
    </BeatExplainer>
  );
}
