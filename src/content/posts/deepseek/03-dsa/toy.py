"""DSA (DeepSeek Sparse Attention) minimal verification script.

Verifies:
(a) ReLU Lightning Indexer + Top-k gather over shared latent KV (>95% mass).
(b) Dense Warm-up KL divergence training aligning Indexer to dense MLA.
(c) 656 B/token vs 1152 B/token memory math & ue8m0 block-128 quantization.
"""
import numpy as np

rng = np.random.default_rng(42)


def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    e = np.exp(x - np.max(x, axis=axis, keepdims=True))
    return e / np.sum(e, axis=axis, keepdims=True)


def run_retrieval_test():
    L, d_c, d_r, H, H_I, d_I, k = 128, 32, 16, 8, 4, 16, 16
    salient = np.array([5, 17, 29, 44, 58, 71, 88, 102, 115, 121])
    c_kv = rng.normal(0, 0.25, (L, d_c))
    k_r = rng.normal(0, 0.25, (L, d_r))
    topic = rng.normal(0, 1.0, d_c)
    topic /= np.linalg.norm(topic)
    c_kv[salient] += 4.5 * topic[None, :]

    q_nope = np.broadcast_to(9.0 * topic, (H, d_c)) + rng.normal(0, 0.25, (H, d_c))
    q_rope = rng.normal(0, 0.2, (H, d_r))
    dense_logits = (q_nope @ c_kv.T + q_rope @ k_r.T) / np.sqrt(d_c + d_r)
    dense_p = softmax(dense_logits, axis=-1)
    dense_out = dense_p @ c_kv

    # MQA-like Lightning Indexer: H_I heads of queries, 1 shared key k_I
    P = rng.normal(0, 0.5, (d_c, d_I))
    k_I = c_kv @ P
    q_I = q_nope[:H_I] @ P
    w_I = np.ones(H_I) / H_I
    idx_scores = (w_I[:, None] * np.maximum(0.0, q_I @ k_I.T)).sum(axis=0)

    topk_ids = np.argpartition(idx_scores, -k)[-k:]
    topk_ids = topk_ids[np.argsort(idx_scores[topk_ids])[::-1]]
    mass_kept = dense_p[:, topk_ids].sum(axis=-1).mean()
    sparse_p = softmax(dense_logits[:, topk_ids], axis=-1)
    sparse_out = sparse_p @ c_kv[topk_ids]
    rel_err = np.linalg.norm(sparse_out - dense_out) / np.linalg.norm(dense_out)
    hits = len(set(topk_ids.tolist()) & set(salient.tolist()))
    print(f"[a] L={L}, topk={k}: salient_hits={hits}/{len(salient)}, "
          f"mass_kept={mass_kept * 100:.2f}%, rel_err={rel_err:.4f}")
    assert mass_kept > 0.95, f"Expected >95% mass, got {mass_kept:.4f}"


def run_kl_warmup():
    B, L, d_h, d_I, H_main, H_I = 24, 64, 32, 16, 4, 4
    c_kv = rng.normal(0, 1.0, (L, d_h))
    # Teacher: frozen dense MLA target distribution p_{t,:} (Eq. 3)
    Q_main = rng.normal(0, 1.0, (B, H_main, d_h))
    K_main = c_kv @ rng.normal(0, 0.5, (d_h, d_h))
    teacher_logits = np.einsum("bhd,ld->bhl", Q_main, K_main) / np.sqrt(d_h)
    p_target = softmax(teacher_logits, axis=-1).sum(axis=1)
    p_target /= p_target.sum(axis=-1, keepdims=True)

    # Student Lightning Indexer: shared k_I and per-head q_I, w_I
    q_src = Q_main.mean(axis=1)  # query hidden proxy (B, d_h)
    Wq = rng.normal(0, 0.25, (d_h, H_I * d_I))
    Wk = rng.normal(0, 0.25, (d_h, d_I))
    Ww = rng.normal(0, 0.1, (d_h, H_I))
    lr = 0.25
    losses = []
    for step in range(251):
        q_I = (q_src @ Wq).reshape(B, H_I, d_I)
        k_I = c_kv @ Wk
        w_I = np.log1p(np.exp(q_src @ Ww))  # softplus > 0
        pre = np.einsum("bhd,ld->bhl", q_I, k_I)
        act = np.maximum(0.0, pre)
        I_scores = np.einsum("bh,bhl->bl", w_I, act)
        prob = softmax(I_scores, axis=-1)
        kl = float(np.mean(np.sum(p_target * np.log((p_target + 1e-12) / (prob + 1e-12)), axis=-1)))
        if step in (0, 50, 150, 250):
            losses.append((step, kl))
        dI = (prob - p_target) / B
        dw_raw = np.einsum("bl,bhl->bh", dI, act) * (1.0 / (1.0 + np.exp(-(q_src @ Ww))))
        dpre = (dI[:, None, :] * w_I[:, :, None]) * (pre > 0)
        Wq -= lr * (q_src.T @ np.einsum("bhl,ld->bhd", dpre, k_I).reshape(B, -1))
        Wk -= lr * (c_kv.T @ np.einsum("bhl,bhd->ld", dpre, q_I))
        Ww -= lr * (q_src.T @ dw_raw)
    top8_t = np.argsort(p_target, axis=-1)[:, -8:]
    top8_s = np.argsort(I_scores, axis=-1)[:, -8:]
    recall8 = np.mean([len(set(a) & set(b)) / 8.0 for a, b in zip(top8_t, top8_s)])
    msg = ", ".join(f"s{s}={v:.3f}" for s, v in losses)
    print(f"[b] KL warmup: {msg}; top-8 recall={recall8 * 100:.1f}%")
    assert losses[-1][1] < losses[0][1] * 0.25


def quant_fp8_e4m3_ue8m0(x: np.ndarray, block: int = 128) -> tuple[np.ndarray, float]:
    n_blk = x.shape[-1] // block
    xb = x.reshape(-1, n_blk, block)
    amax = np.maximum(np.max(np.abs(xb), axis=-1, keepdims=True), 1e-12)
    exp = np.ceil(np.log2(amax / 448.0))
    scale = np.exp2(exp)  # exact power-of-2 ue8m0 scale
    scaled = np.clip(xb / scale, -448.0, 448.0)
    # Emulate FP8 E4M3 mantissa (3 bits -> step 1/8 of binade)
    sign = np.sign(scaled)
    mag = np.maximum(np.abs(scaled), 2.0**-9)
    e = np.floor(np.log2(mag))
    mant = np.round((mag / np.exp2(e) - 1.0) * 8.0) / 8.0
    q = sign * np.exp2(e) * (1.0 + mant)
    q[np.abs(scaled) < 2.0**-9] = 0.0
    recon = (q * scale).reshape(x.shape)
    rel = float(np.linalg.norm(recon - x) / np.linalg.norm(x))
    return scale.squeeze(-1), rel


def run_memory_and_quant():
    bf16_b = (512 + 64) * 2
    fp8_b = 512 * 1 + (512 // 128) * 4 + 64 * 2
    idx_b = 128 * 1 + (128 // 128) * 4
    gb_bf16 = bf16_b * 62 * 131072 / (1024**3)
    gb_fp8 = fp8_b * 62 * 131072 / (1024**3)
    c_kv_vec = rng.normal(0, 1.5, (16, 512))
    scales, rel_err = quant_fp8_e4m3_ue8m0(c_kv_vec, block=128)
    assert bf16_b == 1152 and fp8_b == 656 and idx_b == 132
    print(f"[c] MLA KV: BF16={bf16_b} B/tok ({gb_bf16:.2f} GiB@128Kx62L) -> "
          f"FP8={fp8_b} B/tok ({gb_fp8:.2f} GiB), Indexer={idx_b} B/tok; "
          f"ue8m0 rel_err={rel_err:.4f}, scale_log2={np.unique(np.log2(scales)).tolist()}")


if __name__ == "__main__":
    run_retrieval_test()
    run_kl_warmup()
    run_memory_and_quant()
    print("OK 07")
