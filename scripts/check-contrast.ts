import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { wcagContrast } from 'culori';
import { palette, hueNames, type Mode } from './lib/palette';

export interface Row { mode: Mode; pair: string; ratio: number; pass: boolean }
const MIN = 4.5;

export function checkContrast(): Row[] {
  const rows: Row[] = [];
  for (const mode of ['light', 'dark'] as Mode[]) {
    const b = palette.color.base;
    const bg = b.bg[mode];
    const add = (pair: string, a: string, c: string) => {
      const ratio = wcagContrast(a, c);
      rows.push({ mode, pair, ratio, pass: ratio >= MIN });
    };
    for (const k of ['fg', 'muted', 'accent']) add(`${k} / bg`, b[k][mode], bg);
    for (const h of hueNames) {
      const { stroke, fill } = palette.color.hue[h];
      add(`${h} stroke / bg`, stroke[mode], bg);
      add(`${h} stroke / ${h} fill`, stroke[mode], fill[mode]);
    }
  }
  return rows;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = checkContrast();
  const bad = rows.filter((r) => !r.pass);
  console.log(`对比度检查：${rows.length} 项，阈值 ${MIN}:1`);
  if (bad.length) {
    console.error('未达标：');
    for (const r of bad) console.error(`  [${r.mode}] ${r.pair}: ${r.ratio.toFixed(2)}`);
    process.exit(1);
  }
  console.log(`全部通过（最低 ${Math.min(...rows.map((r) => r.ratio)).toFixed(2)}:1）`);
}
