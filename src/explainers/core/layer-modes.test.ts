import { describe, expect, it } from 'vitest';
import { layerModeFlow, modeCost, type LayerMode } from './layer-modes';

const modes: LayerMode[] = ['full', 'reindex', 'reuse', 'reuse', 'full', 'reindex', 'reuse', 'reuse'];
const last = (ms: LayerMode[]) => {
  const tl = layerModeFlow({ modes: ms });
  return tl[tl.length - 1].state;
};

describe('三种 mode 的复用来源', () => {
  const st = last(modes);

  it('Full 层自己生成 main KV 与 Top-K', () => {
    expect(st.kvFrom[0]).toBe(0);
    expect(st.topkFrom[0]).toBe(0);
    expect(st.kvFrom[4]).toBe(4);
  });

  it('Reindex 复用最近 Full 层的 KV，但自己产生 Top-K', () => {
    expect(st.kvFrom[1]).toBe(0); // KV 来自第 0 层
    expect(st.topkFrom[1]).toBe(1); // Top-K 是自己打的
    expect(st.kvFrom[5]).toBe(4);
    expect(st.topkFrom[5]).toBe(5);
  });

  it('Reuse 同时复用 KV 与 Top-K', () => {
    expect(st.kvFrom[2]).toBe(0);
    expect(st.topkFrom[2]).toBe(1); // 复用最近一次产生 Top-K 的层（Reindex 层）
    expect(st.topkFrom[3]).toBe(1);
  });

  it('Reuse 跟随最近一次 Full 或 Reindex 的 Top-K', () => {
    const st2 = last(['full', 'reuse', 'reindex', 'reuse']);
    expect(st2.topkFrom[1]).toBe(0); // 前面只有 Full
    expect(st2.topkFrom[3]).toBe(2); // 现在跟随 Reindex 层
  });
});

describe('开销统计', () => {
  it('只有 Full 层生成 main KV', () => {
    expect(last(modes).nKv).toBe(2);
  });

  it('Full 与 Reindex 都要跑 indexer，Reuse 不跑', () => {
    expect(last(modes).nIndexer).toBe(4);
  });

  it('缓存共享与索引复用可以分开调', () => {
    // 同样 2 份 KV，但 indexer 次数不同
    const a = modeCost(['full', 'reindex', 'reindex', 'reindex', 'full', 'reindex', 'reindex', 'reindex']);
    const b = modeCost(['full', 'reuse', 'reuse', 'reuse', 'full', 'reuse', 'reuse', 'reuse']);
    expect(a.nKv).toBe(b.nKv);
    expect(a.nIndexer).toBeGreaterThan(b.nIndexer);
  });

  it('全 Full 时没有任何节省', () => {
    const c = modeCost(Array(8).fill('full') as LayerMode[]);
    expect(c.kvRatio).toBe(1);
    expect(c.indexerRatio).toBe(1);
  });

  it('默认配置把缓存降到 25%、indexer 降到 50%', () => {
    const c = modeCost(modes);
    expect(c.kvRatio).toBe(0.25);
    expect(c.indexerRatio).toBe(0.5);
  });
});

describe('时间线', () => {
  it('每一步都有说明文字', () => {
    for (const s of layerModeFlow({ modes })) expect(s.caption.length).toBeGreaterThan(0);
  });

  it('步数 = 层数 + intro + done', () => {
    expect(layerModeFlow({ modes })).toHaveLength(modes.length + 2);
  });

  it('开头强调三种 mode 都要算本层的 Q 与 SWA KV', () => {
    expect(layerModeFlow({ modes })[0].caption).toContain('SWA KV');
  });

  it('第一层必须是 Full', () => {
    expect(() => layerModeFlow({ modes: ['reuse', 'full'] })).toThrow(/第一层/);
  });

  it('空层数报错', () => {
    expect(() => layerModeFlow({ modes: [] })).toThrow(/至少/);
  });
});
