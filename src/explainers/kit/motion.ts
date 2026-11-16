import { useEffect, useState } from 'react';
import type { HueTone, Tone } from 'astro-wisp/explainers';

export const STAGE_W = 680;
export const RADIUS = 4;
export const RADIUS_SM = 3;
export const MAX_HUES = 3;

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

/** 在 maxW 约束内计算自适应字号 [minSize, maxSize]；若缩至 minSize 仍超出则返回 textLength 兜底。 */
export function fitTextMetrics(
  text: string,
  maxW: number,
  maxSize: number,
  minSize: number,
  family: 'mono' | 'sans' = 'sans',
): { fontSize: number; textLength?: number } {
  const safeMaxW = Math.max(8, maxW);
  const fullW = estimateTextWidth(text, maxSize, family);
  if (fullW <= safeMaxW) return { fontSize: maxSize };
  const scaled = Math.max(minSize, (safeMaxW / Math.max(fullW, 1)) * maxSize);
  const rounded = Math.round(scaled * 10) / 10;
  if (estimateTextWidth(text, rounded, family) <= safeMaxW) {
    return { fontSize: rounded };
  }
  return { fontSize: minSize, textLength: Math.floor(safeMaxW) };
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

/** 统一动效参数：首帧与 SSR 保持一致，挂载后同步 prefers-reduced-motion 并控制流式脉冲启停。 */
export function useDiagramMotion() {
  const [reduced, setReduced] = useState(false);
  const [canAnimateFlow, setCanAnimateFlow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReduced(mq.matches);
      setCanAnimateFlow(!mq.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

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
      repeat: reduced ? 0 : Infinity,
      ease: 'linear' as const,
    },
  };
}
