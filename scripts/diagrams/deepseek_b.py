"""生成 DeepSeek Part B (06-moe ~ 10-architecture-synthesis) 全部静态架构与对比图。"""
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from diagram_kit import DrawioCanvas, ExcalidrawScene  # noqa: E402

POSTS_ROOT = SCRIPTS_DIR.parent / "src" / "content" / "posts" / "deepseek"


def build_06_moe_arch() -> None:
    """图 2：1 Shared + 256 Fine-Grained Experts 与 GPU/Ascend NPU 双硬件执行栈。"""
    c = DrawioCanvas(page_name="deepseekmoe-arch", diagram_id="ds-06-moe-arch", width=688)

    c.node("inp", 232, 8, 224, 32, "输入隐状态 h_t [T, 7168]", tone="neutral", emphasis=True)

    # 并行双路：1 Shared vs 256 Routed (Top-8)
    c.group("g_shared", 8, 64, 216, 104, "", tone="done", dashed=False)
    c.text("g_shared_lbl", 16, 68, 152, 24, "常驻共享专家 (1 Shared)", size=12, tone="done", align="left", bold=True)
    c.node("sh_mlp", 24, 104, 184, 48, "SwiGLU MLP (无偏置路由)\n与 Dispatch 通信重叠执行", tone="done", font_size=12)

    c.group("g_routed", 240, 64, 440, 104, "", tone="active", dashed=False)
    c.text("g_routed_lbl", 432, 68, 240, 24, "256 路由专家 (Node-Limited Top-8)", size=12, tone="active", align="right", bold=True)
    c.node("r_gate", 256, 104, 128, 48, "Sigmoid s_{i,t}\n+ 无辅损偏置 b_i", tone="active", font_size=12)
    c.node("r_grp", 400, 104, 128, 48, "8 组筛 Top M=4 组\n仅选组内 Top-8", tone="active", dashed=True, font_size=12)
    c.node("r_w", 544, 104, 120, 48, "用未偏置 s_{i,t}\n归一化加权 w_{i,t}", tone="active", font_size=12)

    c.connect("e_in_sh", "inp", "sh_mlp", tone="fg", exit_xy=(0.25, 1.0), entry_xy=(0.9, 0.0))
    c.connect("e_in_rt", "inp", "r_gate", tone="fg", exit_xy=(0.55, 1.0), entry_xy=(0.5, 0.0))
    c.connect("e_rg1", "r_gate", "r_grp", tone="fg")
    c.connect("e_rg2", "r_grp", "r_w", tone="fg")

    # 下半区：GPU vs Ascend NPU 泳道
    (lx, ly, lw, _), (rx, ry, rw, _) = c.swimlane_pair(
        "hw",
        "NVIDIA GPU (vLLM + DeepEP + DeepGEMM)",
        "Huawei Ascend NPU (vllm-ascend Runner)",
        y=192,
        h=192,
        total_w=688,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    c.node("gpu_rt", lx, ly, lw, 40, "grouped_topk / fused_grouped_topk\nSigmoid + Bias 选路与原始分数 gather", tone="active", font_size=12)
    c.node("gpu_ep", lx, ly + 56, lw, 40, "DeepEPLLPrepareAndFinalize\nNVLink/RDMA 异步 Dispatch + Combine", tone="active", dashed=True, font_size=12)
    c.node("gpu_mm", lx, ly + 112, lw, 40, "moe_align_block_size + DeepGEMM\n按 block_size 补齐并运行 FP8/BF16 GEMM", tone="active", font_size=12)

    c.node("npu_rt", rx, ry, rw, 40, "AscendMoERunner + TokenDispatcherWithMC2\n历史 AscendFusedMoE 已演进为 Runner 架构", tone="activation", font_size=12)
    c.node("npu_ep", rx, ry + 56, rw, 40, "npu_moe_distribute_dispatch_v2\n/ npu_moe_init_routing_v2 路由重排分发", tone="activation", dashed=True, font_size=12)
    c.node("npu_mm", rx, ry + 112, rw, 40, "apply_gmm1/2 (npu_grouped_matmul)\nCANN 算子执行并叠加共享专家辅助流", tone="activation", font_size=12)

    c.connect("e_g_12", "gpu_rt", "gpu_ep", tone="fg")
    c.connect("e_g_23", "gpu_ep", "gpu_mm", tone="fg")
    c.connect("e_n_12", "npu_rt", "npu_ep", tone="fg")
    c.connect("e_n_23", "npu_ep", "npu_mm", tone="fg")

    c.node("sum_out", 200, 400, 288, 32, "双路求和输出: y = Shared(h_t) + ∑ w_{i,t} E_i(h_t)", tone="done", emphasis=True, font_size=12)

    out = POSTS_ROOT / "06-moe" / "diagrams" / "06-deepseekmoe-arch.drawio"
    c.save(out, strict=True, build_svg=True)


def build_07_engram_layer() -> None:
    """11-engram-layer.drawio：修复 K [5120]=4d 与 V [1280]=1d 严格 4:1 比例。"""
    c = DrawioCanvas(page_name="engram-layer", diagram_id="ds-07-engram-layer", width=688)

    # 顶部输入张量
    c.node("in_h", 24, 8, 280, 40, "HC 多流隐藏状态 H_t [B, T, 4, 1280]", tone="neutral", emphasis=True, font_size=12)
    c.node("in_e", 384, 8, 280, 40, "多头查表拼接 e_t [B, T, 1280]", tone="active", emphasis=True, font_size=12)

    # 投影与严格 4:1 比例块 (K: 320px = 4*80px; V: 80px = 1*80px)
    c.node("proj", 384, 72, 280, 32, "合并投影 wkv: e_t -> (hc_mult + 1) × d", tone="active", font_size=12)
    c.connect("e_p1", "in_e", "proj", tone="fg")

    # 严格 4:1 视觉宽度比：K 占 4 格共 256px (4 × 64px = 5120)，V 占 1 格共 64px (1280)
    c.group("g_ratio", 192, 128, 488, 104, "", tone="neutral", dashed=True)
    c.text("g_ratio_lbl", 200, 132, 176, 24, "K/V 严格 4:1 比例对比", size=12, tone="fg", align="left", bold=True)
    for m in range(4):
        c.node(f"k_stream_{m}", 208 + m * 64, 160, 64, 40, f"K_{m}\n1280", tone="active", font_size=12)
    c.text("k_bracket", 272, 204, 192, 24, "W_K e_t: 4 × 1280 = 5120 (4d)", size=12, tone="fg", align="left")
    c.text("v_bracket", 480, 160, 88, 40, "W_V e_t:\n1d = 1280", size=12, tone="fg", align="right")
    c.node("v_stream", 576, 160, 64, 40, "V_t\n1280", tone="highlight", emphasis=True, font_size=12)

    c.connect("e_pk", "proj", "k_stream_3", tone="fg", exit_xy=(0.17, 1.0), entry_xy=(0.5, 0.0))
    c.connect("e_pv", "proj", "v_stream", tone="fg", exit_xy=(0.8, 1.0), entry_xy=(0.5, 0.0))

    # 门控与调制
    c.node("gate", 160, 264, 256, 48, "RMSNorm(H_t) · RMSNorm(K_t) / √d\n-> sign(z)√|z| -> σ = α_t [B, T, 4, 1]", tone="active", font_size=12)
    c.node("mul", 464, 264, 184, 48, "门控加权共享值\nα_t ⊙ V_t -> [B, T, 4, 1280]", tone="highlight", font_size=12)

    c.connect("e_hg", "in_h", "gate", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.15, 0.0))
    c.connect("e_kg", "k_stream_0", "gate", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.3125, 0.0))
    c.connect("e_gm", "gate", "mul", tone="fg")
    c.connect("e_vm", "v_stream", "mul", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))

    # ShortConv 演进分支与写回
    c.node("conv_note", 160, 336, 256, 40, "V3.5 论文: + ShortConv(δ=3, SiLU)\nV4.1 工程化: 无状态化移除卷积", tone="neutral", dashed=True, font_size=12)
    c.node("res_add", 464, 336, 184, 40, "残差相加写回 4 路流\nH_t' = H_t + Y_t", tone="done", emphasis=True, font_size=12)
    c.connect("e_mr", "mul", "res_add", tone="fg")
    c.connect("e_cr", "conv_note", "res_add", tone="muted", dashed=True)

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-engram-layer.drawio"
    c.save(out, strict=True, build_svg=True)


def build_07_shortconv_dilation() -> None:
    """11-shortconv-dilation.excalidraw：空洞 δ=1 重叠 vs δ=3 零重叠抽头对比。"""
    ex = ExcalidrawScene(seed=11)
    tokens = [f"t-{i}" for i in range(9, 0, -1)] + ["t"]
    # 10 slots * 56 - 8 = 552 <= 688
    x0, y0, slot_w, gap = 48, 8, 48, 8
    pitch = slot_w + gap

    ex.add_text(x0, y0, "δ=1 传统因果卷积 (k=4)：步长紧邻，相邻 N-gram 大量重叠复用", size="label", color="fg")
    row1_y = y0 + 32
    for ti, tok in enumerate(tokens):
        ex.add_node(f"tok_t_{ti}", x0 + ti * pitch, row1_y, slot_w, 32, tok, color="neutral", size="note")
    # 窗口 A 与窗口 B 分列两行对齐 t-3，清晰展示重叠区而不相撞边框
    ex.add_node("grp_t_0", x0 + 3 * pitch, row1_y + 48, 4 * slot_w + 3 * gap, 32, "窗口 A: [t-6..t-3]", color="active", size="note", dashed=True)
    ex.add_node("grp_t_1", x0 + 6 * pitch, row1_y + 88, 4 * slot_w + 3 * gap, 32, "窗口 B: [t-3..t] 重叠", color="active", size="note", dashed=True)

    row2_base = row1_y + 144
    ex.add_text(x0, row2_base, "δ=3 Engram 空洞因果卷积 (k=4, max_ngram=3)：步幅对齐 N-gram 边界，零重叠覆盖", size="label", color="fg")
    row2_y = row2_base + 32
    taps = [(0, "t-9", "highlight"), (3, "t-6", "highlight"), (6, "t-3", "highlight"), (9, "当前 t", "done")]
    tap_indices = {idx for idx, _, _ in taps}
    for ti, tok in enumerate(tokens):
        is_tap = ti in tap_indices
        ex.add_node(
            f"tok_b_{ti}",
            x0 + ti * pitch,
            row2_y,
            slot_w,
            32,
            tok,
            color="highlight" if is_tap else "neutral",
            emphasis=is_tap,
            size="note",
        )
    for gi, (idx, lbl, tone) in enumerate(taps):
        ex.add_node(f"grp_b_{gi}", x0 + idx * pitch, row2_y + 48, slot_w, 32, lbl, color=tone, size="note", emphasis=True)

    ex.add_text(x0, row2_y + 96, "注：DeepSeek-V4.1 在线上推理移除了 ShortConv 以保证 Engram 层彻底无状态与可图化。", size="note", color="muted")

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-shortconv-dilation.excalidraw"
    ex.build(out, also_build_svg=True, strict=True)


def build_07_engram_runtime() -> None:
    """11-engram-runtime.drawio：Host DDR 100B 大表异步预取隐藏时序（单页）。"""
    c = DrawioCanvas(page_name="engram-runtime-prefetch", diagram_id="ds-07-engram-prefetch", width=688)

    lanes = [
        ("Main Stream\n主干解码流", [
            (0.0, 1.4, "Embed +\nHash", "active", False),
            (1.4, 2.8, "Layer 0 全层计算\n(mHC + Attn + MoE)", "active", False),
            (4.2, 1.4, "Layer 1\nAttn", "active", False),
            (5.6, 1.2, "wait\nL1 门控", "highlight", False),
            (6.8, 3.2, "Layer 1 MoE + L2..L13", "active", False),
        ]),
        ("Prefetch Stream\nPCIe / HCCS 预取", [
            (1.4, 3.8, "Host DDR 100B 异步读取 -> staged_rows\n(副流预取 / NPU UVA 零拷贝)", "highlight", False),
            (5.2, 0.9, "Event", "highlight", True),
            (6.8, 3.2, "L14 Engram 查表\n与 WKV 提前预热", "highlight", True),
        ]),
    ]
    c.horizontal_lanes(
        "pf",
        lanes=lanes,
        x=0,
        y=16,
        total_w=688,
        gutter_w=120,
        lane_h=64,
        lane_gap=20,
        total_units=10.0,
        ticks=[(0, "0ms"), (2.5, "2.5ms"), (5.0, "5.0ms"), (7.5, "7.5ms"), (10.0, "10.0ms")],
    )

    c.group("hw_note", 0, 208, 688, 128, "双硬件 Host DDR 驻留与零拷贝预取机理", tone="neutral", dashed=True)
    c.node(
        "gpu_pf",
        16,
        240,
        316,
        80,
        "NVIDIA GPU (vLLM)\n_start_prefetch 用副流向主机 Pinned 内存发搬运\n超阈值大 batch 自动回退主流行内 lookup",
        tone="active",
        font_size=12,
    )
    c.node(
        "npu_pf",
        352,
        240,
        320,
        80,
        "Huawei Ascend NPU (vllm-ascend)\naclrtHostRegisterV2 + aclrtHostGetDevicePointer\nTriton gather 经 HCCS/PCIe 直读 UVA，零 H2D 拷贝",
        tone="activation",
        font_size=12,
    )

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-engram-runtime.drawio"
    c.save(out, strict=True, build_svg=True)


def build_07_engram_dist_lookup() -> None:
    """11-engram-dist-lookup.drawio：DP/多卡分布式分片查表与对称内存交换（拆分原第 2 页）。"""
    c = DrawioCanvas(page_name="engram-dist-lookup", diagram_id="ds-07-engram-dist", width=688)

    c.group("r0", 8, 8, 200, 144, "Rank 0 (本地仅存 Head 0..3)", tone="active", dashed=False)
    c.node("r0_tok", 24, 40, 168, 32, "本地 Token hash_ids", tone="neutral", font_size=12)
    c.node("r0_tab", 24, 104, 168, 32, "本地分片表 H0..H3 (Host)", tone="active", font_size=12)

    c.group("r1", 480, 8, 200, 144, "Rank 1 (本地仅存 Head 4..7)", tone="activation", dashed=False)
    c.node("r1_tok", 496, 40, 168, 32, "本地 Token hash_ids", tone="neutral", font_size=12)
    c.node("r1_tab", 496, 104, 168, 32, "本地分片表 H4..H7 (Host)", tone="activation", font_size=12)

    c.group("a2a", 232, 8, 224, 144, "All-to-All / SymmMem 交换", tone="highlight", dashed=False)
    c.node("id_gather", 248, 40, 192, 32, "1. ID Gather（广播/分派槽位）", tone="highlight", font_size=12)
    c.node("emb_ret", 248, 104, 192, 32, "2. Emb Return（FP8+scale 归位）", tone="highlight", emphasis=True, font_size=12)

    c.connect("e1", "r0_tok", "id_gather", tone="fg")
    c.connect("e2", "r1_tok", "id_gather", tone="fg")
    c.connect(
        "e3",
        "id_gather",
        "r0_tab",
        tone="fg",
        dashed=True,
        exit_xy=(0.2, 1.0),
        entry_xy=(0.5, 0.0),
        points=[(288, 88), (104, 88)],
    )
    c.connect(
        "e4",
        "id_gather",
        "r1_tab",
        tone="fg",
        dashed=True,
        exit_xy=(0.8, 1.0),
        entry_xy=(0.5, 0.0),
        points=[(400, 88), (584, 88)],
    )
    c.connect("e5", "r0_tab", "emb_ret", tone="fg")
    c.connect("e6", "r1_tab", "emb_ret", tone="fg")

    c.node(
        "dist_foot",
        8,
        176,
        672,
        80,
        "分布式查表两条工业路径：\n• GPU (EngramPeerExchange): torch.distributed._symmetric_memory 建对称张量，跨 NVLink 直接互取\n• NPU (vllm-ascend shared_rdma + DP Sharding): 通过 HCCS/RDMA 汇聚索引并本地解压 INT8/MXFP8 行",
        tone="neutral",
        align="left",
        font_size=12,
    )

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-engram-dist-lookup.drawio"
    c.save(out, strict=True, build_svg=True)


def build_08_mhc_arch_comp() -> None:
    """08-mhc-arch-comp.drawio：严格对应原论文 Fig. 1（标准残差 vs HC vs mHC 单层拓扑）。"""
    c = DrawioCanvas(page_name="mhc-arch-comp", diagram_id="ds-08-mhc-arch-comp", width=688)

    # (a) 标准单流残差连接
    c.group("col_a", 0, 8, 152, 488, "(a) 标准残差连接", tone="neutral", dashed=False)
    c.node("a_xl", 8, 448, 80, 32, r"\(\mathbf{x}_l\) [1, C]", tone="neutral", font_size=12)
    c.node("a_fn", 64, 256, 80, 40, r"Layer \(\mathcal{F}\)" + "\n(Attn / FFN)", tone="active", emphasis=True, font_size=12)
    c.node("a_add", 32, 104, 32, 32, "⊕", tone="neutral", bold=True, font_size=14)
    c.node("a_out", 8, 56, 80, 24, r"\(\mathbf{x}_{l+1}\) [1, C]", tone="neutral", font_size=12)

    c.connect("ea1", "a_xl", "a_add", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("ea2", "a_xl", "a_fn", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.5, 1.0), points=[(104, 464)])
    c.connect("ea3", "a_fn", "a_add", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(1.0, 0.5), points=[(104, 120)])
    c.connect("ea4", "a_add", "a_out", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))

    # (b) 无约束超连接 HC 与 (c) 流形受限超连接 mHC
    specs = [
        (
            "b",
            168,
            "(b) 超连接 (HC)",
            "error",
            r"Res Mapping" + "\n" + r"\(\mathcal{H}_l^{\mathrm{res}}\) [n×n]",
            r"Pre Mapping" + "\n" + r"\(\mathcal{H}_l^{\mathrm{pre}}\) [1×n]",
            r"Post Mapping" + "\n" + r"\(\mathcal{H}_l^{\mathrm{post}\,\top}\) [n×1]",
            False,
        ),
        (
            "c",
            432,
            "(c) 流形受限超连接 (mHC)",
            "done",
            r"Res Mapping" + "\n" + r"\(\mathcal{P}_{\mathcal{M}^{\mathrm{res}}}(\mathcal{H}_l^{\mathrm{res}})\)",
            r"Pre Mapping" + "\n" + r"\(\mathcal{P}_{\mathcal{M}^{\mathrm{pre}}}(\mathcal{H}_l^{\mathrm{pre}})\)",
            r"Post Mapping" + "\n" + r"\(\mathcal{P}_{\mathcal{M}^{\mathrm{post}}}(\mathcal{H}_l^{\mathrm{post}})\)",
            True,
        ),
    ]

    for p, ox, title, map_tone, res_lbl, pre_lbl, post_lbl, emph in specs:
        c.group(f"col_{p}", ox, 8, 256, 488, title, tone=map_tone, dashed=False)
        c.tensor_block(f"{p}_xl", ox + 16, 448, 96, 32, r"\(\mathbf{x}_l\) [n, C]", tone="neutral", stack=2, font_size=12)
        c.node(f"{p}_res", ox + 8, 368, 112, 48, res_lbl, tone=map_tone, emphasis=emph, font_size=12)
        c.node(f"{p}_pre", ox + 136, 368, 112, 48, pre_lbl, tone=map_tone, emphasis=False, font_size=12)
        c.tensor_block(f"{p}_hres", ox + 16, 312, 96, 24, r"\(\mathbf{h}_l^{\mathrm{res}}\)", tone="neutral", stack=2, font_size=12)
        c.node(f"{p}_hin", ox + 152, 312, 80, 24, r"\(\mathbf{h}_l^{\mathrm{in}}\) [1, C]", tone="neutral", font_size=12)
        c.node(f"{p}_fn", ox + 144, 256, 96, 32, r"Layer \(\mathcal{F}\)", tone="active", emphasis=True, font_size=12)
        c.node(f"{p}_hout", ox + 152, 208, 80, 24, r"\(\mathbf{h}_l^{\mathrm{out}}\) [1, C]", tone="neutral", font_size=12)
        c.node(f"{p}_post", ox + 136, 144, 112, 48, post_lbl, tone=map_tone, emphasis=False, font_size=12)
        c.tensor_block(f"{p}_hpost", ox + 152, 104, 80, 24, r"\(\mathbf{h}_l^{\mathrm{post}}\)", tone="neutral", stack=2, font_size=12)
        c.node(f"{p}_add", ox + 48, 104, 32, 32, "⊕", tone="neutral", bold=True, font_size=14)
        c.tensor_block(f"{p}_out", ox + 16, 56, 96, 24, r"\(\mathbf{x}_{l+1}\) [n, C]", tone="neutral", stack=2, font_size=12)

        c.connect(f"e{p}_1", f"{p}_xl", f"{p}_res", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_2", f"{p}_xl", f"{p}_pre", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.5, 1.0), points=[(ox + 192, 464)])
        c.connect(f"e{p}_3", f"{p}_res", f"{p}_hres", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_4", f"{p}_hres", f"{p}_add", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_5", f"{p}_add", f"{p}_out", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_6", f"{p}_pre", f"{p}_hin", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_7", f"{p}_hin", f"{p}_fn", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_8", f"{p}_fn", f"{p}_hout", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_9", f"{p}_hout", f"{p}_post", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_10", f"{p}_post", f"{p}_hpost", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_11", f"{p}_hpost", f"{p}_add", tone="fg", exit_xy=(0.0, 0.5), entry_xy=(1.0, 0.5))

    out = POSTS_ROOT / "08-mhc" / "diagrams" / "08-mhc-arch-comp.drawio"
    c.save(out, strict=True, build_svg=True)


def build_08_mhc_block_trace() -> None:
    """08-mhc-block-trace.drawio：Transformer 双子层展开（对应 V4 Fig. 2）与 n=4 单子层数值走查。"""
    c = DrawioCanvas(page_name="mhc-block-trace", diagram_id="ds-08-mhc-block-trace", width=688)

    # 左栏：1 个 Transformer 层 = 2 个 mHC 子层（自下而上）
    c.group("g_blk", 0, 8, 272, 440, "1 个 Transformer 层 = 2 个 mHC 子层", tone="neutral", dashed=False)
    c.tensor_block("b_in", 16, 400, 96, 32, r"\(\mathbf{x}_l\) [4, C]", tone="neutral", stack=2, font_size=12)
    c.node("s1_res", 16, 328, 96, 32, "Res Mixing", tone="done", font_size=12)
    c.node("s1_attn", 136, 320, 128, 48, "Pre → RMSNorm\n→ Attention → Post", tone="active", emphasis=True, font_size=12)
    c.node("s1_add", 48, 272, 32, 32, "⊕", tone="neutral", bold=True, font_size=14)
    c.tensor_block("b_mid", 16, 216, 96, 32, r"\(\mathbf{x}_{l+1}\) [4, C]", tone="neutral", stack=2, font_size=12)
    c.node("s2_res", 16, 152, 96, 32, "Res Mixing", tone="done", font_size=12)
    c.node("s2_moe", 136, 144, 128, 48, "Pre → RMSNorm\n→ MoE / FFN → Post", tone="highlight", emphasis=True, font_size=12)
    c.node("s2_add", 48, 96, 32, 32, "⊕", tone="neutral", bold=True, font_size=14)
    c.tensor_block("b_out", 16, 56, 96, 24, r"\(\mathbf{x}_{l+2}\) [4, C]", tone="neutral", stack=2, font_size=12)

    c.connect("eb1", "b_in", "s1_res", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("eb2", "b_in", "s1_attn", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.5, 1.0), points=[(200, 416)])
    c.connect("eb3", "s1_res", "s1_add", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("eb4", "s1_attn", "s1_add", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(1.0, 0.5), points=[(200, 288)])
    c.connect("eb5", "s1_add", "b_mid", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("eb6", "b_mid", "s2_res", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("eb7", "b_mid", "s2_moe", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.5, 1.0), points=[(200, 232)])
    c.connect("eb8", "s2_res", "s2_add", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("eb9", "s2_moe", "s2_add", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(1.0, 0.5), points=[(200, 112)])
    c.connect("eb10", "s2_add", "b_out", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))

    # 右栏：单子层数值走查（取 4 分支第 0 维示例）
    c.group("g_trace", 288, 8, 400, 440, "单子层数值走查（取 n=4 分支首维，初值均值 = 25.0）", tone="active", dashed=True)
    c.node(
        "tr_in",
        304,
        40,
        368,
        48,
        r"输入 4 分支 \(\mathbf{x}_l = [10.0,\ 20.0,\ 30.0,\ 40.0]^\top\)" + "\n（4 分支求和 = 100.0，均值 = 25.0）",
        tone="neutral",
        font_size=12,
    )
    c.node(
        "tr_res",
        304,
        112,
        176,
        136,
        r"① 主干 Res Mapping"
        + "\n"
        + r"\(\mathcal{H}_l^{\mathrm{res}}\) (4×4 双随机)"
        + "\n\n[19.0, 24.0, 26.0, 31.0]\n总和 = 100 · 均值 = 25.0\n极值收拢，均值严格守恒",
        tone="done",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "tr_sub",
        496,
        112,
        176,
        136,
        r"② 支路 Pre → \(\mathcal{F}\) → Post"
        + "\nPre [0.5, 0.2, 0.2, 0.1]\n"
        + r"→ 单流 \(h_l^{\mathrm{in}} = 19.0\)"
        + "\n"
        + r"→ Layer \(\mathcal{F}\) 输出 +4.0"
        + "\nPost [1.2, 0.8, 0.5, 1.5]\n得 [+4.8, +3.2, +2.0, +6.0]",
        tone="active",
        font_size=12,
    )
    c.node(
        "tr_out",
        304,
        272,
        368,
        56,
        r"③ 残差写回相加" + "\n" + r"\(\mathbf{x}_{l+1} = \mathbf{h}_l^{\mathrm{res}} + \mathbf{h}_l^{\mathrm{post}} = [23.8,\ 27.2,\ 28.0,\ 37.0]^\top\)",
        tone="done",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "tr_note",
        304,
        344,
        368,
        88,
        "对照左图可见两个结构事实：\n• RMSNorm 只在右支路 Layer F 入口，管不到左侧 Res 主干\n• 30 层共 60 次 Res 连乘，微偏会被放大至 ~3000×",
        tone="neutral",
        dashed=True,
        align="left",
        font_size=12,
    )

    c.connect("et1", "tr_in", "tr_res", tone="fg", exit_xy=(88 / 368, 1.0), entry_xy=(0.5, 0.0))
    c.connect("et2", "tr_in", "tr_sub", tone="fg", exit_xy=(280 / 368, 1.0), entry_xy=(0.5, 0.0))
    c.connect("et3", "tr_res", "tr_out", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(88 / 368, 0.0))
    c.connect("et4", "tr_sub", "tr_out", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(280 / 368, 0.0))

    out = POSTS_ROOT / "08-mhc" / "diagrams" / "08-mhc-block-trace.drawio"
    c.save(out, strict=True, build_svg=True)


def build_08_mhc_sinkhorn_stability() -> None:
    """08-mhc-sinkhorn-stability.drawio：原论文 Fig. 8 真实 27B 60 子层连乘矩阵与 Sinkhorn-Knopp 投影流程。"""
    c = DrawioCanvas(page_name="mhc-sinkhorn-stability", diagram_id="ds-08-mhc-sinkhorn", width=688)

    # 左上：无约束 HC 60 子层连乘复合矩阵（原论文 Fig. 8 上排最右）
    c.group("g_hc60", 0, 8, 336, 240, r"(a) HC 60 子层连乘 \(\prod_{i=1}^{60}\mathcal{H}_{61-i}^{\mathrm{res}}\)（27B 实测）", tone="error", dashed=False)
    c.heatmap_grid(
        "hm_hc",
        8,
        40,
        cell_w=64,
        cell_h=32,
        cells=[
            [("-132.8", "error", False), ("-112.2", "error", False), ("-117.0", "error", False), ("-113.3", "error", False)],
            [("-129.3", "error", False), ("-109.3", "error", False), ("-113.9", "error", False), ("-110.3", "error", False)],
            [("+142.3", "error", True), ("+120.2", "error", True), ("+125.3", "error", True), ("+121.3", "error", True)],
            [("-139.3", "error", False), ("-117.8", "error", False), ("-122.6", "error", False), ("-118.7", "error", False)],
        ],
        col_labels=["列 -259", "-219", "-228", "-221"],
        row_labels=["-475", "-463", "+509", "-499"],
    )
    c.text("hc_cap", 8, 200, 320, 32, "左列为行和 · 顶行为列和 · 全序列增益峰值 ~3000×", size=12, tone="error", align="center", bold=True)

    # 右上：mHC 60 子层连乘复合矩阵（原论文 Fig. 8 下排最右）
    c.group("g_mhc60", 352, 8, 336, 240, r"(b) mHC 60 子层连乘 \(\prod_{i=1}^{60}\mathcal{P}(\mathcal{H}_{61-i}^{\mathrm{res}})\)（27B 实测）", tone="done", dashed=False)
    c.heatmap_grid(
        "hm_mhc",
        360,
        40,
        cell_w=64,
        cell_h=32,
        cells=[
            [("0.24", "done", False), ("0.26", "done", False), ("0.23", "done", False), ("0.27", "done", True)],
            [("0.23", "done", False), ("0.25", "done", False), ("0.26", "done", False), ("0.27", "done", True)],
            [("0.21", "done", False), ("0.25", "done", False), ("0.27", "done", True), ("0.28", "done", True)],
            [("0.21", "done", False), ("0.27", "done", True), ("0.24", "done", False), ("0.29", "done", True)],
        ],
        col_labels=["列 0.88", "1.03", "1.00", "1.11"],
        row_labels=["1.00", "1.01", "1.01", "1.00"],
    )
    c.text("mhc_cap", 360, 200, 320, 32, "左行和约 1.00 · 顶列和近 1.00 · 全网增益 ≤ 1.6×", size=12, tone="done", align="center", bold=True)

    # 底部：Sinkhorn-Knopp 四步静态演化流程
    c.group("g_sk", 0, 264, 688, 136, r"(c) Sinkhorn-Knopp 投影四步演算（以 2×2 矩阵为例，工程固定展开 \(t_{\max}=20\) 轮）", tone="active", dashed=True)
    c.node("sk0", 16, 304, 144, 80, r"① 取指数变全正" + "\n" + r"\(\mathbf{M}^{(0)}=\exp(\tilde{\mathcal{H}}_l^{\mathrm{res}})\)" + "\n[1, 3 ; 1, 1]", tone="neutral", font_size=12)
    c.node("sk1", 184, 304, 144, 80, r"② 除列和 \(\mathcal{T}_c\)" + "\n[0.50, 0.75 ; 0.50, 0.25]\n列和对齐 [1, 1]", tone="active", font_size=12)
    c.node("sk2", 352, 304, 144, 80, r"③ 除行和 \(\mathcal{T}_r\)" + "\n[0.40, 0.60 ; 0.67, 0.33]\n行和对齐 [1, 1]", tone="active", font_size=12)
    c.node("sk3", 520, 304, 152, 80, "④ 交替迭代收敛\n[0.37, 0.63 ; 0.63, 0.37]\n行和 = 1 且 列和 = 1", tone="done", emphasis=True, font_size=12)

    c.connect("esk1", "sk0", "sk1", tone="fg")
    c.connect("esk2", "sk1", "sk2", tone="fg")
    c.connect("esk3", "sk2", "sk3", tone="fg")

    out = POSTS_ROOT / "08-mhc" / "diagrams" / "08-mhc-sinkhorn-stability.drawio"
    c.save(out, strict=True, build_svg=True)


def build_08_mhc_single_pass() -> None:
    """08-mhc-single-pass.drawio：每子层 HBM 访存比例尺（20d -> 14d -> 10d）与双硬件执行栈。"""
    c = DrawioCanvas(page_name="mhc-single-pass", diagram_id="ds-08-mhc-single-pass", width=688)

    c.proportional_strip(
        "io_split",
        8,
        32,
        672,
        32,
        [
            (9, "Post 读写 9d", "active", False),
            (4, "算系数读 4d", "highlight", False),
            (5, "Pre 混入 5d", "active", False),
            (2, "Norm 2d", "neutral", False),
        ],
        title=r"1. 朴素分立 4 内核 \((4n+4)d = 20d\)：每个子层反复把 [T, 4, d] 搬进搬出 HBM",
        total_label="20d (基准)",
    )

    c.proportional_strip(
        "io_twopass",
        8,
        104,
        472,
        32,
        [
            (9, "Pass1: Post + 算系数 (9d)", "active", False),
            (5, "Pass2: 汇聚 Pre + Norm (5d)", "highlight", False),
        ],
        title=r"2. 标准两遍融合 \((3n+2)d = 14d\)：\(A_l\) 需等全维归约完成，被迫读两遍 \(X_l\)",
        total_label="14d (-30%)",
    )

    c.proportional_strip(
        "io_mega",
        8,
        176,
        336,
        32,
        [
            (5, r"单遍读 5d (\(y + X_l\))", "done", True),
            (5, r"单遍写 5d (\(X_{l+1}\) + Norm)", "done", True),
        ],
        title=r"3. V4.1 Single-Pass Mega-mHC \((2n+2)d = 10d\)：改用上层 \(A_{l-1}\)，单遍触及下界",
        total_label="10d (-50% 下界)",
    )

    (lx, ly, lw, _), (rx, ry, rw, _) = c.swimlane_pair(
        "mhc_hw",
        "NVIDIA GPU (vLLM bb23c0a8)",
        "Huawei Ascend NPU (vllm-ascend 3649b8ff)",
        y=232,
        h=232,
        total_w=688,
        gap=16,
        left_tone="active",
        right_tone="highlight",
    )

    c.node(
        "g_s1",
        lx,
        ly,
        lw,
        48,
        "mhc_shifted_post_pre 跨子层延迟融合\n上层 Post 留到下层入口一次性合并读写",
        tone="active",
        font_size=12,
    )
    c.node(
        "g_s2",
        lx,
        ly + 64,
        lw,
        48,
        "SM100 分级加速内核\nDeepGEMM mega_mhc / CuTe / Lamport AR",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "g_s3",
        lx,
        ly + 128,
        lw,
        48,
        "L1 / L14 Engram 边界显式打断融合\nmhc_post_tilelang → engram → mhc_pre",
        tone="done",
        dashed=True,
        font_size=12,
    )

    c.node(
        "n_s1",
        rx,
        ry,
        rw,
        48,
        "npu_hc_pre_v3 算子内接上层 pre_mix\n单算子融合输入坍缩与 Sinkhorn 迭代",
        tone="highlight",
        font_size=12,
    )
    c.node(
        "n_s2",
        rx,
        ry + 64,
        rw,
        48,
        "rms_norm_cast 一次归一化两路输出\n同步产出 BF16 激活与 FP32 MoE 路由",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "n_s3",
        rx,
        ry + 128,
        rw,
        48,
        "每子层尾调 npu_hc_post 物化四流\nL1 / L14 无需拆分支直接接入 AscendEngram",
        tone="done",
        dashed=True,
        font_size=12,
    )

    c.connect("eg1", "g_s1", "g_s2", tone="fg")
    c.connect("eg2", "g_s2", "g_s3", tone="fg")
    c.connect("en1", "n_s1", "n_s2", tone="fg")
    c.connect("en2", "n_s2", "n_s3", tone="fg")

    out = POSTS_ROOT / "08-mhc" / "diagrams" / "08-mhc-single-pass.drawio"
    c.save(out, strict=True, build_svg=True)


def build_09_mtp_runtime() -> None:
    """09-mtp-vllm-runtime.drawio：vLLM V1 GPU vs vllm-ascend NPU Speculator 运行时对照。"""
    c = DrawioCanvas(page_name="mtp-vllm-runtime", diagram_id="ds-09-mtp-runtime", width=688)

    (lx, ly, lw, _), (rx, ry, rw, _) = c.swimlane_pair(
        "spec",
        "NVIDIA GPU (vLLM V1 Spec Decode)",
        "Huawei Ascend NPU (vllm-ascend V2)",
        y=8,
        h=312,
        total_w=688,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    c.node("g_hier", lx, ly, lw, 56, "Speculator 继承体系 (重构自 EagleProposer)\nTargetDependentARSpeculator -> MTPSpeculator\nDFlashSpeculator -> DSparkSpeculator", tone="active", font_size=12)
    c.node("g_dspark", lx, ly + 72, lw, 64, "DSparkDraft & Markov 采样\n_sample_sequential / All-to-All 按请求分片\n_fuse_markov_bias 融进 Gumbel 采样核", tone="highlight", font_size=12)
    c.node("g_graph", lx, ly + 152, lw, 48, "CUDA Graph 全图重放\nshare_mtp_topk_indices 跳过重复 Indexer", tone="active", font_size=12)
    c.node("g_rej", lx, ly + 216, lw, 48, "Triton 无损拒绝校验\nrejection_sampler.py + 局部 LogSumExp 归约", tone="active", emphasis=True, font_size=12)

    c.node("a_hier", rx, ry, rw, 56, "Ascend 混合扩展栈\nAscendTargetDependentARSpeculator\nAscendMTPSpeculator / AscendDSparkSpeculator", tone="activation", font_size=12)
    c.node("a_dspark", rx, ry + 72, rw, 64, "LMHead TP 对齐包装\nLmheadTPDraftSamplingMixin 将行填充至\nmax_num_reqs × num_speculative_steps 防卡死", tone="highlight", font_size=12)
    c.node("a_graph", rx, ry + 152, rw, 48, "ACLGraph + AscendDSASWA 缓存\nAutoRegressiveAclGraphManager + 线性物理槽散射", tone="activation", font_size=12)
    c.node("a_rej", rx, ry + 216, rw, 48, "NPU 校验与重采样核\n_probabilistic_rejection_kernel + resample.py", tone="activation", emphasis=True, font_size=12)

    c.connect("eg1", "g_hier", "g_dspark", tone="fg")
    c.connect("eg2", "g_dspark", "g_graph", tone="fg")
    c.connect("eg3", "g_graph", "g_rej", tone="fg")
    c.connect("ea1", "a_hier", "a_dspark", tone="fg")
    c.connect("ea2", "a_dspark", "a_graph", tone="fg")
    c.connect("ea3", "a_graph", "a_rej", tone="fg")

    out = POSTS_ROOT / "09-mtp-and-dspark" / "diagrams" / "09-mtp-vllm-runtime.drawio"
    c.save(out, strict=True, build_svg=True)


def build_10_five_gen_ledger() -> None:
    """10-five-gen-ledger.drawio：V2 -> V3 -> R1 -> V3.2 -> V4 -> V4.1 KV 字节账本与双硬件总览。"""
    c = DrawioCanvas(page_name="five-gen-ledger", diagram_id="ds-10-five-gen-ledger", width=688)

    c.proportional_strip(
        "kv_v23",
        8,
        32,
        672,
        32,
        [
            (1024, "V2/V3 BF16 Latent c_t (512×2B = 1024 B)", "active", False),
            (128, "k_rope\n(128 B)", "highlight", False),
        ],
        title="1. DeepSeek-V2/V3/R1 BF16 MLA：每层 1152 B（比 MHA 省 ~98%）",
        total_label="1152 B/层",
    )

    c.proportional_strip(
        "kv_v32",
        8,
        112,
        336,
        32,
        [
            (512, "V3/V3.2 FP8 Latent (512 B)", "active", False),
            (64, "RoPE 64B", "highlight", False),
        ],
        title="2. DeepSeek-V3.2 FP8 MLA + DSA Indexer：带宽减半且仅取 Top-K 页",
        total_label="576 B/层 (50%)",
    )

    c.proportional_strip(
        "kv_v41",
        8,
        224,
        168,
        32,
        [
            (224, "V4/V4.1 NVFP4 (224B)", "done", True),
            (64, "64B RoPE+Sc", "highlight", True),
        ],
        title="3. DeepSeek-V4/V4.1 Sparse：288 B/层（448 NoPE + 64 RoPE）",
        total_label="288 B/层 (25%)",
    )

    c.proportional_strip(
        "param_ratio",
        8,
        336,
        672,
        32,
        [
            (37, "激活 37B", "done", True),
            (634, "HBM 稀疏专家总容量 634B (仅 Top-8 活跃)", "active", False),
            (100, "Host 100B Engram", "highlight", False),
        ],
        title="4. V4.1 容量与算力分工：37B 在线算力 / 671B HBM MoE / 100B Host DDR 记忆",
        total_label="771B 全图谱",
    )

    (lx, ly, lw, _), (rx, ry, rw, _) = c.swimlane_pair(
        "synth",
        "NVIDIA SM100 旗舰硬件闭环",
        "Huawei Ascend 910B/910C 硬件闭环",
        y=432,
        h=112,
        total_w=688,
        gap=16,
        left_tone="active",
        right_tone="highlight",
    )
    c.node("gpu_end", lx, ly, lw, 64, "• DeepseekV4MegaAttnAttention (288B 融合)\n• mega_mhc 单遍融合 + DeepEP DBO\n• EngramPeerExchange + DSparkSpeculator", tone="active", font_size=12, align="left")
    c.node("npu_end", rx, ry, rw, 64, "• AscendDSAImpl + packed_cache_ops\n• npu_hc_pre_v3 + AscendMoERunner (MC2)\n• UVA Engram 直读 + AscendDSparkSpeculator", tone="highlight", font_size=12, align="left")

    out = POSTS_ROOT / "10-architecture-synthesis" / "diagrams" / "10-five-gen-ledger.drawio"
    c.save(out, strict=True, build_svg=True)


def main() -> None:
    build_06_moe_arch()
    build_07_engram_layer()
    build_07_shortconv_dilation()
    build_07_engram_runtime()
    build_07_engram_dist_lookup()
    build_08_mhc_arch_comp()
    build_08_mhc_block_trace()
    build_08_mhc_sinkhorn_stability()
    build_08_mhc_single_pass()
    build_09_mtp_runtime()
    build_10_five_gen_ledger()
    print("Successfully built and strictly linted all 11 Part-B static diagrams.")


if __name__ == "__main__":
    main()
