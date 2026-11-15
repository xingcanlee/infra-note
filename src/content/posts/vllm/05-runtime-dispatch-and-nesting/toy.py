# /// script
# dependencies = ["numpy"]
# ///
from dataclasses import dataclass
from enum import Enum, IntEnum
import numpy as np


class AttentionCGSupport(IntEnum):
    NEVER = 0
    UNIFORM_SINGLE_TOKEN_DECODE = 1
    UNIFORM_BATCH = 2
    ALWAYS = 3


class CUDAGraphMode(Enum):
    NONE = 0
    PIECEWISE = 1
    FULL = 2
    FULL_DECODE_ONLY = (FULL, NONE)
    FULL_AND_PIECEWISE = (FULL, PIECEWISE)

    def decode_mode(self):
        return self.value[0] if isinstance(self.value, tuple) else self.value

    def mixed_mode(self):
        return self.value[1] if isinstance(self.value, tuple) else self.value

    def dual_mode(self):
        return CUDAGraphMode(self.decode_mode()), CUDAGraphMode(self.mixed_mode())


def resolve_cudagraph_mode(req: CUDAGraphMode, cg_sup: AttentionCGSupport, q_len: int = 1, has_split: bool = True) -> CUDAGraphMode:
    dec, mix = req.dual_mode()
    if mix == CUDAGraphMode.FULL and cg_sup != AttentionCGSupport.ALWAYS:
        if cg_sup == AttentionCGSupport.NEVER:
            raise ValueError("FULL mixed graphs unavailable when AttentionCGSupport=NEVER")
        req = CUDAGraphMode.FULL_AND_PIECEWISE if has_split else CUDAGraphMode.FULL_DECODE_ONLY
    if req.decode_mode() == CUDAGraphMode.FULL.value:
        if cg_sup == AttentionCGSupport.NEVER or (q_len > 1 and cg_sup < AttentionCGSupport.UNIFORM_BATCH):
            req = CUDAGraphMode.PIECEWISE if has_split else CUDAGraphMode.NONE
    return req


@dataclass(frozen=True)
class BatchExecutionDescriptor:
    cg_mode: CUDAGraphMode
    num_tokens: int
    num_reqs: int | None
    uniform_token_count: int | None = None
    max_query_len: int | None = None
    num_active_loras: int = 0
    num_ubatches: int = 1

    def is_compatible(self, num_reqs: int, num_tokens: int, u: int | None, max_q: int | None, loras: int = 0, ubatches: int = 1) -> bool:
        return (
            (self.uniform_token_count is None or self.uniform_token_count == u)
            and (self.max_query_len is None or (max_q is not None and self.max_query_len >= max_q))
            and (self.num_reqs is None or self.num_reqs >= num_reqs)
            and self.num_tokens >= num_tokens and self.num_active_loras == loras and self.num_ubatches == ubatches
        )


class CudaGraphManager:
    def __init__(self, cg_mode: CUDAGraphMode, decode_sizes: list[int], prefill_sizes: list[int], q: int = 1, max_reqs: int = 8):
        self.cg_mode = cg_mode
        self._decode_descs: dict[tuple[int, int, int], list[BatchExecutionDescriptor]] = {}
        self._candidates: dict[tuple[int, int], list[BatchExecutionDescriptor]] = {}
        dec_mode, mix_mode = cg_mode.dual_mode()
        if dec_mode != CUDAGraphMode.NONE:
            table: list[BatchExecutionDescriptor] = []
            for n in sorted(decode_sizes):
                d = BatchExecutionDescriptor(dec_mode, n * q, n, uniform_token_count=q)
                table.extend([d] * (n + 1 - len(table)))
            self._decode_descs[(q, 0, 1)] = table
        if mix_mode != CUDAGraphMode.NONE:
            cur = 0
            for s in sorted(prefill_sizes):
                d = BatchExecutionDescriptor(mix_mode, s, min(s, max_reqs) if mix_mode == CUDAGraphMode.FULL else None)
                for tok in range(cur, s + 1):
                    self._candidates.setdefault((tok, 0), []).append(d)
                cur = s + 1

    def dispatch(self, num_reqs: int, num_tokens: int, uniform_token_count: int | None = None, max_query_len: int | None = None) -> BatchExecutionDescriptor:
        cands = self._candidates.get((num_tokens, 0), [])
        if uniform_token_count is not None:
            table = self._decode_descs.get((uniform_token_count, 0, 1), [])
            n = (num_tokens + uniform_token_count - 1) // uniform_token_count
            if n < len(table):
                cands = [table[n], *cands]
        for d in cands:
            if d.is_compatible(num_reqs, num_tokens, uniform_token_count, max_query_len):
                return d
        return BatchExecutionDescriptor(CUDAGraphMode.NONE, num_tokens, num_reqs)


def dispatch_cg_and_sync_dp(mgr: CudaGraphManager, ranks: list[tuple[int, int, int | None, int | None]]):
    dp = len(ranks)
    local_mats = []
    for r, (reqs, toks, u, max_q) in enumerate(ranks):
        d = mgr.dispatch(reqs, toks, u, max_q)
        mat = np.zeros((7, dp), dtype=np.int32)
        mat[:, r] = [toks, d.cg_mode.value, u or 0, max_q or -1, 0, reqs, 0]
        local_mats.append(mat)
    buf = sum(local_mats)  # cpu_all_reduce_(sum) gathers each rank's column onto all ranks
    u_arr, q_arr = buf[2], buf[3]
    synced_u = int(u_arr[0]) if (np.all(u_arr != 0) and np.all(u_arr == u_arr[0])) else None
    synced_q = int(q_arr.max()) if np.all(q_arr != -1) else None
    synced_mode = CUDAGraphMode(int(buf[1].min()))
    synced_toks = int(buf[0].max())
    if synced_mode == CUDAGraphMode.NONE:
        return [BatchExecutionDescriptor(CUDAGraphMode.NONE, synced_toks, reqs) for reqs, *_ in ranks]
    return [mgr.dispatch(reqs, synced_toks, synced_u, synced_q) for reqs, *_ in ranks]


def inner_runtime_mode(outer: BatchExecutionDescriptor) -> CUDAGraphMode:
    return CUDAGraphMode.NONE if outer.cg_mode in (CUDAGraphMode.FULL, CUDAGraphMode.NONE) else CUDAGraphMode.PIECEWISE


if __name__ == "__main__":
    print("Init:", {
        "FA3": resolve_cudagraph_mode(CUDAGraphMode.FULL, AttentionCGSupport.ALWAYS).name,
        "FlashMLA": resolve_cudagraph_mode(CUDAGraphMode.FULL, AttentionCGSupport.UNIFORM_BATCH).name,
        "FI+SpecDec": resolve_cudagraph_mode(CUDAGraphMode.FULL_AND_PIECEWISE, AttentionCGSupport.UNIFORM_SINGLE_TOKEN_DECODE, q_len=4).name,
    })
    mgr = CudaGraphManager(CUDAGraphMode.FULL_AND_PIECEWISE, [1, 2, 4, 8], [1, 2, 4, 8, 16, 24, 32])
    for name, inp in [("A decode(3)", (3, 3, 1, 1)), ("B mixed(19)", (4, 19, None, 16)), ("C huge(4096)", (4, 4096, None, 1024))]:
        d = mgr.dispatch(*inp)
        print(f"Step {name}: outer={d.cg_mode.name}, bucket_tokens={d.num_tokens}, inner={inner_runtime_mode(d).name}")
    dp_out = dispatch_cg_and_sync_dp(mgr, [(3, 3, 1, 1), (4, 19, None, 16)])
    print("Step D DP sync:", [(d.cg_mode.name, d.num_tokens, inner_runtime_mode(d).name) for d in dp_out])
    rng = np.random.default_rng(42)
    counts = {m.name: 0 for m in (CUDAGraphMode.FULL, CUDAGraphMode.PIECEWISE, CUDAGraphMode.NONE)}
    for _ in range(200):
        batch = []
        for _r in range(2):
            kind, reqs = int(rng.choice([0, 1, 2], p=[0.5, 0.35, 0.15])), int(rng.integers(1, 9))
            batch.append((reqs, reqs, 1, 1) if kind == 0 else ((reqs, int(rng.integers(reqs + 1, 33)), None, 16) if kind == 1 else (reqs, int(rng.integers(33, 65)), None, 32)))
        synced = dispatch_cg_and_sync_dp(mgr, batch)
        assert synced[0].cg_mode == synced[1].cg_mode and synced[0].num_tokens == synced[1].num_tokens
        if synced[0].cg_mode == CUDAGraphMode.FULL:
            assert inner_runtime_mode(synced[0]) == CUDAGraphMode.NONE
        counts[synced[0].cg_mode.name] += 1
    print("200-step DP dist:", counts)
    print("OK 05")
