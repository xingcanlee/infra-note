import type { Step } from 'astro-wisp/explainers';
import { type BeatSpec, assertMaxHues } from '@/explainers/kit/motion';
export { MANIM_EASE, MORPH_SPRING, type BeatSpec } from '@/explainers/kit/motion';

export type MegaMhcPhase = 'split_4' | 'two_pass' | 'shift_dep' | 'single_pass' | 'boundary';
export type LayerKind = 'normal' | 'engram';

export interface IoSegment {
  label: string;
  costD: number;
  detail: string;
  tone: 'active' | 'highlight' | 'done' | 'neutral';
}

export interface MegaMhcStepState {
  phase: MegaMhcPhase;
  formulaTex: string;
  totalD: number;
  hbmTrips: number;
  segments: readonly IoSegment[];
  blockerNote: string;
}

export const SPLIT_4_SEGMENTS: readonly IoSegment[] = [
  { label: 'Post+Res 写回', costD: 9, detail: '读 y+X_l (5d) 写 X_{l+1} (4d)', tone: 'active' },
  { label: '系数投影', costD: 4, detail: '重读 X_{l+1} (4d) 算 A/B/C', tone: 'highlight' },
  { label: 'Pre 聚合', costD: 5, detail: '重读 X_{l+1} (4d) 写 1d', tone: 'active' },
  { label: 'RMSNorm', costD: 2, detail: '读 1d 写归一化输入 1d', tone: 'neutral' },
];

export const TWO_PASS_SEGMENTS: readonly IoSegment[] = [
  {
    label: 'Pass 1: Post+算系数',
    costD: 9,
    detail: '写回 X_{l+1} 同时归约 r 与 A_l',
    tone: 'active',
  },
  {
    label: 'Pass 2: Pre+Norm',
    costD: 5,
    detail: '等 r 就绪后重读 X_{l+1}(4d) 写 1d',
    tone: 'highlight',
  },
];

export const SINGLE_PASS_SEGMENTS: readonly IoSegment[] = [
  { label: '单遍读 5d', costD: 5, detail: 'y_{l-1}(1d) + X_l(4d) 进寄存器', tone: 'done' },
  { label: '单遍写 5d', costD: 5, detail: 'X_{l+1}(4d) + Norm(A_{l-1}X_l)(1d)', tone: 'done' },
];

export interface LayerKindSpec {
  id: LayerKind;
  label: string;
  gpuPath: string;
  npuPath: string;
  gpuIo: string;
  npuIo: string;
  summary: string;
}

export const LAYER_BOUNDARY_SPECS: Record<LayerKind, LayerKindSpec> = {
  normal: {
    id: 'normal',
    label: '常规层（非 Engram）',
    gpuPath: 'mhc_shifted_post_pre 跨子层单遍融合（CuTe / DeepGEMM）',
    npuPath: '子层尾 npu_hc_post 写出四流 → 下层首 npu_hc_pre_v3 消费',
    gpuIo: '10d 理论下界',
    npuIo: '成对写回保 SP 分片',
    summary:
      'GPU 将上层写回留到下层入口合并为 10d 单遍读写；昇腾保持层间四流展开，前后衔接序列并行通信。',
  },
  engram: {
    id: 'engram',
    label: 'L1 / L14 层（含 Engram）',
    gpuPath: '显式拆开融合：mhc_post_tilelang → Engram 注入 → mhc_pre',
    npuPath: '四流已展开：直接原位执行 AscendEngram → npu_hc_pre_v3',
    gpuIo: '拆开边界交出 [T,4,d]',
    npuIo: '零改流直接原位读写',
    summary:
      'Engram 需要对完整四流状态原位注入，因此 GPU 在 L1 与 L14 显式拆开延迟融合，而 NPU 无需调整控制流。',
  },
};

export const BEAT_SCHEDULES: Record<MegaMhcPhase, readonly BeatSpec[]> = {
  split_4: [
    { at: 0, label: '发射上层 Post 写回 (9d)' },
    { at: 750, label: '重读四流算系数 (4d)' },
    { at: 1550, label: '再读四流做 Pre (5d)' },
    { at: 2350, label: '独立 RMSNorm 收尾 (2d)' },
  ],
  two_pass: [
    { at: 0, label: 'Pass 1 合并写回与投影' },
    { at: 750, label: '分母 r 需整条 4d 归约完' },
    { at: 1550, label: '无法在 Pass 1 同时聚合 Pre' },
    { at: 2350, label: 'Pass 2 重读四流累计 14d' },
  ],
  shift_dep: [
    { at: 0, label: '观察依赖死结所在位置' },
    { at: 750, label: '改用上层算好的 A_{l-1}' },
    { at: 1550, label: '首子层 A_{-1} 固定 [1,0,0,0]' },
    { at: 2350, label: '尾层用多算的 ffn_pre 归并' },
  ],
  single_pass: [
    { at: 0, label: '片上单遍读 y_{l-1} + X_l (5d)' },
    { at: 750, label: '同步累加点积与平方和' },
    { at: 1550, label: '直接用 A_{l-1} 聚合并 Norm' },
    { at: 2350, label: '单遍写出 5d 触及 10d 下界' },
  ],
  boundary: [
    { at: 0, label: '对照 GPU 与昇腾硬件路径' },
    { at: 750, label: '常规层 GPU 跨界延迟融合' },
    { at: 1550, label: 'NPU 子层成对维持四流展开' },
    { at: 2350, label: '切换 L1/L14 观察 Engram 拆界' },
  ],
};

export function buildMegaMhcPassSteps(): Step<MegaMhcStepState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: '分立四核',
      duration: 4200,
      state: {
        phase: 'split_4',
        formulaTex: '$\\text{IO}_{\\text{split}} = 9d + 4d + 5d + 2d = (4n+4)d = 20d$',
        totalD: 20,
        hbmTrips: 4,
        segments: SPLIT_4_SEGMENTS,
        blockerNote:
          '四流状态 [T, 4, d] 在四次 Kernel 之间来回进出 HBM，解码阶段算子全被带宽拖慢。',
      },
      caption:
        '若按公式逐一发射四个独立算子，四流残差会在 HBM 与片上缓存之间往返搬运，每子层累计读写 20d 字节。',
    },
    {
      label: '两遍受阻',
      duration: 4300,
      state: {
        phase: 'two_pass',
        formulaTex: '$\\text{IO}_{\\text{2pass}} = 9d + 5d = (3n+2)d = 14d$',
        totalD: 14,
        hbmTrips: 2,
        segments: TWO_PASS_SEGMENTS,
        blockerNote:
          '当层系数 A_l 必须等整条 4d 向量归约出分母 r 才能归一化，迫使 Pass 2 再读一遍 X_{l+1}。',
      },
      caption:
        '哪怕把前两步融进 Pass 1，因为输入聚合权重 A_l 依赖全维 RMSNorm 分母 r，仍必须再开 Pass 2 重读四流，访存卡在 14d。',
    },
    {
      label: '错位时移',
      duration: 4200,
      state: {
        phase: 'shift_dep',
        formulaTex: '$X_{l+1} = B_l X_l + C_l \\mathcal{F}_l(A_{l-1} X_l),\\; A_{-1} = [1,0,0,0]$',
        totalD: 10,
        hbmTrips: 1,
        segments: SINGLE_PASS_SEGMENTS,
        blockerNote: '当前子层改用上一子层早已就绪的 A_{l-1}，彻底切断“等归约再聚合”的数据依赖。',
      },
      caption:
        'DeepSeek-V4.1 将输入聚合系数向后错位一步：算子输入直接使用上层产出的 A_{l-1}，同时把本层算出的 A_l 递给下一子层。',
    },
    {
      label: '单遍下界',
      duration: 4300,
      state: {
        phase: 'single_pass',
        formulaTex:
          '$\\text{IO}_{\\text{mega}} = 5d_{\\text{read}} + 5d_{\\text{write}} = (2n+2)d = 10d$',
        totalD: 10,
        hbmTrips: 1,
        segments: SINGLE_PASS_SEGMENTS,
        blockerNote:
          '一次扫描同时完成 Post+Res 写回、下一层系数投影、A_{l-1} 聚合与 BF16 RMSNorm，触及信息论下界。',
      },
      caption:
        '解除依赖后，单遍 Mega-mHC 只需读 5d（1d 增量与 4d 残差）并写 5d（4d 新残差与 1d 归一化输出），访存相比朴素实现腰斩一半。',
    },
    {
      label: '双端拆界',
      duration: 4500,
      state: {
        phase: 'boundary',
        formulaTex:
          '$\\text{GPU: } \\text{mhc\\_shifted\\_post\\_pre} \\;\\Vert\\; \\text{NPU: } \\text{npu\\_hc\\_pre\\_v3} + \\text{npu\\_hc\\_post}$',
        totalD: 10,
        hbmTrips: 1,
        segments: SINGLE_PASS_SEGMENTS,
        blockerNote:
          '下方可切换常规层与 L1/L14 层，对照 GPU 拆界与 NPU 成对写回对 Engram 注入的影响。',
      },
      caption:
        '落到线上推理引擎时，GPU 在常规层采用跨子层延迟融合并在 L1/L14 显式拆界，昇腾 NPU 则用成对算子始终保持四流展开。',
    },
  ];
}
