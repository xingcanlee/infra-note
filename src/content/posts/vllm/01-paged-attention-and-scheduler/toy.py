from collections import deque
from dataclasses import dataclass, field
import numpy as np


@dataclass
class Block:
    block_id: int
    ref_cnt: int = 0
    block_hash: int | None = None


class BlockPool:
    def __init__(self, num_blocks: int, B: int) -> None:
        self.B, self.blocks = B, [Block(i) for i in range(num_blocks)]
        self.free_q, self.cached = deque(range(num_blocks)), {}

    def lookup_prefix(self, tokens: list[int]) -> tuple[list[int], int]:
        hits, h = [], 0
        for i in range(0, (len(tokens) // self.B) * self.B, self.B):
            nh = hash((h, tuple(tokens[i : i + self.B])))
            bid = self.cached.get(nh)
            if bid is None:
                break
            b = self.blocks[bid]
            if b.ref_cnt == 0:
                self.free_q.remove(bid)
            b.ref_cnt += 1
            hits.append(bid)
            h = nh
        return hits, h

    def alloc_one(self) -> int:
        bid = self.free_q.popleft()
        b = self.blocks[bid]
        if b.block_hash is not None and self.cached.get(b.block_hash) == bid:
            del self.cached[b.block_hash]
        b.block_hash, b.ref_cnt = None, 1
        return bid

    def seal(self, bid: int, parent_h: int, chunk: tuple[int, ...]) -> int:
        h = hash((parent_h, chunk))
        self.blocks[bid].block_hash = h
        self.cached.setdefault(h, bid)
        return h

    def free(self, bids: list[int]) -> None:
        for bid in reversed(bids):
            b = self.blocks[bid]
            b.ref_cnt -= 1
            if b.ref_cnt == 0:
                (self.free_q.append if b.block_hash is not None else self.free_q.appendleft)(bid)


@dataclass
class Req:
    rid: str
    prompt: list[int]
    max_new: int
    arrival: int = 0
    computed: int = 0
    blocks: list[int] = field(default_factory=list)
    chain_h: int = 0


def run_sim(reqs: list[Req], num_blocks: int, B: int, budget: int, verbose: bool = True):
    pool, waiting, running = BlockPool(num_blocks, B), deque(), []
    pending = sorted(reqs, key=lambda r: r.arrival)
    step, preempts, hits_total, peak = 0, 0, 0, 0
    while pending or waiting or running:
        while pending and pending[0].arrival <= step:
            waiting.append(pending.pop(0))
        left, next_run, events, idx, preempted = budget, [], [], 0, False
        while idx < len(running) and left > 0:
            r = running[idx]
            is_pre = r.computed < len(r.prompt)
            chunk = min(len(r.prompt) - r.computed, left) if is_pre else 1
            need = (r.computed + chunk + B - 1) // B - len(r.blocks)
            while len(pool.free_q) < need:
                v = running.pop() if len(running) - 1 > idx else running.pop(idx)
                pool.free(v.blocks)
                v.blocks, v.computed, v.chain_h = [], 0, 0
                waiting.appendleft(v)
                preempts, preempted = preempts + 1, True
                events.append(f"PREEMPT({v.rid})")
                if v is r:
                    idx, need = idx - 1, -1
                    break
            if need >= 0:
                r.blocks.extend(pool.alloc_one() for _ in range(need))
                prev_f, r.computed = r.computed // B, r.computed + chunk
                for bi in range(prev_f, min(r.computed, len(r.prompt)) // B):
                    r.chain_h = pool.seal(r.blocks[bi], r.chain_h, tuple(r.prompt[bi * B : (bi + 1) * B]))
                left -= chunk
                if r.computed >= len(r.prompt) + r.max_new:
                    pool.free(r.blocks)
                    r.blocks = []
                    events.append(f"DONE({r.rid})")
                else:
                    next_run.append(r)
                    if is_pre or need > 0:
                        events.append(f"{r.rid}+{chunk}(c={r.computed})")
            idx += 1
        next_run.extend(running[idx:])
        while waiting and left > 0 and idx == len(running) and not preempted:
            r = waiting[0]
            hits, h = pool.lookup_prefix(r.prompt[:-1])
            hit_t = len(hits) * B
            chunk = min(len(r.prompt) - hit_t, left)
            need = (hit_t + chunk + B - 1) // B - len(hits)
            if len(pool.free_q) < need:
                pool.free(hits)
                break
            waiting.popleft()
            hits_total += len(hits)
            r.blocks = hits + [pool.alloc_one() for _ in range(need)]
            r.chain_h, r.computed = h, hit_t + chunk
            for bi in range(len(hits), r.computed // B):
                r.chain_h = pool.seal(r.blocks[bi], r.chain_h, tuple(r.prompt[bi * B : (bi + 1) * B]))
            left -= chunk
            next_run.append(r)
            events.append(f"{r.rid}:hit={hit_t}+new={chunk}")
        running = next_run
        live = sum(1 for b in pool.blocks if b.ref_cnt > 0)
        peak = max(peak, live)
        if verbose and events:
            bt = {r.rid: r.blocks[:] for r in running}
            print(f"s={step:2d} | {','.join(events):24s} | live={live:2d}/{num_blocks} | b0_ref={pool.blocks[0].ref_cnt} | bt={bt}")
        step += 1
    return step, preempts, hits_total, peak


def main() -> None:
    sys_p = [101, 102, 103, 104, 105, 106]
    trace = [Req("A", sys_p + [201, 202], 29, 0), Req("B", sys_p + [301, 302, 303, 304], 27, 1)]
    print("=== Trace: B=4, 16 blocks (64 slots), budget=6/step ===")
    steps, pre, hits, peak = run_sim(trace, 16, 4, 6, verbose=True)
    print(f"Trace: steps={steps}, hit_blks={hits}, preempts={pre}, peak_live={peak}/16")
    rng = np.random.default_rng(42)
    prompts, outputs = rng.integers(10, 48, size=24), rng.integers(8, 36, size=24)
    reqs = [Req(f"R{i}", sys_p + rng.integers(500, 999, int(prompts[i]) - 6).tolist(), int(outputs[i]), i // 4) for i in range(24)]
    _, rp, rh, rpeak = run_sim(reqs, 100, 4, 32, verbose=False)
    print(f"Batch(24 reqs, 100 blks): naive_util={int(np.sum(prompts + outputs)) / (24 * 256):.1%} vs paged_peak={rpeak}/100 ({rpeak*4} slots, hits={rh}, preempts={rp})")
    print("OK 01")


if __name__ == "__main__":
    main()
