import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues } from '@/explainers/kit/motion';

export type MegaMhcPhase = 'split_4' | 'two_pass' | 'shift_dep' | 'single_pass';

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
  readD: number;
  writeD: number;
  hbmTrips: number;
  segments: readonly IoSegment[];
  blockerNote: string;
}

export const SPLIT_4_SEGMENTS: readonly IoSegment[] = [
  { label: 'Post+Res 写回', costD: 9, detail: '读 y_l+X_l (5d) 写 X_{l+1} (4d)', tone: 'active' },
  { label: '系数投影', costD: 4, detail: '重读 X_{l+1} (4d) 算 A/B/C', tone: 'highlight' },
  { label: 'Pre 聚合', costD: 5, detail: '重读 X_{l+1} (4d) 写 1d', tone: 'active' },
  { label: 'RMSNorm', costD: 2, detail: '读 1d 写归一化输入 1d', tone: 'neutral' },
];

export const TWO_PASS_SEGMENTS: readonly IoSegment[] = [
  {
    label: 'Pass 1: Post+系数',
    costD: 9,
    detail: '写回 X_{l+1} 同时归约 r_{l+1} 与 A_{l+1}',
    tone: 'active',
  },
  {
    label: 'Pass 2: Pre+Norm',
    costD: 5,
    detail: '等 r_{l+1} 就绪后重读 X_{l+1}(4d) 写 1d',
    tone: 'highlight',
  },
];

export const SINGLE_PASS_SEGMENTS: readonly IoSegment[] = [
  { label: '单遍读 5d', costD: 5, detail: 'y_l(1d) + X_l(4d) 进寄存器', tone: 'done' },
  { label: '单遍写 5d', costD: 5, detail: 'X_{l+1}(4d) + Norm(A_l X_{l+1})(1d)', tone: 'done' },
];

export function buildMegaMhcPassSteps(): Step<MegaMhcStepState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: '四算子基线',
      duration: 4400,
      state: {
        phase: 'split_4',
        formulaTex: '$\\text{IO}_{\\text{split}} = 9d + 4d + 5d + 2d = (4n+4)d = 20d$',
        totalD: 20,
        readD: 14,
        writeD: 6,
        hbmTrips: 4,
        segments: SPLIT_4_SEGMENTS,
        blockerNote:
          '四流状态 [T, 4, d] 在四次独立 Kernel 之间反复写回与重读 HBM，每子层累计访存 20d。',
      },
      caption:
        '按公式拆成四个独立算子时，四流残差在 HBM 与片上缓存间往返搬运四趟，每子层累计读写 20d 字节。',
    },
    {
      label: '两遍融合受阻',
      duration: 4500,
      state: {
        phase: 'two_pass',
        formulaTex: '$\\text{IO}_{\\text{2pass}} = 9d + 5d = (3n+2)d = 14d$',
        totalD: 14,
        readD: 9,
        writeD: 5,
        hbmTrips: 2,
        segments: TWO_PASS_SEGMENTS,
        blockerNote:
          '下层系数 $A_{l+1}$ 必须等整条 4d 向量求出分母 $r_{l+1}$ 才能归一化，迫使 Pass 2 重读 4d。',
      },
      caption:
        '哪怕把前两步融进 Pass 1，因为下层输入聚合权重 $A_{l+1}$ 依赖全维归约分母 $r_{l+1}$，仍必须开 Pass 2 重读四流，访存卡在 14d。',
    },
    {
      label: '错位时移重组',
      duration: 4500,
      state: {
        phase: 'shift_dep',
        formulaTex:
          '$\\mathbf{X}_{l+1} = B_l \\mathbf{X}_l + C_l \\mathcal{F}_l(A_{l-1} \\mathbf{X}_l),\\; A_{-1} = [1,0,0,0]$',
        totalD: 10,
        readD: 5,
        writeD: 5,
        hbmTrips: 1,
        segments: SINGLE_PASS_SEGMENTS,
        blockerNote:
          '边界改用上一子层早已就绪的 $A_l$ 聚合下层输入，彻底切断等待归约再聚合的数据依赖。',
      },
      caption:
        'DeepSeek-V4.1 将输入聚合系数向后错位一步：直接消费上层产出的 $A_{l-1}$，同时把本层算出的 $A_l$ 递给下一子层。',
    },
    {
      label: '单遍融合下界',
      duration: 4600,
      state: {
        phase: 'single_pass',
        formulaTex:
          '$\\text{IO}_{\\text{mega}} = 5d_{\\text{read}} + 5d_{\\text{write}} = (2n+2)d = 10d$',
        totalD: 10,
        readD: 5,
        writeD: 5,
        hbmTrips: 1,
        segments: SINGLE_PASS_SEGMENTS,
        blockerNote:
          '单遍扫描同步完成 Post+Res 写回、下层系数投影、$A_l$ 聚合与 Norm，触及 10d 理论下界。',
      },
      caption: '解除依赖后，单遍 Mega-mHC 只需读 5d 并写 5d，相比四算子基线访存腰斩一半（-50%）。',
    },
  ];
}
