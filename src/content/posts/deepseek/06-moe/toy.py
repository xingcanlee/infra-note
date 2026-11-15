"""Chapter 10 toy model: Aux-Loss-Free routing, moe_align_block_size, dsv4_topk."""
import numpy as np


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -60.0, 60.0)))


def silu(x: np.ndarray) -> np.ndarray:
    return x * sigmoid(x)


def grouped_topk_route(
    logits: np.ndarray,
    bias: np.ndarray,
    n_groups: int,
    topk_groups: int,
    topk: int,
    route_scale: float = 2.5,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """DeepSeek-V3 Gate: bias only shifts selection; weights use raw sigmoid scores."""
    bsz, num_experts = logits.shape
    raw_scores = sigmoid(logits)
    sel_scores = raw_scores + bias[None, :]
    g_size = num_experts // n_groups
    grouped = sel_scores.reshape(bsz, n_groups, g_size)
    group_sum = np.sort(grouped, axis=-1)[:, :, -2:].sum(axis=-1)
    keep_groups = np.argpartition(group_sum, -topk_groups, axis=-1)[:, -topk_groups:]
    mask = np.zeros((bsz, n_groups), dtype=bool)
    np.put_along_axis(mask, keep_groups, True, axis=-1)
    masked_sel = np.where(np.repeat(mask, g_size, axis=1), sel_scores, -np.inf)
    topk_idx = np.argpartition(masked_sel, -topk, axis=-1)[:, -topk:]
    # Order each token's top-k indices by descending selection score for determinism
    order = np.argsort(-np.take_along_axis(masked_sel, topk_idx, axis=-1), axis=-1)
    topk_idx = np.take_along_axis(topk_idx, order, axis=-1)
    # Decoupled weighting: gather from unbiased raw_scores, never sel_scores
    raw_picked = np.take_along_axis(raw_scores, topk_idx, axis=-1)
    weights = (raw_picked / (raw_picked.sum(axis=-1, keepdims=True) + 1e-20)) * route_scale
    return topk_idx, weights, raw_scores


def moe_align_block_size(
    topk_ids: np.ndarray, num_experts: int, block_size: int
) -> tuple[np.ndarray, np.ndarray, int]:
    """Pad each expert's routed token slots to multiples of block_size."""
    flat_ids = topk_ids.reshape(-1)
    sentinel = flat_ids.size
    sorted_chunks: list[np.ndarray] = []
    block_experts: list[int] = []
    for eid in range(num_experts):
        slots = np.flatnonzero(flat_ids == eid)
        if slots.size == 0:
            continue
        n_blocks = (slots.size + block_size - 1) // block_size
        padded = np.full(n_blocks * block_size, sentinel, dtype=np.int64)
        padded[: slots.size] = slots
        sorted_chunks.append(padded)
        block_experts.extend([eid] * n_blocks)
    sorted_ids = np.concatenate(sorted_chunks) if sorted_chunks else np.empty(0, dtype=np.int64)
    return sorted_ids, np.asarray(block_experts, dtype=np.int64), sorted_ids.size


def dsv4_affinity(logits: np.ndarray) -> np.ndarray:
    """DeepSeek-V4 sqrt(softplus(z)) with linear asymptote above 20.0."""
    safe_z = np.minimum(logits, 20.0)
    softplus = np.where(logits > 20.0, logits, np.log1p(np.exp(safe_z)))
    return np.sqrt(softplus)


def run_aux_loss_free_demo(rng: np.random.Generator) -> None:
    num_experts, n_groups, topk_groups, topk = 16, 4, 2, 4
    gamma, steps, batch_size = 0.003, 350, 1024
    popularity = np.array(
        [2.6, 2.4, -0.4, -0.5] * 2 + [1.8, -0.3, -0.5, -0.6] + [-0.4, -0.5, -0.5, -0.6],
        dtype=np.float64,
    )
    bias = np.zeros(num_experts, dtype=np.float64)
    ratios: list[float] = []
    max_weight_err = 0.0
    for _ in range(steps):
        logits = rng.normal(0.0, 0.45, size=(batch_size, num_experts)) + popularity[None, :]
        idx, weights, raw = grouped_topk_route(logits, bias, n_groups, topk_groups, topk)
        # Verify weights match unbiased raw scores exactly
        expected = np.take_along_axis(raw, idx, axis=-1)
        expected = expected / expected.sum(axis=-1, keepdims=True) * 2.5
        max_weight_err = max(max_weight_err, float(np.max(np.abs(weights - expected))))
        counts = np.bincount(idx.reshape(-1), minlength=num_experts).astype(np.float64)
        mean_c = counts.mean()
        ratios.append(float(counts.max() / mean_c))
        # Aux-Loss-Free rule: overloaded -> bias -= gamma, underloaded -> bias += gamma
        bias += gamma * np.sign(mean_c - counts)
    tail_ratio = float(np.mean(ratios[-20:]))
    msg_a = f"[Part A] Aux-Loss-Free (gamma={gamma}): step 0 max/mean={ratios[0]:.2f}x"
    print(f"{msg_a} -> final20 avg={tail_ratio:.2f}x (last={ratios[-1]:.2f}x) | weight_err={max_weight_err:.1e}")


def run_aligned_gemm_demo(rng: np.random.Generator) -> None:
    t_len, h_dim, inter, num_experts, topk, block_size = 6, 8, 12, 4, 2, 4
    x = rng.normal(size=(t_len, h_dim))
    w_gate = rng.normal(scale=0.3, size=(num_experts, h_dim, inter))
    w_up = rng.normal(scale=0.3, size=(num_experts, h_dim, inter))
    w_down = rng.normal(scale=0.3, size=(num_experts, inter, h_dim))
    idx, weights, _ = grouped_topk_route(rng.normal(size=(t_len, num_experts)), np.zeros(num_experts), 2, 2, topk, 1.0)

    dense_out = np.zeros_like(x)
    for t in range(t_len):
        for k in range(topk):
            e = int(idx[t, k])
            dense_out[t] += weights[t, k] * ((silu(x[t] @ w_gate[e]) * (x[t] @ w_up[e])) @ w_down[e])

    sorted_ids, block_experts, post_pad = moe_align_block_size(idx, num_experts, block_size)
    aligned_out = np.zeros_like(x)
    sentinel = idx.size
    for b_idx, eid in enumerate(block_experts):
        seg = sorted_ids[b_idx * block_size : (b_idx + 1) * block_size]
        valid = seg < sentinel
        tok_ids = np.where(valid, seg // topk, 0)
        slot_w = np.where(valid, weights.reshape(-1)[np.minimum(seg, sentinel - 1)], 0.0)
        hb = silu(x[tok_ids] @ w_gate[eid]) * (x[tok_ids] @ w_up[eid])
        np.add.at(aligned_out, tok_ids[valid], ((hb @ w_down[eid]) * slot_w[:, None])[valid])

    diff = float(np.max(np.abs(aligned_out - dense_out)))
    print(f"[Part B] AlignBlock: raw_slots={idx.size} -> padded_slots={post_pad} (blocks={len(block_experts)}) | max_diff={diff:.2e}")


def run_dsv4_check() -> None:
    aff = dsv4_affinity(np.array([-2.0, 0.0, 8.0, 20.0, 50.0]))
    s8 = float(sigmoid(np.array([8.0]))[0])
    sig_grad_8, v4_grad_8 = s8 * (1.0 - s8), float(s8 / (2.0 * aff[2]))
    assert np.isclose(aff[-1], np.sqrt(50.0)) and np.all(np.isfinite(aff))
    print(f"[Part C] dsv4_topk: aff(50)={aff[-1]:.4f} (no overflow) | grad@z=8: sigmoid={sig_grad_8:.2e} vs sqrt_softplus={v4_grad_8:.3f}")


if __name__ == "__main__":
    seed_rng = np.random.default_rng(42)
    run_aux_loss_free_demo(seed_rng)
    run_aligned_gemm_demo(seed_rng)
    run_dsv4_check()
    print("OK 10")
