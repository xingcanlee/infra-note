from dataclasses import dataclass
import numpy as np


@dataclass
class SimResult:
    name: str
    total_us: float
    device_busy_us: float
    idle_gap_us: float

    @property
    def util(self) -> float:
        return self.device_busy_us / self.total_us


def simulate_workload(
    op_cpu: np.ndarray,
    op_dev: np.ndarray,
    steps: int,
    sched_us: float,
    async_sched: bool,
    sync_op_idx: int | None = None,
    sync_d2h_us: float = 15.0,
    graph_launch_us: float | None = None,
) -> SimResult:
    cpu_t, dev_t, busy = 0.0, 0.0, 0.0
    next_ready = 0.0
    n_ops = op_cpu.shape[1]
    for s in range(steps):
        if async_sched:
            # Async scheduling prepares step s while device finishes earlier work
            cpu_t = max(cpu_t, next_ready) + sched_us
        else:
            # Synchronous scheduling waits for previous device completion first
            cpu_t = max(cpu_t, dev_t) + sched_us

        step_dev_total = float(op_dev[s].sum())
        busy += step_dev_total
        if graph_launch_us is not None:
            launch_done = cpu_t + graph_launch_us
            dev_t = max(dev_t, launch_done) + step_dev_total
            cpu_t = launch_done
            next_ready = cpu_t
        else:
            for k in range(n_ops):
                cpu_t += float(op_cpu[s, k])
                dev_t = max(dev_t, cpu_t) + float(op_dev[s, k])
                if sync_op_idx is not None and k == sync_op_idx:
                    # .item() / .cpu() drains device stream + adds D2H latency
                    cpu_t = dev_t + sync_d2h_us
            next_ready = cpu_t if async_sched else dev_t
            if not async_sched:
                cpu_t = dev_t + sync_d2h_us
    total_us = max(cpu_t, dev_t)
    return SimResult("", total_us, busy, total_us - busy)


def main() -> None:
    print("=== Worked example: 12-op decode mini-layer (CPU=20us/op, GPU=8us/op) ===")
    cpu_12 = np.full((1, 12), 20.0)
    dev_12 = np.full((1, 12), 8.0)
    r_wall = simulate_workload(cpu_12, dev_12, 1, 0.0, True)
    r_sync = simulate_workload(cpu_12, dev_12, 1, 0.0, True, sync_op_idx=5, sync_d2h_us=12.0)
    r_graph = simulate_workload(cpu_12, dev_12, 1, 0.0, True, graph_launch_us=18.0)
    print(f"1) Eager Launch Wall (cpu=20, dev=8): busy={r_wall.device_busy_us:.0f}us total={r_wall.total_us:.0f}us util={r_wall.util:.1%}")
    print(f"2) With mid-step .item() sync@op5:    busy={r_sync.device_busy_us:.0f}us total={r_sync.total_us:.0f}us util={r_sync.util:.1%}")
    print(f"3) Single Graph Replay (launch=18us): busy={r_graph.device_busy_us:.0f}us total={r_graph.total_us:.0f}us util={r_graph.util:.1%}")

    r_ahead = simulate_workload(np.full((1, 12), 10.0), np.full((1, 12), 18.0), 1, 0.0, True)
    r_drain = simulate_workload(np.full((1, 12), 10.0), np.full((1, 12), 18.0), 1, 0.0, True, sync_op_idx=5, sync_d2h_us=12.0)
    print(f"4) Ahead queue (cpu=10, dev=18): clean={r_ahead.total_us:.0f}us ({r_ahead.util:.1%}) vs .item()_drain={r_drain.total_us:.0f}us ({r_drain.util:.1%})")

    rng = np.random.default_rng(42)
    steps, n_ops = 8, 320
    op_cpu = rng.uniform(16.0, 24.0, size=(steps, n_ops))
    op_dev = rng.uniform(6.0, 10.0, size=(steps, n_ops))
    sched_us = 450.0

    configs = [
        ("SyncSched + Eager", False, None, None),
        ("SyncSched + Eager + .item()", False, n_ops // 2, None),
        ("AsyncSched + Eager", True, None, None),
        ("SyncSched + GraphReplay", False, None, 45.0),
        ("AsyncSched + GraphReplay", True, None, 45.0),
    ]
    print("\n=== 8-step x 320-op decode serving simulation ===")
    results = []
    for label, a_sched, s_idx, g_us in configs:
        res = simulate_workload(op_cpu, op_dev, steps, sched_us, a_sched, sync_op_idx=s_idx, graph_launch_us=g_us)
        res.name = label
        results.append(res)
        print(f"{res.name:28s} | total={res.total_us:8.1f}us | busy={res.device_busy_us:8.1f}us | idle={res.idle_gap_us:8.1f}us | util={res.util:5.1%}")
    print(f"Speedup vs baseline: Async+Eager={results[0].total_us/results[2].total_us:.2f}x, Sync+Graph={results[0].total_us/results[3].total_us:.2f}x, Async+Graph={results[0].total_us/results[4].total_us:.2f}x")
    print("OK 02")


if __name__ == "__main__":
    main()
