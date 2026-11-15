# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""07 Profiler 轨迹特征分类、五维故障诊断与 B=4->B=2 脏 Padding 尾部串扰复现。

uv run --with numpy python toy.py
"""
import numpy as np


def simulate_traces(rng):
    """Synthesize batch=8, 60-layer decode step profiles across 4 visual signatures."""
    scenarios = {
        "healthy_full": (0.10, 0.02, 0.0, 0.00),
        "launch_wall": (0.96, 0.72, 0.0, 0.00),
        "host_sync": (0.35, 0.12, 4.8, 0.00),
        "piecewise_mix": (0.48, 0.18, 0.0, 0.34),
    }
    traces = {}
    for name, (cpu, gap, stall, eager_attn) in scenarios.items():
        jitter = rng.normal(0.0, 0.01)
        base_kernel_ms = 3.2
        tpot_ms = base_kernel_ms * (1.0 + gap * 3.0 + eager_attn * 1.4) + stall + abs(jitter)
        traces[name] = {
            "cpu_busy": float(np.clip(cpu + jitter, 0.0, 1.0)),
            "gap_ratio": float(np.clip(gap, 0.0, 1.0)),
            "max_sync_ms": float(stall),
            "eager_attn_ratio": float(np.clip(eager_attn, 0.0, 1.0)),
            "tpot_ms": float(tpot_ms),
        }
    return traces


def classify_trace(t):
    """Classify a trace into one of the 4 unmistakable timeline signatures."""
    if t["max_sync_ms"] >= 1.5:
        return "HOST_SYNC_SAWTOOTH"
    if t["eager_attn_ratio"] >= 0.15:
        return "PIECEWISE_BUBBLE"
    if t["cpu_busy"] >= 0.80 and t["gap_ratio"] >= 0.40:
        return "LAUNCH_WALL_COMB"
    return "HEALTHY_FULL_GRAPH"


def repro_dirty_padding_bug(rng):
    """Reproduce B=4 -> B=2 static InputBuffers tail contamination and verify fix."""
    bucket, kv_blocks, dim = 4, 128, 8
    kv_pool = np.zeros((kv_blocks, dim), dtype=np.float64)
    static_slots = np.zeros((bucket,), dtype=np.int64)
    static_hidden = np.zeros((bucket, dim), dtype=np.float64)

    static_slots[:] = [100, 101, 102, 103]
    static_hidden[:] = rng.normal(2.0, 0.5, size=(bucket, dim))
    for i in range(bucket):
        kv_pool[static_slots[i]] = static_hidden[i]
    kv_oracle = kv_pool.copy()

    b_active = 2
    new_slots = np.array([104, 105], dtype=np.int64)
    new_hidden = rng.normal(-1.5, 0.4, size=(b_active, dim))

    kv_buggy = kv_oracle.copy()
    static_slots[:b_active] = new_slots
    static_hidden[:b_active] = new_hidden
    for i in range(bucket):
        if static_slots[i] >= 0:
            kv_buggy[static_slots[i]] += static_hidden[i]
    moe_reduce_buggy = np.sum(static_hidden, axis=0)

    pad_slot_id = -1
    kv_fixed = kv_oracle.copy()
    static_slots[b_active:] = pad_slot_id
    valid_mask = (np.arange(bucket) < b_active).astype(np.float64)[:, None]
    for i in range(bucket):
        if static_slots[i] >= 0:
            kv_fixed[static_slots[i]] += static_hidden[i]
    moe_reduce_fixed = np.sum(static_hidden * valid_mask, axis=0)

    kv_clean_ref = kv_oracle.copy()
    for i in range(b_active):
        kv_clean_ref[new_slots[i]] += new_hidden[i]
    moe_clean_ref = np.sum(new_hidden, axis=0)

    err_buggy = float(
        np.max(np.abs(kv_buggy - kv_clean_ref)) + np.max(np.abs(moe_reduce_buggy - moe_clean_ref))
    )
    err_fixed = float(
        np.max(np.abs(kv_fixed - kv_clean_ref)) + np.max(np.abs(moe_reduce_fixed - moe_clean_ref))
    )
    return err_buggy, err_fixed


def run_five_checks(state):
    """Run the 5 automated production health checks."""
    return {
        "1_no_silent_fallback": state["requested_mode"] == state["resolved_mode"] == "FULL",
        "2_dp_ranks_aligned": len(set(state["dp_rank_modes"])) == 1,
        "3_zero_host_sync_in_capture": state["host_sync_ops"] == 0,
        "4_pad_slot_masked": state["tail_slot_id"] == -1 and state["tail_masked"],
        "5_pool_order_and_handles_ok": state["piecewise_before_full"]
        and state["active_streams"] <= state["stream_limit"],
    }


def main():
    rng = np.random.default_rng(42)
    traces = simulate_traces(rng)
    print("== Trace Signatures (batch=8, L=60) ==")
    for name, tr in traces.items():
        sig = classify_trace(tr)
        print(
            f"{name:14s}: tpot={tr['tpot_ms']:.2f}ms cpu={tr['cpu_busy']:.2f} "
            f"gap={tr['gap_ratio']:.2f} sync={tr['max_sync_ms']:.1f}ms "
            f"eager_attn={tr['eager_attn_ratio']:.2f} -> {sig}"
        )

    err_buggy, err_fixed = repro_dirty_padding_bug(rng)
    print(f"== B=4 -> B=2 Dirty Padding Repro == buggy_err={err_buggy:.6f} fixed_err={err_fixed:.3e}")
    assert err_buggy > 1.0 and err_fixed < 1e-12

    faulty = {
        "requested_mode": "FULL", "resolved_mode": "NONE",
        "dp_rank_modes": ["FULL", "NONE"], "host_sync_ops": 1,
        "tail_slot_id": 102, "tail_masked": False,
        "piecewise_before_full": False, "active_streams": 2100, "stream_limit": 2048,
    }
    healthy = {
        "requested_mode": "FULL", "resolved_mode": "FULL",
        "dp_rank_modes": ["FULL", "FULL"], "host_sync_ops": 0,
        "tail_slot_id": -1, "tail_masked": True,
        "piecewise_before_full": True, "active_streams": 64, "stream_limit": 2048,
    }
    res_bad = run_five_checks(faulty)
    res_ok = run_five_checks(healthy)
    print("faulty_checks :", res_bad)
    print("healthy_checks:", res_ok)
    assert all(not v for v in res_bad.values())
    assert all(res_ok.values())
    print("OK 07")


if __name__ == "__main__":
    main()
