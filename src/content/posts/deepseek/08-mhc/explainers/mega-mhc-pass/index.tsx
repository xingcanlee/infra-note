import { useMemo, useState, type ReactElement } from 'react';
import { RichText, toneFill, toneStroke } from 'astro-wisp/explainers';
import { motion } from 'motion/react';
import { BeatExplainer, SvgRichLabel } from '@/explainers/kit';
import ActiveFocusFrame from '@/explainers/kit/ActiveFocusFrame';
import DataFlowArrow from '@/explainers/kit/DataFlowArrow';
import {
  BEAT_SCHEDULES,
  LAYER_BOUNDARY_SPECS,
  MANIM_EASE,
  buildMegaMhcPassSteps,
  type LayerKind,
  type MegaMhcStepState,
} from './steps';
import './style.css';

export { buildMegaMhcPassSteps };

export interface MegaMhcPassExplainerProps {
  title?: string;
}

function UnifiedByteBar({
  state,
  revealedSegCount,
  cumulativeD,
}: {
  state: MegaMhcStepState;
  revealedSegCount: number;
  cumulativeD: number;
}) {
  const trackX = 14;
  const trackW = 652;
  const barY = 234;
  const barH = 30;
  const savedD = 20 - state.totalD;

  return (
    <g>
      <text x={trackX} y={224} fontSize={10} fontWeight={600} fill="var(--wisp-fg)">
        HBM 访存切分进度（满槽基准 = 20d）
      </text>
      <text
        x={trackX + trackW}
        y={224}
        textAnchor="end"
        fontSize={10}
        fontWeight={600}
        fill="var(--wisp-muted)"
      >
        {`当前累计 ${cumulativeD}d / 目标 ${state.totalD}d · ${state.hbmTrips} 趟 Kernel`}
      </text>

      <rect
        x={trackX}
        y={barY}
        width={trackW}
        height={barH}
        rx={4}
        fill="var(--wisp-surface)"
        stroke="var(--wisp-border)"
        strokeWidth={1}
      />

      {
        state.segments.reduce<{ x: number; els: ReactElement[] }>(
          (acc, seg, idx) => {
            const w = Math.round((seg.costD / 20) * trackW);
            const active = idx < revealedSegCount;
            const tone = seg.tone === 'neutral' ? undefined : seg.tone;
            acc.els.push(
              <motion.g
                key={`bar-${state.phase}-${seg.label}`}
                initial={false}
                animate={{ opacity: active ? 1 : 0.2 }}
                transition={{ duration: 0.28, ease: MANIM_EASE }}
              >
                <rect
                  x={acc.x + 1}
                  y={barY + 1}
                  width={Math.max(w - 2, 24)}
                  height={barH - 2}
                  rx={3}
                  fill={active && tone ? toneFill(tone) : 'var(--wisp-surface)'}
                  stroke={active && tone ? toneStroke(tone) : 'var(--wisp-border)'}
                  strokeWidth={active ? 1.5 : 1}
                />
                <text
                  x={acc.x + Math.max(w - 2, 24) / 2}
                  y={barY + 19}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill="var(--wisp-fg)"
                >
                  {seg.costD <= 2 ? `Norm (${seg.costD}d)` : `${seg.label} (${seg.costD}d)`}
                </text>
              </motion.g>,
            );
            return { x: acc.x + w, els: acc.els };
          },
          { x: trackX, els: [] },
        ).els
      }

      {savedD > 0 && (
        <g>
          <rect
            x={trackX + Math.round((state.totalD / 20) * trackW) + 2}
            y={barY + 1}
            width={Math.round((savedD / 20) * trackW) - 3}
            height={barH - 2}
            rx={3}
            fill="var(--wisp-bg)"
            stroke={toneStroke('done')}
            strokeDasharray="4 3"
          />
          <text
            x={
              trackX +
              Math.round((state.totalD / 20) * trackW) +
              Math.round((savedD / 20) * trackW) / 2
            }
            y={barY + 19}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill={toneStroke('done')}
          >
            {`省下 ${savedD}d (-${Math.round((savedD / 20) * 100)}%)`}
          </text>
        </g>
      )}
    </g>
  );
}

function IoPipelineStage({
  state,
  beat,
  playToken,
}: {
  state: MegaMhcStepState;
  beat: number;
  playToken: number;
}) {
  if (state.phase === 'split_4') {
    const kWidths = [152, 152, 152, 152];
    const kXs = [14, 180, 346, 512];
    const cumD = [9, 13, 18, 20][Math.min(beat, 3)];

    return (
      <div className="mega-stage">
        <svg className="mega-svg" viewBox="0 0 680 282" aria-label="四个独立算子反复读写 HBM 路径">
          {/* 顶层：HBM 全局显存带 */}
          <rect
            x={14}
            y={8}
            width={652}
            height={52}
            rx={4}
            fill="var(--wisp-surface)"
            stroke="var(--wisp-border)"
          />
          <text x={24} y={24} fontSize={9.5} fontWeight={600} fill="var(--wisp-muted)">
            HBM 全局显存（每趟 Kernel 强制写回与重读）
          </text>
          {[
            { x: 24, w: 112, t: '$\\mathbf{y}_l + \\mathbf{X}_l$ (5d)' },
            { x: 162, w: 184, t: '$\\mathbf{X}_{l+1}$ 四流 (4d) · 搬运 3 次' },
            { x: 374, w: 114, t: '$h_{\\mathrm{in}}$ 单流 (1d)' },
            { x: 514, w: 142, t: 'Norm 输出 (1d)' },
          ].map((slot) => (
            <g key={slot.t}>
              <rect
                x={slot.x}
                y={30}
                width={slot.w}
                height={24}
                rx={3}
                fill="var(--wisp-bg)"
                stroke="var(--wisp-border)"
              />
              <SvgRichLabel
                x={slot.x + slot.w / 2}
                y={42}
                width={slot.w - 6}
                height={20}
                fontSize={9}
                fontWeight={600}
                text={slot.t}
              />
            </g>
          ))}

          {/* HBM <-> 4 个分立 Kernel 的往返数据流 */}
          {/* K1: 读 5d, 写 4d */}
          <DataFlowArrow
            points={[
              [66, 60],
              [66, 126],
            ]}
            tone="active"
            active={beat === 0}
            visible={beat >= 0}
            draw={true}
            flow={beat === 0}
            dotToken={beat === 0 ? playToken : 0}
            label="读 5d"
          />
          <DataFlowArrow
            points={[
              [126, 126],
              [126, 94],
              [210, 94],
              [210, 60],
            ]}
            tone="active"
            active={beat === 0}
            visible={beat >= 0}
            draw={true}
            flow={beat === 0}
            dotToken={beat === 0 ? playToken : 0}
            label="写 4d"
          />

          {/* K2: 重读 4d */}
          <DataFlowArrow
            points={[
              [254, 60],
              [254, 126],
            ]}
            tone="highlight"
            active={beat === 1}
            visible={beat >= 1}
            draw={true}
            flow={beat === 1}
            dotToken={beat === 1 ? playToken : 0}
            label="重读 4d"
          />

          {/* K3: 再读 4d, 写 1d */}
          <DataFlowArrow
            points={[
              [312, 60],
              [312, 94],
              [390, 94],
              [390, 126],
            ]}
            tone="active"
            active={beat === 2}
            visible={beat >= 2}
            draw={true}
            flow={beat === 2}
            dotToken={beat === 2 ? playToken : 0}
            label="再读 4d"
          />
          <DataFlowArrow
            points={[
              [446, 126],
              [446, 60],
            ]}
            tone="active"
            active={beat === 2}
            visible={beat >= 2}
            draw={true}
            flow={beat === 2}
            dotToken={beat === 2 ? playToken : 0}
            label="写 1d"
          />

          {/* K4: 读 1d, 写 1d */}
          <DataFlowArrow
            points={[
              [476, 60],
              [476, 94],
              [550, 94],
              [550, 126],
            ]}
            tone="active"
            active={beat === 3}
            visible={beat >= 3}
            draw={true}
            flow={beat === 3}
            dotToken={beat === 3 ? playToken : 0}
            label="读 1d"
          />
          <DataFlowArrow
            points={[
              [614, 126],
              [614, 60],
            ]}
            tone="active"
            active={beat === 3}
            visible={beat >= 3}
            draw={true}
            flow={beat === 3}
            dotToken={beat === 3 ? playToken : 0}
            label="写 1d"
          />

          {/* 4 个分立 Kernel 卡 */}
          {state.segments.map((seg, idx) => {
            const x = kXs[idx];
            const w = kWidths[idx];
            const isActive = idx <= beat;
            const tone = seg.tone === 'neutral' ? 'active' : seg.tone;
            return (
              <motion.g
                key={seg.label}
                initial={false}
                animate={{ opacity: isActive ? 1 : 0.3 }}
                transition={{ duration: 0.25, ease: MANIM_EASE }}
              >
                <rect
                  x={x}
                  y={128}
                  width={w}
                  height={66}
                  rx={4}
                  fill={idx === beat ? toneFill(tone) : 'var(--wisp-surface)'}
                  stroke={idx === beat ? toneStroke(tone) : 'var(--wisp-border)'}
                  strokeWidth={idx === beat ? 1.75 : 1}
                />
                <text
                  x={x + w / 2}
                  y={148}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill="var(--wisp-fg)"
                >
                  {`K${idx + 1}: ${seg.label}`}
                </text>
                <text
                  x={x + w / 2}
                  y={166}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  fill={toneStroke(tone)}
                >
                  {`访存 ${seg.costD}d`}
                </text>
                <text
                  x={x + w / 2}
                  y={183}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill="var(--wisp-muted)"
                >
                  {idx === 0
                    ? '写回 4d 到 HBM'
                    : idx === 1
                      ? '仅输出 24 标量'
                      : idx === 2
                        ? '4→1 写回 1d'
                        : '单流归一化'}
                </text>
              </motion.g>
            );
          })}

          <ActiveFocusFrame
            x={kXs[beat] - 4}
            y={124}
            w={kWidths[beat] + 8}
            h={74}
            tone={beat === 1 ? 'highlight' : 'active'}
            label={`Kernel ${beat + 1}`}
            visible={true}
          />

          <UnifiedByteBar state={state} revealedSegCount={beat + 1} cumulativeD={cumD} />
        </svg>

        <div className="mega-note-box">
          <RichText text={state.blockerNote} />
        </div>
      </div>
    );
  }

  if (state.phase === 'two_pass') {
    const barrierOn = beat >= 1;
    const blockedOn = beat >= 2;
    const pass2On = beat >= 3;
    const cumD = pass2On ? 14 : 9;

    return (
      <div className="mega-stage">
        <svg className="mega-svg" viewBox="0 0 680 282" aria-label="两遍融合遇全维归约依赖栅栏">
          {/* 顶层 HBM */}
          <rect
            x={14}
            y={8}
            width={652}
            height={52}
            rx={4}
            fill="var(--wisp-surface)"
            stroke="var(--wisp-border)"
          />
          <text x={24} y={24} fontSize={9.5} fontWeight={600} fill="var(--wisp-muted)">
            HBM 全局显存（Pass 1 必须把 X_l+1 落回 HBM，等 r_l+1 算完由 Pass 2 重读）
          </text>
          <rect
            x={24}
            y={30}
            width={142}
            height={24}
            rx={3}
            fill="var(--wisp-bg)"
            stroke="var(--wisp-border)"
          />
          <SvgRichLabel
            x={95}
            y={42}
            width={136}
            height={20}
            fontSize={9.5}
            text={'读 $\\mathbf{y}_l + \\mathbf{X}_l$ (5d)'}
          />
          <rect
            x={198}
            y={30}
            width={262}
            height={24}
            rx={3}
            fill={toneFill('highlight')}
            stroke={toneStroke('highlight')}
          />
          <SvgRichLabel
            x={329}
            y={42}
            width={254}
            height={20}
            fontSize={9.5}
            fontWeight={600}
            text={'$\\mathbf{X}_{l+1}$ $[T, 4, d]$ · Pass 1 写 4d → Pass 2 重读 4d'}
          />
          <rect
            x={492}
            y={30}
            width={164}
            height={24}
            rx={3}
            fill="var(--wisp-bg)"
            stroke="var(--wisp-border)"
          />
          <text x={574} y={45.5} textAnchor="middle" fontSize={9.5} fill="var(--wisp-fg)">
            写 Norm(h_in) (1d)
          </text>

          {/* Pass 1 读写箭头 */}
          <DataFlowArrow
            points={[
              [84, 60],
              [84, 126],
            ]}
            tone="active"
            active={true}
            visible={beat >= 0}
            draw={true}
            flow={beat === 0}
            dotToken={beat === 0 ? playToken : 0}
            label="读 5d"
          />
          <DataFlowArrow
            points={[
              [216, 126],
              [216, 60],
            ]}
            tone="active"
            active={true}
            visible={beat >= 0}
            draw={true}
            flow={beat === 0}
            dotToken={beat === 0 ? playToken : 0}
            label="写 4d"
            labelPos={[216, 78]}
          />

          {/* Pass 1 盒 */}
          <rect
            x={14}
            y={128}
            width={236}
            height={70}
            rx={4}
            fill={toneFill('active')}
            stroke={toneStroke('active')}
            strokeWidth={beat === 0 ? 1.75 : 1.25}
          />
          <text
            x={132}
            y={148}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={700}
            fill="var(--wisp-fg)"
          >
            Pass 1：Post+Res + 系数投影 (9d)
          </text>
          <SvgRichLabel
            x={132}
            y={163}
            width={224}
            height={18}
            fontSize={9.5}
            color="var(--wisp-muted)"
            text={
              '片上算完 $\\mathbf{X}_{l+1}$，同时累加 $\\|\\mathbf{X}\\|^2$ 与 $\\mathbf{X}\\varphi$'
            }
          />
          <text x={132} y={184} textAnchor="middle" fontSize={9} fill={toneStroke('active')}>
            寄存器容量不足以留存整条 4d 向量
          </text>

          {/* 归约栅栏 r_{l+1} */}
          <DataFlowArrow
            points={[
              [250, 162],
              [274, 162],
            ]}
            tone="highlight"
            active={barrierOn}
            visible={barrierOn}
            draw={true}
            flow={beat === 1}
            dotToken={beat === 1 ? playToken : 0}
          />
          <motion.g
            initial={false}
            animate={{ opacity: barrierOn ? 1 : 0.25 }}
            transition={{ duration: 0.25, ease: MANIM_EASE }}
          >
            <rect
              x={276}
              y={128}
              width={142}
              height={70}
              rx={4}
              fill={barrierOn ? toneFill('highlight') : 'var(--wisp-surface)'}
              stroke={barrierOn ? toneStroke('highlight') : 'var(--wisp-border)'}
              strokeWidth={barrierOn ? 1.75 : 1}
              strokeDasharray={barrierOn ? undefined : '4 3'}
            />
            <text
              x={347}
              y={148}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="var(--wisp-fg)"
            >
              全维归约栅栏 r_(l+1)
            </text>
            <text x={347} y={166} textAnchor="middle" fontSize={9} fill="var(--wisp-muted)">
              等整条 4d 算完才得分母
            </text>
            <text
              x={347}
              y={184}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={toneStroke('highlight')}
            >
              A_(l+1) = σ(α·proj/r + b)
            </text>
          </motion.g>

          {/* Beat 2: 阻塞依赖反馈弧 */}
          <DataFlowArrow
            points={[
              [347, 128],
              [347, 110],
              [162, 110],
              [162, 128],
            ]}
            tone="highlight"
            active={blockedOn}
            visible={blockedOn}
            draw={true}
            dashed={true}
            flow={beat === 2}
            dotToken={beat === 2 ? playToken : 0}
            label="$A_{l+1}$ 迟到，Pass 1 无法聚合 Pre"
          />

          {/* Pass 2 盒 + 重读箭头 */}
          <DataFlowArrow
            points={[
              [418, 162],
              [442, 162],
            ]}
            tone="highlight"
            active={pass2On}
            visible={pass2On}
            draw={true}
            flow={beat === 3}
            dotToken={beat === 3 ? playToken : 0}
          />
          <DataFlowArrow
            points={[
              [446, 60],
              [446, 94],
              [506, 94],
              [506, 126],
            ]}
            tone="highlight"
            active={pass2On}
            visible={pass2On}
            draw={true}
            flow={beat === 3}
            dotToken={beat === 3 ? playToken : 0}
            label="重读 4d"
          />
          <DataFlowArrow
            points={[
              [594, 126],
              [594, 60],
            ]}
            tone="highlight"
            active={pass2On}
            visible={pass2On}
            draw={true}
            flow={beat === 3}
            dotToken={beat === 3 ? playToken : 0}
            label="写 1d"
          />

          <motion.g
            initial={false}
            animate={{ opacity: pass2On ? 1 : 0.3 }}
            transition={{ duration: 0.25, ease: MANIM_EASE }}
          >
            <rect
              x={444}
              y={128}
              width={222}
              height={70}
              rx={4}
              fill={pass2On ? toneFill('highlight') : 'var(--wisp-surface)'}
              stroke={pass2On ? toneStroke('highlight') : 'var(--wisp-border)'}
              strokeWidth={pass2On ? 1.75 : 1}
            />
            <text
              x={555}
              y={148}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={700}
              fill="var(--wisp-fg)"
            >
              Pass 2：Pre + RMSNorm (5d)
            </text>
            <SvgRichLabel
              x={555}
              y={163}
              width={210}
              height={18}
              fontSize={9.5}
              color="var(--wisp-muted)"
              text={'等 $A_{l+1}$ 就绪后重读 $\\mathbf{X}_{l+1}$ (4d)'}
            />
            <text
              x={555}
              y={184}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={toneStroke('highlight')}
            >
              访存卡死在 9d + 5d = 14d
            </text>
          </motion.g>

          <ActiveFocusFrame
            x={beat === 0 ? 10 : beat === 1 ? 272 : beat === 2 ? 156 : 440}
            y={beat === 2 ? 96 : 124}
            w={beat === 0 ? 244 : beat === 1 ? 150 : beat === 2 ? 198 : 230}
            h={beat === 2 ? 36 : 78}
            tone={beat === 0 ? 'active' : 'highlight'}
            label={
              beat === 0
                ? 'Pass 1'
                : beat === 1
                  ? '全维归约栅栏'
                  : beat === 2
                    ? '依赖阻塞'
                    : '被迫 Pass 2'
            }
            visible={true}
          />

          <UnifiedByteBar state={state} revealedSegCount={pass2On ? 2 : 1} cumulativeD={cumD} />
        </svg>

        <div className="mega-note-box">
          <RichText text={state.blockerNote} />
        </div>
      </div>
    );
  }

  if (state.phase === 'shift_dep') {
    const shifted = beat >= 1;
    const initReady = beat >= 2;
    const endReady = beat >= 3;

    return (
      <div className="mega-stage">
        <svg className="mega-svg" viewBox="0 0 680 282" aria-label="错位时移切断同层等待依赖">
          {/* 3 个连续子层卡片 */}
          <rect
            x={14}
            y={14}
            width={186}
            height={154}
            rx={4}
            fill="var(--wisp-surface)"
            stroke="var(--wisp-border)"
          />
          <text x={26} y={34} fontSize={10.5} fontWeight={700} fill="var(--wisp-fg)">
            子层 l - 1（上一子层）
          </text>
          <rect
            x={26}
            y={46}
            width={162}
            height={42}
            rx={3}
            fill={shifted ? toneFill('done') : 'var(--wisp-bg)'}
            stroke={shifted ? toneStroke('done') : 'var(--wisp-border)'}
            strokeWidth={shifted ? 1.5 : 1}
          />
          <SvgRichLabel
            x={107}
            y={62}
            width={154}
            height={18}
            fontSize={9.5}
            fontWeight={600}
            text={'Post+Res 顺便归约 $r_{l-1}$'}
          />
          <SvgRichLabel
            x={107}
            y={79}
            width={154}
            height={18}
            fontSize={9.5}
            fontWeight={700}
            color={toneStroke('done')}
            text={'已产出下层系数 $A_{l-1}$'}
          />

          {/* 当前子层 l */}
          <rect
            x={224}
            y={14}
            width={232}
            height={154}
            rx={4}
            fill={shifted ? toneFill('done') : toneFill('highlight')}
            stroke={shifted ? toneStroke('done') : toneStroke('highlight')}
            strokeWidth={1.5}
          />
          <text x={236} y={34} fontSize={10.5} fontWeight={700} fill="var(--wisp-fg)">
            子层 l（当前单遍计算）
          </text>

          {/* 旧依赖（在 beat 0 高亮，beat >= 1 退暗） */}
          <motion.g
            initial={false}
            animate={{ opacity: shifted ? 0.24 : 1 }}
            transition={{ duration: 0.25, ease: MANIM_EASE }}
          >
            <rect
              x={236}
              y={46}
              width={100}
              height={36}
              rx={3}
              fill="var(--wisp-bg)"
              stroke={toneStroke('highlight')}
            />
            <text
              x={286}
              y={62}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill="var(--wisp-fg)"
            >
              本层归约 r_l
            </text>
            <text x={286} y={76} textAnchor="middle" fontSize={8.5} fill={toneStroke('highlight')}>
              得本层 A_l
            </text>
          </motion.g>

          <DataFlowArrow
            points={[
              [286, 82],
              [286, 106],
              [340, 106],
              [340, 118],
            ]}
            tone="highlight"
            active={!shifted}
            visible={!shifted}
            draw={true}
            dashed={true}
            flow={beat === 0}
            dotToken={beat === 0 ? playToken : 0}
            label="旧等待死结"
          />

          {/* 当前子层 Pre + F 框 */}
          <rect
            x={236}
            y={118}
            width={208}
            height={40}
            rx={3}
            fill="var(--wisp-bg)"
            stroke={shifted ? toneStroke('done') : toneStroke('highlight')}
            strokeWidth={1.5}
          />
          <SvgRichLabel
            x={340}
            y={138}
            width={196}
            height={24}
            fontSize={9.5}
            fontWeight={600}
            text={
              shifted
                ? '$\\mathcal{F}_l(A_{l-1} X_l)$：立即聚合，零等待'
                : '等待 $A_l$ 才能算 $\\mathcal{F}_l$'
            }
          />

          {/* 子层 l+1 */}
          <rect
            x={480}
            y={14}
            width={186}
            height={154}
            rx={4}
            fill="var(--wisp-surface)"
            stroke="var(--wisp-border)"
          />
          <text x={492} y={34} fontSize={10.5} fontWeight={700} fill="var(--wisp-fg)">
            子层 l + 1（下一子层）
          </text>
          <rect
            x={492}
            y={118}
            width={162}
            height={40}
            rx={3}
            fill={shifted ? toneFill('done') : 'var(--wisp-bg)'}
            stroke={shifted ? toneStroke('done') : 'var(--wisp-border)'}
          />
          <SvgRichLabel
            x={573}
            y={138}
            width={150}
            height={22}
            fontSize={9.5}
            fontWeight={600}
            text={'直接消费本层 $A_l$'}
          />

          {/* 时移绿箭 1：A_{l-1} 从 l-1 跨层递给 l */}
          <DataFlowArrow
            points={[
              [188, 68],
              [212, 68],
              [212, 138],
              [236, 138],
            ]}
            tone="done"
            active={shifted}
            visible={shifted}
            draw={true}
            flow={beat === 1}
            dotToken={beat === 1 ? playToken : 0}
            label="$A_{l-1}$"
            labelPos={[212, 102]}
          />

          {/* 时移绿箭 2：本层算出的 A_l 递给 l+1 */}
          <DataFlowArrow
            points={[
              [336, 64],
              [468, 64],
              [468, 138],
              [492, 138],
            ]}
            tone="done"
            active={shifted}
            visible={shifted}
            draw={true}
            drawDelay={0.12}
            flow={beat === 1}
            dotToken={beat === 1 ? playToken : 0}
            label="递交 $A_l$"
            labelPos={[468, 102]}
          />

          {/* 首尾边界胶囊（Beat 2 与 Beat 3） */}
          <motion.g
            initial={false}
            animate={{ opacity: initReady ? 1 : 0.25 }}
            transition={{ duration: 0.25, ease: MANIM_EASE }}
          >
            <rect
              x={26}
              y={104}
              width={162}
              height={52}
              rx={3}
              fill={initReady ? toneFill('done') : 'var(--wisp-bg)'}
              stroke={initReady ? toneStroke('done') : 'var(--wisp-border)'}
              strokeWidth={initReady ? 1.5 : 1}
            />
            <text
              x={107}
              y={124}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={700}
              fill="var(--wisp-fg)"
            >
              首子层起步边界
            </text>
            <SvgRichLabel
              x={107}
              y={140}
              width={154}
              height={18}
              fontSize={9.5}
              color={toneStroke('done')}
              text={'固定 $A_{-1} = [1, 0, 0, 0]$'}
            />
          </motion.g>

          <motion.g
            initial={false}
            animate={{ opacity: endReady ? 1 : 0.25 }}
            transition={{ duration: 0.25, ease: MANIM_EASE }}
          >
            <rect
              x={492}
              y={52}
              width={162}
              height={48}
              rx={3}
              fill={endReady ? toneFill('done') : 'var(--wisp-bg)'}
              stroke={endReady ? toneStroke('done') : 'var(--wisp-border)'}
              strokeWidth={endReady ? 1.5 : 1}
            />
            <text
              x={573}
              y={71}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={700}
              fill="var(--wisp-fg)"
            >
              整网末层归并边界
            </text>
            <text x={573} y={88} textAnchor="middle" fontSize={9.5} fill={toneStroke('done')}>
              末层 ffn_pre 压回 [T, d]
            </text>
          </motion.g>

          <ActiveFocusFrame
            x={beat === 0 ? 232 : beat === 1 ? 184 : beat === 2 ? 22 : 488}
            y={beat === 0 ? 42 : beat === 1 ? 54 : beat === 2 ? 100 : 48}
            w={beat === 0 ? 112 : beat === 1 ? 314 : 170}
            h={beat === 0 ? 120 : beat === 1 ? 110 : beat === 2 ? 60 : 56}
            tone={beat === 0 ? 'highlight' : 'done'}
            label={
              beat === 0
                ? '同层阻塞'
                : beat === 1
                  ? '跨层时移接力'
                  : beat === 2
                    ? '首层初值'
                    : '末层归并'
            }
            visible={true}
          />

          <UnifiedByteBar state={state} revealedSegCount={shifted ? 2 : 1} cumulativeD={10} />
        </svg>

        <div className="mega-note-box">
          <RichText text={state.blockerNote} />
        </div>
      </div>
    );
  }

  // Step 4: single_pass — 片上寄存器单遍 10d
  const regProjOn = beat >= 1;
  const regPreOn = beat >= 2;
  const writeBackOn = beat >= 3;
  const cumD = writeBackOn ? 10 : 5;

  return (
    <div className="mega-stage">
      <svg className="mega-svg" viewBox="0 0 680 282" aria-label="单遍 Mega-mHC 触及 10d 理论下界">
        {/* 顶层 HBM */}
        <rect
          x={14}
          y={8}
          width={652}
          height={52}
          rx={4}
          fill="var(--wisp-surface)"
          stroke="var(--wisp-border)"
        />
        <text x={24} y={24} fontSize={9.5} fontWeight={600} fill="var(--wisp-muted)">
          HBM 全局显存（每子层仅 1 次读 5d + 1 次写 5d = 10d 理论下界）
        </text>
        <rect
          x={24}
          y={30}
          width={226}
          height={24}
          rx={3}
          fill={toneFill('done')}
          stroke={toneStroke('done')}
        />
        <SvgRichLabel
          x={137}
          y={42}
          width={218}
          height={20}
          fontSize={9.5}
          fontWeight={600}
          text={'单遍读：$\\mathbf{y}_l$ (1d) + $\\mathbf{X}_l$ (4d) = 5d'}
        />
        <rect
          x={274}
          y={30}
          width={140}
          height={24}
          rx={3}
          fill="var(--wisp-bg)"
          stroke="var(--wisp-border)"
        />
        <SvgRichLabel
          x={344}
          y={42}
          width={132}
          height={20}
          fontSize={9.5}
          color="var(--wisp-muted)"
          text={'上层已就绪 $A_l$'}
        />
        <rect
          x={438}
          y={30}
          width={218}
          height={24}
          rx={3}
          fill={writeBackOn ? toneFill('done') : 'var(--wisp-bg)'}
          stroke={writeBackOn ? toneStroke('done') : 'var(--wisp-border)'}
        />
        <SvgRichLabel
          x={547}
          y={42}
          width={210}
          height={20}
          fontSize={9.5}
          fontWeight={600}
          text={'单遍写：$\\mathbf{X}_{l+1}$ (4d) + Norm (1d) = 5d'}
        />

        {/* 读 5d 箭 */}
        <DataFlowArrow
          points={[
            [137, 60],
            [137, 114],
          ]}
          tone="done"
          active={true}
          visible={beat >= 0}
          draw={true}
          flow={beat === 0}
          dotToken={beat === 0 ? playToken : 0}
          label="单遍读 5d"
        />

        {/* 写 5d 箭 */}
        <DataFlowArrow
          points={[
            [547, 114],
            [547, 60],
          ]}
          tone="done"
          active={writeBackOn}
          visible={writeBackOn}
          draw={true}
          flow={beat === 3}
          dotToken={beat === 3 ? playToken : 0}
          label="单遍写 5d"
        />

        {/* 片上寄存器融合核大框 */}
        <rect
          x={14}
          y={116}
          width={652}
          height={86}
          rx={4}
          fill={toneFill('done')}
          stroke={toneStroke('done')}
          strokeWidth={1.75}
        />
        <text x={26} y={134} fontSize={10} fontWeight={700} fill={toneStroke('done')}>
          Mega-mHC 单遍融合算子（全程片上 SRAM / 寄存器完成，无中间四流写回）
        </text>

        {/* 左子步：Post+Res + 投影 */}
        <motion.g
          initial={false}
          animate={{ opacity: regProjOn ? 1 : 0.45 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        >
          <rect
            x={26}
            y={144}
            width={294}
            height={48}
            rx={3}
            fill="var(--wisp-bg)"
            stroke={regProjOn ? toneStroke('done') : 'var(--wisp-border)'}
            strokeWidth={regProjOn ? 1.5 : 1}
          />
          <SvgRichLabel
            x={173}
            y={160}
            width={286}
            height={18}
            fontSize={10}
            fontWeight={600}
            text={'① Post+Res 更新 $\\mathbf{X}_{l+1}$ + 并行累加投影'}
          />
          <text x={173} y={180} textAnchor="middle" fontSize={9} fill="var(--wisp-muted)">
            一次扫过寄存器同步算 ||X||² 与下层 A_(l+1)/B/C
          </text>
        </motion.g>

        {/* 寄存器内部传递箭 */}
        <DataFlowArrow
          points={[
            [320, 168],
            [358, 168],
          ]}
          tone="done"
          active={regPreOn}
          visible={regPreOn}
          draw={true}
          flow={beat === 2}
          dotToken={beat === 2 ? playToken : 0}
        />

        {/* 右子步：A_l 聚合 + Norm */}
        <motion.g
          initial={false}
          animate={{ opacity: regPreOn ? 1 : 0.45 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        >
          <rect
            x={360}
            y={144}
            width={294}
            height={48}
            rx={3}
            fill="var(--wisp-bg)"
            stroke={regPreOn ? toneStroke('done') : 'var(--wisp-border)'}
            strokeWidth={regPreOn ? 1.5 : 1}
          />
          <SvgRichLabel
            x={507}
            y={160}
            width={286}
            height={18}
            fontSize={10}
            fontWeight={600}
            text={'② 片上直接用 $A_l$ 聚合 + BF16 RMSNorm'}
          />
          <text x={507} y={180} textAnchor="middle" fontSize={9} fill={toneStroke('done')}>
            寄存器直出 1d 归一化输入，无需 Pass 2
          </text>
        </motion.g>

        <ActiveFocusFrame
          x={beat === 0 ? 110 : beat === 1 ? 22 : beat === 2 ? 356 : 434}
          y={beat === 0 ? 26 : beat === 3 ? 26 : 140}
          w={beat === 0 ? 120 : beat === 3 ? 226 : 302}
          h={beat === 0 || beat === 3 ? 32 : 56}
          tone="done"
          label={
            beat === 0
              ? '单遍读入 5d'
              : beat === 1
                ? '更新+投影'
                : beat === 2
                  ? '直接 Pre+Norm'
                  : '单遍写出 5d'
          }
          visible={true}
        />

        <UnifiedByteBar state={state} revealedSegCount={writeBackOn ? 2 : 1} cumulativeD={cumD} />
      </svg>

      <div className="mega-note-box">
        <RichText text={state.blockerNote} />
      </div>
    </div>
  );
}

function BoundaryCompareStage({
  layerKind,
  onSelectKind,
  beat,
  playToken,
}: {
  layerKind: LayerKind;
  onSelectKind: (kind: LayerKind) => void;
  beat: number;
  playToken: number;
}) {
  const spec = LAYER_BOUNDARY_SPECS[layerKind];
  const isEngram = layerKind === 'engram';
  const gpuTone = isEngram ? 'highlight' : 'active';
  const gpuLit = beat >= 1;
  const npuLit = beat >= 2;
  const verdictLit = beat >= 3;

  return (
    <div className="mega-stage">
      <div className="mega-switcher">
        <span style={{ fontSize: '0.75rem', color: 'var(--wisp-muted)' }}>
          反事实对比（层位边界切分）：
        </span>
        <div className="mega-switcher__group" role="group" aria-label="切换层位模式">
          {(Object.keys(LAYER_BOUNDARY_SPECS) as LayerKind[]).map((id) => (
            <button
              key={id}
              type="button"
              className="mega-switcher__btn"
              aria-pressed={layerKind === id}
              onClick={() => onSelectKind(id)}
            >
              {LAYER_BOUNDARY_SPECS[id].label}
            </button>
          ))}
        </div>
      </div>

      <svg className="mega-svg" viewBox="0 0 680 236" aria-label="GPU 与 NPU 边界融合双轨对照">
        {/* 上轨：NVIDIA GPU */}
        <rect
          x={10}
          y={10}
          width={660}
          height={98}
          rx={4}
          fill={gpuLit ? toneFill(gpuTone) : 'var(--wisp-surface)'}
          stroke={gpuLit ? toneStroke(gpuTone) : 'var(--wisp-border)'}
          strokeWidth={1.35}
        />
        <text x={22} y={27} fontSize={10.5} fontWeight={700} fill="var(--wisp-fg)">
          {`NVIDIA GPU（vLLM 99b0b0b0）· ${spec.gpuIo}`}
        </text>

        <rect
          x={22}
          y={46}
          width={104}
          height={44}
          rx={3}
          fill="var(--wisp-bg)"
          stroke="var(--wisp-border)"
        />
        <text
          x={74}
          y={64}
          textAnchor="middle"
          fontSize={9.5}
          fontWeight={600}
          fill="var(--wisp-fg)"
        >
          上层增量 + 四流
        </text>
        <text x={74} y={80} textAnchor="middle" fontSize={8.5} fill="var(--wisp-muted)">
          (x, residual, prev_pre)
        </text>

        <DataFlowArrow
          points={[
            [126, 68],
            [156, 68],
          ]}
          tone={gpuTone}
          active={gpuLit}
          visible={gpuLit}
          draw={true}
          flow={beat === 1}
          dotToken={beat === 1 ? playToken : 0}
        />

        {isEngram ? (
          <motion.g
            initial={false}
            animate={{ opacity: gpuLit ? 1 : 0.3 }}
            transition={{ duration: 0.25, ease: MANIM_EASE }}
          >
            <rect
              x={158}
              y={46}
              width={128}
              height={44}
              rx={3}
              fill="var(--wisp-bg)"
              stroke={toneStroke('highlight')}
              strokeWidth={1.5}
            />
            <text
              x={222}
              y={64}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              fill="var(--wisp-fg)"
            >
              mhc_post_tilelang
            </text>
            <text x={222} y={80} textAnchor="middle" fontSize={8.5} fill="var(--wisp-muted)">
              显式写出 [T, 4, d]
            </text>

            <DataFlowArrow
              points={[
                [286, 68],
                [308, 68],
              ]}
              tone="highlight"
              active={gpuLit}
              visible={gpuLit}
              draw={true}
              flow={beat === 1}
              dotToken={beat === 1 ? playToken : 0}
            />

            <rect
              x={310}
              y={46}
              width={132}
              height={44}
              rx={3}
              fill="var(--wisp-bg)"
              stroke={toneStroke('highlight')}
              strokeWidth={1.75}
            />
            <text
              x={376}
              y={64}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={700}
              fill={toneStroke('highlight')}
            >
              Engram 原位注入
            </text>
            <text x={376} y={80} textAnchor="middle" fontSize={8.5} fill="var(--wisp-muted)">
              更新四流条件记忆
            </text>

            <DataFlowArrow
              points={[
                [442, 68],
                [464, 68],
              ]}
              tone="highlight"
              active={gpuLit}
              visible={gpuLit}
              draw={true}
              flow={beat === 1}
              dotToken={beat === 1 ? playToken : 0}
            />

            <rect
              x={466}
              y={46}
              width={96}
              height={44}
              rx={3}
              fill="var(--wisp-bg)"
              stroke={toneStroke('highlight')}
              strokeWidth={1.5}
            />
            <text
              x={514}
              y={64}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              fill="var(--wisp-fg)"
            >
              mhc_pre
            </text>
            <text x={514} y={80} textAnchor="middle" fontSize={8.5} fill="var(--wisp-muted)">
              4→1 + Norm
            </text>
          </motion.g>
        ) : (
          <motion.g
            initial={false}
            animate={{ opacity: gpuLit ? 1 : 0.3 }}
            transition={{ duration: 0.25, ease: MANIM_EASE }}
          >
            <rect
              x={158}
              y={46}
              width={404}
              height={44}
              rx={3}
              fill="var(--wisp-bg)"
              stroke={toneStroke('active')}
              strokeWidth={1.75}
            />
            <text
              x={360}
              y={64}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="var(--wisp-fg)"
            >
              mhc_shifted_post_pre 跨子层单遍融合（CuTe / DeepGEMM）
            </text>
            <text x={360} y={80} textAnchor="middle" fontSize={9} fill={toneStroke('active')}>
              上层 Post + 本层 Pre + Norm 一次扫过，触及 10d 下界
            </text>
          </motion.g>
        )}

        <DataFlowArrow
          points={[
            [562, 68],
            [584, 68],
          ]}
          tone={gpuTone}
          active={gpuLit}
          visible={gpuLit}
          draw={true}
          flow={beat === 1}
          dotToken={beat === 1 ? playToken : 0}
        />
        <rect
          x={586}
          y={46}
          width={72}
          height={44}
          rx={3}
          fill="var(--wisp-bg)"
          stroke="var(--wisp-border)"
        />
        <text
          x={622}
          y={72}
          textAnchor="middle"
          fontSize={9.5}
          fontWeight={600}
          fill="var(--wisp-fg)"
        >
          Attn / MoE
        </text>

        {/* 下轨：Huawei Ascend NPU */}
        <rect
          x={10}
          y={120}
          width={660}
          height={98}
          rx={4}
          fill={npuLit ? toneFill('done') : 'var(--wisp-surface)'}
          stroke={npuLit ? toneStroke('done') : 'var(--wisp-border)'}
          strokeWidth={1.35}
        />
        <text x={22} y={140} fontSize={10.5} fontWeight={700} fill="var(--wisp-fg)">
          {`Huawei Ascend NPU（vllm-ascend b776261e）· ${spec.npuIo}`}
        </text>

        <rect
          x={22}
          y={152}
          width={104}
          height={46}
          rx={3}
          fill="var(--wisp-bg)"
          stroke="var(--wisp-border)"
        />
        <text
          x={74}
          y={172}
          textAnchor="middle"
          fontSize={9.5}
          fontWeight={600}
          fill="var(--wisp-fg)"
        >
          四流 SP 分片
        </text>
        <text x={74} y={188} textAnchor="middle" fontSize={8.5} fill="var(--wisp-muted)">
          [T/SP, 4, d] 已展开
        </text>

        <DataFlowArrow
          points={[
            [126, 175],
            [156, 175],
          ]}
          tone="done"
          active={npuLit}
          visible={npuLit}
          draw={true}
          flow={beat === 2}
          dotToken={beat === 2 ? playToken : 0}
        />

        <motion.g
          initial={false}
          animate={{ opacity: npuLit ? 1 : 0.3 }}
          transition={{ duration: 0.25, ease: MANIM_EASE }}
        >
          {isEngram && (
            <>
              <rect
                x={158}
                y={152}
                width={124}
                height={46}
                rx={3}
                fill="var(--wisp-bg)"
                stroke={toneStroke('done')}
                strokeWidth={1.6}
              />
              <text
                x={220}
                y={172}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={700}
                fill={toneStroke('done')}
              >
                AscendEngram
              </text>
              <text x={220} y={188} textAnchor="middle" fontSize={8.5} fill="var(--wisp-muted)">
                直接原位读写
              </text>
              <DataFlowArrow
                points={[
                  [282, 175],
                  [304, 175],
                ]}
                tone="done"
                active={npuLit}
                visible={npuLit}
                draw={true}
                flow={beat === 2}
                dotToken={beat === 2 ? playToken : 0}
              />
            </>
          )}

          <rect
            x={isEngram ? 306 : 158}
            y={152}
            width={isEngram ? 132 : 210}
            height={46}
            rx={3}
            fill="var(--wisp-bg)"
            stroke={toneStroke('done')}
            strokeWidth={1.5}
          />
          <text
            x={(isEngram ? 306 : 158) + (isEngram ? 132 : 210) / 2}
            y={172}
            textAnchor="middle"
            fontSize={9.5}
            fontWeight={600}
            fill="var(--wisp-fg)"
          >
            npu_hc_pre_v3
          </text>
          <text
            x={(isEngram ? 306 : 158) + (isEngram ? 132 : 210) / 2}
            y={188}
            textAnchor="middle"
            fontSize={8.5}
            fill="var(--wisp-muted)"
          >
            Sinkhorn + 4→1 聚合
          </text>

          <DataFlowArrow
            points={[
              [isEngram ? 438 : 368, 175],
              [isEngram ? 460 : 396, 175],
            ]}
            tone="done"
            active={npuLit}
            visible={npuLit}
            draw={true}
            flow={beat === 2}
            dotToken={beat === 2 ? playToken : 0}
          />

          <rect
            x={isEngram ? 462 : 398}
            y={152}
            width={isEngram ? 98 : 134}
            height={46}
            rx={3}
            fill="var(--wisp-bg)"
            stroke="var(--wisp-border)"
          />
          <text
            x={(isEngram ? 462 : 398) + (isEngram ? 98 : 134) / 2}
            y={172}
            textAnchor="middle"
            fontSize={9.5}
            fontWeight={600}
            fill="var(--wisp-fg)"
          >
            Attn / MoE
          </text>
          <text
            x={(isEngram ? 462 : 398) + (isEngram ? 98 : 134) / 2}
            y={188}
            textAnchor="middle"
            fontSize={8.5}
            fill="var(--wisp-muted)"
          >
            AllGather / RS
          </text>

          <DataFlowArrow
            points={[
              [isEngram ? 560 : 532, 175],
              [isEngram ? 578 : 558, 175],
            ]}
            tone="done"
            active={npuLit}
            visible={npuLit}
            draw={true}
            flow={beat === 2}
            dotToken={beat === 2 ? playToken : 0}
          />

          <rect
            x={isEngram ? 580 : 560}
            y={152}
            width={isEngram ? 78 : 98}
            height={46}
            rx={3}
            fill="var(--wisp-bg)"
            stroke={toneStroke('done')}
            strokeWidth={1.5}
          />
          <text
            x={(isEngram ? 580 : 560) + (isEngram ? 78 : 98) / 2}
            y={172}
            textAnchor="middle"
            fontSize={9.5}
            fontWeight={600}
            fill="var(--wisp-fg)"
          >
            npu_hc_post
          </text>
          <text
            x={(isEngram ? 580 : 560) + (isEngram ? 78 : 98) / 2}
            y={188}
            textAnchor="middle"
            fontSize={8.5}
            fill="var(--wisp-muted)"
          >
            成对写回四流
          </text>
        </motion.g>

        <ActiveFocusFrame
          x={beat === 1 ? 152 : beat === 2 ? 152 : verdictLit ? (isEngram ? 304 : 152) : 16}
          y={beat === 1 ? 42 : beat === 2 ? 148 : 42}
          w={beat === 1 ? 414 : beat === 2 ? 510 : verdictLit ? (isEngram ? 262 : 414) : 116}
          h={52}
          tone={beat === 2 ? 'done' : gpuTone}
          label={
            beat === 0
              ? '四流边界'
              : beat === 1
                ? isEngram
                  ? 'GPU 显式拆开边界'
                  : 'GPU 10d 单遍融合'
                : beat === 2
                  ? 'NPU 成对写回'
                  : '核心架构权衡'
          }
          visible={true}
        />
      </svg>

      <div className="mega-note-box">{spec.summary}</div>
    </div>
  );
}

export default function MegaMhcPassExplainer({ title }: MegaMhcPassExplainerProps) {
  const steps = useMemo(() => buildMegaMhcPassSteps(), []);
  const [layerKind, setLayerKind] = useState<LayerKind>('normal');

  return (
    <BeatExplainer
      steps={steps}
      title={title}
      label={title}
      stageMinHeight={436}
      getBeats={(step) => BEAT_SCHEDULES[step.state.phase]}
      getFormula={(step) => step.state.formulaTex}
      replayTrigger={layerKind}
    >
      {(step, { beat, dotToken }) => {
        if (step.state.phase === 'boundary') {
          return (
            <BoundaryCompareStage
              layerKind={layerKind}
              onSelectKind={setLayerKind}
              beat={beat}
              playToken={dotToken}
            />
          );
        }
        return <IoPipelineStage state={step.state} beat={beat} playToken={dotToken} />;
      }}
    </BeatExplainer>
  );
}
