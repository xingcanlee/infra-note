import { RichText, toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  MANIM_EASE,
  MORPH_SPRING,
  NORMALIZE_EXAMPLES,
  ORDER_DEMO,
  TOKENS,
  type EngramStepState,
} from './steps';

interface Props {
  state: EngramStepState;
  beat: number;
  playToken: number;
}

function FlowArrowSvg({
  active,
  tone,
  playToken,
  tag,
}: {
  active: boolean;
  tone: 'active' | 'done' | 'highlight';
  playToken: number;
  tag: string;
}) {
  const stroke = toneStroke(tone);
  return (
    <svg className="engram-inline-arrow" viewBox="0 0 64 26" aria-hidden="true">
      <motion.path
        d="M 4 13 L 56 13"
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0.16 }}
        transition={{ duration: active ? 0.34 : 0.1, ease: MANIM_EASE }}
      />
      <motion.path
        d="M 51 8 L 57 13 L 51 18"
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ opacity: active ? 1 : 0.16 }}
        transition={{ duration: active ? 0.2 : 0.08, delay: active ? 0.22 : 0 }}
      />
      {playToken > 0 && active && (
        <motion.circle
          key={`arr-${tag}-${playToken}`}
          cy={13}
          r={3}
          fill={stroke}
          initial={{ cx: 6, opacity: 0 }}
          animate={{ cx: [6, 54], opacity: [0, 1, 0] }}
          transition={{ duration: 0.45, ease: MANIM_EASE }}
        />
      )}
    </svg>
  );
}

export default function OfflineSetupStage({ state, beat, playToken }: Props) {
  if (state.phase === 'normalize') {
    const pipeLit = beat >= 1;
    const statsLit = beat >= 2;
    const seqLit = beat >= 3;

    return (
      <div className="engram-stage">
        <div className="engram-norm-flow">
          {/* 左列：原始 BPE 碎片变体 */}
          <div className="engram-norm-col">
            <div className="engram-panel__head">
              <span>原始 BPE 词表</span>
              <span className="engram-tag">129,280 词</span>
            </div>
            {NORMALIZE_EXAMPLES.map((g, idx) => (
              <motion.div
                key={g.canonical}
                className="engram-norm-row wisp-kit-tone"
                data-tone={g.tone}
                initial={false}
                animate={{ opacity: 1, scale: beat === 0 ? [0.98, 1.02, 1] : 1 }}
                transition={{ duration: 0.3, delay: idx * 0.06, ease: MANIM_EASE }}
              >
                <div className="engram-norm-chips">
                  {g.rawVariants.map((v) => (
                    <span key={v} className="engram-mono-chip">
                      {v}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* 中列：归一管道与 SVG 流向箭头 */}
          <motion.div
            className="engram-norm-pipe wisp-kit-tone"
            data-tone={pipeLit ? 'active' : 'slate'}
            initial={false}
            animate={{ opacity: pipeLit ? 1 : 0.35 }}
            transition={{ duration: 0.32, ease: MANIM_EASE }}
          >
            <span className="engram-norm-pipe__title">CompressedTokenizer</span>
            <FlowArrowSvg active={pipeLit} tone="active" playToken={playToken} tag="norm" />
            <div className="engram-norm-steps">
              <span>NFKC · NFD 去变音符</span>
              <span>转小写 · 空白折叠</span>
            </div>
          </motion.div>

          {/* 右列：规范词形与合并计数 */}
          <div className="engram-norm-col">
            <div className="engram-panel__head">
              <span>规范映射表</span>
              <motion.span
                className="engram-tag wisp-kit-tone"
                data-tone={statsLit ? 'done' : 'slate'}
                initial={false}
                animate={{ scale: statsLit ? [0.95, 1.06, 1] : 1 }}
                transition={{ duration: 0.35, ease: MANIM_EASE }}
              >
                <RichText text={"$V' \\approx 9.9\\times 10^4$"} />
              </motion.span>
            </div>
            {NORMALIZE_EXAMPLES.map((g, idx) => (
              <motion.div
                key={g.canonical}
                className="engram-norm-row wisp-kit-tone"
                data-tone={statsLit ? g.tone : 'slate'}
                initial={false}
                animate={{
                  opacity: statsLit ? 1 : 0.25,
                  x: statsLit ? 0 : -6,
                }}
                transition={{ duration: 0.32, delay: statsLit ? idx * 0.07 : 0, ease: MANIM_EASE }}
              >
                <span className="engram-mono-chip engram-mono-chip--strong">{g.canonical}</span>
                <span className="engram-tok__pos">{g.note}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 底部：映射为本例 5 词元的规范 ID */}
        <motion.div
          className="engram-norm-seq-box"
          initial={false}
          animate={{ opacity: seqLit ? 1 : 0.26, y: seqLit ? 0 : 4 }}
          transition={{ duration: seqLit ? 0.36 : 0.12, ease: MANIM_EASE }}
        >
          <div className="engram-banks-title">
            <span>
              <RichText
                text={'推理时按原 ID 查一维表即得规范 ID $c_t$（以下贯穿示例均采用归并后 ID）'}
              />
            </span>
          </div>
          <div className="engram-seq-grid" role="list" aria-label="规范化后的输入词元序列">
            {TOKENS.map((tok) => {
              const shared = tok.pos >= 3;
              return (
                <motion.div
                  key={tok.pos}
                  role="listitem"
                  layoutId={shared ? `engram-tok-${tok.pos}` : undefined}
                  transition={MORPH_SPRING}
                  className="engram-tok wisp-kit-tone"
                  data-tone={seqLit ? (shared ? 'active' : 'slate') : 'slate'}
                >
                  <span className="engram-tok__pos">t = {tok.pos}</span>
                  <span className="engram-tok__word">“{tok.text}”</span>
                  <span className="engram-tok__id">
                    <RichText text={`$c_${tok.pos} = ${tok.id}$`} />
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    );
  }

  // 第 2 步：离线奇乘子（为什么需要位置乘子 + 三步生成公式）
  const multLit = beat >= 1;
  const boundLit = beat >= 2;
  const oddLit = beat >= 3;

  return (
    <div className="engram-stage">
      <div className="engram-compare-grid">
        {/* 左对比卡：直接异或失败 */}
        <motion.section
          className="engram-panel wisp-kit-tone"
          data-tone="highlight"
          initial={false}
          animate={{ opacity: 1, scale: beat === 0 ? [0.98, 1.02, 1] : 1 }}
          transition={{ duration: 0.34, ease: MANIM_EASE }}
          aria-label="直接异或失去词序"
        >
          <header className="engram-panel__head">
            <span>反例：直接按位异或</span>
            <span className="engram-tag wisp-kit-tone" data-tone="highlight">
              词序丢失
            </span>
          </header>
          <div className="engram-order-list">
            <div className="engram-order-item">
              <span>正序 (12, 88)</span>
              <span className="engram-mono-val">
                <RichText text={`$12 \\oplus 88 = ${ORDER_DEMO.rawXor}$`} />
              </span>
            </div>
            <div className="engram-order-item">
              <span>反序 (88, 12)</span>
              <span className="engram-mono-val">
                <RichText text={`$88 \\oplus 12 = ${ORDER_DEMO.rawXor}$`} />
              </span>
            </div>
            <div className="engram-order-item">
              <span>叠词 (12, 12)</span>
              <span className="engram-mono-val">
                <RichText text={`$12 \\oplus 12 = ${ORDER_DEMO.sameXor}$`} />
              </span>
            </div>
          </div>
          <p className="engram-verdict">交换律让两词顺序无法区分，相同词异或直接归零。</p>
        </motion.section>

        {/* 右对比卡：乘位置奇乘子锁定词序 */}
        <motion.section
          className="engram-panel wisp-kit-tone"
          data-tone={multLit ? 'done' : 'slate'}
          initial={false}
          animate={{
            opacity: multLit ? 1 : 0.24,
            scale: beat === 1 ? [0.98, 1.02, 1] : 1,
          }}
          transition={{ duration: multLit ? 0.36 : 0.12, ease: MANIM_EASE }}
          aria-label="乘位置奇乘子锁死词序"
        >
          <header className="engram-panel__head">
            <span>解法：先乘位置乘子再异或</span>
            <span className="engram-tag wisp-kit-tone" data-tone={multLit ? 'done' : 'slate'}>
              <RichText text={'$m_0=3,\\; m_1=7$'} />
            </span>
          </header>
          <div className="engram-order-list">
            <div className="engram-order-item">
              <span>正序“的 首” (12, 88)</span>
              <span className="engram-mono-val">
                <RichText text={`$88{\\times}3 \\oplus 12{\\times}7 = ${ORDER_DEMO.fwd}$`} />
              </span>
            </div>
            <div className="engram-order-item">
              <span>反序“首 的” (88, 12)</span>
              <span className="engram-mono-val">
                <RichText text={`$12{\\times}3 \\oplus 88{\\times}7 = ${ORDER_DEMO.rev}$`} />
              </span>
            </div>
            <div className="engram-order-item">
              <span>叠词 (12, 12)</span>
              <span className="engram-mono-val">
                <RichText text={`$12{\\times}3 \\oplus 12{\\times}7 = ${36 ^ 84}$`} />
              </span>
            </div>
          </div>
          <p className="engram-verdict">
            <RichText text={'$348 \\neq 588$，且同词不再归零；不训练、不存权重文件。'} />
          </p>
        </motion.section>
      </div>

      {/* 下半区：离线三步生成流水线 */}
      <div className="engram-gen-pipe">
        <motion.div
          className="engram-gen-card wisp-kit-tone"
          data-tone={boundLit ? 'active' : 'slate'}
          initial={false}
          animate={{ opacity: boundLit ? 1 : 0.24, y: boundLit ? 0 : 4 }}
          transition={{ duration: 0.32, ease: MANIM_EASE }}
        >
          <span className="engram-tok__pos">1. 防 int64 溢出定上界</span>
          <span className="engram-gen-card__math">
            <RichText text={"$M_{\\max} = \\lfloor (2^{63}-1) / V' \\rfloor$"} />
          </span>
          <span className="engram-tok__pos">保证最大 ID 相乘不变负</span>
        </motion.div>

        <FlowArrowSvg active={boundLit} tone="active" playToken={playToken} tag="m1" />

        <motion.div
          className="engram-gen-card wisp-kit-tone"
          data-tone={boundLit ? 'active' : 'slate'}
          initial={false}
          animate={{ opacity: boundLit ? 1 : 0.24, y: boundLit ? 0 : 4 }}
          transition={{ duration: 0.32, delay: 0.08, ease: MANIM_EASE }}
        >
          <span className="engram-tok__pos">2. 留半界映射奇数</span>
          <span className="engram-gen-card__math">
            <RichText text={'$\\text{half} = \\lfloor M_{\\max} / 2 \\rfloor$'} />
          </span>
          <span className="engram-tok__pos">
            <RichText text={'为 $2r_k + 1$ 预留翻倍空间'} />
          </span>
        </motion.div>

        <FlowArrowSvg active={oddLit} tone="done" playToken={playToken} tag="m2" />

        <motion.div
          className="engram-gen-card wisp-kit-tone"
          data-tone={oddLit ? 'done' : 'slate'}
          initial={false}
          animate={{
            opacity: oddLit ? 1 : 0.24,
            scale: oddLit ? [0.98, 1.03, 1] : 0.98,
          }}
          transition={{ duration: 0.34, ease: MANIM_EASE }}
        >
          <span className="engram-tok__pos">3. 按层抽样保持低位满秩</span>
          <span className="engram-gen-card__math">
            <RichText text={'$m_k = 2r_k + 1$'} />
          </span>
          <span className="engram-tok__pos">
            <RichText text={'真实 $10^{13}$ 级 · 本例 $[3, 7, 9]$'} />
          </span>
        </motion.div>
      </div>

      <svg className="engram-hidden-dot-guard" viewBox="0 0 1 1" aria-hidden="true">
        <circle cx={0.5} cy={0.5} r={0.1} fill={toneFill('done')} opacity={0} />
      </svg>
    </div>
  );
}
