#!/usr/bin/env python3
"""Chapter 09 toy: CSA2 3D compression, Hierarchical Sparse Indexer, MXFP4 890B & CED."""

from __future__ import annotations

import numpy as np

# OCP FP4 E2M1 signed codebook: 16 bit patterns -> 15 unique finite values in [-6, 6]
E2M1_LEVELS = np.array(
    [-6.0, -4.0, -3.0, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0],
    dtype=np.float64,
)


def build_e4m3_positive_table() -> np.ndarray:
    """Construct all 119 strictly positive finite OCP FP8 E4M3 magnitudes (bias=7)."""
    vals: list[float] = []
    for exp in range(16):
        for man in range(8):
            if (exp == 0 and man == 0) or (exp == 15 and man == 7):
                continue  # 0 excluded from positive scales; exp=15,man=7 is OCP NaN
            vals.append((man / 8.0) * (2.0**-6) if exp == 0 else (1.0 + man / 8.0) * (2.0 ** (exp - 7)))
    return np.array(vals, dtype=np.float64)


E4M3_POS = build_e4m3_positive_table()


def quantize_mxfp4_block16(x: np.ndarray) -> tuple[np.ndarray, float]:
    """Quantize [rows, 512] tensor with E2M1 payloads and 1 E4M3 scale per 16 channels."""
    rows, dim = x.shape
    assert dim % 16 == 0
    blocks = x.reshape(rows, dim // 16, 16)
    ideal_scale = np.maximum(np.max(np.abs(blocks), axis=-1, keepdims=True) / 6.0, E4M3_POS[0])
    scale_idx = np.argmin(np.abs(E4M3_POS[None, None, None, :] - ideal_scale[..., None]), axis=-1)
    q_scale = E4M3_POS[scale_idx]
    normed = np.clip(blocks / q_scale, -6.0, 6.0)
    q_idx = np.argmin(np.abs(E2M1_LEVELS[None, None, None, :] - normed[..., None]), axis=-1)
    x_hat = E2M1_LEVELS[q_idx] * q_scale
    x_hat = x_hat.reshape(rows, dim)
    noise = float(np.sum((x - x_hat) ** 2))
    sqnr_db = 10.0 * np.log10(float(np.sum(x**2)) / max(noise, 1e-12))
    return x_hat, sqnr_db


def quantize_e2m1_per_row(x: np.ndarray) -> float:
    """Baseline: single FP32 scale per 512-dim row without block-16 shared E4M3 scaling."""
    scale = np.maximum(np.max(np.abs(x), axis=-1, keepdims=True) / 6.0, 1e-6)
    normed = np.clip(x / scale, -6.0, 6.0)
    q_idx = np.argmin(np.abs(E2M1_LEVELS[None, None, :] - normed[..., None]), axis=-1)
    x_hat = E2M1_LEVELS[q_idx] * scale
    noise = float(np.sum((x - x_hat) ** 2))
    return 10.0 * np.log10(float(np.sum(x**2)) / max(noise, 1e-12))


def simulate_hsi(rng: np.random.Generator) -> tuple[float, float, float]:
    """Compare Two-Stage Hierarchical Sparse Indexer vs exhaustive Full-layer indexing."""
    num_blocks, block_size, d_idx, n_heads = 512, 8, 128, 32
    n_slots = num_blocks * block_size  # 4,096 compressed slots
    block_topics = rng.normal(0.0, 1.0, size=(num_blocks, d_idx))
    k_idx = np.repeat(block_topics, block_size, axis=0) * 0.85 + rng.normal(0.0, 0.50, size=(n_slots, d_idx))
    k_idx /= np.linalg.norm(k_idx, axis=-1, keepdims=True)

    # Full-mode source query and Reindex-mode consumer query share coarse semantic subspace
    q_base = block_topics[17] + 0.6 * block_topics[105] + 0.4 * block_topics[299]
    q_full = (q_base[None, :] + rng.normal(0.0, 0.25, size=(n_heads, d_idx))) / np.sqrt(d_idx)
    q_drift = 0.75 * q_base + 0.35 * block_topics[420]
    q_reindex = (q_drift[None, :] + rng.normal(0.0, 0.38, size=(n_heads, d_idx))) / np.sqrt(d_idx)
    w = np.full(n_heads, 1.0 / n_heads)

    def idx_score(q: np.ndarray, keys: np.ndarray) -> np.ndarray:
        return w @ np.maximum(q @ keys.T, 0.0)  # weighted ReLU matching DeepseekV4Indexer

    full_scores = idx_score(q_full, k_idx)
    block_max = full_scores.reshape(num_blocks, block_size).max(axis=1)
    cand_blocks = np.argsort(block_max)[-64:]  # Stage 1: top-64 of 512 blocks (12.5%)
    cand_slots = (cand_blocks[:, None] * block_size + np.arange(block_size)).ravel()

    exact_scores = idx_score(q_reindex, k_idx)
    exact_topk = set(np.argsort(exact_scores)[-64:].tolist())
    cand_scores = idx_score(q_reindex, k_idx[cand_slots])
    hsi_topk = set(cand_slots[np.argsort(cand_scores)[-64:]].tolist())
    recall = len(exact_topk & hsi_topk) / len(exact_topk)
    scan_ratio = len(cand_slots) / n_slots
    paper_pool_ratio = (2048 * 8) / 1_000_000  # 16,384 candidate pool at 1M context
    return recall, scan_ratio, paper_pool_ratio


def verify_v41_ledgers(rng: np.random.Generator) -> None:
    """Verify 890 B/token KV ledger, 40-layer Full/Reindex/Reuse counts, and CED compute."""
    kv = rng.normal(0.0, 0.85, size=(128, 512))
    # Inject a realistic single outlier channel to show per-row vs block-16 sensitivity
    kv[:, 0] *= 4.5
    _, sqnr_b16 = quantize_mxfp4_block16(kv)
    sqnr_row = quantize_e2m1_per_row(kv)
    assert sqnr_b16 > sqnr_row + 2.0 and sqnr_b16 > 19.0

    main_kv_b = 512 // 2 + 512 // 16  # 256B E2M1 + 32B E4M3 (per 16 channels) = 288 B
    idx_k_b = 128 // 2 + 128 // 32  # 64B E2M1 + 4B UE8M0 (per 32 channels) = 68 B
    assert (main_kv_b, idx_k_b) == (288, 68)

    enc_kv_sources, enc_m = 3, 2  # L2..L19: 3 groups x 6 layers, m=2 compression
    dec_kv_sources, dec_m = 1, 1  # L20..L39: 5 groups x 4 layers, Group 1 is Full (m=1)
    entries_per_tok = enc_kv_sources / enc_m + dec_kv_sources / dec_m
    total_kv_bytes = round(entries_per_tok * (main_kv_b + idx_k_b))
    assert entries_per_tok == 2.5 and total_kv_bytes == 890

    # 40-layer breakdown: 2 SWA + (3 Full + 15 Reuse) Enc + (1 Full + 4 Reindex + 15 Reuse) Dec
    swa_only, full_layers, reindex_layers, reuse_layers = 2, 4, 4, 30
    assert swa_only + full_layers + reindex_layers + reuse_layers == 40
    # Cross-layer Indexer scoring ops at N=1M: 3*0.5N (Enc Full) + 1.0N (Dec Full) + 4*16384 (Reindex)
    n_1m = 1_000_000
    naive_idx_ops = 38 * n_1m  # 38 sparse layers without m=2, HSI, or cross-layer reuse
    csa2_idx_ops = 3 * (n_1m // 2) + 1 * n_1m + 4 * (2048 * 8)
    idx_scan_reduction = naive_idx_ops / csa2_idx_ops
    naive_bf16_mla_bytes = 38 * (512 * 2 + 128 * 2)  # 38 global layers unshared BF16 main+idx
    kv_mem_reduction = naive_bf16_mla_bytes / total_kv_bytes
    assert idx_scan_reduction > 14.0 and kv_mem_reduction > 54.0

    # CED prefill FLOPs ratio on N=100k context with replay window n_win=128
    # Bottom 20 Encoder layers (~8B active) run on all N; top 20 Decoder (~8B) run on n_win
    n_ctx, n_win, full_act, enc_act, dec_act = 100_000, 128, 16.0, 8.0, 8.0
    baseline_prefill = n_ctx * full_act
    ced_prefill = n_ctx * enc_act + n_win * dec_act
    ced_speedup = baseline_prefill / ced_prefill

    recall, scan_ratio, paper_pool_ratio = simulate_hsi(rng)
    assert recall >= 0.90 and np.isclose(scan_ratio, 0.125)
    print(f"HSI Recall@64={recall:.3f}, ToyScan={scan_ratio:.3f}, 1M_Pool={paper_pool_ratio:.4%}")
    print(f"KV SQNR(block-16 E4M3)={sqnr_b16:.2f} dB vs row-scale={sqnr_row:.2f} dB")
    print(
        f"GlobalKV={total_kv_bytes} B/tok (Main={int(entries_per_tok * main_kv_b)}B + "
        f"IdxK={int(entries_per_tok * idx_k_b)}B, entries={entries_per_tok}, "
        f"vs BF16_38L={kv_mem_reduction:.1f}x)"
    )
    print(
        f"Layers(40): SWA={swa_only}, Full={full_layers}, Reindex={reindex_layers}, "
        f"Reuse={reuse_layers} | IdxScan={idx_scan_reduction:.1f}x | CED_Prefill={ced_speedup:.2f}x"
    )
    print("OK 09")


if __name__ == "__main__":
    verify_v41_ledgers(np.random.default_rng(42))
