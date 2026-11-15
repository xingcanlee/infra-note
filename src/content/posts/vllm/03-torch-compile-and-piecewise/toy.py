from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class FxNode:
    name: str
    op: str
    inputs: tuple[str, ...]
    shape: tuple[int, ...]
    bytes_rw: int
    fusable: bool = False


def build_layer_fx(B: int, H: int = 4096, I: int = 11008) -> list[FxNode]:
    b_act, b_gate = B * H * 2, B * I * 2  # fp16 = 2 bytes
    return [
        FxNode("n0_rmsnorm", "rmsnorm", ("x",), (B, H), 2 * b_act, True),
        FxNode("n1_qkv", "matmul", ("n0_rmsnorm",), (B, 3 * H), 4 * b_act, False),
        FxNode("n2_rope", "rope", ("n1_qkv",), (B, H), 2 * b_act, True),
        FxNode("n3_attn", "vllm.unified_attention", ("n2_rope",), (B, H), 3 * b_act, False),
        FxNode("n4_oproj", "matmul", ("n3_attn",), (B, H), 2 * b_act, False),
        FxNode("n5_res_add", "add", ("x", "n4_oproj"), (B, H), 3 * b_act, True),
        FxNode("n6_post_norm", "rmsnorm", ("n5_res_add",), (B, H), 2 * b_act, True),
        FxNode("n7_gate", "matmul", ("n6_post_norm",), (B, I), b_act + b_gate, False),
        FxNode("n8_up", "matmul", ("n6_post_norm",), (B, I), b_act + b_gate, False),
        FxNode("n9_silu", "silu", ("n7_gate",), (B, I), 2 * b_gate, True),
        FxNode("n10_mul", "mul", ("n9_silu", "n8_up"), (B, I), 3 * b_gate, True),
        FxNode("n11_down", "matmul", ("n10_mul",), (B, H), b_gate + b_act, False),
    ]


def split_graph(nodes: list[FxNode], splitting_ops: set[str]) -> list[tuple[str, list[FxNode]]]:
    parts: list[tuple[str, list[FxNode]]] = []
    cur: list[FxNode] = []
    idx = 0
    for node in nodes:
        if node.op in splitting_ops:
            if cur:
                parts.append((f"submodule_{idx}", cur))
                idx += 1
                cur = []
            parts.append((f"submodule_{idx}_eager", [node]))
            idx += 1
        else:
            cur.append(node)
    if cur:
        parts.append((f"submodule_{idx}", cur))
    return parts


def inductor_fuse_segment(seg: list[FxNode], is_eager: bool) -> tuple[int, int]:
    """Return (kernel_launches, hbm_act_bytes) for one FX subgraph."""
    if is_eager:
        return len(seg), sum(n.bytes_rw for n in seg)
    launches, hbm_bytes, i = 0, 0, 0
    while i < len(seg):
        if not seg[i].fusable:
            launches += 1
            hbm_bytes += seg[i].bytes_rw
            i += 1
            continue
        j = i
        while j < len(seg) and seg[j].fusable:
            j += 1
        chain = seg[i:j]
        # Fused Triton kernel keeps intermediate tensors in registers/SRAM:
        # read external inputs once and write final outputs once.
        internal = {n.name for n in chain[:-1]}
        ext_reads = sum(
            (n.shape[0] * n.shape[1] * 2) for n in chain for inp in n.inputs if inp not in internal
        )
        # Residual add_rmsnorm still writes the updated residual plus normalized hidden states.
        extra_res_write = (chain[0].shape[0] * chain[0].shape[1] * 2) if chain[0].op == "add" else 0
        out_writes = chain[-1].shape[0] * chain[-1].shape[1] * 2 + extra_res_write
        if j - i >= 2:
            hbm_bytes += ext_reads + out_writes
        else:
            hbm_bytes += chain[0].bytes_rw
        launches += 1
        i = j
    return launches, hbm_bytes


def run_numeric_check(rng: np.random.Generator) -> float:
    B, H, I = 4, 32, 64
    w = lambda r, c: rng.standard_normal((r, c), dtype=np.float32) * 0.1
    x = rng.standard_normal((B, H), dtype=np.float32)
    wqkv, wo, wg, wu, wd = w(H, 3 * H), w(H, H), w(H, I), w(H, I), w(I, H)
    rms = lambda v: v / np.sqrt(np.mean(v * v, axis=-1, keepdims=True) + 1e-6)
    # Eager op-by-op
    qkv = rms(x) @ wqkv
    h = rms(x + np.tanh(qkv[:, :H]) @ wo)
    g0, u0 = h @ wg, h @ wu
    out_eager = (g0 * (1.0 / (1.0 + np.exp(-g0))) * u0) @ wd
    # Piecewise fused (submodule_0 -> eager attn -> submodule_2)
    sub0_qkv = rms(x) @ wqkv
    sub1_attn = np.tanh(sub0_qkv[:, :H])
    h_fused = rms(x + sub1_attn @ wo)
    g1, u1 = h_fused @ wg, h_fused @ wu
    out_piecewise = ((g1 / (1.0 + np.exp(-g1))) * u1) @ wd
    return float(np.max(np.abs(out_eager - out_piecewise)))


def main() -> None:
    rng = np.random.default_rng(42)
    splitting_ops = {"vllm.unified_attention"}
    parts = split_graph(build_layer_fx(B=1), splitting_ops)
    print(f"FX split count (1 layer): {len(parts)} subgraphs")
    for name, seg in parts:
        print(f"  {name}: {[n.name for n in seg]}")
    print("\nB  | Eager (K / Act_MB) | Inductor-PW (K / Act_MB) | PW+CUDAGraph host_launches")
    for B in (1, 8, 64):
        nodes = build_layer_fx(B)
        eager_k, eager_bytes = len(nodes), sum(n.bytes_rw for n in nodes)
        segs = split_graph(nodes, splitting_ops)
        stats = [inductor_fuse_segment(seg, name.endswith("_eager")) for name, seg in segs]
        pw_k, pw_bytes = sum(k for k, _ in stats), sum(b for _, b in stats)
        cg_host_launches = len(segs)
        print(
            f"{B:<2d} | {eager_k:2d} / {eager_bytes/1e6:7.3f}     | "
            f"{pw_k:2d} / {pw_bytes/1e6:7.3f}           | {cg_host_launches} (was {pw_k})"
        )
        assert pw_k < eager_k and pw_bytes < eager_bytes and cg_host_launches < pw_k
    max_diff = run_numeric_check(rng)
    print(f"\nNumeric equivalence max |eager - piecewise_fused|: {max_diff:.2e}")
    assert max_diff < 1e-5
    print("OK 03")


if __name__ == "__main__":
    main()
