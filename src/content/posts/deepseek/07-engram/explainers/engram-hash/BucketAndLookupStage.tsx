import { RichText, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  HEADS,
  MANIM_EASE,
  MORPH_SPRING,
  PRIME_SCAN_NUMS,
  TOTAL_ROWS,
  type EngramStepState,
} from './steps';

interface Props {
  state: EngramStepState;
  beat: number;
  playToken: number;
}

const HEAD_CENTERS = [74, 231, 389, 546] as const;
const BANK_CENTERS = [43, 146, 301, 508] as const;

export default function BucketAndLookupStage({ state, beat, playToken }: Props) {
  const isLookup = state.phase === 'lookup';
  const spotlightIdx = isLookup && beat >= 1 && beat <= 4 ? beat - 1 : null;
  const lookupSlots = new Map<number, { hitTone: 'active' | 'done'; headIdx: number }>(
    state.headLookups.map((l) => [
      l.slot,
      { hitTone: l.tone === 'active' ? 'active' : 'done', headIdx: l.headIdx },
    ]),
  );

  // 第 3 步（建桶）：数轴去重扫描节奏
  const scan2Active = !isLookup;
  const seen2Ready = !isLookup && beat >= 1;
  const scan3Active = !isLookup && beat >= 2;
  const primes3Ready = !isLookup && beat >= 3;
  const stripJoined = isLookup || beat >= 4;

  return (
    <div className="engram-stage">
      {/* 第 3 步顶部：4..13 两轮素数扫描轨 + seen 去重 */}
      {!isLookup && (
        <div className="engram-scan-box">
          <div className="engram-scan-row">
            <div className="engram-scan-label">
              <span className="engram-tag wisp-kit-tone" data-tone="active">
                2-gram 顺延
              </span>
              <span className="engram-tok__pos">起点 ≥ 4</span>
            </div>
            <div className="engram-scan-nums" aria-label="2-gram 素数扫描 4 到 13">
              {PRIME_SCAN_NUMS.map((num) => {
                const isHit = num === 5 || num === 7;
                const isRevealed = isHit ? seen2Ready || num === 5 : false;
                return (
                  <motion.span
                    key={`s2-${num}`}
                    className="engram-scan-chip"
                    data-state={
                      num === 4
                        ? 'start'
                        : isHit && (num === 5 ? scan2Active : seen2Ready)
                          ? 'hit-active'
                          : num > 7
                            ? 'unused'
                            : 'skip'
                    }
                    initial={false}
                    animate={{
                      scale: isHit && isRevealed && beat === 1 ? [1, 1.16, 1] : 1,
                    }}
                    transition={{ duration: 0.32, ease: MANIM_EASE }}
                  >
                    {num}
                  </motion.span>
                );
              })}
            </div>
            <motion.span
              className="engram-tag wisp-kit-tone"
              data-tone={seen2Ready ? 'active' : 'slate'}
              initial={false}
              animate={{ opacity: seen2Ready ? 1 : 0.28 }}
            >
              <RichText text={'$\\text{seen} = \\{5, 7\\}$'} />
            </motion.span>
          </div>

          <motion.div
            className="engram-scan-row"
            initial={false}
            animate={{ opacity: scan3Active ? 1 : 0.22 }}
            transition={{ duration: 0.32, ease: MANIM_EASE }}
          >
            <div className="engram-scan-label">
              <span className="engram-tag wisp-kit-tone" data-tone={scan3Active ? 'done' : 'slate'}>
                3-gram 顺延
              </span>
              <span className="engram-tok__pos">起点 ≥ 4</span>
            </div>
            <div className="engram-scan-nums" aria-label="3-gram 素数扫描与 seen 去重">
              {PRIME_SCAN_NUMS.map((num) => {
                const isSeenSkip = num === 5 || num === 7;
                const isHit = num === 11 || num === 13;
                const chipState =
                  num === 4
                    ? 'start'
                    : isSeenSkip
                      ? 'seen'
                      : isHit && primes3Ready
                        ? 'hit-done'
                        : 'skip';
                return (
                  <motion.span
                    key={`s3-${num}`}
                    className="engram-scan-chip"
                    data-state={chipState}
                    initial={false}
                    animate={{
                      scale: isHit && primes3Ready && beat === 3 ? [1, 1.16, 1] : 1,
                    }}
                    transition={{ duration: 0.34, ease: MANIM_EASE }}
                  >
                    {num}
                  </motion.span>
                );
              })}
            </div>
            <motion.span
              className="engram-tag wisp-kit-tone"
              data-tone={primes3Ready ? 'done' : 'slate'}
              initial={false}
              animate={{ opacity: primes3Ready ? 1 : 0.25 }}
            >
              {'跳过 5/7 → 11, 13'}
            </motion.span>
          </motion.div>
        </div>
      )}

      {/* 第 6 步顶部：承接第 5 步滚动异或平滑过渡的 h_2 与 h_3 */}
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
            <RichText text={`$g_2 = ${state.h2}$`} />
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
            <RichText text={`$g_3 = ${state.h3}$`} />
            <span className="engram-tok__pos">3-gram 头 2 / 3</span>
          </motion.div>
        </div>
      )}

      {/* 中部四头卡片（第 3 步展示素数与前缀偏移；第 6 步展示取模偏移结果） */}
      <div className="engram-heads-grid">
        {state.headLookups.map((item, idx) => {
          const headMeta = HEADS[idx];
          const isDimmed = spotlightIdx !== null && spotlightIdx !== idx;
          const revealed = isLookup
            ? beat >= idx + 1
            : idx === 0
              ? true
              : idx === 1
                ? seen2Ready
                : primes3Ready;
          const justFired = isLookup ? beat === idx + 1 : idx <= 1 ? beat === 1 : beat === 3;
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
                  <RichText text={`$(${item.hashVal} \\bmod ${item.prime}) + ${item.offset}$`} />
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
                opacity: revealed ? 1 : 0.18,
                y: revealed ? 0 : 6,
                scale: justFired ? [0.96, 1.04, 1] : 1,
              }}
              transition={{ ...MORPH_SPRING, opacity: { duration: 0.28 } }}
              className="engram-head-card wisp-kit-tone"
              data-tone={tone}
            >
              <div className="engram-head-card__top">
                <span>头 {headMeta.headIdx}</span>
                <span className="engram-tag">{headMeta.ngram}-gram</span>
              </div>
              <span className="engram-head-card__math">
                <RichText text={`素数 $p = ${headMeta.prime}$（$${headMeta.prime}$ 行）`} />
              </span>
              <span className="engram-head-card__slot">
                <RichText text={`$\\text{offset} = ${headMeta.offset}$`} />
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* 第 6 步：从四张头卡路由到下方一维扁平带四段中心的精确折线 */}
      {isLookup && (
        <div className="engram-lookup-bus">
          <svg className="engram-gather-svg" viewBox="0 0 620 44" aria-hidden="true">
            {state.headLookups.map((item, idx) => {
              const sx = HEAD_CENTERS[idx];
              const tx = BANK_CENTERS[idx];
              const dimmed = spotlightIdx !== null && spotlightIdx !== idx;
              const stroke = toneStroke(item.tone);
              const headFired = beat >= idx + 1;
              const pathD = `M ${sx} 0 L ${sx} 18 L ${tx} 18 L ${tx} 40`;
              return (
                <g key={idx}>
                  <motion.path
                    d={pathD}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{
                      pathLength: headFired ? 1 : 0,
                      opacity: headFired ? (dimmed ? 0.2 : 1) : 0.12,
                    }}
                    transition={{ duration: headFired ? 0.32 : 0, ease: MANIM_EASE }}
                  />
                  {playToken > 0 && headFired && !dimmed && (
                    <motion.circle
                      key={`lk-dot-${idx}-${playToken}`}
                      r={3}
                      fill={stroke}
                      initial={{ cx: sx, cy: 0, opacity: 0 }}
                      animate={{
                        cx: [sx, sx, tx, tx],
                        cy: [0, 18, 18, 40],
                        opacity: [0, 1, 1, 0],
                      }}
                      transition={{ duration: 0.42, times: [0, 0.25, 0.65, 1], ease: MANIM_EASE }}
                    />
                  )}
                  <motion.path
                    d={`M ${tx - 5} 35 L ${tx} 40 L ${tx + 5} 35`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{ opacity: headFired ? (dimmed ? 0.2 : 1) : 0 }}
                    transition={{ duration: headFired ? 0.14 : 0, delay: headFired ? 0.2 : 0 }}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* 连续一维扁平大表 weight[0..35]（按 5:7:11:13 比例首尾拼接） */}
      <div className="engram-banks-wrap">
        <div className="engram-banks-title">
          <span>
            <RichText
              text={`连续一维扁平大表 $E \\in \\mathbb{R}^{${TOTAL_ROWS} \\times d_h}$（$5 + 7 + 11 + 13 = ${TOTAL_ROWS}$ 行）`}
            />
          </span>
          <span className="engram-tok__pos">
            <RichText text={'$\\text{offsets} = [0, 5, 12, 23]$'} />
          </span>
        </div>

        <motion.div
          className="engram-flat-strip"
          data-joined={stripJoined ? 'true' : undefined}
          initial={false}
          animate={{ scale: !isLookup && beat >= 4 ? [1, 1.015, 1] : 1 }}
          transition={{ duration: 0.4, ease: MANIM_EASE }}
          aria-label="36 行连续一维扁平嵌入表"
        >
          {HEADS.map((head, idx) => {
            const dimmed = spotlightIdx !== null && spotlightIdx !== idx;
            const bankRevealed =
              isLookup || (idx === 0 ? true : idx === 1 ? seen2Ready : primes3Ready);
            return (
              <motion.section
                key={head.headIdx}
                layoutId={`engram-bank-${head.headIdx}`}
                transition={{
                  ...MORPH_SPRING,
                  opacity: { duration: bankRevealed ? 0.28 : 0.1 },
                }}
                className="engram-strip-seg"
                data-tone={bankRevealed ? head.tone : 'slate'}
                data-dimmed={dimmed ? 'true' : undefined}
                initial={false}
                animate={{ opacity: dimmed ? 0.32 : bankRevealed ? 1 : 0.18 }}
                aria-label={`头 ${head.headIdx} 物理槽位 ${head.offset} 到 ${head.offset + head.prime - 1}`}
              >
                <div className="engram-strip-seg__ruler">
                  <span>off={head.offset}</span>
                  <span>
                    头 {head.headIdx}（{head.prime}）
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
                            ? { scale: [1, 1.22, 1], opacity: 1 }
                            : bankRevealed
                              ? { scale: 1, opacity: 1 }
                              : { scale: 0.9, opacity: 0.2 }
                        }
                        transition={
                          hitReady
                            ? { duration: 0.36, delay: 0.2, ease: MANIM_EASE }
                            : {
                                duration: bankRevealed ? 0.22 : 0.08,
                                delay: !isLookup && bankRevealed ? rem * 0.024 : 0,
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
        </motion.div>
      </div>
    </div>
  );
}
