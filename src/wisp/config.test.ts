import { describe, expect, it } from 'vitest';
import { defineWispConfig } from './config';

describe('defineWispConfig', () => {
  it('空输入得到默认值', () => {
    const c = defineWispConfig();
    expect(c.home.pageSize).toBe(10);
    expect(c.features.math).toBe(true);
    expect(c.taxonomy.slugMap).toEqual({});
  });
  it('深度合并：只覆盖给出的字段', () => {
    const c = defineWispConfig({ home: { pageSize: 5 }, features: { math: false } });
    expect(c.home).toEqual({ featuredCount: 3, pageSize: 5 });
    expect(c.features.math).toBe(false);
    expect(c.features.mermaid).toBe(true);
    expect(c.site.lang).toBe('zh-CN');
  });
  it('非法值抛错并带路径', () => {
    expect(() => defineWispConfig({ home: { pageSize: 0 } })).toThrow(/home\.pageSize/);
  });
  it('codeFold 默认值与部分覆盖', () => {
    expect(defineWispConfig().features.codeFold).toEqual({ enabled: true, maxLines: 24, previewLines: 12 });
    const c = defineWispConfig({ features: { codeFold: { maxLines: 40 } } });
    expect(c.features.codeFold).toEqual({ enabled: true, maxLines: 40, previewLines: 12 });
  });
  it('codeFold 非法值抛错', () => {
    expect(() => defineWispConfig({ features: { codeFold: { previewLines: 0 } } })).toThrow(/codeFold\.previewLines/);
  });
});
