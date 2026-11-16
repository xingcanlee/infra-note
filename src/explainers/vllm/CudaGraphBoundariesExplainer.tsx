import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';

import {
  ActiveFocusFrame,
  DataFlowArrow,
  MetricRow,
  PointerArcs,
  SectionBox,
  SlotStrip,
  STAGE_W,
  TensorBlock,
  assertMaxHues,
  type MetricItem,
  type PointerArc,
  type SlotItem,
} from '@/explainers/kit';

export interface CudaGraphBoundariesState {
  stepTag: string;
  batchDesc: string;
  inputPtr: string;
  shapeCheck: string;
  streamStatus: string;
  slots: SlotItem[];
  bufInPtr: string;
  bufInTone: 'active' | 'highlight' | 'error';
  bufSlotTone: 'active' | 'highlight' | 'error';
  bufOutTone: 'active' | 'highlight' | 'error';
  streamNote: string;
  stalePointerBug: boolean;
  shapeOverflow: boolean;
  unjoinedStream: boolean;
}

export function buildCudaGraphBoundariesSteps(): Step<CudaGraphBoundariesState>[] {
  const steps: Step<CudaGraphBoundariesState>[] = [
    {
      state: {
        stepTag: '1. Capture (B_cap=4)',
        batchDesc: 'FULL, num_tokens=4',
        inputPtr: '0x7f00_1000',
        shapeCheck: 'PASS (4 == B_cap)',
        streamStatus: 'Joined · Pool OK',
        slots: [
          { id: 's-0', label: 'req0', sub: 'tok 0', tone: 'active', status: 'active' },
          { id: 's-1', label: 'req1', sub: 'tok 1', tone: 'active', status: 'active' },
          { id: 's-2', label: 'req2', sub: 'tok 2', tone: 'active', status: 'active' },
          { id: 's-3', label: 'dummy', sub: 'tok 3', tone: 'highlight', status: 'masked' },
        ],
        bufInPtr: '0x7f00_1000',
        bufInTone: 'active',
        bufSlotTone: 'active',
        bufOutTone: 'active',
        streamNote: 'global_graph_pool 锁定静态地址',
        stalePointerBug: false,
        shapeOverflow: false,
        unjoinedStream: false,
      },
      caption:
        '第 1 步（静态捕获）：预热后在 B_cap=4 上捕获 CUDA/ACL Graph，计算图将输入 0x7f00_1000、0x7f00_2000 与输出 0x7f00_3000 的虚拟地址硬编码进内核参数。',
      focus: ['capture'],
    },
    {
      state: {
        stepTag: '2. Healthy Replay (B=3 -> 4)',
        batchDesc: 'FULL, B=3 pad->4',
        inputPtr: '0x7f00_1000 (锁定)',
        shapeCheck: 'PASS (3 <= 4)',
        streamStatus: 'Replay ~0.08ms',
        slots: [
          { id: 's-0', label: 'req0', sub: 'valid', tone: 'active', status: 'active' },
          { id: 's-1', label: 'req1', sub: 'valid', tone: 'active', status: 'active' },
          { id: 's-2', label: 'req2', sub: 'valid', tone: 'active', status: 'active' },
          { id: 's-3', label: 'PAD', sub: 'slot=-1', tone: 'highlight', status: 'masked' },
        ],
        bufInPtr: '0x7f00_1000',
        bufInTone: 'active',
        bufSlotTone: 'active',
        bufOutTone: 'active',
        streamNote: '原地 copy_() 写前 3 槽，第 4 槽填 PAD=-1',
        stalePointerBug: false,
        shapeOverflow: false,
        unjoinedStream: false,
      },
      caption:
        '第 2 步（健康重放）：真实批大小 $B=3$ 时，Runner 原地拷贝进 0x7f00_1000[:3] 并把第 4 槽 slot_mapping[3] 覆写为 $-1$，单条发射即驱动全网前向。',
      focus: ['replay'],
    },
    {
      state: {
        stepTag: '3. 铁律一失效：地址漂移',
        batchDesc: 'ptr mismatch!',
        inputPtr: '0x7f00_9000 (漂移)',
        shapeCheck: 'FAIL (stale ptr)',
        streamStatus: '读到陈旧旧值',
        slots: [
          { id: 's-0', label: 'req0', sub: 'at 9000', tone: 'error', status: 'error' },
          { id: 's-1', label: 'req1', sub: 'at 9000', tone: 'error', status: 'error' },
          { id: 's-2', label: 'req2', sub: 'at 9000', tone: 'error', status: 'error' },
          { id: 's-3', label: 'stale', sub: 'at 1000', tone: 'error', status: 'error' },
        ],
        bufInPtr: '0x7f00_9000 (新分配)',
        bufInTone: 'error',
        bufSlotTone: 'active',
        bufOutTone: 'error',
        streamNote: 'Graph 仍死读 0x7f00_1000，新张量在 0x7f00_9000 被忽略',
        stalePointerBug: true,
        shapeOverflow: false,
        unjoinedStream: false,
      },
      caption:
        '第 3 步（铁律一：内存地址必须恒定）：若重放前用 hidden_states = torch.empty(...) 重新赋值，新地址 0x7f00_9000 不会被图读取，Graph 静默消费 0x7f00_1000 的脏数据。',
      focus: ['ptr-drift'],
    },
    {
      state: {
        stepTag: '4. 铁律二/三失效：越界与 Host 同步',
        batchDesc: 'B=5 > B_cap=4',
        inputPtr: '0x7f00_1000',
        shapeCheck: 'FAIL (B=5 / .item)',
        streamStatus: 'Capture Crash',
        slots: [
          { id: 's-0', label: 'req0', sub: 'B=5!', tone: 'error', status: 'error' },
          { id: 's-1', label: 'req1', sub: 'overflow', tone: 'error', status: 'error' },
          { id: 's-2', label: 'req2', sub: 'or', tone: 'error', status: 'error' },
          { id: 's-3', label: 'req3..4', sub: '.item()', tone: 'error', status: 'error' },
        ],
        bufInPtr: '0x7f00_1000',
        bufInTone: 'active',
        bufSlotTone: 'error',
        bufOutTone: 'error',
        streamNote: '形状未入桶或捕获期触发 cudaStreamSynchronize 同步陷阱',
        stalePointerBug: false,
        shapeOverflow: true,
        unjoinedStream: false,
      },
      caption:
        '第 4 步（铁律二/三：静态形状与零 Host 控制流）：若输入超桶（$B=5 > 4$）且未降级或垫平，或在捕获区执行 .item() / torch.nonzero()，硬件直接抛出捕获非法异常。',
      focus: ['shape-sync'],
    },
    {
      state: {
        stepTag: '5. 铁律四失效：跨流未闭环与通信池',
        batchDesc: 'Unjoined copy_stream',
        inputPtr: '0x7f00_1000',
        shapeCheck: 'PASS (shape OK)',
        streamStatus: 'Unjoined Stream',
        slots: [
          { id: 's-0', label: 'req0', sub: 'fork', tone: 'highlight', status: 'active' },
          { id: 's-1', label: 'req1', sub: 'no join!', tone: 'error', status: 'error' },
          { id: 's-2', label: 'req2', sub: 'no join!', tone: 'error', status: 'error' },
          { id: 's-3', label: 'comm', sub: 'nccl_pool', tone: 'highlight', status: 'masked' },
        ],
        bufInPtr: '0x7f00_1000',
        bufInTone: 'active',
        bufSlotTone: 'highlight',
        bufOutTone: 'error',
        streamNote: '需 join_after_forward() + nccl_symm_mem_context 隔离通信内存池',
        stalePointerBug: false,
        shapeOverflow: false,
        unjoinedStream: true,
      },
      caption:
        '第 5 步（铁律四：副流闭环与通信内存池隔离）：捕获末尾若有旁路流未通过 Event 汇回主流，即报错退出；跨卡通信则须切入 nccl_symm_mem_context 独立注册对称窗。',
      focus: ['stream-pool'],
    },
  ];

  const allTones = steps.flatMap((s) => [
    ...s.state.slots.map((sl) => sl.tone ?? 'neutral'),
    s.state.bufInTone,
    s.state.bufSlotTone,
    s.state.bufOutTone,
  ]);
  assertMaxHues(allTones, 3);
  return steps;
}

export default function CudaGraphBoundariesExplainer({
  title = '图 1：静态图 Capture 与 Replay 的四大铁律推演',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildCudaGraphBoundariesSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="CUDA Graph 四大边界条件推演" wide>
      {(step) => {
        const s = step.state;
        const arcs: PointerArc[] = s.stalePointerBug
          ? [
              {
                fromX: 112,
                fromY: 182,
                toX: 300,
                toY: 182,
                tone: 'error',
                active: true,
                dashed: true,
                arcOffset: -20,
                label: 'Graph 仍指旧 0x7f00_1000',
              },
            ]
          : [
              {
                fromX: 112,
                fromY: 182,
                toX: 256,
                toY: 182,
                tone: 'active',
                active: true,
                arcOffset: -18,
                label: 'in-place copy_',
              },
            ];

        const metrics: MetricItem[] = [
          {
            label: '批描述符 (Descriptor)',
            value: s.batchDesc,
            tone: s.shapeOverflow ? 'error' : 'active',
            active: true,
          },
          {
            label: '输入虚拟地址',
            value: s.inputPtr,
            tone: s.stalePointerBug ? 'error' : 'active',
          },
          {
            label: '形状 / Host 校验',
            value: s.shapeCheck,
            tone: s.shapeOverflow || s.stalePointerBug ? 'error' : 'active',
          },
          {
            label: '流拓扑与内存池',
            value: s.streamStatus,
            tone: s.unjoinedStream ? 'error' : 'highlight',
          },
        ];

        return (
          <Stage width={STAGE_W} height={382} label="静态图 Buffer 与边界检查视图">
            <SectionBox
              x={12}
              y={12}
              w={STAGE_W - 24}
              h={100}
              title={`Batch Buffer Slots (B_cap = 4) · ${s.stepTag}`}
              tone={s.stalePointerBug || s.shapeOverflow ? 'error' : 'neutral'}
              dashed
            />
            <SlotStrip
              x={152}
              y={48}
              slots={s.slots}
              slotW={86}
              slotH={42}
              gap={12}
              fontSize={11}
            />

            <SectionBox
              x={12}
              y={126}
              w={STAGE_W - 24}
              h={184}
              title={`Captured Static Graph Topology · ${s.streamNote}`}
              tone={s.unjoinedStream ? 'error' : 'neutral'}
              dashed
            />

            <TensorBlock
              x={34}
              y={190}
              w={156}
              h={64}
              tone={s.bufInTone}
              name="hidden_states"
              shape={s.shapeOverflow ? '[5, H] > [4, H]' : '[4, H]'}
              detail={s.bufInPtr}
              labelMode="inside"
              active={true}
            />

            <TensorBlock
              x={256}
              y={190}
              w={168}
              h={64}
              tone={s.bufSlotTone}
              name="Graph Replay Body"
              shape="fixed kernels"
              detail="slot_ptr: 0x7f00_2000"
              labelMode="inside"
              active={!s.shapeOverflow}
              dashed={s.unjoinedStream}
            />

            <TensorBlock
              x={488}
              y={190}
              w={160}
              h={64}
              tone={s.bufOutTone}
              name="output (weak_ref)"
              shape="[4, H]"
              detail="0x7f00_3000"
              labelMode="inside"
              active={!s.stalePointerBug}
            />

            <DataFlowArrow
              points={[
                [192, 222],
                [252, 222],
              ]}
              tone={s.stalePointerBug ? 'error' : 'active'}
              active={true}
              dashed={s.stalePointerBug}
            />

            <DataFlowArrow
              points={[
                [426, 222],
                [484, 222],
              ]}
              tone={s.unjoinedStream || s.shapeOverflow ? 'error' : 'active'}
              active={true}
              dashed={s.unjoinedStream}
            />

            <PointerArcs arcs={arcs} />

            {s.unjoinedStream && (
              <ActiveFocusFrame
                x={248}
                y={174}
                w={184}
                h={88}
                tone="error"
                label="copy_stream 未 join"
              />
            )}

            <MetricRow x={12} y={326} w={STAGE_W - 24} h={42} metrics={metrics} />
          </Stage>
        );
      }}
    </Explainer>
  );
}
