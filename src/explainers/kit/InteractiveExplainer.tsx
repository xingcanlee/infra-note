import {
  ExplainerIcon,
  RichText,
  labelsFor,
  loadKatex,
  plainInlineMath,
  splitFigureLabel,
} from 'astro-wisp/explainers';
import { MotionConfig } from 'motion/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useDiagramMotion } from './motion';
import './kit.css';

export interface InteractiveExplainerCtx {
  expanded: boolean;
  reducedMotion: boolean;
}

export interface InteractiveExplainerProps {
  title?: string;
  label?: string;
  wide?: boolean;
  stageMinHeight?: number | string;
  formula?: string;
  controls?: ReactNode;
  caption: string;
  onReset?: () => void;
  lang?: string;
  children: ReactNode | ((ctx: InteractiveExplainerCtx) => ReactNode);
}

function LabTitleText({ title }: { title: string }) {
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
 * 直接操纵微实验外壳：
 * - 无步骤 Tab 栏、无自动播放与假进度条
 * - 紧凑单行控件条（滑块 / 模式切换）+ 实时公式 + 实时图形舞台 + 动态结论
 */
export default function InteractiveExplainer({
  title,
  label,
  wide = false,
  stageMinHeight,
  formula,
  controls,
  caption,
  onReset,
  lang,
  children,
}: InteractiveExplainerProps) {
  const t = labelsFor(lang);
  const { reduced } = useDiagramMotion();
  const accessibleLabel = label ?? (title ? plainInlineMath(title) : 'Interactive diagram');

  const figureRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const expandBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const wasExpandedRef = useRef(false);

  const [expanded, setExpanded] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);

  useEffect(() => {
    void loadKatex();
  }, []);

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

  const openExpand = useCallback(() => {
    const h = figureRef.current?.getBoundingClientRect().height ?? 0;
    if (h > 0) setPlaceholderHeight(h);
    setExpanded(true);
  }, []);

  const closeExpand = useCallback(() => {
    const dlg = dialogRef.current;
    if (dlg && typeof dlg.close === 'function' && dlg.open) {
      dlg.close();
    } else {
      setExpanded(false);
    }
  }, []);

  const handleDialogClose = useCallback(() => {
    setExpanded(false);
  }, []);

  const handleDialogClick = useCallback(
    (e: MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) closeExpand();
    },
    [closeExpand],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (expanded) closeExpand();
        else openExpand();
      }
    },
    [expanded, closeExpand, openExpand],
  );

  const renderInner = (isExpanded: boolean) => {
    const HeaderTag = !isExpanded ? 'figcaption' : 'div';
    const stageStyle =
      !isExpanded && stageMinHeight !== undefined
        ? ({
            '--wisp-explainer-stage-min-h':
              typeof stageMinHeight === 'number' ? `${stageMinHeight}px` : stageMinHeight,
          } as CSSProperties)
        : undefined;
    const body =
      typeof children === 'function'
        ? children({ expanded: isExpanded, reducedMotion: reduced })
        : children;

    return (
      <div className="wisp-explainer__inner" data-expanded={isExpanded ? '' : undefined}>
        <HeaderTag className="wisp-explainer__header">
          <div className="wisp-explainer__title">{title && <LabTitleText title={title} />}</div>
          <div className="wisp-explainer__toolbar">
            {onReset && (
              <button
                type="button"
                className="wisp-explainer__btn"
                aria-label="重置参数"
                title="重置参数"
                onClick={onReset}
              >
                <ExplainerIcon name="replay" />
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
              {(controls || formula) && (
                <div className="wisp-lab__controls">
                  {controls && <div className="wisp-lab__controls-main">{controls}</div>}
                  {formula && (
                    <div className="wisp-lab__eq">
                      <RichText text={formula} />
                    </div>
                  )}
                </div>
              )}
              <div className="wisp-kit-body">{body}</div>
            </div>
          </div>
        </MotionConfig>

        <div className="wisp-explainer__captions">
          <div className="wisp-explainer__caption" aria-live="polite" aria-atomic="true">
            <RichText text={caption} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <figure
      ref={figureRef}
      className={wide ? 'wisp-wide wisp-explainer wisp-lab' : 'wisp-explainer wisp-lab'}
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

export interface LabSegmentedOption<T extends string> {
  id: T;
  label: string;
}

export interface LabSegmentedProps<T extends string> {
  options: readonly LabSegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}

export function LabSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: LabSegmentedProps<T>) {
  return (
    <div className="wisp-lab__seg" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className="wisp-lab__seg-btn"
            aria-pressed={active}
            data-active={active ? 'true' : undefined}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface LabSliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  valueText?: string;
  onChange: (next: number) => void;
}

export function LabSlider({
  label,
  min,
  max,
  step = 1,
  value,
  valueText,
  onChange,
}: LabSliderProps) {
  return (
    <label className="wisp-lab__slider">
      <span className="wisp-lab__slider-lbl">{label}</span>
      <input
        className="wisp-lab__slider-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText ?? String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="wisp-lab__slider-val">{valueText ?? String(value)}</span>
    </label>
  );
}
