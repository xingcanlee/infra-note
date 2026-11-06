import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { differenceCiede2000, parse, formatHex } from 'culori';

export type Mode = 'light' | 'dark';
export interface Pair<T = string> { light: T; dark: T }

export interface Palette {
  version: number;
  color: {
    base: Record<string, Pair>;
    hue: Record<string, { stroke: Pair; fill: Pair }>;
    semantic: Record<string, string>;
  };
  font: { sans: string[]; mono: string[]; hand: string[] };
  [k: string]: unknown;
}

export const PALETTE_PATH = fileURLToPath(new URL('../../design/palette.json', import.meta.url));

/** 去掉以 `$` 开头的注释键（递归）。 */
function strip(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).filter(([k]) => !k.startsWith('$')).map(([k, x]) => [k, strip(x)]),
    );
  }
  return v;
}

export function loadPaletteRaw(): string {
  return readFileSync(PALETTE_PATH, 'utf8');
}

export const palette = strip(JSON.parse(loadPaletteRaw())) as Palette;

export const hueNames = Object.keys(palette.color.hue);

export interface Token { name: string; hex: string; mode: Mode }

/** 解析为 hex。支持：基础色名（fg）、hue 名（blue = stroke）、`blue-fill`、语义名（q）、已是 hex 的值。 */
export function resolveColor(nameOrSemantic: string, mode: Mode = 'light'): string {
  const { base, hue, semantic } = palette.color;
  let n = nameOrSemantic.trim();
  if (n.startsWith('#')) return n.toLowerCase();
  n = n.replace(/^--wisp-/, '').replace(/^sem-/, '').replace(/^hue-/, '');
  let fill = false;
  if (n.endsWith('-fill') && !(n in base)) { fill = true; n = n.slice(0, -5); }
  if (n in semantic) n = semantic[n];
  if (n in hue) return hue[n][fill ? 'fill' : 'stroke'][mode];
  if (!fill && n in base) return base[n][mode];
  throw new Error(`未知颜色令牌: ${nameOrSemantic}`);
}

/** 全部令牌（基础色 + hue stroke/fill），用于最近邻查找。 */
export function allTokens(mode: Mode = 'light'): Token[] {
  const out: Token[] = [];
  for (const [k, v] of Object.entries(palette.color.base)) out.push({ name: k, hex: v[mode], mode });
  for (const [k, v] of Object.entries(palette.color.hue)) {
    out.push({ name: k, hex: v.stroke[mode], mode });
    out.push({ name: `${k}-fill`, hex: v.fill[mode], mode });
  }
  return out;
}

const de = differenceCiede2000();

/** 返回与 hex 的 ΔE2000 最近的令牌（默认在 light 令牌中查找）。 */
export function nearestToken(hex: string, mode: Mode = 'light'): { name: string; hex: string; deltaE: number } {
  const c = parse(hex);
  if (!c) throw new Error(`无法解析颜色: ${hex}`);
  let best: { name: string; hex: string; deltaE: number } | undefined;
  for (const t of allTokens(mode)) {
    const d = de(c, parse(t.hex)!);
    if (!best || d < best.deltaE) best = { name: t.name, hex: formatHex(t.hex) ?? t.hex, deltaE: d };
  }
  return best!;
}
