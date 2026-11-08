import { motion, useReducedMotion } from "motion/react";
import { Player, type Step } from "astro-wisp/explainers";

type FlowState = { active: number; request: string; detail: string };

const stages = ["请求", "调度器", "CPU 提交", "设备执行", "KV cache"];
const x = [48, 164, 280, 396, 512];

const steps: Step<FlowState>[] = [
  {
    state: {
      active: 0,
      request: "新 token 到达",
      detail: "decode 每轮通常只追加一个 token",
    },
    caption: "1 · 请求进入调度器，先确定本轮要处理的 token。",
  },
  {
    state: {
      active: 1,
      request: "batch descriptor",
      detail: "调度器合并请求并选择执行模式",
    },
    caption: "2 · 调度器整理 batch 描述；图模式只能处理已约束的形状和地址。",
  },
  {
    state: { active: 2, request: "launch", detail: "CPU 提交一串 kernel" },
    caption: "3 · Eager 路径逐个提交 kernel，提交间隔会成为可见开销。",
  },
  {
    state: { active: 3, request: "replay", detail: "设备执行已捕获的工作" },
    caption:
      "4 · 图路径把固定的设备工作作为一次 replay 提交；数学计算没有改变。",
  },
  {
    state: { active: 4, request: "写回", detail: "追加 K/V，等待下一轮" },
    caption: "5 · 结果写回 cache，下一轮只更新固定地址中的输入。",
  },
];

function Flow({ state }: { state: FlowState }) {
  const reduce = useReducedMotion();
  const duration = reduce ? 0 : 0.22;
  return (
    <svg
      viewBox="0 0 560 132"
      role="img"
      aria-label={`${stages[state.active]}：${state.detail}`}
      style={{ width: "100%", height: "auto" }}
    >
      {stages.slice(0, -1).map((_, i) => (
        <line
          key={i}
          x1={x[i] + 30}
          y1="52"
          x2={x[i + 1] - 30}
          y2="52"
          stroke="var(--wisp-border)"
          strokeWidth="2"
          markerEnd="url(#flow-arrow)"
        />
      ))}
      <defs>
        <marker
          id="flow-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto"
        >
          <path
            d="M0,0 L7,3.5 L0,7"
            fill="none"
            stroke="var(--wisp-muted)"
            strokeWidth="1.2"
          />
        </marker>
      </defs>
      {stages.map((label, i) => (
        <g key={label}>
          <rect
            x={x[i] - 34}
            y="30"
            width="68"
            height="44"
            rx="10"
            fill={
              i === state.active
                ? "var(--wisp-surface-2)"
                : "var(--wisp-surface)"
            }
            stroke={
              i === state.active ? "var(--wisp-accent)" : "var(--wisp-border)"
            }
          />
          <text
            x={x[i]}
            y="56"
            textAnchor="middle"
            fill="var(--wisp-fg)"
            fontSize="12"
          >
            {label}
          </text>
        </g>
      ))}
      <motion.circle
        r="7"
        cy="18"
        initial={false}
        animate={{ cx: x[state.active] }}
        transition={{ duration, ease: "easeInOut" }}
        fill="var(--wisp-accent)"
      />
      <text
        x="280"
        y="104"
        textAnchor="middle"
        fill="var(--wisp-muted)"
        fontSize="12"
      >
        {state.request} · {state.detail}
      </text>
    </svg>
  );
}

export default function InferenceTimeline() {
  return (
    <figure className="wisp-wide wisp-explainer">
      <figcaption className="wisp-explainer__title">
        一轮 decode 的数据流
      </figcaption>
      <Player steps={steps} label="一轮 decode 的数据流讲解" lang="zh-CN">
        {(step) => <Flow state={step.state} />}
      </Player>
    </figure>
  );
}
