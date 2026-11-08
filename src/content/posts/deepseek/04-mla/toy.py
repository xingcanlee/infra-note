"""04 MLA：压缩成 latent、按 head 重建、等价性验证。

uv run --with numpy python toy.py
"""
import numpy as np

d, d_c, n_heads, d_k, d_v = 8, 3, 2, 4, 4

x = np.array([1, 0, 2, -1, 0, 1, 1, 0], dtype=float)
W_dkv = np.array([[1, 0, -1, 0, 1, 0, 0, -1],
                  [0, 1, 0, 1, -1, 0, 1, 0],
                  [-1, 0, 1, 0, 0, 1, 0, 1]], dtype=float)
W_uk = [np.array([[1, 0, 1], [0, 1, -1], [1, -1, 0], [0, 1, 1]], dtype=float),
        np.array([[-1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, -1]], dtype=float)]
W_uv = [np.array([[0, 1, 1], [1, 0, -1], [-1, 1, 0], [1, 1, 0]], dtype=float),
        np.array([[1, -1, 1], [0, 1, 0], [1, 0, 1], [-1, 0, 1]], dtype=float)]

# ① 下投影：缓存里只放这个
c = W_dkv @ x
print('c0 =', c)
assert np.allclose(c, [-1, 0, 2]), '与正文手算一致'

# ② 读取时按 head 上投影
k0, k1 = W_uk[0] @ c, W_uk[1] @ c
print('head0 的 Key =', k0)
print('head1 的 Key =', k1)
assert not np.allclose(k0, k1), '同一个 latent，不同的 W_uk，得到不同的 Key'
assert not np.allclose(W_uv[0] @ c, W_uv[1] @ c), 'Value 同理'

# ③ 等价性：缓存 latent 再上投影 == 用复合矩阵一步算（逐位相同，不是近似）
for h in range(n_heads):
    W_k_equiv = W_uk[h] @ W_dkv          # (d_k, d)：等价的 MHA 投影矩阵
    assert np.allclose(W_uk[h] @ (W_dkv @ x), W_k_equiv @ x)
    assert W_k_equiv.shape == (d_k, d)
    # 复合矩阵的秩不超过 d_c —— 这才是 MLA 真正的约束所在
    assert np.linalg.matrix_rank(W_k_equiv) <= d_c

# ④ 账本：head 数不再影响 MLA 的缓存宽度
d_r = 2
for n_h in (2, 8, 128):
    print(f'n_h={n_h:>3}：MLA {d_c + d_r} 个数，按 MHA 存 {n_h * (d_k + d_v)} 个数')
assert d_c + d_r == 5

# ⑤ 用 V3 671B 的真实配置核对正文的 71.1 倍
n_h, nope, rope, vh, kv_lora, layers, n_bytes = 128, 128, 64, 128, 512, 61, 2
mla_w = kv_lora + rope
mha_w = n_h * (nope + rope + vh)
assert (mla_w, mha_w) == (576, 40960)
assert abs(mha_w / mla_w - 640 / 9) < 1e-12
gib = 1024 ** 3
for tokens, label in [(4096, '4096'), (128 * 1024, '128K')]:
    a = mla_w * tokens * layers * n_bytes
    b = mha_w * tokens * layers * n_bytes
    print(f'{label:>5}：MLA {a / gib:7.3f} GiB   按 MHA 存 {b / gib:8.2f} GiB   {b / a:.1f}×')
assert abs(mla_w * 4096 * layers * n_bytes / gib - 0.268) < 0.001
assert abs(mha_w * 128 * 1024 * layers * n_bytes / gib - 610.0) < 0.01
print('OK 04')
