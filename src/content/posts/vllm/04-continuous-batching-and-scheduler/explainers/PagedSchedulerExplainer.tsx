import { useMemo } from 'react';
import { Stage, toneFill, toneStroke, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, RADIUS_SM } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import { MetricRow, SectionBox, type MetricItem } from '@/explainers/kit/MetricRow';
import {
  PointerArcs,
  SlotStrip,
  type PointerArc,
  type SlotItem,
} from '@/explainers/kit/PointerBoard';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import { MORPH_SPRING, STAGE_W, assertMaxHues } from '@/explainers/kit/motion';

export type ReqStatus = 'waiting' | 'running' | 'preempted' | 'pad';

export interface SchedulerReq {
  id: string;
  label: string;
  phase: string;
  status: ReqStatus;
  scheduledTokens: number;
  blockIds: number[];
  cacheTag?: string;
}

export interface PagedSchedulerState {
  stepTag: string;
  formulaTex: string;
  tokenBudget: number;
  usedBudget: number;
  freeBlocks: number;
  sharedPrefixHits: number;
  blocks: SlotItem[];
  reqs: SchedulerReq[];
  focusArea: 'prefix' | 'hit' | 'preempt' | 'null';
  focusLabel: string;
  focusBadge: string;
}

const BLK_COUNT = 16;

function makePool(overrides: Record<number, Partial<SlotItem>>): SlotItem[] {
  const base: SlotItem[] = Array.from({ length: BLK_COUNT }, (_, idx) => ({
    id: `blk-${idx}`,
    label: `$B_{${idx}}$`,
    sub: idx === 0 ? 'null' : 'free',
    topTag: idx === 0 ? 'RSV' : undefined,
    tone: idx === 0 ? 'mask' : 'neutral',
    status: idx === 0 ? 'masked' : 'empty',
  }));
  for (const [k, patch] of Object.entries(overrides)) {
    const idx = Number(k);
    base[idx] = { ...base[idx], ...patch };
  }
  return base;
}

export function buildPagedSchedulerSteps(): Step<PagedSchedulerState>[] {
  const steps: Step<PagedSchedulerState>[] = [
    {
      label: '前缀入池映射',
      duration: 4800,
      state: {
        stepTag: 'Prefill + Cache',
        formulaTex:
          '$B_0 = \\text{null\\_block},\\; \\text{Prefill}_A = 9\\text{ tok} \\Rightarrow B_1(\\text{0x9a}) + B_2 + B_3$',
        tokenBudget: 16,
        usedBudget: 9,
        freeBlocks: 12,
        sharedPrefixHits: 0,
        blocks: makePool({
          1: { sub: '0x9a·r1', topTag: 'SYS', tone: 'highlight', status: 'selected' },
          2: { sub: 'A[4..7]', tone: 'active', status: 'active' },
          3: { sub: 'A[8]', tone: 'active', status: 'active' },
        }),
        reqs: [
          {
            id: 'req-a',
            label: 'Req A',
            phase: 'Prefill 9',
            status: 'running',
            scheduledTokens: 9,
            blockIds: [1, 2, 3],
            cacheTag: 'hash 0x9a',
          },
          {
            id: 'req-b',
            label: 'Req B',
            phase: 'Queued',
            status: 'waiting',
            scheduledTokens: 0,
            blockIds: [],
          },
          {
            id: 'req-c',
            label: 'Req C',
            phase: 'Queued',
            status: 'waiting',
            scheduledTokens: 0,
            blockIds: [],
          },
        ],
        focusArea: 'prefix',
        focusLabel: '$B_0$ 保留为 null_block；Req A 写入系统前缀 $B_1$ (hash=0x9a, ref=1)',
        focusBadge: 'Prefix 登记 B1',
      },
      caption:
        '第 1 步（前缀入池映射）：16 块物理池保留 $B_0$ 为安全哨兵 null_block；Req A 完成 9 token 预填充，占用 $B_1\\text{–}B_3$ 并将满块 $B_1$ 按前缀哈希 0x9a 登记进 Prefix Cache（ref=1）。',
      focus: ['blk-1', 'blk-2', 'blk-3'],
    },
    {
      label: 'Prefix 共享命中',
      duration: 4800,
      state: {
        stepTag: 'Prefix Hit',
        formulaTex:
          '$\\text{hash}_B(0\\text{–}3)=\\text{0x9a} \\Rightarrow \\text{ref}(B_1): 1\\to 2$',
        tokenBudget: 16,
        usedBudget: 3,
        freeBlocks: 11,
        sharedPrefixHits: 1,
        blocks: makePool({
          1: { sub: '0x9a·r2', topTag: 'HIT', tone: 'highlight', status: 'selected' },
          2: { sub: 'A[4..7]', tone: 'active', status: 'active' },
          3: { sub: 'A[8..9]', tone: 'active', status: 'active' },
          4: { sub: 'B[4..5]', tone: 'active', status: 'active' },
        }),
        reqs: [
          {
            id: 'req-a',
            label: 'Req A',
            phase: 'Decode +1',
            status: 'running',
            scheduledTokens: 1,
            blockIds: [1, 2, 3],
          },
          {
            id: 'req-b',
            label: 'Req B',
            phase: '4 hit+2 new',
            status: 'running',
            scheduledTokens: 2,
            blockIds: [1, 4],
            cacheTag: 'hit B1',
          },
          {
            id: 'req-c',
            label: 'Req C',
            phase: 'Queued',
            status: 'waiting',
            scheduledTokens: 0,
            blockIds: [],
          },
        ],
        focusArea: 'hit',
        focusLabel: 'Req B 命中共享前缀 $B_1$ (ref=2)，零重复计算并仅新配 $B_4$',
        focusBadge: '共享复用 ref=2',
      },
      caption:
        '第 2 步（Prefix 共享命中）：Req B 共享相同系统提示，KVCacheManager 直接将页表指向 $B_1$（ref=2）跳过预填充，仅从空闲队列分配 $B_4$ 写入后 2 个新 token。',
      focus: ['blk-1', 'blk-4'],
    },
    {
      label: '混批打满与抢占',
      duration: 4800,
      state: {
        stepTag: 'Mix + Preempt',
        formulaTex:
          '$\\sum \\text{sched} = 1_A + 1_B + 14_C = 16 \\;\\xrightarrow{|\\text{free}|=0}\\; \\text{Evict(Req C)} \\Rightarrow +4\\text{ free}$',
        tokenBudget: 16,
        usedBudget: 16,
        freeBlocks: 4,
        sharedPrefixHits: 1,
        blocks: makePool({
          1: { sub: '0x9a·r2', topTag: 'HIT', tone: 'highlight', status: 'selected' },
          2: { sub: 'A[4..7]', tone: 'active', status: 'active' },
          3: { sub: 'A[8..11]', tone: 'active', status: 'active' },
          4: { sub: 'B[4..7]', tone: 'active', status: 'active' },
          5: { sub: 'evict', topTag: 'FREE', tone: 'error', status: 'error' },
          6: { sub: 'evict', topTag: 'FREE', tone: 'error', status: 'error' },
          7: { sub: 'evict', topTag: 'FREE', tone: 'error', status: 'error' },
          8: { sub: 'evict', topTag: 'FREE', tone: 'error', status: 'error' },
          9: { sub: 'D[0..3]', tone: 'neutral', status: 'normal' },
          10: { sub: 'D[4..7]', tone: 'neutral', status: 'normal' },
          11: { sub: 'D[8..11]', tone: 'neutral', status: 'normal' },
          12: { sub: 'D12-15', tone: 'neutral', status: 'normal' },
          13: { sub: 'E[0..3]', tone: 'neutral', status: 'normal' },
          14: { sub: 'E[4..7]', tone: 'neutral', status: 'normal' },
          15: { sub: 'E[8..11]', tone: 'neutral', status: 'normal' },
        }),
        reqs: [
          {
            id: 'req-a',
            label: 'Req A',
            phase: 'Decode +1',
            status: 'running',
            scheduledTokens: 1,
            blockIds: [1, 2, 3],
          },
          {
            id: 'req-b',
            label: 'Req B',
            phase: 'Decode +1',
            status: 'running',
            scheduledTokens: 1,
            blockIds: [1, 4],
          },
          {
            id: 'req-c',
            label: 'Req C',
            phase: 'PREEMPTED',
            status: 'preempted',
            scheduledTokens: 0,
            blockIds: [],
            cacheTag: 'freed B5..8',
          },
        ],
        focusArea: 'preempt',
        focusLabel: '统一配额打满 $16$ tok 后池枯竭，LIFO 抢占 Req C 回收 $B_5\\text{–}B_8$',
        focusBadge: 'LIFO 驱逐 B5..B8',
      },
      caption:
        '第 3 步（混批打满与抢占）：V1 用 num_scheduled_tokens 将 Decode（A/B 各 +1）与 Chunked Prefill（C +14）混排打满 16 预算；当 $B_9\\text{–}B_{15}$ 耗尽空闲池时，LIFO 抢占驱逐 Req C 并回收 $B_5\\text{–}B_8$。',
      focus: ['blk-5', 'blk-6', 'blk-7', 'blk-8'],
    },
    {
      label: '零号空块防护',
      duration: 4800,
      state: {
        stepTag: 'Null Guard',
        formulaTex: '$\\text{Dummy / PAD} \\to B_0\\;(\\text{slot\\_mapping} = -1)$',
        tokenBudget: 16,
        usedBudget: 3,
        freeBlocks: 3,
        sharedPrefixHits: 1,
        blocks: makePool({
          0: { sub: 'null_blk', topTag: 'SAFE', tone: 'mask', status: 'masked' },
          1: { sub: '0x9a·r2', topTag: 'HIT', tone: 'highlight', status: 'selected' },
          2: { sub: 'A[4..7]', tone: 'active', status: 'active' },
          3: { sub: 'A[8..11]', tone: 'active', status: 'active' },
          4: { sub: 'B[4..7]', tone: 'active', status: 'active' },
          5: { sub: 'A[12]', tone: 'active', status: 'active' },
          9: { sub: 'D[0..3]', tone: 'neutral', status: 'normal' },
          10: { sub: 'D[4..7]', tone: 'neutral', status: 'normal' },
          11: { sub: 'D[8..11]', tone: 'neutral', status: 'normal' },
          12: { sub: 'D12-15', tone: 'neutral', status: 'normal' },
          13: { sub: 'E[0..3]', tone: 'neutral', status: 'normal' },
          14: { sub: 'E[4..7]', tone: 'neutral', status: 'normal' },
          15: { sub: 'E[8..11]', tone: 'neutral', status: 'normal' },
        }),
        reqs: [
          {
            id: 'req-a',
            label: 'Req A',
            phase: 'Decode +1',
            status: 'running',
            scheduledTokens: 1,
            blockIds: [1, 2, 3, 5],
          },
          {
            id: 'req-b',
            label: 'Req B',
            phase: 'Hold KV',
            status: 'running',
            scheduledTokens: 0,
            blockIds: [1, 4],
          },
          {
            id: 'req-c',
            label: 'Pad / Dummy',
            phase: 'slot = -1',
            status: 'pad',
            scheduledTokens: 2,
            blockIds: [0],
            cacheTag: 'PAD_SLOT_ID',
          },
        ],
        focusArea: 'null',
        focusLabel: '占位/被驱逐请求全部指向 $B_0$ (null_block) 并写入 PAD=-1',
        focusBadge: 'PAD_SLOT_ID 安全哨兵',
      },
      caption:
        '第 4 步（零号空块防护）：Req A 申请被释放的 $B_5$ 写入第 13 个 token，同时静态图补齐的 Dummy request 全部指向 $B_0$（null_block）并将 slot_mapping 置为 $-1$，KV 写入算子遇到负槽直接跳过。',
      focus: ['blk-0'],
    },
  ];

  const allTones = steps.flatMap((s) => s.state.blocks.map((b) => b.tone ?? 'neutral'));
  assertMaxHues(allTones, 3);
  return steps;
}

const POOL_X = 24;
const POOL_SLOT_W = 72;
const POOL_GAP = 8;
const POOL_ROW0_Y = 48;
const POOL_ROW1_Y = 264;
const POOL_SLOT_H = 38;

const REQ_BOX_X = 24;
const REQ_BOX_W = 180;
const REQ_BOX_GAP = 44;
const REQ_BOX_Y = 152;
const REQ_BOX_H = 52;

function blkCenterX(blkIdx: number): number {
  const col = blkIdx % 8;
  return POOL_X + col * (POOL_SLOT_W + POOL_GAP) + POOL_SLOT_W / 2;
}

function blkTargetY(blkIdx: number): number {
  return blkIdx < 8 ? POOL_ROW0_Y + POOL_SLOT_H + 4 : POOL_ROW1_Y - 4;
}

function reqCenterX(reqIdx: number): number {
  return REQ_BOX_X + reqIdx * (REQ_BOX_W + REQ_BOX_GAP) + REQ_BOX_W / 2;
}

function focusRect(area: PagedSchedulerState['focusArea']) {
  if (area === 'null') {
    return {
      x: POOL_X - 6,
      y: POOL_ROW0_Y - 14,
      w: POOL_SLOT_W + 12,
      h: POOL_SLOT_H + 20,
      tone: 'mask' as const,
    };
  }
  if (area === 'prefix' || area === 'hit') {
    return {
      x: POOL_X + (POOL_SLOT_W + POOL_GAP) - 6,
      y: POOL_ROW0_Y - 14,
      w: POOL_SLOT_W + 12,
      h: POOL_SLOT_H + 20,
      tone: 'highlight' as const,
    };
  }
  return {
    x: POOL_X + 5 * (POOL_SLOT_W + POOL_GAP) - 6,
    y: POOL_ROW0_Y - 14,
    w: 4 * POOL_SLOT_W + 3 * POOL_GAP + 12,
    h: POOL_SLOT_H + 20,
    tone: 'error' as const,
  };
}

export default function PagedSchedulerExplainer({
  title = '图 2：V1 调度器、Prefix Caching 与抢占交互推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildPagedSchedulerSteps(), []);

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label="vLLM V1 PagedAttention 调度器交互图"
      wide
      stageMinHeight={516}
      getFormula={(step) => step.state.formulaTex}
    >
      {(step, { dotToken }) => {
        const s = step.state;
        const row0Blocks = s.blocks.slice(0, 8).map((blk, i) => {
          const coveredByFrame =
            (i === 0 && s.focusArea === 'null') ||
            (i === 1 && (s.focusArea === 'prefix' || s.focusArea === 'hit')) ||
            (i >= 5 && i <= 8 && s.focusArea === 'preempt');
          return coveredByFrame ? { ...blk, topTag: undefined } : blk;
        });
        const row1Blocks = s.blocks.slice(8, 16);

        const arcs: PointerArc[] = s.reqs.flatMap((req, rIdx) => {
          const baseFromX = reqCenterX(rIdx);
          const total = req.blockIds.length;
          return req.blockIds.map((blkIdx, aIdx) => {
            const isUpper = blkIdx < 8;
            const isShared = blkIdx === 1;
            const isNull = blkIdx === 0;
            const spread = total > 1 ? (aIdx - (total - 1) / 2) * 24 : 0;
            const fromY = isUpper ? REQ_BOX_Y - 2 : REQ_BOX_Y + REQ_BOX_H + 2;
            const arcOffset = !isUpper
              ? 12
              : isNull
                ? -24
                : rIdx === 0
                  ? aIdx === 0
                    ? -12
                    : 8 * aIdx
                  : rIdx === 1
                    ? isShared
                      ? 12
                      : 8
                    : -12 + aIdx * 8;
            return {
              id: `${req.id}-b${blkIdx}`,
              fromX: baseFromX + spread,
              fromY,
              toX: blkCenterX(blkIdx),
              toY: blkTargetY(blkIdx),
              tone: isNull ? 'mask' : isShared ? 'highlight' : rIdx === 2 ? 'highlight' : 'active',
              active: req.status === 'running' || req.status === 'pad',
              dashed: isNull || isShared,
              flow: req.status === 'running' || req.status === 'pad',
              visible: true,
              draw: true,
              arcOffset,
              label: isNull ? 'slot=-1' : isShared && rIdx === 1 ? 'shared' : undefined,
            };
          });
        });

        const metrics: MetricItem[] = [
          {
            label: 'token 预算占用',
            value: `${s.usedBudget} / ${s.tokenBudget}`,
            tone: s.usedBudget === s.tokenBudget ? 'highlight' : 'active',
            active: true,
          },
          {
            label: '空闲物理块 (15 可用)',
            value: `${s.freeBlocks} blocks`,
            tone: s.freeBlocks <= 4 ? 'error' : 'neutral',
            active: s.freeBlocks <= 4,
          },
          {
            label: 'Prefix Cache 命中',
            value: `${s.sharedPrefixHits} block`,
            tone: s.sharedPrefixHits > 0 ? 'highlight' : 'neutral',
            active: s.sharedPrefixHits > 0,
          },
          {
            label: '当前阶段',
            value: s.stepTag,
            tone: s.focusArea === 'preempt' ? 'error' : 'active',
          },
        ];

        const frame = focusRect(s.focusArea);
        const budgetTrackW = STAGE_W - 24;
        const usedW = Math.round((s.usedBudget / s.tokenBudget) * (budgetTrackW - 4));

        return (
          <Stage width={STAGE_W} height={422} label="V1 Scheduler 与 BlockPool 映射视图">
            {/* 上半区：B0..B7 物理块池 */}
            <SectionBox
              x={12}
              y={8}
              w={STAGE_W - 24}
              h={86}
              title={
                'Physical KV Block Pool · 上半区 B0–B7 (4 tok/块，$B_0 = \\text{null\\_block}$)'
              }
              tone="neutral"
              dashed
            />
            <SlotStrip
              x={POOL_X}
              y={POOL_ROW0_Y}
              slots={row0Blocks}
              slotW={POOL_SLOT_W}
              slotH={POOL_SLOT_H}
              gap={POOL_GAP}
              fontSize={10.5}
            />
            <ActiveFocusFrame
              x={frame.x}
              y={frame.y}
              w={frame.w}
              h={frame.h}
              tone={frame.tone}
              label={s.focusBadge}
              visible={true}
              dashed={s.focusArea === 'null'}
            />

            {/* 中间区：Request Block Tables */}
            <SectionBox
              x={12}
              y={144}
              w={STAGE_W - 24}
              h={68}
              tone={s.focusArea === 'preempt' ? 'error' : 'neutral'}
              dashed
            />
            {s.reqs.map((req, idx) => {
              const rx = REQ_BOX_X + idx * (REQ_BOX_W + REQ_BOX_GAP);
              const boxTone =
                req.status === 'preempted'
                  ? 'error'
                  : req.status === 'running'
                    ? idx === 2
                      ? 'highlight'
                      : 'active'
                    : req.status === 'pad'
                      ? 'mask'
                      : 'neutral';
              const boxSlots: SlotItem[] = [
                {
                  id: `${req.id}-slot`,
                  label: `${req.label} (${req.phase})`,
                  sub: req.cacheTag ?? `sched=${req.scheduledTokens} tok`,
                  tone: boxTone,
                  status:
                    req.status === 'preempted'
                      ? 'error'
                      : req.status === 'running'
                        ? 'active'
                        : req.status === 'pad'
                          ? 'masked'
                          : 'empty',
                },
              ];
              return (
                <SlotStrip
                  key={req.id}
                  x={rx}
                  y={REQ_BOX_Y}
                  slots={boxSlots}
                  slotW={REQ_BOX_W}
                  slotH={REQ_BOX_H}
                  gap={0}
                  fontSize={11}
                />
              );
            })}

            {/* 下半区：B8..B15 物理块池 */}
            <SectionBox x={12} y={254} w={STAGE_W - 24} h={56} tone="neutral" dashed />
            <SlotStrip
              x={POOL_X}
              y={POOL_ROW1_Y}
              slots={row1Blocks}
              slotW={POOL_SLOT_W}
              slotH={POOL_SLOT_H}
              gap={POOL_GAP}
              fontSize={10.5}
            />

            {/* 页表映射弧线 */}
            <PointerArcs arcs={arcs} dotToken={dotToken} />

            {/* 动态 token_budget 配额条 */}
            <g>
              <SvgRichLabel
                x={14}
                y={324}
                width={STAGE_W - 28}
                anchor="start"
                fontSize={10.5}
                color="var(--wisp-muted)"
                text={`Request Block Tables · ${s.focusLabel}`}
              />
              <rect
                x={12}
                y={336}
                width={budgetTrackW}
                height={20}
                rx={RADIUS_SM}
                fill="var(--wisp-surface)"
                stroke="var(--wisp-border)"
              />
              <motion.rect
                initial={false}
                animate={{ width: Math.max(0, usedW) }}
                transition={MORPH_SPRING}
                x={14}
                y={338}
                height={16}
                rx={RADIUS_SM}
                fill={
                  s.usedBudget === s.tokenBudget
                    ? toneFill('highlight')
                    : s.focusArea === 'preempt'
                      ? toneFill('error')
                      : toneFill('active')
                }
                stroke={
                  s.usedBudget === s.tokenBudget
                    ? toneStroke('highlight')
                    : s.focusArea === 'preempt'
                      ? toneStroke('error')
                      : toneStroke('active')
                }
              />
              <text
                x={STAGE_W / 2}
                y={349.5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fontFamily="var(--wisp-font-mono)"
                fill="var(--wisp-fg)"
              >
                {`token_budget 占用：${s.usedBudget} / ${s.tokenBudget} tok`}
              </text>
            </g>

            <MetricRow x={12} y={368} w={STAGE_W - 24} h={42} metrics={metrics} />
          </Stage>
        );
      }}
    </BeatExplainer>
  );
}
