import numpy as np


def rms_norm(x: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    return x / np.sqrt(np.mean(x * x, axis=-1, keepdims=True) + eps)


def sinkhorn_knopp(logits: np.ndarray, iters: int = 20) -> np.ndarray:
    m = np.exp(logits - logits.max(axis=(-2, -1), keepdims=True))
    for _ in range(iters):
        m /= m.sum(axis=-1, keepdims=True) + 1e-12
        m /= m.sum(axis=-2, keepdims=True) + 1e-12
    return m


def _mhc_mats(rng: np.random.Generator, b: int, n_hc: int, zero_gates: bool):
    if zero_gates:
        res = np.broadcast_to(np.eye(n_hc), (b, n_hc, n_hc)).copy()
        pre = np.tile([1.0, 0.0, 0.0, 0.0], (b, 1))
        post = np.zeros((b, n_hc))
    else:
        res = sinkhorn_knopp(rng.normal(0, 0.8, (b, n_hc, n_hc)), 20)
        pre = np.full((b, n_hc), 1.0 / n_hc)
        post = np.full((b, n_hc), 0.15)
    return res, pre, post


def run_v41_block(x: np.ndarray, rng: np.random.Generator, zero_gates: bool = False, verbose: bool = True) -> np.ndarray:
    b, h_dim = x.shape
    n_hc, d_latent, n_experts, top_k = 4, 8, 4, 2
    streams = np.repeat(x[:, None, :], n_hc, axis=1)  # hc_expand: [B, H] -> [B, 4, H]
    if verbose:
        print(f"  input x:           {x.shape}")
        print(f"  after hc_expand:   {streams.shape}")

    # 1. mhc_pre -> Latent Attention -> mhc_post
    res_a, pre_a, post_a = _mhc_mats(rng, b, n_hc, zero_gates)
    attn_in = np.einsum("bn,bnh->bh", pre_a, streams)
    q, c_kv = attn_in @ rng.normal(0, 0.2, (h_dim, d_latent)), attn_in @ rng.normal(0, 0.2, (h_dim, d_latent))
    scores = (q @ c_kv.T) / np.sqrt(d_latent)
    w = np.exp(scores - scores.max(axis=-1, keepdims=True))
    attn_out = ((w / w.sum(axis=-1, keepdims=True)) @ c_kv) @ rng.normal(0, 0.2, (d_latent, h_dim))
    streams = np.einsum("bnm,bmh->bnh", res_a, streams) + np.einsum("bn,bh->bnh", post_a, attn_out)
    if verbose:
        print(f"  after mhc_pre:     {attn_in.shape} -> latent_attn: {attn_out.shape} -> mhc_post: {streams.shape}")

    # 2. Engram conditional memory (4-stream context-gated injection)
    eng_table = rng.normal(0, 0.3, (16, h_dim))
    rows = eng_table[np.arange(b) % 16]
    eng_k, eng_v = rows @ rng.normal(0, 0.2, (h_dim, h_dim)), rows @ rng.normal(0, 0.2, (h_dim, h_dim))
    gate_logits = np.sum(rms_norm(streams.mean(axis=1)) * rms_norm(eng_k), axis=-1, keepdims=True) / np.sqrt(h_dim)
    gate = np.zeros_like(gate_logits) if zero_gates else 1.0 / (1.0 + np.exp(-gate_logits))
    streams = streams + gate[:, None, :] * eng_v[:, None, :]
    if verbose:
        print(f"  after engram:      {streams.shape}")

    # 3. mhc_pre -> Top-2 MoE (routed + shared expert) -> mhc_post -> hc_contract
    res_f, pre_f, post_f = _mhc_mats(rng, b, n_hc, zero_gates)
    ffn_in = np.einsum("bn,bnh->bh", pre_f, streams)
    r_logits = ffn_in @ rng.normal(0, 0.25, (h_dim, n_experts))
    probs = np.exp(r_logits - r_logits.max(axis=-1, keepdims=True))
    probs /= probs.sum(axis=-1, keepdims=True)
    experts = rng.normal(0, 0.15, (n_experts, h_dim, h_dim))
    moe_out = ffn_in @ rng.normal(0, 0.15, (h_dim, h_dim))
    top_idx = np.argsort(-probs, axis=-1)[:, :top_k]
    for bi in range(b):
        wt = probs[bi, top_idx[bi]]
        wt /= wt.sum()
        for j, eid in enumerate(top_idx[bi]):
            moe_out[bi] += wt[j] * (ffn_in[bi] @ experts[eid])

    streams = np.einsum("bnm,bmh->bnh", res_f, streams) + np.einsum("bn,bh->bnh", post_f, moe_out)
    final_pre = np.tile([1.0, 0.0, 0.0, 0.0], (b, 1)) if zero_gates else np.full((b, n_hc), 1.0 / n_hc)
    out = np.einsum("bn,bnh->bh", final_pre, streams)
    if verbose:
        print(f"  after moe+post:    {streams.shape} -> hc_contract: {out.shape}")
    return out


def simulate_dbo_overlap(num_layers: int = 4) -> None:
    attn_f, disp_f, moe_f, comb_f = 0.80, 1.10, 1.20, 1.00
    t_serial = num_layers * (attn_f + disp_f + moe_f + comb_f)
    a_u, d_u, m_u, c_u = attn_f * 0.52, disp_f * 0.55, moe_f * 0.52, comb_f * 0.55
    comp_free = comm_free = comp_busy = comm_busy = 0.0
    comp_iv, comm_iv = [], []

    def step(stream: str, dur: float, ready: float) -> float:
        nonlocal comp_free, comm_free, comp_busy, comm_busy
        if stream == "comp":
            s = max(comp_free, ready)
            comp_free = s + dur
            comp_busy += dur
            comp_iv.append((s, comp_free))
            return comp_free
        s = max(comm_free, ready)
        comm_free = s + dur
        comm_busy += dur
        comm_iv.append((s, comm_free))
        return comm_free

    u0, u1 = 0.0, 0.0
    for _ in range(num_layers):
        u0 = step("comp", a_u, u0)
        u0_d = step("comm", d_u, u0)
        u1 = step("comp", a_u, u1)
        u1_d = step("comm", d_u, u1)
        u0 = step("comp", m_u, max(u0_d, comp_free))
        u0_c = step("comm", c_u, u0)
        u1 = step("comp", m_u, max(u1_d, comp_free))
        u1 = step("comm", c_u, u1)
        u0 = u0_c

    t_dbo = max(comp_free, comm_free)
    overlap = sum(max(0.0, min(ce, me) - max(cs, ms)) for cs, ce in comp_iv for ms, me in comm_iv)
    print(f"[DBO Simulation] layers={num_layers}, num_ubatches=2")
    print(f"  serial={t_serial:.2f} ms, DBO={t_dbo:.2f} ms, speedup={t_serial / t_dbo:.2f}x")
    print(f"  compute_busy={comp_busy:.2f} ms, comm_busy={comm_busy:.2f} ms, overlapped={overlap:.2f} ms ({100.0 * overlap / t_dbo:.1f}%)")


if __name__ == "__main__":
    rng = np.random.default_rng(42)
    x = rng.normal(0.0, 1.0, (2, 16))
    print("[V4.1 Block Forward Shapes]")
    y = run_v41_block(x, rng, zero_gates=False, verbose=True)
    id_err = float(np.max(np.abs(run_v41_block(x, rng, zero_gates=True, verbose=False) - x)))
    assert id_err < 1e-12, f"Identity violation: {id_err}"
    print(f"  zero-gate identity max_abs_err = {id_err:.2e}, active_block_norm = {np.linalg.norm(y):.3f}")
    simulate_dbo_overlap(num_layers=4)
    print("OK 14")
