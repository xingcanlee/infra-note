"""4-rank EP Dispatch/Combine exact check and discrete-event overlap simulator."""

import numpy as np


def silu(x: np.ndarray) -> np.ndarray:
    return x / (1.0 + np.exp(-x))


def expert_swiglu(x: np.ndarray, w_gate: np.ndarray, w_up: np.ndarray, w_down: np.ndarray) -> np.ndarray:
    return (silu(x @ w_gate) * (x @ w_up)) @ w_down


def run_ep_equivalence_check(rng: np.random.Generator) -> tuple[list[int], float]:
    """Verify 4-rank skewed Top-2 EP matches single-rank reference."""
    world, n_exp, hidden, inter = 4, 4, 8, 16
    x_ranks = rng.normal(size=(world, 1, hidden))
    w_gate = rng.normal(scale=0.3, size=(n_exp, hidden, inter))
    w_up = rng.normal(scale=0.3, size=(n_exp, hidden, inter))
    w_down = rng.normal(scale=0.3, size=(n_exp, inter, hidden))

    # Skewed Top-2 routing (t0..t3 on Rank 0..3): E1 is hot (4 tokens), E3 gets 0
    routes = [
        [(0, 0.7), (1, 0.3)],
        [(1, 0.6), (2, 0.4)],
        [(1, 0.8), (0, 0.2)],
        [(1, 0.5), (2, 0.5)],
    ]

    # Single-rank mathematical reference
    out_ref = np.zeros_like(x_ranks)
    for r in range(world):
        for exp_id, weight in routes[r]:
            out_ref[r, 0] += weight * expert_swiglu(
                x_ranks[r, 0], w_gate[exp_id], w_up[exp_id], w_down[exp_id]
            )

    # Distributed EP Step 1: Dispatch (AllToAllV ragged send/recv)
    inbox: list[list[tuple[int, float, np.ndarray]]] = [[] for _ in range(world)]
    for src in range(world):
        for exp_id, weight in routes[src]:
            dst = exp_id  # 1 local expert per rank
            inbox[dst].append((src, weight, x_ranks[src, 0].copy()))

    recv_counts = [len(inbox[r]) for r in range(world)]

    # Distributed EP Step 2: Local Grouped Expert GEMM
    partial_outbox: list[list[tuple[int, float, np.ndarray]]] = [[] for _ in range(world)]
    for dst in range(world):
        if recv_counts[dst] == 0:
            continue
        batch_x = np.stack([item[2] for item in inbox[dst]], axis=0)
        batch_y = expert_swiglu(batch_x, w_gate[dst], w_up[dst], w_down[dst])
        for idx, (src, weight, _) in enumerate(inbox[dst]):
            partial_outbox[src].append((dst, weight, batch_y[idx]))

    # Distributed EP Step 3: Combine (AllToAllV return + weighted sum)
    out_ep = np.zeros_like(x_ranks)
    for src in range(world):
        for _, weight, vec in partial_outbox[src]:
            out_ep[src, 0] += weight * vec

    max_diff = float(np.max(np.abs(out_ep - out_ref)))
    assert recv_counts == [2, 4, 2, 0], f"unexpected recv_counts={recv_counts}"
    assert max_diff < 1e-12, f"EP numerical mismatch: {max_diff}"
    return recv_counts, max_diff


def schedule_dag(ops: list[tuple[str, str, float, tuple[str, ...]]]) -> tuple[float, float]:
    """Simulate stream timeline: op = (name, stream, duration, deps)."""
    done_at: dict[str, float] = {}
    stream_free: dict[str, float] = {}
    compute_busy = 0.0
    for name, stream, dur, deps in ops:
        dep_ready = max((done_at[d] for d in deps), default=0.0)
        start = max(dep_ready, stream_free.get(stream, 0.0))
        end = start + dur
        done_at[name] = end
        stream_free[stream] = end
        if stream == "compute":
            compute_busy += dur
    total = max(done_at.values())
    util = 100.0 * compute_busy / total
    return total, util


def simulate_workload(name: str, attn: float, disp: float, moe: float, comb: float, sync_ovh: float) -> dict[str, tuple[float, float]]:
    # 1. Serial AllToAllV: every comm step injects host/barrier overhead & stalls compute
    serial_ops = [
        ("attn", "compute", attn, ()),
        ("disp", "compute", disp + sync_ovh, ("attn",)),
        ("moe", "compute", moe, ("disp",)),
        ("comb", "compute", comb + sync_ovh, ("moe",)),
    ]
    t_ser, _ = schedule_dag(serial_ops)
    ser_util = 100.0 * (attn + moe) / t_ser

    # 2. Ascend MC2 intra-kernel slice pipeline (4 slices overlap disp -> moe -> comb)
    slices = 4
    mc2_ops: list[tuple[str, str, float, tuple[str, ...]]] = [("attn", "compute", attn, ())]
    for s in range(slices):
        prev_d = ("attn",) if s == 0 else (f"d{s-1}",)
        mc2_ops.append((f"d{s}", "comm", disp / slices, prev_d))
        deps_m = (f"d{s}",) if s == 0 else (f"d{s}", f"m{s-1}")
        mc2_ops.append((f"m{s}", "compute", moe / slices, deps_m))
        deps_c = (f"m{s}",) if s == 0 else (f"m{s}", f"c{s-1}")
        mc2_ops.append((f"c{s}", "comm_out", comb / slices, deps_c))
    t_mc2, u_mc2 = schedule_dag(mc2_ops)

    # 3. 2-Microbatch DBO ping-pong (splits batch into A/B on compute & comm streams)
    dbo_ops = [
        ("a_attn", "compute", attn / 2, ()),
        ("a_disp", "comm", disp / 2, ("a_attn",)),
        ("b_attn", "compute", attn / 2, ("a_attn",)),
        ("b_disp", "comm", disp / 2, ("b_attn", "a_disp")),
        ("a_moe", "compute", moe / 2, ("a_disp", "b_attn")),
        ("a_comb", "comm", comb / 2, ("a_moe", "b_disp")),
        ("b_moe", "compute", moe / 2, ("b_disp", "a_moe")),
        ("b_comb", "comm", comb / 2, ("b_moe", "a_comb")),
    ]
    t_dbo, u_dbo = schedule_dag(dbo_ops)
    return {"serial": (t_ser, ser_util), "mc2": (t_mc2, u_mc2), "dbo": (t_dbo, u_dbo)}


def main() -> None:
    rng = np.random.default_rng(42)
    recv_counts, max_diff = run_ep_equivalence_check(rng)
    print(f"EP 4-rank Top-2 recv_counts={recv_counts}, max_diff={max_diff:.2e}")

    workloads = [
        ("Prefill (B=1024)", 2.20, 2.00, 2.40, 1.60, 0.25),
        ("Decode  (B=32)",   0.35, 0.55, 0.30, 0.55, 0.30),
    ]
    for label, attn, disp, moe, comb, ovh in workloads:
        res = simulate_workload(label, attn, disp, moe, comb, ovh)
        t_ser, u_ser = res["serial"]
        t_mc2, u_mc2 = res["mc2"]
        t_dbo, u_dbo = res["dbo"]
        assert t_mc2 < t_ser and t_dbo < t_ser
        assert u_mc2 > u_ser and u_dbo > u_ser
        print(
            f"{label}: Serial={t_ser:.2f}ms ({u_ser:.1f}%) | "
            f"MC2={t_mc2:.2f}ms ({u_mc2:.1f}%) | "
            f"DBO={t_dbo:.2f}ms ({u_dbo:.1f}%)"
        )
    print("OK 03")


if __name__ == "__main__":
    main()
