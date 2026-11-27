import { RichText } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { DataFlowArrow } from '@/explainers/kit';
import {
  BLOCK_SIZE,
  MAX_MODEL_LEN,
  MAX_NUM_BLOCKS,
  MORPH_SPRING,
  REQUESTS,
  STAGED_DIFFS_STEP2,
  type PrepareInputsStepState,
} from './steps';

interface Props {
  state: PrepareInputsStepState;
  playToken: number;
}

export default function PrepareInputsStage({ state, playToken }: Props) {
  const { phase, trace, blockTable, showDiffHighlight } = state;
  const isStep2 = phase === 'async_gather';

  return (
    <div className="pi-stage">
      {/* 上半区：持久化 CPU -> H2D -> GPU 双侧对比面板 */}
      <div className="pi-compare-relay">
        {/* CPU 侧持久化状态面板 */}
        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>CPU · RequestState [4, 12] + StagedWrite</span>
            <span
              className="pi-tag wisp-kit-tone"
              data-tone={isStep2 ? 'done' : showDiffHighlight ? 'highlight' : 'active'}
            >
              {state.stepTag}
            </span>
          </div>

          <div className="pi-matrix">
            {[0, 1, 2, 3].map((r) => {
              const req = REQUESTS[r];
              const isFree = !req;
              const schedCount = trace.scheduledCounts[r] ?? 0;
              const compBefore = trace.computedBefore[r] ?? 0;
              return (
                <div
                  key={`cpu-row-${r}`}
                  className="pi-matrix__row"
                  style={{ opacity: isFree ? 0.42 : 1 }}
                >
                  <span className="pi-row-badge wisp-kit-tone" data-tone={req ? req.tone : 'slate'}>
                    行 {r}
                  </span>
                  <div className="pi-cells-12">
                    {Array.from({ length: MAX_MODEL_LEN }, (_, col) => {
                      const tokText = req?.tokens[col] ?? '·';
                      const isScheduledNow =
                        req && col >= compBefore && col < compBefore + schedCount;
                      const isComputedPrev = req && col < compBefore;
                      const cellTone = isScheduledNow
                        ? req.tone
                        : isComputedPrev
                          ? 'slate'
                          : req && col < req.promptLen
                            ? req.tone
                            : 'slate';
                      const dimmed =
                        !req || (!isScheduledNow && !isComputedPrev && col >= req.promptLen);

                      return (
                        <motion.span
                          key={col}
                          className="pi-cell wisp-kit-tone"
                          data-tone={cellTone}
                          data-dimmed={dimmed ? 'true' : undefined}
                          initial={false}
                          animate={{
                            scale: isScheduledNow ? 1 : 0.96,
                            opacity: dimmed ? 0.34 : isComputedPrev ? 0.55 : 1,
                          }}
                          transition={MORPH_SPRING}
                        >
                          {tokText}
                        </motion.span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* StagedWrite / 临时锁页状态栏 */}
          <div
            className="pi-pack-bar wisp-kit-tone"
            data-tone={isStep2 ? 'done' : showDiffHighlight ? 'highlight' : 'slate'}
          >
            {phase === 'init' && 'block 0 保留为空块 · 初始块表 [1,2], [3], [4,5,6]'}
            {phase === 'step1_map' && 'Step 1 配额 {0:3, 1:2, 2:5} · 准备计算 10 词元槽位'}
            {phase === 'staged_write' &&
              `差量队列: ${STAGED_DIFFS_STEP2.map((d) => `(${d.row},${d.start},[${d.values[0]}])`).join(' ')}`}
            {phase === 'async_gather' &&
              'self.states(pageable) -> .pin_memory() -> non_blocking=True (零锁)'}
          </div>
        </div>

        {/* 中央持久化 H2D 数据流桥 */}
        <div className="pi-bridge" aria-hidden="true">
          <svg className="pi-bridge-svg" viewBox="0 0 84 64">
            <DataFlowArrow
              points={[
                [4, 32],
                [80, 32],
              ]}
              tone={state.h2dTone}
              active={state.h2dActive}
              visible={true}
              draw={state.h2dActive}
              flow={state.h2dActive}
              continuous={true}
              dotToken={state.h2dActive ? playToken : 0}
              label={state.h2dLabel}
              labelPos={[42, 14]}
              strokeWidth={2}
            />
          </svg>
        </div>

        {/* GPU 侧持久化 BlockTables [4, 6] */}
        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>GPU · BlockTables [4, 6] (B=2)</span>
            <span
              className="pi-tag wisp-kit-tone"
              data-tone={isStep2 ? 'done' : showDiffHighlight ? 'highlight' : 'slate'}
            >
              {state.asyncStatus}
            </span>
          </div>

          <div className="pi-matrix pi-matrix--compact">
            {blockTable.map((row, r) => {
              const req = REQUESTS[r];
              return (
                <div key={`gpu-bt-${r}`} className="pi-matrix__row">
                  <span className="pi-row-badge wisp-kit-tone" data-tone={req ? req.tone : 'slate'}>
                    行 {r}
                  </span>
                  <div className="pi-cells-6">
                    {row.map((blk, c) => {
                      const flatIdx = r * MAX_NUM_BLOCKS + c;
                      const isNewDiff = (r === 1 && c === 1) || (r === 2 && c === 3);
                      const isUsedNow = trace.blockTableIndices.includes(flatIdx);
                      const cellTone =
                        isNewDiff && showDiffHighlight
                          ? 'highlight'
                          : isUsedNow && req
                            ? req.tone
                            : blk > 0 && req
                              ? req.tone
                              : 'slate';

                      return (
                        <motion.span
                          key={c}
                          className="pi-cell pi-cell--wide wisp-kit-tone"
                          data-tone={cellTone}
                          data-dimmed={blk === 0 ? 'true' : undefined}
                          initial={false}
                          animate={{
                            scale: isNewDiff && phase === 'staged_write' ? 1.06 : 1,
                            opacity: blk === 0 ? 0.36 : 1,
                          }}
                          transition={MORPH_SPRING}
                        >
                          {blk > 0
                            ? isNewDiff && showDiffHighlight
                              ? `B${blk}*`
                              : `B${blk}`
                            : '0'}
                        </motion.span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="pi-stage-note">
            {showDiffHighlight
              ? '仅行 1 列 1 (B7) 与行 2 列 3 (B8) 原地增量更新，其余块表显存零改写。'
              : '按永久行号 r 与逻辑块列 ⌊p/2⌋ 定位物理块，null_block=0 永久保留。'}
          </p>
        </div>
      </div>

      {/* 下半区：持久化扁平元数据 Gather 条 (10 tok Step 1 <-> 5 tok Step 2 平滑更新) */}
      <div className="pi-panel">
        <div className="pi-panel__head">
          <span>
            {isStep2
              ? 'GPU Triton Gather 混批输入（Step 2：Decode 接力 + Chunk 续尾，共 5 词元）'
              : '扁平词元索引与 slot_mapping 映射（Step 1：共 10 词元）'}
          </span>
          <span className="pi-note-inline">
            <RichText
              text={'$\\text{slot} = \\text{blk}[r,\\lfloor p/2\\rfloor] \\times 2 + (p \\bmod 2)$'}
            />
          </span>
        </div>

        <div className="pi-token-table">
          <div className={`pi-token-row ${isStep2 ? 'pi-token-row--5' : ''}`}>
            <span className="pi-token-label">input_ids</span>
            {trace.inputLabels.map((lbl, i) => (
              <motion.span
                key={`lbl-${phase}-${i}`}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={MORPH_SPRING}
                className="pi-chip wisp-kit-tone"
                data-tone={REQUESTS[trace.reqIndices[i]].tone}
              >
                {lbl}
              </motion.span>
            ))}
          </div>

          <div className={`pi-token-row ${isStep2 ? 'pi-token-row--5' : ''}`}>
            <span className="pi-token-label">positions</span>
            {trace.positions.map((p, i) => (
              <span
                key={`pos-${i}`}
                className="pi-chip wisp-kit-tone"
                data-tone={REQUESTS[trace.reqIndices[i]].tone}
              >
                {p}
              </span>
            ))}
          </div>

          <div className={`pi-token-row ${isStep2 ? 'pi-token-row--5' : ''}`}>
            <span className="pi-token-label">token_idx</span>
            {trace.tokenIndices.map((idx, i) => (
              <span
                key={`ti-${i}`}
                className="pi-chip wisp-kit-tone"
                data-tone={REQUESTS[trace.reqIndices[i]].tone}
              >
                {idx}
              </span>
            ))}
          </div>

          <div className={`pi-token-row ${isStep2 ? 'pi-token-row--5' : ''}`}>
            <span className="pi-token-label">blk / off</span>
            {trace.blockNumbers.map((b, i) => (
              <span key={`bo-${i}`} className="pi-chip pi-chip--muted">
                {`B${b}+${trace.blockOffsets[i]}`}
              </span>
            ))}
          </div>

          <div className={`pi-token-row ${isStep2 ? 'pi-token-row--5' : ''}`}>
            <span className="pi-token-label">slot_mapping</span>
            {trace.slotMapping.map((slot, i) => (
              <motion.span
                key={`sm-${i}`}
                initial={false}
                animate={{ scale: phase === 'init' ? 0.94 : 1 }}
                transition={MORPH_SPRING}
                className="pi-chip pi-chip--strong wisp-kit-tone"
                data-tone={REQUESTS[trace.reqIndices[i]].tone}
              >
                {slot}
              </motion.span>
            ))}
          </div>
        </div>
      </div>

      <div className="pi-meta-grid">
        <div className="pi-meta-card wisp-kit-tone" data-tone="active">
          <span className="pi-meta-card__k">query_start_loc</span>
          <span className="pi-meta-card__v">[{trace.queryStartLoc.join(', ')}]</span>
        </div>
        <div className="pi-meta-card wisp-kit-tone" data-tone="done">
          <span className="pi-meta-card__k">seq_lens</span>
          <span className="pi-meta-card__v">[{trace.seqLens.join(', ')}]</span>
        </div>
        <div className="pi-meta-card wisp-kit-tone" data-tone="highlight">
          <span className="pi-meta-card__k">idx_mapping (Gather)</span>
          <span className="pi-meta-card__v">
            [{`0, 1, 2`}] · {BLOCK_SIZE} tok/块
          </span>
        </div>
      </div>
    </div>
  );
}
