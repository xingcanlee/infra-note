/**
 * 提交时间线动画：CPU 提交车道与设备执行车道，逐次提交展开。
 *
 * 用在：vLLM 00、01、03；DS 19。
 */
import { useMemo } from 'react';
import { Explainer, Stage, focusOf, formatNumber as f } from 'astro-wisp/explainers';
import { toneFill, toneStroke } from 'astro-wisp/explainers/core';
import { decodeLayerOps, submitFlow, type OpSpec, type SubmitMode, type SubmitState } from '../core/submit';
import { Caption, Legend } from './primitives';

export interface SubmitTimelineProps {
  mode?: SubmitMode;
  ops?: OpSpec[];
  launchCost?: number;
  graphLaunchCost?: number;
  title?: string;
}

const LEFT = 76;
const TOP = 48;
const LANE_H = 30;
const LANE_GAP = 26;
const SCALE = 34; // 每个时间单位多少像素

function Scene({ s, focus }: { s: SubmitState; focus?: string[] }) {
  const hot = focusOf(focus, 'launch');
  const w = LEFT + s.wall * SCALE + 70;
  const h = TOP + 2 * LANE_H + LANE_GAP + 92;
  const cpuY = TOP;
  const devY = TOP + LANE_H + LANE_GAP;

  return (
    <Stage width={w} height={h} label={`提交时间线：${s.mode} 模式，${s.nLaunch} 次提交`}>
      <Caption x={0} y={cpuY + LANE_H / 2} text="CPU 提交" tone="q" />
      <Caption x={0} y={devY + LANE_H / 2} text="设备执行" tone="v" />

      {/* 车道底 */}
      {[cpuY, devY].map((y, i) => (
        <rect
          key={i}
          x={LEFT}
          y={y}
          width={s.wall * SCALE}
          height={LANE_H}
          rx={3}
          style={{ fill: 'var(--wisp-surface)', stroke: 'var(--wisp-border)', strokeWidth: 1 }}
        />
      ))}

      {s.launches.map((l, i) => {
        const active = hot.has(String(i));
        const isGraph = l.kind === 'graph';
        return (
          <g key={i}>
            {/* CPU 段 */}
            <rect
              x={LEFT + l.cpuStart * SCALE}
              y={cpuY + 3}
              width={Math.max((l.cpuEnd - l.cpuStart) * SCALE, 2)}
              height={LANE_H - 6}
              rx={3}
              style={{
                fill: toneFill(isGraph ? 'done' : 'q'),
                stroke: toneStroke(isGraph ? 'done' : 'q'),
                strokeWidth: active ? 2.2 : 1,
              }}
            />
            {/* 设备段 */}
            <rect
              x={LEFT + l.devStart * SCALE}
              y={devY + 3}
              width={Math.max((l.devEnd - l.devStart) * SCALE, 2)}
              height={LANE_H - 6}
              rx={3}
              style={{
                fill: toneFill(isGraph ? 'done' : 'v'),
                stroke: toneStroke(isGraph ? 'done' : 'v'),
                strokeWidth: active ? 2.2 : 1,
              }}
            />
            {/* 提交 → 执行的因果连线 */}
            <line
              x1={LEFT + l.cpuEnd * SCALE}
              y1={cpuY + LANE_H}
              x2={LEFT + l.devStart * SCALE}
              y2={devY}
              style={{ stroke: toneStroke(isGraph ? 'done' : 'q'), strokeWidth: active ? 1.6 : 0.8, strokeDasharray: '3 2' }}
            />
            {/* 同步点：CPU 在这里被钉住，等设备算完 */}
            {l.sync && (
              <>
                <line
                  x1={LEFT + l.devEnd * SCALE}
                  y1={cpuY - 6}
                  x2={LEFT + l.devEnd * SCALE}
                  y2={devY + LANE_H + 6}
                  style={{ stroke: toneStroke('error'), strokeWidth: 2 }}
                />
                <text
                  x={LEFT + l.devEnd * SCALE}
                  y={cpuY - 12}
                  textAnchor="middle"
                  className="wisp-explainer__label"
                  style={{ fill: toneStroke('error') }}
                >
                  同步点
                </text>
              </>
            )}
            {isGraph && l.ops.length > 1 && (
              <text
                x={LEFT + ((l.devStart + l.devEnd) / 2) * SCALE}
                y={devY + LANE_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="wisp-explainer__label"
                style={{ fill: 'var(--wisp-fg)' }}
              >
                {`${l.ops.length} 个算子`}
              </text>
            )}
          </g>
        );
      })}

      {/* 设备空闲（气泡） */}
      {s.launches.map((l, i) => {
        const prevEnd = i === 0 ? 0 : s.launches[i - 1].devEnd;
        const gap = l.devStart - prevEnd;
        if (gap <= 0.001) return null;
        return (
          <rect
            key={`g${i}`}
            x={LEFT + prevEnd * SCALE}
            y={devY + 3}
            width={gap * SCALE}
            height={LANE_H - 6}
            rx={2}
            style={{ fill: toneFill('error'), stroke: toneStroke('error'), strokeWidth: 0.8, strokeDasharray: '2 2' }}
          />
        );
      })}

      <Caption
        x={LEFT}
        y={devY + LANE_H + 26}
        text={`提交 ${s.nLaunch} 次 · CPU ${f(s.cpuTotal)} · 设备干活 ${f(s.devTotal)} · 墙钟 ${f(s.wall)}${s.nSync ? ` · 同步点 ${s.nSync} 个` : ''}`}
      />
      <Caption
        x={LEFT}
        y={devY + LANE_H + 46}
        text={`设备空闲 ${f(s.bubble)}（占 ${f((s.bubble / s.wall) * 100, 1)}%）`}
        tone={s.bubble > 0.001 ? 'error' : 'done'}
      />
      <Legend
        x={LEFT}
        y={devY + LANE_H + 70}
        items={[
          { tone: 'q', text: '逐算子提交' },
          { tone: 'done', text: '图 replay' },
          { tone: 'error', text: '设备空等 / 同步点' },
        ]}
        gap={110}
      />
    </Stage>
  );
}

export default function SubmitTimeline({ mode = 'eager', ops, launchCost, graphLaunchCost, title }: SubmitTimelineProps) {
  const list = ops ?? decodeLayerOps(2);
  const steps = useMemo(
    () => submitFlow({ mode, ops: list, launchCost, graphLaunchCost }),
    [mode, list, launchCost, graphLaunchCost],
  );
  const defaultTitle =
    mode === 'eager' ? 'eager：每个算子提交一次' : mode === 'full' ? 'full graph：整轮只提交一次' : 'piecewise：能捕获的片段打包，其余单独提交';
  return (
    <Explainer steps={steps} title={title ?? defaultTitle}>
      {(step) => <Scene s={step.state} focus={step.focus} />}
    </Explainer>
  );
}
