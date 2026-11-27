import {
  ExplainerIcon,
  RichText,
  clampIndex,
  labelsFor,
  loadKatex,
  plainInlineMath,
  splitFigureLabel,
  stepAt,
  type Step,
} from 'astro-wisp/explainers';
import { MotionConfig } from 'motion/react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { MANIM_EASE, MORPH_SPRING, defaultBeats, useDiagramMotion, type BeatSpec } from './motion';
import './kit.css';

export { MANIM_EASE, MORPH_SPRING, defaultBeats, type BeatSpec };

/** 自动演示每步推进间隔与循环尾拍停顿（进入视口柔和自动轮播，用户手动操作后尊重其选择）。 */
const PLAY_STEP_MS = 3000;
const PLAY_LOOP_PAUSE_MS = 3800;
const PLAY_FIRST_ADVANCE_MS = 450;

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
  getBeats?: (step: Step<S>, index: number) => readonly BeatSpec[];
  getFormula?: (step: Step<S>, index: number) => string | undefined;
  replayTrigger?: string | number;
  children: (step: Step<S>, ctx: BeatStageRenderCtx) => ReactNode;
}

export function SvgBeatGroup({
  visible = true,
  dimmed = false,
  dimOpacity = 0.24,
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
    <g
      style={{
        opacity: !visible ? hiddenOpacity : dimmed ? dimOpacity : 1,
        transition: 'opacity 360ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {children}
    </g>
  );
}

function BeatTitleText({ title }: { title: string }) {
  const { label, rest } = splitFigureLabel(title);
  if (!label) {
    return (
      <span className="wisp-explainer__title-text">
        <RichText text={title} />
      </span>
    );
  }
  return (
    <span className="wisp-explainer__title-text" data-numbered="">
      <span className="wisp-fig-no">{label}</span>
      <RichText text={rest} />
    </span>
  );
}

/**
 * 轻量单轴步进讲解容器：
 * - 顶栏仅保留标题 + “自动播放/暂停” + “全屏” 2 枚有效按钮（彻底去掉冗余计数、前后与重播按钮）
 * - 单行控制条左侧为阶段切换胶囊，右侧同行显示核心公式，大幅释放舞台空间
 * - 点击播放 0.42s 后即刻推进至下一步，并以 2s 节拍流畅完成全流程演进
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
  const t = labelsFor();
  const { reduced } = useDiagramMotion();
  const n = steps.length;
  const lastIndex = Math.max(n - 1, 0);

  const [rawIndex, setRawIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playBurst, setPlayBurst] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const [dotToken, setDotToken] = useState(0);
  const [userPaused, setUserPaused] = useState(false);

  const index = clampIndex(rawIndex, n);
  const step = stepAt(steps, index);
  const uid = useId();
  const panelId = `${uid}-stage`;
  const accessibleLabel = label ?? (title ? plainInlineMath(title) : 'Explainer');

  const figureRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const expandBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const wasExpandedRef = useRef(false);

  const triggerKey = `${index}:${replayTrigger ?? ''}`;
  const prevTriggerRef = useRef(triggerKey);

  useEffect(() => {
    void loadKatex();
  }, []);

  useEffect(() => {
    if (prevTriggerRef.current === triggerKey) return;
    prevTriggerRef.current = triggerKey;
    if (reduced) return;
    const id = window.setTimeout(() => {
      setDotToken((k) => k + 1);
    }, 0);
    return () => window.clearTimeout(id);
  }, [triggerKey, reduced]);

  useEffect(() => {
    if (!playing || n <= 1) return;
    const isLast = index >= lastIndex;
    const waitMs = isLast ? PLAY_LOOP_PAUSE_MS : playBurst ? PLAY_FIRST_ADVANCE_MS : PLAY_STEP_MS;
    const timer = window.setTimeout(() => {
      const nextIdx = isLast ? 0 : clampIndex(index + 1, n);
      setPlayBurst(false);
      setRawIndex(nextIdx);
    }, waitMs);
    return () => window.clearTimeout(timer);
  }, [playing, playBurst, index, lastIndex, n]);

  useEffect(() => {
    const el = figureRef.current;
    if (!el || n <= 1 || reduced) return;
    const onVis = () => {
      if (document.hidden) {
        setPlaying(false);
        setPlayBurst(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    let io: IntersectionObserver | undefined;
    if (!expanded && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((entry) => entry.isIntersecting);
          if (!visible) {
            setPlaying(false);
            setPlayBurst(false);
          } else if (!userPaused) {
            setPlaying(true);
          }
        },
        { threshold: 0.35 },
      );
      io.observe(el);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      io?.disconnect();
    };
  }, [expanded, n, reduced, userPaused]);

  useEffect(() => {
    if (expanded) {
      wasExpandedRef.current = true;
      const dlg = dialogRef.current;
      if (dlg && typeof dlg.showModal === 'function' && !dlg.open) {
        dlg.showModal();
      }
      closeBtnRef.current?.focus();
      return;
    }
    if (wasExpandedRef.current) {
      wasExpandedRef.current = false;
      expandBtnRef.current?.focus();
    }
  }, [expanded]);

  const goTo = (nextIdx: number) => {
    setUserPaused(true);
    setPlaying(false);
    setPlayBurst(false);
    setRawIndex(clampIndex(nextIdx, n));
  };

  const togglePlay = () => {
    if (n <= 1) return;
    if (playing) {
      setUserPaused(true);
      setPlaying(false);
      setPlayBurst(false);
      return;
    }
    setUserPaused(false);
    if (index >= lastIndex) {
      setRawIndex(0);
      setPlayBurst(false);
    } else {
      setPlayBurst(true);
    }
    setPlaying(true);
  };

  const openExpand = () => {
    const h = figureRef.current?.getBoundingClientRect().height ?? 0;
    if (h > 0) setPlaceholderHeight(h);
    setExpanded(true);
  };

  const closeExpand = () => {
    const dlg = dialogRef.current;
    if (dlg && typeof dlg.close === 'function' && dlg.open) {
      dlg.close();
    } else {
      setExpanded(false);
    }
  };

  const handleDialogClose = () => {
    setExpanded(false);
  };

  const handleDialogClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) closeExpand();
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIdx: number) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % n;
    else if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + n) % n;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = n - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    e.stopPropagation();
    goTo(nextIdx);
    const tabs = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIdx]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case ' ':
        if (target.tagName === 'BUTTON') return;
        togglePlay();
        break;
      case 'ArrowRight':
        goTo(index + 1);
        break;
      case 'ArrowLeft':
        goTo(index - 1);
        break;
      case 'Home':
        if (target.tagName === 'BUTTON') return;
        goTo(0);
        break;
      case 'End':
        if (target.tagName === 'BUTTON') return;
        goTo(lastIndex);
        break;
      case 'f':
      case 'F':
        if (expanded) closeExpand();
        else openExpand();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const finishNow = () => {
    // 单轴演进无待跳过的子拍
  };

  const schedule = getBeats?.(step, index);
  const totalBeats = schedule && schedule.length > 0 ? schedule.length : 1;
  const beat = schedule && schedule.length > 0 ? schedule.length - 1 : 99;
  const beatLabel =
    schedule && schedule.length > 0 ? schedule[schedule.length - 1].label : (step.label ?? '');
  const formula = getFormula?.(step, index);
  const demoLabel = playing ? t.stop : t.demo;

  const renderInner = (isExpanded: boolean) => {
    const HeaderTag = !isExpanded ? 'figcaption' : 'div';
    const stageStyle =
      !isExpanded && stageMinHeight !== undefined
        ? ({
            '--wisp-explainer-stage-min-h':
              typeof stageMinHeight === 'number' ? `${stageMinHeight}px` : stageMinHeight,
          } as CSSProperties)
        : undefined;

    return (
      <div className="wisp-explainer__inner" data-expanded={isExpanded ? '' : undefined}>
        <HeaderTag className="wisp-explainer__header">
          <div className="wisp-explainer__title">{title && <BeatTitleText title={title} />}</div>
          <div className="wisp-explainer__toolbar">
            {n > 1 && (
              <button
                type="button"
                className="wisp-explainer__btn wisp-explainer__demo"
                aria-label={demoLabel}
                aria-pressed={playing}
                data-active={playing ? '' : undefined}
                title={`${demoLabel} (${t.keys.demo})`}
                onClick={togglePlay}
              >
                <ExplainerIcon name={playing ? 'stop' : 'play'} />
              </button>
            )}
            {isExpanded ? (
              <button
                ref={closeBtnRef}
                type="button"
                className="wisp-explainer__btn"
                aria-label={t.close}
                title={`${t.close} (Esc)`}
                onClick={closeExpand}
              >
                <ExplainerIcon name="close" />
              </button>
            ) : (
              <button
                ref={expandBtnRef}
                type="button"
                className="wisp-explainer__btn"
                aria-label={t.expand}
                title={`${t.expand} (${t.keys.expand})`}
                onClick={openExpand}
              >
                <ExplainerIcon name="expand" />
              </button>
            )}
          </div>
        </HeaderTag>

        <MotionConfig reducedMotion="never">
          <div className="wisp-explainer__stage" style={stageStyle}>
            <div className="wisp-kit-shell">
              {(n > 1 || formula) && (
                <div className="wisp-lab__controls">
                  {n > 1 && (
                    <div className="wisp-lab__seg" role="tablist" aria-label={t.tabs}>
                      {steps.map((s, i) => {
                        const active = i === index;
                        const num = String(i + 1).padStart(2, '0');
                        return (
                          <button
                            key={i}
                            id={`${uid}-tab-${i}`}
                            type="button"
                            role="tab"
                            className="wisp-lab__seg-btn wisp-kit-step-pill"
                            aria-selected={active}
                            aria-controls={panelId}
                            data-active={active ? 'true' : undefined}
                            tabIndex={active ? 0 : -1}
                            onClick={() => goTo(i)}
                            onKeyDown={(e) => onTabKeyDown(e, i)}
                          >
                            <span className="wisp-kit-step-num">{num}</span>
                            {s.label && <span>{s.label}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {formula && (
                    <div className="wisp-lab__eq">
                      <RichText text={formula} />
                    </div>
                  )}
                </div>
              )}

              <div
                id={panelId}
                className="wisp-kit-body"
                role={n > 1 ? 'tabpanel' : undefined}
                aria-labelledby={n > 1 ? `${uid}-tab-${index}` : undefined}
              >
                {children(step, {
                  beat,
                  totalBeats,
                  beatLabel,
                  dotToken: reduced ? 0 : dotToken,
                  index,
                  replayKey: 0,
                  expanded: isExpanded,
                  reducedMotion: reduced,
                  finishNow,
                })}
              </div>
            </div>
          </div>
        </MotionConfig>

        <div className="wisp-explainer__captions">
          <div
            className="wisp-explainer__caption"
            aria-live={playing ? 'off' : 'polite'}
            aria-atomic="true"
          >
            <RichText text={step.caption} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <figure
      ref={figureRef}
      className={wide ? 'wisp-wide wisp-explainer' : 'wisp-explainer'}
      role="group"
      aria-label={accessibleLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {expanded ? (
        <>
          <div
            className="wisp-explainer__placeholder"
            style={placeholderHeight > 0 ? { height: placeholderHeight } : undefined}
            aria-hidden="true"
          />
          <dialog
            ref={dialogRef}
            className="wisp-explainer__dialog"
            aria-label={accessibleLabel}
            onClose={handleDialogClose}
            onClick={handleDialogClick}
            onKeyDown={onKeyDown}
          >
            {renderInner(true)}
          </dialog>
        </>
      ) : (
        renderInner(false)
      )}
    </figure>
  );
}
