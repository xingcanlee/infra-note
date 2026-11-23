"""Build and compile all static diagrams for the `foundations` series."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from diagram_kit import CANVAS_W, DrawioCanvas, ExcalidrawScene  # noqa: E402
from diagram_kit.tokens import BASE_LIGHT, resolve_tone  # noqa: E402

POSTS_ROOT = (
    Path(__file__).resolve().parents[2] / "src" / "content" / "posts" / "foundations"
)


def build_01_forward_pass_flow() -> None:
    """Chapter 01: Top-to-bottom Transformer single-layer flow classifying GEMM / Vector / Attention."""
    c = DrawioCanvas(
        page_name="Decoder Layer Forward Flow",
        diagram_id="foundations-01-forward-pass-flow",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "Transformer 单层前向：三类计算负载（GEMM / Vector / Attention）与双残差直通通道",
        size=12,
        tone="muted",
        align="center",
    )

    # ---- Center column: Top-to-Bottom main compute spine (x=104..488) ----
    c.node("in_x", 128, 32, 336, 40, "输入激活 X  [M, D]  (M = B × S, BF16)", tone="neutral", font_size=12)

    c.group("attn_grp", 104, 96, 384, 256, title="注意力子层", tone="neutral", dashed=True)
    c.node("norm1", 128, 128, 336, 40, "1. RMSNorm₁ · Vector 归约（访存受限）", tone="activation", font_size=12)
    c.node("qkv", 128, 184, 336, 40, "2. Q / K / V 投影 · GEMM（2:1 GQA）", tone="active", emphasis=True, font_size=12)
    c.node("attn", 128, 240, 336, 40, "3. 因果 Self-Attention + Softmax · 序列交互", tone="highlight", emphasis=True, font_size=12)
    c.node("wo", 128, 296, 336, 40, "4. 输出投影 W_O · GEMM", tone="active", font_size=12)

    c.node("res1", 128, 384, 336, 40, "⊕ 残差相加 1 → X_mid [M, D] (Add)", tone="activation", font_size=12)

    c.group("ffn_grp", 104, 456, 384, 224, title="SwiGLU 前馈子层", tone="neutral", dashed=True)
    c.node("norm2", 128, 488, 336, 40, "5. RMSNorm₂ · Vector 归约（访存受限）", tone="activation", font_size=12)
    c.node("gate", 128, 552, 160, 48, "6a. Gate + SiLU\nGEMM→D_ff + 激活", tone="active", emphasis=True, font_size=12)
    c.node("up", 304, 552, 160, 48, "6b. Up 升维\nGEMM → D_ff", tone="active", emphasis=True, font_size=12)
    c.node("down", 128, 624, 336, 40, "6c. 门控相乘 (⊙) + Down · GEMM 占 60%+", tone="active", emphasis=True, font_size=12)

    c.node("res2", 128, 704, 336, 40, "⊕ 残差相加 2 → Y [M, D] (Add)", tone="activation", font_size=12)

    c.connect("e_in", "in_x", "norm1", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("e_12", "norm1", "qkv", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("e_23", "qkv", "attn", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("e_34", "attn", "wo", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("e_4r", "wo", "res1", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("e_rn", "res1", "norm2", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("e_ng", "norm2", "gate", exit_xy=(0.2381, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("e_nu", "norm2", "up", exit_xy=(0.7619, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("e_gd", "gate", "down", exit_xy=(0.5, 1.0), entry_xy=(0.2381, 0.0), tone="fg")
    c.connect("e_ud", "up", "down", exit_xy=(0.5, 1.0), entry_xy=(0.7619, 0.0), tone="fg")
    c.connect("e_dr", "down", "res2", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")

    # ---- Left column: Clean straight residual bypass highway (x=56, outside groups) ----
    c.connect(
        "e_res1",
        "in_x",
        "res1",
        exit_xy=(0.0, 0.5),
        entry_xy=(0.0, 0.5),
        points=[(56, 52), (56, 404)],
        tone="muted",
        dashed=True,
    )
    c.text("lbl_res1", 0, 208, 48, 24, "+X", size=12, tone="muted", align="right")

    c.connect(
        "e_res2",
        "res1",
        "res2",
        exit_xy=(0.25, 1.0),
        entry_xy=(0.0, 0.5),
        points=[(212, 440), (56, 440), (56, 724)],
        tone="muted",
        dashed=True,
    )
    c.text("lbl_res2", 0, 560, 48, 24, "+X_mid", size=12, tone="muted", align="right")

    # ---- Right column: Compute-type classification cards (aligned with hue legend) ----
    c.node(
        "card_gemm",
        504,
        96,
        184,
        192,
        "类型 A · 稠密矩阵乘\n(GEMM / GEMV)\n\n• QKV / O / SwiGLU\n• 占 99%+ FLOPs\n• Tensor Core / Cube\n• 瓶颈随并发 M 迁移",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "card_vec",
        504,
        312,
        184,
        192,
        "类型 B · 向量与逐元素\n(Vector / Add)\n\n• RMSNorm / SiLU / ⊕\n• FLOPs < 1%, I=O(1)\n• CUDA Core / Vector\n• 恒为 Memory-bound",
        tone="activation",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "card_attn",
        504,
        528,
        184,
        192,
        "类型 C · 序列交互\n(Self-Attention)\n\n• QK^T · Softmax · PV\n• 随上下文 S 增长\n• 矩阵+向量+KV 带宽\n• 详见第 3–5 章专题",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )

    out_path = POSTS_ROOT / "01-workload-and-roofline" / "diagrams" / "01-forward-pass-flow.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_01_kernel_fusion_hbm_trips() -> None:
    """Chapter 01: Crisp Modular-style schematic of unfused (6 HBM trips) vs fused (2 HBM trips)."""
    c = DrawioCanvas(
        page_name="Kernel Fusion HBM Trips",
        diagram_id="foundations-01-kernel-fusion-hbm-trips",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "算子融合消除中间写回：实线↑ 从 HBM 读取 · 虚线↓ 写回 HBM · 横线→ 片上寄存器/UB 直连",
        size=12,
        tone="muted",
        align="center",
    )

    (lx, ly, lw, lh), (rx, ry, rw, rh) = c.swimlane_pair(
        "fusion",
        "未融合：3 次启动 · 6 次 HBM 往返",
        "融合 Kernel：1 次启动 · 2 次 HBM 往返",
        y=32,
        h=280,
        total_w=CANVAS_W,
        gap=16,
        left_tone="highlight",
        right_tone="active",
    )

    # Left: Unfused top SM/AIV band -> 6 plumb-vertical trips <-> bottom HBM
    c.group(
        "u_sm_band",
        lx + 8,
        ly + 8,
        288,
        80,
        title="SM / Vector 片上算子（逐次启动）",
        tone="neutral",
        dashed=False,
    )
    u_ops = [
        ("u_op1", lx + 16, "RMSNorm"),
        ("u_op2", lx + 120, "SiLU"),
        ("u_op3", lx + 224, "× Mul"),
    ]
    for oid, ox, otxt in u_ops:
        c.node(oid, ox, ly + 48, 64, 32, otxt, tone="highlight", font_size=12)

    u_hbm_x = lx + 8
    u_hbm_w = 288
    c.node(
        "u_hbm",
        u_hbm_x,
        ly + 168,
        u_hbm_w,
        40,
        "片外 HBM 显存（6× 总线往返）",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    for idx, (oid, ox, _) in enumerate(u_ops):
        rel_ld = round((ox + 16 - u_hbm_x) / u_hbm_w, 4)
        rel_st = round((ox + 48 - u_hbm_x) / u_hbm_w, 4)
        c.connect(
            f"u_ld{idx}",
            "u_hbm",
            oid,
            tone="fg",
            ortho=False,
            exit_xy=(rel_ld, 0.0),
            entry_xy=(0.25, 1.0),
        )
        c.connect(
            f"u_st{idx}",
            oid,
            "u_hbm",
            tone="muted",
            dashed=True,
            ortho=False,
            exit_xy=(0.75, 1.0),
            entry_xy=(rel_st, 0.0),
        )

    # Right: Fused top SM/AIV band -> 2 plumb-vertical trips <-> bottom HBM
    c.group(
        "f_sm_band",
        rx + 8,
        ry + 8,
        288,
        80,
        title="SM 寄存器 / 昇腾 UB（单 Kernel 链）",
        tone="active",
        dashed=False,
    )
    c.node("f_op1", rx + 16, ry + 48, 64, 32, "RMSNorm", tone="activation", emphasis=True, font_size=12)
    c.node("f_op2", rx + 120, ry + 48, 64, 32, "SiLU", tone="activation", emphasis=True, font_size=12)
    c.node("f_op3", rx + 224, ry + 48, 64, 32, "× Mul", tone="activation", emphasis=True, font_size=12)

    c.connect("f_ch1", "f_op1", "f_op2", tone="fg", emphasis=True, ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("f_ch2", "f_op2", "f_op3", tone="fg", emphasis=True, ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))

    c.node("f_save", rx + 88, ry + 112, 128, 32, "省 3× HBM 流量", tone="active", dashed=True, font_size=12)
    f_hbm_x = rx + 8
    f_hbm_w = 288
    c.node(
        "f_hbm",
        f_hbm_x,
        ry + 168,
        f_hbm_w,
        40,
        "片外 HBM 显存（仅首尾 2× 往返）",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    rel_f_ld = round((rx + 16 + 32 - f_hbm_x) / f_hbm_w, 4)
    rel_f_st = round((rx + 224 + 32 - f_hbm_x) / f_hbm_w, 4)
    c.connect(
        "f_ld",
        "f_hbm",
        "f_op1",
        tone="fg",
        emphasis=True,
        ortho=False,
        exit_xy=(rel_f_ld, 0.0),
        entry_xy=(0.5, 1.0),
    )
    c.connect(
        "f_st",
        "f_op3",
        "f_hbm",
        tone="muted",
        dashed=True,
        emphasis=True,
        ortho=False,
        exit_xy=(0.5, 1.0),
        entry_xy=(rel_f_st, 0.0),
    )

    out_path = POSTS_ROOT / "01-workload-and-roofline" / "diagrams" / "01-kernel-fusion-hbm-trips.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_01_roofline_concept() -> None:
    """Chapter 01: Clean single-chip log-scale Roofline concept diagram."""
    c = DrawioCanvas(
        page_name="Single-Chip Roofline Concept",
        diagram_id="foundations-01-roofline-concept",
        width=CANVAS_W,
    )

    _, hi_fill, hi_stroke = resolve_tone("highlight")
    _, act_fill, act_stroke = resolve_tone("active")

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "单卡 Roofline 模型几何结构：带宽斜坡（Memory-bound）· 算力拐点 I* · 算力平台（Compute-bound）",
        size=12,
        tone="muted",
        align="center",
    )

    c.text("y_title", 16, 32, 240, 24, "实际算力 P_attained (TFLOPS，对数)", size=12, tone="muted", align="left")

    # Regime backdrop boxes (72..344 left, 344..648 right, y=56..312)
    c.group("reg_mem", 72, 56, 272, 256, title="Memory-bound · 带宽受限区 (I < I*)", tone="highlight", dashed=True)
    c.group("reg_cmp", 344, 56, 304, 256, title="Compute-bound · 算力受限区 (I ≥ I*)", tone="active", dashed=True)

    # Coordinate axes & dashed ridge/ceiling guides
    c._add_raw_line("ax_y", 72, 312, 72, 56, BASE_LIGHT["fg"], stroke_w=1.5, arrow_end=True)
    c._add_raw_line("ax_x", 72, 312, 648, 312, BASE_LIGHT["fg"], stroke_w=1.5, arrow_end=True)
    c._add_raw_line("guide_y", 72, 120, 344, 120, BASE_LIGHT["muted"], stroke_w=1.0, dashed=True)
    c._add_raw_line("guide_ridge", 344, 120, 344, 312, act_stroke, stroke_w=1.25, dashed=True)

    # Bold Roofline polyline (exact slope -2/3 from (104,280) to ridge (344,120), then flat ceiling to (632,120))
    c._add_raw_line("roof_slope", 104, 280, 344, 120, hi_stroke, stroke_w=3.0)
    c._add_raw_line("roof_ceil", 344, 120, 632, 120, act_stroke, stroke_w=3.0)

    # Operating points & Ridge circle on exact 8px intersections
    dot_hi = f"ellipse;whiteSpace=wrap;html=1;fillColor={hi_fill};strokeColor={hi_stroke};strokeWidth=2;"
    dot_act = f"ellipse;whiteSpace=wrap;html=1;fillColor={act_fill};strokeColor={act_stroke};strokeWidth=2;"
    c._add_vertex(c._claim_id("dot_dec"), "", dot_hi, 144, 240, 16, 16)
    c._add_vertex(c._claim_id("dot_bat"), "", dot_hi, 240, 176, 16, 16)
    c._add_vertex(c._claim_id("dot_ridge"), "", dot_act, 336, 112, 16, 16)
    c._add_vertex(c._claim_id("dot_pre"), "", dot_act, 536, 112, 16, 16)

    # Clean non-overlapping callouts & labels
    c.node("slope_lbl", 88, 136, 144, 48, "带宽斜坡\nP = I × BW_HBM", tone="highlight", dashed=True, font_size=12)
    c.text("ceil_lbl", 360, 88, 272, 24, "算力平台上限：P_attained = P_peak", size=12, tone="active", align="center", bold=True)

    c.node("call_dec", 168, 248, 168, 48, "类型 B (RMSNorm / SiLU)\n& Decode (M=1)：卡带宽", tone="highlight", font_size=12)
    c.text("call_bat", 256, 192, 80, 32, "增大 M\n沿斜坡右移", size=12, tone="highlight", align="left", bold=True)

    c.node("call_pre", 464, 152, 168, 48, "类型 A · Prefill\n大 M GEMM：吃满算力", tone="active", emphasis=True, font_size=12)
    c._add_raw_line("stem_pre", 544, 128, 544, 152, act_stroke, stroke_w=1.25)

    c.node(
        "takeaway",
        360,
        224,
        272,
        72,
        "跨过拐点 I* 才进入算力受限区：\n• GEMM (I ≈ M) 靠增大并发 M 右移\n• Vector (I = O(1)) 恒卡在左侧斜坡",
        tone="neutral",
        dashed=True,
        align="left",
        font_size=12,
    )

    c.text("y_peak", 0, 104, 64, 32, "P_peak", size=12, tone="active", align="right", bold=True)
    c.text("x_ridge", 272, 320, 144, 24, "拐点 I* = P_peak / BW", size=12, tone="active", align="center", bold=True)
    c.text("x_title", 448, 320, 200, 24, "算术强度 I (FLOPs/B，对数) →", size=12, tone="muted", align="right")

    out_path = POSTS_ROOT / "01-workload-and-roofline" / "diagrams" / "01-roofline-concept.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_02_sm_vs_aicore_floorplan() -> None:
    """Chapter 02: Full-width hardware silicon floorplan (One H100 SM vs One Ascend 1C2V AI Core)."""
    c = DrawioCanvas(
        page_name="SM vs AI Core Floorplan",
        diagram_id="foundations-02-sm-vs-aicore-floorplan",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "单核内部硅片硬件分布图：NVIDIA H100 SM（4 个 Processing Block）vs 昇腾 1C2V AI Core",
        size=12,
        tone="muted",
        align="center",
    )

    # ---- TOP FLOORPLAN: ONE NVIDIA H100 SM (y=32..376) ----
    c.group(
        "sm_box",
        0,
        32,
        CANVAS_W,
        344,
        title="One NVIDIA H100 SM（1 个物理 SM 切分为 4 个对称处理块，共用底部共享内存与 TMA）",
        tone="active",
        dashed=False,
    )

    pb_coords = [
        (0, 16, 64),
        (1, 352, 64),
        (2, 16, 176),
        (3, 352, 176),
    ]
    for i, px, py in pb_coords:
        c.group(f"pb{i}", px, py, 320, 104, title=f"Processing Block {i}", tone="neutral", dashed=True)
        # Only Processing Block 0 spells out detailed unit capacity/shape; sibling blocks deduplicate clutter
        reg_lbl = "Reg File (64 KB)" if i == 0 else "Reg File"
        cuda_lbl = "32× FP32 CUDA Cores" if i == 0 else "CUDA Cores"
        tc_lbl = "Tensor Core (16×8×16)" if i == 0 else "Tensor Core"
        c.node(f"pb{i}_sched", px + 8, py + 32, 144, 24, "Warp Scheduler", tone="highlight", font_size=12)
        c.node(f"pb{i}_reg", px + 168, py + 32, 144, 24, reg_lbl, tone="activation", font_size=12)
        c.node(f"pb{i}_cuda", px + 8, py + 64, 144, 32, cuda_lbl, tone="neutral", font_size=12)
        c.node(f"pb{i}_tc", px + 168, py + 64, 144, 32, tc_lbl, tone="active", emphasis=True, font_size=12)

    c.node(
        "sm_smem",
        16,
        288,
        656,
        32,
        "L1 Cache / Shared Memory（SMEM 共享 SRAM 池 · 共 256 KB · 32 Banks）",
        tone="activation",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "sm_tma",
        16,
        328,
        656,
        32,
        "Tensor Memory Accelerator (TMA) · 硬件异步多维 ND 分块引擎",
        tone="highlight",
        font_size=12,
    )

    # ---- BOTTOM FLOORPLAN: ONE ASCEND 1C2V AI CORE (y=392..696) ----
    c.group(
        "aic_box",
        0,
        392,
        CANVAS_W,
        304,
        title="One 华为昇腾 DaVinci 1C2V AI Core（Scalar + 1×Cube + 2×Vector 硬件模块与数据流）",
        tone="activation",
        dashed=False,
    )

    c.node(
        "a_scalar",
        16,
        424,
        656,
        32,
        "Scalar 标量控制核 · 译码指令并向 MTE2 / MTE1 / Cube / FixPipe / Vector / MTE3 写入异步队列",
        tone="neutral",
        font_size=12,
    )

    # Left half: 1x Cube Unit (x=16..288, y=472..680)
    c.group("a_cube_grp", 16, 472, 272, 208, title="1× Cube 矩阵计算核", tone="active", dashed=True)
    c.node("ac_mte2", 24, 512, 104, 48, "MTE2 → L1\n+ MTE1 馈送", tone="highlight", font_size=12)
    c.node("ac_cube", 152, 512, 128, 48, "L0A/L0B →\nCube 16×16×16", tone="active", emphasis=True, font_size=12)
    c.node("ac_note", 24, 600, 104, 56, "L0C 仅累加\n经 FixPipe 迁出", tone="neutral", dashed=True, font_size=12)
    c.node("ac_l0c", 152, 600, 128, 56, "L0C 256 KB\nFP32 累加器", tone="highlight", emphasis=True, font_size=12)

    c.connect("ce_1", "ac_mte2", "ac_cube", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("ce_2", "ac_cube", "ac_l0c", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))

    # Middle corridor bridge (x=304..368, y=600..656): outside both groups so fan-out has zero collision
    c.node("ac_fix", 304, 600, 64, 56, "FixPipe\nL0C→UB", tone="activation", dashed=True, font_size=12)
    c.connect("ce_3", "ac_l0c", "ac_fix", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))

    # Right half: 2x Vector Cores (x=384..672, y=472..680)
    c.group("a_vec_grp", 384, 472, 288, 208, title="2× Vector 向量核（1C2V）", tone="activation", dashed=True)
    c.node("av0_ub", 392, 512, 80, 56, "AIV 0 UB\n192 KB", tone="activation", emphasis=True, font_size=12)
    c.node("av0_vec", 488, 512, 96, 56, "Vector SIMD\nNorm / Exp", tone="active", font_size=12)
    c.node("av0_mte", 600, 512, 64, 56, "MTE2/3\nHBM↔UB", tone="highlight", font_size=12)

    c.node("av1_ub", 392, 600, 80, 56, "AIV 1 UB", tone="activation", emphasis=True, font_size=12)
    c.node("av1_vec", 488, 600, 96, 56, "Vector SIMD\n反量化/归约", tone="active", font_size=12)
    c.node("av1_mte", 600, 600, 64, 56, "MTE2/3\n并行搬运", tone="highlight", font_size=12)

    c.connect("ve_f0", "ac_fix", "av0_ub", tone="fg", ortho=True, exit_xy=(0.5, 0.0), entry_xy=(0.0, 0.5), points=[(336, 540)])
    c.connect("ve_f1", "ac_fix", "av1_ub", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("ve_0a", "av0_ub", "av0_vec", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("ve_0b", "av0_vec", "av0_mte", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("ve_1a", "av1_ub", "av1_vec", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("ve_1b", "av1_vec", "av1_mte", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))

    out_path = POSTS_ROOT / "02-gpu-and-ascend-architecture" / "diagrams" / "02-sm-vs-aicore-floorplan.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_02_tensor_core_vs_cube_tiling() -> None:
    """Chapter 02: Pure matrix & layout geometry (D = A*B+C, SMEM Bank Swizzle vs FRACTAL_NZ)."""
    c = DrawioCanvas(
        page_name="Tensor Core vs Ascend Cube Geometry",
        diagram_id="foundations-02-tensor-core-vs-cube-tiling",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "矩阵计算引擎几何与布局对照：上 D = A × B + C 分块乘累加 · 下 SMEM Bank Swizzle vs FRACTAL_NZ",
        size=12,
        tone="muted",
        align="center",
    )

    # ---- TOP BAND: D = A x B + C Matrix Geometry (y=32..184) ----
    c.group("mat_eq", 0, 32, CANVAS_W, 152, title="融合矩阵指令几何：低精度分块输入（BF16/FP8/INT8）→ FP32 累加防溢出", tone="neutral", dashed=False)

    grid_a = [[("", "active", False) for _ in range(4)] for _ in range(4)]
    grid_b = [[("", "activation", False) for _ in range(4)] for _ in range(4)]
    grid_c = [[("", "highlight", False) for _ in range(4)] for _ in range(4)]
    grid_d = [[("", "highlight", True) for _ in range(4)] for _ in range(4)]

    c.heatmap_grid("ma", 16, 64, 24, 24, grid_a)
    c.text("ma_lbl", 16, 160, 96, 20, "A [M, K] (入)", size=12, tone="active", align="center", bold=True)
    c.text("op_mul", 112, 96, 24, 32, "×", size=18, tone="fg", align="center", bold=True)

    c.heatmap_grid("mb", 136, 64, 24, 24, grid_b)
    c.text("mb_lbl", 136, 160, 96, 20, "B [K, N] (入)", size=12, tone="activation", align="center", bold=True)
    c.text("op_add", 232, 96, 24, 32, "+", size=18, tone="fg", align="center", bold=True)

    c.heatmap_grid("mc", 256, 64, 24, 24, grid_c)
    c.text("mc_lbl", 256, 160, 96, 20, "C (FP32 累)", size=12, tone="highlight", align="center", bold=True)
    c.text("op_eq", 352, 96, 24, 32, "=", size=18, tone="fg", align="center", bold=True)

    c.heatmap_grid("md", 376, 64, 24, 24, grid_d)
    c.text("md_lbl", 376, 160, 96, 20, "D (FP32 出)", size=12, tone="highlight", align="center", bold=True)

    c.node(
        "mat_spec",
        488,
        64,
        184,
        96,
        "硬件激活 4 项硬契约\n• 形状整除 (16×8×16 / 16³)\n• 指针 16B / 32B 对齐\n• 数据供应跟上吞吐\n• MUFU / FixPipe 不阻塞",
        tone="neutral",
        dashed=True,
        font_size=12,
    )

    # ---- BOTTOM SWIMLANES: GPU SMEM Swizzle vs Ascend FRACTAL_NZ (y=200..488) ----
    (lx, ly, lw, lh), (rx, ry, rw, rh) = c.swimlane_pair(
        "layout",
        "NVIDIA SMEM 异或 Swizzle 消除 Bank 冲突",
        "昇腾 FRACTAL_NZ 16×16 Z 型分形布局",
        y=200,
        h=288,
        total_w=CANVAS_W,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    # Left: 4x4 ND Bank Conflict -> Swizzle 4x4 Zero Conflict
    nd_banks = [
        [("B0", "highlight", True), ("B1", "neutral", False), ("B2", "neutral", False), ("B3", "neutral", False)],
        [("B0", "highlight", True), ("B1", "neutral", False), ("B2", "neutral", False), ("B3", "neutral", False)],
        [("B0", "highlight", True), ("B1", "neutral", False), ("B2", "neutral", False), ("B3", "neutral", False)],
        [("B0", "highlight", True), ("B1", "neutral", False), ("B2", "neutral", False), ("B3", "neutral", False)],
    ]
    c.heatmap_grid("nd_b", lx, ly + 24, 24, 24, nd_banks)
    c.text("nd_b_t", lx, ly + 4, 112, 20, "行主序 (同列撞 B0)", size=12, tone="highlight", align="left", bold=True)

    c.node("sw_tag", lx + 112, ly + 56, 80, 32, "Swizzle →\n异或打散", tone="active", dashed=True, font_size=12)

    sw_banks = [
        [("B0", "active", True), ("B1", "neutral", False), ("B2", "neutral", False), ("B3", "neutral", False)],
        [("B1", "active", True), ("B0", "neutral", False), ("B3", "neutral", False), ("B2", "neutral", False)],
        [("B2", "active", True), ("B3", "neutral", False), ("B0", "neutral", False), ("B1", "neutral", False)],
        [("B3", "active", True), ("B2", "neutral", False), ("B1", "neutral", False), ("B0", "neutral", False)],
    ]
    c.heatmap_grid("sw_b", lx + 208, ly + 24, 24, 24, sw_banks)
    c.text("sw_b_t", lx + 192, ly + 4, 112, 20, "重排后 (同列 0 冲突)", size=12, tone="active", align="right", bold=True)

    # Bottom Tensor Core pipe chain
    c.node("gp_1", lx, ly + 152, 88, 56, "TMA 16B\nND 块读取", tone="neutral", font_size=12)
    c.node("gp_2", lx + 104, ly + 152, 96, 56, "Tensor Core\nWGMMA", tone="active", emphasis=True, font_size=12)
    c.node("gp_3", lx + 216, ly + 152, 88, 56, "Reg / TMEM\n可原地缩放", tone="highlight", font_size=12)
    c.connect("gpe1", "gp_1", "gp_2", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("gpe2", "gp_2", "gp_3", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))

    # Right: Ascend FRACTAL_ND -> FRACTAL_NZ 16x16 Z-order 2x2 blocks
    a_nd = [
        [("r0", "neutral", False), ("r0", "neutral", False), ("r0", "neutral", False), ("r0", "neutral", False)],
        [("r1", "neutral", False), ("r1", "neutral", False), ("r1", "neutral", False), ("r1", "neutral", False)],
        [("r2", "neutral", False), ("r2", "neutral", False), ("r2", "neutral", False), ("r2", "neutral", False)],
        [("r3", "neutral", False), ("r3", "neutral", False), ("r3", "neutral", False), ("r3", "neutral", False)],
    ]
    c.heatmap_grid("a_nd", rx, ly + 24, 24, 24, a_nd)
    c.text("a_nd_t", rx, ly + 4, 112, 20, "ND (行连续)", size=12, tone="muted", align="left", bold=True)

    c.node("nz_tag", rx + 112, ly + 56, 80, 32, "ND2NZ →\n枚举 29", tone="activation", dashed=True, font_size=12)

    a_nz = [
        [("NZ0", "activation", True), ("NZ2", "active", False)],
        [("NZ1", "activation", True), ("NZ3", "active", False)],
    ]
    c.heatmap_grid("a_nz", rx + 208, ly + 24, 48, 48, a_nz)
    c.text("a_nz_t", rx + 192, ly + 4, 112, 20, "NZ (16×16 列 Z 块)", size=12, tone="activation", align="right", bold=True)

    # Bottom Cube pipe chain
    c.node("ap_1", rx, ly + 152, 88, 56, "L0A / L0B\n64 KB 馈送", tone="neutral", font_size=12)
    c.node("ap_2", rx + 104, ly + 152, 96, 56, "Cube 16³\nMMAD (M≥64)", tone="activation", emphasis=True, font_size=12)
    c.node("ap_3", rx + 216, ly + 152, 88, 56, "L0C 256 KB\nFixPipe→UB", tone="highlight", font_size=12)
    c.connect("ape1", "ap_1", "ap_2", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("ape2", "ap_2", "ap_3", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))

    out_path = POSTS_ROOT / "02-gpu-and-ascend-architecture" / "diagrams" / "02-tensor-core-vs-cube-tiling.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_04_mqa_gqa_arch() -> None:
    """Chapter 04: Strictly proportional MHA (8:8=100%) vs GQA (8:2=25%) vs MQA (8:1=12.5%)."""
    c = DrawioCanvas(
        page_name="MHA GQA MQA Proportional KV",
        diagram_id="foundations-04-mqa-gqa-arch",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "固定 8 个 Query 头 (100% 基准)，KV Cache 实体按 8 : 2 : 1 等比例缩放",
        size=12,
        tone="muted",
        align="center",
    )

    track_x = 144
    track_w = 512

    rows = [
        ("mha", "MHA (8:8, g=1)\n100% KV 容量\nAI ≈ 1.0 FLOP/B", 8, "neutral", False, "100% 物理 KV (8 组独立头)"),
        ("gqa", "GQA-2 (8:2, g=4)\n25% KV 容量\nAI 提升 ~4x", 2, "active", True, "25% KV (2 组) -> 节省 75%"),
        ("mqa", "MQA (8:1, g=8)\n12.5% KV 容量\nAI 提升 ~8x", 1, "done", True, "12.5% KV (1 组) -> 节省 87.5%"),
    ]

    cur_y = 32
    for key, side_label, n_kv, kv_tone, emph, kv_summary in rows:
        row_h = 160
        c.group(f"{key}_box", 8, cur_y, CANVAS_W - 16, row_h, title="", tone="neutral", dashed=False)
        c.text(f"{key}_lbl", 16, cur_y + 24, 120, 96, side_label, size=12, tone=kv_tone if emph else "fg", align="left", bold=True)

        qy = cur_y + 16
        kvy = cur_y + 88

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

    out_path = POSTS_ROOT / "04-kv-cache-and-gqa" / "diagrams" / "04-mqa-gqa-arch.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_04_gpu_vs_npu_kv_layout() -> None:
    """Chapter 04: vLLM GPU ND Paged KV vs vllm-ascend PA_NZ 16x16 Cube-aligned layout."""
    c = DrawioCanvas(
        page_name="GPU ND vs Ascend PA_NZ KV Layout",
        diagram_id="foundations-04-gpu-vs-npu-kv-layout",
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
    col_w = lw - 16

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
    c.text("g_blk_title", col_x_l, ly + 104, 224, 24, "单个物理块内的 K / V (ND 行主序)", size=12, tone="fg", align="left", bold=True)
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
        splits=[(0.25, "y", "", ""), (0.50, "y", "", ""), (0.75, "y", "", "")],
    )
    for ri, row_txt in enumerate(("tok 0..15", "tok 16..31", "tok 32..47", "tok 48..63 (沿 head_size 连续)")):
        c.text(f"g_blk_r{ri}", col_x_l, ly + 128 + ri * 32, col_w, 32, row_txt, size=12, tone="fg", align="center")
    c.text("g_blk_shape", col_x_l, ly + 264, col_w, 32, "切片视图: [num_blocks, block_size, n_kv, head_size]", size=12, tone="muted", align="left")
    c.node("g_op", col_x_l, ly + 312, col_w, 72, "写入: reshape_and_cache_flash(..., slot_mapping)\n对齐契约: canonicalize_singleton_dim_strides (>=16B)", tone="neutral", font_size=12)
    c.node("g_blk_sz", col_x_l, ly + 400, col_w, 56, "默认 block_size: MultipleOf(16) · SM90 d512 FP8 取 64", tone="highlight", font_size=12)

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
    c.text("a_blk_title", col_x_r, ry + 104, 224, 24, "PA_NZ 16x16 Cube 分形子块", size=12, tone="fg", align="left", bold=True)
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
        splits=[(0.25, "x", "", ""), (0.50, "x", "", ""), (0.75, "x", "", ""), (0.50, "y", "", "")],
    )
    slice_w = col_w // 4
    for ci, col_txt in enumerate(("D[0:16]", "D[16:32]", "D[32:48]", "D[48:64]")):
        c.text(f"a_blk_c{ci}", col_x_r + ci * slice_w, ry + 128, slice_w, 64, col_txt, size=12, tone="fg", align="center")
        c.text(f"a_blk_b{ci}", col_x_r + ci * slice_w, ry + 192, slice_w, 64, "16x16 子块", size=12, tone="muted", align="center")
    c.text("a_blk_shape", col_x_r, ry + 264, col_w, 32, "MLA view: [B, n_kv, D//16, Bs, 16] (C8 INT8 取 32)", size=12, tone="muted", align="left")
    c.node("a_op", col_x_r, ry + 312, col_w, 72, "写入: npu_scatter_pa_kv_cache (PA / PA_NZ)\n读取: FIA _forward_decode (BSND_NBSD vs BNSD_NBSD)", tone="neutral", font_size=12)
    c.node("a_blk_sz", col_x_r, ry + 400, col_w, 56, "默认 block_size = 128 · 匹配 Cube 16x16 连续突发读取", tone="highlight", font_size=12)

    c.connect("g_e1", "g_shape", "g_blk", tone="fg", exit_xy=(0.9, 1.0), entry_xy=(0.9, 0.0))
    c.connect("a_e1", "a_shape", "a_blk", tone="fg", exit_xy=(0.9, 1.0), entry_xy=(0.9, 0.0))

    out_path = POSTS_ROOT / "04-kv-cache-and-gqa" / "diagrams" / "04-gpu-vs-npu-kv-layout.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_05_sram_tiling_arch() -> None:
    """Chapter 05: FlashAttention HBM vs on-chip SRAM/UB tiling with zero inline edge labels."""
    c = DrawioCanvas(
        page_name="SRAM Tiling Architecture",
        diagram_id="foundations-05-sram-tiling-arch",
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

    c.group("hbm", 8, 32, CANVAS_W - 16, 128, title="片外 HBM 显存 (大容量 · 低带宽: H800 3.35 TB/s)", tone="neutral", dashed=False)
    c.node("hbm_q", 24, 72, 120, 64, "完整 Q [N, d]\n按块 Br 分片读一次", tone="active", font_size=12)
    c.node("hbm_kv", 168, 72, 160, 64, "完整 K, V [N, d]\n分块 Bc 顺序流式读取", tone="highlight", font_size=12)
    c.node("hbm_no_sp", 352, 72, 168, 64, "已消除: S, P [N, N]\nO(N^2) 中间矩阵不写回 HBM", tone="muted", dashed=True, font_size=12)
    c.node("hbm_o", 560, 72, 104, 64, "最终 O [N, d]\n仅循环末尾写回一次", tone="done", font_size=12)

    c.group("sram", 8, 216, CANVAS_W - 16, 264, title="", tone="active", dashed=False)
    c.text("sram_hdr", 192, 224, 368, 24, "片上高速缓存 (GPU SMEM/TMEM · 昇腾 L1/L0C + UB)", size=12, tone="active", align="left", bold=True)

    c.node("sram_q", 32, 264, 104, 64, "常驻切片 Q_i\n[B_r, d]", tone="active", emphasis=True, font_size=12)
    c.node("sram_kv", 32, 376, 104, 72, "当前分块 Tile K_j, V_j\n[B_c, d] (双缓冲覆写)", tone="highlight", emphasis=True, font_size=12)

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

    c.node("sram_fin", 560, 328, 104, 96, "循环 Tc 块后\n唯一一次除法\nO_i = O_i~ / l_i", tone="done", dashed=True, font_size=12)

    c.connect("e_hq", "hbm_q", "sram_q", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_hq", 96, 168, 88, 24, "TMA / MTE2", size=12, tone="fg", align="left")

    c.connect("e_hkv", "hbm_kv", "sram_kv", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(1.0, 0.5), points=[(248, 176), (152, 176), (152, 412)])
    c.text("lbl_hkv", 160, 184, 80, 24, "按 Bc 迭代", size=12, tone="fg", align="left")

    c.connect("e_qs", "sram_q", "sram_s", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.4))
    c.connect("e_kvs", "sram_kv", "sram_s", tone="fg", exit_xy=(1.0, 0.25), entry_xy=(0.0, 0.8))
    c.connect("e_ssm", "sram_s", "sram_sm", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))

    c.connect("e_sma", "sram_sm", "sram_acc", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.875))
    c.text("lbl_sma", 312, 384, 72, 24, "alpha, P~", size=12, tone="fg", align="center")

    c.connect("e_fin", "sram_acc", "sram_fin", tone="fg", ortho=False, exit_xy=(1.0, 0.65), entry_xy=(0.0, 0.5))
    c.text("lbl_fin", 528, 348, 32, 24, "末尾", size=12, tone="fg", align="center")

    c.connect("e_wo", "sram_fin", "hbm_o", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.text("lbl_wo", 520, 172, 84, 24, "仅写 O(Nd)", size=12, tone="fg", align="right")

    out_path = POSTS_ROOT / "05-flash-attention" / "diagrams" / "05-sram-tiling-arch.drawio"
    c.save(out_path, strict=True, build_svg=True)


def build_06_bitformats_contrast() -> None:
    """Chapter 06: Proportional bitfield contrast of BF16, INT8, FP8 E4M3, and MXFP4."""
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

    ex.bitfield_comparison(rows, x=8, y=32, bit_px=24, row_h=40, row_gap=24, label_w=120)

    ex.add_text(
        8,
        296,
        "MXFP4 共享微缩放 (32 个 4-bit E2M1 共用 1 个 8-bit E8M0 纯指数缩放因子):",
        size="note",
        color="fg",
    )
    ex.add_node("mx_d", 8, 328, 384, 40, "32 x E2M1 数据 (32 x 4b = 128 bit)", color="done", size="note")
    ex.add_node("mx_s", 400, 328, 192, 40, "1 x E8M0 共享缩放 (8 bit = 2^e)", color="highlight", emphasis=True, size="note")

    out_path = POSTS_ROOT / "06-quantization" / "diagrams" / "06-bitformats-contrast.excalidraw"
    ex.build(out_path, also_build_svg=True, strict=True)


def main() -> None:
    build_01_forward_pass_flow()
    build_01_kernel_fusion_hbm_trips()
    build_01_roofline_concept()
    build_02_sm_vs_aicore_floorplan()
    build_02_tensor_core_vs_cube_tiling()
    build_04_mqa_gqa_arch()
    build_04_gpu_vs_npu_kv_layout()
    build_05_sram_tiling_arch()
    build_06_bitformats_contrast()
    print("Built all 9 foundations static diagrams successfully.")


if __name__ == "__main__":
    main()
