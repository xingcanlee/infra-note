import { useMemo } from 'react';
import { Explainer, Stage, type Step, type Tone } from 'astro-wisp/explainers';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import { MetricRow, SectionBox } from '@/explainers/kit/MetricRow';
import SvgRichLabel from '@/explainers/kit/SvgRichLabel';
import TensorBlock from '@/explainers/kit/TensorBlock';
import {
  STAGE_W,
  assertMaxHues,
  resolveToneFill,
  resolveToneStroke,
} from '@/explainers/kit/motion';

export interface RopeRotationState {
  stepIndex: number;
  m: number;
  n: number;
  qAngleDeg: number;
  kAngleDeg: number;
  relAngleDeg: number;
  dotVal: string;
  angleMatrix: (number | null)[][];
  colLabels: string[];
  highlightFreqs: boolean;
  highlightPairing: boolean;
}

const FREQ_LABELS = ['$i=0\\;(1.000)$', '$i=1\\;(0.100)$', '$i=2\\;(0.010)$', '$i=3\\;(0.001)$'];
const THETAS = [1.0, 0.1, 0.01, 0.001];

function deg2xy(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

export function buildRopeRotationSteps(): Step<RopeRotationState>[] {
  const tones: Tone[] = ['active', 'highlight', 'done'];
  assertMaxHues(tones);

  const makeAngles = (positions: number[]): (number | null)[][] =>
    THETAS.map((th) => positions.map((p) => Number(((p * th) % (2 * Math.PI)).toFixed(2))));

  const radToDeg = (rad: number) => (rad * 180) / Math.PI;
  const qBaseDeg = 20;
  const kBaseDeg = 55;
  const stepTheta0 = radToDeg(1.0); // 57.2958 deg/token

  return [
    {
      state: {
        stepIndex: 0,
        m: 0,
        n: 0,
        qAngleDeg: qBaseDeg,
        kAngleDeg: kBaseDeg,
        relAngleDeg: kBaseDeg - qBaseDeg,
        dotVal: '$\\cos(35^\\circ) = +0.819$',
        angleMatrix: makeAngles([0, 1, 2, 5]),
        colLabels: ['$m=0$', '$m=1$', '$m=2$', '$m=5$'],
        highlightFreqs: false,
        highlightPairing: false,
      },
      caption:
        '未旋转前（$m=0, n=0$），第 0 对二维子空间 $(x_0, x_1)$ 中的向量 $q$ 与 $k$ 夹角仅由自身内容决定；若此时把语序打乱，注意力点积仍毫无变化。',
    },
    {
      state: {
        stepIndex: 1,
        m: 2,
        n: 5,
        qAngleDeg: qBaseDeg + 2 * stepTheta0,
        kAngleDeg: kBaseDeg + 5 * stepTheta0,
        relAngleDeg: kBaseDeg - qBaseDeg + 3 * stepTheta0,
        dotVal: '全 8 维点积 $= 0.668685$',
        angleMatrix: makeAngles([2, 5, 7, 10]),
        colLabels: ['$m=2$', '$n=5$', '$m=7$', '$n=10$'],
        highlightFreqs: false,
        highlightPairing: false,
      },
      caption:
        '将位置 $m=2$ 旋转 $2\\theta_0$、位置 $n=5$ 旋转 $5\\theta_0$，由于正交矩阵满足 $R_m^\\top R_n = R_{n-m}$，两向量的相对夹角偏移精确等于 $(n - m)\\theta_0 = 3\\,\\text{rad}$，全 8 维点积为 $0.668685$。',
    },
    {
      state: {
        stepIndex: 2,
        m: 7,
        n: 10,
        qAngleDeg: qBaseDeg + 7 * stepTheta0,
        kAngleDeg: kBaseDeg + 10 * stepTheta0,
        relAngleDeg: kBaseDeg - qBaseDeg + 3 * stepTheta0,
        dotVal: '点积 $= 0.668685$ (不变)',
        angleMatrix: makeAngles([2, 5, 7, 10]),
        colLabels: ['$m=2$', '$n=5$', '$m=7$', '$n=10$'],
        highlightFreqs: false,
        highlightPairing: false,
      },
      caption:
        '将两个 token 一起向后平移 5 位到 $(m=7, n=10)$：两根向量在圆周上同步旋转了 $5\\theta_0$，但绿色相对弧角与全 8 维点积依然锁定为 $0.668685$。',
    },
    {
      state: {
        stepIndex: 3,
        m: 19,
        n: 22,
        qAngleDeg: qBaseDeg + 19 * stepTheta0,
        kAngleDeg: kBaseDeg + 22 * stepTheta0,
        relAngleDeg: kBaseDeg - qBaseDeg + 3 * stepTheta0,
        dotVal: '同为 $0.668685$ (严格相等)',
        angleMatrix: makeAngles([2, 5, 19, 22]),
        colLabels: ['$m=2$', '$n=5$', '$m=19$', '$n=22$'],
        highlightFreqs: false,
        highlightPairing: false,
      },
      caption:
        '再往后整体平移 12 个 token 到 $(m=19, n=22)$：$R_{19} q$ 与 $R_{22} k$ 各自在圆周上多转约 $2.71$ 圈（共 $+17\\,\\text{rad}$），相对夹角仍保持 $3\\theta_0$，绝对坐标在点积中彻底化简为相对位移。',
    },
    {
      state: {
        stepIndex: 4,
        m: 19,
        n: 22,
        qAngleDeg: qBaseDeg + 19 * stepTheta0,
        kAngleDeg: kBaseDeg + 22 * stepTheta0,
        relAngleDeg: kBaseDeg - qBaseDeg + 3 * stepTheta0,
        dotVal: '多频衰减跨度 1..1000',
        angleMatrix: makeAngles([1, 10, 100, 1000]),
        colLabels: ['$m=1$', '$m=10$', '$m=100$', '$m=1000$'],
        highlightFreqs: true,
        highlightPairing: false,
      },
      caption:
        '右上方热力图展示频率衰减：最高频 $i=0$（$1.0\\;\\text{rad/tok}$）每步快转紧盯邻词，最低频 $i=3$（$0.001\\;\\text{rad/tok}$）跨越千词仅旋转 $1.00\\;\\text{rad}$，支撑长程衰减。',
    },
    {
      state: {
        stepIndex: 5,
        m: 19,
        n: 22,
        qAngleDeg: qBaseDeg + 19 * stepTheta0,
        kAngleDeg: kBaseDeg + 22 * stepTheta0,
        relAngleDeg: kBaseDeg - qBaseDeg + 3 * stepTheta0,
        dotVal: 'NeoX vs GPT-J 差 $= 0.00$',
        angleMatrix: makeAngles([1, 10, 100, 1000]),
        colLabels: ['$m=1$', '$m=10$', '$m=100$', '$m=1000$'],
        highlightFreqs: false,
        highlightPairing: true,
      },
      caption:
        '工程上 rotate_neox 将前半与后半通道配对 $(i, i+d/2)$，DeepSeek 复数 rotate_gptj 则配对相邻通道 $(2i, 2i+1)$；权重加载时重排切片索引即可让两者数值严格等价。',
    },
  ];
}

const FREQ_FOCUS_CELLS = new Set(['0,0', '0,1', '3,2', '3,3']);

export default function RopeRotationExplainer({
  title = '图 2：RoPE 二维旋转相对不变性、频谱速度衰减与通道配对模式',
}: {
  title?: string;
}) {
  const steps = useMemo(() => buildRopeRotationSteps(), []);

  return (
    <Explainer steps={steps} title={title} label="RoPE 二维旋转几何与多频衰减交互">
      {(step) => {
        const s = step.state;
        const cx = 148;
        const cy = 150;
        const r = 78;
        const [qx, qy] = deg2xy(cx, cy, r, s.qAngleDeg);
        const [kx, ky] = deg2xy(cx, cy, r, s.kAngleDeg);
        const arcR = 34;
        const [aqx, aqy] = deg2xy(cx, cy, arcR, s.qAngleDeg);
        const [akx, aky] = deg2xy(cx, cy, arcR, s.kAngleDeg);

        const qStroke = resolveToneStroke('active');
        const kStroke = resolveToneStroke('highlight');
        const relStroke = resolveToneStroke('done');

        return (
          <Stage width={STAGE_W} height={352} label="RoPE 2D旋转平面与多频相位矩阵">
            {/* Left: Clean geometric 2D rotation plane */}
            <SectionBox
              x={16}
              y={16}
              w={268}
              h={250}
              title={`第 0 对子空间 ($m=${s.m},\\;n=${s.n},\\;n-m=${s.n - s.m}$)`}
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

            {/* Relative angle arc */}
            <path
              d={`M ${aqx.toFixed(1)} ${aqy.toFixed(1)} A ${arcR} ${arcR} 0 ${s.relAngleDeg % 360 > 180 ? 1 : 0} 0 ${akx.toFixed(1)} ${aky.toFixed(1)}`}
              fill="none"
              stroke={relStroke}
              strokeWidth={2}
            />
            <SvgRichLabel
              x={cx}
              y={cy + arcR + 18}
              width={160}
              height={20}
              text={`相对偏移 $(n-m)=${s.n - s.m}\\;\\text{rad}$`}
              fontSize={10.5}
              fontWeight={600}
              color={relStroke}
            />

            {/* Vector R_m q */}
            <line x1={cx} y1={cy} x2={qx} y2={qy} stroke={qStroke} strokeWidth={2.5} />
            <circle cx={qx} cy={qy} r={4} fill={qStroke} />
            <SvgRichLabel
              x={qx + (qx >= cx ? 8 : -8)}
              y={qy + (qy <= cy ? -8 : 10)}
              width={56}
              height={20}
              text={`$R_{${s.m}} q$`}
              fontSize={11}
              fontWeight={700}
              color={qStroke}
              anchor={qx >= cx ? 'start' : 'end'}
            />

            {/* Vector R_n k */}
            <line x1={cx} y1={cy} x2={kx} y2={ky} stroke={kStroke} strokeWidth={2.5} />
            <circle cx={kx} cy={ky} r={4} fill={kStroke} />
            <SvgRichLabel
              x={kx + (kx >= cx ? 8 : -8)}
              y={ky + (ky <= cy ? -8 : 10)}
              width={56}
              height={20}
              text={`$R_{${s.n}} k$`}
              fontSize={11}
              fontWeight={700}
              color={kStroke}
              anchor={kx >= cx ? 'start' : 'end'}
            />

            {/* Right top: Frequency pair phase decay matrix */}
            <HeatmapMatrix
              x={304}
              y={14}
              title="各频段累积旋转角 ($\text{rad},\; \bmod 2\pi$)"
              tone="active"
              values={s.angleMatrix}
              rowLabels={FREQ_LABELS}
              colLabels={s.colLabels}
              selected={s.highlightFreqs ? FREQ_FOCUS_CELLS : undefined}
              selectedTone="highlight"
              rowLabelW={86}
              cellW={64}
              cellH={26}
              gap={4}
              min={0}
              max={6.28}
              format={(v) => (v === null ? '--' : `${v.toFixed(2)}`)}
              showLegend={false}
              fontSize={10.5}
            />

            {/* Right bottom: NeoX vs GPT-J channel pairing */}
            <TensorBlock
              x={304}
              y={198}
              w={172}
              h={40}
              tone="active"
              name="NeoX 配对 (vLLM 默认)"
              shape="前半 $i \leftrightarrow$ 后半 $i+d/2$"
              active={s.highlightPairing}
              splits={[{ ratio: 0.5, leftLabel: '[0..d/2)', rightLabel: '[d/2..d)' }]}
            />
            <TensorBlock
              x={492}
              y={198}
              w={172}
              h={40}
              tone="highlight"
              name="GPT-J / DeepSeek 复数"
              shape="相邻 $(2i, 2i+1)$ · V4 尾切片"
              active={s.highlightPairing}
              splits={[{ ratio: 0.25 }, { ratio: 0.5 }, { ratio: 0.75 }]}
            />
            {(['0,1', '2,3', '4,5', '6,7'] as const).map((lbl, idx) => (
              <text
                key={lbl}
                x={492 + (idx + 0.5) * 43}
                y={218}
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

            {/* Bottom metrics */}
            <MetricRow
              x={16}
              y={286}
              w={648}
              h={42}
              metrics={[
                { label: '查询位置 $m$', value: `$m = ${s.m}$`, tone: 'active' },
                { label: '键位置 $n$', value: `$n = ${s.n}$`, tone: 'highlight' },
                {
                  label: '相对距离 $n - m$',
                  value: `${s.n - s.m} tokens`,
                  tone: 'done',
                  active: true,
                },
                { label: '内积不变量', value: s.dotVal, tone: 'done' },
              ]}
            />
          </Stage>
        );
      }}
    </Explainer>
  );
}
