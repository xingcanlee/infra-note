import type { KeyboardEvent, ReactNode } from 'react';
import type { Step } from '../core/timeline';
import { SPEEDS, usePlayer } from './usePlayer';

export interface PlayerProps<S> {
  steps: Step<S>[];
  /** 容器的无障碍名称 */
  label: string;
  /** 渲染当前步骤；没有内部状态 */
  children: (step: Step<S>, index: number) => ReactNode;
}

const isButton = (t: EventTarget) => t instanceof HTMLElement && t.tagName === 'BUTTON';
const isRange = (t: EventTarget) => t instanceof HTMLInputElement && t.type === 'range';

export default function Player<S>({ steps, label, children }: PlayerProps<S>) {
  const p = usePlayer(steps.length);
  const step = steps[p.index];
  const atFirst = p.index <= 0;
  const atLast = p.index >= steps.length - 1;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case ' ':
        if (isButton(e.target) || isRange(e.target)) return; // 交给按钮自身
        p.toggle();
        break;
      case 'ArrowRight':
        if (isRange(e.target)) return;
        p.next();
        break;
      case 'ArrowLeft':
        if (isRange(e.target)) return;
        p.prev();
        break;
      case 'Home':
        if (isRange(e.target)) return;
        p.first();
        break;
      case 'End':
        if (isRange(e.target)) return;
        p.last();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div className="wisp-player" role="group" aria-label={label} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="wisp-player__stage">{children(step, p.index)}</div>

      <div className="wisp-player__caption" aria-live="polite" aria-atomic="true">
        {step.caption}
      </div>

      <div className="wisp-player__controls">
        <div className="wisp-player__buttons">
          <button type="button" aria-label="第一步" title="第一步 (Home)" onClick={p.first} disabled={atFirst}>⏮</button>
          <button type="button" aria-label="上一步" title="上一步 (←)" onClick={p.prev} disabled={atFirst}>◀</button>
          <button
            type="button"
            className="wisp-player__play"
            aria-label={p.reducedMotion ? '自动播放已关闭（系统设置为减少动态效果）' : p.playing ? '暂停' : '播放'}
            title={p.playing ? '暂停 (空格)' : '播放 (空格)'}
            onClick={p.toggle}
            disabled={p.reducedMotion}
          >
            {p.playing ? '⏸' : '▶'}
          </button>
          <button type="button" aria-label="下一步" title="下一步 (→)" onClick={p.next} disabled={atLast}>▶</button>
          <button type="button" aria-label="最后一步" title="最后一步 (End)" onClick={p.last} disabled={atLast}>⏭</button>
        </div>

        <input
          className="wisp-player__range"
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={p.index}
          aria-label="进度"
          aria-valuetext={`第 ${p.index + 1} 步，共 ${steps.length} 步`}
          onChange={(e) => p.seek(Number(e.target.value))}
        />
        <span className="wisp-player__count" aria-hidden="true">
          {p.index + 1} / {steps.length}
        </span>

        <div className="wisp-player__speed" role="group" aria-label="播放速度">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={p.speed === s}
              aria-label={`${s} 倍速`}
              onClick={() => p.setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
