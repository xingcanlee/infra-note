import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  ByteLedgerBar,
  HeatmapMatrix,
  MetricRow,
  SectionBox,
  assertMaxHues,
} from '@/explainers/kit';

export interface MhcSinkhornState {
  stepIndex: number;
  phaseLabel: string;
  matrix: (number | null)[][];
  rowSums: string[];
  colSums: string[];
  amax30: string;
  rowErr: string;
  colErr: string;
  hbmTraffic: string;
  matrixTone: Tone;
  isConverged: boolean;
  isMegaFused: boolean;
}

const STREAM_LABELS = ['S0', 'S1', 'S2', 'S3'];

function fmtMat(v: number | null): string {
  return v === null ? '—' : v.toFixed(2);
}

export function buildMhcSinkhornSteps(): Step<MhcSinkhornState>[] {
  const tones: Tone[] = ['error', 'active', 'done'];
  assertMaxHues(tones);

  return [
    {
      state: {
        stepIndex: 0,
        phaseLabel: 'Step 1 · 无约束 Hyper-Connections 30 层连乘增益爆炸',
        matrix: [
          [1.45, -0.62, 1.32, 0.85],
          [0.91, 1.54, -0.48, 0.73],
          [1.18, 0.82, 1.65, -0.45],
          [-0.38, 1.12, 0.64, 1.12],
        ],
        rowSums: ['3.00', '2.70', '3.20', '2.50'],
        colSums: ['3.16', '2.86', '3.13', '2.25'],
        amax30: '3148.2 (发散)',
        rowErr: '+2.20',
        colErr: '+2.16',
        hbmTraffic: '分立核 ~20d',
        matrixTone: 'error',
        isConverged: false,
        isMegaFused: false,
      },
      caption:
        '无约束 HC 允许 $H_{\\text{res}}$ 出现负权与大于 1 的行和；经 30 层 $\\prod_{l} H_{\\text{res}}^{(l)}$ 连乘后复合矩阵绝对最大值 Amax 飙升至 $>3000$，引发梯度/数值崩塌。',
    },
    {
      state: {
        stepIndex: 1,
        phaseLabel: 'Step 2 · Sinkhorn-Knopp t=0 指数正化初值 M^(0) = exp(H~)',
        matrix: [
          [1.64, 0.54, 1.12, 0.7],
          [0.85, 1.48, 0.61, 1.06],
          [1.02, 0.79, 1.51, 0.68],
          [0.49, 1.19, 0.76, 1.56],
        ],
        rowSums: ['4.00', '4.00', '4.00', '4.00'],
        colSums: ['4.00', '4.00', '4.00', '4.00'],
        amax30: '64.0 (待投影)',
        rowErr: '+3.00',
        colErr: '+3.00',
        hbmTraffic: '分立核 ~20d',
        matrixTone: 'active',
        isConverged: false,
        isMegaFused: false,
      },
      caption:
        'mHC 先以动态输入投影计算无约束 logit 并按元素取指数 $M^{(0)}=\\exp(\\tilde{H}_{\\text{res}})>0$，保证混合矩阵非负，消除正负抵消震荡。',
    },
    {
      state: {
        stepIndex: 2,
        phaseLabel: 'Step 3 · Sinkhorn t=1 交替列/行归一化逼近流形',
        matrix: [
          [0.41, 0.14, 0.28, 0.17],
          [0.21, 0.37, 0.15, 0.27],
          [0.26, 0.2, 0.38, 0.17],
          [0.12, 0.3, 0.19, 0.39],
        ],
        rowSums: ['1.00', '1.00', '1.01', '1.00'],
        colSums: ['1.00', '1.01', '1.00', '1.00'],
        amax30: '1.88 (收敛中)',
        rowErr: '0.01',
        colErr: '0.01',
        hbmTraffic: 'TileLang ~12d',
        matrixTone: 'active',
        isConverged: false,
        isMegaFused: false,
      },
      caption:
        '进入 Sinkhorn 交替迭代：先沿列归一化再沿行归一化（与 MhcBoundaryKernel.sinkhorn 寄存器内执行顺序一致），仅 1 轮迭代行和、列和偏差即收敛到 0.01 量级。',
    },
    {
      state: {
        stepIndex: 3,
        phaseLabel: 'Step 4 · Sinkhorn t=4+ 投影到 Birkhoff 双随机多面体',
        matrix: [
          [0.41, 0.13, 0.28, 0.18],
          [0.21, 0.37, 0.15, 0.27],
          [0.26, 0.2, 0.38, 0.16],
          [0.12, 0.3, 0.19, 0.39],
        ],
        rowSums: ['1.00', '1.00', '1.00', '1.00'],
        colSums: ['1.00', '1.00', '1.00', '1.00'],
        amax30: '1.12 (<=1.6)',
        rowErr: '0.00',
        colErr: '0.00',
        hbmTraffic: 'Shifted ~12d',
        matrixTone: 'done',
        isConverged: true,
        isMegaFused: false,
      },
      caption:
        '迭代 4–20 次后严格落入 Birkhoff 多面体：rowSums=1.00 且 colSums=1.00；双随机矩阵乘积封闭且谱范数 $\\le 1$，30 层连乘 Amax 稳定控制在 $1.12 \\le 1.6$。',
    },
    {
      state: {
        stepIndex: 4,
        phaseLabel: 'Step 5 · V4.1 Mega-mHC 单遍读写与 Shifted Post-Pre 边界',
        matrix: [
          [0.41, 0.13, 0.28, 0.18],
          [0.21, 0.37, 0.15, 0.27],
          [0.26, 0.2, 0.38, 0.16],
          [0.12, 0.3, 0.19, 0.39],
        ],
        rowSums: ['1.00', '1.00', '1.00', '1.00'],
        colSums: ['1.00', '1.00', '1.00', '1.00'],
        amax30: '1.12 (<=1.6)',
        rowErr: '0.00',
        colErr: '0.00',
        hbmTraffic: 'Mega-mHC 10d',
        matrixTone: 'done',
        isConverged: true,
        isMegaFused: true,
      },
      caption:
        'V4.1 通过 mhc_shifted_post_pre_deep_gemm 将上一子层 post 写入、本层 pre 混合、Sinkhorn 系数与下层 RMSNorm 融进单次 HBM 读写，HBM 流量减半（$20d \\to 10d$）。',
    },
  ];
}

export default function MhcSinkhornExplainer({
  title = '图 1：mHC Sinkhorn-Knopp 双随机投影与 Mega-mHC 单遍融合',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildMhcSinkhornSteps(), []);

  return (
    <Explainer steps={steps} title={title} label={title}>
      {(step) => {
        const s = step.state;
        const selected = s.isConverged ? new Set(['0-0', '1-1', '2-2', '3-3']) : undefined;

        return (
          <Stage width={680} height={332} label={s.phaseLabel}>
            <ActiveFocusFrame
              x={8}
              y={14}
              w={292}
              h={242}
              tone={s.matrixTone}
              label={s.stepIndex === 0 ? '非双随机发散' : 'Birkhoff H_res'}
              visible={!s.isMegaFused}
            />
            <HeatmapMatrix
              x={14}
              y={28}
              values={s.matrix}
              tone={s.matrixTone}
              cellW={46}
              cellH={36}
              gap={4}
              min={-0.7}
              max={1.7}
              format={fmtMat}
              selected={selected}
              selectedTone="done"
              rowLabels={STREAM_LABELS}
              colLabels={STREAM_LABELS}
              rowSums={s.rowSums}
              colSums={s.colSums}
              rowLabelW={30}
              title="4×4 残差混合矩阵 H_res"
            />

            <SectionBox
              x={312}
              y={12}
              w={360}
              h={244}
              tone={s.isMegaFused ? 'done' : 'neutral'}
              dashed={!s.isMegaFused}
              title="每子层 mHC HBM 读写流量对比 (d = hidden_size)"
            />

            <ByteLedgerBar
              x={324}
              y={74}
              w={336}
              h={28}
              title="分立 Post + Pre + RMSNorm (3 Kernel)"
              totalLabel="20d"
              segments={[
                { value: 8, label: 'Post 读写', tone: s.stepIndex === 0 ? 'error' : 'neutral' },
                { value: 8, label: 'Pre 读×2', tone: s.stepIndex === 0 ? 'error' : 'neutral' },
                { value: 4, label: 'Norm 读写', tone: 'mask' },
              ]}
            />

            <ByteLedgerBar
              x={324}
              y={166}
              w={336}
              h={28}
              title="V4.1 Mega-mHC / NPU Single-Pass"
              totalLabel={s.isMegaFused ? '10d (-50%)' : '待融合'}
              segments={[
                {
                  value: 4,
                  label: '读 A_{l-1}',
                  tone: s.isMegaFused ? 'active' : 'neutral',
                  active: s.isMegaFused,
                },
                {
                  value: 4,
                  label: '写残差',
                  tone: s.isMegaFused ? 'done' : 'neutral',
                  active: s.isMegaFused,
                },
                {
                  value: 2,
                  label: '写 y_bf16',
                  tone: s.isMegaFused ? 'done' : 'neutral',
                  active: s.isMegaFused,
                },
              ]}
            />

            <MetricRow
              x={8}
              y={272}
              w={664}
              h={44}
              gap={10}
              metrics={[
                {
                  label: '30层连乘 Amax',
                  value: s.amax30,
                  tone: s.stepIndex === 0 ? 'error' : 'done',
                  active: true,
                },
                { label: '行和偏差', value: s.rowErr, tone: s.isConverged ? 'done' : 'active' },
                { label: '列和偏差', value: s.colErr, tone: s.isConverged ? 'done' : 'active' },
                {
                  label: '单层 mHC 访存',
                  value: s.hbmTraffic,
                  tone: s.isMegaFused ? 'done' : 'neutral',
                },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
