import { RichText } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { DataFlowArrow } from '@/explainers/kit';
import {
  BLOCK_SIZE,
  MANIM_EASE,
  MAX_MODEL_LEN,
  MAX_NUM_BLOCKS,
  MORPH_SPRING,
  REQUESTS,
  STAGED_DIFFS_STEP2,
  type PrepareInputsStepState,
} from './steps';

interface Props {
  state: PrepareInputsStepState;
  beat: number;
  playToken: number;
}

function HorizontalFlowBridge({
  label,
  tone,
  active,
  playToken,
}: {
  label: string;
  tone: 'active' | 'done' | 'highlight';
  active: boolean;
  playToken: number;
}) {
  return (
    <div className="pi-bridge" aria-hidden="true">
      <svg className="pi-bridge-svg" viewBox="0 0 72 48">
        <DataFlowArrow
          points={[
            [4, 24],
            [68, 24],
          ]}
          tone={tone}
          active={active}
          visible={true}
          draw={true}
          flow={active}
          dotToken={active ? playToken : 0}
          label={label}
          labelPos={[36, 12]}
        />
      </svg>
    </div>
  );
}

function VerticalFlowBridge({
  label,
  tone,
  active,
  playToken,
}: {
  label: string;
  tone: 'active' | 'done' | 'highlight';
  active: boolean;
  playToken: number;
}) {
  return (
    <div className="pi-vbridge" aria-hidden="true">
      <svg className="pi-vbridge-svg" viewBox="0 0 260 28">
        <DataFlowArrow
          points={[
            [130, 2],
            [130, 26],
          ]}
          tone={tone}
          active={active}
          visible={true}
          draw={true}
          flow={active}
          dotToken={active ? playToken : 0}
          label={label}
          labelPos={[194, 14]}
        />
      </svg>
    </div>
  );
}

export default function PrepareInputsStage({ state, beat, playToken }: Props) {
  const { phase, trace, blockTable } = state;

  if (phase === 'init') {
    const showTable = beat >= 1;
    const showNull = beat >= 2;
    const showBlocks = beat >= 3;

    return (
      <div className="pi-stage">
        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>RequestState 常驻词元表 all_token_ids（[4, 12]）</span>
            <span className="pi-tag wisp-kit-tone" data-tone="active">
              永久行号 r ∈ {'{0,1,2}'}
            </span>
          </div>
          <div className="pi-matrix">
            {[0, 1, 2, 3].map((r) => {
              const req = REQUESTS[r];
              const isFree = !req;
              return (
                <motion.div
                  key={`tok-row-${r}`}
                  className="pi-matrix__row"
                  initial={false}
                  animate={{ opacity: isFree ? 0.42 : showTable ? 1 : 0.72 }}
                  transition={{ duration: 0.28, ease: MANIM_EASE }}
                >
                  <span className="pi-row-badge wisp-kit-tone" data-tone={req ? req.tone : 'slate'}>
                    行 {r}
                  </span>
                  <div className="pi-cells-12">
                    {Array.from({ length: MAX_MODEL_LEN }, (_, col) => {
                      const hasPrompt = req && col < req.promptLen;
                      const tokText = hasPrompt ? req.tokens[col] : '·';
                      return (
                        <span
                          key={col}
                          className="pi-cell wisp-kit-tone"
                          data-tone={hasPrompt && showTable ? req.tone : 'slate'}
                          data-dimmed={!hasPrompt ? 'true' : undefined}
                        >
                          {tokText}
                        </span>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <VerticalFlowBridge
          label="按永久行号 r 对齐块表"
          tone="highlight"
          active={showBlocks}
          playToken={playToken}
        />

        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>BlockTables 物理块表（[4, 6]，block_size = 2）</span>
            <span className="pi-tag wisp-kit-tone" data-tone={showNull ? 'highlight' : 'slate'}>
              {showNull ? 'block 0 保留为空块' : '等待块表登记'}
            </span>
          </div>
          <div className="pi-matrix">
            {blockTable.map((row, r) => {
              const req = REQUESTS[r];
              return (
                <div key={`bt-init-${r}`} className="pi-matrix__row">
                  <span className="pi-row-badge wisp-kit-tone" data-tone={req ? req.tone : 'slate'}>
                    行 {r}
                  </span>
                  <div className="pi-cells-6">
                    {row.map((blk, c) => {
                      const active = blk > 0 && showBlocks;
                      return (
                        <motion.span
                          key={c}
                          className="pi-cell pi-cell--wide wisp-kit-tone"
                          data-tone={active && req ? req.tone : 'slate'}
                          data-dimmed={!active ? 'true' : undefined}
                          initial={false}
                          animate={{ scale: active && beat === 3 ? [1, 1.06, 1] : 1 }}
                          transition={{ duration: 0.28, ease: MANIM_EASE }}
                        >
                          {active ? `B${blk}` : '0'}
                        </motion.span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'step1_tokens') {
    const showReqIdx = beat >= 1;
    const showPos = beat >= 2;
    const showFlat = beat >= 3;
    const showReqMeta = beat >= 4;

    return (
      <div className="pi-stage">
        <div className="pi-summary-bar">
          <span className="pi-tag wisp-kit-tone" data-tone="active">
            Step 1 配额 = 10：{'{0: 3, 1: 2, 2: 5}'}
          </span>
          <span className="pi-tag wisp-kit-tone" data-tone="highlight">
            请求 2 分块预填充（余 3 个词元留待 Step 2）
          </span>
        </div>

        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>词元级扁平索引推演（长度 = 10）</span>
            <span className="pi-note-inline">
              <RichText text={'$\\text{token\\_idx} = r \\cdot 12 + p$'} />
            </span>
          </div>
          <div className="pi-token-table">
            <div className="pi-token-row">
              <span className="pi-token-label">位置号 t</span>
              {trace.positions.map((_, i) => (
                <span key={`t-${i}`} className="pi-chip pi-chip--muted">
                  {i}
                </span>
              ))}
            </div>
            <motion.div
              className="pi-token-row"
              initial={false}
              animate={{ opacity: showReqIdx ? 1 : 0.3, y: showReqIdx ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">req_indices</span>
              {trace.reqIndices.map((r, i) => (
                <span key={`r-${i}`} className="pi-chip wisp-kit-tone" data-tone={REQUESTS[r].tone}>
                  {r}
                </span>
              ))}
            </motion.div>
            <motion.div
              className="pi-token-row"
              initial={false}
              animate={{ opacity: showPos ? 1 : 0.3, y: showPos ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">positions</span>
              {trace.positions.map((p, i) => (
                <span
                  key={`p-${i}`}
                  className="pi-chip wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  {p}
                </span>
              ))}
            </motion.div>
            <motion.div
              className="pi-token-row"
              initial={false}
              animate={{ opacity: showFlat ? 1 : 0.25, y: showFlat ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">token_indices</span>
              {trace.tokenIndices.map((idx, i) => (
                <span
                  key={`ti-${i}`}
                  className="pi-chip pi-chip--strong wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  {idx}
                </span>
              ))}
            </motion.div>
            <motion.div
              className="pi-token-row"
              initial={false}
              animate={{ opacity: showFlat ? 1 : 0.25, y: showFlat ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">input_ids</span>
              {trace.inputLabels.map((lbl, i) => (
                <span
                  key={`id-${i}`}
                  className="pi-chip wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  {lbl}
                </span>
              ))}
            </motion.div>
          </div>
        </div>

        <motion.div
          className="pi-meta-grid"
          initial={false}
          animate={{ opacity: showReqMeta ? 1 : 0.35, y: showReqMeta ? 0 : 4 }}
          transition={{ duration: 0.28, ease: MANIM_EASE }}
        >
          <div className="pi-meta-card wisp-kit-tone" data-tone="active">
            <span className="pi-meta-card__k">query_start_loc（前缀和）</span>
            <span className="pi-meta-card__v">[{trace.queryStartLoc.join(', ')}]</span>
          </div>
          <div className="pi-meta-card wisp-kit-tone" data-tone="done">
            <span className="pi-meta-card__k">seq_lens（已算 + 本轮）</span>
            <span className="pi-meta-card__v">[{trace.seqLens.join(', ')}]</span>
          </div>
          <div className="pi-meta-card wisp-kit-tone" data-tone="slate">
            <span className="pi-meta-card__k">max_query_len</span>
            <span className="pi-meta-card__v">5（请求 2 首块）</span>
          </div>
        </motion.div>
      </div>
    );
  }

  if (phase === 'step1_slots') {
    const showCols = beat >= 0;
    const showBlks = beat >= 1;
    const showOffsets = beat >= 2;
    const showSlots = beat >= 3;

    return (
      <div className="pi-stage">
        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>Step 1 块表查表：K = 6，block_size = 2</span>
            <span className="pi-note-inline">
              <RichText text={'$\\text{bt\\_idx} = r \\cdot 6 + \\lfloor p/2 \\rfloor$'} />
            </span>
          </div>
          <div className="pi-matrix pi-matrix--compact">
            {blockTable.slice(0, 3).map((row, r) => (
              <div key={`bt-s1-${r}`} className="pi-matrix__row">
                <span className="pi-row-badge wisp-kit-tone" data-tone={REQUESTS[r].tone}>
                  行 {r}
                </span>
                <div className="pi-cells-6">
                  {row.map((blk, c) => {
                    const flatIdx = r * MAX_NUM_BLOCKS + c;
                    const used = trace.blockTableIndices.includes(flatIdx);
                    return (
                      <span
                        key={c}
                        className="pi-cell pi-cell--wide wisp-kit-tone"
                        data-tone={used ? REQUESTS[r].tone : 'slate'}
                        data-dimmed={!used ? 'true' : undefined}
                      >
                        {blk > 0 ? `[${flatIdx}] → B${blk}` : `[${flatIdx}] 0`}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <VerticalFlowBridge
          label="查块表映射物理槽位"
          tone="done"
          active={showBlks}
          playToken={playToken}
        />

        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>四步合成物理槽位 slot_mapping</span>
            <span className="pi-note-inline">
              <RichText text={'$\\text{slot} = \\text{blk} \\times 2 + (p \\bmod 2)$'} />
            </span>
          </div>
          <div className="pi-token-table">
            <motion.div
              className="pi-token-row"
              initial={false}
              animate={{ opacity: showCols ? 1 : 0.35 }}
            >
              <span className="pi-token-label">bt_indices</span>
              {trace.blockTableIndices.map((idx, i) => (
                <span
                  key={`bti-${i}`}
                  className="pi-chip wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  {idx}
                </span>
              ))}
            </motion.div>
            <motion.div
              className="pi-token-row"
              initial={false}
              animate={{ opacity: showBlks ? 1 : 0.3, y: showBlks ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">block_numbers</span>
              {trace.blockNumbers.map((b, i) => (
                <span
                  key={`bn-${i}`}
                  className="pi-chip wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  {b}
                </span>
              ))}
            </motion.div>
            <motion.div
              className="pi-token-row"
              initial={false}
              animate={{ opacity: showOffsets ? 1 : 0.3, y: showOffsets ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">block_offsets</span>
              {trace.blockOffsets.map((off, i) => (
                <span key={`bo-${i}`} className="pi-chip pi-chip--muted">
                  {off}
                </span>
              ))}
            </motion.div>
            <motion.div
              className="pi-token-row"
              initial={false}
              animate={{ opacity: showSlots ? 1 : 0.28, y: showSlots ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">slot_mapping</span>
              {trace.slotMapping.map((slot, i) => (
                <span
                  key={`sm-${i}`}
                  className="pi-chip pi-chip--strong wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  {slot}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'staged_write') {
    const packed = beat >= 1;
    const copied = beat >= 2;
    const applied = beat >= 3;

    return (
      <div className="pi-stage">
        <div className="pi-compare-relay">
          <div className="pi-panel">
            <div className="pi-panel__head">
              <span>CPU 暂存稀疏写入队列</span>
              <span className="pi-tag wisp-kit-tone" data-tone="highlight">
                仅 2 条 diff（全表 24 格）
              </span>
            </div>
            <div className="pi-diff-list">
              {STAGED_DIFFS_STEP2.map((d, idx) => (
                <motion.div
                  key={d.row}
                  className="pi-diff-card wisp-kit-tone"
                  data-tone={d.tone}
                  initial={false}
                  animate={{
                    scale: packed && idx === 0 ? [1, 1.02, 1] : 1,
                    opacity: 1,
                  }}
                  transition={MORPH_SPRING}
                >
                  <div className="pi-diff-card__top">
                    <span>
                      stage_write(row={d.row}, start={d.start}, [{d.values.join(', ')}])
                    </span>
                  </div>
                  <span className="pi-diff-card__note">{d.reason}</span>
                </motion.div>
              ))}
            </div>
            <motion.div
              className="pi-pack-bar wisp-kit-tone"
              data-tone={copied ? 'active' : packed ? 'highlight' : 'slate'}
              initial={false}
              animate={{ opacity: packed ? 1 : 0.35 }}
            >
              <span>
                {copied
                  ? '单次 non_blocking H2D → UVA 缓冲'
                  : '打包数组：rows=[1,2], starts=[1,3], cu_lens=[1,2], vals=[7,8]'}
              </span>
            </motion.div>
          </div>

          <HorizontalFlowBridge
            label={copied ? 'H2D' : 'UVA'}
            tone={applied ? 'done' : 'highlight'}
            active={copied}
            playToken={playToken}
          />

          <div className="pi-panel">
            <div className="pi-panel__head">
              <span>GPU 常驻块表原地应用</span>
              <span className="pi-tag wisp-kit-tone" data-tone={applied ? 'done' : 'slate'}>
                {applied ? 'apply_write 完成' : '等待 Kernel 写入'}
              </span>
            </div>
            <div className="pi-matrix pi-matrix--compact">
              {blockTable.slice(0, 3).map((row, r) => (
                <div key={`bt-sw-${r}`} className="pi-matrix__row">
                  <span className="pi-row-badge wisp-kit-tone" data-tone={REQUESTS[r].tone}>
                    行 {r}
                  </span>
                  <div className="pi-cells-6">
                    {row.map((blk, c) => {
                      const isNew = (r === 1 && c === 1) || (r === 2 && c === 3);
                      const visibleBlk = isNew && !applied ? 0 : blk;
                      return (
                        <motion.span
                          key={c}
                          className="pi-cell pi-cell--wide wisp-kit-tone"
                          data-tone={
                            isNew && applied
                              ? 'highlight'
                              : visibleBlk > 0
                                ? REQUESTS[r].tone
                                : 'slate'
                          }
                          data-dimmed={visibleBlk === 0 ? 'true' : undefined}
                          initial={false}
                          animate={{
                            scale: isNew && applied && beat === 3 ? [1, 1.12, 1] : 1,
                          }}
                          transition={MORPH_SPRING}
                        >
                          {visibleBlk > 0 ? (isNew ? `B${visibleBlk} *` : `B${visibleBlk}`) : '0'}
                        </motion.span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="pi-stage-note">
              旧块表行 0、行 1 列 0 与行 2 前三列保持显存零改写，只更新带 * 的两处新槽位。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'step2_mixed') {
    const showRelay = beat >= 0;
    const showChunk = beat >= 1;
    const showBlocks = beat >= 2;
    const showSlots = beat >= 3;

    return (
      <div className="pi-stage">
        <div className="pi-summary-bar">
          <span className="pi-tag wisp-kit-tone" data-tone="active">
            Step 2 混批配额 = 5：{'{0: 1, 1: 1, 2: 3}'}
          </span>
          <span className="pi-tag wisp-kit-tone" data-tone="done">
            请求 0 / 1 显存接力解码 + 请求 2 分块收尾
          </span>
        </div>

        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>Step 2 扁平五词元组装结果（decode + chunked prefill）</span>
            <span className="pi-note-inline">
              <RichText text={'$\\text{slot} = \\text{blk} \\times 2 + (p \\bmod 2)$'} />
            </span>
          </div>
          <div className="pi-token-table pi-token-table--5">
            <div className="pi-token-row pi-token-row--5">
              <span className="pi-token-label">来源阶段</span>
              <span className="pi-chip wisp-kit-tone" data-tone="active">
                Decode（接力）
              </span>
              <span className="pi-chip wisp-kit-tone" data-tone="done">
                Decode（接力）
              </span>
              <span className="pi-chip wisp-kit-tone" data-tone="highlight">
                Chunk Prefill
              </span>
              <span className="pi-chip wisp-kit-tone" data-tone="highlight">
                Chunk Prefill
              </span>
              <span className="pi-chip wisp-kit-tone" data-tone="highlight">
                Chunk Prefill
              </span>
            </div>
            <motion.div
              className="pi-token-row pi-token-row--5"
              initial={false}
              animate={{ opacity: showRelay || showChunk ? 1 : 0.4, y: showRelay ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">input_ids</span>
              {trace.inputLabels.map((lbl, i) => (
                <span
                  key={`s2-id-${i}`}
                  className="pi-chip wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  {lbl}
                </span>
              ))}
            </motion.div>
            <motion.div
              className="pi-token-row pi-token-row--5"
              initial={false}
              animate={{ opacity: showChunk ? 1 : 0.4, y: showChunk ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">positions</span>
              {trace.positions.map((p, i) => (
                <span
                  key={`s2-p-${i}`}
                  className="pi-chip wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  {p}
                </span>
              ))}
            </motion.div>
            <motion.div
              className="pi-token-row pi-token-row--5"
              initial={false}
              animate={{ opacity: showBlocks ? 1 : 0.3, y: showBlocks ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">block_numbers</span>
              {trace.blockNumbers.map((b, i) => (
                <span
                  key={`s2-bn-${i}`}
                  className="pi-chip wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  B{b}（行{trace.reqIndices[i]}列{Math.floor(trace.positions[i] / BLOCK_SIZE)}）
                </span>
              ))}
            </motion.div>
            <motion.div
              className="pi-token-row pi-token-row--5"
              initial={false}
              animate={{ opacity: showSlots ? 1 : 0.3, y: showSlots ? 0 : 4 }}
              transition={MORPH_SPRING}
            >
              <span className="pi-token-label">slot_mapping</span>
              {trace.slotMapping.map((slot, i) => (
                <span
                  key={`s2-sm-${i}`}
                  className="pi-chip pi-chip--strong wisp-kit-tone"
                  data-tone={REQUESTS[trace.reqIndices[i]].tone}
                >
                  {slot}
                </span>
              ))}
            </motion.div>
          </div>
        </div>

        <div className="pi-meta-grid">
          <div className="pi-meta-card wisp-kit-tone" data-tone="active">
            <span className="pi-meta-card__k">query_start_loc</span>
            <span className="pi-meta-card__v">[{trace.queryStartLoc.join(', ')}]</span>
          </div>
          <div className="pi-meta-card wisp-kit-tone" data-tone="done">
            <span className="pi-meta-card__k">seq_lens（总已见长度）</span>
            <span className="pi-meta-card__v">[{trace.seqLens.join(', ')}]</span>
          </div>
          <div className="pi-meta-card wisp-kit-tone" data-tone="highlight">
            <span className="pi-meta-card__k">token_indices</span>
            <span className="pi-meta-card__v">[{trace.tokenIndices.join(', ')}]</span>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'mrv2_async'
  const stagePin = beat >= 1;
  const stageGather = beat >= 2;
  const stageTriton = beat >= 3;

  return (
    <div className="pi-stage">
      <div className="pi-compare-relay">
        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>V1 共享锁页竞争 vs MRV2 临时锁页副本</span>
            <span className="pi-tag wisp-kit-tone" data-tone="done">
              零 Async Barrier
            </span>
          </div>
          <div className="pi-pipe-stack">
            <div className="pi-pipe-box wisp-kit-tone" data-tone="highlight">
              <div className="pi-pipe-box__title">V1 旧路径：共享固定锁页缓冲</div>
              <span className="pi-pipe-box__desc">
                CPU 写 Step N+1 时 GPU 仍在 DMA 读同一块 pinned 内存，必须加全局阻塞锁隔离
              </span>
            </div>
            <motion.div
              className="pi-pipe-box wisp-kit-tone"
              data-tone={stagePin ? 'done' : 'active'}
              initial={false}
              animate={{ opacity: 1 }}
            >
              <div className="pi-pipe-box__title">MRV2：states（非锁页）→ .pin_memory()</div>
              <span className="pi-pipe-box__desc">
                CPU 只改写可分页持久数组 self.states；每次生成独立临时锁页副本供异步拷贝
              </span>
            </motion.div>
            <motion.div
              className="pi-pipe-box wisp-kit-tone"
              data-tone={stagePin ? 'active' : 'slate'}
              initial={false}
              animate={{ opacity: stagePin ? 1 : 0.4 }}
            >
              <div className="pi-pipe-box__title">tmp.to(device, non_blocking=True)</div>
              <span className="pi-pipe-box__desc">
                CPU 与 DMA 读写物理分离，消除并发写入冲突，主线程继续向流内入队
              </span>
            </motion.div>
          </div>
        </div>

        <HorizontalFlowBridge
          label="异步流"
          tone="done"
          active={stageGather}
          playToken={playToken}
        />

        <div className="pi-panel">
          <div className="pi-panel__head">
            <span>设备侧 Triton 组装流水（input_batch.py）</span>
            <span className="pi-tag wisp-kit-tone" data-tone={stageTriton ? 'done' : 'active'}>
              {stageTriton ? '零 Python 循环' : '按 idx_mapping 收集'}
            </span>
          </div>
          <div className="pi-pipe-stack">
            <motion.div
              className="pi-pipe-box wisp-kit-tone"
              data-tone={stageGather ? 'active' : 'slate'}
              initial={false}
              animate={{ opacity: stageGather ? 1 : 0.42, x: stageGather ? 0 : -4 }}
              transition={MORPH_SPRING}
            >
              <div className="pi-pipe-box__title">1. idx_mapping = [0, 1, 2] 映射重排</div>
              <span className="pi-pipe-box__desc">
                永久行号与批内顺序解耦，注意力后端可自由重排批内顺序而不搬动永久行
              </span>
            </motion.div>
            <motion.div
              className="pi-pipe-box wisp-kit-tone"
              data-tone={stageTriton ? 'done' : 'slate'}
              initial={false}
              animate={{ opacity: stageTriton ? 1 : 0.35, x: stageTriton ? 0 : -4 }}
              transition={MORPH_SPRING}
            >
              <div className="pi-pipe-box__title">2. Triton 并行组装元数据与采样</div>
              <span className="pi-pipe-box__desc">
                prepare_pos_seq_lens 与 compute_slot_mappings 算子并行落槽，并由 Gumbel-max 直接采样
              </span>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
