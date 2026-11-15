"""Chapter 01 Toy: 4-rank collective ops + alpha-beta crossover model."""

import numpy as np


def verify_collectives() -> None:
    """Verify Broadcast/Scatter/Gather/ReduceScatter/AllGather/AllReduce/AlltoAll."""
    x = np.array(
        [[1, 2, 0, 4], [3, 1, 2, 0], [0, 4, 1, 2], [2, 1, 3, 2]],
        dtype=np.int64,
    )
    p = x.shape[0]

    # Broadcast from rank 0 & Scatter rank 0 chunks [1, 2, 0, 4] -> 1 scalar/rank
    bcast = np.broadcast_to(x[0], (p, p))
    scattered = x[0].copy()  # rank i receives x[0, i]
    gathered = scattered.copy()  # rank 0 gathers scalars back into [1, 2, 0, 4]
    assert np.array_equal(bcast[3], x[0]) and np.array_equal(gathered, x[0])

    # Ring ReduceScatter: shard k starts at rank (k+1)%P, arrives at rank k after P-1 hops
    rs_buf = x.copy()
    for step in range(p - 1):
        prev = rs_buf.copy()
        for r in range(p):
            send_idx = (r - 1 - step) % p
            nxt = (r + 1) % p
            rs_buf[nxt, send_idx] += prev[r, send_idx]
    rs_shards = np.array([rs_buf[r, r] for r in range(p)], dtype=np.int64)
    assert np.array_equal(rs_shards, x.sum(axis=0))
    assert rs_shards.sum() == x.sum()

    ag_ring = np.zeros_like(x)
    for r in range(p):
        ag_ring[r, r] = rs_shards[r]
    for step in range(p - 1):
        prev = ag_ring.copy()
        for r in range(p):
            idx = (r - step) % p
            nxt = (r + 1) % p
            ag_ring[nxt, idx] = prev[r, idx]

    expected = np.broadcast_to(x.sum(axis=0), x.shape)
    assert np.array_equal(ag_ring, expected)

    # All-to-All: rank r sends element j to rank j
    a2a = x.T.copy()
    assert a2a.sum() == x.sum() and a2a[2, 1] == x[1, 2]

    print("=== 4-Rank Collectives Walkthrough ===")
    print(f"Input:\n{x}")
    print(f"Broadcast(src=0) row 3: {bcast[3].tolist()}")
    print(f"Scatter->Gather(src=0): {gathered.tolist()}")
    print(f"ReduceScatter diagonal shards: {rs_shards.tolist()}")
    print(f"AllGather -> AllReduce row 0:  {ag_ring[0].tolist()}")
    print(f"All-to-All rank 0..3:\n{a2a}\n")


def alpha_beta_sweep(p: int = 8) -> None:
    """Compare Ring, Naive Tree, Custom P2P, and INT8 QuantAR across sizes."""
    sizes = [4 * 1024, 64 * 1024, 256 * 1024, 4 * 1024**2, 32 * 1024**2, 256 * 1024**2]
    labels = ["4 KB", "64 KB", "256 KB", "4 MB", "32 MB", "256 MB"]
    # Illustrative analytical parameters (unidirectional link BW in bytes/s, us)
    regimes = [
        ("NVLink-like", 1.5e-6, 450e9, 2.0e-6, 300e9, None),
        ("Ascend-910B-like", 3.0e-6, 32e9, None, None, 500e-6),
        ("Ascend-910C-like(2.6x)", 2.5e-6, 83e9, None, None, 500e-6),
        ("RDMA-400G", 8.0e-6, 50e9, None, None, None),
    ]
    log_p = np.log2(p)
    for name, alpha, bw, alpha_p2p, bw_p2p, tau_q in regimes:
        print(f"=== {name} (P={p}, alpha={alpha*1e6:.1f}us, B={bw/1e9:.0f}GB/s) ===")
        for s, lbl in zip(sizes, labels):
            t_ring = 2 * (p - 1) * alpha + 2 * (p - 1) / p * (s / bw)
            t_tree = 2 * log_p * alpha + 2 * log_p * (s / bw)
            cols = [f"Ring={t_ring*1e6:8.1f}us", f"Tree={t_tree*1e6:8.1f}us"]
            if alpha_p2p is not None and bw_p2p is not None:
                t_p2p = alpha_p2p + (p - 1) * (s / bw_p2p)
                cols.append(f"P2P={t_p2p*1e6:8.1f}us")
            if tau_q is not None:
                # INT8 cuts payload to 0.5x + tiny fp32 amax scalar sync
                t_qar = tau_q + 2 * (p - 1) * alpha + 2 * (p - 1) / p * (0.5 * s / bw)
                delta = (t_qar - t_ring) / t_ring * 100.0
                cols.append(f"QAR={t_qar*1e6:8.1f}us({delta:+5.1f}%)")
            print(f"  {lbl:>6}: " + " | ".join(cols))

        # Exact Ring vs Naive Tree crossover: 2(P-1-log2 P)*alpha == 2*(log2 P - (P-1)/P)*S/B
        s_star = ((p - 1 - log_p) / (log_p - (p - 1) / p)) * alpha * bw
        print(f"  -> Ring-vs-Tree crossover S* = {s_star / 1024:.1f} KB")
        assert (2 * log_p * alpha + 2 * log_p * (4096 / bw)) < (
            2 * (p - 1) * alpha + 2 * (p - 1) / p * (4096 / bw)
        )
        assert (2 * (p - 1) * alpha + 2 * (p - 1) / p * (256 * 1024**2 / bw)) < (
            2 * log_p * alpha + 2 * log_p * (256 * 1024**2 / bw)
        )
        print()


if __name__ == "__main__":
    verify_collectives()
    alpha_beta_sweep()
    print("OK 01")
