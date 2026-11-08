"""11 HCA：重压缩 + 密集读，与 CSA 的「看漏 vs 看糊」对照。

uv run --with numpy python toy.py
"""
import numpy as np


def hca_compress(H, W_KV, W_Z, B, m_prime):
    """式 (20)–(23)：一套权重、不重叠、每 m′ 个压成一个。"""
    C, Z = H @ W_KV, H @ W_Z
    out = []
    for i in range(len(H) // m_prime):
        z = Z[m_prime * i:m_prime * (i + 1)] + B
        e = np.exp(z - z.max(axis=0))
        s = e / e.sum(axis=0)
        out.append((s * C[m_prime * i:m_prime * (i + 1)]).sum(axis=0))
    return np.array(out)


rng = np.random.default_rng(0)
n, d, c, mp = 64, 32, 8, 8
H = rng.normal(size=(n, d))
W_KV, W_Z = rng.normal(size=(d, c)) * 0.3, rng.normal(size=(d, c)) * 0.3
B = rng.normal(size=(mp, c)) * 0.3

comp = hca_compress(H, W_KV, W_Z, B, mp)
assert comp.shape == (n // mp, c), 'HCA 把序列压到 1/m′'

# ── 1M 上下文下两种机制面对的序列 ──
L = 1024 * 1024
m_csa, k_csa, m_hca = 4, 1024, 128
csa_entries, hca_entries = L // m_csa, L // m_hca
print('1M 上下文下两种机制面对的序列：')
print(f'  CSA ：{L} → {csa_entries} 个压缩条目，再挑 {k_csa} 个 → 实际读 {k_csa}')
print(f'  HCA ：{L} → {hca_entries:>6} 个压缩条目，全部读      → 实际读 {hca_entries}')
assert hca_entries == 8192 and csa_entries == 262144

print('\n每个被读条目代表多少原始 token：')
csa_cover = k_csa * (2 * m_csa)          # 重叠压缩：每个条目来自 2m 个 token
hca_cover = hca_entries * m_hca
print(f'  CSA ：每个条目来自 {2 * m_csa} 个 token（2m，重叠）→ 覆盖面 {csa_cover} 个原始 token')
print(f'  HCA ：每个条目来自 {m_hca} 个 token         → 覆盖面 {hca_cover} 个原始 token（全部）')
assert hca_cover == L, 'HCA 读全部条目，覆盖整个历史'
assert csa_cover < L, 'CSA 只覆盖被选中的那部分'

# ── 失败模式：看漏 vs 看糊 ──
t = n - 1
blk_csa, keep_csa = 4, 2
blk_hca = 8
csa_blocks = t // blk_csa
csa_seen = keep_csa * 2 * blk_csa                     # 选中的块（含重叠来源）
hca_blocks = t // blk_hca
hca_seen = hca_blocks * blk_hca
print(f'\n失败模式对照（序列 {n}、当前位置 {t}）：')
print(f'  CSA 只选 {keep_csa} 个块：能看到 {csa_seen} 个原始位置，看不到的有 {t - csa_seen} 个')
print(f'  HCA 读全部 {hca_blocks} 个块：能（粗粒度地）看到 {hca_seen} 个原始位置，看不到的有 {t - hca_seen} 个')
print(f'  但 HCA 的每个条目把 {blk_hca} 个 token 平均成了 1 个 —— 看得到，但看不清')
assert t - hca_seen < t - csa_seen, 'HCA 覆盖面更大'
assert blk_hca > 2 * blk_csa / 2, 'HCA 的分辨率更低'

# 分辨率的量化：一个被读条目里混了多少 token
print(f'\n分辨率（每个被读条目混入的 token 数，越小越清晰）：CSA {2 * m_csa}，HCA {m_hca}')
assert m_hca > 2 * m_csa

# HCA 的压缩权重同样是学出来的，不是平均
z_demo = (H[:mp] @ W_Z) + B
e = np.exp(z_demo - z_demo.max(axis=0))
s = e / e.sum(axis=0)
assert np.allclose(s.sum(axis=0), 1.0)
assert not np.allclose(s[:, 0], 1 / mp), '不是平均池化'
print(f'HCA 块内权重示例 {s[:, 0].round(2)}（不是均匀的 {round(1 / mp, 3)}）')
print('OK 11')
