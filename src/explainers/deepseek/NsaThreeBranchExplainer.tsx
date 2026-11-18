import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  DataFlowArrow,
  HeatmapMatrix,
  MetricRow,
  SectionBox,
  STAGE_W,
  TensorBlock,
  assertMaxHues,
} from '@/explainers/kit';

export interface NsaThreeBranchState {
  phase: 'cmp' | 'accum' | 'slc' | 'win' | 'gate';
  cmpGrid: (number | null)[][];
  slcGrid: (number | null)[][];
  selectedCells: Set<string>;
  activeBranch: 'cmp' | 'slc' | 'win' | 'all';
}

const HEAD_LABELS = ['h0', 'h1', 'h2', 'h3'];
const CMP_BLK_LABELS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
const SLC_BLK_LABELS = ['b0', 'b1', 'b2', 'b3'];

export function buildNsaThreeBranchSteps(): Step<NsaThreeBranchState>[] {
  assertMaxHues(['blue', 'amber', 'green']);

  const cmpValues: (number | null)[][] = [
    [0.12, 0.35, 0.28, 0.06, 0.09, 0.1],
    [0.08, 0.31, 0.36, 0.05, 0.11, 0.09],
    [0.05, 0.29, 0.33, 0.08, 0.15, 0.1],
    [0.1, 0.32, 0.3, 0.07, 0.12, 0.09],
  ];

  const slcValues: (number | null)[][] = [
    [0.47, 0.34, 0.15, 0.19],
    [0.39, 0.41, 0.16, 0.2],
    [0.34, 0.41, 0.23, 0.25],
    [0.42, 0.37, 0.19, 0.21],
  ];

  const topBlocks = new Set<string>();
  for (let r = 0; r < 4; r++) {
    topBlocks.add(`${r},0`);
    topBlocks.add(`${r},1`);
  }

  return [
    {
      state: {
        phase: 'cmp',
        cmpGrid: cmpValues,
        slcGrid: slcValues,
        selectedCells: new Set<string>(),
        activeBranch: 'cmp',
      },
      caption:
        '步骤 1（cmp 块压缩分支）：将连续 $l=32$ 个 token 按步长 $d=16$ 经 MLP $\\varphi$ 折叠成粗粒度压缩块，组内查询点积立刻产生压缩注意力分布 $\\mathbf{p}_t^{\\text{cmp}}$。',
    },
    {
      state: {
        phase: 'accum',
        cmpGrid: cmpValues,
        slcGrid: slcValues,
        selectedCells: new Set<string>(),
        activeBranch: 'cmp',
      },
      caption:
        '步骤 2（重要性分零成本累加）：无需新建打分网络，直接复用 $\\mathbf{p}_t^{\\text{cmp}}$ 按空间重叠关系沿 $l^{\\prime}=64$ 选块边界累加，得到精细选块打分 $\\mathbf{p}_t^{\\text{slc}}$。',
    },
    {
      state: {
        phase: 'slc',
        cmpGrid: cmpValues,
        slcGrid: slcValues,
        selectedCells: topBlocks,
        activeBranch: 'slc',
      },
      caption:
        '步骤 3（slc GQA 组共享连续块挑选）：将同一 GQA 组内 $G=16$ 个头的得分求和聚合，选出整组共用的 Top-$n$ 连续块 $\\{b_0, b_1\\}$（每块 $l^{\\prime}=64$），消除独立选块并集膨胀。',
    },
    {
      state: {
        phase: 'win',
        cmpGrid: cmpValues,
        slcGrid: slcValues,
        selectedCells: topBlocks,
        activeBranch: 'win',
      },
      caption:
        '步骤 4（win 独立投影局部滑窗）：近端 $w=512$ 窗口拥有独立的键值投影 $W_K^{\\text{win}}, W_V^{\\text{win}}$，防止强梯度局部句法干扰长程 cmp / slc 表征学习。',
    },
    {
      state: {
        phase: 'gate',
        cmpGrid: cmpValues,
        slcGrid: slcValues,
        selectedCells: topBlocks,
        activeBranch: 'all',
      },
      caption:
        '步骤 5（Sigmoid 门控三路汇总）：由当前隐状态生成门控标量 $(g_t^{\\text{cmp}}, g_t^{\\text{slc}}, g_t^{\\text{win}}) \\in (0,1)^3$ 加权融合三路输出，$64\\text{K}$ 上下文有效 KV 访存降至 $1/11.6$。',
    },
  ];
}

const STAGE_H = 436;

export default function NsaThreeBranchExplainer({
  title = '图 2：DeepSeek NSA 三分支硬件对齐稀疏计算与 Sigmoid 门控融合',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildNsaThreeBranchSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="NSA 三分支架构与组共享门控">
      {(step) => {
        const s = step.state;
        const isCmp = s.activeBranch === 'cmp' || s.activeBranch === 'all';
        const isSlc = s.activeBranch === 'slc' || s.activeBranch === 'all';
        const isWin = s.activeBranch === 'win' || s.activeBranch === 'all';

        const focusRect =
          s.phase === 'cmp'
            ? { x: 20, y: 48, w: 282, h: 152, label: '压缩块分布 p_t^cmp' }
            : s.phase === 'accum'
              ? { x: 20, y: 48, w: 638, h: 152, label: '空间重叠累加 → p_t^slc' }
              : s.phase === 'slc'
                ? { x: 354, y: 48, w: 304, h: 152, label: 'GQA 组共享选块 Top-2' }
                : s.phase === 'win'
                  ? { x: 338, y: 256, w: 156, h: 96, label: 'win 独立 KV 投影隔离梯度' }
                  : { x: 20, y: 256, w: 638, h: 96, label: '三路 Sigmoid 门控加权输出' };

        return (
          <Stage width={STAGE_W} height={STAGE_H} label="NSA 三分支稀疏与 GQA 共享">
            <SectionBox
              x={14}
              y={14}
              w={294}
              h={196}
              title="1. cmp 分支：MLP 块压缩打分（l=32, d=16）"
              tone="blue"
            />
            <HeatmapMatrix
              x={18}
              y={74}
              values={s.cmpGrid}
              tone="blue"
              cellW={38}
              cellH={22}
              gap={3}
              min={0}
              max={0.5}
              rowLabels={HEAD_LABELS}
              colLabels={CMP_BLK_LABELS}
              format={(v) => v.toFixed(2)}
              fontSize={10}
            />

            <DataFlowArrow
              points={[
                [310, 134],
                [344, 134],
              ]}
              tone="active"
              active={s.phase === 'accum' || s.phase === 'slc' || s.phase === 'gate'}
              flow={s.phase === 'accum'}
              label="累加"
              labelPos={[327, 114]}
            />

            <SectionBox
              x={346}
              y={14}
              w={320}
              h={196}
              title="2. slc 分支：GQA 组共享选块（l'=64, Top-n）"
              tone="amber"
            />
            <HeatmapMatrix
              x={368}
              y={74}
              values={s.slcGrid}
              tone="amber"
              cellW={48}
              cellH={22}
              gap={4}
              min={0}
              max={0.55}
              rowLabels={HEAD_LABELS}
              colLabels={SLC_BLK_LABELS}
              selected={s.selectedCells}
              selectedTone="amber"
              format={(v) => v.toFixed(2)}
              fontSize={10}
            />

            {/* 下部三分支汇聚区 */}
            <SectionBox
              x={14}
              y={224}
              w={652}
              h={138}
              title="三分支并行计算与硬件对齐张量流（独立 KV 投影 → Sigmoid 门控融合）"
              tone="green"
            />

            <TensorBlock
              x={28}
              y={288}
              w={136}
              h={40}
              tone="blue"
              name="O_cmp（粗览）"
              shape="g_cmp = 0.28"
              active={isCmp}
              muted={!isCmp}
            />
            <TensorBlock
              x={182}
              y={288}
              w={146}
              h={40}
              tone="amber"
              name="O_slc（组共享 n 块）"
              shape="g_slc = 0.44"
              active={isSlc}
              muted={!isSlc}
            />
            <TensorBlock
              x={346}
              y={288}
              w={136}
              h={40}
              tone="green"
              name="O_win（独立 w=512）"
              shape="g_win = 0.61"
              active={isWin}
              muted={!isWin}
            />

            <DataFlowArrow
              points={[
                [486, 308],
                [520, 308],
              ]}
              tone="active"
              active={s.phase === 'gate'}
              flow={s.phase === 'gate'}
            />

            <TensorBlock
              x={522}
              y={286}
              w={130}
              h={44}
              tone="green"
              name="门控融合 o_t*"
              shape="Σ g_t^c · O_c"
              active={s.phase === 'gate'}
              muted={s.phase !== 'gate'}
            />

            <MetricRow
              x={14}
              y={380}
              w={652}
              h={42}
              metrics={[
                {
                  label: 'GQA 共享粒度',
                  value: 'G=16 头共读 l′=64 块',
                  tone: 'amber',
                  active: s.phase === 'slc',
                },
                {
                  label: '64K 有效 KV 访存',
                  value: '5,632 / 65,536 (-11.6×)',
                  tone: 'blue',
                  active: s.phase === 'cmp' || s.phase === 'gate',
                },
                {
                  label: 'A100 64K 速度比',
                  value: '前向 9.0× · 反向 6.0×',
                  tone: 'green',
                  active: s.phase === 'gate',
                },
                { label: '遗留约束', value: '绑定 GQA 与从头预训', tone: 'slate' },
              ]}
            />

            <ActiveFocusFrame
              x={focusRect.x}
              y={focusRect.y}
              w={focusRect.w}
              h={focusRect.h}
              tone="highlight"
              label={focusRect.label}
              visible
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
