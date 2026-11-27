import { useMemo, useState } from 'react';
import { Stage, type Step } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { InteractiveExplainer, LabSlider } from '@/explainers/kit';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import TensorBlock from '@/explainers/kit/TensorBlock';
import {
  RADIUS,
  STAGE_W,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
  useDiagramMotion,
} from '@/explainers/kit/motion';

export interface RopeRotationState {
  delta: number;
  dist: number;
  m: number;
  n: number;
  dotVal: number;
  formulaTex: string;
}

const THETAS = [1.0, 0.1, 0.01, 0.001] as const;
const Q_B = [1.2, -0.4, 0.8, 0.3, -0.6, 1.1, 0.2, -0.5] as const;
const K_B = [-0.5, 0.9, 0.4, -1.1, 0.7, 0.2, -0.8, 0.6] as const;

const Q_BASE_DEG = 20;
const K_BASE_DEG = 55;
const RAD_TO_DEG = 180 / Math.PI;

function compute8dRopeDot(dist: number): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const q0 = Q_B[i];
    const q1 = Q_B[i + 4];
    const k0 = K_B[i];
    const k1 = K_B[i + 4];
    const ang = dist * THETAS[i];
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    sum += (q0 * k0 + q1 * k1) * c + (q0 * k1 - q1 * k0) * s;
  }
  return sum;
}

function deg2xy(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

function arrowHeadPoly(from: [number, number], to: [number, number], size = 7): string {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const bx = to[0] - ux * size;
  const by = to[1] - uy * size;
  const w = size * 0.46;
  return `${to[0].toFixed(1)},${to[1].toFixed(1)} ${(bx + px * w).toFixed(1)},${(by + py * w).toFixed(1)} ${(bx - px * w).toFixed(1)},${(by - py * w).toFixed(1)}`;
}

export function buildRopeRotationSteps(): Step<RopeRotationState>[] {
  assertMaxHues(['active', 'highlight', 'done']);
  return [
    {
      label: '基线 (0,0)',
      duration: 4600,
      state: {
        delta: 0,
        dist: 0,
        m: 0,
        n: 0,
        dotVal: compute8dRopeDot(0),
        formulaTex:
          '$m=0,\\; n=0,\\; d=0 \\;\\Longrightarrow\\; \\langle R_0 q, R_0 k \\rangle = -0.3500$',
      },
      caption: '未旋转基线 ($m=0, n=0$)：两向量相对距离为 $0$，点积仅由内容决定。',
    },
    {
      label: '偏移 (2,5)',
      duration: 4600,
      state: {
        delta: 2,
        dist: 3,
        m: 2,
        n: 5,
        dotVal: compute8dRopeDot(3),
        formulaTex:
          '$R_2^\\top R_5 = R_3 \\;\\Longrightarrow\\; \\langle R_2 q, R_5 k \\rangle = 0.668685$',
      },
      caption: '保持相对距离 $d=3$ 时，$(m=2, n=5)$ 算出全 8 维点积 $0.668685$。',
    },
    {
      label: '平移 (7,10)',
      duration: 4600,
      state: {
        delta: 7,
        dist: 3,
        m: 7,
        n: 10,
        dotVal: compute8dRopeDot(3),
        formulaTex:
          '$R_7^\\top R_{10} = R_3 \\;\\Longrightarrow\\; \\langle R_7 q, R_{10} k \\rangle = 0.668685$',
      },
      caption: '整体向后平移 5 位到 $(7, 10)$，绿色相对夹角与全 8 维点积保持 $0.668685$ 不变。',
    },
    {
      label: '远距 (19,22)',
      duration: 4600,
      state: {
        delta: 19,
        dist: 3,
        m: 19,
        n: 22,
        dotVal: compute8dRopeDot(3),
        formulaTex:
          '$R_{19}^\\top R_{22} = R_3 \\;\\Longrightarrow\\; \\langle R_{19} q, R_{22} k \\rangle = 0.668685$',
      },
      caption: '平移至 $(19, 22)$ 时高频转过近三圈而低频缓转，相对内积依然严格相等。',
    },
  ];
}

export default function RopeRotationExplainer({
  title = '图 2：RoPE 二维旋转相对不变性、频谱速度衰减与通道配对模式',
}: {
  title?: string;
}) {
  assertMaxHues(['active', 'highlight', 'done']);
  const { stepTransition } = useDiagramMotion();
  const [delta, setDelta] = useState(2);
  const [dist, setDist] = useState(3);

  const m = delta;
  const n = delta + dist;
  const dotVal = useMemo(() => compute8dRopeDot(dist), [dist]);

  const cx = 144;
  const cy = 140;
  const r = 72;
  const arcR = 34;

  // 基准向量坐标（在 m=0, n=0 处），外层 motion.g 绕 (cx, cy) 做平滑旋转
  const qBaseTip = deg2xy(cx, cy, r, Q_BASE_DEG);
  const kBaseTip = deg2xy(cx, cy, r, K_BASE_DEG);
  const mDeg = m * THETAS[0] * RAD_TO_DEG;
  const nDeg = n * THETAS[0] * RAD_TO_DEG;

  // 绿色相对角扇形弧：在自身局部坐标系下从 Q_BASE_DEG 扫向 K_BASE_DEG + d * RAD_TO_DEG，
  // 外层随 mDeg 同步旋转，拖动 Δ 时扇形与双向量锁定一起平滑公转
  const rawSweepDeg = K_BASE_DEG - Q_BASE_DEG + dist * THETAS[0] * RAD_TO_DEG;
  const effSweepDeg = ((rawSweepDeg % 360) + 360) % 360;
  const [arcStartX, arcStartY] = deg2xy(cx, cy, arcR, Q_BASE_DEG);
  const [arcEndX, arcEndY] = deg2xy(cx, cy, arcR, Q_BASE_DEG + effSweepDeg);
  const arcPathD = `M ${arcStartX.toFixed(1)} ${arcStartY.toFixed(1)} A ${arcR} ${arcR} 0 ${effSweepDeg > 180 ? 1 : 0} 0 ${arcEndX.toFixed(1)} ${arcEndY.toFixed(1)}`;
  const sectorPathD = `M ${cx} ${cy} L ${arcStartX.toFixed(1)} ${arcStartY.toFixed(1)} A ${arcR} ${arcR} 0 ${effSweepDeg > 180 ? 1 : 0} 0 ${arcEndX.toFixed(1)} ${arcEndY.toFixed(1)} Z`;

  // 直立标签坐标随各自总角平滑绕圆轨道跟随（防止文字随向量倒转）
  const [qLblX, qLblY] = deg2xy(cx, cy, r + 15, Q_BASE_DEG + mDeg);
  const [kLblX, kLblY] = deg2xy(cx, cy, r + 15, K_BASE_DEG + nDeg);

  const qStroke = resolveToneStroke('active');
  const kStroke = resolveToneStroke('highlight');
  const relStroke = resolveToneStroke('done');

  const formulaTex = `$m=${m},\\; n=${n},\\; d=n-m=${dist} \\;\\Longrightarrow\\; \\langle R_{${m}}q,\\, R_{${n}}k \\rangle = ${dotVal.toFixed(6)}$`;
  const caption = `当前绝对位置 $m=${m},\\; n=${n}$（整体平移 $\\Delta=${delta}$），相对距离 $d=${dist}$。拖动整体平移 $\\Delta$ 时，$R_m q$、$R_n k$ 与绿色相对扇形弧在圆周上同步旋转，夹角与全 8 维点积（$${dotVal.toFixed(6)}$）严格不变；右侧四枚频段表盘直观对比 $\\theta_i = 1.0 \\to 0.001\\;\\text{rad/tok}$ 的多尺度衰减。`;

  return (
    <InteractiveExplainer
      title={title}
      label="RoPE 二维旋转几何与多频衰减交互"
      stageMinHeight={420}
      formula={formulaTex}
      caption={caption}
      onReset={() => {
        setDelta(2);
        setDist(3);
      }}
      controls={
        <>
          <LabSlider
            label="整体平移 Δ"
            min={0}
            max={20}
            step={1}
            value={delta}
            valueText={`Δ=${delta} (m=${m})`}
            onChange={setDelta}
          />
          <LabSlider
            label="相对距离 d"
            min={0}
            max={8}
            step={1}
            value={dist}
            valueText={`d=${dist} (n=${n})`}
            onChange={setDist}
          />
        </>
      }
    >
      <Stage width={STAGE_W} height={352} label="RoPE 2D 旋转平面与多频表盘">
        <SectionBox
          x={16}
          y={14}
          w={268}
          h={256}
          title={`第 0 对子空间 ($m=${m},\\;n=${n},\\;d=${dist}$)`}
          tone="active"
        />

        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={resolveToneFill('neutral')}
          fillOpacity={0.25}
          stroke="var(--wisp-border)"
          strokeWidth={1.25}
          strokeDasharray="4 3"
        />
        <line
          x1={cx - r - 12}
          y1={cy}
          x2={cx + r + 12}
          y2={cy}
          stroke="var(--wisp-border)"
          strokeWidth={1}
        />
        <line
          x1={cx}
          y1={cy - r - 12}
          x2={cx}
          y2={cy + r + 12}
          stroke="var(--wisp-border)"
          strokeWidth={1}
        />
        <SvgRichLabel
          x={cx + r + 14}
          y={cy}
          width={26}
          height={18}
          text="$x_0$"
          fontSize={10.5}
          color="var(--wisp-muted)"
          anchor="start"
        />
        <SvgRichLabel
          x={cx + 6}
          y={cy - r - 10}
          width={26}
          height={18}
          text="$x_1$"
          fontSize={10.5}
          color="var(--wisp-muted)"
          anchor="start"
        />
        <circle cx={cx} cy={cy} r={2.5} fill="var(--wisp-muted)" />

        {/* 绿色相对角扇形弧：绕圆心随 mDeg 与双向量同步旋转 */}
        <motion.g
          initial={false}
          animate={{ rotate: -mDeg }}
          transition={stepTransition}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          {rawSweepDeg >= 360 && (
            <circle
              cx={cx}
              cy={cy}
              r={arcR}
              fill="none"
              stroke={relStroke}
              strokeWidth={1.25}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
          )}
          <path d={sectorPathD} fill={resolveToneFill('done')} fillOpacity={0.35} />
          <path
            d={arcPathD}
            fill="none"
            stroke={relStroke}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </motion.g>

        {/* 查询向量 R_m q：绕圆心平滑旋转 */}
        <motion.g
          initial={false}
          animate={{ rotate: -mDeg }}
          transition={stepTransition}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={qBaseTip[0]}
            y2={qBaseTip[1]}
            stroke={qStroke}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <polygon points={arrowHeadPoly([cx, cy], qBaseTip)} fill={qStroke} />
        </motion.g>

        {/* 键向量 R_n k：绕圆心平滑旋转 */}
        <motion.g
          initial={false}
          animate={{ rotate: -nDeg }}
          transition={stepTransition}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={kBaseTip[0]}
            y2={kBaseTip[1]}
            stroke={kStroke}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <polygon points={arrowHeadPoly([cx, cy], kBaseTip)} fill={kStroke} />
        </motion.g>

        {/* 直立随动向量标签 */}
        <motion.g initial={false} animate={{ x: qLblX, y: qLblY }} transition={stepTransition}>
          <SvgRichLabel
            x={0}
            y={0}
            width={44}
            height={18}
            text={`$R_{${m}}q$`}
            fontSize={10.5}
            fontWeight={700}
            color={qStroke}
          />
        </motion.g>
        <motion.g initial={false} animate={{ x: kLblX, y: kLblY }} transition={stepTransition}>
          <SvgRichLabel
            x={0}
            y={0}
            width={44}
            height={18}
            text={`$R_{${n}}k$`}
            fontSize={10.5}
            fontWeight={700}
            color={kStroke}
          />
        </motion.g>

        <SvgRichLabel
          x={cx}
          y={248}
          width={236}
          height={20}
          text={`相对偏移 $(n-m)\\theta_0=${dist}\\;\\text{rad}$${rawSweepDeg >= 360 ? '（含 $+1$ 圈）' : ''}`}
          fontSize={10.5}
          fontWeight={600}
          color={relStroke}
        />

        {/* 右上：4 个频段旋转迷你表盘 */}
        <SectionBox
          x={300}
          y={14}
          w={364}
          h={154}
          title={'4 频段旋转速度表盘 ($\\theta_i = 10^{-i}\\;\\text{rad/tok}$)'}
          tone="active"
        />

        {THETAS.map((theta, idx) => {
          const dcx = 346 + idx * 90;
          const dcy = 92;
          const dr = 28;
          const qDialDeg = m * theta * RAD_TO_DEG;
          const kDialDeg = n * theta * RAD_TO_DEG;
          const qDialTip = deg2xy(dcx, dcy, dr - 3, Q_BASE_DEG);
          const kDialTip = deg2xy(dcx, dcy, dr - 3, K_BASE_DEG);
          return (
            <g key={theta}>
              <rect
                x={dcx - 40}
                y={40}
                width={80}
                height={118}
                rx={RADIUS}
                fill="var(--wisp-bg)"
                stroke="var(--wisp-border)"
                strokeWidth={1}
              />
              <SvgRichLabel
                x={dcx}
                y={52}
                width={76}
                height={16}
                text={`$\\theta_{${idx}}=${theta}$`}
                fontSize={10}
                fontWeight={600}
                color="var(--wisp-fg)"
                family="mono"
              />
              <circle
                cx={dcx}
                cy={dcy}
                r={dr}
                fill="var(--wisp-surface)"
                fillOpacity={0.5}
                stroke="var(--wisp-border)"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
              <line
                x1={dcx - dr}
                y1={dcy}
                x2={dcx + dr}
                y2={dcy}
                stroke="var(--wisp-border)"
                strokeWidth={0.8}
              />
              <line
                x1={dcx}
                y1={dcy - dr}
                x2={dcx}
                y2={dcy + dr}
                stroke="var(--wisp-border)"
                strokeWidth={0.8}
              />

              <motion.g
                initial={false}
                animate={{ rotate: -qDialDeg }}
                transition={stepTransition}
                style={{ transformOrigin: `${dcx}px ${dcy}px` }}
              >
                <line
                  x1={dcx}
                  y1={dcy}
                  x2={qDialTip[0]}
                  y2={qDialTip[1]}
                  stroke={qStroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </motion.g>
              <motion.g
                initial={false}
                animate={{ rotate: -kDialDeg }}
                transition={stepTransition}
                style={{ transformOrigin: `${dcx}px ${dcy}px` }}
              >
                <line
                  x1={dcx}
                  y1={dcy}
                  x2={kDialTip[0]}
                  y2={kDialTip[1]}
                  stroke={kStroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </motion.g>
              <circle cx={dcx} cy={dcy} r={2.2} fill="var(--wisp-fg)" />

              <text
                x={dcx}
                y={134}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: qStroke,
                  fontFamily: 'var(--wisp-font-mono)',
                  fontSize: 10,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {`m:${(m * theta).toFixed(theta < 0.01 ? 3 : 2)}`}
              </text>
              <text
                x={dcx}
                y={147}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fill: 'var(--wisp-muted)',
                  fontFamily: 'var(--wisp-font-mono)',
                  fontSize: 10,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {`Δ:${(dist * theta).toFixed(theta < 0.01 ? 3 : 2)}r`}
              </text>
            </g>
          );
        })}

        {/* 右下：NeoX vs GPT-J 通道配对等价布局 */}
        <TensorBlock
          x={300}
          y={196}
          w={174}
          h={42}
          tone="active"
          name="NeoX 配对 (vLLM 默认)"
          shape={'前半 $i \\leftrightarrow$ 后半 $i+d/2$'}
          splits={[{ ratio: 0.5, leftLabel: '[0..d/2)', rightLabel: '[d/2..d)' }]}
        />
        <TensorBlock
          x={490}
          y={196}
          w={174}
          h={42}
          tone="highlight"
          name="GPT-J / DeepSeek 复数"
          shape="相邻 $(2i, 2i+1)$ · V4 尾切片"
          splits={[{ ratio: 0.25 }, { ratio: 0.5 }, { ratio: 0.75 }]}
        />
        {(['0,1', '2,3', '4,5', '6,7'] as const).map((lbl, idx) => (
          <text
            key={lbl}
            x={490 + (idx + 0.5) * 43.5}
            y={217}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fill: 'var(--wisp-fg)',
              fontFamily: 'var(--wisp-font-mono)',
              fontSize: 10.5,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lbl}
          </text>
        ))}

        <MetricRow
          x={16}
          y={286}
          w={648}
          h={44}
          metrics={[
            { label: '查询位置 $m$', value: `$m = ${m}$`, tone: 'active' },
            { label: '键位置 $n$', value: `$n = ${n}$`, tone: 'highlight' },
            {
              label: '相对距离 $d = n-m$',
              value: `$${dist}\\;\\text{tokens}$`,
              tone: 'done',
              active: true,
            },
            {
              label: '全 8 维点积 (不变量)',
              value: `$${dotVal.toFixed(6)}$`,
              tone: 'done',
              active: true,
            },
          ]}
        />
      </Stage>
    </InteractiveExplainer>
  );
}
