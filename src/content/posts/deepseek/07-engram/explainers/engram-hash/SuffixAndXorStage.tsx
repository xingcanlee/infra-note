import { RichText, toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { MANIM_EASE, MORPH_SPRING, MULTIPLIERS, TOKENS, type EngramStepState } from './steps';

interface Props {
  state: EngramStepState;
  beat: number;
  playToken: number;
}

function XorFunnelSvg({
  tone,
  active,
  playToken,
}: {
  tone: 'active' | 'done';
  active: boolean;
  playToken: number;
}) {
  const stroke = toneStroke(tone);
  const fill = toneFill(tone);
  const fastReset = active ? undefined : { duration: 0.1 };

  return (
    <svg className="engram-funnel-svg" viewBox="0 0 280 46" aria-hidden="true">
      <motion.path
        d="M 68 0 L 68 18 L 128 18"
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0.14 }}
        transition={fastReset ?? { duration: 0.42, ease: MANIM_EASE }}
      />
      <motion.path
        d="M 212 0 L 212 18 L 152 18"
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0.14 }}
        transition={fastReset ?? { duration: 0.42, delay: 0.06, ease: MANIM_EASE }}
      />

      {playToken > 0 && active && (
        <>
          <motion.circle
            key={`xor-l-${tone}-${playToken}`}
            r={3.5}
            fill={stroke}
            initial={{ cx: 68, cy: 0, opacity: 0 }}
            animate={{
              cx: [68, 68, 128],
              cy: [0, 18, 18],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 0.5,
              times: [0, 0.15, 0.88, 1],
              ease: MANIM_EASE,
            }}
          />
          <motion.circle
            key={`xor-r-${tone}-${playToken}`}
            r={3.5}
            fill={stroke}
            initial={{ cx: 212, cy: 0, opacity: 0 }}
            animate={{
              cx: [212, 212, 152],
              cy: [0, 18, 18],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 0.5,
              delay: 0.06,
              times: [0, 0.15, 0.88, 1],
              ease: MANIM_EASE,
            }}
          />
        </>
      )}

      <motion.g
        initial={false}
        animate={{
          opacity: active ? 1 : 0.28,
          scale: active ? [0.85, 1.18, 1] : 0.88,
        }}
        transition={fastReset ?? { duration: 0.36, delay: 0.34, ease: MANIM_EASE }}
        style={{ transformOrigin: '140px 18px' }}
      >
        <circle cx={140} cy={18} r={10} fill={fill} stroke={stroke} strokeWidth={1.75} />
        <path
          d="M 135 18 H 145 M 140 13 V 23"
          fill="none"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinecap="round"
        />
      </motion.g>

      <motion.path
        d="M 140 28 L 140 43"
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0.14 }}
        transition={fastReset ?? { duration: 0.26, delay: 0.4, ease: MANIM_EASE }}
      />
      {playToken > 0 && active && (
        <motion.circle
          key={`xor-d-${tone}-${playToken}`}
          r={3}
          fill={stroke}
          initial={{ cx: 140, cy: 28, opacity: 0 }}
          animate={{ cx: 140, cy: [28, 42], opacity: [0, 1, 0] }}
          transition={{ duration: 0.3, delay: 0.42, ease: MANIM_EASE }}
        />
      )}
      <motion.path
        d="M 135 38 L 140 43 L 145 38"
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={fastReset ?? { duration: 0.2, delay: 0.52 }}
      />
    </svg>
  );
}

export default function SuffixAndXorStage({ state, beat, playToken }: Props) {
  const isSuffix = state.phase === 'suffix';

  if (isSuffix) {
    const anchorLit = beat >= 1;
    const twoGramLit = beat >= 2;
    const threeGramLit = beat >= 3;
    const windowReady = beat >= 4;

    return (
      <div className="engram-stage">
        <p className="engram-stage-note">
          下方编号为第 1 步归一后的规范 ID（“中国” → 308，“的” → 12，“首” → 88）
        </p>
        <div className="engram-seq-block">
          {/* 上方：2-gram 标签与向下开口括号 */}
          <div className="engram-bracket-labels">
            <motion.div
              className="engram-bracket-pill engram-bracket-pill--2 wisp-kit-tone"
              data-tone={twoGramLit ? 'active' : 'slate'}
              initial={false}
              animate={{
                opacity: twoGramLit ? 1 : 0,
                y: twoGramLit ? 0 : 6,
                scale: windowReady ? [1, 1.03, 1] : 1,
              }}
              transition={{
                duration: twoGramLit ? 0.36 : 0.1,
                delay: twoGramLit && !windowReady ? 0.24 : 0,
                ease: MANIM_EASE,
              }}
            >
              <RichText text={'2-gram 后缀 $(12, 88)$'} />
            </motion.div>
          </div>

          <svg className="engram-bracket-svg" viewBox="0 0 620 28" aria-hidden="true">
            <motion.path
              d="M 384 26 L 384 12 L 612 12 L 612 26"
              fill="none"
              stroke={toneStroke('active')}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: twoGramLit ? 1 : 0, opacity: twoGramLit ? 1 : 0 }}
              transition={{ duration: twoGramLit ? 0.34 : 0, ease: MANIM_EASE }}
            />
            {playToken > 0 && twoGramLit && (
              <>
                <motion.circle
                  key={`b2-l-${playToken}`}
                  r={3}
                  fill={toneStroke('active')}
                  initial={{ cx: 384, cy: 26, opacity: 0 }}
                  animate={{ cx: [384, 384, 498], cy: [26, 12, 12], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 0.42, times: [0, 0.15, 0.85, 1], ease: MANIM_EASE }}
                />
                <motion.circle
                  key={`b2-r-${playToken}`}
                  r={3}
                  fill={toneStroke('active')}
                  initial={{ cx: 612, cy: 26, opacity: 0 }}
                  animate={{ cx: [612, 612, 498], cy: [26, 12, 12], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 0.42, times: [0, 0.15, 0.85, 1], ease: MANIM_EASE }}
                />
                <motion.circle
                  key={`b2-up-${playToken}`}
                  cx={498}
                  r={2.8}
                  fill={toneStroke('active')}
                  initial={{ cy: 12, opacity: 0 }}
                  animate={{ cy: [12, 2], opacity: [0, 1, 0] }}
                  transition={{ duration: 0.24, delay: 0.3, ease: MANIM_EASE }}
                />
              </>
            )}
            <motion.path
              d="M 498 12 L 498 2 M 493 7 L 498 2 L 503 7"
              fill="none"
              stroke={toneStroke('active')}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: twoGramLit ? 1 : 0, opacity: twoGramLit ? 1 : 0 }}
              transition={{
                duration: twoGramLit ? 0.2 : 0,
                delay: twoGramLit ? 0.24 : 0,
                ease: MANIM_EASE,
              }}
            />
          </svg>

          {/* 中央：5 词元行 */}
          <div className="engram-seq-grid" role="list" aria-label="输入词元序列">
            {TOKENS.map((tok) => {
              const isContext = tok.role === 'context';
              const isAnchor = tok.pos === 5;
              const isTwoOnly = tok.pos === 4;
              const isThreeOnly = tok.pos === 3;
              const dimmed = anchorLit && isContext;

              let tone: 'active' | 'done' | 'slate' = 'slate';
              if (isAnchor && anchorLit) tone = 'active';
              else if (isTwoOnly && twoGramLit) tone = 'active';
              else if (isThreeOnly && threeGramLit) tone = 'done';

              const popScale =
                (isAnchor && beat === 1) || (isTwoOnly && beat === 2) || (isThreeOnly && beat === 3)
                  ? [1, 1.07, 1]
                  : windowReady && !isContext
                    ? [1, 1.03, 1]
                    : 1;

              const shared = tok.pos >= 3;
              return (
                <motion.div
                  key={tok.pos}
                  role="listitem"
                  layoutId={shared ? `engram-tok-${tok.pos}` : undefined}
                  transition={{
                    ...MORPH_SPRING,
                    opacity: { duration: 0.3 },
                    scale: { duration: 0.36 },
                  }}
                  className="engram-tok wisp-kit-tone"
                  data-tone={tone}
                  data-dimmed={dimmed ? 'true' : undefined}
                  initial={false}
                  animate={{ opacity: dimmed ? 0.36 : 1, scale: popScale }}
                >
                  <span className="engram-tok__pos">t = {tok.pos}</span>
                  <span className="engram-tok__word">“{tok.text}”</span>
                  <span className="engram-tok__id">ID {tok.id}</span>
                </motion.div>
              );
            })}
          </div>

          {/* 下方：3-gram 上开口括号 */}
          <svg className="engram-bracket-svg" viewBox="0 0 620 30" aria-hidden="true">
            <motion.path
              d="M 258 2 L 258 16 L 612 16 L 612 2"
              fill="none"
              stroke={toneStroke('done')}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: threeGramLit ? 1 : 0, opacity: threeGramLit ? 1 : 0 }}
              transition={{ duration: threeGramLit ? 0.38 : 0, ease: MANIM_EASE }}
            />
            {playToken > 0 && threeGramLit && (
              <>
                <motion.circle
                  key={`b3-l-${playToken}`}
                  r={3}
                  fill={toneStroke('done')}
                  initial={{ cx: 258, cy: 2, opacity: 0 }}
                  animate={{ cx: [258, 258, 435], cy: [2, 16, 16], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 0.46, times: [0, 0.15, 0.85, 1], ease: MANIM_EASE }}
                />
                <motion.circle
                  key={`b3-r-${playToken}`}
                  r={3}
                  fill={toneStroke('done')}
                  initial={{ cx: 612, cy: 2, opacity: 0 }}
                  animate={{ cx: [612, 612, 435], cy: [2, 16, 16], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 0.46, times: [0, 0.15, 0.85, 1], ease: MANIM_EASE }}
                />
                <motion.circle
                  key={`b3-dn-${playToken}`}
                  cx={435}
                  r={2.8}
                  fill={toneStroke('done')}
                  initial={{ cy: 16, opacity: 0 }}
                  animate={{ cy: [16, 28], opacity: [0, 1, 0] }}
                  transition={{ duration: 0.24, delay: 0.34, ease: MANIM_EASE }}
                />
              </>
            )}
            <motion.path
              d="M 435 16 L 435 28 M 430 23 L 435 28 L 440 23"
              fill="none"
              stroke={toneStroke('done')}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: threeGramLit ? 1 : 0, opacity: threeGramLit ? 1 : 0 }}
              transition={{
                duration: threeGramLit ? 0.2 : 0,
                delay: threeGramLit ? 0.28 : 0,
                ease: MANIM_EASE,
              }}
            />
          </svg>

          <div className="engram-bracket-labels">
            <motion.div
              className="engram-bracket-pill engram-bracket-pill--3 wisp-kit-tone"
              data-tone={threeGramLit ? 'done' : 'slate'}
              initial={false}
              animate={{
                opacity: threeGramLit ? 1 : 0,
                y: threeGramLit ? 0 : -6,
                scale: windowReady ? [1, 1.03, 1] : 1,
              }}
              transition={{
                duration: threeGramLit ? 0.36 : 0.1,
                delay: threeGramLit && !windowReady ? 0.24 : 0,
                ease: MANIM_EASE,
              }}
            >
              <RichText text={'3-gram 后缀 $(308, 12, 88)$'} />
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // 第 5 步：左 → 横向复用箭 → 右 滚动递推数据接力流
  const h2Active = beat >= 1;
  const reuseActive = beat >= 2;
  const h3Active = beat >= 3;

  return (
    <div className="engram-stage">
      <div className="engram-xor-relay">
        {/* 左栏：2-gram 混合得出 h_2 */}
        <section className="engram-panel" aria-label="2-gram 滚动异或推导">
          <header className="engram-panel__head">
            <span>2-gram 混合</span>
            <span className="engram-tag wisp-kit-tone" data-tone={h2Active ? 'active' : 'slate'}>
              <RichText text={'$g_2$'} />
            </span>
          </header>

          <div className="engram-inputs-row">
            <motion.div
              layoutId="engram-tok-5"
              transition={MORPH_SPRING}
              className="engram-mul-card wisp-kit-tone"
              data-tone="active"
            >
              <span className="engram-tok__pos">
                “首” × <RichText text={`$m_0=${MULTIPLIERS[0]}$`} />
              </span>
              <span className="engram-mul-card__val">
                <RichText text={`$88 \\times 3 = ${state.prod0}$`} />
              </span>
            </motion.div>
            <motion.div
              layoutId="engram-tok-4"
              transition={MORPH_SPRING}
              className="engram-mul-card wisp-kit-tone"
              data-tone="active"
            >
              <span className="engram-tok__pos">
                “的” × <RichText text={`$m_1=${MULTIPLIERS[1]}$`} />
              </span>
              <span className="engram-mul-card__val">
                <RichText text={`$12 \\times 7 = ${state.prod1}$`} />
              </span>
            </motion.div>
          </div>

          <XorFunnelSvg tone="active" active={h2Active} playToken={playToken} />

          <motion.div
            layoutId="engram-h2"
            transition={{
              ...MORPH_SPRING,
              opacity: { duration: h2Active ? 0.3 : 0.1, delay: h2Active ? 0.4 : 0 },
              scale: { duration: h2Active ? 0.34 : 0.1, delay: h2Active ? 0.4 : 0 },
            }}
            className="engram-xor-result wisp-kit-tone"
            data-tone={h2Active ? 'active' : 'slate'}
            initial={false}
            animate={{
              opacity: h2Active ? 1 : 0.2,
              scale: h2Active ? [0.95, 1.04, 1] : 0.98,
            }}
          >
            <RichText text={'$g_2 = 264 \\oplus 84$'} />
            <span className="engram-mul-card__val">{h2Active ? state.h2 : '…'}</span>
          </motion.div>
        </section>

        {/* 中间：显式横向复用接力箭 */}
        <div className="engram-relay-bridge" aria-hidden="true">
          <motion.span
            className="engram-tag wisp-kit-tone"
            data-tone={reuseActive ? 'active' : 'slate'}
            initial={false}
            animate={{ opacity: reuseActive ? 1 : 0.24 }}
          >
            <RichText text={'复用 $g_2$'} />
          </motion.span>
          <svg className="engram-relay-svg" viewBox="0 0 64 28">
            <motion.path
              d="M 4 14 L 56 14"
              fill="none"
              stroke={toneStroke('active')}
              strokeWidth={2}
              strokeLinecap="round"
              initial={false}
              animate={{ pathLength: reuseActive ? 1 : 0, opacity: reuseActive ? 1 : 0.18 }}
              transition={{ duration: reuseActive ? 0.38 : 0.1, ease: MANIM_EASE }}
            />
            <motion.path
              d="M 50 8 L 57 14 L 50 20"
              fill="none"
              stroke={toneStroke('active')}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ opacity: reuseActive ? 1 : 0.18 }}
              transition={{ duration: reuseActive ? 0.2 : 0.08, delay: reuseActive ? 0.24 : 0 }}
            />
            {playToken > 0 && reuseActive && (
              <motion.circle
                key={`relay-dot-${playToken}`}
                cy={14}
                r={3.5}
                fill={toneStroke('active')}
                initial={{ cx: 6, opacity: 0 }}
                animate={{ cx: [6, 54], opacity: [0, 1, 0] }}
                transition={{ duration: 0.48, ease: MANIM_EASE }}
              />
            )}
          </svg>
        </div>

        {/* 右栏：3-gram 直接复用 h_2 递推 */}
        <motion.section
          className="engram-panel"
          aria-label="3-gram 滚动复用推导"
          initial={false}
          animate={{ opacity: reuseActive ? 1 : 0.3 }}
          transition={{ duration: 0.34, ease: MANIM_EASE }}
        >
          <header className="engram-panel__head">
            <span>3-gram 滚动递推</span>
            <span className="engram-tag wisp-kit-tone" data-tone={h3Active ? 'done' : 'slate'}>
              <RichText text={'$g_3$'} />
            </span>
          </header>

          <div className="engram-inputs-row">
            <motion.div
              className="engram-mul-card wisp-kit-tone"
              data-tone={reuseActive ? 'active' : 'slate'}
              initial={false}
              animate={{
                opacity: reuseActive ? 1 : 0.18,
                x: reuseActive ? 0 : -14,
              }}
              transition={{ duration: reuseActive ? 0.38 : 0.1, ease: MANIM_EASE }}
            >
              <span className="engram-tok__pos">接力上阶结果</span>
              <span className="engram-mul-card__val">
                <RichText text={`$g_2 = ${state.h2}$`} />
              </span>
            </motion.div>
            <motion.div
              layoutId="engram-tok-3"
              transition={MORPH_SPRING}
              className="engram-mul-card wisp-kit-tone"
              data-tone={reuseActive ? 'done' : 'slate'}
            >
              <span className="engram-tok__pos">
                “中国” × <RichText text={`$m_2=${MULTIPLIERS[2]}$`} />
              </span>
              <span className="engram-mul-card__val">
                <RichText text={`$308 \\times 9 = ${state.prod2}$`} />
              </span>
            </motion.div>
          </div>

          <XorFunnelSvg tone="done" active={h3Active} playToken={playToken} />

          <motion.div
            layoutId="engram-h3"
            transition={{
              ...MORPH_SPRING,
              opacity: { duration: h3Active ? 0.3 : 0.1, delay: h3Active ? 0.4 : 0 },
              scale: { duration: h3Active ? 0.34 : 0.1, delay: h3Active ? 0.4 : 0 },
            }}
            className="engram-xor-result wisp-kit-tone"
            data-tone={h3Active ? 'done' : 'slate'}
            initial={false}
            animate={{
              opacity: h3Active ? 1 : 0.2,
              scale: h3Active ? [0.95, 1.04, 1] : 0.98,
            }}
          >
            <RichText text={'$g_3 = g_2 \\oplus 2772$'} />
            <span className="engram-mul-card__val">{h3Active ? state.h3 : '…'}</span>
          </motion.div>
        </motion.section>
      </div>

      {/* 底部：通用滚动递推公式横幅 */}
      <motion.div
        className="engram-mult-bar wisp-kit-tone"
        data-tone={h3Active ? 'done' : 'slate'}
        initial={false}
        animate={{ opacity: h3Active ? 1 : 0.35 }}
        transition={{ duration: 0.3, ease: MANIM_EASE }}
      >
        <span>通用滚动递推式（每升一阶只多做 1 次乘 + 1 次异或）</span>
        <span>
          <RichText text={'$g_n(t) = g_{n-1}(t) \\oplus (c_{t-(n-1)} \\cdot m_{n-1})$'} />
        </span>
      </motion.div>
    </div>
  );
}
