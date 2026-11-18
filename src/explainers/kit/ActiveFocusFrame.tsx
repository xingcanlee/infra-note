import { motion } from 'motion/react';
import {
  RADIUS,
  RADIUS_SM,
  STAGE_W,
  estimateTextWidth,
  resolveToneStroke,
  useDiagramMotion,
  type AnyTone,
} from './motion';

export interface ActiveFocusFrameProps {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: AnyTone;
  label?: string;
  visible?: boolean;
  dashed?: boolean;
}

/** 步间平滑滑移的高亮焦距框（配合 prefers-reduced-motion）。 */
export default function ActiveFocusFrame({
  x,
  y,
  w,
  h,
  tone = 'highlight',
  label,
  visible = true,
  dashed = false,
}: ActiveFocusFrameProps) {
  const { stepTransition } = useDiagramMotion();
  const stroke = resolveToneStroke(tone);
  const labelW = label ? Math.max(44, Math.ceil(estimateTextWidth(label, 10.5, 'sans')) + 14) : 0;
  const badgeX = Math.max(4, Math.min(STAGE_W - labelW - 4, x + 6));
  const badgeY = Math.max(2, y - 9);

  return (
    <motion.g
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={stepTransition}
      style={{ pointerEvents: 'none' }}
    >
      {/* 静态定位框：确保步切换首帧 getBoundingClientRect() 立即反映目标边界，供移动端自动居中 */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke="none"
        data-focus-target={visible ? '' : undefined}
      />
      <motion.rect
        initial={false}
        x={x}
        y={y}
        width={w}
        height={h}
        animate={{ x, y, width: w, height: h }}
        transition={stepTransition}
        rx={RADIUS}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray={dashed ? '5 3' : undefined}
      />
      {label && (
        <motion.g initial={false} animate={{ x: badgeX, y: badgeY }} transition={stepTransition}>
          <rect
            x={0}
            y={0}
            width={labelW}
            height={16}
            rx={RADIUS_SM}
            fill="var(--wisp-bg)"
            stroke={stroke}
            strokeWidth={1}
          />
          <text
            x={labelW / 2}
            y={8}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fill: stroke,
              fontFamily: 'var(--wisp-font-sans)',
              fontSize: 10.5,
              fontWeight: 600,
            }}
          >
            {label}
          </text>
        </motion.g>
      )}
    </motion.g>
  );
}
