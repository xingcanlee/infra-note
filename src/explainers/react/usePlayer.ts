import { useCallback, useEffect, useState } from 'react';
import { clampIndex } from '../core/timeline';

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

/** 1× 时每步停留的毫秒数。 */
export const BASE_INTERVAL_MS = 1000;
export const stepDelay = (speed: number): number => BASE_INTERVAL_MS / speed;

export interface PlayerApi {
  index: number;
  playing: boolean;
  speed: Speed;
  reducedMotion: boolean;
  next: () => void;
  prev: () => void;
  first: () => void;
  last: () => void;
  seek: (i: number) => void;
  toggle: () => void;
  setSpeed: (s: Speed) => void;
}

/**
 * 播放状态机。首帧（SSR / 首次渲染）固定为 index=0、playing=false、reducedMotion=false，
 * matchMedia 只在 effect 中读取，避免服务端访问 window。
 */
export function usePlayer(length: number): PlayerApi {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReducedMotion(mq.matches);
      if (mq.matches) setPlaying(false);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const lastIndex = Math.max(length - 1, 0);

  useEffect(() => {
    if (!playing) return;
    if (index >= lastIndex) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => clampIndex(i + 1, length)), stepDelay(speed));
    return () => clearTimeout(t);
  }, [playing, index, speed, length, lastIndex]);

  const seek = useCallback(
    (i: number) => {
      setIndex(clampIndex(i, length));
    },
    [length],
  );
  const pause = () => setPlaying(false);

  return {
    index,
    playing,
    speed,
    reducedMotion,
    next: () => { pause(); setIndex((i) => clampIndex(i + 1, length)); },
    prev: () => { pause(); setIndex((i) => clampIndex(i - 1, length)); },
    first: () => { pause(); setIndex(0); },
    last: () => { pause(); setIndex(lastIndex); },
    seek: (i) => { pause(); seek(i); },
    toggle: () => {
      if (reducedMotion) return;
      if (playing) return setPlaying(false);
      if (index >= lastIndex) setIndex(0);
      setPlaying(true);
    },
    setSpeed,
  };
}
