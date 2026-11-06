import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { palette, hueNames, loadPaletteRaw, type Mode } from './lib/palette';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEADER = '/* 自动生成，勿手改。来源：design/palette.json，运行 `pnpm tokens` 重新生成。 */\n';

const q = (f: string) => (/[\s]/.test(f) ? `"${f}"` : f);
const stack = (fs: string[]) => fs.map(q).join(', ');

function modeVars(mode: Mode): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(palette.color.base)) lines.push(`  --wisp-${k}: ${v[mode]};`);
  for (const [k, v] of Object.entries(palette.color.hue)) {
    lines.push(`  --wisp-hue-${k}: ${v.stroke[mode]};`);
    lines.push(`  --wisp-hue-${k}-fill: ${v.fill[mode]};`);
  }
  return lines.join('\n');
}

export function genTokens(): string {
  const { font, color } = palette;
  const sem = Object.entries(color.semantic)
    .map(([k, h]) => `  --wisp-sem-${k}: var(--wisp-hue-${h});\n  --wisp-sem-${k}-fill: var(--wisp-hue-${h}-fill);`)
    .join('\n');
  return `${HEADER}
:root,
[data-theme="light"] {
  color-scheme: light;
${modeVars('light')}
}

[data-theme="dark"] {
  color-scheme: dark;
${modeVars('dark')}
}

/* 语义色只写一次，自动随 hue 切换 */
:root {
${sem}
  --wisp-font-sans: ${stack(font.sans)};
  --wisp-font-mono: ${stack(font.mono)};
  --wisp-font-hand: ${stack(font.hand)};
}
`;
}

export function genPele(): string {
  const radius = (palette as any).radius?.md ?? 8;
  const series = hueNames.map((h, i) => `  --pele-series-${i + 1}: var(--wisp-hue-${h});`).join('\n');
  return `${HEADER}
.pele {
  --pele-bg: transparent;
  --pele-fg: var(--wisp-fg);
  --pele-muted: var(--wisp-muted);
  --pele-line: var(--wisp-muted);
  --pele-surface: var(--wisp-surface);
  --pele-surface-alt: var(--wisp-surface-2);
  --pele-border: var(--wisp-border);
  --pele-accent: var(--wisp-accent);
  --pele-font: var(--wisp-font-sans);
  --pele-radius: ${radius}px;
${series}
}
`;
}

export const DIAGRAM_MARK = '/* ==== 以上为自动生成部分 ==== */';

export function genDiagram(): string {
  const hues = hueNames
    .map((h) => `  --wd-${h}: var(--wisp-hue-${h});\n  --wd-${h}-fill: var(--wisp-hue-${h}-fill);`)
    .join('\n');
  return `${HEADER}
[data-theme] .wisp-d {
  --wd-bg: var(--wisp-bg);
  --wd-fg: var(--wisp-fg);
  --wd-muted: var(--wisp-muted);
  --wd-border: var(--wisp-border);
  --wd-surface: var(--wisp-surface);
${hues}
  --wd-font-sans: var(--wisp-font-sans);
  --wd-font-hand: var(--wisp-font-hand);
}

${DIAGRAM_MARK}

/* ==== T11：figure 等手写样式从此处追加（不属于生成部分） ==== */
`;
}

export function genAll(): Record<string, string> {
  return {
    'src/wisp/styles/tokens.css': genTokens(),
    'src/wisp/styles/pele.css': genPele(),
    'src/wisp/styles/diagram.css': genDiagram(),
    'skills/wisp-diagram/palette.json': loadPaletteRaw(),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [rel, content] of Object.entries(genAll())) {
    const p = resolve(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    console.log(`wrote ${rel}`);
  }
}
