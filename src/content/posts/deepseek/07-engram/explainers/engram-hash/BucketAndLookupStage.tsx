import { RichText, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { HEADS, MANIM_EASE, MORPH_SPRING, TOTAL_ROWS, type EngramStepState } from './steps';

interface Props {
  state: EngramStepState;
  beat: number;
  playToken: number;
}

const HEAD_CENTERS = [74, 231, 389, 546] as const;

export default function BucketAndLookupStage({ state, beat, playToken }: Props) {
  const isLookup = state.phase === 'lookup';
  const spotlightIdx = isLookup && beat >= 1 && beat <= 4 ? beat - 1 : null;
  const lookupSlots = new Map<number, { hitTone: 'active' | 'done'; headIdx: number }>(
    state.headLookups.map((l) => [
      l.slot,
      { hitTone: l.tone === 'active' ? 'active' : 'done', headIdx: l.headIdx },
    ]),
  );

  return (
    <div className="engram-stage">
      {/* 寻址期：承接上一步飞来的 h_2 与 h_3 哈希源 */}
      {isLookup && (
        <div className="engram-hash-strip">
          <motion.div
            layoutId="engram-h2"
            transition={MORPH_SPRING}
            className="engram-hash-pill wisp-kit-tone"
            data-tone="active"
            initial={false}
            animate={{ opacity: spotlightIdx !== null && spotlightIdx > 1 ? 0.36 : 1 }}
          >
            <RichText text={`$h_2 = ${state.h2}$`} />
            <span className="engram-tok__pos">2-gram 头 0 / 1</span>
          </motion.div>
          <motion.div
            layoutId="engram-h3"
            transition={MORPH_SPRING}
            className="engram-hash-pill wisp-kit-tone"
            data-tone="done"
            initial={false}
            animate={{ opacity: spotlightIdx !== null && spotlightIdx < 2 ? 0.36 : 1 }}
          >
            <RichText text={`$h_3 = ${state.h3}$`} />
            <span className="engram-tok__pos">3-gram 头 2 / 3</span>
          </motion.div>
        </div>
      )}

      {/* 顶部四头卡片：建桶期逐头建表；寻址期自动逐头聚光并于第 6 拍全表齐亮 */}
      <div className="engram-heads-grid">
        {state.headLookups.map((item, idx) => {
          const headMeta = HEADS[idx];
          const isDimmed = spotlightIdx !== null && spotlightIdx !== idx;
          const revealed = isLookup ? beat >= idx + 1 : beat >= idx;
          const justFired = isLookup ? beat === idx + 1 : beat === idx;
          const tone = revealed ? headMeta.tone : 'slate';

          if (isLookup) {
            return (
              <motion.div
                key={idx}
                layoutId={`engram-head-${idx}`}
                initial={false}
                animate={{
                  opacity: isDimmed ? 0.34 : revealed ? 1 : 0.42,
                  scale: justFired ? [1, 1.04, 1] : 1,
                }}
                transition={{ ...MORPH_SPRING, opacity: { duration: 0.24 } }}
                className="engram-head-card wisp-kit-tone"
                data-tone={tone}
                data-dimmed={isDimmed ? 'true' : undefined}
              >
                <div className="engram-head-card__top">
                  <span>头 {item.headIdx}</span>
                  <span className="engram-tag">{item.ngram}-gram</span>
                </div>
                <span className="engram-head-card__math">
                  ({item.hashVal} mod {item.prime}) + {item.offset}
                </span>
                <span className="engram-head-card__slot">
                  {revealed ? `行 ${item.slot}` : '行 …'}
                </span>
              </motion.div>
            );
          }
          return (
            <motion.div
              key={idx}
              layoutId={`engram-head-${idx}`}
              initial={false}
              animate={{
                opacity: revealed ? 1 : 0.16,
                y: revealed ? 0 : 8,
                scale: justFired ? [0.96, 1.04, 1] : revealed ? 1 : 0.96,
              }}
              transition={{
                ...MORPH_SPRING,
                opacity: { duration: revealed ? 0.34 : 0.1 },
                y: { duration: 0.34, ease: MANIM_EASE },
              }}
              className="engram-head-card wisp-kit-tone"
              data-tone={tone}
            >
              <div className="engram-head-card__top">
                <span>头 {headMeta.headIdx}</span>
                <span className="engram-tag">{headMeta.ngram}-gram</span>
              </div>
              <span className="engram-head-card__math">
                下界 ≥ {headMeta.lowerBound} → 素数 {headMeta.prime}
              </span>
              <span className="engram-head-card__slot">offset = {headMeta.offset}</span>
            </motion.div>
          );
        })}
      </div>

      {/* 寻址期：从四张哈希卡指向扁平表汇流线（自动聚光逐头落线，无点击提示） */}
      {isLookup && (
        <div className="engram-lookup-bus">
          <svg className="engram-gather-svg" viewBox="0 0 620 30" aria-hidden="true">
            <path
              d="M 24 26 L 596 26"
              fill="none"
              stroke="var(--wisp-border)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            {state.headLookups.map((item, idx) => {
              const x = HEAD_CENTERS[idx];
              const dimmed = spotlightIdx !== null && spotlightIdx !== idx;
              const stroke = toneStroke(item.tone);
              const headFired = beat >= idx + 1;
              return (
                <g key={idx}>
                  <motion.path
                    d={`M ${x} 0 L ${x} 24`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    initial={false}
                    animate={{
                      pathLength: headFired ? 1 : 0,
                      opacity: headFired ? (dimmed ? 0.22 : 1) : 0.12,
                    }}
                    transition={{
                      duration: headFired ? 0.24 : 0,
                      delay: 0,
                      ease: MANIM_EASE,
                    }}
                  />
                  {playToken > 0 && headFired && !dimmed && (
                    <motion.circle
                      key={`lk-dot-${idx}-${playToken}`}
                      cx={x}
                      r={3}
                      fill={stroke}
                      initial={{ cy: 2, opacity: 0 }}
                      animate={{ cy: [2, 24], opacity: [0, 1, 0] }}
                      transition={{ duration: 0.28, delay: 0, ease: MANIM_EASE }}
                    />
                  )}
                  <motion.path
                    d={`M ${x - 5} 19 L ${x} 24 L ${x + 5} 19`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{
                      pathLength: headFired ? 1 : 0,
                      opacity: headFired ? (dimmed ? 0.22 : 1) : 0,
                    }}
                    transition={{
                      duration: headFired ? 0.14 : 0,
                      delay: headFired ? 0.18 : 0,
                      ease: MANIM_EASE,
                    }}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* 扁平一维 36 行嵌入表（保留 layoutId 供第 5 步直接放大为碰撞对照表段） */}
      <div className="engram-banks-wrap">
        <motion.div
          className="engram-banks-title"
          initial={false}
          animate={{ scale: !isLookup && beat >= 4 ? [1, 1.02, 1] : 1 }}
          transition={{ duration: 0.4, ease: MANIM_EASE }}
        >
          <span>
            <RichText
              text={
                isLookup
                  ? `扁平大表 weight[0..${TOTAL_ROWS - 1}]`
                  : `扁平大表 weight[0..${TOTAL_ROWS - 1}]（总行数 = 5 + 7 + 11 + 13 = ${TOTAL_ROWS}）`
              }
            />
          </span>
        </motion.div>

        <div className="engram-banks-grid">
          {HEADS.map((head, idx) => {
            const dimmed = spotlightIdx !== null && spotlightIdx !== idx;
            const bankRevealed = isLookup || beat >= idx;
            return (
              <motion.section
                key={head.headIdx}
                layoutId={`engram-bank-${head.headIdx}`}
                transition={{
                  ...MORPH_SPRING,
                  opacity: { duration: bankRevealed ? 0.28 : 0.1 },
                }}
                className="engram-bank"
                data-dimmed={dimmed ? 'true' : undefined}
                initial={false}
                animate={{
                  opacity: dimmed ? 0.34 : bankRevealed ? 1 : 0.16,
                  y: bankRevealed ? 0 : 6,
                }}
                aria-label={`头 ${head.headIdx} 物理槽位 ${head.offset} 到 ${head.offset + head.prime - 1}`}
              >
                <div className="engram-bank__head">
                  <span>
                    头 {head.headIdx}（mod {head.prime}）
                  </span>
                  <span>
                    行 {head.offset}–{head.offset + head.prime - 1}
                  </span>
                </div>
                <div className="engram-slots">
                  {Array.from({ length: head.prime }, (_, rem) => {
                    const rowIdx = head.offset + rem;
                    const slotInfo = isLookup ? lookupSlots.get(rowIdx) : undefined;
                    const hitReady = slotInfo !== undefined && beat >= slotInfo.headIdx + 1;

                    return (
                      <motion.span
                        key={rowIdx}
                        className="engram-slot"
                        data-hit={hitReady ? slotInfo.hitTone : undefined}
                        initial={false}
                        animate={
                          hitReady
                            ? { scale: [1, 1.24, 1], opacity: 1 }
                            : bankRevealed
                              ? { scale: 1, opacity: 1 }
                              : { scale: 0.88, opacity: 0.2 }
                        }
                        transition={
                          hitReady
                            ? { duration: 0.38, delay: 0.2, ease: MANIM_EASE }
                            : {
                                duration: bankRevealed ? 0.24 : 0.08,
                                delay: !isLookup && bankRevealed ? rem * 0.032 : 0,
                                ease: MANIM_EASE,
                              }
                        }
                      >
                        {rowIdx}
                      </motion.span>
                    );
                  })}
                </div>
              </motion.section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
