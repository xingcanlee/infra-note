import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { genAll, genTokens, genPele, genDiagram } from '../gen-tokens';
import { checkContrast } from '../check-contrast';
import { palette, resolveColor, nearestToken } from '../lib/palette';

describe('palette', () => {
  it('跳过 $ 注释键', () => {
    expect(JSON.stringify(palette)).not.toContain('"$comment"');
    expect(Object.keys(palette.color.hue)).toHaveLength(8);
  });
  it('resolveColor', () => {
    expect(resolveColor('fg', 'light')).toBe('#1d1d1f');
    expect(resolveColor('fg', 'dark')).toBe('#e6e6e3');
    expect(resolveColor('blue', 'light')).toBe('#1d4ed8');
    expect(resolveColor('blue-fill', 'dark')).toBe('#1b2740');
    expect(resolveColor('q', 'light')).toBe('#1d4ed8');
    expect(resolveColor('k', 'dark')).toBe('#fbbf24');
    expect(() => resolveColor('nope')).toThrow();
  });
  it('nearestToken', () => {
    expect(nearestToken('#1d4ed8')).toMatchObject({ name: 'blue', deltaE: 0 });
    expect(nearestToken('#1e4fd9').name).toBe('blue');
    expect(nearestToken('#dbeafe').name).toBe('blue-fill');
  });
});

describe('生成', () => {
  it('确定性', () => {
    expect(genAll()).toEqual(genAll());
  });
  it('tokens.css 结构', () => {
    const css = genTokens();
    expect(css).toContain('自动生成，勿手改');
    expect(css).toContain('--wisp-bg: #fcfcfb;');
    expect(css).toContain('--wisp-bg: #111214;');
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('--wisp-sem-q: var(--wisp-hue-blue);');
    expect(css).toContain('--wisp-sem-q-fill: var(--wisp-hue-blue-fill);');
    expect(css).toContain('"Noto Sans SC Variable"');
    expect(css).not.toContain('$comment');
  });
  it('pele.css', () => {
    const css = genPele();
    expect(css).toContain('--pele-series-1: var(--wisp-hue-blue);');
    expect(css).toContain('--pele-series-8: var(--wisp-hue-slate);');
  });
  it('diagram.css', () => {
    const css = genDiagram();
    expect(css).toContain('[data-theme] .wisp-d');
    expect(css).toContain('--wd-blue-fill: var(--wisp-hue-blue-fill);');
    expect(css).toContain('--wd-font-hand: var(--wisp-font-hand);');
  });
  it('skills 副本与源一致', () => {
    expect(readFileSync('skills/wisp-diagram/palette.json', 'utf8')).toBe(readFileSync('design/palette.json', 'utf8'));
  });
});

describe('对比度', () => {
  it('全部 ≥ 4.5', () => {
    const rows = checkContrast();
    expect(rows.length).toBe(2 * (3 + 16));
    expect(rows.filter((r) => !r.pass)).toEqual([]);
  });
});
