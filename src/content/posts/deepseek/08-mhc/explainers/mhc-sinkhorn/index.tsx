import { useMemo, useState } from 'react';
import { toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, SvgRichLabel } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow, { type Point2D } from '@/explainers/kit/DataFlowArrow';
import HeatmapMatrix from '@/explainers/kit/HeatmapMatrix';
import {
  BEAT_SCHEDULES,
  MANIM_EASE,
  RES_MATRIX,
  SK_M0,
  SK_M1_COL,
  SK_M1_ROW,
  SK_M20,
  STABILITY_MODES,
  buildMhcSinkhornSteps,
  type MhcSinkhornState,
  type StabilityMode,
} from './steps';
import './style.css';

export { buildMhcSinkhornSteps };

export interface MhcSinkhornExplainerProps {
  title?: string;
}

const LANE_Y = [32, 74, 116, 158] as const;
const ADD_X = [568, 552, 536, 520] as const;
const FAN_Y = [208, 222, 236, 250] as const;

function FourStreamStage({
  state,
  beat,
  playToken,
}: {
  state: MhcSinkhornState;
  beat: number;
  playToken: number;
}) {
  const isCalc = state.phase === 'single_layer';
  const showRes = beat >= 1 && (!isCalc || beat >= 2);
  const showPre = isCalc ? beat >= 1 : beat >= 2;
  const showOut = beat >= 3;

  const resFocus = isCalc ? beat === 2 : beat === 1;
  const preFocus = isCalc ? beat === 1 : beat === 2;
  const outFocus = beat === 3;

  const resTone = showRes ? 'done' : 'neutral';
  const preTone = showPre ? 'active' : 'neutral';

  return (
    <div className="mhc-sk-stage">
      <svg className="mhc-sk-svg" viewBox="0 0 680 286" aria-label="四流超连接数据流向与手算推演">
        {/* 左侧源框：单流输入 / 四流初值 */}
        <rect
          x={10}
          y={52}
          width={80}
          height={84}
          rx={4}
          fill={beat === 0 ? toneFill('active') : 'var(--wisp-surface)'}
          stroke={beat === 0 ? toneStroke('active') : 'var(--wisp-border)'}
          strokeWidth={beat === 0 ? 1.75 : 1.25}
        />
        <SvgRichLabel
          x={50}
          y={72}
          width={74}
          height={18}
          fontSize={10}
          fontWeight={600}
          text={isCalc ? '输入四流 $\\mathbf{X}_l$' : '单流 $\\mathbf{x}_l$'}
        />
        <text x={50} y={96} textAnchor="middle" fontSize={9.5} fill="var(--wisp-muted)">
          {isCalc ? '和 = 100.0' : '[1, d] 扩宽'}
        </text>
        <text x={50} y={114} textAnchor="middle" fontSize={9.5} fill="var(--wisp-muted)">
          {isCalc ? '均值 = 25.0' : '4 条并行流'}
        </text>

        {/* Beat 0: 单流扇出到 4 条平行轨道 */}
        {LANE_Y.map((ly, idx) => {
          const pts: Point2D[] = [
            [90, 94],
            [106, 94],
            [106, ly],
            [122, ly],
          ];
          return (
            <DataFlowArrow
              key={`fanin-${idx}`}
              points={pts}
              tone="active"
              active={beat === 0}
              visible={true}
              draw={beat === 0}
              drawDelay={idx * 0.04}
              flow={beat === 0}
              dotToken={beat === 0 ? playToken : 0}
              arrowEnd={false}
              strokeWidth={1.35}
            />
          );
        })}

        {/* 4 条并行残差流：输入节点 + Pre 采样线 + Res 混合矩阵 + h_res + Post 写回 + 输出 */}
        {LANE_Y.map((ly, idx) => {
          const inVal = state.inputStreams[idx];
          const resVal = state.hRes[idx];
          const outVal = state.outputStreams[idx];
          const preW = state.preWeights[idx];
          const addX = ADD_X[idx];
          const fanY = FAN_Y[idx];
          const tapX = 215 + idx * 9;

          return (
            <g key={`lane-${idx}`}>
              {/* 背景轨道引导虚线 */}
              <line
                x1={122}
                y1={ly}
                x2={588}
                y2={ly}
                stroke="var(--wisp-border)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />

              {/* 输入流方块 */}
              <motion.g
                initial={false}
                animate={{ scale: beat === 0 ? [0.96, 1.04, 1] : 1 }}
                transition={{ duration: 0.3, delay: idx * 0.05, ease: MANIM_EASE }}
                style={{ transformOrigin: `166px ${ly}px` }}
              >
                <rect
                  x={124}
                  y={ly - 14}
                  width={86}
                  height={28}
                  rx={4}
                  fill={beat === 0 ? toneFill('active') : 'var(--wisp-surface)'}
                  stroke={beat === 0 ? toneStroke('active') : 'var(--wisp-border)'}
                  strokeWidth={beat === 0 ? 1.5 : 1}
                />
                <text
                  x={167}
                  y={ly + 3}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--wisp-fg)"
                >
                  {isCalc ? `流 ${idx}: ${inVal.toFixed(1)}` : `流 ${idx} [1, d]`}
                </text>
              </motion.g>

              {/* 进入 Res 混合块的 4 条绿色通道 */}
              <DataFlowArrow
                points={[
                  [210, ly],
                  [248, ly],
                ]}
                tone={resTone}
                active={showRes}
                visible={showRes}
                draw={true}
                drawDelay={idx * 0.05}
                flow={resFocus}
                dotToken={resFocus ? playToken : 0}
                arrowEnd={true}
                strokeWidth={showRes ? 1.75 : 1.1}
              />

              {/* 从输入流下分岔进入 Pre 梯形的 4 条蓝色采样线 */}
              <DataFlowArrow
                points={[
                  [tapX, ly],
                  [tapX, 206 + idx * 11],
                  [248, 206 + idx * 11],
                ]}
                tone={preTone}
                active={showPre}
                visible={showPre}
                draw={true}
                drawDelay={idx * 0.05}
                flow={preFocus}
                dotToken={preFocus ? playToken : 0}
                arrowEnd={false}
                strokeWidth={showPre ? 1.5 : 1}
              />
              {showPre && isCalc && (
                <g>
                  <rect
                    x={tapX - 10}
                    y={idx % 2 === 0 ? 170 : 185}
                    width={20}
                    height={12}
                    rx={3}
                    fill="var(--wisp-bg)"
                    stroke={toneStroke('active')}
                    strokeWidth={0.8}
                  />
                  <text
                    x={tapX}
                    y={idx % 2 === 0 ? 179 : 194}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={600}
                    fill={toneStroke('active')}
                  >
                    {preW.toFixed(1)}
                  </text>
                </g>
              )}

              {/* Res 混合输出至 h_res[idx] */}
              <DataFlowArrow
                points={[
                  [374, ly],
                  [406, ly],
                ]}
                tone={resTone}
                active={showRes}
                visible={showRes}
                draw={true}
                drawDelay={0.12 + idx * 0.04}
                flow={resFocus}
                dotToken={resFocus ? playToken : 0}
                arrowEnd={true}
                strokeWidth={showRes ? 1.75 : 1.1}
              />

              {/* h_res[idx] 节点 */}
              <motion.g
                initial={false}
                animate={{ opacity: showRes ? 1 : 0.35 }}
                transition={{ duration: 0.25, ease: MANIM_EASE }}
              >
                <rect
                  x={408}
                  y={ly - 14}
                  width={90}
                  height={28}
                  rx={4}
                  fill={showRes ? toneFill('done') : 'var(--wisp-surface)'}
                  stroke={showRes ? toneStroke('done') : 'var(--wisp-border)'}
                  strokeWidth={showRes ? 1.5 : 1}
                />
                <text
                  x={453}
                  y={ly + 3}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--wisp-fg)"
                >
                  {isCalc ? `H_res: ${resVal.toFixed(1)}` : `H_res[${idx}]`}
                </text>
              </motion.g>

              {/* h_res[idx] 到 ⊕ 圆的绿色连线 */}
              <DataFlowArrow
                points={[
                  [498, ly],
                  [addX - 10, ly],
                ]}
                tone="done"
                active={showOut}
                visible={showOut}
                draw={true}
                flow={outFocus}
                dotToken={outFocus ? playToken : 0}
                arrowEnd={false}
                strokeWidth={showOut ? 1.65 : 1}
              />

              {/* Post 1->4 扇出线：沿各自不交叉通道上行进入对应 ⊕ 底部 */}
              <DataFlowArrow
                points={[
                  [498, fanY],
                  [addX, fanY],
                  [addX, ly + 10],
                ]}
                tone="active"
                active={showOut}
                visible={showOut}
                draw={true}
                drawDelay={idx * 0.05}
                flow={outFocus}
                dotToken={outFocus ? playToken : 0}
                arrowEnd={true}
                strokeWidth={showOut ? 1.5 : 1}
              />

              {/* 逐流加法器 ⊕ */}
              <motion.g
                initial={false}
                animate={{ scale: outFocus ? [0.85, 1.15, 1] : 1, opacity: showOut ? 1 : 0.45 }}
                transition={{ duration: 0.28, delay: idx * 0.04, ease: MANIM_EASE }}
                style={{ transformOrigin: `${addX}px ${ly}px` }}
              >
                <circle
                  cx={addX}
                  cy={ly}
                  r={10}
                  fill={showOut ? toneFill('done') : 'var(--wisp-surface)'}
                  stroke={showOut ? toneStroke('done') : 'var(--wisp-border)'}
                  strokeWidth={showOut ? 1.75 : 1.1}
                />
                <path
                  d={`M ${addX - 4.5} ${ly} H ${addX + 4.5} M ${addX} ${ly - 4.5} V ${ly + 4.5}`}
                  fill="none"
                  stroke={showOut ? toneStroke('done') : 'var(--wisp-muted)'}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              </motion.g>

              {/* ⊕ 到输出流方块 */}
              <DataFlowArrow
                points={[
                  [addX + 10, ly],
                  [588, ly],
                ]}
                tone="done"
                active={showOut}
                visible={showOut}
                draw={true}
                drawDelay={0.14 + idx * 0.04}
                flow={outFocus}
                dotToken={outFocus ? playToken : 0}
                arrowEnd={true}
                strokeWidth={showOut ? 1.75 : 1}
              />

              {/* 输出四流方块 */}
              <motion.g
                initial={false}
                animate={{
                  opacity: showOut ? 1 : 0.35,
                  scale: outFocus ? [0.95, 1.05, 1] : 1,
                }}
                transition={{ duration: 0.3, delay: 0.14 + idx * 0.05, ease: MANIM_EASE }}
                style={{ transformOrigin: `630px ${ly}px` }}
              >
                <rect
                  x={590}
                  y={ly - 14}
                  width={82}
                  height={28}
                  rx={4}
                  fill={showOut ? toneFill('done') : 'var(--wisp-surface)'}
                  stroke={showOut ? toneStroke('done') : 'var(--wisp-border)'}
                  strokeWidth={showOut ? 1.75 : 1}
                />
                <text
                  x={631}
                  y={ly + 3}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="var(--wisp-fg)"
                >
                  {isCalc ? `${outVal.toFixed(1)}` : `流 ${idx} 写回`}
                </text>
              </motion.g>
            </g>
          );
        })}

        {/* 中央 4×4 Res 混合矩阵框 */}
        <motion.g
          initial={false}
          animate={{ opacity: showRes ? 1 : 0.45 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        >
          <rect
            x={250}
            y={12}
            width={122}
            height={162}
            rx={4}
            fill={showRes ? toneFill('done') : 'var(--wisp-surface)'}
            stroke={showRes ? toneStroke('done') : 'var(--wisp-border)'}
            strokeWidth={showRes ? 1.75 : 1.1}
          />
          <SvgRichLabel
            x={311}
            y={25}
            width={114}
            height={18}
            fontSize={9.5}
            fontWeight={700}
            text={'主干 Res $\\mathcal{H}_l^{\\mathrm{res}}$'}
          />
          {RES_MATRIX.map((row, ri) =>
            row.map((w, ci) => {
              const cx = 259 + ci * 26;
              const cy = 38 + ri * 26;
              return (
                <g key={`rm-${ri}-${ci}`}>
                  <rect
                    x={cx}
                    y={cy}
                    width={24}
                    height={24}
                    rx={3}
                    fill={showRes ? 'var(--wisp-bg)' : 'var(--wisp-surface)'}
                    stroke={showRes ? toneStroke('done') : 'var(--wisp-border)'}
                    strokeWidth={ri === ci && showRes ? 1.5 : 0.8}
                    fillOpacity={showRes ? 0.55 + w : 0.7}
                  />
                  <text
                    x={cx + 12}
                    y={cy + 15.5}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={ri === ci ? 700 : 500}
                    fill="var(--wisp-fg)"
                  >
                    {w.toFixed(1)}
                  </text>
                </g>
              );
            }),
          )}
          <text
            x={311}
            y={156}
            textAnchor="middle"
            fontSize={8.5}
            fontWeight={600}
            fill={showRes ? toneStroke('done') : 'var(--wisp-muted)'}
          >
            {isCalc ? '无 Norm · 和恒为 100.0' : '4×4 双随机跨流混合'}
          </text>
          <text x={311} y={168} textAnchor="middle" fontSize={8.5} fill="var(--wisp-muted)">
            行列和均为 1.00
          </text>
        </motion.g>

        {/* 底部旁路通道：Pre (4->1) -> RMSNorm -> F -> Post (1->4) */}
        <motion.g
          initial={false}
          animate={{ opacity: showPre ? 1 : 0.45 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        >
          {/* Pre 4->1 梯形 */}
          <polygon
            points="250,202 322,202 310,256 262,256"
            fill={showPre ? toneFill('active') : 'var(--wisp-surface)'}
            stroke={showPre ? toneStroke('active') : 'var(--wisp-border)'}
            strokeWidth={showPre ? 1.6 : 1.1}
          />
          <text
            x={286}
            y={224}
            textAnchor="middle"
            fontSize={9.5}
            fontWeight={700}
            fill="var(--wisp-fg)"
          >
            Pre (4→1)
          </text>
          <text x={286} y={241} textAnchor="middle" fontSize={9} fill="var(--wisp-muted)">
            {isCalc ? '加权 = 19.0' : '压至 [1, d]'}
          </text>

          {/* Pre -> RMSNorm & F */}
          <DataFlowArrow
            points={[
              [316, 229],
              [340, 229],
            ]}
            tone="active"
            active={showPre}
            visible={showPre}
            draw={true}
            flow={preFocus}
            dotToken={preFocus ? playToken : 0}
            strokeWidth={1.6}
          />

          {/* RMSNorm + F 算子盒 */}
          <rect
            x={342}
            y={202}
            width={102}
            height={54}
            rx={4}
            fill={showPre ? toneFill('active') : 'var(--wisp-surface)'}
            stroke={showPre ? toneStroke('active') : 'var(--wisp-border)'}
            strokeWidth={showPre ? 1.85 : 1.1}
          />
          <SvgRichLabel
            x={393}
            y={219}
            width={94}
            height={18}
            fontSize={9.5}
            fontWeight={700}
            text={'RMSNorm → $\\mathcal{F}$'}
          />
          <text x={393} y={242} textAnchor="middle" fontSize={9.5} fill="var(--wisp-fg)">
            {isCalc ? '19.0 → 增量 +4.0' : '宽度 d 不膨胀'}
          </text>

          {/* F -> Post */}
          <DataFlowArrow
            points={[
              [444, 229],
              [466, 229],
            ]}
            tone="active"
            active={showOut}
            visible={showOut}
            draw={true}
            flow={outFocus}
            dotToken={outFocus ? playToken : 0}
            strokeWidth={1.6}
          />

          {/* Post 1->4 梯形 */}
          <polygon
            points="468,202 496,202 504,256 460,256"
            fill={showOut ? toneFill('active') : 'var(--wisp-surface)'}
            stroke={showOut ? toneStroke('active') : 'var(--wisp-border)'}
            strokeWidth={showOut ? 1.6 : 1.1}
          />
          <text
            x={482}
            y={224}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill="var(--wisp-fg)"
          >
            Post
          </text>
          <text x={482} y={240} textAnchor="middle" fontSize={8.5} fill="var(--wisp-muted)">
            1→4
          </text>
        </motion.g>

        {/* 焦距高亮框 */}
        <ActiveFocusFrame
          x={preFocus ? 244 : resFocus ? 246 : outFocus ? 510 : 118}
          y={preFocus ? 196 : resFocus ? 8 : outFocus ? 10 : 10}
          w={preFocus ? 264 : resFocus ? 260 : outFocus ? 166 : 98}
          h={preFocus ? 66 : resFocus ? 170 : outFocus ? 168 : 168}
          tone={resFocus || outFocus ? 'done' : 'active'}
          label={
            preFocus
              ? '旁路单流计算'
              : resFocus
                ? '4×4 双随机混合'
                : outFocus
                  ? '四流写回相加'
                  : '四流输入'
          }
          visible={true}
        />

        {/* 底部状态注解 */}
        <SvgRichLabel
          x={14}
          y={272}
          width={654}
          height={20}
          fontSize={9.5}
          anchor="start"
          color="var(--wisp-muted)"
          text={
            isCalc
              ? '结构界限：RMSNorm 仅作用于 $\\mathcal{F}$ 旁路入口，主干 $\\mathcal{H}_l^{\\mathrm{res}}$ 依赖双随机约束守恒均值'
              : '四流并行演化：每条流各自保有特征，仅在进入 Attention / MoE 时通过 Pre 聚合为单流 $d$'
          }
        />
      </svg>

      {/* 4 条流逐流对照条 */}
      <div className="mhc-sk-streams">
        {state.inputStreams.map((val, idx) => {
          const resVal = state.hRes[idx];
          const postW = state.postWeights[idx];
          const postDelta = state.hPost[idx];
          const outVal = state.outputStreams[idx];
          const cardTone = showOut ? 'done' : showRes ? 'done' : showPre ? 'active' : 'slate';
          return (
            <motion.div
              key={`stream-card-${idx}`}
              className="mhc-sk-cell wisp-kit-tone"
              data-tone={cardTone}
              initial={false}
              animate={{ opacity: beat === 0 || showPre || showRes || showOut ? 1 : 0.7 }}
              transition={{ duration: 0.25, ease: MANIM_EASE }}
            >
              <span className="mhc-sk-cell__head">
                流 {idx}：
                {showOut ? outVal.toFixed(1) : showRes ? resVal.toFixed(1) : val.toFixed(1)}
              </span>
              <span className="mhc-sk-cell__sub">
                {isCalc
                  ? `Res ${resVal.toFixed(1)} + Post ${postDelta.toFixed(1)}`
                  : `Pre ${state.preWeights[idx].toFixed(1)} · Post ${postW.toFixed(1)}`}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function SvgMatrix2x2({
  x,
  y,
  title,
  values,
  tone,
  colSums,
  rowSums,
  highlightCol,
  highlightRow,
  sumToneCol,
  sumToneRow,
  visible = true,
}: {
  x: number;
  y: number;
  title: string;
  values: readonly (readonly number[])[];
  tone: 'active' | 'done' | 'error' | 'neutral';
  colSums: readonly string[];
  rowSums: readonly string[];
  highlightCol?: number;
  highlightRow?: number;
  sumToneCol?: 'done' | 'error' | 'active';
  sumToneRow?: 'done' | 'error' | 'active';
  visible?: boolean;
}) {
  const cellW = 50;
  const cellH = 30;
  const gap = 4;

  return (
    <motion.g
      initial={false}
      animate={{ opacity: visible ? 1 : 0.22 }}
      transition={{ duration: 0.25, ease: MANIM_EASE }}
    >
      <text x={x} y={y - 8} fontSize={10.5} fontWeight={600} fill="var(--wisp-fg)">
        {title}
      </text>
      {values.map((row, ri) =>
        row.map((val, ci) => {
          const isHi = ri === highlightRow || ci === highlightCol;
          const cellTone = isHi ? tone : 'neutral';
          const cx = x + ci * (cellW + gap);
          const cy = y + ri * (cellH + gap);
          return (
            <g key={`m2-${ri}-${ci}`}>
              <rect
                x={cx}
                y={cy}
                width={cellW}
                height={cellH}
                rx={3}
                fill={cellTone === 'neutral' ? 'var(--wisp-surface)' : toneFill(cellTone)}
                stroke={cellTone === 'neutral' ? 'var(--wisp-border)' : toneStroke(cellTone)}
                strokeWidth={isHi ? 1.75 : 1}
              />
              <text
                x={cx + cellW / 2}
                y={cy + cellH / 2 + 3.5}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={isHi ? 700 : 500}
                fill="var(--wisp-fg)"
              >
                {val.toFixed(2)}
              </text>
            </g>
          );
        }),
      )}

      {/* 右侧行和 */}
      {rowSums.map((rs, ri) => {
        const rx = x + 2 * (cellW + gap) + 4;
        const ry = y + ri * (cellH + gap);
        const st = sumToneRow;
        return (
          <g key={`rs-${ri}`}>
            <rect
              x={rx}
              y={ry}
              width={44}
              height={cellH}
              rx={3}
              fill={st ? toneFill(st) : 'var(--wisp-surface)'}
              stroke={st ? toneStroke(st) : 'var(--wisp-border)'}
              strokeDasharray={st ? undefined : '3 2'}
            />
            <text
              x={rx + 22}
              y={ry + cellH / 2 + 3.5}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              fill={st ? toneStroke(st) : 'var(--wisp-muted)'}
            >
              {rs}
            </text>
          </g>
        );
      })}

      {/* 底部列和 */}
      {colSums.map((cs, ci) => {
        const cx = x + ci * (cellW + gap);
        const cy = y + 2 * (cellH + gap) + 4;
        const st = sumToneCol;
        return (
          <g key={`cs-${ci}`}>
            <rect
              x={cx}
              y={cy}
              width={cellW}
              height={22}
              rx={3}
              fill={st ? toneFill(st) : 'var(--wisp-surface)'}
              stroke={st ? toneStroke(st) : 'var(--wisp-border)'}
              strokeDasharray={st ? undefined : '3 2'}
            />
            <text
              x={cx + cellW / 2}
              y={cy + 14.5}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              fill={st ? toneStroke(st) : 'var(--wisp-muted)'}
            >
              {cs}
            </text>
          </g>
        );
      })}
    </motion.g>
  );
}

function SinkhornNormStage({
  state,
  beat,
  playToken,
}: {
  state: MhcSinkhornState;
  beat: number;
  playToken: number;
}) {
  if (state.phase === 'exp_init') {
    const rawLogits = [
      [0.0, 1.1],
      [0.0, 0.0],
    ];
    const showExp = beat >= 1;
    const showSums = beat >= 2;
    const showCompare = beat >= 3;

    return (
      <div className="mhc-sk-stage">
        <svg className="mhc-sk-svg" viewBox="0 0 680 236" aria-label="指数转正与 Softmax 对比">
          <SvgMatrix2x2
            x={16}
            y={34}
            title="无约束打分矩阵 H̃"
            values={rawLogits}
            tone={beat === 0 ? 'active' : 'neutral'}
            highlightCol={beat === 0 ? 1 : undefined}
            rowSums={['1.10', '0.00']}
            colSums={['0.00', '1.10']}
          />

          <DataFlowArrow
            points={[
              [174, 68],
              [252, 68],
            ]}
            tone="active"
            active={showExp}
            visible={true}
            draw={beat >= 1}
            flow={beat === 1}
            dotToken={beat === 1 ? playToken : 0}
            label="exp(·)"
          />

          <SvgMatrix2x2
            x={260}
            y={34}
            title="正矩阵 M(0) = exp(H̃)"
            values={SK_M0}
            tone={showExp ? 'active' : 'neutral'}
            highlightRow={showExp ? 0 : undefined}
            rowSums={showSums ? ['4.00', '2.00'] : ['?', '?']}
            colSums={showSums ? ['2.00', '4.00'] : ['?', '?']}
            sumToneCol={showSums ? 'active' : undefined}
            sumToneRow={showSums ? 'active' : undefined}
            visible={showExp}
          />

          <ActiveFocusFrame
            x={beat === 0 ? 10 : 254}
            y={12}
            w={beat === 0 ? 162 : 164}
            h={126}
            tone="active"
            label={beat === 0 ? '可负打分起点' : beat === 1 ? '逐元素指数转正' : '初始行列和'}
            visible={beat <= 2}
          />

          {/* 右侧对比框：单侧 Softmax vs 双随机 Sinkhorn */}
          <motion.g
            initial={false}
            animate={{ opacity: showCompare ? 1 : 0.35 }}
            transition={{ duration: 0.25, ease: MANIM_EASE }}
          >
            <rect
              x={444}
              y={16}
              width={224}
              height={76}
              rx={4}
              fill={showCompare ? toneFill('error') : 'var(--wisp-surface)'}
              stroke={showCompare ? toneStroke('error') : 'var(--wisp-border)'}
              strokeWidth={1.35}
            />
            <text x={456} y={38} fontSize={10.5} fontWeight={700} fill="var(--wisp-fg)">
              单侧 Softmax：仅行和 = 1
            </text>
            <text x={456} y={56} fontSize={9.5} fill="var(--wisp-muted)">
              列和可偏离 1（如 [1.2, 0.4, ...]）
            </text>
            <text x={456} y={74} fontSize={9.5} fill={toneStroke('error')}>
              反向梯度连乘 60 层依旧失衡
            </text>

            <rect
              x={444}
              y={104}
              width={224}
              height={76}
              rx={4}
              fill={showCompare ? toneFill('done') : 'var(--wisp-surface)'}
              stroke={showCompare ? toneStroke('done') : 'var(--wisp-border)'}
              strokeWidth={1.5}
            />
            <text x={456} y={126} fontSize={10.5} fontWeight={700} fill="var(--wisp-fg)">
              Sinkhorn：行和 = 1 且列和 = 1
            </text>
            <text x={456} y={144} fontSize={9.5} fill="var(--wisp-muted)">
              全正非负，消除正负权重抵消
            </text>
            <text x={456} y={162} fontSize={9.5} fill={toneStroke('done')}>
              落在 Birkhoff 多面体，乘法封闭
            </text>
          </motion.g>

          <text x={16} y={208} fontSize={10} fill="var(--wisp-muted)">
            关键约束：先把任意实数打分经 exp
            推入严格正象限，再交替归一化行与列以同时锁死前向幅值与反向梯度。
          </text>
        </svg>
      </div>
    );
  }

  if (state.phase === 'col_norm') {
    const col0Done = beat >= 1;
    const col1Done = beat >= 2;
    const rowWarn = beat >= 3;

    const rightMat = [
      [col0Done ? SK_M1_COL[0][0] : SK_M0[0][0], col1Done ? SK_M1_COL[0][1] : SK_M0[0][1]],
      [col0Done ? SK_M1_COL[1][0] : SK_M0[1][0], col1Done ? SK_M1_COL[1][1] : SK_M0[1][1]],
    ];

    return (
      <div className="mhc-sk-stage">
        <svg className="mhc-sk-svg" viewBox="0 0 680 236" aria-label="Sinkhorn 第一步列归一化">
          <SvgMatrix2x2
            x={16}
            y={38}
            title="输入正矩阵 M(0)"
            values={SK_M0}
            tone="active"
            highlightCol={beat === 1 ? 0 : beat === 2 ? 1 : undefined}
            rowSums={['4.00', '2.00']}
            colSums={['2.00', '4.00']}
            sumToneCol="active"
          />

          <DataFlowArrow
            points={[
              [184, 56],
              [274, 56],
            ]}
            tone="active"
            active={col0Done}
            visible={true}
            draw={beat === 1}
            flow={beat === 1}
            dotToken={beat === 1 ? playToken : 0}
            label="列0 ÷ 2.0"
          />
          <DataFlowArrow
            points={[
              [184, 96],
              [274, 96],
            ]}
            tone="active"
            active={col1Done}
            visible={true}
            draw={beat === 2}
            flow={beat === 2}
            dotToken={beat === 2 ? playToken : 0}
            label="列1 ÷ 4.0"
          />

          <SvgMatrix2x2
            x={282}
            y={38}
            title="列归一结果 Tc(M(0))"
            values={rightMat}
            tone="done"
            highlightCol={beat === 1 ? 0 : beat === 2 ? 1 : undefined}
            rowSums={rowWarn ? ['1.25', '0.75'] : ['—', '—']}
            colSums={[col0Done ? '1.00' : '2.00', col1Done ? '1.00' : '4.00']}
            sumToneCol={col0Done ? 'done' : 'active'}
            sumToneRow={rowWarn ? 'error' : undefined}
          />

          <ActiveFocusFrame
            x={beat === 0 ? 10 : beat === 1 ? 278 : beat === 2 ? 332 : 386}
            y={beat === 0 ? 14 : 32}
            w={beat === 0 ? 166 : 58}
            h={beat === 0 ? 132 : beat === 3 ? 78 : 106}
            tone={beat === 3 ? 'error' : beat === 0 ? 'active' : 'done'}
            label={
              beat === 0
                ? '读取列和 [2, 4]'
                : beat === 1
                  ? '第 0 列对齐 1.00'
                  : beat === 2
                    ? '第 1 列对齐 1.00'
                    : '行和仍失衡'
            }
            visible={true}
          />

          {/* 右侧状态卡 */}
          <rect
            x={462}
            y={22}
            width={206}
            height={144}
            rx={4}
            fill={rowWarn ? toneFill('error') : toneFill('done')}
            stroke={rowWarn ? toneStroke('error') : toneStroke('done')}
            strokeWidth={1.35}
          />
          <text x={474} y={46} fontSize={11} fontWeight={700} fill="var(--wisp-fg)">
            列归一完成度检查
          </text>
          <text x={474} y={72} fontSize={10} fill="var(--wisp-fg)">
            • 列 0：{col0Done ? '[0.50, 0.50] → 列和 1.00' : '待除以列和 2.00'}
          </text>
          <text x={474} y={96} fontSize={10} fill="var(--wisp-fg)">
            • 列 1：{col1Done ? '[0.75, 0.25] → 列和 1.00' : '待除以列和 4.00'}
          </text>
          <text
            x={474}
            y={124}
            fontSize={10}
            fontWeight={600}
            fill={rowWarn ? toneStroke('error') : 'var(--wisp-muted)'}
          >
            {rowWarn ? '• 行和变为 [1.25, 0.75] ≠ 1.00' : '• 行和将在列对齐后统计'}
          </text>
          <text x={474} y={148} fontSize={9.5} fill="var(--wisp-muted)">
            下一步：用行归一拉平 [1.25, 0.75]
          </text>

          <text x={16} y={208} fontSize={10} fill="var(--wisp-muted)">
            交替投影规律：每次单侧按和归一都能将该侧对齐到
            1.00，另一侧会出现轻微偏差，因此需要下一拍行归一接力收敛。
          </text>
        </svg>
      </div>
    );
  }

  // Step 5: row_norm — Tc(M0) -> Tr(Tc(M0)) -> 20 轮收敛稳态 M^(20)
  const rowDone = beat >= 1;
  const colDrift = beat >= 2;
  const converged20 = beat >= 3;

  return (
    <div className="mhc-sk-stage">
      <svg
        className="mhc-sk-svg"
        viewBox="0 0 680 236"
        aria-label="Sinkhorn 行归一与 20 轮交替收敛"
      >
        <SvgMatrix2x2
          x={10}
          y={40}
          title="1. 列归一后 Tc(M(0))"
          values={SK_M1_COL}
          tone={beat === 0 ? 'error' : 'neutral'}
          highlightRow={beat === 0 ? 0 : undefined}
          rowSums={['1.25', '0.75']}
          colSums={['1.00', '1.00']}
          sumToneRow="error"
          sumToneCol="done"
        />

        <DataFlowArrow
          points={[
            [172, 74],
            [236, 74],
          ]}
          tone="active"
          active={rowDone}
          visible={true}
          draw={beat === 1}
          flow={beat === 1}
          dotToken={beat === 1 ? playToken : 0}
          label="÷ 行和"
        />

        <SvgMatrix2x2
          x={244}
          y={40}
          title="2. 第 1 轮 Tr·Tc"
          values={SK_M1_ROW}
          tone={rowDone ? 'active' : 'neutral'}
          highlightRow={beat === 1 ? 1 : undefined}
          rowSums={rowDone ? ['1.00', '1.00'] : ['1.25', '0.75']}
          colSums={colDrift ? ['1.07', '0.93'] : ['—', '—']}
          sumToneRow={rowDone ? 'done' : undefined}
          sumToneCol={colDrift ? 'active' : undefined}
          visible={rowDone}
        />

        <DataFlowArrow
          points={[
            [406, 74],
            [474, 74],
          ]}
          tone="done"
          active={converged20}
          visible={true}
          draw={beat === 3}
          flow={beat === 3}
          dotToken={beat === 3 ? playToken : 0}
          label="20 轮"
        />

        <SvgMatrix2x2
          x={482}
          y={40}
          title="3. 20 轮双随机稳态"
          values={SK_M20}
          tone={converged20 ? 'done' : 'neutral'}
          rowSums={converged20 ? ['1.00', '1.00'] : ['—', '—']}
          colSums={converged20 ? ['1.00', '1.00'] : ['—', '—']}
          sumToneRow={converged20 ? 'done' : undefined}
          sumToneCol={converged20 ? 'done' : undefined}
          visible={converged20}
        />

        <ActiveFocusFrame
          x={beat === 0 ? 114 : beat === 1 ? 238 : beat === 2 ? 238 : 476}
          y={beat === 0 ? 34 : beat === 2 ? 106 : 16}
          w={beat === 0 ? 52 : beat === 2 ? 116 : 162}
          h={beat === 0 ? 74 : beat === 2 ? 32 : 126}
          tone={beat === 0 ? 'error' : beat === 3 ? 'done' : 'active'}
          label={
            beat === 0
              ? '行和失衡'
              : beat === 1
                ? '行和对齐 1.00'
                : beat === 2
                  ? '列偏差缩至 0.14'
                  : '行列双 1.00 稳态'
          }
          visible={true}
        />

        {/* 底部收敛误差指标条 */}
        <rect
          x={10}
          y={158}
          width={658}
          height={56}
          rx={4}
          fill="var(--wisp-surface)"
          stroke="var(--wisp-border)"
        />
        <text x={22} y={180} fontSize={10.5} fontWeight={600} fill="var(--wisp-fg)">
          行列最大总和偏差收敛轨迹：
        </text>
        <text x={22} y={200} fontSize={10} fill="var(--wisp-muted)">
          M(0) 偏差 2.00 → Tc 后行和偏差 0.50 → Tr 后列和偏差 0.14 → 展开 t_max = 20 轮后误差低于
          10⁻⁶
        </text>
      </svg>
    </div>
  );
}

function MultiLayerCompareStage({
  mode,
  onSelectMode,
  beat,
  playToken,
}: {
  mode: StabilityMode;
  onSelectMode: (next: StabilityMode) => void;
  beat: number;
  playToken: number;
}) {
  const spec = STABILITY_MODES[mode];
  const tone = mode === 'hc' ? 'error' : mode === 'sinkhorn_5' ? 'active' : 'done';
  const showHeatmap = beat >= 1;
  const showPeak = beat >= 2;
  const showVerdict = beat >= 3;

  const rowSums = spec.matrix60.map((r) => {
    const s = r.reduce((a, b) => a + b, 0);
    return mode === 'hc' ? (s > 0 ? `+${s.toFixed(0)}` : s.toFixed(0)) : s.toFixed(2);
  });
  const colSums = [0, 1, 2, 3].map((ci) => {
    const s = spec.matrix60.reduce((a, r) => a + r[ci], 0);
    return mode === 'hc' ? s.toFixed(0) : s.toFixed(2);
  });
  const peakSet = useMemo(
    () =>
      mode === 'hc' ? new Set(['2,0', '2,1', '2,2', '2,3']) : new Set(['3,3', '0,3', '1,3', '2,3']),
    [mode],
  );

  const chartX0 = 46;
  const chartY0 = 186;
  const chartW = 266;
  const chartH = 136;

  const toPolylinePoints = (normY: readonly number[]) =>
    normY
      .map((ny, i) => {
        const px = chartX0 + (i / (normY.length - 1)) * chartW;
        const py = chartY0 - ny * chartH;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');

  const toSvgPath = (normY: readonly number[]) =>
    normY
      .map((ny, i) => {
        const px = chartX0 + (i / (normY.length - 1)) * chartW;
        const py = chartY0 - ny * chartH;
        return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(' ');

  const activeEndNy = spec.curveNormY[spec.curveNormY.length - 1];
  const endX = chartX0 + chartW;
  const endY = chartY0 - activeEndNy * chartH;

  return (
    <div className="mhc-sk-stage">
      <div className="mhc-sk-switcher">
        <span style={{ fontSize: '0.75rem', color: 'var(--wisp-muted)' }}>
          反事实对比（60 子层连乘复合矩阵）：
        </span>
        <div className="mhc-sk-switcher__group" role="group" aria-label="切换连乘稳定方案">
          {(Object.keys(STABILITY_MODES) as StabilityMode[]).map((id) => (
            <button
              key={id}
              type="button"
              className="mhc-sk-switcher__btn"
              aria-pressed={mode === id}
              onClick={() => onSelectMode(id)}
            >
              {STABILITY_MODES[id].label}
            </button>
          ))}
        </div>
      </div>

      <svg
        className="mhc-sk-svg"
        viewBox="0 0 680 264"
        aria-label="60 子层连乘增益曲线与复合矩阵热力图"
      >
        {/* 左侧：60 子层增益演化对数曲线 */}
        <rect
          x={10}
          y={8}
          width={322}
          height={206}
          rx={4}
          fill="var(--wisp-surface)"
          stroke="var(--wisp-border)"
        />
        <text x={22} y={28} fontSize={11} fontWeight={700} fill="var(--wisp-fg)">
          60 子层连乘信号增益演化（L1 → L60）
        </text>

        {/* 坐标轴与刻度 */}
        <line
          x1={chartX0}
          y1={48}
          x2={chartX0}
          y2={chartY0}
          stroke="var(--wisp-border)"
          strokeWidth={1.25}
        />
        <line
          x1={chartX0}
          y1={chartY0}
          x2={chartX0 + chartW}
          y2={chartY0}
          stroke="var(--wisp-border)"
          strokeWidth={1.25}
        />
        <text
          x={chartX0 - 6}
          y={chartY0 - 4}
          textAnchor="end"
          fontSize={9}
          fill="var(--wisp-muted)"
        >
          1×
        </text>
        <text
          x={chartX0 - 6}
          y={chartY0 - chartH * 0.35}
          textAnchor="end"
          fontSize={9}
          fill="var(--wisp-muted)"
        >
          10×
        </text>
        <text
          x={chartX0 - 6}
          y={chartY0 - chartH * 0.68}
          textAnchor="end"
          fontSize={9}
          fill="var(--wisp-muted)"
        >
          100×
        </text>
        <text x={chartX0 - 6} y={54} textAnchor="end" fontSize={9} fill="var(--wisp-muted)">
          3000×
        </text>
        <text x={chartX0} y={202} fontSize={9} fill="var(--wisp-muted)">
          子层 1
        </text>
        <text
          x={chartX0 + chartW / 2}
          y={202}
          textAnchor="middle"
          fontSize={9}
          fill="var(--wisp-muted)"
        >
          子层 30
        </text>
        <text x={chartX0 + chartW} y={202} textAnchor="end" fontSize={9} fill="var(--wisp-muted)">
          子层 60
        </text>

        {/* 辅助背景参考曲线 */}
        {(Object.keys(STABILITY_MODES) as StabilityMode[]).map((id) =>
          id === mode ? null : (
            <polyline
              key={`ref-${id}`}
              points={toPolylinePoints(STABILITY_MODES[id].curveNormY)}
              fill="none"
              stroke="var(--wisp-subtle)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
              opacity={0.6}
            />
          ),
        )}

        {/* 当前激活曲线：pathLength 动画绘制 */}
        <motion.path
          key={`curve-${mode}-${playToken}`}
          d={toSvgPath(spec.curveNormY)}
          fill="none"
          stroke={toneStroke(tone)}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0.08 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.65, ease: MANIM_EASE }}
        />

        {/* 终点标注胶囊 */}
        <motion.g
          initial={false}
          animate={{ opacity: 1, scale: beat === 0 ? [0.9, 1.1, 1] : 1 }}
          transition={{ duration: 0.35, ease: MANIM_EASE }}
          style={{ transformOrigin: `${endX}px ${endY}px` }}
        >
          <circle cx={endX} cy={endY} r={4.5} fill={toneStroke(tone)} />
          <rect
            x={endX - 118}
            y={Math.max(40, endY - 24)}
            width={114}
            height={18}
            rx={3}
            fill={toneFill(tone)}
            stroke={toneStroke(tone)}
            strokeWidth={1}
          />
          <text
            x={endX - 61}
            y={Math.max(40, endY - 24) + 12.5}
            textAnchor="middle"
            fontSize={9.5}
            fontWeight={700}
            fill="var(--wisp-fg)"
          >
            {spec.gainText}
          </text>
        </motion.g>

        {/* 右侧：第 60 子层复合矩阵 HeatmapMatrix */}
        <rect
          x={344}
          y={8}
          width={326}
          height={206}
          rx={4}
          fill="var(--wisp-surface)"
          stroke="var(--wisp-border)"
        />
        <HeatmapMatrix
          x={354}
          y={18}
          values={spec.matrix60}
          tone={tone}
          selectedTone={tone}
          cellW={52}
          cellH={28}
          gap={4}
          min={mode === 'hc' ? -150 : 0.15}
          max={mode === 'hc' ? 150 : 0.32}
          format={(v) =>
            mode === 'hc' ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : v.toFixed(2)
          }
          selected={peakSet}
          showSelected={showPeak}
          dimmed={!showHeatmap}
          rowLabels={['流0', '流1', '流2', '流3']}
          colLabels={['流0', '流1', '流2', '流3']}
          rowSums={rowSums}
          colSums={colSums}
          showSums={showPeak}
          rowLabelW={34}
          title={`第 60 层复合矩阵（${spec.badge}）`}
          fontSize={10.5}
        />

        <ActiveFocusFrame
          x={612}
          y={52}
          w={52}
          h={132}
          tone={tone}
          label="行和"
          labelAlign="right"
          visible={showPeak}
        />

        {/* 底部结论条 */}
        <motion.g
          initial={false}
          animate={{ opacity: showVerdict ? 1 : 0.45 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        >
          <rect
            x={10}
            y={222}
            width={660}
            height={34}
            rx={4}
            fill={showVerdict ? toneFill(tone) : 'var(--wisp-surface)'}
            stroke={showVerdict ? toneStroke(tone) : 'var(--wisp-border)'}
            strokeWidth={1.25}
          />
          <text x={22} y={243} fontSize={10} fontWeight={600} fill="var(--wisp-fg)">
            行和区间 {spec.rowSumRange} · 列和区间 {spec.colSumRange} ｜ {spec.summary}
          </text>
        </motion.g>
      </svg>
    </div>
  );
}

export default function MhcSinkhornExplainer({ title }: MhcSinkhornExplainerProps) {
  const steps = useMemo(() => buildMhcSinkhornSteps(), []);
  const [mode, setMode] = useState<StabilityMode>('hc');

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={448}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={mode}
    >
      {(step, { beat, dotToken }) => {
        const s = step.state;
        if (s.phase === 'expand' || s.phase === 'single_layer') {
          return <FourStreamStage state={s} beat={beat} playToken={dotToken} />;
        }
        if (s.phase === 'multi_layer') {
          return (
            <MultiLayerCompareStage
              mode={mode}
              onSelectMode={setMode}
              beat={beat}
              playToken={dotToken}
            />
          );
        }
        return <SinkhornNormStage state={s} beat={beat} playToken={dotToken} />;
      }}
    </BeatExplainer>
  );
}
