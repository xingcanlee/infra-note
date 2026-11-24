import { Explainer, RichText, loadKatex, type Step } from 'astro-wisp/explainers';
import { motion, useInView } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MANIM_EASE, MORPH_SPRING, defaultBeats, type BeatSpec } from './motion';
import './kit.css';

export { MANIM_EASE, MORPH_SPRING, defaultBeats, type BeatSpec };

export interface BeatStageRenderCtx {
  beat: number;
  totalBeats: number;
  beatLabel: string;
  dotToken: number;
  index: number;
  replayKey: number;
  expanded: boolean;
  reducedMotion: boolean;
  finishNow: () => void;
}

export interface BeatExplainerProps<S> {
  steps: Step<S>[];
  title?: string;
  label?: string;
  wide?: boolean;
  stageMinHeight?: number | string;
  getBeats: (step: Step<S>, index: number) => readonly BeatSpec[];
  getFormula?: (step: Step<S>, index: number) => string | undefined;
  replayTrigger?: string | number;
  children: (step: Step<S>, ctx: BeatStageRenderCtx) => ReactNode;
}

export function SvgBeatGroup({
  visible = true,
  dimmed = false,
  dimOpacity = 0.3,
  hiddenOpacity = 0,
  children,
}: {
  visible?: boolean;
  dimmed?: boolean;
  dimOpacity?: number;
  hiddenOpacity?: number;
  children: ReactNode;
}) {
  return (
    <motion.g
      initial={false}
      animate={{ opacity: !visible ? hiddenOpacity : dimmed ? dimOpacity : 1 }}
      transition={{ duration: visible ? 0.24 : 0, ease: MANIM_EASE }}
    >
      {children}
    </motion.g>
  );
}

interface BeatStageFrameProps<S> {
  step: Step<S>;
  index: number;
  replayKey: number;
  expanded: boolean;
  reducedMotion: boolean;
  getBeats: (step: Step<S>, index: number) => readonly BeatSpec[];
  getFormula?: (step: Step<S>, index: number) => string | undefined;
  replayTrigger?: string | number;
  children: (step: Step<S>, ctx: BeatStageRenderCtx) => ReactNode;
}

function BeatStageFrame<S>({
  step,
  index,
  replayKey,
  expanded,
  reducedMotion,
  getBeats,
  getFormula,
  replayTrigger,
  children,
}: BeatStageFrameProps<S>) {
  const rawSchedule = getBeats(step, index);
  const serializedSchedule = rawSchedule.map((b) => `${b.at}:${b.label}`).join('|');
  const schedule = useMemo<readonly BeatSpec[]>(() => {
    const parsed = serializedSchedule
      .split('|')
      .filter(Boolean)
      .map((pair) => {
        const sep = pair.indexOf(':');
        return { at: Number(pair.slice(0, sep)), label: pair.slice(sep + 1) };
      });
    return parsed.length > 0 ? parsed : [{ at: 0, label: '' }];
  }, [serializedSchedule]);

  const finalBeat = schedule.length - 1;
  const shellRef = useRef<HTMLDivElement>(null);
  const inView = useInView(shellRef, { once: true, amount: 0.25 });
  const shouldPlay = inView || index > 0 || replayKey > 0;
  const triggerKey = `${index}:${replayKey}:${replayTrigger ?? ''}:${shouldPlay ? 'play' : 'rest'}`;

  const [playback, setPlayback] = useState<{
    trigger: string;
    beat: number;
    token: number;
  }>({
    trigger: triggerKey,
    beat: finalBeat,
    token: 0,
  });

  useEffect(() => {
    if (!shouldPlay) {
      const done = window.setTimeout(() => {
        setPlayback((prev) => ({
          trigger: triggerKey,
          beat: finalBeat,
          token: prev.token,
        }));
      }, 0);
      return () => window.clearTimeout(done);
    }

    const timers: number[] = [];
    schedule.forEach((spec, idx) => {
      const t = window.setTimeout(() => {
        setPlayback((prev) => ({
          trigger: triggerKey,
          beat: prev.trigger === triggerKey ? Math.max(prev.beat, idx) : idx,
          token: idx === 0 && prev.trigger !== triggerKey ? prev.token + 1 : prev.token,
        }));
      }, spec.at);
      timers.push(t);
    });

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [shouldPlay, triggerKey, schedule, finalBeat]);

  const isStale = playback.trigger !== triggerKey;
  const beat = shouldPlay ? (isStale ? 0 : Math.min(playback.beat, finalBeat)) : finalBeat;
  const playToken = shouldPlay && isStale ? playback.token + 1 : playback.token;
  const dotToken = reducedMotion ? 0 : playToken;
  const activeBeat = schedule[Math.min(beat, finalBeat)];
  const formula = getFormula?.(step, index);
  const stepTitle = step.label ?? `步骤 ${index + 1}`;

  const finishNow = useCallback(() => {
    setPlayback((prev) => ({
      trigger: triggerKey,
      beat: finalBeat,
      token: prev.token,
    }));
  }, [triggerKey, finalBeat]);

  return (
    <div className="wisp-kit-shell" ref={shellRef}>
      <div className="wisp-kit-banner">
        <span className="wisp-kit-banner__tag">
          第 {index + 1} 步 · {stepTitle}
          {schedule.length > 1 && (
            <span className="wisp-kit-banner__beat">
              · {beat + 1}/{schedule.length} {activeBeat.label}
            </span>
          )}
        </span>
        {formula && (
          <span className="wisp-kit-banner__eq">
            <RichText text={formula} />
          </span>
        )}
        <motion.span
          className="wisp-kit-banner__progress"
          aria-hidden="true"
          initial={false}
          animate={{ width: `${((Math.min(beat, finalBeat) + 1) / schedule.length) * 100}%` }}
          transition={{ duration: 0.36, ease: MANIM_EASE }}
        />
      </div>

      <div className="wisp-kit-body">
        {children(step, {
          beat,
          totalBeats: schedule.length,
          beatLabel: activeBeat.label,
          dotToken,
          index,
          replayKey,
          expanded,
          reducedMotion,
          finishNow,
        })}
      </div>
    </div>
  );
}

/**
 * 带页内多拍因果递进、公式推导横幅与视口触发的通用讲解容器：
 * - 首帧 SSR 与初次客户端水合渲染终态，保障可访问性与零水合错位
 * - 滚入视口、翻页、重播或反事实分支切换时自动从 Beat 0 顺序推演
 */
export default function BeatExplainer<S>({
  steps,
  title,
  label,
  wide = false,
  stageMinHeight,
  getBeats,
  getFormula,
  replayTrigger,
  children,
}: BeatExplainerProps<S>) {
  useEffect(() => {
    void loadKatex();
  }, []);

  return (
    <Explainer
      steps={steps}
      title={title}
      label={label ?? title}
      wide={wide}
      stageMinHeight={stageMinHeight}
    >
      {(step, index, { replayKey, expanded, reducedMotion }) => (
        <BeatStageFrame
          step={step}
          index={index}
          replayKey={replayKey}
          expanded={expanded}
          reducedMotion={reducedMotion}
          getBeats={getBeats}
          getFormula={getFormula}
          replayTrigger={replayTrigger}
        >
          {children}
        </BeatStageFrame>
      )}
    </Explainer>
  );
}
