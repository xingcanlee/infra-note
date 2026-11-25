import { RichText, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  HEADS,
  MANIM_EASE,
  MORPH_SPRING,
  SCENARIOS,
  type EngramStepState,
  type ScenarioSpec,
} from './steps';

interface Props {
  state: EngramStepState;
  beat: number;
  playToken: number;
  scenario: ScenarioSpec['id'];
  onSelectScenario: (id: ScenarioSpec['id']) => void;
}

const BANK2 = HEADS[2];
const BANK3 = HEADS[3];
const SCENARIO_ORDER: readonly ScenarioSpec['id'][] = ['china', 'new_chief', 'poem'];
const HEAD_CENTERS = [74, 231, 389, 546] as const;

export default function CollisionAndGatherStage({
  state,
  beat,
  playToken,
  scenario,
  onSelectScenario,
}: Props) {
  if (state.phase === 'collision') {
    const chinaSlots = SCENARIOS.china.slots;
    const chiefSlots = SCENARIOS.new_chief.slots;
    const challengerIn = beat >= 1;
    const bank2Split = beat >= 2;
    const bank3Collide = beat >= 3;

    return (
      <div className="engram-stage">
        <div className="engram-compare-grid">
          <motion.div
            className="engram-phrase-bar wisp-kit-tone"
            data-tone="done"
            initial={false}
            animate={{ opacity: 1, scale: beat === 0 ? [0.98, 1.02, 1] : 1 }}
            transition={{ duration: 0.34, ease: MANIM_EASE }}
          >
            <span>基准词干：“中国的首”（308）</span>
            <RichText text={'$h_3 = 2952 \\to [16, 24]$'} />
          </motion.div>

          <motion.div
            className="engram-phrase-bar wisp-kit-tone"
            data-tone={challengerIn ? 'highlight' : 'slate'}
            initial={false}
            animate={{
              opacity: challengerIn ? 1 : 0.16,
              y: challengerIn ? 0 : -8,
              scale: beat === 1 ? [0.98, 1.02, 1] : 1,
            }}
            transition={{ duration: challengerIn ? 0.38 : 0.1, ease: MANIM_EASE }}
          >
            <span>对比词干：“新任的首”（729）</span>
            <RichText text={"$h'_3 = 6397 \\to [18, 24]$"} />
          </motion.div>
        </div>

        <div className="engram-compare-grid">
          {/* 头 2：由第 4 步表段 2 通过 layoutId 平滑放大 */}
          <motion.section
            layoutId="engram-bank-2"
            transition={MORPH_SPRING}
            className="engram-bank"
            aria-label="头 2 碰撞隔离"
          >
            <div className="engram-bank__head">
              <RichText text={`头 2（$\\bmod\\, ${BANK2.prime} + ${BANK2.offset}$）`} />
              <span>{bank2Split ? '隔离错开' : '待对比'}</span>
            </div>
            <div className="engram-slots">
              {Array.from({ length: BANK2.prime }, (_, rem) => {
                const rowIdx = BANK2.offset + rem;
                const isChina = rowIdx === chinaSlots[2];
                const isChief = rowIdx === chiefSlots[2];
                const hit = isChina ? 'done' : isChief && bank2Split ? 'highlight' : undefined;

                return (
                  <motion.span
                    key={rowIdx}
                    className="engram-slot"
                    data-hit={hit}
                    initial={false}
                    animate={{
                      scale: isChief && bank2Split ? [0.85, 1.24, 1] : 1,
                      opacity: 1,
                    }}
                    transition={{ duration: 0.44, ease: MANIM_EASE }}
                  >
                    {rowIdx}
                  </motion.span>
                );
              })}
            </div>
            <motion.div
              className="engram-collide-note wisp-kit-tone"
              data-tone="done"
              initial={false}
              animate={{ opacity: bank2Split ? 1 : 0, y: bank2Split ? 0 : 4 }}
              transition={{ duration: bank2Split ? 0.32 : 0.08, delay: bank2Split ? 0.18 : 0 }}
            >
              <span>中国 → 行 16，新任 → 行 18</span>
              <span>互异素数错开 2 行</span>
            </motion.div>
          </motion.section>

          {/* 头 3：先绿色展示基准行 24，再双拍警示同余碰撞 */}
          <motion.section
            layoutId="engram-bank-3"
            transition={MORPH_SPRING}
            className="engram-bank"
            aria-label="头 3 局部碰撞"
          >
            <div className="engram-bank__head">
              <RichText text={`头 3（$\\bmod\\, ${BANK3.prime} + ${BANK3.offset}$）`} />
              <span>{bank3Collide ? '局部碰撞' : '待对比'}</span>
            </div>
            <div className="engram-slots">
              {Array.from({ length: BANK3.prime }, (_, rem) => {
                const rowIdx = BANK3.offset + rem;
                const isShared = rowIdx === chinaSlots[3];
                const hit = isShared ? (bank3Collide ? 'highlight' : 'done') : undefined;

                return (
                  <motion.span
                    key={rowIdx}
                    className="engram-slot"
                    data-hit={hit}
                    initial={false}
                    animate={{
                      scale: isShared && bank3Collide ? [1, 1.28, 0.96, 1.18, 1] : 1,
                      opacity: 1,
                    }}
                    transition={{ duration: 0.65, ease: MANIM_EASE }}
                  >
                    {rowIdx}
                  </motion.span>
                );
              })}
            </div>
            <motion.div
              className="engram-collide-note wisp-kit-tone"
              data-tone="highlight"
              initial={false}
              animate={{ opacity: bank3Collide ? 1 : 0, y: bank3Collide ? 0 : 4 }}
              transition={{
                duration: bank3Collide ? 0.32 : 0.08,
                delay: bank3Collide ? 0.22 : 0,
              }}
            >
              <span>2952 与 6397 对 13 同余</span>
              <span>共用行 24</span>
            </motion.div>
          </motion.section>
        </div>
      </div>
    );
  }

  const spec = SCENARIOS[scenario];
  const pct = Math.round(spec.alpha * 100);
  const mergeActive = beat >= 1;
  const injectActive = beat >= 2;
  const gateActive = beat >= 3;

  return (
    <div className="engram-stage">
      <div className="engram-switcher">
        <span className="engram-banks-title">测试短语语境切换</span>
        <div className="engram-switcher__group" role="group" aria-label="选择上下文测试短语">
          {SCENARIO_ORDER.map((id) => {
            const item = SCENARIOS[id];
            return (
              <button
                key={id}
                type="button"
                className="engram-switcher__btn"
                aria-pressed={scenario === id}
                onClick={() => onSelectScenario(id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 零矩阵乘按索引直接切片 Gather（支持从第 4 步 layoutId 连续过渡） */}
      <div className="engram-heads-grid">
        {HEADS.map((head, idx) => {
          const row = spec.slots[idx];
          const tone = idx === 3 && spec.id === 'new_chief' ? 'highlight' : head.tone;
          return (
            <motion.div
              key={head.headIdx}
              layoutId={`engram-head-${head.headIdx}`}
              initial={false}
              animate={{ scale: beat === 0 ? [0.95, 1.04, 1] : 1, opacity: 1 }}
              transition={{
                ...MORPH_SPRING,
                scale: { duration: 0.36, delay: beat === 0 ? idx * 0.09 : 0, ease: MANIM_EASE },
              }}
              className="engram-head-card wisp-kit-tone"
              data-tone={tone}
            >
              <div className="engram-head-card__top">
                <span>头 {head.headIdx}</span>
                <span className="engram-tag">{head.ngram}-gram</span>
              </div>
              <span className="engram-head-card__math">weight[{row}]</span>
              <span className="engram-head-card__slot">
                <RichText text={`$\\mathbf{e}_{${head.headIdx}} \\in \\mathbb{R}^{d_h}$`} />
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="engram-gather-bus">
        <svg className="engram-gather-svg" viewBox="0 0 620 44" aria-hidden="true">
          {HEADS.map((head, idx) => {
            const x = HEAD_CENTERS[idx];
            const tone = idx === 3 && spec.id === 'new_chief' ? 'highlight' : head.tone;
            const stroke = toneStroke(tone);
            return (
              <g key={idx}>
                <motion.path
                  d={`M ${x} 0 L ${x} 18 L 310 18`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ pathLength: mergeActive ? 1 : 0, opacity: mergeActive ? 1 : 0.14 }}
                  transition={{
                    duration: mergeActive ? 0.42 : 0.08,
                    delay: mergeActive ? idx * 0.08 : 0,
                    ease: MANIM_EASE,
                  }}
                />
                {playToken > 0 && mergeActive && (
                  <motion.circle
                    key={`gdot-${idx}-${playToken}-${scenario}`}
                    r={3}
                    fill={stroke}
                    initial={{ cx: x, cy: 0, opacity: 0 }}
                    animate={{
                      cx: [x, x, 310],
                      cy: [0, 18, 18],
                      opacity: [0, 1, 1, 0],
                    }}
                    transition={{
                      duration: 0.52,
                      delay: idx * 0.08,
                      times: [0, 0.15, 0.88, 1],
                      ease: MANIM_EASE,
                    }}
                  />
                )}
              </g>
            );
          })}
          <motion.circle
            cx={310}
            cy={18}
            r={3.5}
            fill={toneStroke('done')}
            initial={false}
            animate={{
              opacity: mergeActive ? 1 : 0,
              scale: mergeActive ? [0.5, 1.35, 1] : 0.5,
            }}
            transition={{
              duration: mergeActive ? 0.3 : 0.08,
              delay: mergeActive ? 0.4 : 0,
            }}
            style={{ transformOrigin: '310px 18px' }}
          />
          <motion.path
            d="M 310 18 L 310 41"
            fill="none"
            stroke={toneStroke('done')}
            strokeWidth={1.75}
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: injectActive ? 1 : 0, opacity: injectActive ? 1 : 0.14 }}
            transition={{ duration: injectActive ? 0.3 : 0.08, ease: MANIM_EASE }}
          />
          {playToken > 0 && injectActive && (
            <motion.circle
              key={`gdot-dn-${playToken}-${scenario}`}
              cx={310}
              r={3}
              fill={toneStroke('done')}
              initial={{ cy: 18, opacity: 0 }}
              animate={{ cy: [18, 40], opacity: [0, 1, 0] }}
              transition={{ duration: 0.32, ease: MANIM_EASE }}
            />
          )}
          <motion.path
            d="M 304 35 L 310 41 L 316 35"
            fill="none"
            stroke={toneStroke('done')}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ opacity: injectActive ? 1 : 0 }}
            transition={{ duration: injectActive ? 0.2 : 0.08, delay: injectActive ? 0.2 : 0 }}
          />
        </svg>
      </div>

      <motion.div
        className="engram-gate-box"
        initial={false}
        animate={{ opacity: injectActive ? 1 : 0.3, y: injectActive ? 0 : 4 }}
        transition={{ duration: injectActive ? 0.34 : 0.1, ease: MANIM_EASE }}
      >
        <div className="engram-gate-top">
          <span>
            <RichText
              text={`拼接初值 $\\mathbf{e}_t \\in \\mathbb{R}^{4d_h}$ + 隐状态 $\\mathbf{h}_t$（“${spec.contextSnippet}”）`}
            />
          </span>
          <motion.span
            className="engram-head-card__slot"
            initial={false}
            animate={{
              opacity: gateActive ? 1 : 0.2,
              scale: gateActive ? [0.88, 1.08, 1] : 0.95,
            }}
            transition={{ duration: gateActive ? 0.32 : 0.08, ease: MANIM_EASE }}
          >
            <RichText text={`示意门控 $\\alpha_t = ${spec.alpha.toFixed(2)}$`} />
          </motion.span>
        </div>

        <div
          className="engram-meter"
          role="progressbar"
          aria-label="上下文门控权重"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <motion.div
            className="engram-meter__fill"
            data-tone={spec.gateTone}
            initial={false}
            animate={{ width: gateActive ? `${pct}%` : '0%' }}
            transition={
              gateActive
                ? { type: 'spring', visualDuration: 0.72, bounce: 0.08 }
                : { duration: 0.1 }
            }
          />
        </div>

        <motion.p
          className="engram-verdict"
          initial={false}
          animate={{ opacity: gateActive ? 1 : 0.15 }}
          transition={{ duration: gateActive ? 0.32 : 0.08, delay: gateActive ? 0.12 : 0 }}
        >
          {spec.collisionSummary}；{spec.verdict}。
        </motion.p>
      </motion.div>
    </div>
  );
}
