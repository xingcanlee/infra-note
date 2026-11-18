import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import { MetricRow } from '@/explainers/kit/MetricRow';
import SwimlaneTimeline, {
  type TimelineLane,
  type TimelineSyncEvent,
} from '@/explainers/kit/SwimlaneTimeline';
import { STAGE_W, assertMaxHues, type AnyTone } from '@/explainers/kit/motion';

export interface FlashMlaSeesawState {
  stepIndex: number;
  title: string;
  lanes: TimelineLane[];
  syncEvents: TimelineSyncEvent[];
  playhead: number;
  archLabel: string;
  accumBufText: string;
  overlapText: string;
  throughputText: string;
}

export function buildFlashMlaSeesawSteps(): Step<FlashMlaSeesawState>[] {
  const tones: AnyTone[] = ['q', 'k', 'v'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        title: '串行无重叠基线 (搬运 / 矩阵乘 / Softmax 依次等待)',
        lanes: [
          {
            title: 'TMA / MTE 搬运',
            subtitle: 'HBM <-> 片上',
            blocks: [
              { start: 0, dur: 3, label: '读 K0/V0', tone: 'k', active: true },
              { start: 3, dur: 9, label: '等待计算气泡', tone: 'neutral', kind: 'bubble' },
              { start: 12, dur: 3, label: '写回 O', tone: 'k' },
            ],
          },
          {
            title: 'Tensor / Cube',
            subtitle: '矩阵乘单元',
            blocks: [
              { start: 0, dur: 3, label: '等搬运', tone: 'neutral', kind: 'bubble' },
              { start: 3, dur: 3, label: 'QK^T', tone: 'q', active: true },
              { start: 6, dur: 3, label: '等 Softmax', tone: 'neutral', kind: 'bubble' },
              { start: 9, dur: 3, label: 'P @ V', tone: 'q', active: true },
            ],
          },
          {
            title: 'CUDA / Vector',
            subtitle: '指数与归约',
            blocks: [
              { start: 0, dur: 6, label: '空闲气泡', tone: 'neutral', kind: 'bubble' },
              { start: 6, dur: 3, label: 'Softmax+缩放', tone: 'v', active: true },
              { start: 9, dur: 6, label: '空闲气泡', tone: 'neutral', kind: 'bubble' },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 3, toLane: 1, tone: 'k', label: '屏障' },
          { fromLane: 1, at: 6, toLane: 2, tone: 'q' },
          { fromLane: 2, at: 9, toLane: 1, tone: 'v' },
        ],
        playhead: 6,
        archLabel: '串行无重叠基线',
        accumBufText: '单线阻塞等待',
        overlapText: '有效重叠 < 25%',
        throughputText: '算力单元闲置等待',
      },
      caption:
        '串行执行时，搬运、矩阵乘与指数归约按严格屏障依次排队，每拍超过一半时间消耗在等待气泡上。',
    },
    {
      state: {
        stepIndex: 1,
        title: 'H800 FlashMLA 双 Warpgroup 跷跷板 (O_L | O_R 切分)',
        lanes: [
          {
            title: '9路 64x64 TMA',
            subtitle: 'EVICT_FIRST',
            blocks: [
              { start: 0, dur: 2.5, label: 'K0 (9x64x64)', tone: 'k', active: true },
              { start: 2.5, dur: 2.5, label: 'V0 搬运', tone: 'k' },
              { start: 5, dur: 3, label: 'K1 预取', tone: 'k', active: true },
              { start: 8, dur: 3, label: 'V1 预取', tone: 'k' },
              { start: 11, dur: 3, label: 'K2 预取', tone: 'k' },
            ],
          },
          {
            title: 'WG0 (O_L 64x256)',
            subtitle: '<=128 reg/thr',
            blocks: [
              { start: 1, dur: 3, label: 'GEMM0 QK0^T', tone: 'q', active: true },
              { start: 4, dur: 2.5, label: 'Softmax L', tone: 'v' },
              { start: 6.5, dur: 3, label: 'GEMM1 PV_L', tone: 'q', active: true },
              { start: 9.5, dur: 2.5, label: 'Softmax L1', tone: 'v' },
              { start: 12, dur: 3.5, label: 'GEMM0 QK2^T', tone: 'q' },
            ],
          },
          {
            title: 'WG1 (O_R 64x256)',
            subtitle: '与 WG0 交替执行',
            blocks: [
              { start: 1, dur: 3, label: '待首拍', tone: 'neutral', kind: 'bubble' },
              { start: 4, dur: 3, label: 'GEMM0 QK0_R', tone: 'q', active: true },
              { start: 7, dur: 2.5, label: 'Softmax R', tone: 'v' },
              { start: 9.5, dur: 3, label: 'GEMM1 PV_R', tone: 'q', active: true },
              { start: 12.5, dur: 2.5, label: 'Softmax R1', tone: 'v' },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 1, toLane: 1, tone: 'k', label: '首块落地' },
          { fromLane: 1, at: 4, toLane: 2, tone: 'q', label: '让出 TC' },
          { fromLane: 2, at: 7, toLane: 1, tone: 'v', label: '行最值同步' },
        ],
        playhead: 7,
        archLabel: 'Hopper H800 SXM5',
        accumBufText: 'O 劈半 O_L + O_R',
        overlapText: '9路TMA + 2WG 跷跷板',
        throughputText: '660 TFLOPS / 3 TB/s',
      },
      caption:
        'H800 单 SM 仅 $65,536$ 个寄存器，容不下双份 $64\\times 512$ 累加器。FlashMLA 将 $O$ 竖劈为 $O_L, O_R$（各 $64\\times 256$）分派给 WG0/WG1 如跷跷板交替占用 Tensor Core，同时用 $9$ 路 $64\\times 64$ TMA 掩蔽 $576$ 维搬运。',
    },
    {
      state: {
        stepIndex: 2,
        title: 'Blackwell FA-4 (256 KB TMEM + FMA exp2 分流 + 条件跳过)',
        lanes: [
          {
            title: 'TMA + tcgen05 UMMA',
            subtitle: '写 256 KB TMEM',
            blocks: [
              { start: 0, dur: 3, label: 'UMMA QK0^T', tone: 'q', active: true },
              { start: 3, dur: 3, label: 'UMMA PV0 -> TMEM', tone: 'q' },
              { start: 6, dur: 3, label: 'UMMA QK1^T', tone: 'q', active: true },
              { start: 9, dur: 3, label: 'UMMA PV1 -> TMEM', tone: 'q' },
              { start: 12, dur: 3, label: 'UMMA QK2^T', tone: 'q' },
            ],
          },
          {
            title: '2x Softmax WG',
            subtitle: 'MUFU + 25% FMA exp2',
            blocks: [
              { start: 2, dur: 4, label: 'MUFU+FMA exp2', tone: 'v', active: true },
              { start: 6, dur: 4, label: 'MUFU+FMA exp2', tone: 'v', active: true },
              { start: 10, dur: 4, label: 'MUFU+FMA exp2', tone: 'v' },
            ],
          },
          {
            title: '1x Correction WG',
            subtitle: '独立重缩放 TMEM',
            blocks: [
              { start: 4, dur: 2, label: '跳过缩放', tone: 'neutral', dashed: true },
              { start: 8, dur: 3, label: '异步 rescale O', tone: 'k', active: true },
              { start: 12, dur: 3, label: 'TMEM Epilogue', tone: 'k' },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 0, at: 3, toLane: 1, tone: 'q', label: 'TMEM 就绪' },
          { fromLane: 1, at: 8, toLane: 2, tone: 'v', label: 'delta > 8.0' },
        ],
        playhead: 8,
        archLabel: 'Blackwell B200 SM100',
        accumBufText: '256 KB 专用 TMEM',
        overlapText: 'FMA 3次多项式分流',
        throughputText: '1613 TFLOPS (71%)',
      },
      caption:
        'Blackwell 专用 $256\\;\\text{KB}$ TMEM 接管 $128\\times 128$ UMMA 累加器，释放寄存器以拆分专门的 Correction WG；面对仅 $16\\;\\text{ops/clk}$ 的 MUFU 瓶颈，用 $3$ 次 FMA 多项式分流 $10\\%\\text{–}25\\%$ 的 $\\operatorname{exp2}$，并在变化 $\\le 256\\times$ 时跳过重缩放。',
    },
    {
      state: {
        stepIndex: 3,
        title: '昇腾 Ascend 950 1C2V (Cube-MTE2-Vector 三线 Ping-Pong)',
        lanes: [
          {
            title: 'MTE2 (16槽队列)',
            subtitle: 'gather2 + ND2NZ',
            blocks: [
              { start: 0, dur: 2.5, label: 'gather2 K0/V0', tone: 'k', active: true },
              { start: 3, dur: 3, label: 'gather2 K1/V1', tone: 'k', active: true },
              { start: 6.5, dur: 3, label: 'gather2 K2/V2', tone: 'k' },
              { start: 10, dur: 3, label: 'gather2 K3/V3', tone: 'k' },
            ],
          },
          {
            title: '1x Cube (4096 FMA)',
            subtitle: '256 KB L0C -> FixPipe',
            blocks: [
              { start: 2, dur: 2.5, label: 'Q K0^T -> L0C', tone: 'q', active: true },
              { start: 4.5, dur: 2.5, label: 'Q K1^T', tone: 'q' },
              { start: 7, dur: 2.5, label: '延迟 S0@V0', tone: 'q', active: true },
              { start: 9.5, dur: 2.5, label: 'Q K2^T', tone: 'q' },
              { start: 12, dur: 2.5, label: '延迟 S1@V1', tone: 'q' },
            ],
          },
          {
            title: '2x Vector (UB 累加)',
            subtitle: 'skip-scale RESCALE=6',
            blocks: [
              { start: 4.5, dur: 2.5, label: 'Softmax S0', tone: 'v', active: true },
              { start: 7, dur: 2.5, label: '跳过缩放+加 O', tone: 'v' },
              { start: 9.5, dur: 2.5, label: 'Softmax S1', tone: 'v', active: true },
              { start: 12, dur: 3, label: 'UB rescale+加 O', tone: 'v' },
            ],
          },
        ],
        syncEvents: [
          { fromLane: 1, at: 4.5, toLane: 2, tone: 'q', label: 'FixPipe' },
          { fromLane: 2, at: 7, toLane: 1, tone: 'v', label: 'CrossCore' },
        ],
        playhead: 9.5,
        archLabel: 'Ascend 950 (1C2V)',
        accumBufText: 'UB 持 O / L0C 算乘',
        overlapText: '延迟 S[i-1]V + RESCALE=6',
        throughputText: '410 TF Prefill (95%)',
      },
      caption:
        '昇腾 950 采用 1C2V 协同：Cube 产出的 L0C 累加器不支持就地标量缩放，因此把 $\\tilde{O}$ 留在 Vector UB 中，配合 RESCALE_THRES=6 的 skip-scale 与延迟一拍的 $S_{i-1} V_{i-1}$ 流水，稀疏 Prefill 跑到 $95\\%$ 峰值（$410\\;\\text{TFLOPS}$）。',
    },
  ];
}

export default function FlashMlaSeesawExplainer({
  title = '图 3：H800 跷跷板、Blackwell TMEM 与昇腾 1C2V 流水线时序演进',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildFlashMlaSeesawSteps(), []);

  return (
    <Explainer title={title} steps={steps}>
      {(step) => {
        const s = step.state;
        return (
          <Stage width={STAGE_W} height={316} label={title}>
            <SwimlaneTimeline
              x={16}
              y={16}
              w={648}
              totalTime={16}
              unit="t"
              ticks={[0, 4, 8, 12, 16]}
              lanes={s.lanes}
              syncEvents={s.syncEvents}
              laneH={42}
              laneGap={16}
              gutterW={150}
              playhead={s.playhead}
              title={s.title}
            />

            <MetricRow
              x={16}
              y={246}
              w={648}
              h={54}
              metrics={[
                { label: '目标微架构', value: s.archLabel, tone: 'q' },
                { label: 'O 累加器驻留位置', value: s.accumBufText, tone: 'k' },
                { label: '核心异步掩蔽策略', value: s.overlapText, tone: 'v' },
                { label: '文献算力/利用率', value: s.throughputText, tone: 'v', active: true },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
