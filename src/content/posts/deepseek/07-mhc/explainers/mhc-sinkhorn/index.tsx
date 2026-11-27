import { useMemo, useState } from 'react';
import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import {
  InteractiveExplainer,
  LabSegmented,
  LabSlider,
  MetricRow,
  RADIUS,
  RADIUS_SM,
  SvgRichLabel,
  useDiagramMotion,
} from '@/explainers/kit';
import {
  SINKHORN_TRAJECTORY_COL,
  SINKHORN_TRAJECTORY_ROW,
  buildMhcSinkhornSteps,
  computeSinkhornSnapshot,
  type SinkhornHalfStep,
} from './steps';
import './style.css';

export { buildMhcSinkhornSteps };

export interface MhcSinkhornExplainerProps {
  title?: string;
}

const PLOT_X = 398;
const PLOT_Y = 56;
const PLOT_W = 248;
const PLOT_H = 118;
const LOG_TOP = 0.6;
const LOG_BOT = -6.0;

function errToPlotY(err: number): number {
  const logVal = Math.max(LOG_BOT, Math.min(LOG_TOP, Math.log10(Math.max(err, 1e-6))));
  const ratio = (LOG_TOP - logVal) / (LOG_TOP - LOG_BOT);
  return PLOT_Y + ratio * PLOT_H;
}

function iterToPlotX(k: number, halfStep: SinkhornHalfStep): number {
  const stepFrac = k === 0 ? 0 : halfStep === 'col' ? k - 0.5 : k;
  return PLOT_X + (stepFrac / 20) * PLOT_W;
}

export default function MhcSinkhornExplainer({ title }: MhcSinkhornExplainerProps) {
  const [iter, setIter] = useState<number>(1);
  const [halfStep, setHalfStep] = useState<SinkhornHalfStep>('row');
  const { stepTransition } = useDiagramMotion();

  const snap = useMemo(() => computeSinkhornSnapshot(iter, halfStep), [iter, halfStep]);

  const rowPath = useMemo(() => {
    return SINKHORN_TRAJECTORY_ROW.map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${iterToPlotX(pt.k, 'row').toFixed(1)} ${errToPlotY(pt.maxErr).toFixed(1)}`,
    ).join(' ');
  }, []);

  const colPath = useMemo(() => {
    return SINKHORN_TRAJECTORY_COL.map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${iterToPlotX(pt.k, pt.k === 0 ? 'row' : 'col').toFixed(1)} ${errToPlotY(pt.maxErr).toFixed(1)}`,
    ).join(' ');
  }, []);

  const curPlotX = iterToPlotX(snap.k, snap.halfStep);
  const curPlotY = errToPlotY(snap.maxErr);

  const cellW = 86;
  const cellH = 50;
  const cellGap = 8;
  const matX = 32;
  const matY = 56;

  const colSumTone =
    snap.maxColErr < 0.005 ? 'done' : snap.k > 0 && halfStep === 'col' ? 'active' : 'highlight';
  const rowSumTone =
    snap.maxRowErr < 0.005 ? 'done' : snap.k > 0 && halfStep === 'row' ? 'active' : 'highlight';
  const isConverged = snap.maxErr < 0.005;

  const formulaTex =
    snap.k === 0
      ? `$\\mathbf{M}^{(0)} = \\begin{bmatrix}1 & 3\\\\ 1 & 1\\end{bmatrix},\\; \\max|\\text{sum}-1| = ${snap.maxErr.toFixed(2)}$`
      : halfStep === 'col'
        ? `$\\mathcal{T}_c(\\mathbf{M}^{(${snap.k - 1})}),\\; \\text{列和}=[1.00, 1.00],\\; \\text{行和}=[${snap.rowSums[0].toFixed(3)}, ${snap.rowSums[1].toFixed(3)}]$`
        : `$\\mathbf{M}^{(${snap.k})} = \\mathcal{T}_r\\mathcal{T}_c(\\mathbf{M}^{(${snap.k - 1})}),\\; \\max|\\text{sum}-1| = ${snap.maxErr.toFixed(4)}$`;

  const captionText =
    snap.k === 0
      ? '初始正矩阵 $\\mathbf{M}^{(0)}$ 的列和为 $[2.00, 4.00]$、行和为 $[4.00, 2.00]$，拖动滑块可逐轮观察交替投影如何把四项和拉平到 $1.00$。'
      : halfStep === 'col'
        ? `第 ${snap.k} 轮列归一半步：两列和立刻对齐 $1.000$，此时行和仍偏离（最大偏差 ${snap.maxRowErr.toFixed(4)}），切回行归一整步即可接力收拢。`
        : `第 ${snap.k} 轮行归一整步：行和对齐 $1.000$，列和最大偏差收敛至 ${snap.maxColErr.toFixed(4)}；到第 20 轮时矩阵稳定落在对称双随机稳态。`;

  return (
    <InteractiveExplainer
      title={title}
      label="2×2 Sinkhorn-Knopp 双随机投影收敛微实验"
      stageMinHeight={300}
      formula={formulaTex}
      caption={captionText}
      onReset={() => {
        setIter(1);
        setHalfStep('row');
      }}
      controls={
        <>
          <LabSlider
            label="迭代轮次 k"
            min={0}
            max={20}
            step={1}
            value={iter}
            valueText={`k = ${iter}`}
            onChange={setIter}
          />
          <LabSegmented
            ariaLabel="切换投影半步"
            options={[
              { id: 'col', label: '列归一半步' },
              { id: 'row', label: '行归一整步' },
            ]}
            value={halfStep}
            onChange={setHalfStep}
          />
        </>
      }
    >
      <div className="wisp-kit-svg-frame">
        <svg
          className="mhc-sk-svg"
          viewBox="0 0 680 264"
          role="img"
          aria-label="2×2 Sinkhorn-Knopp 矩阵元素与残差收敛曲线"
        >
          {/* 左面板：2×2 实时矩阵与行列和 */}
          <rect
            x={14}
            y={12}
            width={324}
            height={240}
            rx={RADIUS}
            fill="var(--wisp-surface)"
            stroke="var(--wisp-border)"
          />
          <SvgRichLabel
            x={28}
            y={32}
            width={220}
            height={20}
            anchor="start"
            fontSize={11.5}
            fontWeight={700}
            text={
              snap.k === 0
                ? '初始矩阵 $\\mathbf{M}^{(0)}$'
                : halfStep === 'col'
                  ? `第 ${snap.k} 轮列归一 $\\mathcal{T}_c(\\mathbf{M}^{(${snap.k - 1})})$`
                  : `第 ${snap.k} 轮整步 $\\mathbf{M}^{(${snap.k})}$`
            }
          />
          <rect
            x={252}
            y={21}
            width={74}
            height={20}
            rx={RADIUS_SM}
            fill={isConverged ? toneFill('done') : toneFill('active')}
            stroke={isConverged ? toneStroke('done') : toneStroke('active')}
          />
          <text
            x={289}
            y={34.5}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill="var(--wisp-fg)"
          >
            {isConverged ? '双随机稳态' : snap.k === 0 ? '未归一' : '收敛中'}
          </text>

          {/* 2×2 矩阵单元 */}
          {snap.matrix.map((row, ri) =>
            row.map((val, ci) => {
              const cx = matX + ci * (cellW + cellGap);
              const cy = matY + ri * (cellH + cellGap);
              const barMaxW = cellW - 12;
              const barW = Math.max(4, Math.min(barMaxW, (val / 3.0) * barMaxW));
              const cellTone = isConverged ? 'done' : 'active';

              return (
                <g key={`cell-${ri}-${ci}`}>
                  <rect
                    x={cx}
                    y={cy}
                    width={cellW}
                    height={cellH}
                    rx={RADIUS_SM}
                    fill={toneFill(cellTone)}
                    stroke={toneStroke(cellTone)}
                    strokeWidth={1.35}
                  />
                  <rect
                    x={cx + 6}
                    y={cy + cellH - 12}
                    width={barMaxW}
                    height={5}
                    rx={RADIUS_SM}
                    fill="var(--wisp-bg)"
                  />
                  <motion.rect
                    x={cx + 6}
                    y={cy + cellH - 12}
                    height={5}
                    rx={RADIUS_SM}
                    initial={false}
                    animate={{ width: barW }}
                    transition={stepTransition}
                    fill={toneStroke(cellTone)}
                  />
                  <text
                    x={cx + cellW / 2}
                    y={cy + 23}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={700}
                    fill="var(--wisp-fg)"
                    style={{ fontFamily: 'var(--wisp-font-mono)' }}
                  >
                    {val.toFixed(3)}
                  </text>
                </g>
              );
            }),
          )}

          {/* 右侧行和 */}
          {snap.rowSums.map((rs, ri) => {
            const rx = matX + 2 * (cellW + cellGap) + 6;
            const ry = matY + ri * (cellH + cellGap);
            return (
              <g key={`rsum-${ri}`}>
                <rect
                  x={rx}
                  y={ry}
                  width={98}
                  height={cellH}
                  rx={RADIUS_SM}
                  fill={toneFill(rowSumTone)}
                  stroke={toneStroke(rowSumTone)}
                  strokeWidth={1.35}
                />
                <text
                  x={rx + 49}
                  y={ry + 18}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--wisp-muted)"
                >
                  {`行 ${ri} 和`}
                </text>
                <text
                  x={rx + 49}
                  y={ry + 37}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill={toneStroke(rowSumTone)}
                  style={{ fontFamily: 'var(--wisp-font-mono)' }}
                >
                  {rs.toFixed(3)}
                </text>
              </g>
            );
          })}

          {/* 底部列和 */}
          {snap.colSums.map((cs, ci) => {
            const cx = matX + ci * (cellW + cellGap);
            const cy = matY + 2 * (cellH + cellGap) + 4;
            return (
              <g key={`csum-${ci}`}>
                <rect
                  x={cx}
                  y={cy}
                  width={cellW}
                  height={38}
                  rx={RADIUS_SM}
                  fill={toneFill(colSumTone)}
                  stroke={toneStroke(colSumTone)}
                  strokeWidth={1.35}
                />
                <text
                  x={cx + cellW / 2}
                  y={cy + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--wisp-muted)"
                >
                  {`列 ${ci} 和`}
                </text>
                <text
                  x={cx + cellW / 2}
                  y={cy + 30}
                  textAnchor="middle"
                  fontSize={11.5}
                  fontWeight={700}
                  fill={toneStroke(colSumTone)}
                  style={{ fontFamily: 'var(--wisp-font-mono)' }}
                >
                  {cs.toFixed(3)}
                </text>
              </g>
            );
          })}

          <text
            x={matX + 2 * (cellW + cellGap) + 55}
            y={matY + 2 * (cellH + cellGap) + 27}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill="var(--wisp-muted)"
          >
            目标 → 1.000
          </text>

          <SvgRichLabel
            x={28}
            y={234}
            width={296}
            height={18}
            anchor="start"
            fontSize={10}
            color="var(--wisp-muted)"
            text={
              '极限稳态：$\\frac{1}{1+\\sqrt{3}}\\approx 0.366,\\; \\frac{\\sqrt{3}}{1+\\sqrt{3}}\\approx 0.634$'
            }
          />

          {/* 右面板：残差收敛对数曲线 + 实时指标 */}
          <rect
            x={350}
            y={12}
            width={316}
            height={240}
            rx={RADIUS}
            fill="var(--wisp-surface)"
            stroke="var(--wisp-border)"
          />
          <text x={364} y={32} fontSize={11.5} fontWeight={700} fill="var(--wisp-fg)">
            行列和最大偏差收敛轨迹（对数纵轴）
          </text>

          {/* 网格线 */}
          {[0, -2, -4, -6].map((exp) => {
            const gy = errToPlotY(10 ** exp);
            return (
              <g key={`grid-${exp}`}>
                <line
                  x1={PLOT_X}
                  y1={gy}
                  x2={PLOT_X + PLOT_W}
                  y2={gy}
                  stroke="var(--wisp-border)"
                  strokeDasharray="3 3"
                />
                <SvgRichLabel
                  x={PLOT_X - 6}
                  y={gy}
                  width={34}
                  height={16}
                  anchor="end"
                  fontSize={9.5}
                  color="var(--wisp-muted)"
                  text={`$10^{${exp}}$`}
                />
              </g>
            );
          })}

          {/* 坐标轴框 */}
          <rect
            x={PLOT_X}
            y={PLOT_Y}
            width={PLOT_W}
            height={PLOT_H}
            rx={RADIUS_SM}
            fill="none"
            stroke="var(--wisp-border)"
          />

          {[0, 5, 10, 15, 20].map((tk) => {
            const tx = iterToPlotX(tk, 'row');
            return (
              <text
                key={`xt-${tk}`}
                x={tx}
                y={PLOT_Y + PLOT_H + 14}
                textAnchor="middle"
                fontSize={10}
                fill="var(--wisp-muted)"
                style={{ fontFamily: 'var(--wisp-font-mono)' }}
              >
                {tk}
              </text>
            );
          })}

          {/* 列半步虚线与行整步实线 */}
          <path
            d={colPath}
            fill="none"
            stroke={toneStroke('active')}
            strokeWidth={1.35}
            strokeDasharray="4 3"
            opacity={0.7}
          />
          <path
            d={rowPath}
            fill="none"
            stroke={toneStroke('done')}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 当前 k 标记竖线与光点 */}
          <motion.line
            y1={PLOT_Y}
            y2={PLOT_Y + PLOT_H}
            initial={false}
            animate={{ x1: curPlotX, x2: curPlotX }}
            transition={stepTransition}
            stroke={toneStroke('highlight')}
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
          <motion.circle
            r={5}
            initial={false}
            animate={{ cx: curPlotX, cy: curPlotY }}
            transition={stepTransition}
            fill={toneStroke('highlight')}
            stroke="var(--wisp-bg)"
            strokeWidth={1.5}
          />

          <MetricRow
            x={364}
            y={198}
            w={288}
            h={42}
            gap={8}
            metrics={[
              {
                label: '最大行偏差',
                value: snap.maxRowErr.toFixed(4),
                tone: rowSumTone,
                active: true,
              },
              {
                label: '最大列偏差',
                value: snap.maxColErr.toFixed(4),
                tone: colSumTone,
                active: true,
              },
            ]}
          />
        </svg>
      </div>
    </InteractiveExplainer>
  );
}
