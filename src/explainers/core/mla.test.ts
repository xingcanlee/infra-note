import { describe, expect, it } from 'vitest';
import { mlaFlow, mlaWidths, type MlaOptions } from './mla';

const opts: MlaOptions = {
  tokens: ['我', '在', '读', '注意力'],
  x: [
    [1, 0, 2, -1, 0, 1, 1, 0],
    [0, 2, -1, 1, 1, 0, 0, 1],
    [2, -1, 0, 0, 1, 1, -1, 0],
    [-1, 1, 1, 0, 2, 0, 1, 1],
  ],
  wDkv: [
    [1, 0, -1, 0, 1, 0, 0, -1],
    [0, 1, 0, 1, -1, 0, 1, 0],
    [-1, 0, 1, 0, 0, 1, 0, 1],
  ],
  wKr: [
    [1, 0, 0, 1, 0, -1, 0, 0],
    [0, -1, 1, 0, 0, 0, 1, 0],
  ],
  wUk: [
    [
      [1, 0, 1],
      [0, 1, -1],
      [1, -1, 0],
      [0, 1, 1],
    ],
    [
      [-1, 1, 0],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, -1],
    ],
  ],
  wUv: [
    [
      [0, 1, 1],
      [1, 0, -1],
      [-1, 1, 0],
      [1, 1, 0],
    ],
    [
      [1, -1, 1],
      [0, 1, 0],
      [1, 0, 1],
      [-1, 0, 1],
    ],
  ],
};

describe('mlaWidths', () => {
  it('MLA 宽度是 d_c + d_r，与 head 数无关', () => {
    expect(mlaWidths({ nH: 128, dK: 192, dV: 128, dC: 512, dR: 64 }).mla).toBe(576);
    expect(mlaWidths({ nH: 8, dK: 192, dV: 128, dC: 512, dR: 64 }).mla).toBe(576);
  });

  it('head 数越多，MLA 相对 MHA 的优势越大', () => {
    const few = mlaWidths({ nH: 8, dK: 192, dV: 128, dC: 512, dR: 64 }).ratio;
    const many = mlaWidths({ nH: 128, dK: 192, dV: 128, dC: 512, dR: 64 }).ratio;
    expect(many).toBeGreaterThan(few);
  });

  // DeepSeek-V3 671B 的 config_671B.json：n_heads=128、qk_nope=128、qk_rope=64、v_head=128、kv_lora_rank=512
  it('V3 671B 的真实配置给出 640/9 ≈ 71.1 倍', () => {
    const w = mlaWidths({ nH: 128, dK: 128 + 64, dV: 128, dC: 512, dR: 64 });
    expect(w.mla).toBe(576);
    expect(w.mha).toBe(40960);
    expect(w.ratio).toBeCloseTo(640 / 9, 10);
    expect(w.ratio).toBeCloseTo(71.111, 3);
  });
});

describe('mlaFlow 时间线', () => {
  const tl = mlaFlow(opts);

  it('每一步都有说明文字', () => {
    for (const s of tl) expect(s.caption.length).toBeGreaterThan(0);
  });

  it('开始时缓存为空，结束时全部 token 都已写入', () => {
    expect(tl[0].state.c.every((r) => r.every((x) => x === null))).toBe(true);
    const last = tl[tl.length - 1].state;
    expect(last.c.every((r) => r.every((x) => x !== null))).toBe(true);
    expect(last.pe.every((r) => r.every((x) => x !== null))).toBe(true);
  });

  it('latent 的计算就是 W^DKV · x（手算核对第 0 个 token）', () => {
    // c0 = W^DKV · x0，x0 = [1,0,2,-1,0,1,1,0]
    // 行0: 1·1 + 0·0 + (−1)·2 + 0·(−1) + 1·0 + 0·1 + 0·1 + (−1)·0 = 1 − 2 = −1
    // 行1: 0 + 0 + 0 + 1·(−1) + (−1)·0 + 0 + 1·1 + 0 = 0
    // 行2: (−1)·1 + 0 + 1·2 + 0 + 0 + 1·1 + 0 + 1·0 = 2
    const after = tl.find((s) => s.state.phase === 'compress')!.state;
    expect(after.c[0]).toEqual([-1, 0, 2]);
  });

  it('缓存宽度远小于 MHA，且与正文一致', () => {
    const st = tl[0].state;
    expect(st.widthMla).toBe(3 + 2); // d_c=3, d_r=2
    expect(st.widthMha).toBe(2 * (4 + 4)); // n_h=2, d_k=d_v=4
    expect(st.widthMha / st.widthMla).toBeCloseTo(3.2, 10);
  });

  it('不同 head 从同一个 latent 重建出不同的 K——这是与 MQA 的根本差别', () => {
    const last = tl[tl.length - 1].state;
    expect(last.k[0]).not.toEqual(last.k[1]);
    expect(last.v[0]).not.toEqual(last.v[1]);
  });

  it('上投影只依赖 latent：重建用的是 c，不是原始 x', () => {
    const upK = tl.filter((s) => s.state.phase === 'up-k');
    expect(upK).toHaveLength(2); // 2 个 head
    for (const s of upK) expect(s.state.c[s.state.s!].every((x) => x !== null)).toBe(true);
  });

  it('head 数不一致时报错', () => {
    expect(() => mlaFlow({ ...opts, wUv: [opts.wUv[0]] })).toThrow(/head 数/);
  });

  it('token 数与序列长度不一致时报错', () => {
    expect(() => mlaFlow({ ...opts, tokens: ['只有一个'] })).toThrow(/token/);
  });
});
