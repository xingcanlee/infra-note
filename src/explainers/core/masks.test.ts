import { describe, expect, it } from 'vitest';
import {
  blockSelect,
  causal,
  maskCatalog,
  maskDensity,
  maskMatrix,
  receptiveField,
  rowCounts,
  slidingWindow,
  strided,
  topKByScore,
  union,
  windowWithSink,
} from './masks';

const rows = (l: number, fn: (t: number, s: number, l: number) => boolean) =>
  maskMatrix(l, fn).map((r) => r.map((b) => (b ? 1 : 0)).join(''));

describe('causal', () => {
  it('只允许读自己和左边', () => {
    expect(rows(4, causal)).toEqual(['1000', '1100', '1110', '1111']);
  });
  it('密度为 1（它就是基线）', () => {
    expect(maskDensity(8, causal)).toBe(1);
  });
});

describe('slidingWindow', () => {
  it('w=2 时每行最多两个可读位置', () => {
    expect(rows(4, slidingWindow(2))).toEqual(['1000', '1100', '0110', '0011']);
  });
  it('每步代价被窗口封顶，不随 L 增长', () => {
    expect(rowCounts(16, slidingWindow(3))).toEqual([1, 2, 3, ...Array(13).fill(3)]);
  });
  it('w=1 时只读自己', () => {
    expect(rows(3, slidingWindow(1))).toEqual(['100', '010', '001']);
  });
});

describe('windowWithSink', () => {
  it('窗口之外保留开头的锚点', () => {
    expect(rows(5, windowWithSink(2, 1))).toEqual(['10000', '11000', '11100', '10110', '10011']);
  });
});

describe('blockSelect', () => {
  it('按块对齐，只保留最近 keep 个块', () => {
    expect(rows(6, blockSelect(2, 1))).toEqual(['100000', '110000', '001000', '001100', '000010', '000011']);
  });
  it('keep 足够大时退化成因果', () => {
    expect(rows(6, blockSelect(2, 99))).toEqual(rows(6, causal));
  });
});

describe('strided', () => {
  it('均匀抽样并总是读当前位置', () => {
    expect(rows(5, strided(2))).toEqual(['10000', '11000', '10100', '10110', '10101']);
  });
});

describe('topKByScore', () => {
  const score = (_t: number, s: number) => s; // 越靠右分数越高
  it('每行只保留 k 个历史位置，外加当前位置', () => {
    expect(rows(4, topKByScore(score, 1))).toEqual(['1000', '1100', '0110', '0011']);
  });
  it('打分相同时取较小的 s，保证可复现', () => {
    const flat = topKByScore(() => 1, 1);
    expect(rows(4, flat)).toEqual(['1000', '1100', '1010', '1001']);
  });
  it('k 大于可选数量时不报错', () => {
    expect(rows(3, topKByScore(score, 10))).toEqual(rows(3, causal));
  });
});

describe('union', () => {
  it('并集同时包含两个分支的位置', () => {
    const u = union(slidingWindow(1), strided(3));
    expect(rows(5, u)).toEqual(['10000', '11000', '10100', '10010', '10011']);
  });
});

describe('receptiveField', () => {
  it('单层窗口只能看到窗口内', () => {
    expect(receptiveField(16, slidingWindow(3), 15, 1)).toBe(13);
  });
  it('多层叠加后窗口的可见范围按层扩展', () => {
    expect(receptiveField(16, slidingWindow(3), 15, 2)).toBe(11);
    expect(receptiveField(16, slidingWindow(3), 15, 4)).toBe(7);
  });
  it('层数足够多时能看到序列开头', () => {
    expect(receptiveField(16, slidingWindow(3), 15, 8)).toBe(0);
  });
  it('因果注意力单层就能看到开头', () => {
    expect(receptiveField(16, causal, 15, 1)).toBe(0);
  });
});

describe('maskDensity', () => {
  it('稀疏机制的密度小于 1', () => {
    expect(maskDensity(16, slidingWindow(4))).toBeLessThan(1);
  });
  it('窗口越小密度越低', () => {
    expect(maskDensity(16, slidingWindow(2))).toBeLessThan(maskDensity(16, slidingWindow(8)));
  });
});

describe('maskCatalog', () => {
  const cat = maskCatalog(8);
  it('目录中的 id 唯一', () => {
    expect(new Set(cat.map((m) => m.id)).size).toBe(cat.length);
  });
  it('每种机制都不读未来，且总是读当前位置', () => {
    for (const m of cat) {
      for (let t = 0; t < 8; t++) {
        expect(m.fn(t, t, 8)).toBe(true);
        for (let s = t + 1; s < 8; s++) expect(m.fn(t, s, 8)).toBe(false);
      }
    }
  });
});
