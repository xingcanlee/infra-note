# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy"]
# ///
"""06 ACLGraph 捕获重放、UpdatableGraph 热更新与 ExternalEvent 跨流同步。

uv run --with numpy python toy.py
"""
import numpy as np


def fia_attention(q, k_cache, v_cache, seq_lens):
    """Simulate npu_fused_infer_attention_score reading host actual_seq_lengths."""
    bsz, dim = q.shape
    out = np.zeros((bsz, dim), dtype=np.float64)
    scale = 1.0 / np.sqrt(dim)
    for b in range(bsz):
        s_len = int(seq_lens[b])
        scores = (q[b] @ k_cache[b, :s_len].T) * scale
        scores -= np.max(scores)
        probs = np.exp(scores)
        probs /= np.sum(probs)
        out[b] = probs @ v_cache[b, :s_len]
    return out


class StreamState:
    def __init__(self, name):
        self.name = name
        self.events = {}

    def record(self, event_name, payload_step):
        self.events[event_name] = payload_step


class ACLGraphSim:
    """Minimal simulator for ACLGraph capture, UpdatableGraph update, and ExternalEvent."""

    def __init__(self, capture_seq_lens):
        self.captured_seq_lens = list(capture_seq_lens)
        self.patched_seq_lens = list(capture_seq_lens)
        self.eng_buffer = None
        self.committed_eng_step = -1

    def capture_warmup(self, q, k_cache, v_cache, eng_lookup):
        self.eng_buffer = eng_lookup.copy()
        self.committed_eng_step = 0
        return fia_attention(q, k_cache, v_cache, self.captured_seq_lens) + self.eng_buffer

    def replay(
        self,
        step,
        q,
        k_cache,
        v_cache,
        runtime_seq_lens,
        eng_lookup_next,
        use_updatable_graph=True,
        use_external_event=True,
    ):
        # 1. Host metadata patch on self.update_stream (graph_task_update_begin/end)
        if use_updatable_graph:
            self.patched_seq_lens = list(runtime_seq_lens)
            active_seq_lens = self.patched_seq_lens
        else:
            active_seq_lens = self.captured_seq_lens

        # 2. Auxiliary stream (_engram_prepare_stream) + ExternalEvent synchronization
        main_reads = self.eng_buffer.copy()  # Stale prior-step buffer before wait!
        aux_stream = StreamState("_engram_prepare_stream")
        staged_eng = eng_lookup_next.copy()
        aux_stream.record("engram_done", step)

        if use_external_event:
            if aux_stream.events.get("engram_done") != step:
                raise RuntimeError("ExternalEvent missing signal: cross-stream deadlock!")
            self.eng_buffer = staged_eng
            self.committed_eng_step = step
            main_reads = self.eng_buffer.copy()

        attn_out = fia_attention(q, k_cache, v_cache, active_seq_lens)
        return attn_out + main_reads, self.committed_eng_step == step


def main():
    rng = np.random.default_rng(42)
    bsz, max_kv, dim = 4, 64, 16
    seq_t0 = [17, 33, 45, 58]
    seq_t1 = [18, 34, 46, 59]

    k_cache = rng.normal(0.0, 0.5, size=(bsz, max_kv, dim))
    v_cache = rng.normal(0.0, 0.5, size=(bsz, max_kv, dim))
    q_t0 = rng.normal(0.0, 0.5, size=(bsz, dim))
    eng_t0 = rng.normal(0.0, 0.3, size=(bsz, dim))

    q_t1 = rng.normal(0.0, 0.5, size=(bsz, dim))
    for b, pos in enumerate(seq_t0):
        k_cache[b, pos] = q_t1[b] * 2.5
        v_cache[b, pos] = rng.normal(1.0, 0.2, size=(dim,))
    eng_t1 = rng.normal(0.5, 0.4, size=(bsz, dim))
    ref_t1 = fia_attention(q_t1, k_cache, v_cache, seq_t1) + eng_t1

    # Fresh captured graphs per case so step-1 state never leaks across assertions
    g_a = ACLGraphSim(seq_t0)
    g_a.capture_warmup(q_t0, k_cache, v_cache, eng_t0)
    out_no_upd, synced_a = g_a.replay(
        1, q_t1, k_cache, v_cache, seq_t1, eng_t1,
        use_updatable_graph=False, use_external_event=True,
    )
    err_no_upd = float(np.max(np.abs(out_no_upd - ref_t1)))

    g_b = ACLGraphSim(seq_t0)
    g_b.capture_warmup(q_t0, k_cache, v_cache, eng_t0)
    out_no_evt, synced_b = g_b.replay(
        1, q_t1, k_cache, v_cache, seq_t1, eng_t1,
        use_updatable_graph=True, use_external_event=False,
    )
    err_no_evt = float(np.max(np.abs(out_no_evt - ref_t1)))

    g_c = ACLGraphSim(seq_t0)
    g_c.capture_warmup(q_t0, k_cache, v_cache, eng_t0)
    out_full, synced_c = g_c.replay(
        1, q_t1, k_cache, v_cache, seq_t1, eng_t1,
        use_updatable_graph=True, use_external_event=True,
    )
    err_full = float(np.max(np.abs(out_full - ref_t1)))

    print(f"capture bucket={bsz} seq_t0={seq_t0} -> seq_t1={seq_t1}")
    print(f"no_updatable_graph: synced={synced_a} max_abs_diff={err_no_upd:.6f} (STALE seq_lens)")
    print(f"no_external_event : synced={synced_b} max_abs_diff={err_no_evt:.6f} (RACE stale eng)")
    print(f"full_aclgraph_path: synced={synced_c} max_abs_diff={err_full:.3e} (EXACT match)")

    assert err_no_upd > 0.05
    assert not synced_b and err_no_evt > 0.1
    assert synced_c and err_full < 1e-12
    print("OK 06")


if __name__ == "__main__":
    main()
