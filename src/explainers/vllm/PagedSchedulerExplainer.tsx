import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';

import {
  ActiveFocusFrame,
  MetricRow,
  PointerArcs,
  SectionBox,
  SlotStrip,
  STAGE_W,
  assertMaxHues,
  type MetricItem,
  type PointerArc,
  type SlotItem,
} from '@/explainers/kit';

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
  tokenBudget: number;
  usedBudget: number;
  freeBlocks: number;
  sharedPrefixHits: number;
  blocks: SlotItem[];
  reqs: SchedulerReq[];
  focusArea: 'pool' | 'prefix' | 'mixed' | 'preempt' | 'null';
  focusLabel: string;
}

const BLK_COUNT = 16;

function makePool(overrides: Record<number, Partial<SlotItem>>): SlotItem[] {
  const base: SlotItem[] = Array.from({ length: BLK_COUNT }, (_, idx) => ({
    id: `blk-${idx}`,
    label: idx === 0 ? 'B0' : `B${idx}`,
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
      state: {
        stepTag: 'Init',
        tokenBudget: 16,
        usedBudget: 0,
        freeBlocks: 15,
        sharedPrefixHits: 0,
        blocks: makePool({}),
        reqs: [
          {
            id: 'req-a',
            label: 'Req A',
            phase: 'Idle',
            status: 'waiting',
            scheduledTokens: 0,
            blockIds: [],
          },
          {
            id: 'req-b',
            label: 'Req B',
            phase: 'Idle',
            status: 'waiting',
            scheduledTokens: 0,
            blockIds: [],
          },
          {
            id: 'req-c',
            label: 'Req C',
            phase: 'Idle',
            status: 'waiting',
            scheduledTokens: 0,
            blockIds: [],
          },
        ],
        focusArea: 'pool',
        focusLabel: 'BlockPool 初始化：B0 保留为 null_block，可用 15 块',
      },
      caption:
        '第 1 步：BlockPool 初始化 16 块（$B_0\\text{–}B_{15}$）时先弹出 $B_0$ 作为永久保留的 null_block，其余 15 个物理块按 FIFO 进入 free_block_queue。',
      focus: ['blk-0'],
    },
    {
      state: {
        stepTag: 'Prefill + Cache',
        tokenBudget: 16,
        usedBudget: 12,
        freeBlocks: 12,
        sharedPrefixHits: 0,
        blocks: makePool({
          1: { sub: '0x9a:r1', topTag: 'SYS', tone: 'highlight', status: 'selected' },
          2: { sub: 'A[4..7]', tone: 'active', status: 'active' },
          3: { sub: 'A[8..11]', tone: 'active', status: 'active' },
        }),
        reqs: [
          {
            id: 'req-a',
            label: 'Req A',
            phase: 'Prefill 12 tok',
            status: 'running',
            scheduledTokens: 12,
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
        focusLabel: 'Req A 写入系统前缀 B1（hash=0x9a, ref_cnt=1）',
      },
      caption:
        '第 2 步：Req A 完成 12 token Prefill（每块 4 token），消耗 $B_1\\text{–}B_3$；其中满块 $B_1$ 按前缀哈希 0x9a 登记进 Prefix Cache（ref_cnt=1）。',
      focus: ['blk-1', 'blk-2', 'blk-3'],
    },
    {
      state: {
        stepTag: 'Prefix Hit',
        tokenBudget: 16,
        usedBudget: 5,
        freeBlocks: 11,
        sharedPrefixHits: 1,
        blocks: makePool({
          1: { sub: '0x9a:r2', topTag: 'HIT', tone: 'highlight', status: 'selected' },
          2: { sub: 'A[4..7]', tone: 'active', status: 'active' },
          3: { sub: 'A[8..12]', tone: 'active', status: 'active' },
          4: { sub: 'B[4..7]', tone: 'active', status: 'active' },
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
            phase: '4 hit + 4 new',
            status: 'running',
            scheduledTokens: 4,
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
        focusArea: 'prefix',
        focusLabel: 'Req B 命中共享前缀 B1（ref_cnt=2），零重复计算与写入',
      },
      caption:
        '第 3 步：Req B 共享相同系统提示，KVCacheManager 直接复指 $B_1$（ref_cnt=2）并跳过其 Prefill，仅需分配 $B_4$ 写入后 4 个新 token。',
      focus: ['blk-1', 'blk-4'],
    },
    {
      state: {
        stepTag: 'Unified Batch',
        tokenBudget: 16,
        usedBudget: 16,
        freeBlocks: 7,
        sharedPrefixHits: 1,
        blocks: makePool({
          1: { sub: '0x9a:r2', topTag: 'HIT', tone: 'highlight', status: 'selected' },
          2: { sub: 'A[4..7]', tone: 'active', status: 'active' },
          3: { sub: 'A[8..13]', tone: 'active', status: 'active' },
          4: { sub: 'B[4..8]', tone: 'active', status: 'active' },
          5: { sub: 'C[0..3]', tone: 'highlight', status: 'active' },
          6: { sub: 'C[4..7]', tone: 'highlight', status: 'active' },
          7: { sub: 'C[8..11]', tone: 'highlight', status: 'active' },
          8: { sub: 'C[12..13]', tone: 'highlight', status: 'active' },
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
            phase: 'Chunk +14',
            status: 'running',
            scheduledTokens: 14,
            blockIds: [5, 6, 7, 8],
          },
        ],
        focusArea: 'mixed',
        focusLabel: 'V1 无阶段墙：同一步配额内混排 Decode (+1/+1) 与 Chunked Prefill (+14)',
      },
      caption:
        '第 4 步：V1 消除 Prefill/Decode 阶段墙，用统一字典 num_scheduled_tokens 将 Req A（1）、Req B（1）和 Req C 切片（14）打满 16 token 预算。',
      focus: ['blk-5', 'blk-6', 'blk-7', 'blk-8'],
    },
    {
      state: {
        stepTag: 'Preemption',
        tokenBudget: 16,
        usedBudget: 2,
        freeBlocks: 4,
        sharedPrefixHits: 1,
        blocks: makePool({
          1: { sub: '0x9a:r2', topTag: 'HIT', tone: 'highlight', status: 'selected' },
          2: { sub: 'A[4..7]', tone: 'active', status: 'active' },
          3: { sub: 'A[8..14]', tone: 'active', status: 'active' },
          4: { sub: 'B[4..9]', tone: 'active', status: 'active' },
          5: { sub: 'evict', topTag: 'FREE', tone: 'error', status: 'error' },
          6: { sub: 'evict', topTag: 'FREE', tone: 'error', status: 'error' },
          7: { sub: 'evict', topTag: 'FREE', tone: 'error', status: 'error' },
          8: { sub: 'evict', topTag: 'FREE', tone: 'error', status: 'error' },
          9: { sub: 'D[0..3]', tone: 'neutral', status: 'normal' },
          10: { sub: 'D[4..7]', tone: 'neutral', status: 'normal' },
          11: { sub: 'D[8..11]', tone: 'neutral', status: 'normal' },
          12: { sub: 'D[12..15]', tone: 'neutral', status: 'normal' },
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
        focusLabel: '空闲块归零时触发 LIFO 抢占：驱逐 Req C 释放 B5..B8，保住 Req A/B',
      },
      caption:
        '第 5 步：突发请求占满 $B_9\\text{–}B_{15}$ 后，新槽位分配失败；调度器按抢占策略驱逐低优先级的 Req C，回收 $B_5\\text{–}B_8$ 保障 Req A/B 推进。',
      focus: ['blk-5', 'blk-6', 'blk-7', 'blk-8'],
    },
    {
      state: {
        stepTag: 'Null Guard',
        tokenBudget: 16,
        usedBudget: 4,
        freeBlocks: 4,
        sharedPrefixHits: 1,
        blocks: makePool({
          0: { sub: 'null_blk', topTag: 'SAFE', tone: 'mask', status: 'masked' },
          1: { sub: '0x9a:r2', topTag: 'HIT', tone: 'highlight', status: 'selected' },
          2: { sub: 'A[4..7]', tone: 'active', status: 'active' },
          3: { sub: 'A[8..15]', tone: 'active', status: 'active' },
          4: { sub: 'B[4..10]', tone: 'active', status: 'active' },
          9: { sub: 'D[0..3]', tone: 'neutral', status: 'normal' },
          10: { sub: 'D[4..7]', tone: 'neutral', status: 'normal' },
          11: { sub: 'D[8..11]', tone: 'neutral', status: 'normal' },
          12: { sub: 'D[12..15]', tone: 'neutral', status: 'normal' },
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
            label: 'Pad / Dummy',
            phase: 'slot = -1',
            status: 'pad',
            scheduledTokens: 2,
            blockIds: [0],
            cacheTag: 'PAD_SLOT_ID',
          },
        ],
        focusArea: 'null',
        focusLabel: '占位/被驱逐请求指回 B0 (null_block) 并写 PAD_SLOT_ID=-1，防 KV 写穿',
      },
      caption:
        '第 6 步：Graph 补齐的虚请求与空槽全部指向 $B_0$（null_block）并将 slot_mapping 置为 $-1$；GPU/NPU 写入内核检测到负槽位直接跳过。',
      focus: ['blk-0'],
    },
  ];

  const allTones = steps.flatMap((s) => s.state.blocks.map((b) => b.tone ?? 'neutral'));
  assertMaxHues(allTones, 3);
  return steps;
}

const REQ_BOX_X = 24;
const REQ_BOX_W = 180;
const REQ_BOX_GAP = 44;
const REQ_BOX_Y = 270;
const REQ_BOX_H = 72;

const POOL_X = 22;
const POOL_SLOT_W = 36;
const POOL_GAP = 4;
const POOL_Y = 82;
const POOL_SLOT_H = 38;

function blkCenterX(blkIdx: number): number {
  return POOL_X + blkIdx * (POOL_SLOT_W + POOL_GAP) + POOL_SLOT_W / 2;
}

function reqCenterX(reqIdx: number): number {
  return REQ_BOX_X + reqIdx * (REQ_BOX_W + REQ_BOX_GAP) + REQ_BOX_W / 2;
}

function focusRect(area: PagedSchedulerState['focusArea']) {
  if (area === 'pool') {
    return {
      x: POOL_X - 6,
      y: POOL_Y - 26,
      w: POOL_SLOT_W + 12,
      h: POOL_SLOT_H + 34,
      tone: 'mask' as const,
    };
  }
  if (area === 'prefix') {
    return {
      x: POOL_X + POOL_SLOT_W + POOL_GAP - 6,
      y: POOL_Y - 26,
      w: POOL_SLOT_W + 12,
      h: POOL_SLOT_H + 34,
      tone: 'highlight' as const,
    };
  }
  if (area === 'mixed') {
    return {
      x: POOL_X + 5 * (POOL_SLOT_W + POOL_GAP) - 6,
      y: POOL_Y - 26,
      w: 4 * POOL_SLOT_W + 3 * POOL_GAP + 12,
      h: POOL_SLOT_H + 34,
      tone: 'highlight' as const,
    };
  }
  if (area === 'preempt') {
    return {
      x: POOL_X + 5 * (POOL_SLOT_W + POOL_GAP) - 6,
      y: POOL_Y - 26,
      w: 4 * POOL_SLOT_W + 3 * POOL_GAP + 12,
      h: POOL_SLOT_H + 34,
      tone: 'error' as const,
    };
  }
  return {
    x: POOL_X - 6,
    y: POOL_Y - 28,
    w: POOL_SLOT_W + 12,
    h: POOL_SLOT_H + 36,
    tone: 'mask' as const,
  };
}

export default function PagedSchedulerExplainer({
  title = '图 1：V1 调度器、Prefix Caching 与抢占交互推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildPagedSchedulerSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="vLLM V1 PagedAttention 调度器交互图" wide>
      {(step) => {
        const s = step.state;
        const arcs: PointerArc[] = s.reqs.flatMap((req, rIdx) => {
          const fromX = reqCenterX(rIdx);
          const fromY = REQ_BOX_Y - 2;
          return req.blockIds.map((blkIdx) => {
            const isShared = blkIdx === 1;
            const isNull = blkIdx === 0;
            const arcOffset = isNull
              ? -46
              : rIdx === 0
                ? blkIdx === 1
                  ? -16
                  : blkIdx === 2
                    ? 0
                    : 12
                : rIdx === 1
                  ? isShared
                    ? 14
                    : 10
                  : -18;
            return {
              fromX,
              fromY,
              toX: blkCenterX(blkIdx),
              toY: POOL_Y + POOL_SLOT_H + 4,
              tone: isNull ? 'mask' : isShared ? 'highlight' : rIdx === 2 ? 'highlight' : 'active',
              active: req.status === 'running' || req.status === 'pad',
              dashed: isNull || isShared,
              arcOffset,
              label: isNull ? 'slot=-1' : isShared && rIdx === 1 ? 'shared' : undefined,
            };
          });
        });

        const metrics: MetricItem[] = [
          {
            label: 'Token 预算占用',
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

        return (
          <Stage width={STAGE_W} height={410} label="V1 Scheduler 与 BlockPool 映射视图">
            <SectionBox
              x={12}
              y={12}
              w={STAGE_W - 24}
              h={126}
              title="Physical KV Block Pool (16 Blocks, B0 = null_block 保留)"
              tone="neutral"
              dashed
            />

            <SlotStrip
              x={POOL_X}
              y={POOL_Y}
              slots={s.blocks}
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
              label={s.focusArea === 'null' ? 'PAD' : undefined}
              dashed={s.focusArea === 'pool' || s.focusArea === 'null'}
            />

            <PointerArcs arcs={arcs} />

            <SectionBox
              x={12}
              y={222}
              w={STAGE_W - 24}
              h={118}
              title={`Request Block Tables · ${s.focusLabel}`}
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
                  slotH={REQ_BOX_H - 18}
                  gap={0}
                  fontSize={11}
                />
              );
            })}

            <MetricRow x={12} y={354} w={STAGE_W - 24} h={42} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
