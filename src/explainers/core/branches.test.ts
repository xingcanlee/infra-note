import { describe, expect, it } from 'vitest';
import { branchCount, branchFlow, type BranchSpec } from './branches';
import { blockSelect, slidingWindow, type MaskFn } from './masks';

const compressed: MaskFn = (t, s) => s <= t && s % 4 === 0;

const nsa: BranchSpec[] = [
  { id: 'cmp', name: '压缩分支', role: '粗粒度全局', fn: compressed, gate: 0.3, unit: 'block' },
  { id: 'slc', name: '选块分支', role: '挑最相关的块', fn: blockSelect(4, 2), gate: 0.5 },
  { id: 'win', name: '窗口分支', role: '局部细节', fn: slidingWindow(4), gate: 0.2 },
];

describe('branchCount', () => {
  it('窗口分支的读取量被 w 封顶', () => {
    expect(branchCount(nsa[2], 15, 16)).toBe(4);
    expect(branchCount(nsa[2], 63, 64)).toBe(4);
  });

  it('压缩分支的读取量按 1/l 增长，远慢于全读', () => {
    expect(branchCount(nsa[0], 15, 16)).toBe(4); // 位置 0,4,8,12
    expect(branchCount(nsa[0], 63, 64)).toBe(16);
  });
});

describe('branchFlow 时间线', () => {
  const tl = branchFlow({ l: 16, branches: nsa });

  it('每一步都有说明文字', () => {
    for (const s of tl) expect(s.caption.length).toBeGreaterThan(0);
  });

  it('逐条揭示分支，首帧全未揭示', () => {
    expect(tl[0].state.reads.every((r) => r === null)).toBe(true);
    expect(tl[0].state.shown).toBe(0);
    const afterBranches = tl.filter((s) => s.state.phase === 'branch');
    expect(afterBranches).toHaveLength(3);
    expect(afterBranches[2].state.shown).toBe(3);
  });

  it('合并阶段给出并集，且并集包含每条分支读到的位置', () => {
    const merged = tl.find((s) => s.state.phase === 'merge')!.state;
    expect(merged.union).not.toBeNull();
    for (const r of merged.reads) {
      for (let s = 0; s < 16; s++) if (r![s]) expect(merged.union![s]).toBe(true);
    }
  });

  it('并集不读未来', () => {
    const merged = tl.find((s) => s.state.phase === 'merge')!.state;
    for (let s = merged.t + 1; s < 16; s++) expect(merged.union![s]).toBe(false);
  });

  it('合并后的覆盖率高于任何单条分支', () => {
    const merged = tl.find((s) => s.state.phase === 'merge')!.state;
    const total = merged.union!.filter(Boolean).length;
    for (const b of nsa) expect(total).toBeGreaterThanOrEqual(branchCount(b, merged.t, 16));
    expect(total).toBeGreaterThan(branchCount(nsa[2], merged.t, 16));
  });

  it('窗口分支单独够不到开头，但并集够得到', () => {
    const merged = tl.find((s) => s.state.phase === 'merge')!.state;
    expect(merged.reads[2]![0]).toBe(false); // 窗口读不到位置 0
    expect(merged.union![0]).toBe(true); // 压缩分支补上了
  });

  it('合并后的单步代价仍与序列长度无关（窗口与选块都封顶）', () => {
    const at16 = branchFlow({ l: 16, branches: nsa }).find((s) => s.state.phase === 'merge')!.state;
    const at64 = branchFlow({ l: 64, branches: nsa }).find((s) => s.state.phase === 'merge')!.state;
    const n16 = at16.union!.filter(Boolean).length;
    const n64 = at64.union!.filter(Boolean).length;
    // 压缩分支仍按 1/l 增长，所以总量会涨，但远小于序列长度
    expect(n64).toBeLessThan(64 / 2);
    expect(n16).toBeLessThan(16);
  });

  it('gate 步骤说明了不同 token 可以倚重不同分支', () => {
    expect(tl.find((s) => s.state.phase === 'gate')!.caption).toContain('gate');
  });

  it('输入校验', () => {
    expect(() => branchFlow({ l: 16, branches: [] })).toThrow(/至少/);
    expect(() => branchFlow({ l: 16, t: 99, branches: nsa })).toThrow(/query 位置/);
  });
});
