import numpy as np


def run_single_step_rejection_check(rng: np.random.Generator, n_trials: int = 10_000) -> None:
    vocab = ["A", "B", "C"]
    p = np.array([0.50, 0.20, 0.30])
    q = np.array([0.40, 0.45, 0.15])
    residual = np.maximum(0.0, p - q)
    residual /= residual.sum()

    counts = np.zeros(len(vocab), dtype=np.int64)
    accepted = 0
    for _ in range(n_trials):
        x = int(rng.choice(len(vocab), p=q))
        if rng.random() <= min(1.0, p[x] / q[x]):
            counts[x] += 1
            accepted += 1
        else:
            res = int(rng.choice(len(vocab), p=residual))
            counts[res] += 1

    emp = counts / n_trials
    tv_diff = 0.5 * float(np.abs(emp - p).sum())
    max_abs = float(np.abs(emp - p).max())
    assert tv_diff < 0.015, f"TV diff too high: {tv_diff:.4f}"
    print(f"[Rejection Check] trials={n_trials}, accept_rate={accepted / n_trials:.4f} (theory=0.7500)")
    print(f"  target p  = {np.round(p, 4).tolist()}")
    print(f"  empiric   = {np.round(emp, 4).tolist()}")
    print(f"  residual  = {np.round(residual, 4).tolist()}  TV={tv_diff:.5f}  max_diff={max_abs:.5f}")


def run_multistep_bonus_check(rng: np.random.Generator, gamma: int = 4, n_rounds: int = 4_000) -> None:
    alpha = 0.75
    p_step = np.array([0.50, 0.20, 0.30])
    q_step = np.array([0.40, 0.45, 0.15])
    residual = np.maximum(0.0, p_step - q_step)
    residual /= residual.sum()

    total_emitted = 0
    bonus_hits = 0
    for _ in range(n_rounds):
        accepted_prefix = 0
        for _ in range(gamma):
            x = int(rng.choice(3, p=q_step))
            if rng.random() <= min(1.0, p_step[x] / q_step[x]):
                accepted_prefix += 1
            else:
                _ = int(rng.choice(3, p=residual))  # corrected token emitted
                total_emitted += accepted_prefix + 1
                break
        else:
            _ = int(rng.choice(3, p=p_step))  # (gamma+1)-th bonus token
            total_emitted += gamma + 1
            bonus_hits += 1

    mean_tokens = total_emitted / n_rounds
    theory_tokens = (1.0 - alpha ** (gamma + 1)) / (1.0 - alpha)
    print(
        f"[Bonus (K+1) Check] gamma={gamma}, bonus_rate={bonus_hits / n_rounds:.4f} "
        f"(theory={alpha**gamma:.4f}), mean_tokens={mean_tokens:.3f} (theory={theory_tokens:.3f})"
    )


def run_roofline_analysis() -> None:
    active_bytes = 16e9   # 16B active weights in FP8/INT8-like ~1B/param -> 16 GB/step
    bw_bytes_s = 3.35e12  # 3.35 TB/s HBM
    peak_flops = 1.98e15  # 1980 TFLOPS FP8
    ridge_ai = peak_flops / bw_bytes_s  # ~591 FLOP/B

    print(f"[Roofline] HBM=3.35 TB/s, FP8=1980 TFLOPS, ridge_AI={ridge_ai:.1f} FLOP/B")
    for m_verify in (1, 5, 16, 400):
        flops = 2.0 * active_bytes * m_verify
        ai = flops / active_bytes
        t_mem_ms = (active_bytes / bw_bytes_s) * 1e3
        t_cmp_ms = (flops / peak_flops) * 1e3
        t_step_ms = max(t_mem_ms, t_cmp_ms)
        print(f"  verify M={m_verify:2d}: AI={ai:5.1f} FLOP/B, t_step={t_step_ms:.2f} ms (mem={t_mem_ms:.2f}, cmp={t_cmp_ms:.2f})")

    gamma = 5
    draft_cost_c = 0.06
    print(f"[Speedup vs alpha] gamma={gamma}, draft_cost_ratio c={draft_cost_c}")
    for alpha in (0.40, 0.60, 0.75, 0.85, 0.90):
        expected_tau = (1.0 - alpha ** (gamma + 1)) / (1.0 - alpha)
        verify_overhead = 1.02  # verify gamma+1 tokens nearly free in memory-bound zone
        speedup = expected_tau / (verify_overhead + gamma * draft_cost_c)
        print(f"  alpha={alpha:.2f} -> E[tokens]={expected_tau:.2f}, speedup={speedup:.2f}x")


if __name__ == "__main__":
    rng = np.random.default_rng(42)
    run_single_step_rejection_check(rng)
    run_multistep_bonus_check(rng)
    run_roofline_analysis()
    print("OK 13")
