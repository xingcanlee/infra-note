import { useMemo } from 'react';
import { Explainer, Stage, type Step } from 'astro-wisp/explainers';
import {
  ActiveFocusFrame,
  HeatmapMatrix,
  MetricRow,
  ProbabilityBars,
  STAGE_W,
  assertMaxHues,
} from '@/explainers/kit';

export interface SinkSwaState {
  mode: 'full' | 'pure_swa' | 'sink_swa' | 'mid_miss';
  values: (number | null)[][];
  masks: boolean[][];
  selected: Set<string>;
  bars: {
    label: string;
    sublabel?: string;
    masked?: boolean;
    bars: {
      value: number;
      tone: 'blue' | 'amber' | 'rose' | 'slate';
      tag?: string;
      highlight?: boolean;
    }[];
  }[];
  localSum: string;
  outShift: string;
  klValue: string;
  sinkStatus: string;
}

const TOKENS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];

// 构造 8x8 因果注意力示例：t0 为 <bos> Attention Sink（logit=6.0），W=3 滑窗覆盖最近 3 个位置 [t-2..t]
function computeAttentionGrid(mode: SinkSwaState['mode']): {
  values: (number | null)[][];
  masks: boolean[][];
  selected: Set<string>;
  row7: number[];
} {
  const n = 8;
  const baseLogits = (r: number, c: number): number => {
    if (mode === 'mid_miss' && c === 2 && r >= 5) return 7.5;
    if (c === 0) return 6.0;
    if (c >= 4) return [0.0, 0.0, 0.0, 0.0, 1.0, 1.2, 1.5, 2.0][c];
    return 0.1 + 0.05 * c;
  };

  const values: (number | null)[][] = [];
  const masks: boolean[][] = [];
  const selected = new Set<string>();
  let row7: number[] = Array(n).fill(0);

  for (let r = 0; r < n; r++) {
    const vRow: (number | null)[] = [];
    const mRow: boolean[] = [];
    const activeCols: number[] = [];
    for (let c = 0; c < n; c++) {
      if (c > r) {
        mRow.push(true);
        continue;
      }
      const inWindow = r - c < 3; // W = 3: [r-2, r-1, r]
      const isSink = c === 0;
      const keep = mode === 'full' ? true : mode === 'pure_swa' ? inWindow : isSink || inWindow;
      mRow.push(!keep);
      if (keep) {
        activeCols.push(c);
        if (isSink && (mode === 'sink_swa' || mode === 'mid_miss')) {
          selected.add(`${r},${c}`);
        }
        if (mode === 'mid_miss' && c === 2 && r === 7) {
          selected.add(`${r},${c}`);
        }
      }
    }
    const maxL = Math.max(...activeCols.map((c) => baseLogits(r, c)));
    const exps = activeCols.map((c) => Math.exp(baseLogits(r, c) - maxL));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    for (let c = 0; c < n; c++) {
      const idx = activeCols.indexOf(c);
      vRow.push(idx >= 0 ? Number((exps[idx] / sumExp).toFixed(3)) : null);
    }
    values.push(vRow);
    masks.push(mRow);
    if (r === 7) {
      row7 = vRow.map((v) => v ?? 0);
    }
  }
  return { values, masks, selected, row7 };
}

export function buildSinkSwaSteps(): Step<SinkSwaState>[] {
  assertMaxHues(['blue', 'amber', 'rose']);

  const full = computeAttentionGrid('full');
  const pure = computeAttentionGrid('pure_swa');
  const sink = computeAttentionGrid('sink_swa');
  const mid = computeAttentionGrid('mid_miss');

  const mkBars = (probs: number[], mode: SinkSwaState['mode']): SinkSwaState['bars'] =>
    TOKENS.map((lbl, idx) => {
      const masked =
        mode === 'pure_swa'
          ? idx < 5
          : mode === 'sink_swa' || mode === 'mid_miss'
            ? idx > 0 && idx < 5
            : false;
      const tone: 'blue' | 'amber' | 'rose' | 'slate' =
        idx === 0
          ? 'amber'
          : mode === 'pure_swa' && !masked
            ? 'rose'
            : mode === 'mid_miss' && idx === 2
              ? 'rose'
              : masked
                ? 'slate'
                : 'blue';
      return {
        label: lbl,
        sublabel:
          idx === 0
            ? 'Sink'
            : idx >= 5
              ? 'W=3'
              : idx === 2 && mode === 'mid_miss'
                ? '事实'
                : undefined,
        masked,
        bars: [
          {
            value: probs[idx],
            tone,
            highlight: (mode === 'pure_swa' && idx >= 5) || (mode === 'sink_swa' && idx === 0),
          },
        ],
      };
    });

  return [
    {
      state: {
        mode: 'full',
        values: full.values,
        masks: full.masks,
        selected: full.selected,
        bars: mkBars(full.row7, 'full'),
        localSum: '3.6%',
        outShift: '0.000',
        klValue: '0.000',
        sinkStatus: 't0 吸收 95.6%',
      },
      caption:
        '步骤 1（Full Causal 基线 $8 \\times 8$）：无意义起始符 $t_0$ 在分母中接管了 $95.6\\%$ 的冗余概率预算，局部滑窗 $t_5..t_7$ 仅承担温和细节权重（合计 $3.6\\%$）。',
    },
    {
      state: {
        mode: 'pure_swa',
        values: pure.values,
        masks: pure.masks,
        selected: pure.selected,
        bars: mkBars(pure.row7, 'pure_swa'),
        localSum: '100.0% (27.8x)',
        outShift: '1.454',
        klValue: '26.47',
        sinkStatus: '缺少 Sink 分布失真',
      },
      caption:
        '步骤 2（Pure SWA $W=3$ 分布失真）：移除 $t_0$ 后分母失去全局吸收项，Softmax 将最近 3 个局部 token $[t_5..t_7]$ 权重重归一化至 $100\\%$（放大 $27.8\\times$），输出特征显著偏离基线。',
    },
    {
      state: {
        mode: 'sink_swa',
        values: sink.values,
        masks: sink.masks,
        selected: sink.selected,
        bars: mkBars(sink.row7, 'sink_swa'),
        localSum: '3.6%',
        outShift: '0.011',
        klValue: '0.138',
        sinkStatus: 'L 型掩码稳态',
      },
      caption:
        '步骤 3（Sink + SWA 构成 L 型因果掩码）：将第 0 列设为固定 Attention Sink 并与 $W=3$ 滑窗拼接，$t_0$ 恢复吸收 $96.4\\%$ 质量，局部窗口回落至 $3.6\\%$，输出偏差缩小 $132\\times$。',
    },
    {
      state: {
        mode: 'mid_miss',
        values: mid.values,
        masks: mid.masks,
        selected: mid.selected,
        bars: mkBars(mid.row7, 'mid_miss'),
        localSum: 't2=0% (全量81%)',
        outShift: '0.310',
        klValue: '39.46',
        sinkStatus: '中段关键事实盲剪',
      },
      caption:
        '步骤 4（L 型掩码的边界：中段遗忘）：若关键事实出现在窗口外 $t_2$（全量下本该占 $81\\%$），静态 Sink + SWA 仍将其强制归零，说明长上下文推理需要转向动态稀疏 NSA。',
    },
  ];
}

const STAGE_H = 382;

export default function SinkSwaExplainer({
  title = '图 1：8×8 因果注意力热图演化：纯滑窗分布失真与 Attention Sink 稳态锚点',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildSinkSwaSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="Attention Sink 与因果掩码演化">
      {(step) => {
        const s = step.state;
        const gridTone = s.mode === 'pure_swa' ? 'rose' : 'blue';
        return (
          <Stage width={STAGE_W} height={STAGE_H} label="8x8 注意力热图与 q7 概率分布">
            <text
              x={58}
              y={14}
              textAnchor="start"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-fg)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              8×8 因果注意力概率矩阵
            </text>
            <HeatmapMatrix
              x={16}
              y={46}
              values={s.values}
              masks={s.masks}
              tone={gridTone}
              cellW={34}
              cellH={26}
              gap={3}
              min={0}
              max={1}
              rowLabels={TOKENS}
              colLabels={TOKENS}
              selected={s.selected}
              selectedTone="amber"
              format={(v) => v.toFixed(2)}
              fontSize={10}
            />

            <text
              x={378}
              y={14}
              textAnchor="start"
              dominantBaseline="central"
              style={{
                fill: 'var(--wisp-fg)',
                fontFamily: 'var(--wisp-font-sans)',
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              最后一步 q7 对历史 token 概率分布
            </text>
            <ProbabilityBars
              x={378}
              y={36}
              w={286}
              h={254}
              maxValue={1.08}
              valueFormat={(v) => `${(v * 100).toFixed(1)}%`}
              items={s.bars}
              legend={[
                { label: 'Sink 锚点', tone: 'amber' },
                { label: '窗口正常', tone: 'blue' },
                { label: '溢出 / 遗忘', tone: 'rose' },
              ]}
            />

            <MetricRow
              x={16}
              y={322}
              w={648}
              h={42}
              metrics={[
                {
                  label: '局部 [t5..t7] 总重',
                  value: s.localSum,
                  tone: s.mode === 'pure_swa' ? 'rose' : 'blue',
                  active: s.mode === 'pure_swa',
                },
                {
                  label: '输出偏移 ||Δo||',
                  value: s.outShift,
                  tone: s.mode === 'pure_swa' ? 'rose' : 'amber',
                },
                {
                  label: '分布散度 KL',
                  value: s.klValue,
                  tone: s.mode === 'pure_swa' || s.mode === 'mid_miss' ? 'rose' : 'blue',
                },
                {
                  label: '当前掩码形态',
                  value: s.sinkStatus,
                  tone: s.mode === 'sink_swa' ? 'amber' : s.mode === 'pure_swa' ? 'rose' : 'slate',
                  active: true,
                },
              ]}
            />

            {s.mode === 'sink_swa' && (
              <ActiveFocusFrame
                x={54}
                y={34}
                w={42}
                h={262}
                tone="highlight"
                label="t0 Sink 锚点列"
                visible
              />
            )}
          </Stage>
        );
      }}
    </Explainer>
  );
}
