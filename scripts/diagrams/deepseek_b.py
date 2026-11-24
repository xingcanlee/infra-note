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


def build_07_engram_arch() -> None:
    """11-engram-arch.drawio：条件计算 (MoE) 与条件记忆 (Engram) 的正交分工。"""
    c = DrawioCanvas(page_name="engram-arch", diagram_id="ds-07-engram-arch", width=688)

    c.node("inp", 168, 8, 352, 40, "输入词元序列与残差隐状态 \\(h_t\\)", tone="neutral", emphasis=True, font_size=12)

    c.group("g_comp", 0, 72, 336, 200, "条件计算：MoE + Attention（动态算力）", tone="highlight", dashed=False)
    c.node("comp_route", 16, 104, 304, 48, "Router 动态选路计算：\\(O(T \\cdot E)\\)", tone="highlight", font_size=12)
    c.node(
        "comp_mlp",
        16,
        176,
        304,
        80,
        "多步深层组合与逻辑推理\n若无静态记忆，高频实体只能靠消耗 FFN 重建",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.connect("e_c1", "comp_route", "comp_mlp", tone="fg")

    c.group("g_mem", 352, 72, 336, 200, "条件记忆：Engram（静态查表）", tone="active", dashed=False)
    c.node("mem_hash", 368, 104, 304, 48, "N-gram 哈希索引：\\(O(1)\\) 确定性寻址", tone="active", font_size=12)
    c.node(
        "mem_lut",
        368,
        176,
        304,
        80,
        "按词尾整数编号直读 Host 大表\n固定实体与短语从 GPU HBM 算力路径剥离",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.connect("e_m1", "mem_hash", "mem_lut", tone="fg")

    c.connect("e_top_c", "inp", "comp_route", tone="fg", exit_xy=(0.25, 1.0), entry_xy=(0.5, 0.0))
    c.connect("e_top_m", "inp", "mem_hash", tone="fg", exit_xy=(0.75, 1.0), entry_xy=(0.5, 0.0))

    c.node(
        "merge",
        72,
        296,
        544,
        64,
        "门控融合写回：\\(H'_t = H_t + \\alpha_t \\odot V_t\\)\n分配比例 \\(\\rho\\) 控制算力与记忆配比，把浅层算力留给深层推理",
        tone="done",
        emphasis=True,
        font_size=12,
    )
    c.connect("e_bot_c", "comp_mlp", "merge", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.25, 0.0))
    c.connect("e_bot_m", "mem_lut", "merge", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.75, 0.0))

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-engram-arch.drawio"
    c.save(out, strict=True, build_svg=True)


def build_07_engram_hash() -> None:
    """11-engram-hash.drawio：素数分桶、前缀偏移与滚动异或防碰撞寻址。"""
    c = DrawioCanvas(page_name="engram-hash", diagram_id="ds-07-engram-hash", width=688)

    c.group("g_build", 0, 8, 688, 192, "阶段一：构造全局互异素数分桶与 1D 扁平物理表（K=2 头示例）", tone="neutral", dashed=False)
    c.node("b_prime", 16, 40, 208, 64, "1. 递增寻素 + seen_primes 去重\n2-gram: [5, 7]\n3-gram: [11, 13]", tone="active", font_size=12)
    c.node("b_off", 240, 40, 208, 64, "2. 累加前缀首址 offsets\n[0, 5, 12, 23]\n总槽位 = 5+7+11+13 = 36", tone="active", font_size=12)
    c.node("b_mult", 464, 40, 208, 64, "3. 逐层生成有界奇乘数\n\\(m_i \\in [1, 2^{31}-1]\\) 奇数\n防止乘 \\(2^k\\) 丢弃低位", tone="highlight", font_size=12)
    c.connect("e_b1", "b_prime", "b_off", tone="fg")
    c.connect("e_b2", "b_off", "b_mult", tone="fg")

    # 36 行按 16px/行 严格等比排布：5*16=80, 7*16=112, 11*16=176, 13*16=208，总宽 576，居中 x=56..632
    c.node("seg0", 56, 120, 80, 48, "2g-H0\n[0..4]", tone="active", font_size=12)
    c.node("seg1", 136, 120, 112, 48, "2g-H1 (p=7)\n[5..11]", tone="active", font_size=12)
    c.node("seg2", 248, 120, 176, 48, "3g-H2 (p=11)\n[12..22]", tone="done", font_size=12)
    c.node("seg3", 424, 120, 208, 48, "3g-H3 (p=13)\n[23..35]", tone="done", font_size=12)
    c.text("seg_cap", 56, 172, 576, 24, "物理存储：\\([36, d]\\) 连续张量，总行数 \\(= \\sum p_{n,k}\\)", size=12, tone="muted", align="center")

    c.group("g_calc", 0, 216, 688, 240, "阶段二：后缀 (308, 12, 88) 滚动异或与物理槽位映射（m = [3, 7, 9]）", tone="neutral", dashed=True)
    c.node("t0", 16, 248, 152, 48, "首字 \\(x'_t = 88\\)\n乘数 \\(m_0 = 3\\)", tone="neutral", font_size=12)
    c.node("t1", 184, 248, 152, 48, "前缀 \\(x'_{t-1} = 12\\)\n乘数 \\(m_1 = 7\\)", tone="neutral", font_size=12)
    c.node("t2", 352, 248, 152, 48, "前缀 \\(x'_{t-2} = 308\\)\n乘数 \\(m_2 = 9\\)", tone="neutral", font_size=12)
    c.node("no_comm", 520, 248, 152, 48, "位置绑定防交换：\n\\((12,88) \\neq (88,12)\\)", tone="highlight", dashed=True, font_size=12)

    c.node("xor2", 32, 320, 272, 48, "2-gram 混合值：\n\\(h_2 = (88\\times 3) \\oplus (12\\times 7) = 348\\)", tone="active", emphasis=True, font_size=12)
    c.node("xor3", 352, 320, 320, 48, "复用 \\(h_2\\) 计算 3-gram：\n\\(h_3 = 348 \\oplus (308\\times 9) = 2952\\)", tone="active", emphasis=True, font_size=12)

    c.connect("e_t0_x", "t0", "xor2", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.25, 0.0))
    c.connect("e_t1_x", "t1", "xor2", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.75, 0.0))
    c.connect("e_x2_x3", "xor2", "xor3", tone="fg")
    c.connect("e_t2_x", "t2", "xor3", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(0.25, 0.0))

    c.node("slot2", 32, 392, 272, 48, "\\(H_0: (348 \\bmod 5)+0 = 3\\)\n\\(H_1: (348 \\bmod 7)+5 = 10\\)", tone="done", emphasis=True, font_size=12)
    c.node("slot3", 352, 392, 320, 48, "\\(H_2: (2952 \\bmod 11)+12 = 16\\)\n\\(H_3: (2952 \\bmod 13)+23 = 24\\)", tone="done", emphasis=True, font_size=12)
    c.connect("e_x2_s", "xor2", "slot2", tone="fg")
    c.connect("e_x3_s", "xor3", "slot3", tone="fg")

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-engram-hash.drawio"
    c.save(out, strict=True, build_svg=True)


def build_07_engram_gate_disambig() -> None:
    """11-engram-gate-disambig.drawio：多头碰撞隔离与上下文门控动态消歧。"""
    c = DrawioCanvas(page_name="engram-gate-disambig", diagram_id="ds-07-engram-gate-disambig", width=688)

    c.group("ga", 0, 8, 336, 120, "语境 A：中国的首 (308, 12, 88)", tone="active", dashed=False)
    c.node("ca_h", 16, 40, 128, 72, "隐状态 \\(h_t^A\\)\n含“中国”语境", tone="neutral", emphasis=True, font_size=12)
    c.node("ca_hash", 160, 40, 160, 72, "3-gram \\(h_3 = 2952\\)\n槽位 \\(H_2=16,\\; H_3=24\\)", tone="active", font_size=12)

    c.group("gb", 352, 8, 336, 120, "语境 B：新任的首 (729, 12, 88)", tone="highlight", dashed=False)
    c.node("cb_hash", 368, 40, 160, 72, "3-gram \\(h'_3 = 6397\\)\n槽位 \\(H_2=18,\\; H_3=24\\)", tone="highlight", font_size=12)
    c.node("cb_h", 544, 40, 128, 72, "隐状态 \\(h_t^B\\)\n含“新任”语境", tone="neutral", emphasis=True, font_size=12)

    c.node(
        "mem_box",
        160,
        152,
        368,
        96,
        "多头桶共享内存：局部碰撞与互补\n头 3（\\(\\bmod 13\\)）：均命中槽 \\(24\\)，读出特征混杂\n头 2（\\(\\bmod 11\\)）：A 落 \\(16\\)、B 落 \\(18\\) 各自隔离",
        tone="neutral",
        dashed=True,
        font_size=12,
    )
    c.connect("e_am", "ca_hash", "mem_box", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(80 / 368, 0.0))
    c.connect("e_bm", "cb_hash", "mem_box", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(288 / 368, 0.0))

    c.node(
        "gate_a",
        0,
        272,
        336,
        104,
        "语境 A 门控放行\n\\(K_t^A = W_K e_t^A\\) 与 \\(h_t^A\\) 点积呈正对齐\n\\(\\alpha_t^A = \\sigma(\\dots) \\to 1\\)：高权重放行 \\(V_t\\)",
        tone="done",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "gate_b",
        352,
        272,
        336,
        104,
        "语境 B 门控抑噪\n若头 3 碰撞污染使 \\(K_t^B\\) 偏离 \\(h_t^B\\)\n\\(\\alpha_t^B = \\sigma(\\dots) \\to 0\\)：调低权重屏蔽噪声",
        tone="highlight",
        dashed=True,
        font_size=12,
    )

    c.connect("e_ha_g", "ca_h", "gate_a", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(80 / 336, 0.0))
    c.connect("e_ma_g", "mem_box", "gate_a", tone="fg", ortho=False, exit_xy=(80 / 368, 1.0), entry_xy=(240 / 336, 0.0))
    c.connect("e_mb_g", "mem_box", "gate_b", tone="fg", ortho=False, exit_xy=(288 / 368, 1.0), entry_xy=(96 / 336, 0.0))
    c.connect("e_hb_g", "cb_h", "gate_b", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(256 / 336, 0.0))

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-engram-gate-disambig.drawio"
    c.save(out, strict=True, build_svg=True)


def build_07_engram_layer() -> None:
    """11-engram-layer.drawio：左列 V4.1 L1/L14 层内顺序 + 右列 K [5120]=4d 与 V [1280]=1d 严格 4:1 比例。"""
    c = DrawioCanvas(page_name="engram-layer", diagram_id="ds-07-engram-layer", width=688)

    # 左列：V4.1 L1 / L14 层内注入顺序（x=0..176）
    c.group("g_left", 0, 8, 176, 416, "V4.1 L1 / L14 注入点", tone="neutral", dashed=False)
    c.node("l_post", 16, 40, 144, 48, "上层 mhc_post\n输出 4 路状态", tone="done", font_size=12)
    c.node("l_h4", 16, 104, 144, 48, "\\(H_t \\in \\mathbb{R}^{T \\times 4 \\times d}\\)\n四分支残差张量", tone="neutral", emphasis=True, font_size=12)
    c.node("l_eng", 16, 176, 144, 48, "Engram 原位更新\n\\(H'_t = H_t + \\alpha_t \\odot V_t\\)", tone="highlight", emphasis=True, font_size=12)
    c.node("l_pre", 16, 248, 144, 48, "本层 mhc_pre\n聚合 \\(4d \\to 1d\\)", tone="done", font_size=12)
    c.node("l_h1", 16, 312, 144, 32, "\\([T, d]\\) 单流激活", tone="neutral", font_size=12)
    c.node("l_attn", 16, 360, 144, 48, "本层 \\(\\text{Attn} \\to \\text{MoE}\\)", tone="active", emphasis=True, font_size=12)

    c.connect("e_l1", "l_post", "l_h4", tone="fg")
    c.connect("e_l2", "l_h4", "l_eng", tone="fg")
    c.connect("e_l3", "l_eng", "l_pre", tone="fg")
    c.connect("e_l4", "l_pre", "l_h1", tone="fg")
    c.connect("e_l5", "l_h1", "l_attn", tone="fg")

    # 右列：Engram 模块投影、4:1 比例块与门控写回（x=192..688）
    c.group("g_right", 192, 8, 496, 416, "Engram 模块投影与 4:1 门控写回", tone="neutral", dashed=True)
    c.node("in_h", 208, 40, 200, 48, "HC 多流 \\(H_t\\)\n\\([B, T, 4, 1280]\\)", tone="neutral", emphasis=True, font_size=12)
    c.node("in_e", 424, 40, 248, 48, "多头查表拼接 \\(e_t\\)\n\\([B, T, d_{\\text{eng}}]\\)", tone="active", emphasis=True, font_size=12)

    c.node("proj", 424, 104, 248, 40, "合并投影 \\(\\text{wkv}: e_t \\to (M+1)d = 5d\\)", tone="active", font_size=12)
    c.connect("e_p1", "in_e", "proj", tone="fg")

    # 严格 4:1 视觉宽度比：K 占 4 格共 192px (4 * 48px = 5120)，V 占 1 格共 48px (1280)
    c.group("g_ratio", 208, 160, 464, 96, "", tone="neutral", dashed=True)
    c.text("g_ratio_lbl", 216, 164, 232, 24, "\\(K / V\\) 严格 \\(4:1\\) 比例（\\(d=1280\\)）", size=12, tone="fg", align="left", bold=True)
    for m in range(4):
        c.node(f"k_stream_{m}", 224 + m * 48, 192, 48, 40, f"\\(K_{m}\\)\n1280", tone="active", font_size=12)
    c.text("k_bracket", 272, 232, 160, 24, "\\(W_K e_t: 4d = 5120\\)", size=12, tone="fg", align="left")
    c.text("v_bracket", 488, 192, 104, 40, "\\(W_V e_t\\):\n\\(1d = 1280\\)", size=12, tone="fg", align="right")
    c.node("v_stream", 600, 192, 48, 40, "\\(V_t\\)\n1280", tone="highlight", emphasis=True, font_size=12)

    c.connect("e_pk", "proj", "k_stream_3", tone="fg", exit_xy=(0.15, 1.0), entry_xy=(0.5, 0.0))
    c.connect("e_pv", "proj", "v_stream", tone="fg", exit_xy=(5 / 6, 1.0), entry_xy=(0.5, 0.0))

    # 门控与调制
    c.node(
        "gate",
        208,
        272,
        248,
        64,
        "门控点积与开方压缩\n\\(z = \\langle \\mathrm{RN}(H_t), \\mathrm{RN}(K_t) \\rangle / \\sqrt{d}\\)\n\\(\\alpha_t = \\sigma(\\operatorname{sign}(z)\\sqrt{|z|})\\)",
        tone="active",
        font_size=12,
    )
    c.node("mul", 480, 272, 192, 64, "门控加权共享值\n\\(\\alpha_t \\odot V_t \\to [B, T, 4, 1280]\\)", tone="highlight", font_size=12)

    c.connect("e_hg", "in_h", "gate", tone="fg", exit_xy=(0.0, 0.5), entry_xy=(0.0, 0.5), points=[(200, 64), (200, 304)])
    c.connect("e_kg", "k_stream_0", "gate", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(40 / 248, 0.0))
    c.connect("e_gm", "gate", "mul", tone="fg")
    c.connect("e_vm", "v_stream", "mul", tone="fg", exit_xy=(0.5, 1.0), entry_xy=(144 / 192, 0.0))

    # ShortConv 演进分支与写回
    c.node(
        "conv_note",
        208,
        360,
        248,
        48,
        "论文：\\(+ \\operatorname{SiLU}(\\operatorname{ShortConv}(\\tilde{V}_t))\\)\nV4.1 线上：无状态化移除卷积",
        tone="neutral",
        dashed=True,
        font_size=12,
    )
    c.node("res_add", 480, 360, 192, 48, "残差写回 4 路流\n\\(H'_t = H_t + \\alpha_t \\odot V_t\\)", tone="done", emphasis=True, font_size=12)
    c.connect("e_mr", "mul", "res_add", tone="fg")
    c.connect("e_cr", "conv_note", "res_add", tone="muted", dashed=True)

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-engram-layer.drawio"
    c.save(out, strict=True, build_svg=True)


def build_07_shortconv_dilation() -> None:
    """11-shortconv-dilation.drawio：因果一维卷积、空洞 δ=3 抽头对齐与 Depthwise 参数对比。"""
    c = DrawioCanvas(page_name="shortconv-dilation", diagram_id="ds-07-shortconv-dilation", width=688)

    tokens = [f"\\(t-{i}\\)" for i in range(9, 0, -1)] + ["\\(t\\)"]
    x0, slot_w, gap = 64, 48, 8
    pitch = slot_w + gap

    # 上组：标准因果卷积 delta=1（相邻重叠）
    c.group("g_std", 0, 8, 688, 160, "标准因果 1D 卷积（\\(\\delta=1, k=4\\)）：步长紧邻，相邻 N-gram 窗口大量重叠", tone="neutral", dashed=False)
    for ti, tok in enumerate(tokens):
        c.node(f"tok_t_{ti}", x0 + ti * pitch, 40, slot_w, 32, tok, tone="neutral", font_size=12)
    c.node("grp_t_0", x0 + 3 * pitch, 88, 4 * slot_w + 3 * gap, 32, "窗口 A：[\\(t-6 \\dots t-3\\)]", tone="active", dashed=True, font_size=12)
    c.node("grp_t_1", x0 + 6 * pitch, 128, 4 * slot_w + 3 * gap, 32, "窗口 B：[\\(t-3 \\dots t\\)] 重复覆盖 \\(t-3\\)", tone="highlight", dashed=True, font_size=12)

    # 中组：Engram 空洞因果卷积 delta=3（零重叠抽头与卷积核手算）
    c.group("g_dil", 0, 184, 688, 168, "Engram 空洞因果卷积（\\(\\delta=3, k=4\\)）：左补零后步幅对齐 \\(3\\)-gram 边界，零重叠覆盖", tone="neutral", dashed=False)
    taps = {0: ("\\(w_3 x_{t-9}\\)", "highlight"), 3: ("\\(w_2 x_{t-6}\\)", "highlight"), 6: ("\\(w_1 x_{t-3}\\)", "highlight"), 9: ("\\(w_0 x_t\\)", "done")}
    for ti, tok in enumerate(tokens):
        is_tap = ti in taps
        tone = taps[ti][1] if is_tap else "neutral"
        c.node(f"tok_b_{ti}", x0 + ti * pitch, 216, slot_w, 32, tok, tone=tone, emphasis=is_tap, font_size=12)
    for idx, (lbl, tone) in taps.items():
        c.node(f"tap_{idx}", x0 + idx * pitch - 8, 264, slot_w + 16, 32, lbl, tone=tone, emphasis=True, font_size=12)
        c.connect(f"e_tap_{idx}", f"tok_b_{idx}", f"tap_{idx}", tone="fg")
    c.text("dil_eq", 16, 312, 656, 32, "位置 \\(t\\) 卷积累加（前缀不足处左补 \\(0\\)）：\\(y_t = w_0 x_t + w_1 x_{t-3} + w_2 x_{t-6} + w_3 x_{t-9}\\)", size=12, tone="fg", align="center", bold=True)

    # 下组：Depthwise 通道分离 vs V4.1 移除对照
    c.node(
        "dw_card",
        0,
        368,
        336,
        72,
        "Depthwise（\\(\\text{groups}=d\\)）通道分离\n核重排为 \\(d\\) 条独立 \\([4]\\) 一维滤波器\n参数由 \\(4d^2\\) 降至 \\(4d\\)（缩减 \\(d\\) 倍）",
        tone="active",
        font_size=12,
    )
    c.node(
        "v41_card",
        352,
        368,
        336,
        72,
        "V4.1 线上推理移除了 ShortConv\n原因：Decode 跨步滑窗带来历史张量状态维护成本\n改为无状态查表 \\(+\\) \\(\\text{wkv}\\)，原生支持图内执行",
        tone="neutral",
        dashed=True,
        font_size=12,
    )

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-shortconv-dilation.drawio"
    c.save(out, strict=True, build_svg=True)


def build_07_engram_runtime() -> None:
    """11-engram-runtime.drawio：Host DDR 大表异步预取隐藏时序与双硬件零拷贝/Pool 架构。"""
    c = DrawioCanvas(page_name="engram-runtime-prefetch", diagram_id="ds-07-engram-prefetch", width=688)

    lanes = [
        ("Main Stream\n主干解码流", [
            (0.0, 1.4, "Embed +\nHash", "active", False),
            (1.4, 3.5, "Layer 0 全层计算\n(mHC + Attn + MoE)", "active", False),
            (4.9, 1.4, "wait +\nL1 Engram", "highlight", False),
            (6.3, 3.7, "L1 Attn+MoE -> L14\n连续计算窗口", "active", False),
        ]),
        ("Prefetch Stream\nPCIe / HCCS 预取", [
            (1.4, 2.8, "Host DDR 异步预取\n-> staged_rows", "highlight", False),
            (4.2, 0.7, "Event", "highlight", True),
            (6.3, 3.7, "L14 Engram 异步预取\n掩盖跨总线延迟", "highlight", True),
        ]),
    ]
    c.horizontal_lanes(
        "pf",
        lanes=lanes,
        x=0,
        y=8,
        total_w=688,
        gutter_w=120,
        lane_h=64,
        lane_gap=20,
        total_units=10.0,
        ticks=[(0, "0ms"), (2.5, "2.5ms"), (5.0, "5.0ms"), (7.5, "7.5ms"), (10.0, "10.0ms")],
    )

    c.group("hw_note", 0, 200, 688, 160, "掩盖条件 \\(t_{\\text{prefetch}} \\le t_{L_0}\\) 与双硬件分布式查表架构", tone="neutral", dashed=True)
    c.node(
        "gpu_pf",
        16,
        240,
        320,
        104,
        "NVIDIA GPU（vLLM）\n• Pinned / \\(\\text{cuMem FABRIC}\\) / HBM 对称内存\n• 超 \\(4096\\) token 回退行内直查，\\(\\ge 128\\) 槽切 A2A\n• \\(\\text{EngramPool}\\) 经 \\(\\text{NVLink / IBGDA RDMA}\\) 跨引擎",
        tone="active",
        align="left",
        font_size=12,
    )
    c.node(
        "npu_pf",
        352,
        240,
        320,
        104,
        "Huawei Ascend NPU（vllm-ascend）\n• \\(\\text{aclrtHostRegisterV2}\\) 按 \\(2^{22}\\) 行切片映 UVA\n• Triton 经 HCCS 零拷贝直读（INT8 / MXFP8）\n• FULL 图支持单调产槽位，A3 走 \\(\\text{SharedPool / Hixl}\\)",
        tone="done",
        align="left",
        font_size=12,
    )

    out = POSTS_ROOT / "07-engram" / "diagrams" / "11-engram-runtime.drawio"
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

    c.connect("ea1", "a_xl", "a_add", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
    c.connect("ea2", "a_xl", "a_fn", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.5, 1.0), points=[(104, 464)])
    c.connect("ea3", "a_fn", "a_add", tone="fg", exit_xy=(0.5, 0.0), entry_xy=(1.0, 0.5), points=[(104, 120)])
    c.connect("ea4", "a_add", "a_out", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))

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
        c.tensor_block(f"{p}_hpost", ox + 152, 104, 80, 32, r"\(\mathbf{h}_l^{\mathrm{post}}\)", tone="neutral", stack=2, font_size=12)
        c.node(f"{p}_add", ox + 48, 104, 32, 32, "⊕", tone="neutral", bold=True, font_size=14)
        c.tensor_block(f"{p}_out", ox + 16, 56, 96, 24, r"\(\mathbf{x}_{l+1}\) [n, C]", tone="neutral", stack=2, font_size=12)

        c.connect(f"e{p}_1", f"{p}_xl", f"{p}_res", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_2", f"{p}_xl", f"{p}_pre", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.5, 1.0), points=[(ox + 192, 464)])
        c.connect(f"e{p}_3", f"{p}_res", f"{p}_hres", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_4", f"{p}_hres", f"{p}_add", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_5", f"{p}_add", f"{p}_out", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_6", f"{p}_pre", f"{p}_hin", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_7", f"{p}_hin", f"{p}_fn", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_8", f"{p}_fn", f"{p}_hout", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_9", f"{p}_hout", f"{p}_post", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_10", f"{p}_post", f"{p}_hpost", tone="fg", ortho=False, exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0))
        c.connect(f"e{p}_11", f"{p}_hpost", f"{p}_add", tone="fg", ortho=False, exit_xy=(0.0, 0.5), entry_xy=(1.0, 0.5))

    out = POSTS_ROOT / "08-mhc" / "diagrams" / "08-mhc-arch-comp.drawio"
    c.save(out, strict=True, build_svg=True)


def build_08_mhc_block_trace() -> None:
    """08-mhc-block-trace.drawio：Transformer 双子层展开（对应 V4 Fig. 2）与 n=4 单子层数值推演。"""
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

    # 右栏：单子层数值推演（取 4 分支第 0 维示例）
    c.group("g_trace", 288, 8, 400, 440, "单子层数值推演（取 n=4 分支首维，初值均值 = 25.0）", tone="active", dashed=True)
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
        + "\n\n[19.0, 24.0, 26.0, 31.0]\n总和 = 100 · 均值 = 25.0\n极值收敛，均值严格守恒",
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
        title=r"1. 朴素分立 4 个 Kernel \((4n+4)d = 20d\)：每个子层反复把 [T, 4, d] 搬进搬出 HBM",
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
        "SM100 分级融合 Kernel\nDeepGEMM mega_mhc / CuTe / Lamport AR",
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
        "npu_hc_pre_v3 算子内接上层 pre_mix\n单算子融合输入聚合与 Sinkhorn 迭代",
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
        "每子层尾调 npu_hc_post 写回四流\nL1 / L14 无需拆分支直接接入 AscendEngram",
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
        h=328,
        total_w=688,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    c.node("g_hier", lx, ly, lw, 56, "Speculator 继承体系 (重构自 EagleProposer)\nTargetDependentARSpeculator -> MTPSpeculator\nDFlashSpeculator -> DSparkSpeculator", tone="active", font_size=12)
    c.node("g_dspark", lx, ly + 72, lw, 64, "DSparkDraft & Markov 采样\n_sample_sequential / All-to-All 按请求分片\n_fuse_markov_bias 融进 Gumbel 采样核", tone="highlight", font_size=12)
    c.node("g_graph", lx, ly + 152, lw, 56, "CUDA Graph 全图重放\nshare_mtp_topk_indices 跳过重复 Indexer", tone="active", font_size=12)
    c.node("g_rej", lx, ly + 224, lw, 48, "Triton 无损拒绝校验\nrejection_sampler.py + 局部 LogSumExp 归约", tone="active", emphasis=True, font_size=12)

    c.node("a_hier", rx, ry, rw, 56, "Ascend 混合扩展栈\nAscendTargetDependentARSpeculator\nAscendMTPSpeculator / AscendDSparkSpeculator", tone="activation", font_size=12)
    c.node("a_dspark", rx, ry + 72, rw, 64, "LMHead TP 对齐（对齐集合通信形状）\nLmheadTPDraftSamplingMixin 将行填充至\nmax_num_reqs × num_speculative_steps", tone="highlight", font_size=12)
    c.node("a_graph", rx, ry + 152, rw, 56, "ACLGraph + AscendDSASWA 缓存\nAutoRegressiveAclGraphManager\n+ 线性物理槽位 Scatter 写入", tone="activation", font_size=12)
    c.node("a_rej", rx, ry + 224, rw, 48, "NPU 校验与重采样 Kernel\n_probabilistic_rejection_kernel + resample.py", tone="activation", emphasis=True, font_size=12)

    c.connect("eg1", "g_hier", "g_dspark", tone="fg")
    c.connect("eg2", "g_dspark", "g_graph", tone="fg")
    c.connect("eg3", "g_graph", "g_rej", tone="fg")
    c.connect("ea1", "a_hier", "a_dspark", tone="fg")
    c.connect("ea2", "a_dspark", "a_graph", tone="fg")
    c.connect("ea3", "a_graph", "a_rej", tone="fg")

    out = POSTS_ROOT / "09-mtp-and-dspark" / "diagrams" / "09-mtp-vllm-runtime.drawio"
    c.save(out, strict=True, build_svg=True)


def build_10_five_gen_ledger() -> None:
    """10-five-gen-ledger.drawio：V2 -> V3 -> R1 -> V3.2 -> V4.1-Flash KV 字节对比、参数分工与双硬件执行栈。"""
    c = DrawioCanvas(page_name="five-gen-ledger", diagram_id="ds-10-five-gen-ledger", width=688)

    c.proportional_strip(
        "kv_v23",
        8,
        32,
        672,
        40,
        [
            (1024, "V2 / V3 / R1 BF16 c_t^KV (1024 B)", "active", False),
            (128, "k_t^R\n(128 B)", "highlight", False),
        ],
        title="1. V2 / V3 / R1 BF16 MLA：1024 B c_t^KV + 128 B k_t^R（61 层整网 70,272 B/tok）",
        total_label="1152 B/层",
    )

    c.proportional_strip(
        "kv_v32",
        8,
        112,
        464,
        40,
        [
            (656, "V3.2 FP8 主缓存 (656 B)", "active", False),
            (132, "索引器\n(132 B)", "highlight", False),
        ],
        title="2. V3.2 FP8 MLA + DSA Indexer：656 B 主缓存 + 132 B 索引器（解码仅读 Top-2048）",
        total_label="788 B/层",
    )
    c.node(
        "kv_v32_note",
        488,
        112,
        192,
        40,
        "解码仅读 Top-2048 槽位\n61 层整网 48,068 B/tok",
        tone="neutral",
        dashed=True,
        font_size=12,
    )

    c.proportional_strip(
        "kv_v41",
        8,
        192,
        208,
        40,
        [
            (288, "288 B 主 KV\n(256B E2M1+32B)", "done", True),
            (68, "68 B HSI", "highlight", True),
        ],
        title="3. V4.1-Flash CSA2 + CED：全局层 288 B 主 KV + 68 B HSI",
        total_label="均摊 890 B/tok",
    )
    c.node(
        "kv_v41_note",
        240,
        192,
        440,
        40,
        "40 层全模型净均摊 2.5 × 356 = 890 B/tok（较 V3 降约 79×）\n288 B 主 KV (256B E2M1 + 32B E4M3 缩放) + 68 B HSI (MXFP4)",
        tone="done",
        dashed=True,
        align="left",
        font_size=12,
    )

    c.proportional_strip(
        "param_ratio",
        8,
        312,
        672,
        40,
        [
            (16, "16B 在线激活", "done", True),
            (536, "536B HBM 未激活专家 (与 16B 共构 552B 主干)", "active", False),
            (196, "196B Host DRAM Engram\n(Layers 1 & 14)", "highlight", False),
        ],
        title="4. V4.1-Flash 参数与存储分工：16B 激活 + 536B HBM 未激活 + 196B Host DRAM",
        total_label="748B 总规模",
    )

    (lx, ly, lw, _), (rx, ry, rw, _) = c.swimlane_pair(
        "synth",
        "NVIDIA Hopper / Blackwell 执行栈",
        "Huawei Ascend 910B / 910C 执行栈",
        y=416,
        h=112,
        total_w=688,
        gap=16,
        left_tone="active",
        right_tone="highlight",
    )
    c.node("gpu_end", lx, ly, lw, 64, "• DeepseekV4MegaAttnAttention (288B NVFP4)\n• mega_mhc 单遍融合 + DeepEP DBO\n• EngramPeerExchange + DSparkSpeculator", tone="active", font_size=12, align="left")
    c.node("npu_end", rx, ry, rw, 64, "• AscendDSAV41Impl + packed_cache_ops\n• npu_hc_pre_v3 + AscendMoERunner (MC2)\n• UVA Engram 直读 + AscendDSparkSpeculator", tone="highlight", font_size=12, align="left")

    out = POSTS_ROOT / "10-architecture-synthesis" / "diagrams" / "10-five-gen-ledger.drawio"
    c.save(out, strict=True, build_svg=True)


def main() -> None:
    build_06_moe_arch()
    build_07_engram_arch()
    build_07_engram_hash()
    build_07_engram_gate_disambig()
    build_07_engram_layer()
    build_07_shortconv_dilation()
    build_07_engram_runtime()
    build_08_mhc_arch_comp()
    build_08_mhc_block_trace()
    build_08_mhc_sinkhorn_stability()
    build_08_mhc_single_pass()
    build_09_mtp_runtime()
    build_10_five_gen_ledger()
    print("Successfully built and strictly linted all 13 Part-B static diagrams.")


if __name__ == "__main__":
    main()
