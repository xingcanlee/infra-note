"""12 机制对照：把 07–11 的机制放在同一组输入上跑，用同一套指标比较。

统一 harness：每个机制给出「这一步实际参与注意力的 K/V」，然后
  ① 读取量      —— 这一步读了多少个条目
  ② 注意力质量  —— 覆盖了全注意力权重的多少（挑得准不准）
  ③ 输出误差    —— 与全注意力输出的余弦相似度（最终影响）

uv run --with numpy python toy.py
"""
import numpy as np

rng = np.random.default_rng(7)
L, d = 512, 64
q_all = rng.normal(size=(L, d))
k_all = rng.normal(size=(L, d))
v_all = rng.normal(size=(L, d))
# 让注意力有结构：制造几个"相关区域"，否则所有机制都等价于随机
for c in (37, 150, 400):
    k_all[c:c + 12] += 2.5 * q_all[L - 1] / np.linalg.norm(q_all[L - 1]) * np.sqrt(d) / 3

t = L - 1
q = q_all[t]
scale = np.sqrt(d)


def softmax(z):
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


full_logits = k_all[:t + 1] @ q / scale
full_w = softmax(full_logits)
full_out = full_w @ v_all[:t + 1]


def evaluate(name, idx, note='', k_src=None, v_src=None, n_read=None):
    """idx: 参与注意力的原始位置下标；k_src/v_src 给压缩机制用。"""
    if k_src is None:
        k_src, v_src = k_all[idx], v_all[idx]
    w = softmax(k_src @ q / scale)
    out = w @ v_src
    cos = float(out @ full_out / (np.linalg.norm(out) * np.linalg.norm(full_out)))
    mass = float(full_w[idx].sum()) if idx is not None else float('nan')
    read = n_read if n_read is not None else len(k_src)
    return dict(name=name, read=read, mass=mass, cos=cos, note=note)


rows = []
rows.append(dict(name='全注意力（基线）', read=t + 1, mass=1.0, cos=1.0, note='读完全部历史'))

# ── SWA ──
W = 64
idx = np.arange(max(0, t - W + 1), t + 1)
rows.append(evaluate(f'SWA w={W}', idx, '只读最近的'))

# ── SWA + sink ──
idx = np.unique(np.concatenate([np.arange(4), np.arange(max(0, t - W + 1), t + 1)]))
rows.append(evaluate(f'SWA w={W} + 4 sink', idx, '加前缀锚点'))

# ── NSA 式三分支（块分数来自压缩分支）──
l_blk, n_sel, w_win = 32, 8, 64
n_blocks = (t + 1 + l_blk - 1) // l_blk
blk_k = np.array([k_all[b * l_blk:min((b + 1) * l_blk, t + 1)].mean(0) for b in range(n_blocks)])
blk_p = softmax(blk_k @ q / scale)                      # 压缩分支的注意力概率 = 块分数
chosen = np.argsort(blk_p)[::-1][:n_sel]
chosen = np.unique(np.concatenate([chosen, [0], [t // l_blk]]))   # 固定激活起始块与本地块
sel_idx = np.concatenate([np.arange(b * l_blk, min((b + 1) * l_blk, t + 1)) for b in chosen])
win_idx = np.arange(max(0, t - w_win + 1), t + 1)
idx = np.unique(np.concatenate([sel_idx, win_idx]))
rows.append(evaluate(f'NSA 式（选 {len(chosen)} 块 + 窗口 {w_win}）', idx, '块分数复用压缩分支'))

# ── DSA 式 top-k（轻量 indexer 打分）──
k_top = 64
d_I, H_I = 16, 4
Wq_i = rng.normal(size=(d, H_I * d_I)) * 0.3
Wk_i = rng.normal(size=(d, d_I)) * 0.3
Ww_i = rng.normal(size=(d, H_I)) * 0.3
qi = (q @ Wq_i).reshape(H_I, d_I)
ki = k_all[:t + 1] @ Wk_i
wi = q @ Ww_i
I = (wi[:, None] * np.maximum(qi @ ki.T, 0)).sum(0)
idx = np.sort(np.argsort(I)[::-1][:k_top])
rows.append(evaluate(f'DSA 式 top-{k_top}（随机初始化 indexer）', idx, 'indexer 没训练'))

# 对照：如果 indexer 是完美的（用真实分数挑）
idx = np.sort(np.argsort(full_logits)[::-1][:k_top])
rows.append(evaluate(f'DSA 式 top-{k_top}（完美 indexer 上限）', idx, '上限参考'))

# ── CSA 式：先压缩 m 倍，再在压缩条目上 top-k ──
m, k_csa = 4, 16
n_c = (t + 1) // m
c_k = np.array([k_all[i * m:(i + 1) * m].mean(0) for i in range(n_c)])
c_v = np.array([v_all[i * m:(i + 1) * m].mean(0) for i in range(n_c)])
ci = softmax(c_k @ q / scale)
pick = np.sort(np.argsort(ci)[::-1][:k_csa])
win_idx = np.arange(max(0, t - 16 + 1), t + 1)
k_src = np.concatenate([c_k[pick], k_all[win_idx]])
v_src = np.concatenate([c_v[pick], v_all[win_idx]])
covered = np.concatenate([np.concatenate([np.arange(p * m, (p + 1) * m) for p in pick]), win_idx])
r = evaluate(f'CSA 式（压 {m} 倍后选 {k_csa} + 窗口 16）', np.unique(covered), '两级：压缩+稀疏',
             k_src=k_src, v_src=v_src, n_read=len(k_src))
rows.append(r)

# ── HCA 式：重压缩后全读 ──
mp = 64
n_h = (t + 1) // mp
h_k = np.array([k_all[i * mp:(i + 1) * mp].mean(0) for i in range(n_h)])
h_v = np.array([v_all[i * mp:(i + 1) * mp].mean(0) for i in range(n_h)])
win_idx = np.arange(max(0, t - 16 + 1), t + 1)
k_src = np.concatenate([h_k, k_all[win_idx]])
v_src = np.concatenate([h_v, v_all[win_idx]])
covered = np.unique(np.concatenate([np.arange(n_h * mp), win_idx]))
rows.append(evaluate(f'HCA 式（压 {mp} 倍后全读 + 窗口 16）', covered, '覆盖全历史但很糊',
                     k_src=k_src, v_src=v_src, n_read=len(k_src)))

print(f'序列长 {L}，看位置 {t}。全注意力权重集中在人为制造的 3 个相关区域。\n')
print(f'{"机制":<36}{"读取":>6}{"注意力质量":>12}{"输出余弦":>10}  说明')
print('─' * 92)
for r in rows:
    print(f'{r["name"]:<36}{r["read"]:>6}{r["mass"] * 100:>11.1f}%{r["cos"]:>10.4f}  {r["note"]}')

by = {r['name']: r for r in rows}
swa = by[f'SWA w={W}']
nsa = by[f'NSA 式（选 {len(chosen)} 块 + 窗口 {w_win}）']
dsa_rand = by[f'DSA 式 top-{k_top}（随机初始化 indexer）']
dsa_best = by[f'DSA 式 top-{k_top}（完美 indexer 上限）']

assert swa['mass'] < 0.5, '纯窗口抓不到远处的相关区域'
assert nsa['mass'] > swa['mass'], '多分支比纯窗口覆盖更多注意力质量'
assert dsa_best['mass'] > dsa_rand['mass'], 'indexer 的质量决定一切'
assert dsa_best['cos'] > dsa_rand['cos']
# 读取量相近时，挑得准的赢
assert abs(dsa_best['read'] - swa['read']) == 0 and dsa_best['mass'] > swa['mass'], \
    '同样读 64 个，挑对位置的覆盖率远高于只读最近的'

print('\n可核对的结论：')
print(f'  1. 同样读 {W} 个条目，SWA 只覆盖 {swa["mass"] * 100:.1f}% 的注意力质量，'
      f'而按真实分数挑的 top-{k_top} 覆盖 {dsa_best["mass"] * 100:.1f}% —— 位置选得准比读得多更重要')
print(f'  2. indexer 不训练（{dsa_rand["mass"] * 100:.1f}%）和完美 indexer（{dsa_best["mass"] * 100:.1f}%）'
      f'差距巨大 —— DSA 的全部风险都在打分上')
print(f'  3. NSA 式三分支读 {nsa["read"]} 个，覆盖 {nsa["mass"] * 100:.1f}%，'
      f'靠的是「块分数来自压缩分支」这一步白捡的全局视野')
print('OK 12')
