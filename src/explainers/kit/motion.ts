import { useSyncExternalStore } from 'react';
import type { HueTone, Tone } from 'astro-wisp/explainers';

export const STAGE_W = 680;
export const RADIUS = 4;
export const RADIUS_SM = 3;
export const MAX_HUES = 3;

export const MANIM_EASE = [0.42, 0, 0.2, 1] as const;
export const MORPH_SPRING = { type: 'spring' as const, visualDuration: 0.48, bounce: 0.08 };

export interface BeatSpec {
  at: number;
  label: string;
}

/** 按均匀间隔生成页内因果节拍时间轴。 */
export function defaultBeats(labels: readonly string[], intervalMs = 650): BeatSpec[] {
  return labels.map((label, i) => ({ at: i * intervalMs, label }));
}

const CJK_RE = /[\u4e00-\u9fff]/;

/** 判断文本是否包含汉字，以便在等宽场景中切换为支持中文的 sans 字体栈。 */
export function hasCjk(text: string): boolean {
  return CJK_RE.test(text);
}

/** 根据内容是否含中文返回字体家族种类及 CSS font-family 令牌。 */
export function fontKindFor(text: string, preferred: 'mono' | 'sans' = 'mono'): 'mono' | 'sans' {
  return preferred === 'sans' || CJK_RE.test(text) ? 'sans' : 'mono';
}

export function fontVarFor(text: string, preferred: 'mono' | 'sans' = 'mono'): string {
  return fontKindFor(text, preferred) === 'sans'
    ? 'var(--wisp-font-sans)'
    : 'var(--wisp-font-mono)';
}

export const NEUTRAL_TONES = new Set<string>(['slate', 'mask', 'visited', 'neutral']);

const SEMANTIC_TO_HUE: Record<string, HueTone> = {
  q: 'blue',
  active: 'blue',
  k: 'amber',
  highlight: 'amber',
  v: 'green',
  done: 'green',
  weight: 'violet',
  activation: 'teal',
  grad: 'rose',
  error: 'rose',
  bias: 'orange',
  mask: 'slate',
  visited: 'slate',
  blue: 'blue',
  amber: 'amber',
  green: 'green',
  rose: 'rose',
  violet: 'violet',
  teal: 'teal',
  orange: 'orange',
  slate: 'slate',
};

/** 将任意 Tone 映射为基础分类色（用于统计非 slate 色相数量）。 */
export function toneToHue(tone: Tone | 'neutral'): HueTone | null {
  if (tone === 'neutral') return null;
  return SEMANTIC_TO_HUE[tone] ?? null;
}

/** 统计一组色调中非中性（non-slate）的色相集合，Wisp 规范要求每图 <= 3 种。 */
export function nonSlateHues(tones: readonly (Tone | 'neutral' | undefined)[]): HueTone[] {
  const seen = new Set<HueTone>();
  for (const t of tones) {
    if (!t || NEUTRAL_TONES.has(t)) continue;
    const h = toneToHue(t);
    if (h && h !== 'slate') seen.add(h);
  }
  return [...seen];
}

export function assertMaxHues(tones: readonly (Tone | 'neutral' | undefined)[], limit = MAX_HUES) {
  const hues = nonSlateHues(tones);
  if (hues.length > limit) {
    throw new Error(
      `[explainer-kit] Too many non-slate hues (${hues.length} > ${limit}): ${hues.join(', ')}`,
    );
  }
}

/** 估算中英文混排 SVG 文本像素宽度（偏保守上界以防止溢框/裁切）。 */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  family: 'mono' | 'sans' = 'sans',
): number {
  const asciiFactor = family === 'mono' ? 0.62 : 0.58;
  let units = 0;
  for (const ch of text) {
    units += ch.charCodeAt(0) > 127 ? 1.05 : asciiFactor;
  }
  return units * fontSize;
}

/** 在 maxW 约束内计算自适应字号 [max(minSize, 10), maxSize]；仅当轻微压缩（≥0.88）时启用 textLength。 */
export function fitTextMetrics(
  text: string,
  maxW: number,
  maxSize: number,
  minSize: number,
  family: 'mono' | 'sans' = 'sans',
): { fontSize: number; textLength?: number } {
  const safeMaxW = Math.max(8, maxW);
  const effectiveMin = Math.max(minSize, 10);
  const effectiveMax = Math.max(maxSize, effectiveMin);
  const fullW = estimateTextWidth(text, effectiveMax, family);
  if (fullW <= safeMaxW) return { fontSize: effectiveMax };
  const scaled = Math.max(effectiveMin, (safeMaxW / Math.max(fullW, 1)) * effectiveMax);
  const rounded = Math.round(scaled * 10) / 10;
  if (estimateTextWidth(text, rounded, family) <= safeMaxW) {
    return { fontSize: rounded };
  }
  const minEstW = estimateTextWidth(text, effectiveMin, family);
  if (safeMaxW / Math.max(minEstW, 1) >= 0.88) {
    return { fontSize: effectiveMin, textLength: Math.floor(safeMaxW) };
  }
  return { fontSize: effectiveMin };
}

export type AnyTone = Tone | 'neutral';

export function resolveToneStroke(tone: AnyTone): string {
  if (tone === 'neutral') return 'var(--wisp-muted)';
  return tone === 'q' ||
    tone === 'k' ||
    tone === 'v' ||
    tone === 'weight' ||
    tone === 'activation' ||
    tone === 'grad' ||
    tone === 'bias' ||
    tone === 'mask' ||
    tone === 'highlight' ||
    tone === 'visited' ||
    tone === 'active' ||
    tone === 'done' ||
    tone === 'error'
    ? `var(--wisp-sem-${tone})`
    : `var(--wisp-hue-${tone})`;
}

export function resolveToneFill(tone: AnyTone): string {
  if (tone === 'neutral') return 'var(--wisp-surface)';
  return tone === 'q' ||
    tone === 'k' ||
    tone === 'v' ||
    tone === 'weight' ||
    tone === 'activation' ||
    tone === 'grad' ||
    tone === 'bias' ||
    tone === 'mask' ||
    tone === 'highlight' ||
    tone === 'visited' ||
    tone === 'active' ||
    tone === 'done' ||
    tone === 'error'
    ? `var(--wisp-sem-${tone}-fill)`
    : `var(--wisp-hue-${tone}-fill)`;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const reducedMotionListeners = new Set<() => void>();
let reducedMotionMql: MediaQueryList | null = null;
let reducedMotionListening = false;

function getReducedMotionMql(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!reducedMotionMql) {
    reducedMotionMql = window.matchMedia(REDUCED_MOTION_QUERY);
  }
  return reducedMotionMql;
}

function handleReducedMotionChange() {
  for (const listener of reducedMotionListeners) listener();
}

function subscribeReducedMotion(listener: () => void): () => void {
  reducedMotionListeners.add(listener);
  const mq = getReducedMotionMql();
  if (mq && !reducedMotionListening) {
    mq.addEventListener('change', handleReducedMotionChange);
    reducedMotionListening = true;
  }
  return () => {
    reducedMotionListeners.delete(listener);
    if (reducedMotionListeners.size === 0 && mq && reducedMotionListening) {
      mq.removeEventListener('change', handleReducedMotionChange);
      reducedMotionListening = false;
    }
  };
}

function getReducedMotionSnapshot(): boolean {
  return getReducedMotionMql()?.matches ?? false;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

/** 统一动效参数：基于模块级单一 matchMedia 订阅同步 prefers-reduced-motion 并控制流式脉冲启停。 */
export function useDiagramMotion() {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const canAnimateFlow = !reduced;

  return {
    reduced,
    canAnimateFlow,
    stepTransition: {
      duration: reduced ? 0 : 0.22,
      ease: [0.22, 1, 0.36, 1] as const,
    },
    highlightTransition: {
      duration: reduced ? 0 : 0.16,
      ease: 'easeOut' as const,
    },
    packetTransition: {
      duration: reduced ? 0 : 1.5,
      repeat: reduced ? 0 : 1,
      ease: 'linear' as const,
    },
  };
}
