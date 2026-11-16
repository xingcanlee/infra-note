"""DeepSeek Part A (01-05) static Draw.io + SVG diagram generator."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from diagram_kit import DrawioCanvas  # noqa: E402


POSTS_ROOT = ROOT / "src" / "content" / "posts" / "deepseek"


def build_01_mla_arch() -> None:
    """图 2：DeepSeek-V2/V3 MLA 双支低秩压缩、解耦 RoPE 与推理双路径架构。"""
    c = DrawioCanvas(page_name="01-mla-arch", diagram_id="ds-01-mla-arch", width=688)

    # 输入隐状态 h_t
    c.node("h", 0, 128, 88, 64, "输入隐状态 h_t\n[B, 7168]", tone="neutral", emphasis=True)

    # 上分支：Query 压缩与解耦 RoPE
    c.group("g_q", 112, 0, 296, 136, "Query 低秩分支（128 头）", tone="active", dashed=True)
    c.node("wdq", 128, 32, 64, 48, "W_DQ\n降维", tone="neutral", font_size=12)
    c.tensor_block("cq", 208, 32, 72, 48, "c_t^Q", "[1536]", tone="active")
    c.node("qc", 296, 24, 96, 40, "q_t^C（NoPE）\n[128, 128]", tone="active", font_size=12)
    c.node("qr", 296, 80, 96, 40, "q_t^R + RoPE\n[128, 64]", tone="highlight", font_size=12)

    # 下分支：KV 联合压缩与共享单头 k_t^R
    c.group("g_kv", 112, 160, 296, 168, "KV 联合压缩与缓存分支（单头 MQA 落盘）", tone="done", dashed=True)
    c.node("wdkv", 128, 200, 64, 48, "W_DKV\n+ Norm", tone="neutral", font_size=12)
    c.tensor_block("ckv", 208, 200, 80, 48, "c_t^KV", "[512]", tone="done", emphasis=True)
    c.node("wkr", 128, 264, 80, 48, "W_KR + RoPE", tone="highlight", font_size=12)
    c.tensor_block("kr", 224, 264, 64, 48, "k_t^R", "[64]", tone="highlight")
    c.node("kv_cache", 304, 200, 88, 112, "Paged KV Cache\n[c_s^KV ; k_s^R]\n576 维 · 1 头\nBF16 = 1152 B", tone="done", emphasis=True, font_size=12)

    # 右侧：Prefill MHA vs Decode Absorbed MQA 双路径
    c.group("g_exec", 432, 0, 256, 328, "推理双路径执行（Prefill vs Decode）", tone="neutral", dashed=True)
    c.node(
        "mha",
        448,
        40,
        208,
        104,
        "Prefill 路径（forward_mha）\n展开 W_UK / W_UV → 128 头 MHA\n点积维度 192（128 + 64）\n大 s_q 下计算量更小",
        tone="active",
        font_size=12,
    )
    c.node(
        "mqa",
        448,
        160,
        208,
        104,
        "Decode 路径（forward_mqa）\nq_t^C · W_UK^T → 吸收为 [128, 512]\n直扫 [c_s^KV ; k_s^R]（1 头 576 维）\n输出 u_t [128, 512] 后乘 W_UV",
        tone="done",
        emphasis=True,
        font_size=12,
    )
    c.node("wo", 448, 280, 208, 32, "合并多头 → W_O 输出投影", tone="neutral", font_size=12)

    # 连接线
    c.connect("e1", "h", "wdq", tone="fg", exit_xy=(1, 0.25), entry_xy=(0, 0.5))
    c.connect("e2", "h", "wdkv", tone="fg", exit_xy=(1, 0.6), entry_xy=(0, 0.5))
    c.connect("e3", "h", "wkr", tone="fg", exit_xy=(1, 0.85), entry_xy=(0, 0.5))
    c.connect("e4", "wdq", "cq", tone="fg", exit_xy=(1, 0.5), entry_xy=(0, 0.5))
    c.connect("e5", "cq", "qc", tone="fg", exit_xy=(1, 0.35), entry_xy=(0, 0.5))
    c.connect("e6", "cq", "qr", tone="fg", exit_xy=(1, 0.75), entry_xy=(0, 0.5))
    c.connect("e7", "wdkv", "ckv", tone="fg", exit_xy=(1, 0.5), entry_xy=(0, 0.5))
    c.connect("e8", "ckv", "kv_cache", tone="fg", exit_xy=(1, 0.5), entry_xy=(0, 0.25))
    c.connect("e9", "wkr", "kr", tone="fg", exit_xy=(1, 0.5), entry_xy=(0, 0.5))
    c.connect("e10", "kr", "kv_cache", tone="fg", exit_xy=(1, 0.5), entry_xy=(0, 0.8))
    c.connect("e11", "qc", "mha", tone="fg", exit_xy=(1, 0.5), entry_xy=(0, 0.35))
    c.connect("e12", "qr", "mqa", tone="fg", dashed=True, exit_xy=(1, 0.5), entry_xy=(0, 0.3))
    c.connect("e13", "kv_cache", "mha", tone="fg", dashed=True, exit_xy=(1, 0.25), entry_xy=(0, 0.75))
    c.connect("e14", "kv_cache", "mqa", tone="fg", exit_xy=(1, 0.65), entry_xy=(0, 0.65))
    c.connect("e15", "mha", "wo", tone="fg", dashed=True, exit_xy=(1, 0.5), entry_xy=(1, 0.5), points=[(672, 92), (672, 296)])
    c.connect("e16", "mqa", "wo", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))

    c.save(POSTS_ROOT / "01-mla" / "diagrams" / "01-mla-arch.drawio", strict=True, build_svg=True)


def build_01_mla_gpu_vs_npu_runtime() -> None:
    """图 3：vLLM GPU 与 vllm-ascend NPU 的 MLA 权重分形与算子调度对照。"""
    c = DrawioCanvas(page_name="01-mla-runtime", diagram_id="ds-01-mla-runtime", width=688)

    (lx, ly, lw, _), (rx, ry, rw, _) = c.swimlane_pair(
        "rt",
        "NVIDIA GPU · vLLM（vllm@bb23c0a8）",
        "Huawei Ascend NPU · vllm-ascend@3649b8ff",
        y=0,
        h=408,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    # GPU 左侧流程
    c.node(
        "g_load",
        lx,
        ly,
        lw,
        56,
        "加载后权重拆分（mla_attention.py）\nsplit_kv_b_proj → W_UK_T [N, P, L] + W_UV [N, L, V]",
        tone="neutral",
        font_size=12,
    )
    c.node(
        "g_route",
        lx,
        ly + 72,
        lw,
        56,
        "MLAAttention.forward_impl\n按 reorder_batch_threshold (128)\n拆分 MHA / Decode",
        tone="active",
        font_size=12,
    )
    c.node(
        "g_prep",
        lx,
        ly + 144,
        lw,
        56,
        "Decode 前置吸收：_prepare_mqa_query\ntorch.bmm(q_nope, W_UK_T) → [T, N, 512]",
        tone="active",
        font_size=12,
    )
    c.node(
        "g_kern",
        lx,
        ly + 216,
        lw,
        72,
        "FlashMLAImpl.forward_mqa（flashmla.py）\n单张拼接缓存 [num_blocks, block_size, 1, 576]\n输出潜在向量 [T, N, head_dim_v=512]",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "g_out",
        lx,
        ly + 304,
        lw,
        56,
        "后置上投影：_v_up_proj\nbmm(output, W_UV) → o_proj",
        tone="neutral",
        font_size=12,
    )

    c.connect("ge1", "g_load", "g_route", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ge2", "g_route", "g_prep", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ge3", "g_prep", "g_kern", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ge4", "g_kern", "g_out", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))

    # Ascend 右侧流程
    c.node(
        "a_load",
        rx,
        ry,
        rw,
        56,
        "加载后分形重排（mla_v1.py）\nW_UK_T / W_UV 经 maybe_trans_nz → FRACTAL_NZ",
        tone="neutral",
        font_size=12,
    )
    c.node(
        "a_route",
        rx,
        ry + 72,
        rw,
        56,
        "AscendMLAImpl._forward_decode\nPrefill 走 BF16 TND · Decode 走 MLAPO 融合",
        tone="activation",
        font_size=12,
    )
    c.node(
        "a_prep",
        rx,
        ry + 144,
        rw,
        56,
        "npu_mla_prolog_v3 / mla_preprocess\n一次融合完成 Q/KV 投影、RoPE 与双路写入",
        tone="activation",
        font_size=12,
    )
    c.node(
        "a_kern",
        rx,
        ry + 216,
        rw,
        72,
        "npu_fused_infer_attention_score_v2\n分离读写 kv_c (512) 与 k_pe (64) PA_NZ 缓存\nreshape 至 nz_fmt_last_dim=16 对齐 Cube MMA",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "a_out",
        rx,
        ry + 304,
        rw,
        56,
        "后置上投影：_v_up_proj\ntorch_npu.npu_transpose_batchmatmul(W_UV)",
        tone="neutral",
        font_size=12,
    )

    c.connect("ae1", "a_load", "a_route", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ae2", "a_route", "a_prep", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ae3", "a_prep", "a_kern", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ae4", "a_kern", "a_out", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))

    c.save(POSTS_ROOT / "01-mla" / "diagrams" / "01-mla-gpu-vs-npu-runtime.drawio", strict=True, build_svg=True)


def build_02_nsa_gqa_tile_arch() -> None:
    """图 3：GQA 组共享选块 vs 独立并集灾难，及 SRAM/UB 连续块 MMA 调度。"""
    c = DrawioCanvas(page_name="02-nsa-gqa-tile", diagram_id="ds-02-nsa-tile", width=688)

    # 左侧反例 vs 正解选块对比
    c.group("g_bad", 0, 0, 304, 152, "反例：GQA 组内按头独立选块 → 并集灾难", tone="error", dashed=True)
    c.node("bad_h", 16, 40, 120, 48, "Head 0..15\n各挑 Top-n 离散块", tone="error", font_size=12)
    c.node("bad_u", 152, 40, 136, 48, "底层共享同一 HBM KV\n被迫搬运 16 头并集", tone="neutral", font_size=12)
    c.node("bad_r", 16, 104, 272, 32, "实际访存退化接近全量扫描，饿死 TensorCore", tone="error", font_size=12)
    c.connect("be1", "bad_h", "bad_u", tone="fg", exit_xy=(1, 0.5), entry_xy=(0, 0.5))

    c.group("g_good", 0, 168, 304, 176, "正解：NSA 组共享连续块筛选（Eq. 10）", tone="done", dashed=True)
    c.node("gd_sum", 16, 208, 128, 56, "p_slc' = Sum_h p_slc^(h)\n整组 G=16 汇总选块分", tone="active", font_size=12)
    c.node("gd_idx", 160, 208, 128, 56, "唯一共享块集 I_t\nTop-n 块（每块 l'=64）", tone="done", emphasis=True, font_size=12)
    c.node("gd_mem", 16, 288, 272, 40, "整组只读 n 块连续 KV（带宽直降 4x~11.6x）", tone="done", font_size=12)
    c.connect("ge_g1", "gd_sum", "gd_idx", tone="fg", exit_xy=(1, 0.5), entry_xy=(0, 0.5))
    c.connect("ge_g2", "gd_idx", "gd_mem", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))

    # 右侧 SRAM/UB Group-Centric 内核循环
    c.group("g_sram", 352, 0, 336, 344, "On-Chip SRAM / UB 硬件对齐内核（Group-Centric）", tone="active", dashed=False)
    c.node(
        "s_grid",
        368,
        40,
        304,
        56,
        "1. Grid Outer Loop：按时间步 t 与 GQA 组调度\n一次驻留全组查询 Q_g [G=16, d_k] + 索引 I_t",
        tone="active",
        font_size=12,
    )
    c.node(
        "s_load",
        368,
        112,
        304,
        56,
        "2. Inner Loop：顺序 TMA / 异步预取连续块\nK_tile [B_k=64, d_k], V_tile [B_k=64, d_v]",
        tone="done",
        font_size=12,
    )
    c.node(
        "s_mma",
        368,
        184,
        304,
        72,
        "3. TensorCore / 达芬奇 Cube 满阵计算\n[M=16, d_k] @ [d_k, N=64] + Online Softmax\n（16 个头分摊 1 份 KV 访存，跨过算数强度拐点）",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "s_out",
        368,
        272,
        304,
        56,
        "4. 与 cmp / win 分支汇总 → Sigmoid 门控融合输出\no_t* = g_cmp·O_cmp + g_slc·O_slc + g_win·O_win",
        tone="neutral",
        font_size=12,
    )

    c.connect("se1", "s_grid", "s_load", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("se2", "s_load", "s_mma", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("se3", "s_mma", "s_out", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("se_link", "gd_idx", "s_grid", label="共享 I_t", tone="fg", exit_xy=(1, 0.35), entry_xy=(0, 0.7))

    c.save(POSTS_ROOT / "02-swa-and-nsa" / "diagrams" / "02-nsa-gqa-tile-arch.drawio", strict=True, build_svg=True)


def build_03_dsa_gpu_vs_npu_runtime() -> None:
    """图 3：vLLM GPU（FlashMLA Sparse）与 vllm-ascend NPU（AscendSFA）运行时对照。"""
    c = DrawioCanvas(page_name="03-dsa-runtime", diagram_id="ds-03-dsa-runtime", width=688)

    (lx, ly, lw, _), (rx, ry, rw, _) = c.swimlane_pair(
        "dsa_rt",
        "NVIDIA GPU · vLLM FlashMLA Sparse",
        "Huawei Ascend NPU · vllm-ascend SFA",
        y=0,
        h=376,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    # GPU
    c.node(
        "g_idx_proj",
        lx,
        ly,
        lw,
        56,
        "Indexer（deepseek_v2.py）\nwq_b（复制）+ wk_weights_proj（无 TP BF16）\nfused_indexer_q_rope_quant 量化缩放",
        tone="neutral",
        font_size=12,
    )
    c.node(
        "g_idx_cache",
        lx,
        ly + 72,
        lw,
        56,
        "DeepseekV32IndexerCache（132 B/tok）\n128 维 FP8 键（128 B）+ 1 个 ue8m0 缩放（4 B）",
        tone="active",
        font_size=12,
    )
    c.node(
        "g_idx_score",
        lx,
        ly + 144,
        lw,
        48,
        "SparseAttnIndexer（block_size=64）\nfp8_fp4_paged_mqa_logits → Top-2048 下标",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "g_main",
        lx,
        ly + 208,
        lw,
        104,
        "FlashMLASparseBackend（flashmla_sparse.py）\nflash_mla_sparse_fwd（CTA Cluster DSMEM）\n656 B 稀疏：512B FP8 + 16B scale + 128B RoPE\n（H800 SXM5 稀疏主算力最高 410 TFLOPS）",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )

    c.connect("dge1", "g_idx_proj", "g_idx_cache", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("dge2", "g_idx_cache", "g_idx_score", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("dge3", "g_idx_score", "g_main", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))

    # Ascend
    c.node(
        "a_prep",
        rx,
        ry,
        rw,
        56,
        "AscendSFAImpl 预处理（sfa_v1.py）\nPreprocessType：PROLOG_V3 / MLAPO / NATIVE\n支持独立 _q_stream 并行发射索引器与主分支",
        tone="neutral",
        font_size=12,
    )
    c.node(
        "a_idx_cache",
        rx,
        ry + 72,
        rw,
        56,
        "AscendSFAIndexerBackend（indexer.py）\nPA_BSND 物理布局 · 分离 K 与 Scale 槽位",
        tone="activation",
        font_size=12,
    )
    c.node(
        "a_idx_score",
        rx,
        ry + 144,
        rw,
        48,
        "npu_lightning_indexer（达芬奇融合打分）\nblock_size=128 对齐 Cube · compute_topk 控跳选",
        tone="activation",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "a_main",
        rx,
        ry + 208,
        rw,
        104,
        "npu_sparse_flash_attention / sparse_flash_mla\n物理页块 size=128，sparse_block_size=1 逐词精选\n直接按 topk_indices 搬运对应潜向量完成 MQA",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )

    c.connect("dae1", "a_prep", "a_idx_cache", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("dae2", "a_idx_cache", "a_idx_score", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("dae3", "a_idx_score", "a_main", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))

    c.save(POSTS_ROOT / "03-dsa" / "diagrams" / "03-dsa-gpu-vs-npu-runtime.drawio", strict=True, build_svg=True)


def build_04_csa_hca_arch() -> None:
    """图 2：DeepSeek-V4 CSA（m=4）与 HCA（m'=128）双轨 RoPE 及混合层架构。"""
    c = DrawioCanvas(page_name="04-csa-hca", diagram_id="ds-04-csa-hca", width=688)

    # 左：CSA vs HCA 门控折叠对比
    c.group("g_comp", 0, 0, 232, 384, "序列轴门控折块（ArXiv:2606.19348）", tone="active", dashed=True)
    c.node(
        "csa_box",
        16,
        40,
        200,
        112,
        "CSA（m = 4，重叠 2m = 8 窗）\n双投影 C^a/C^b + Z^a/Z^b + B^a/B^b\n沿 2m 行做逐通道 Softmax 加权\n+ FP4 闪电索引器筛选 Top-k 块",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "hca_box",
        16,
        168,
        200,
        104,
        "HCA（m' = 128，无重叠单窗）\n单投影 C, Z + B，序列缩至 1/128\n1M 上下文仅余约 7,812 条压缩块\n取消索引器，直接全块稠密读取",
        tone="done",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "ring_box",
        16,
        288,
        200,
        80,
        "FP32 定长 StateCache（环形缓冲）\n暂存未闭合尾部词元\n+ SWA (n_win=128)",
        tone="highlight",
        font_size=12,
    )

    # 中：双轨 RoPE + Shared MQA + 逆 RoPE
    c.group("g_attn", 248, 0, 240, 384, "双轨 RoPE 与输出逆旋转（Eq. 27）", tone="highlight", dashed=True)
    c.node(
        "rope_track",
        264,
        40,
        208,
        80,
        "双轨 Partial RoPE（末 64 维）\n全局支：deepseek_yarn 长文本外推\nSWA 支：factor=1.0 锁定局部对齐",
        tone="highlight",
        font_size=12,
    )
    c.node(
        "mqa_sink",
        264,
        136,
        208,
        88,
        "RMSNorm + Shared KV MQA + Sink\nC^Comp 兼任 Key/Value 携带绝对位置\n分母注入可学习 exp(z'_h) 泄洪项",
        tone="active",
        font_size=12,
    )
    c.node(
        "inv_rope",
        264,
        240,
        208,
        72,
        "输出逆旋转 R_{-t}（inverse=True）\n在输出末尾 64 维消除绝对旋转\n还原相对位置 R_{k_pos - t}",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "wo_grp",
        264,
        328,
        208,
        40,
        "Grouped Output Proj\n(DeepseekV4GroupedWoA)",
        tone="neutral",
        font_size=12,
    )

    # 右：V4 混合层堆叠与收益
    c.group("g_stack", 504, 0, 184, 384, "V4 混合堆叠与实测收益", tone="done", dashed=True)
    c.node(
        "st_flash",
        520,
        40,
        152,
        152,
        "DeepSeek-V4-Flash (43L)\nL0–1：纯 SWA\nL2–42：CSA(m=4) 与\nHCA(m'=128) 交错堆叠\n\nKV 降至 V3.2 的 7%\nFLOPs 降至 V3.2 的 10%",
        tone="done",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "st_pro",
        520,
        208,
        152,
        160,
        "DeepSeek-V4-Pro (61L)\nL0–1：HCA 起始\nL2–60：CSA / HCA 交错\n\nKV 降至 V3.2 的 10%\nFLOPs 降至 V3.2 的 27%\n（GQA-8 基准的 2%）",
        tone="neutral",
        font_size=12,
    )

    c.connect("ve1", "csa_box", "mqa_sink", tone="fg", exit_xy=(1, 0.5), entry_xy=(0, 0.35))
    c.connect("ve2", "hca_box", "mqa_sink", tone="fg", exit_xy=(1, 0.45), entry_xy=(0, 0.65))
    c.connect("ve3", "ring_box", "rope_track", tone="fg", dashed=True, exit_xy=(1, 0.3), entry_xy=(0, 0.8))
    c.connect("ve4", "rope_track", "mqa_sink", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ve5", "mqa_sink", "inv_rope", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ve6", "inv_rope", "wo_grp", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ve7", "wo_grp", "st_flash", tone="fg", dashed=True, exit_xy=(1, 0.5), entry_xy=(0, 0.7))

    c.save(POSTS_ROOT / "04-csa-and-hca" / "diagrams" / "04-csa-hca-arch.drawio", strict=True, build_svg=True)


def build_05_ced_prefix_arch() -> None:
    """图 3：CED 非对称编码-解码、SSD/DRAM 分级缓存与 SWA 有界重放架构。"""
    c = DrawioCanvas(page_name="05-ced-prefix", diagram_id="ds-05-ced-prefix", width=688)

    # 左：CED 非对称前向计算切分
    c.group("g_ced", 0, 0, 328, 376, "Causal Encoder-Decoder（CED）Prefill 算力减半", tone="active", dashed=True)
    c.node(
        "enc",
        16,
        40,
        296,
        72,
        "Causal Encoder（L0..L19，激活 ~8B）\n处理完整长度 N · L2–19 (m=2) 生成 1.5 份全局 KV",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "hl2",
        16,
        136,
        296,
        48,
        "编码器顶层隐状态 H_{L/2}（一次性投影源）",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "proj",
        16,
        208,
        296,
        64,
        "直接投影 L20..L39 全局 KV：C_l = H_{L/2} W_l^{KV}\n只需在 L20 写入 1.0 份 m=1 主 KV，免跑上层 MoE",
        tone="done",
        font_size=12,
    )
    c.node(
        "dec_swa",
        16,
        296,
        296,
        64,
        "DecoderReplayLayers（L20..L39，末尾 n_win=128）\n只对最后 128 个 token 跑局部 SWA\nPrefill 降至 O(NL/2)",
        tone="highlight",
        font_size=12,
    )
    c.connect("ce1", "enc", "hl2", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ce2", "hl2", "proj", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))
    c.connect("ce3", "proj", "dec_swa", tone="fg", exit_xy=(0.5, 1), entry_xy=(0.5, 0))

    # 右：V4.1 分级持久化缓存与 SWA 有界重放
    c.group("g_tier", 352, 0, 336, 376, "智能体多轮分级存储与 SWA 有界重放（§3.2）", tone="done", dashed=True)
    c.node(
        "ssd",
        368,
        40,
        304,
        72,
        "SSD 持久化前缀池（TTL >= 72 小时）\n只存全局 KV（890 B/tok），体积仅为 V4 的 1/8\n完全剔除短寿命 SWA KV，命中即直复全部长前缀",
        tone="done",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "dram",
        368,
        144,
        304,
        72,
        "Host DRAM 热缓冲池（10% RAM · 分钟级 TTL）\n只缓存 Prompt 尾与输出尾两处 SWA 快照\n活跃多轮直接命中，过期即刻回收给新会话",
        tone="active",
        font_size=12,
    )
    c.node(
        "miss",
        368,
        248,
        304,
        112,
        "全局命中但 SWA 过期时的兜底策略\nEncoder SWA Bounded Replay：\n仅回放命中点前最后 n_win=128 个 token 恢复 SWA\n（不再全网重跑 L×n_win=5120 步）\n随后仅对新增短后缀生成全局 KV + SWA KV",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.connect("te1", "ssd", "dram", label="全局命中", tone="fg", exit_xy=(0.25, 1), entry_xy=(0.25, 0))
    c.connect("te2", "dram", "miss", label="SWA 过期", tone="fg", exit_xy=(0.75, 1), entry_xy=(0.75, 0))

    c.save(POSTS_ROOT / "05-csa2-and-ced" / "diagrams" / "05-ced-prefix-arch.drawio", strict=True, build_svg=True)


def main() -> None:
    builders = [
        ("01-mla-arch", build_01_mla_arch),
        ("01-mla-gpu-vs-npu-runtime", build_01_mla_gpu_vs_npu_runtime),
        ("02-nsa-gqa-tile-arch", build_02_nsa_gqa_tile_arch),
        ("03-dsa-gpu-vs-npu-runtime", build_03_dsa_gpu_vs_npu_runtime),
        ("04-csa-hca-arch", build_04_csa_hca_arch),
        ("05-ced-prefix-arch", build_05_ced_prefix_arch),
    ]
    for name, fn in builders:
        fn()
        print(f"OK built {name}")


if __name__ == "__main__":
    main()
