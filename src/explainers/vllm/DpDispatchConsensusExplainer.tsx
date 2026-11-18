import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';

import {
  MetricRow,
  SectionBox,
  SlotStrip,
  STAGE_W,
  SwimlaneTimeline,
  assertMaxHues,
  type MetricItem,
  type SlotItem,
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit';

export interface DpDispatchConsensusState {
  stepTag: string;
  rank0Summary: string;
  rank1Summary: string;
  agreedMode: string;
  agreedTokens: string;
  collectiveRisk: string;
  rankSlots: SlotItem[];
  lanes: TimelineLane[];
  syncEvents: TimelineSyncEvent[];
  playhead: number;
}

export function buildDpDispatchConsensusSteps(): Step<DpDispatchConsensusState>[] {
  const steps: Step<DpDispatchConsensusState>[] = [
    {
      state: {
        stepTag: '1. Local Votes Diverge',
        rank0Summary: '4 tok -> FULL(2)',
        rank1Summary: '19 tok -> PIECEWISE(1)',
        agreedMode: 'Pending',
        agreedTokens: '4 vs 19',
        collectiveRisk: '模式分歧',
        rankSlots: [
          {
            id: 'r0',
            label: 'Rank 0',
            sub: '4 tok (Decode)',
            topTag: 'FULL=2',
            tone: 'done',
            status: 'active',
          },
          {
            id: 'r1',
            label: 'Rank 1',
            sub: '19 tok (Prefill)',
            topTag: 'PW=1',
            tone: 'highlight',
            status: 'active',
          },
          {
            id: 'sync',
            label: 'cpu_all_reduce',
            sub: '待聚合',
            topTag: 'SYNC',
            tone: 'neutral',
            status: 'empty',
          },
        ],
        lanes: [
          {
            title: 'DP Rank 0',
            subtitle: 'Decode x4',
            blocks: [
              { start: 0.0, dur: 1.4, label: '本地候选: FULL (B=4)', tone: 'done', active: true },
            ],
          },
          {
            title: 'DP Host Sync',
            subtitle: '未触发',
            blocks: [{ start: 0.0, dur: 1.4, label: '各自本地决策', tone: 'mask', kind: 'bubble' }],
          },
          {
            title: 'DP Rank 1',
            subtitle: 'Chunked x19',
            blocks: [
              {
                start: 0.0,
                dur: 1.4,
                label: '本地候选: PIECEWISE (T=20)',
                tone: 'highlight',
                active: true,
              },
            ],
          },
        ],
        syncEvents: [],
        playhead: 1.4,
      },
      caption:
        '第 1 步（本地批负载分化）：在 MoE Data Parallel 场景下，Rank 0 仅有 4 个纯 Decode token（投票 FULL=2），而 Rank 1 夹杂 19 个 Chunked Prefill token（投票 PIECEWISE=1）。',
      focus: ['r0', 'r1'],
    },
    {
      state: {
        stepTag: '2. Uncoordinated Deadlock',
        rank0Summary: 'FULL(B=4)',
        rank1Summary: 'PIECEWISE(T=20)',
        agreedMode: 'MISMATCH',
        agreedTokens: '4 ≠ 20',
        collectiveRisk: 'NCCL/HCCL 死锁',
        rankSlots: [
          {
            id: 'r0',
            label: 'Rank 0',
            sub: '发 (4, H)',
            topTag: 'FULL',
            tone: 'done',
            status: 'active',
          },
          {
            id: 'r1',
            label: 'Rank 1',
            sub: '发 (20, H)',
            topTag: 'PW',
            tone: 'error',
            status: 'error',
          },
          {
            id: 'sync',
            label: 'EP All2All',
            sub: '张量形状冲突',
            topTag: 'HANG',
            tone: 'error',
            status: 'error',
          },
        ],
        lanes: [
          {
            title: 'DP Rank 0',
            subtitle: 'FULL Graph(4)',
            blocks: [
              { start: 0.0, dur: 1.2, label: 'Attn (FULL)', tone: 'done' },
              {
                start: 1.2,
                dur: 2.8,
                label: 'All2All 4 vs 20 -> 通信挂死',
                tone: 'error',
                kind: 'error',
                active: true,
              },
            ],
          },
          {
            title: 'DP Host Sync',
            subtitle: '缺失协商',
            blocks: [
              { start: 1.2, dur: 2.8, label: '集合通信形状错位', tone: 'error', kind: 'error' },
            ],
          },
          {
            title: 'DP Rank 1',
            subtitle: 'PIECEWISE(20)',
            blocks: [
              { start: 0.0, dur: 1.8, label: 'Eager Attn + PW', tone: 'highlight' },
              {
                start: 1.8,
                dur: 2.2,
                label: 'All2All (20) 死锁',
                tone: 'error',
                kind: 'error',
                active: true,
              },
            ],
          },
        ],
        syncEvents: [
          {
            fromLane: 0,
            at: 1.2,
            toLane: 2,
            toAt: 1.8,
            label: 'mismatch',
            tone: 'error',
            active: true,
          },
        ],
        playhead: 2.4,
      },
      caption:
        '第 2 步（若不对齐的死锁后果）：Rank 0 走 FULL 图（4 token）率先进入 MoE EP All-to-All，而 Rank 1 还在 PIECEWISE 路径执行（20 token），集合通信长度错配直接引发死锁或看门狗超时。',
      focus: ['sync'],
    },
    {
      state: {
        stepTag: '3. cpu_all_reduce_ Pack',
        rank0Summary: '[4, 2, 1]',
        rank1Summary: '[19, 1, 0]',
        agreedMode: 'AllReducing',
        agreedTokens: 'pack 7 fields',
        collectiveRisk: 'Host 零设备流阻塞',
        rankSlots: [
          {
            id: 'r0',
            label: 'Rank 0 Tensor',
            sub: 'tok=4, mode=2',
            topTag: 'HOST',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'r1',
            label: 'Rank 1 Tensor',
            sub: 'tok=19, mode=1',
            topTag: 'HOST',
            tone: 'highlight',
            status: 'selected',
          },
          {
            id: 'sync',
            label: 'cpu_all_reduce_',
            sub: '全网交换 7 元组',
            topTag: 'AR',
            tone: 'highlight',
            status: 'active',
          },
        ],
        lanes: [
          {
            title: 'DP Rank 0',
            subtitle: 'CPU Pack',
            blocks: [
              { start: 0.0, dur: 0.9, label: '填 col 0: [4, FULL]', tone: 'done', active: true },
            ],
          },
          {
            title: 'DP Host Sync',
            subtitle: 'cpu_all_reduce_',
            blocks: [
              {
                start: 0.9,
                dur: 2.0,
                label: 'get_dp_group().cpu_all_reduce_',
                tone: 'highlight',
                active: true,
              },
            ],
          },
          {
            title: 'DP Rank 1',
            subtitle: 'CPU Pack',
            blocks: [
              {
                start: 0.0,
                dur: 0.9,
                label: '填 col 1: [19, PW]',
                tone: 'highlight',
                active: true,
              },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 0.9, toLane: 1, label: 'pack', tone: 'done' },
          { fromLane: 2, at: 0.9, toLane: 1, label: 'pack', tone: 'highlight' },
        ],
        playhead: 2.9,
      },
      caption:
        '第 3 步（dispatch_cg_and_sync_dp 协同）：各卡先在 CPU 侧把 num_tokens、cg_mode 等 7 个字段写入矩阵，调用 cpu_all_reduce_ 完成跨卡状态汇聚，不打断设备计算流。',
      focus: ['sync'],
    },
    {
      state: {
        stepTag: '4. Min Mode & Max Tokens',
        rank0Summary: 'min=PIECEWISE(1)',
        rank1Summary: 'max=19 -> bucket 20',
        agreedMode: 'PW(1)',
        agreedTokens: 'T=20 桶',
        collectiveRisk: '安全对齐',
        rankSlots: [
          {
            id: 'r0',
            label: 'synced_cg_mode',
            sub: 'min(2, 1) = 1',
            topTag: 'PW',
            tone: 'highlight',
            status: 'selected',
          },
          {
            id: 'r1',
            label: 'synced_tokens',
            sub: 'max(4, 19) -> 20',
            topTag: 'PAD',
            tone: 'highlight',
            status: 'selected',
          },
          {
            id: 'sync',
            label: 'uniform_qlen',
            sub: '分歧置 None',
            topTag: 'SAFE',
            tone: 'done',
            status: 'selected',
          },
        ],
        lanes: [
          {
            title: 'DP Rank 0',
            subtitle: 'Pad 4 -> 20',
            blocks: [
              { start: 0.0, dur: 0.8, label: 'Pack', tone: 'done' },
              { start: 2.5, dur: 1.3, label: '统一派发 PW(20)', tone: 'highlight', active: true },
            ],
          },
          {
            title: 'DP Host Sync',
            subtitle: 'Min/Max 判决',
            blocks: [
              {
                start: 0.8,
                dur: 1.7,
                label: 'min(mode)=PW, max(tok)=20',
                tone: 'highlight',
                active: true,
              },
            ],
          },
          {
            title: 'DP Rank 1',
            subtitle: 'Pad 19 -> 20',
            blocks: [
              { start: 0.0, dur: 0.8, label: 'Pack', tone: 'highlight' },
              { start: 2.5, dur: 1.3, label: '统一派发 PW(20)', tone: 'highlight', active: true },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 2.5, toLane: 0, label: 'PW(20)', tone: 'highlight', active: true },
          { fromLane: 1, at: 2.5, toLane: 2, label: 'PW(20)', tone: 'highlight', active: true },
        ],
        playhead: 3.8,
      },
      caption:
        '第 4 步（保守降级与统一垫齐）：所有 Rank 对 cg_mode 取最小枚举 $\\min(2, 1) = \\text{PIECEWISE}$，对 num_tokens 取最大值 $\\max(4, 19) = 19$ 并统一查表入桶为 20。',
      focus: ['r0', 'r1'],
    },
    {
      state: {
        stepTag: '5. Symmetric Dispatch & EP',
        rank0Summary: 'PW(20) 跳过 FULL',
        rank1Summary: 'PW(20) 跳过 FULL',
        agreedMode: 'PW(1)',
        agreedTokens: '(20, H) 对齐',
        collectiveRisk: '零死锁',
        rankSlots: [
          {
            id: 'r0',
            label: 'Rank 0',
            sub: 'PW(20) + Eager Attn',
            topTag: 'OK',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'r1',
            label: 'Rank 1',
            sub: 'PW(20) + Eager Attn',
            topTag: 'OK',
            tone: 'done',
            status: 'selected',
          },
          {
            id: 'sync',
            label: 'MoE All2All',
            sub: '双向 shape (20, H)',
            topTag: 'PASS',
            tone: 'done',
            status: 'selected',
          },
        ],
        lanes: [
          {
            title: 'DP Rank 0',
            subtitle: 'Nested Dispatch',
            blocks: [
              { start: 0.0, dur: 1.1, label: 'Attn Eager (pad)', tone: 'highlight' },
              { start: 1.1, dur: 1.3, label: 'CUDAGraph(PW)', tone: 'done', active: true },
              { start: 2.6, dur: 1.3, label: 'EP All2All (20,H)', tone: 'done', active: true },
            ],
          },
          {
            title: 'DP Host Sync',
            subtitle: 'Aligned',
            blocks: [
              {
                start: 0.0,
                dur: 2.0,
                label: '共识锁定: PW · (20, H)',
                tone: 'done',
                dashed: true,
              },
              {
                start: 3.0,
                dur: 0.9,
                label: '对齐零死锁',
                tone: 'done',
                active: true,
              },
            ],
          },
          {
            title: 'DP Rank 1',
            subtitle: 'Nested Dispatch',
            blocks: [
              { start: 0.0, dur: 1.1, label: 'Attn Eager (real)', tone: 'highlight' },
              { start: 1.1, dur: 1.3, label: 'CUDAGraph(PW)', tone: 'done', active: true },
              { start: 2.6, dur: 1.3, label: 'EP All2All (20,H)', tone: 'done', active: true },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 2.5, toLane: 2, label: 'sync (20,H)', tone: 'done', active: true },
        ],
        playhead: 3.9,
      },
      caption:
        '第 5 步（对齐执行）：Rank 0 虽是 Decode 却遵从共识跳过 FULL 外壳，只命中内层 CUDAGraphWrapper(PIECEWISE)；两卡以相同 (20, H) 形态并发完成 MoE 通信。',
      focus: ['sync'],
    },
  ];

  const allTones = steps.flatMap((s) => [
    ...s.state.rankSlots.map((sl) => sl.tone ?? 'neutral'),
    ...s.state.lanes.flatMap((l) => l.blocks.map((b) => b.tone)),
  ]);
  assertMaxHues(allTones, 3);
  return steps;
}

export default function DpDispatchConsensusExplainer({
  title = '图 1：多卡 DP 运行时模式对齐与防死锁共识推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildDpDispatchConsensusSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="DP 跨卡图模式对齐推演" wide>
      {(step) => {
        const s = step.state;
        const metrics: MetricItem[] = [
          {
            label: 'Rank 0 本地',
            value: s.rank0Summary,
            tone: 'done',
          },
          {
            label: 'Rank 1 本地',
            value: s.rank1Summary,
            tone: 'highlight',
          },
          {
            label: '最终协商对齐',
            value: `${s.agreedMode} · ${s.agreedTokens}`,
            tone: s.agreedMode === 'MISMATCH' ? 'error' : 'done',
            active: true,
          },
          {
            label: '通信风险评估',
            value: s.collectiveRisk,
            tone: s.collectiveRisk.includes('死锁') ? 'error' : 'done',
          },
        ];

        return (
          <Stage width={STAGE_W} height={412} label="DP 运行时共识时序与状态面板">
            <SectionBox
              x={12}
              y={12}
              w={STAGE_W - 24}
              h={118}
              title={`DP Consensus State · ${s.stepTag}`}
              tone={s.collectiveRisk.includes('死锁') ? 'error' : 'neutral'}
              dashed
            />
            <SlotStrip
              x={94}
              y={68}
              slots={s.rankSlots}
              slotW={150}
              slotH={44}
              gap={20}
              fontSize={11}
            />

            <SwimlaneTimeline
              x={16}
              y={144}
              w={STAGE_W - 32}
              totalTime={4.0}
              unit="ms"
              ticks={[0, 1, 2, 3, 4]}
              lanes={s.lanes}
              syncEvents={s.syncEvents}
              laneH={34}
              laneGap={20}
              gutterW={118}
              playhead={s.playhead}
              title="跨卡 DP 运行时模式与 MoE All-to-All 对齐视图"
            />

            <MetricRow x={12} y={354} w={STAGE_W - 24} h={42} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
