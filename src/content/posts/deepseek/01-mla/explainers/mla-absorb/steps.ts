import type { Step } from 'astro-wisp/explainers';
import { assertMaxHues } from '@/explainers/kit/motion';

export type MlaPhase = 'compress' | 'expand_rope_block' | 'decouple_absorb' | 'dual_inflection';

export type MlaExecMode = 'decode_mqa' | 'prefill_mha';

export interface MlaAbsorbState {
  phase: MlaPhase;
  formulaTex: string;
  kvBytesPerTok: number;
  tempActivateElem: number;
  ropeBlocked: boolean;
  absorbed: boolean;
}

/** DeepSeek-V3 生产尺度常量（单一真实尺度，无二维玩具数值混用） */
export const DSV3_HEADS = 128;
export const DSV3_DH = 128;
export const DSV3_DC = 512;
export const DSV3_DR = 64;

export const MHA_KV_ELEM_PER_TOK = DSV3_HEADS * DSV3_DH * 2; // 32,768
export const MHA_KV_BYTES_PER_TOK = MHA_KV_ELEM_PER_TOK * 2; // 65,536 B (BF16)
export const MLA_KV_ELEM_PER_TOK = DSV3_DC + DSV3_DR; // 576
export const MLA_KV_BYTES_PER_TOK = MLA_KV_ELEM_PER_TOK * 2; // 1,152 B (BF16)

export const KV_EXPAND_FACTOR = MHA_KV_ELEM_PER_TOK / (DSV3_DC * 2); // 32x (32,768 / 1,024)
export const KV_COMPRESS_RATIO = Number((MHA_KV_BYTES_PER_TOK / MLA_KV_BYTES_PER_TOK).toFixed(2)); // 56.89
export const COMPUTE_WIDTH_MHA = DSV3_DH + DSV3_DR + DSV3_DH; // 192 + 128 = 320
export const COMPUTE_WIDTH_MQA = DSV3_DC + DSV3_DR + DSV3_DC; // 576 + 512 = 1088
export const COMPUTE_WIDTH_RATIO = Number((COMPUTE_WIDTH_MQA / COMPUTE_WIDTH_MHA).toFixed(1)); // 3.4

export interface ModeMetrics {
  id: MlaExecMode;
  label: string;
  pathName: string;
  kvReadBytes: string;
  kvReadRatio: number;
  computeWidth: string;
  computeRatio: number;
  arithmeticHint: string;
  summary: string;
}

export const MODE_METRICS: Record<MlaExecMode, ModeMetrics> = {
  decode_mqa: {
    id: 'decode_mqa',
    label: 'Decode (MQA)',
    pathName: '$\\text{forward\\_mqa}$ · 双向矩阵吸收',
    kvReadBytes: '1,152 B / tok（56.9× 省带宽）',
    kvReadRatio: 0.14,
    computeWidth: 'QK: 576 + V: 512 = 1,088 维',
    computeRatio: 0.94,
    arithmeticHint: '$s_q = 1$ 访存受限 · 单头共享 576 维 KV 缓存',
    summary:
      'Decode 阶段受限于 HBM 带宽，双向吸收后每 token 仅搬运 1,152 B（512 NoPE + 64 RoPE），相比 128 头 MHA 的 65,536 B 省带宽 56.9 倍。',
  },
  prefill_mha: {
    id: 'prefill_mha',
    label: 'Prefill (MHA)',
    pathName: '$\\text{forward\\_mha}$ · 显式展开还原',
    kvReadBytes: '65,536 B 等效（片上临时展开）',
    kvReadRatio: 0.94,
    computeWidth: 'QK: 192 + V: 128 = 320 维（3.4× 省算力）',
    computeRatio: 0.28,
    arithmeticHint: '$s_q \\gg 1$ 计算受限 · 窄头宽省 3.4 倍核心乘加',
    summary:
      'Prefill 阶段平方级注意力计算占主导，显式展开为 128 头窄宽度（QK 192 / V 128）可比吸收路径节省 3.4 倍核心算力。',
  },
};

export function buildMlaAbsorbSteps(): Step<MlaAbsorbState>[] {
  assertMaxHues(['active', 'highlight', 'done']);

  return [
    {
      label: '从 h_t 压缩',
      duration: 4600,
      state: {
        phase: 'compress',
        formulaTex:
          '$h_t \\xrightarrow{W^{DQ}} c_t^Q \\in \\mathbb{R}^{1536},\\quad h_t \\xrightarrow{W^{DKV},\\, W^{KR}} [c_t^{KV};\\, k_t^R] \\in \\mathbb{R}^{576}\\;(1{,}152\\text{ B/tok})$',
        kvBytesPerTok: MLA_KV_BYTES_PER_TOK,
        tempActivateElem: MLA_KV_ELEM_PER_TOK,
        ropeBlocked: false,
        absorbed: false,
      },
      caption:
        '从输入隐状态 $h_t$ 出发，MLA 用低秩下投影同时生成 $c_t^Q$ 与写入显存的 576 维 KV 缓存（$c_t^{KV}$ 512 维 + 共享 $k_t^R$ 64 维），单层缓存从 65,536 B 压至 1,152 B。',
    },
    {
      label: '展开与 RoPE 阻塞',
      duration: 4600,
      state: {
        phase: 'expand_rope_block',
        formulaTex:
          '$(c_t^Q)^\\top (W_i^{UQ})^\\top \\, R_{t-j} \\, W_i^{UK} c_j^{KV} \\;\\Rightarrow\\; \\text{临时展开 } 32\\times\\; (32{,}768\\text{ 元素})$',
        kvBytesPerTok: MLA_KV_BYTES_PER_TOK,
        tempActivateElem: MHA_KV_ELEM_PER_TOK,
        ropeBlocked: true,
        absorbed: false,
      },
      caption:
        '若直接按原始公式把缓存上投影展开为 128 头，临时激活膨胀 32 倍；且相对旋转矩阵 $R_{t-j}$ 夹在 $(W_i^{UQ})^\\top$ 与 $W_i^{UK}$ 之间，阻断两矩阵提前合并。',
    },
    {
      label: '解耦与矩阵吸收',
      duration: 4800,
      state: {
        phase: 'decouple_absorb',
        formulaTex:
          '$\\tilde{q}_{t,i}^C = (W_i^{UK})^\\top q_{t,i}^C,\\quad \\tilde{o}_{t,i} = \\sum_j \\alpha_{t,j,i} c_j^{KV},\\quad u_t = \\sum_i W_i^O (W_i^{UV}\\tilde{o}_{t,i})$',
        kvBytesPerTok: MLA_KV_BYTES_PER_TOK,
        tempActivateElem: MLA_KV_ELEM_PER_TOK,
        ropeBlocked: false,
        absorbed: true,
      },
      caption:
        '将 64 维 RoPE 解耦成独立支路后，$(W_i^{UK})^\\top$ 左移并入查询、$W_i^{UV}$ 右移越过求和，注意力直接读取 512 维 $c_j^{KV}$ 算完再投影出 $u_t$，全程免解压。',
    },
    {
      label: '双路径切换',
      duration: 4800,
      state: {
        phase: 'dual_inflection',
        formulaTex:
          '$\\text{Decode (MQA)}: 1{,}152\\text{ B/tok}\\;(56.9\\times\\text{ 省带宽}),\\quad \\text{Prefill (MHA)}: 320\\text{ 维}\\;(3.4\\times\\text{ 省算力})$',
        kvBytesPerTok: MLA_KV_BYTES_PER_TOK,
        tempActivateElem: MLA_KV_ELEM_PER_TOK,
        ropeBlocked: false,
        absorbed: true,
      },
      caption:
        '同一份 576 维 KV 缓存支持双路径切换：Decode 走 MQA 吸收态保 1,152 B 低访存，Prefill 切回 128 头窄宽度 MHA 省 3.4 倍计算量。',
    },
  ];
}
