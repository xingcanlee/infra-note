import { motion, useReducedMotion } from "motion/react";
import { Player, type Step } from "astro-wisp/explainers";

type Mode = "FULL" | "PIECEWISE" | "NONE";

type BucketState = {
  batch: number;
  maxTokens: number;
  mode: Mode;
  bucket: number | null;
  padding: number;
  detail: string;
};

const buckets = [1, 2, 4, 8, 16];
const xs = [52, 152, 252, 352, 452];

const steps: Step<BucketState>[] = [
  {
    state: {
      batch: 3,
      maxTokens: 512,
      mode: "FULL",
      bucket: null,
      padding: 0,
      detail: "先读取 descriptor，暂时不执行 replay",
    },
    caption: "1 · batch=3 还只是输入描述；dispatcher 需要先查找可用的图桶。",
  },
  {
    state: {
      batch: 3,
      maxTokens: 512,
      mode: "FULL",
      bucket: 4,
      padding: 1,
      detail: "选择最小可容纳桶，补 1 个槽位",
    },
    caption:
      "2 · 桶 4 能容纳 batch=3，padding=1；真实 token 仍由 metadata 和 mask 区分。",
  },
  {
    state: {
      batch: 8,
      maxTokens: 512,
      mode: "PIECEWISE",
      bucket: 8,
      padding: 0,
      detail: "shape 命中，但本轮走分段路径",
    },
    caption: "3 · 同样是命中图桶，也可能选择 PIECEWISE；模式不是性能等级。",
  },
  {
    state: {
      batch: 8,
      maxTokens: 1024,
      mode: "NONE",
      bucket: null,
      padding: 0,
      detail: "descriptor 没有匹配的现成桶",
    },
    caption:
      "4 · 没有匹配桶时回退到 NONE 或分段执行，回退是动态输入的正确性路径。",
  },
];

function Scene({ state }: { state: BucketState }) {
  const reduce = useReducedMotion();
  const duration = reduce ? 0 : 0.2;
  const modeColor =
    state.mode === "NONE" ? "var(--wisp-sem-error)" : "var(--wisp-accent)";

  return (
    <svg
      viewBox="0 0 680 188"
      role="img"
      aria-label={`batch ${state.batch}，max tokens ${state.maxTokens}，${state.mode}，padding ${state.padding}`}
      style={{ width: "100%", height: "auto" }}
    >
      <text x="32" y="28" fill="var(--wisp-fg)" fontSize="14">
        descriptor：batch={state.batch} · max_tokens={state.maxTokens}
      </text>
      <text x="32" y="56" fill="var(--wisp-muted)" fontSize="13">
        可用图桶
      </text>
      {buckets.map((bucket, i) => {
        const selected = state.bucket === bucket;
        return (
          <motion.g
            key={bucket}
            initial={false}
            animate={{
              opacity: selected ? 1 : 0.58,
              scale: selected ? 1.04 : 1,
            }}
            transition={{ duration, ease: "easeOut" }}
            style={{ transformOrigin: `${xs[i]}px 96px` }}
          >
            <rect
              x={xs[i] - 34}
              y="72"
              width="68"
              height="48"
              rx="8"
              fill={selected ? "var(--wisp-accent)" : "var(--wisp-surface-2)"}
              stroke={selected ? "var(--wisp-accent)" : "var(--wisp-border)"}
            />
            <text
              x={xs[i]}
              y="101"
              textAnchor="middle"
              fill={selected ? "var(--wisp-accent-fg)" : "var(--wisp-fg)"}
              fontSize="14"
            >
              {bucket}
            </text>
          </motion.g>
        );
      })}
      <motion.rect
        x="550"
        y="72"
        width="98"
        height="48"
        rx="8"
        initial={false}
        animate={{ opacity: state.mode === "NONE" ? 1 : 0.42 }}
        transition={{ duration }}
        fill="var(--wisp-surface-2)"
        stroke={modeColor}
        strokeDasharray="5 4"
      />
      <text x="599" y="101" textAnchor="middle" fill={modeColor} fontSize="14">
        {state.mode}
      </text>
      <line x1="32" y1="144" x2="648" y2="144" stroke="var(--wisp-border)" />
      <text x="32" y="169" fill="var(--wisp-muted)" fontSize="13">
        {state.detail} · padding={state.padding}
      </text>
    </svg>
  );
}

export default function BucketSelector() {
  return (
    <figure className="wisp-wide wisp-explainer">
      <figcaption className="wisp-explainer__title">图桶选择的四步</figcaption>
      <Player steps={steps} label="图桶选择讲解" lang="zh-CN">
        {(step) => <Scene state={step.state} />}
      </Player>
    </figure>
  );
}
