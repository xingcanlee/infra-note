"""Chapter 02 Toy: TP/SP exact equivalence + DP+EP memory & PD-KV accounting."""

import numpy as np


def rmsnorm(x: np.ndarray, weight: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    """Row-wise RMSNorm along last hidden dimension."""
    var = np.mean(x * x, axis=-1, keepdims=True)
    return x / np.sqrt(var + eps) * weight


def verify_tp_and_sp() -> None:
    """Verify full GEMM+Norm == 2-rank TP (AllReduce) == TP+SP (RS + Norm + AG)."""
    rng = np.random.default_rng(42)
    t_len, h_dim, f_dim, tp = 8, 16, 32, 2
    x = rng.normal(size=(t_len, h_dim))
    w1 = rng.normal(size=(h_dim, f_dim)) / np.sqrt(h_dim)
    w2 = rng.normal(size=(f_dim, h_dim)) / np.sqrt(f_dim)
    gamma = rng.uniform(0.8, 1.2, size=(h_dim,))

    # 1. Single-chip reference
    z_ref = np.maximum(x @ w1, 0.0) @ w2
    out_ref = rmsnorm(z_ref + x, gamma)

    # 2. 2-rank Megatron TP: ColumnParallel(W1) -> RowParallel(W2) -> AllReduce
    w1_shards = np.split(w1, tp, axis=1)
    w2_shards = np.split(w2, tp, axis=0)
    partial_z = [np.maximum(x @ w1_shards[r], 0.0) @ w2_shards[r] for r in range(tp)]
    z_tp = partial_z[0] + partial_z[1]  # AllReduce
    out_tp = rmsnorm(z_tp + x, gamma)
    assert np.allclose(z_tp, z_ref, atol=1e-12)
    assert np.allclose(out_tp, out_ref, atol=1e-12)

    # 3. 2-rank TP + SP: ReduceScatter(dim=0) -> local RMSNorm(T/TP) -> AllGather(dim=0)
    rs_shards = [
        sum(p_z[r * (t_len // tp) : (r + 1) * (t_len // tp)] for p_z in partial_z)
        for r in range(tp)
    ]
    x_shards = np.split(x, tp, axis=0)
    norm_shards = [rmsnorm(rs_shards[r] + x_shards[r], gamma) for r in range(tp)]
    out_sp = np.concatenate(norm_shards, axis=0)  # AllGather(dim=0)
    assert np.allclose(out_sp, out_ref, atol=1e-12)

    # Communication bytes equivalence (BF16 = 2 bytes)
    payload_bytes = t_len * h_dim * 2
    ar_bytes = 2 * (tp - 1) / tp * payload_bytes
    sp_bytes = (tp - 1) / tp * payload_bytes + (tp - 1) / tp * payload_bytes
    assert np.isclose(ar_bytes, sp_bytes)
    print("=== TP vs TP+SP Numerical & Byte Equivalence ===")
    print(f"max|TP - Ref|   = {np.max(np.abs(out_tp - out_ref)):.2e}")
    print(f"max|SP - Ref|   = {np.max(np.abs(out_sp - out_ref)):.2e}")
    print(f"Norm activation rows/rank: TP={t_len}, SP={t_len // tp} (comm={sp_bytes:.0f}B == AR)\n")


def memory_and_pd_accounting() -> None:
    """Compare TP=8 vs DP=8+EP=8 KV bloat and GQA vs MLA PD transfer cost."""
    layers, bf16 = 61, 2
    # DeepSeek-style MLA vs GQA-8/GQA-32 KV bytes per token across 61 layers
    configs = [
        ("GQA-32 (32 kv_heads x 128 x 2)", 32 * 128 * 2, 1),
        ("GQA-4  ( 4 kv_heads x 128 x 2)", 4 * 128 * 2, 2),
        ("MLA    (dc=512 + dr=64)", 512 + 64, 8),
    ]
    seq_len = 8192
    bw_bytes = 40e9  # 400 Gbps RDMA (~40 GB/s effective goodput)
    print("=== Pure TP=8 KV Replication & PD Transfer (61 layers, seq=8192, 40GB/s) ===")
    mla_gb = 0.0
    for name, dims_per_tok, tp8_rep in configs:
        bytes_per_tok = dims_per_tok * layers * bf16
        req_mib = bytes_per_tok * seq_len / (1024**2)
        tp8_cluster_gib = req_mib * tp8_rep / 1024
        tx_ms = (bytes_per_tok * seq_len / bw_bytes) * 1e3
        if "MLA" in name:
            mla_gb = req_mib
        print(
            f"  {name:32s}: {bytes_per_tok/1024:6.2f} KB/tok | "
            f"req={req_mib:7.1f} MiB | TP=8 rep={tp8_rep}x ({tp8_cluster_gib:.2f} GiB) | "
            f"PD tx={tx_ms:5.2f} ms"
        )
    gqa32_mib = (32 * 128 * 2 * layers * bf16 * seq_len) / (1024**2)
    assert gqa32_mib / mla_gb > 10.0

    # Layerwise overlap check: 1 layer transfer vs remaining (L-1) compute window
    layer_tx_ms = ((576 * bf16 * seq_len) / bw_bytes) * 1e3
    print(f"  -> MLA GQA-32 compression ratio = {gqa32_mib / mla_gb:.1f}x")
    print(f"  -> Per-layer MLA KV push = {layer_tx_ms:.3f} ms (overlapped across {layers} layers)\n")


if __name__ == "__main__":
    verify_tp_and_sp()
    memory_and_pd_accounting()
    print("OK 02")
