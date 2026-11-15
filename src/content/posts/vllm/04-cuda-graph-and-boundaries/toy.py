from dataclasses import dataclass
import numpy as np

PAD_SLOT_ID = -1


@dataclass
class GpuBuf:
    name: str
    addr: int
    data: np.ndarray


class PoolAllocator:
    def __init__(self, base: int = 0x7F00_0000) -> None:
        self.next_addr = base
        self.pool_peak: dict[str, int] = {}

    def alloc_static(self, name: str, shape: tuple[int, ...], dtype) -> GpuBuf:
        buf = GpuBuf(name=name, addr=self.next_addr, data=np.zeros(shape, dtype=dtype))
        nbytes = int(buf.data.nbytes)
        self.next_addr += ((nbytes + 255) // 256) * 256
        return buf

    def capture_workspace(self, pool_id: str, nbytes: int) -> None:
        self.pool_peak[pool_id] = max(self.pool_peak.get(pool_id, 0), nbytes)


class SimCudaGraph:
    def __init__(self) -> None:
        self.captured_sig: dict[str, tuple[int, tuple[int, ...]]] = {}
        self.kv_writes: list[int] = []

    def capture(
        self,
        inputs: list[GpuBuf],
        host_sync: bool = False,
        forked_streams: set[str] | None = None,
        joined_streams: set[str] | None = None,
    ) -> str:
        if host_sync:
            return "ERR[HOST_SYNC_STALL]: .item()/cpu() forbidden during stream capture"
        unjoined = (forked_streams or set()) - (joined_streams or set())
        if unjoined:
            return f"ERR[UNJOINED_FORK_STREAM]: stream {sorted(unjoined)} not joined before capture_end"
        self.captured_sig = {b.name: (b.addr, b.data.shape) for b in inputs}
        return "CAPTURED"

    def replay(
        self,
        inputs: list[GpuBuf],
        kv_cache: np.ndarray,
        rng: np.random.Generator,
    ) -> str:
        for b in inputs:
            exp_addr, exp_shape = self.captured_sig[b.name]
            if b.addr != exp_addr:
                return f"ERR[POINTER_DRIFT]: {b.name} addr {hex(b.addr)} != frozen {hex(exp_addr)}"
            if b.data.shape != exp_shape:
                return f"ERR[SHAPE_MISMATCH]: {b.name} shape {b.data.shape} != captured {exp_shape}"
        by_name = {b.name: b.data for b in inputs}
        slots, is_pad = by_name["slot_mapping"], by_name["is_padding"]
        hidden = rng.standard_normal((slots.shape[0], kv_cache.shape[1]), dtype=np.float32)
        hidden[is_pad] = 0.0
        for row, slot in enumerate(slots):
            if slot != PAD_SLOT_ID:
                kv_cache[slot] = hidden[row]
        return "REPLAY_OK"


def main() -> None:
    rng = np.random.default_rng(42)
    alloc = PoolAllocator()
    B_cap, B_real, D = 4, 3, 8
    kv_cache = np.zeros((16, D), dtype=np.float32)

    bufs = [
        alloc.alloc_static("input_ids", (B_cap,), np.int32),
        alloc.alloc_static("slot_mapping", (B_cap,), np.int32),
        alloc.alloc_static("is_padding", (B_cap,), np.bool_),
    ]
    g = SimCudaGraph()
    cap_status = g.capture(bufs, forked_streams={"mhc"}, joined_streams={"mhc"})
    print(f"Capture (B_cap={B_cap}): {cap_status} @ {[hex(b.addr) for b in bufs]}")

    # Replay B_real=3 inside B_cap=4 via in-place .copy_() equivalent & PAD_SLOT_ID=-1
    bufs[0].data[:B_real] = np.array([101, 202, 303], dtype=np.int32)
    bufs[0].data[B_real:] = 999  # stale junk in padded tail
    bufs[1].data[:B_real] = np.array([2, 5, 9], dtype=np.int32)
    bufs[1].data[B_real:] = PAD_SLOT_ID
    bufs[2].data[:B_real] = False
    bufs[2].data[B_real:] = True
    kv_before = kv_cache.copy()
    rep_status = g.replay(bufs, kv_cache, rng)
    touched = np.where(np.any(kv_cache != kv_before, axis=1))[0].tolist()
    print(f"Replay  (B_real={B_real}): {rep_status}, updated_kv_slots={touched}")
    assert rep_status == "REPLAY_OK" and touched == [2, 5, 9]

    # Diagnose all 4 hard boundary violations
    drift_bufs = [alloc.alloc_static("input_ids", (B_cap,), np.int32), bufs[1], bufs[2]]
    shape_bufs = [GpuBuf("input_ids", bufs[0].addr, np.zeros((B_real,), dtype=np.int32)), bufs[1], bufs[2]]
    diag = [
        g.replay(drift_bufs, kv_cache, rng),
        g.replay(shape_bufs, kv_cache, rng),
        SimCudaGraph().capture(bufs, host_sync=True),
        SimCudaGraph().capture(bufs, forked_streams={"offloader"}, joined_streams=set()),
    ]
    for msg in diag:
        print(" ", msg)
        assert msg.startswith("ERR[")

    # Compare isolated pool vs global_graph_pool sharing across capture sizes
    capture_sizes = (1, 2, 4, 8, 16, 32)
    iso_total = 0
    for s in capture_sizes:
        ws_bytes = s * 4096 * 4096 * 2  # analytical workspace per size
        iso_total += ws_bytes
        alloc.capture_workspace("global_graph_pool", ws_bytes)
    shared = alloc.pool_peak["global_graph_pool"]
    saved_pct = (1.0 - shared / iso_total) * 100.0
    print(f"Pool memory: isolated={iso_total/1e6:.1f} MB vs shared={shared/1e6:.1f} MB (saved {saved_pct:.1f}%)")
    assert shared < iso_total and saved_pct > 45.0
    print("OK 04")


if __name__ == "__main__":
    main()
