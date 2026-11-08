"""16 mHC：双随机约束为什么能稳住深层残差流。

uv run --with numpy python toy.py
"""
import numpy as np


def sinkhorn_knopp(M, t_max=20):
    """交替列归一化 / 行归一化，把正矩阵推向双随机。论文式 (9)，t_max=20。"""
    X = np.exp(M)
    for _ in range(t_max):
        X = X / X.sum(axis=0, keepdims=True)   # 列归一化
        X = X / X.sum(axis=1, keepdims=True)   # 行归一化
    return X


rng = np.random.default_rng(0)
n, L = 4, 61            # n = 残差流条数（V4 用 4），L = 层数

print(f'残差流 n={n}，模拟 {L} 层的复合矩阵 ∏ H^res\n')

# ① 无约束 HC：H^res 是任意矩阵
raw = [rng.normal(size=(n, n)) * 0.5 + np.eye(n) for _ in range(L)]
P = np.eye(n)
norms_raw = []
for H in raw:
    P = H @ P
    norms_raw.append(np.linalg.norm(P, 2))

# ② mHC：H^res 投影到双随机
ds = [sinkhorn_knopp(rng.normal(size=(n, n))) for _ in range(L)]
Q = np.eye(n)
norms_ds = []
for H in ds:
    Q = H @ Q
    norms_ds.append(np.linalg.norm(Q, 2))

print(f'{"层":>5}{"无约束 HC 的 ‖∏H‖₂":>22}{"mHC（双随机）的 ‖∏H‖₂":>24}')
for l in (1, 5, 10, 20, 40, 61):
    print(f'{l:>5}{norms_raw[l - 1]:>22.3e}{norms_ds[l - 1]:>24.4f}')

# 双随机的基本性质
H = ds[0]
assert np.allclose(H.sum(axis=1), 1, atol=1e-6), '每行和为 1'
assert np.allclose(H.sum(axis=0), 1, atol=1e-6), '每列和为 1'
assert (H >= -1e-12).all(), '非负'
assert np.linalg.norm(H, 2) <= 1 + 1e-6, '双随机 ⇒ 谱范数 ≤ 1 ⇒ 非扩张'

# 对乘法封闭：复合仍是双随机
prod = ds[0] @ ds[1] @ ds[2]
assert np.allclose(prod.sum(axis=1), 1, atol=1e-6)
assert np.allclose(prod.sum(axis=0), 1, atol=1e-6)
print('\n双随机矩阵：行和=列和=1、非负、谱范数 ≤ 1 ✓；且对乘法封闭 ✓')

# 关键对照
assert norms_ds[-1] <= 1 + 1e-6, 'mHC 的复合永不放大'
assert norms_raw[-1] > 1e3, '无约束 HC 的复合会指数放大'
print(f'\n{L} 层之后：')
print(f'  无约束 HC：‖∏H‖₂ = {norms_raw[-1]:.3e}  ← 指数放大，前向信号与反向梯度都会爆')
print(f'  mHC      ：‖∏H‖₂ = {norms_ds[-1]:.4f}      ← 始终 ≤ 1，非扩张')

# n=1 时退化为原始残差
one = sinkhorn_knopp(rng.normal(size=(1, 1)))
assert np.allclose(one, [[1.0]]), 'n=1 时双随机矩阵只能是标量 1 —— 退化成原始 identity 残差'
print('\nn=1 时双随机矩阵只能是 [[1.0]] ✓ —— mHC 退化成标准残差连接')

# I/O 代价：n 条流意味着每 token 的读写按 n 倍增长
C = 7168
print(f'\nI/O 代价（C={C}）：')
print(f'  标准残差：每 token {C:,} 个数')
print(f'  n={n} 条流：每 token {n * C:,} 个数（{n}×）')
print(f'  论文的融合把读取从 (3n+1)C={(3 * n + 1) * C:,} 降到 (n+1)C={(n + 1) * C:,}，'
      f'写入从 3nC={3 * n * C:,} 降到 nC={n * C:,}')
assert (3 * n + 1) * C > (n + 1) * C
print('OK 16')
