import { describe, expect, it } from 'vitest';
import { dispatch, dispatchFlow, eagerDesc, isCompatible, padding, type BatchReq, type GraphDesc } from './dispatch';

const decodeGraph = (tokens: number, reqs: number): GraphDesc => ({
  cgMode: 'FULL',
  numTokens: tokens,
  numReqs: reqs,
  uniformTokenCount: 1,
  maxQueryLen: 1,
});

const piecewise: GraphDesc = {
  cgMode: 'PIECEWISE',
  numTokens: 16,
  numReqs: null,
  uniformTokenCount: null,
  maxQueryLen: null,
};

const graphs = [decodeGraph(2, 2), decodeGraph(4, 4), decodeGraph(8, 8), piecewise];
const decodeReq: BatchReq = { numReqs: 3, numTokens: 3, uniformTokenCount: 1, maxQueryLen: 1 };

describe('isCompatible 的六项检查', () => {
  it('容量够就通过（token 与请求数是 ≥，不是 ==）', () => {
    expect(isCompatible(decodeGraph(4, 4), decodeReq).ok).toBe(true);
  });

  it('容量不够则不通过', () => {
    const r = isCompatible(decodeGraph(2, 2), decodeReq);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === 'token 容量')!.ok).toBe(false);
  });

  it('PIECEWISE 图不限制请求数与每请求 token 数', () => {
    const r = isCompatible(piecewise, { numReqs: 9, numTokens: 9, uniformTokenCount: null });
    expect(r.ok).toBe(true);
  });

  it('decode 图要求每请求 token 数严格相等', () => {
    const r = isCompatible(decodeGraph(8, 8), { numReqs: 2, numTokens: 8, uniformTokenCount: 4, maxQueryLen: 4 });
    expect(r.ok).toBe(false);
    expect(r.checks[0].ok).toBe(false);
  });

  it('非统一批次配不上 decode 图', () => {
    const r = isCompatible(decodeGraph(8, 8), { numReqs: 3, numTokens: 8, uniformTokenCount: null });
    expect(r.ok).toBe(false);
  });

  it('LoRA 数必须严格相等（不是 ≥）', () => {
    const g = { ...decodeGraph(8, 8), numActiveLoras: 2 };
    expect(isCompatible(g, { ...decodeReq, numActiveLoras: 1 }).ok).toBe(false);
    expect(isCompatible(g, { ...decodeReq, numActiveLoras: 3 }).ok).toBe(false);
    expect(isCompatible(g, { ...decodeReq, numActiveLoras: 2 }).ok).toBe(true);
  });

  it('ubatch 数必须严格相等', () => {
    const g = { ...decodeGraph(8, 8), numUbatches: 2 };
    expect(isCompatible(g, { ...decodeReq, numUbatches: 1 }).ok).toBe(false);
    expect(isCompatible(g, { ...decodeReq, numUbatches: 2 }).ok).toBe(true);
  });

  it('图约束 query 长度时，调用方必须也跟踪了它', () => {
    const g = { ...decodeGraph(8, 8), maxQueryLen: 4 };
    expect(isCompatible(g, { numReqs: 1, numTokens: 2, uniformTokenCount: 1, maxQueryLen: null }).ok).toBe(false);
    expect(isCompatible(g, { numReqs: 1, numTokens: 2, uniformTokenCount: 1, maxQueryLen: 2 }).ok).toBe(true);
  });

  it('六项检查齐全且顺序与源码一致', () => {
    expect(isCompatible(piecewise, decodeReq).checks.map((c) => c.name)).toEqual([
      '每请求 token 数',
      'query 长度上界',
      '请求数容量',
      'token 容量',
      'LoRA 数（必须相等）',
      'ubatch 数（必须相等）',
    ]);
  });
});

describe('dispatch', () => {
  it('命中第一个够大的桶（不是最大的那个）', () => {
    const r = dispatch(graphs, decodeReq);
    expect(r.matchedIndex).toBe(1);
    expect(r.desc.numTokens).toBe(4);
  });

  it('decode 图都装不下时落到 PIECEWISE', () => {
    const r = dispatch(graphs, { numReqs: 12, numTokens: 12, uniformTokenCount: 1, maxQueryLen: 1 });
    expect(r.desc.cgMode).toBe('PIECEWISE');
  });

  it('全都装不下时回退 eager', () => {
    const r = dispatch(graphs, { numReqs: 40, numTokens: 40, uniformTokenCount: 1, maxQueryLen: 1 });
    expect(r.matchedIndex).toBeNull();
    expect(r.desc.cgMode).toBe('NONE');
  });

  it('LoRA 对不上时即使容量够也回退', () => {
    const r = dispatch(graphs, { ...decodeReq, numActiveLoras: 1 });
    expect(r.desc.cgMode).toBe('NONE');
  });

  it('eagerDesc 保留本轮真实的形状（不做 padding）', () => {
    const d = eagerDesc(decodeReq);
    expect(d.numTokens).toBe(decodeReq.numTokens);
    expect(d.numReqs).toBe(decodeReq.numReqs);
  });
});

describe('padding', () => {
  it('命中的桶越大，浪费越多', () => {
    expect(padding(decodeGraph(4, 4), decodeReq).tokens).toBe(1);
    expect(padding(decodeGraph(8, 8), decodeReq).tokens).toBe(5);
  });

  it('PIECEWISE 图不限制请求数，所以请求侧没有 padding', () => {
    expect(padding(piecewise, decodeReq).reqs).toBe(0);
  });
});

describe('dispatchFlow 时间线', () => {
  it('每一步都有说明文字', () => {
    for (const s of dispatchFlow(graphs, decodeReq)) expect(s.caption.length).toBeGreaterThan(0);
  });

  it('命中后立即停止，不再检查后面的候选', () => {
    const tl = dispatchFlow(graphs, decodeReq);
    const last = tl[tl.length - 1].state;
    expect(last.phase).toBe('matched');
    expect(last.matched).toBe(1);
    expect(last.examined).toBe(2); // 只看了前两个
  });

  it('全不兼容时以回退收尾，并点明是静默的', () => {
    const tl = dispatchFlow(graphs, { numReqs: 40, numTokens: 40, uniformTokenCount: 1, maxQueryLen: 1 });
    const last = tl[tl.length - 1];
    expect(last.state.fellBack).toBe(true);
    expect(last.caption).toContain('静默');
  });

  it('命中步骤报出 padding 数量', () => {
    const tl = dispatchFlow(graphs, decodeReq);
    expect(tl[tl.length - 1].caption).toMatch(/padding/);
    expect(tl[tl.length - 1].state.padTokens).toBe(1);
  });
});
