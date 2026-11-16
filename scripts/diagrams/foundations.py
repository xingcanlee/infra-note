"""Build and compile all static diagrams for the `foundations` series."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from diagram_kit import CANVAS_W, DrawioCanvas, ExcalidrawScene  # noqa: E402

POSTS_ROOT = (
    Path(__file__).resolve().parents[2] / "src" / "content" / "posts" / "foundations"
)


def build_01_gpu_vs_npu_arch() -> None:
    """Chapter 01: NVIDIA GPU SM vs Huawei Ascend DaVinci AI Core microarchitecture."""
    c = DrawioCanvas(
        page_name="NVIDIA SM vs Ascend AI Core",
        diagram_id="foundations-01-gpu-vs-npu-arch",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "双硬件微架构与执行模型对照：硬件缓存 + TMA (NVIDIA) vs 显式片上分级 + MTE/CV (昇腾)",
        size=12,
        tone="muted",
        align="center",
    )

    (lx, ly, lw, lh), (rx, ry, rw, rh) = c.swimlane_pair(
        "arch",
        "NVIDIA GPU SM (Hopper / Blackwell)",
        "华为昇腾 DaVinci AI Core (910B / A3 / A5)",
        y=32,
        h=552,
        total_w=CANVAS_W,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    col_x_l = lx + 8
    col_x_r = rx + 8
    col_w = lw - 16  # 288px, exact multiple of 8
    hw_w = (col_w - 16) // 2  # 136px, exact multiple of 8

    # ---- Left: NVIDIA SM ----
    c.node(
        "l_ctrl",
        col_x_l,
        ly + 16,
        col_w,
        56,
        "SIMT Warp 调度器 + PrivateUse1=False\n原生 CUDA 分发 -> forward_cuda",
        tone="neutral",
        font_size=12,
    )

    c.node(
        "l_tc",
        col_x_l,
        ly + 96,
        hw_w,
        96,
        "Tensor Core\nMMA / WGMMA / tcgen05\n高密度矩阵乘主引擎",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "l_cuda",
        col_x_l + hw_w + 16,
        ly + 96,
        hw_w,
        96,
        "CUDA Core + MUFU\n向量 / exp / rsqrt\n(MUFU 16 ops/clk)",
        tone="highlight",
        font_size=12,
    )

    c.node(
        "l_mem",
        col_x_l,
        ly + 216,
        col_w,
        80,
        "Register File (64K x 32b/SM) + SMEM (128 B/clk)\nBlackwell 新增 256 KB TMEM 存放累加器\n硬件自动管理 L1 / L2 Cache",
        tone="neutral",
        font_size=12,
    )

    c.node(
        "l_dma",
        col_x_l,
        ly + 320,
        col_w,
        72,
        "TMA 异步多维张量拷贝引擎\n读取通用行/列主序 ND 张量 (16B 步长对齐)",
        tone="active",
        dashed=True,
        font_size=12,
    )

    c.node(
        "l_hbm",
        col_x_l,
        ly + 424,
        col_w,
        64,
        "HBM3 / HBM3e 片外显存\nH800 SXM5: 3.35 TB/s · 990 TFLOPS (实用 ~865)",
        tone="neutral",
        font_size=12,
    )

    c.connect("l_e1", "l_hbm", "l_dma", label="异步张量块", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("l_e2", "l_dma", "l_mem", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("l_e3", "l_mem", "l_tc", tone="fg", exit_xy=(0.25, 0.0), entry_xy=(0.5, 1.0))

    # ---- Right: Ascend DaVinci AI Core ----
    c.node(
        "r_ctrl",
        col_x_r,
        ry + 16,
        col_w,
        56,
        "Scalar 调度核 + PrivateUse1 (OOT)\nAscend 950 采用 1 Cube + 2 Vector (1C2V)",
        tone="neutral",
        font_size=12,
    )

    c.node(
        "r_cube",
        col_x_r,
        ry + 96,
        hw_w,
        96,
        "Cube Unit (16x16x16)\n950 达 4096 FMA/clk\n强约束 FRACTAL_NZ",
        tone="activation",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "r_vec",
        col_x_r + hw_w + 16,
        ry + 96,
        hw_w,
        96,
        "Vector Unit (长向量)\nNorm / SiLU / Softmax\n显式 UB 读写 + CV 并行",
        tone="highlight",
        font_size=12,
    )

    c.node(
        "r_mem",
        col_x_r,
        ry + 216,
        col_w,
        80,
        "显式分级片上 Scratchpad (无通用硬件 Cache)\nCube 路径: L1 -> L0A / L0B -> L0C (256 KB)\nVector 路径: Unified Buffer (UB 192 KB/核)",
        tone="neutral",
        font_size=12,
    )

    c.node(
        "r_dma",
        col_x_r,
        ry + 320,
        col_w,
        72,
        "MTE2 (HBM->L1/UB) · MTE1 (L1->L0) · MTE3 (回写)\n权重预转 FRACTAL_NZ (29) 匹配 16x16 分形突发",
        tone="activation",
        dashed=True,
        font_size=12,
    )

    c.node(
        "r_hbm",
        col_x_r,
        ry + 424,
        col_w,
        64,
        "HBM 片外显存 (ACL_FORMAT_FRACTAL_ND / NZ)\n由 CustomOp.forward_oot 分发至 CANN / Ascend C",
        tone="neutral",
        font_size=12,
    )

    c.connect("r_e1", "r_hbm", "r_dma", label="显式 MTE2", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("r_e2", "r_dma", "r_mem", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("r_e3", "r_mem", "r_cube", tone="fg", exit_xy=(0.25, 0.0), entry_xy=(0.5, 1.0))

    out_path = POSTS_ROOT / "01-hardware-and-roofline" / "diagrams" / "01-gpu-vs-npu-arch.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_03_mqa_gqa_arch() -> None:
    """Chapter 03: Strictly proportional MHA (8:8=100%) vs GQA (8:2=25%) vs MQA (8:1=12.5%)."""
    c = DrawioCanvas(
        page_name="MHA GQA MQA Proportional KV",
        diagram_id="foundations-03-mqa-gqa-arch",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "固定 8 个 Query 头 (总宽 512px = 100%)，KV Cache 实体宽度严格按 8 : 2 : 1 等比例缩放",
        size=12,
        tone="muted",
        align="center",
    )

    track_x = 144
    track_w = 512  # 8 * 64px, exact multiple of 8

    rows = [
        ("mha", "MHA (8:8, g=1)\n100% KV 容量\nAI ≈ 1.0 FLOP/B", 8, "neutral", False, "100% 物理 KV (8 组独立头 · 512px)"),
        ("gqa", "GQA-2 (8:2, g=4)\n25% KV 容量\nAI 提升 ~4x", 2, "active", True, "25% KV (2 组 · 128px) -> 节省 75% (384px)"),
        ("mqa", "MQA (8:1, g=8)\n12.5% KV 容量\nAI 提升 ~8x", 1, "done", True, "12.5% KV (1 组 · 64px) -> 节省 87.5% (448px)"),
    ]

    cur_y = 32
    for key, side_label, n_kv, kv_tone, emph, kv_summary in rows:
        row_h = 160
        c.group(f"{key}_box", 8, cur_y, CANVAS_W - 16, row_h, title="", tone="neutral", dashed=False)
        c.text(f"{key}_lbl", 16, cur_y + 24, 120, 96, side_label, size=12, tone=kv_tone if emph else "fg", align="left", bold=True)

        qy = cur_y + 16
        kvy = cur_y + 88

        # 8 Q heads across 512px (64px each)
        q_splits = [(i / 8.0, f"Q{i}", "Q7" if i == 7 else "") for i in range(1, 8)]
        # Build explicit Q blocks of 64px so connectors attach cleanly per head/group
        q_ids = []
        for qi in range(8):
            qid = c.node(
                f"{key}_q{qi}",
                track_x + qi * 64,
                qy,
                64,
                32,
                f"Q{qi}",
                tone="highlight" if key == "mha" else ("active" if qi < 4 else "highlight") if key == "gqa" else "active",
                emphasis=False,
                font_size=12,
            )
            q_ids.append(qid)

        # Proportional KV strip: each KV head = 64px wide
        kv_ids = []
        for ki in range(n_kv):
            kid = c.node(
                f"{key}_kv{ki}",
                track_x + ki * 64,
                kvy,
                64,
                40,
                f"KV{ki}",
                tone=kv_tone,
                emphasis=emph,
                font_size=12,
            )
            kv_ids.append(kid)

        used_w = n_kv * 64
        saved_w = track_w - used_w
        if saved_w > 0:
            c.node(
                f"{key}_saved",
                track_x + used_w,
                kvy,
                saved_w,
                40,
                kv_summary,
                tone="muted",
                dashed=True,
                font_size=12,
            )
        else:
            c.text(f"{key}_sum", track_x, kvy + 40, track_w, 24, kv_summary, size=12, tone="muted", align="left")

        # Connect Q heads to shared KV heads
        group_size = 8 // n_kv
        for qi in range(8):
            ki = qi // group_size
            c.connect(
                f"{key}_e{qi}",
                q_ids[qi],
                kv_ids[ki],
                tone="fg" if emph else "muted",
                ortho=False,
                exit_xy=(0.5, 1.0),
                entry_xy=(0.5, 0.0),
                arrow_end=True,
            )

        cur_y += row_h + 16

    out_path = POSTS_ROOT / "03-kv-cache-and-gqa" / "diagrams" / "03-mqa-gqa-arch.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_03_gpu_vs_npu_kv_layout() -> None:
    """Chapter 03: vLLM GPU ND Paged KV vs vllm-ascend PA_NZ 16x16 Cube-aligned layout."""
    c = DrawioCanvas(
        page_name="GPU ND vs Ascend PA_NZ KV Layout",
        diagram_id="foundations-03-gpu-vs-npu-kv-layout",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "分页 KV Cache 物理排布对照：vLLM GPU 行主序 ND (TMA 对齐) vs vllm-ascend PA_NZ 16x16 分形视图",
        size=12,
        tone="muted",
        align="center",
    )

    (lx, ly, lw, lh), (rx, ry, rw, rh) = c.swimlane_pair(
        "kv",
        "vLLM GPU Paged KV (flash_attn.py)",
        "vllm-ascend PA_NZ (mla_v1.py / attention_v1.py)",
        y=32,
        h=520,
        total_w=CANVAS_W,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    col_x_l = lx + 8
    col_x_r = rx + 8
    col_w = lw - 16  # 288px, exact multiple of 8 (288 / 4 = 72px)

    # Left: GPU ND layout
    c.node(
        "g_shape",
        col_x_l,
        ly + 16,
        col_w,
        72,
        "物理张量池: [num_blocks, n_kv, block_size, 2*head_size]\ndo_kv_cache_update -> transpose(1,2).split(D)",
        tone="neutral",
        font_size=12,
    )
    c.text(
        "g_blk_title",
        col_x_l,
        ly + 104,
        224,
        24,
        "单个物理块内的 K / V (ND 行主序)",
        size=12,
        tone="fg",
        align="left",
        bold=True,
    )
    c.tensor_block(
        "g_blk",
        col_x_l,
        ly + 128,
        col_w,
        128,
        name="",
        shape="",
        tone="active",
        emphasis=True,
        splits=[
            (0.25, "y", "", ""),
            (0.50, "y", "", ""),
            (0.75, "y", "", ""),
        ],
    )
    for ri, row_txt in enumerate((
        "tok 0..15",
        "tok 16..31",
        "tok 32..47",
        "tok 48..63 (沿 head_size 连续)",
    )):
        c.text(
            f"g_blk_r{ri}",
            col_x_l,
            ly + 128 + ri * 32,
            col_w,
            32,
            row_txt,
            size=12,
            tone="fg",
            align="center",
        )
    c.text(
        "g_blk_shape",
        col_x_l,
        ly + 264,
        col_w,
        32,
        "切片视图: [num_blocks, block_size, n_kv, head_size]",
        size=12,
        tone="muted",
        align="left",
    )
    c.node(
        "g_op",
        col_x_l,
        ly + 312,
        col_w,
        72,
        "写入: reshape_and_cache_flash(..., slot_mapping)\n对齐契约: canonicalize_singleton_dim_strides (>=16B)",
        tone="neutral",
        font_size=12,
    )
    c.node(
        "g_blk_sz",
        col_x_l,
        ly + 400,
        col_w,
        56,
        "默认 block_size: MultipleOf(16) · SM90 d512 FP8 取 64",
        tone="highlight",
        font_size=12,
    )

    # Right: Ascend PA_NZ 16x16 Cube-aligned layout
    c.node(
        "a_shape",
        col_x_r,
        ry + 16,
        col_w,
        72,
        "基础池: (2, num_blocks, block_size, n_kv, head_size)\nPA_NZ 折叠: [num_blocks, n_kv*D//16, block_size, 16]",
        tone="neutral",
        font_size=12,
    )
    c.text(
        "a_blk_title",
        col_x_r,
        ry + 104,
        224,
        24,
        "PA_NZ 16x16 Cube 分形子块",
        size=12,
        tone="fg",
        align="left",
        bold=True,
    )
    c.tensor_block(
        "a_blk",
        col_x_r,
        ry + 128,
        col_w,
        128,
        name="",
        shape="",
        tone="activation",
        emphasis=True,
        splits=[
            (0.25, "x", "", ""),
            (0.50, "x", "", ""),
            (0.75, "x", "", ""),
            (0.50, "y", "", ""),
        ],
    )
    slice_w = col_w // 4  # 72px, exact multiple of 8
    for ci, col_txt in enumerate(("D[0:16]", "D[16:32]", "D[32:48]", "D[48:64]")):
        c.text(
            f"a_blk_c{ci}",
            col_x_r + ci * slice_w,
            ry + 128,
            slice_w,
            64,
            col_txt,
            size=12,
            tone="fg",
            align="center",
        )
        c.text(
            f"a_blk_b{ci}",
            col_x_r + ci * slice_w,
            ry + 192,
            slice_w,
            64,
            "16x16 子块",
            size=12,
            tone="muted",
            align="center",
        )
    c.text(
        "a_blk_shape",
        col_x_r,
        ry + 264,
        col_w,
        32,
        "MLA view: [B, n_kv, D//16, Bs, 16] (C8 INT8 取 32)",
        size=12,
        tone="muted",
        align="left",
    )
    c.node(
        "a_op",
        col_x_r,
        ry + 312,
        col_w,
        72,
        "写入: npu_scatter_pa_kv_cache (PA / PA_NZ)\n读取: FIA _forward_decode (BSND_NBSD vs BNSD_NBSD)",
        tone="neutral",
        font_size=12,
    )
    c.node(
        "a_blk_sz",
        col_x_r,
        ry + 400,
        col_w,
        56,
        "默认 block_size = 128 · 匹配 Cube 16x16 连续突发读取",
        tone="highlight",
        font_size=12,
    )

    c.connect("g_e1", "g_shape", "g_blk", tone="fg", exit_xy=(0.9, 1.0), entry_xy=(0.9, 0.0))
    c.connect("a_e1", "a_shape", "a_blk", tone="fg", exit_xy=(0.9, 1.0), entry_xy=(0.9, 0.0))

    out_path = POSTS_ROOT / "03-kv-cache-and-gqa" / "diagrams" / "03-gpu-vs-npu-kv-layout.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_04_sram_tiling_arch() -> None:
    """Chapter 04: FlashAttention HBM vs on-chip SRAM/UB tiling without O(N^2) materialization."""
    c = DrawioCanvas(
        page_name="SRAM Tiling Architecture",
        diagram_id="foundations-04-sram-tiling-arch",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "FlashAttention IO 架构：Q/K/V 留在 HBM，所有 [Br, Bc] 分数与归一化状态均在片上完成",
        size=12,
        tone="muted",
        align="center",
    )

    # Top Zone: HBM (slow, large)
    c.group("hbm", 8, 32, CANVAS_W - 16, 128, title="片外 HBM 显存 (大容量 · 低带宽: H800 3.35 TB/s)", tone="neutral", dashed=False)
    c.node("hbm_q", 24, 72, 120, 64, "完整 Q [N, d]\n按块 Br 分片读一次", tone="active", font_size=12)
    c.node("hbm_kv", 168, 72, 160, 64, "完整 K, V [N, d]\n分块 Bc 顺序流式读取", tone="highlight", font_size=12)
    c.node("hbm_no_sp", 352, 72, 168, 64, "已消除: S, P [N, N]\nO(N^2) 中间矩阵永不写回 HBM", tone="muted", dashed=True, font_size=12)
    c.node("hbm_o", 560, 72, 104, 64, "最终 O [N, d]\n仅循环末尾写回一次", tone="done", font_size=12)

    # Bottom Zone: On-chip SRAM / Register / Ascend UB+L0C
    c.group(
        "sram",
        8,
        216,
        CANVAS_W - 16,
        264,
        title="",
        tone="active",
        dashed=False,
    )
    c.text(
        "sram_hdr",
        192,
        224,
        368,
        24,
        "片上高速缓存 (GPU SMEM/TMEM · 昇腾 L1/L0C + UB)",
        size=12,
        tone="active",
        align="left",
        bold=True,
    )

    c.node("sram_q", 32, 264, 104, 64, "常驻切片 Q_i\n[B_r, d]", tone="active", emphasis=True, font_size=12)
    c.node("sram_kv", 32, 376, 104, 72, "当前瓦片 K_j, V_j\n[B_c, d] (双缓冲覆写)", tone="highlight", emphasis=True, font_size=12)

    c.node("sram_s", 168, 264, 144, 80, "局部矩阵乘 S_ij\n= Q_i K_j^T / sqrt(d)\n仅占 [B_r, B_c] 用完即丢", tone="neutral", font_size=12)
    c.node("sram_sm", 168, 368, 144, 88, "片上统计更新\nm_new = max(m, rowmax)\nalpha = exp(m_old - m_new)", tone="highlight", font_size=12)

    c.node(
        "sram_acc",
        384,
        272,
        144,
        160,
        "唯一片上输出累加器\nO_i~ [B_r, d] (未除 l_i)\n原地重缩放并叠加:\nO_i~ = alpha*O_i~ + P_ij~ V_j\n(Ascend 950 迁至 UB\n配合 skip-scale 减少搬运)",
        tone="done",
        emphasis=True,
        font_size=12,
    )

    c.node("sram_fin", 576, 328, 88, 96, "循环 Tc 块后\n唯一一次除法\nO_i = O_i~ / l_i", tone="done", dashed=True, font_size=12)

    # Arrows
    c.connect("e_hq", "hbm_q", "sram_q", label="TMA / MTE2", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.connect(
        "e_hkv",
        "hbm_kv",
        "sram_kv",
        label="按 Bc 迭代",
        tone="fg",
        exit_xy=(0.5, 1.0),
        entry_xy=(1.0, 0.5),
        points=[(248, 184), (152, 184), (152, 412)],
    )
    c.connect("e_qs", "sram_q", "sram_s", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.4))
    c.connect("e_kvs", "sram_kv", "sram_s", tone="fg", exit_xy=(1.0, 0.25), entry_xy=(0.0, 0.8))
    c.connect("e_ssm", "sram_s", "sram_sm", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.connect("e_sma", "sram_sm", "sram_acc", label="alpha, P~", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.7))
    c.connect("e_fin", "sram_acc", "sram_fin", label="末尾", tone="fg", exit_xy=(1.0, 0.65), entry_xy=(0.0, 0.5))
    c.connect("e_wo", "sram_fin", "hbm_o", label="仅写 O(Nd)", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))

    out_path = POSTS_ROOT / "04-flash-attention" / "diagrams" / "04-sram-tiling-arch.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_05_bitformats_contrast() -> None:
    """Chapter 05: Proportional bitfield contrast of BF16, INT8, FP8 E4M3, and MXFP4."""
    ex = ExcalidrawScene(seed=11)

    ex.add_text(
        8,
        0,
        "四种数值格式按比特宽度严格比例对照 (16-bit vs 8-bit vs 4-bit+E8M0)",
        size="note",
        color="muted",
    )

    rows = [
        (
            "BF16 (16b)",
            [(1, "S", "neutral"), (8, "Exp (E8)", "active"), (7, "Mant (M7)", "done")],
            "1+8+7 · 2.00 B/elem · 基准",
        ),
        (
            "INT8 (8b)",
            [(1, "S", "neutral"), (7, "Int7 (-127..127)", "highlight")],
            "1+7 · 1.00 B · 910B 主力",
        ),
        (
            "FP8 E4M3 (8b)",
            [(1, "S", "neutral"), (4, "E4", "active"), (3, "M3", "done")],
            "1+4+3 · max 448 · 1.00 B",
        ),
        (
            "MXFP4 (4b)",
            [(1, "S", "neutral"), (2, "E2", "active"), (1, "M1", "done")],
            "E2M1x32 + 1B E8M0 = 4.25b/elem",
        ),
    ]

    ex.bitfield_comparison(
        rows,
        x=8,
        y=32,
        bit_px=24,
        row_h=40,
        row_gap=24,
        label_w=120,
    )

    # Extra visual block showing the shared 8-bit E8M0 scale amortized over 32 MXFP4 elements
    ex.add_text(
        8,
        296,
        "MXFP4 共享微缩放 (32 个 4-bit E2M1 共用 1 个 8-bit E8M0 纯指数缩放因子):",
        size="note",
        color="fg",
    )
    ex.add_node("mx_d", 8, 328, 384, 40, "32 x E2M1 数据 (32 x 4b = 128 bit)", color="done", size="note")
    ex.add_node("mx_s", 400, 328, 192, 40, "1 x E8M0 共享缩放 (8 bit = 2^e)", color="highlight", emphasis=True, size="note")

    out_path = POSTS_ROOT / "05-quantization" / "diagrams" / "05-bitformats-contrast.excalidraw"
    ex.build(out_path, also_build_svg=True, strict=True)


def main() -> None:
    build_01_gpu_vs_npu_arch()
    build_03_mqa_gqa_arch()
    build_03_gpu_vs_npu_kv_layout()
    build_04_sram_tiling_arch()
    build_05_bitformats_contrast()
    print("Built all 5 foundations static diagrams successfully.")


if __name__ == "__main__":
    main()
