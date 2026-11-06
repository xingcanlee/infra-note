import { describe, expect, it } from 'vitest';
import { iconSvg, hasIcon } from './icons';

describe('iconSvg', () => {
  it('inlines lucide svg with currentColor and aria-hidden', () => {
    const s = iconSvg('sun');
    expect(s).toMatch(/^<svg/);
    expect(s).toContain('currentColor');
    expect(s).toContain('aria-hidden="true"');
    expect(s).toContain('width="1em"');
  });
  it('labels icon when label given', () => {
    expect(iconSvg('rss', { label: 'RSS' })).toContain('aria-label="RSS"');
  });
  it('throws on unknown icon', () => {
    expect(() => iconSvg('no-such-icon-xyz')).toThrow(/未知/);
    expect(hasIcon('moon')).toBe(true);
  });
});
