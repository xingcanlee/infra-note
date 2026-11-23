"""Build and compile all Draw.io diagrams for the `distributed` series."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from diagram_kit import CANVAS_W, DrawioCanvas  # noqa: E402

POSTS_ROOT = (
    Path(__file__).resolve().parents[2] / "src" / "content" / "posts" / "distributed"
)


def build_01_nvlink_vs_hccs() -> None:
    """Chapter 01: Scale-Up vs Scale-Out hierarchy (NVIDIA vs Huawei Ascend)."""
    c = DrawioCanvas(
        page_name="NVLink vs HCCS",
        diagram_id="dist-01-nvlink-vs-hccs",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "自上而下按“卡内 -> Scale-Up 超节点扩展域 -> Scale-Out 跨机网络”分层对比",
        size=12,
        tone="muted",
        align="center",
    )

    (lx, ly, lw, lh), (rx, ry, rw, rh) = c.swimlane_pair(
        "stack",
        "NVIDIA GPU 互联栈",
        "华为昇腾 NPU 互联栈",
        y=32,
        h=528,
        total_w=CANVAS_W,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    # Tier 1: Compute & HBM (Inside Die / Package)
    c.text(
        "l_t1_lbl",
        lx + 8,
        ly,
        lw - 16,
        24,
        "Tier 1 · 卡内计算与封装内 HBM 显存",
        size=12,
        tone="muted",
        bold=True,
    )
    c.node(
        "l_t1",
        lx + 8,
        ly + 24,
        lw - 16,
        56,
        "Tensor Core + HBM3e\n单卡高带宽访存与 DMA 引擎",
        tone="neutral",
        font_size=12,
    )

    c.text(
        "r_t1_lbl",
        rx + 8,
        ry,
        rw - 16,
        24,
        "Tier 1 · 卡内计算与封装内 HBM 显存",
        size=12,
        tone="muted",
        bold=True,
    )
    c.node(
        "r_t1",
        rx + 8,
        ry + 24,
        rw - 16,
        56,
        "DaVinci AICore + HBM\n片上 Unified Buffer + SDMA",
        tone="neutral",
        font_size=12,
    )

    # Tier 2: Scale-Up Domain (Intra-Node + SuperPod)
    c.group(
        "l_su",
        lx + 8,
        ly + 104,
        lw - 16,
        216,
        title="Tier 2 · Scale-Up 高速共享域 (机内 & 超节点)",
        tone="active",
        dashed=False,
    )
    c.node(
        "l_su_node",
        lx + 24,
        ly + 136,
        lw - 48,
        64,
        "机内 8 卡 NVLink 4/5 + NVSwitch\n900 / 1800 GB/s 全交叉 · NVLS 硬件归约",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "l_su_pod",
        lx + 24,
        ly + 232,
        lw - 48,
        72,
        "超节点 GB200 NVL72 (MNNVL)\n72 卡跨机柜统一 NVLink 内存域",
        tone="active",
        font_size=12,
    )

    c.group(
        "r_su",
        rx + 8,
        ry + 104,
        rw - 16,
        216,
        title="Tier 2 · Scale-Up 高速共享域 (机内 & 超节点)",
        tone="activation",
        dashed=False,
    )
    c.node(
        "r_su_node",
        rx + 24,
        ry + 136,
        rw - 48,
        64,
        "机内 910B HCCS 对等直连拓扑\n392 GB/s 带宽 · SDMA 零拷贝",
        tone="activation",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "r_su_pod",
        rx + 24,
        ry + 232,
        rw - 48,
        72,
        "超节点 CloudMatrix 384 (Unified Bus 总线)\n384 卡统一编址 · 机柜级对等内存池",
        tone="activation",
        font_size=12,
    )

    # Tier 3: Scale-Out Domain (Cluster Parameter Plane)
    c.group(
        "l_so",
        lx + 8,
        ly + 360,
        lw - 16,
        104,
        title="Tier 3 · Scale-Out 跨机集群网络",
        tone="highlight",
        dashed=True,
    )
    c.node(
        "l_so_nic",
        lx + 24,
        ly + 392,
        lw - 48,
        56,
        "ConnectX-7/8 IB / RoCEv2 多轨网卡\n400~800 Gbps · GPUDirect / IBGDA",
        tone="highlight",
        font_size=12,
    )

    c.group(
        "r_so",
        rx + 8,
        ry + 360,
        rw - 16,
        104,
        title="Tier 3 · Scale-Out 跨机集群网络",
        tone="highlight",
        dashed=True,
    )
    c.node(
        "r_so_nic",
        rx + 24,
        ry + 392,
        rw - 48,
        56,
        "昇腾参数面 RoCE 多轨网卡\n片上集成多口 · DEVICE_RDMA / URMA",
        tone="highlight",
        font_size=12,
    )

    c.connect("l_e1", "l_t1", "l_su", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.connect("l_e2", "l_su_node", "l_su_pod", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_l_e2", 180, 236, 112, 24, "MNNVL", size=12, tone="muted", align="left")
    c.connect("l_e3", "l_su", "l_so", tone="muted", dashed=True, ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_l_e3", 180, 360, 120, 24, "跨机 RDMA", size=12, tone="muted", align="left")

    c.connect("r_e1", "r_t1", "r_su", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.connect("r_e2", "r_su_node", "r_su_pod", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_r_e2", 532, 236, 112, 24, "Unified Bus", size=12, tone="muted", align="left")
    c.connect("r_e3", "r_su", "r_so", tone="muted", dashed=True, ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_r_e3", 532, 360, 120, 24, "跨机 RoCE", size=12, tone="muted", align="left")

    out_path = (
        POSTS_ROOT
        / "01-interconnects-and-collectives"
        / "diagrams"
        / "01-nvlink-vs-hccs-arch.drawio"
    )
    c.save(out_path, strict=True, build_svg=True)


def build_02_tp_sp_sharding() -> None:
    """Chapter 02: Proportional tensor sharding across TP, SP, and Ring CP."""
    c = DrawioCanvas(
        page_name="TP SP CP Sharding",
        diagram_id="dist-02-tp-sp-sharding",
        width=CANVAS_W,
    )

    # Section 1: Megatron Column + Row Tensor Parallelism (P=2)
    c.group(
        "g_tp",
        0,
        0,
        CANVAS_W,
        160,
        title="1. Megatron 张量并行 (TP = 2)：Column 切列 + Row 切行，每子层仅 1 次 AllReduce（每层 2 次）",
        tone="active",
        dashed=True,
    )
    c.tensor_block(
        "tp_x",
        16,
        56,
        80,
        56,
        name="输入 X",
        shape="[B·S, D]",
        tone="neutral",
        font_size=12,
    )
    c.tensor_block(
        "tp_wcol",
        120,
        56,
        144,
        56,
        name="Column W_col",
        shape="[D, H] 按列切",
        tone="active",
        emphasis=True,
        splits=[(0.5, "x", "Rank0", "Rank1")],
        font_size=12,
    )
    c.tensor_block(
        "tp_y",
        288,
        56,
        112,
        56,
        name="隐状态 Y",
        shape="[B·S, H/2]",
        tone="activation",
        splits=[(0.5, "x", "Y0", "Y1")],
        font_size=12,
    )
    c.tensor_block(
        "tp_wrow",
        424,
        56,
        144,
        56,
        name="Row W_row",
        shape="[H, D] 按行切",
        tone="activation",
        emphasis=True,
        splits=[(0.5, "y", "Rank0 行段", "Rank1 行段")],
        font_size=12,
    )
    c.node(
        "tp_ar",
        592,
        56,
        80,
        56,
        "AllReduce\n(+)",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.connect("tp_c1", "tp_x", "tp_wcol", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("tp_c2", "tp_wcol", "tp_y", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("tp_c3", "tp_y", "tp_wrow", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("tp_c4", "tp_wrow", "tp_ar", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))

    # Section 2: Sequence Parallelism (SP)
    c.group(
        "g_sp",
        0,
        176,
        CANVAS_W,
        152,
        title="2. 序列并行 (SP)：将 Norm / Residual 激活切至 [S/P, B, D]，消除每卡重复显存",
        tone="activation",
        dashed=True,
    )
    c.node(
        "sp_rs",
        16,
        232,
        128,
        56,
        "ReduceScatter\n(替代 AllReduce)",
        tone="highlight",
        font_size=12,
    )
    c.tensor_block(
        "sp_shard",
        176,
        232,
        208,
        56,
        name="序列分片激活",
        shape="[S/P, B, D]",
        tone="activation",
        emphasis=True,
        splits=[(0.5, "x", "Rank0: S0", "Rank1: S1")],
        font_size=12,
    )
    c.node(
        "sp_norm",
        416,
        232,
        112,
        56,
        "局部 RMSNorm\n+ 残差累加",
        tone="neutral",
        font_size=12,
    )
    c.node(
        "sp_ag",
        560,
        232,
        112,
        56,
        "AllGather\n恢复 [S, B, D]",
        tone="highlight",
        font_size=12,
    )
    c.connect("sp_c1", "sp_rs", "sp_shard", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("sp_c2", "sp_shard", "sp_norm", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.connect("sp_c3", "sp_norm", "sp_ag", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))

    # Section 3: Ring Context Parallelism (CP)
    c.group(
        "g_cp",
        0,
        344,
        CANVAS_W,
        216,
        title="3. Ring 上下文并行 (CP)：Qi 原地驻留，KVj 沿环接力轮转完成在线 Softmax",
        tone="highlight",
        dashed=True,
    )
    c.tensor_block(
        "cp_q0",
        16,
        384,
        120,
        48,
        name="Rank 0 · Q0",
        shape="[S/P, Hq, d]",
        tone="active",
        font_size=12,
    )
    c.tensor_block(
        "cp_kv0",
        16,
        456,
        120,
        48,
        name="局部 KV0",
        shape="发往下一跳 ->",
        tone="highlight",
        font_size=12,
    )
    c.node(
        "cp_attn0",
        168,
        384,
        144,
        120,
        "在线归并 (m0, l0)\n无需汇聚完整 KV",
        tone="neutral",
        font_size=12,
    )
    c.tensor_block(
        "cp_q1",
        352,
        384,
        120,
        48,
        name="Rank 1 · Q1",
        shape="[S/P, Hq, d]",
        tone="active",
        font_size=12,
    )
    c.tensor_block(
        "cp_kv1",
        352,
        456,
        120,
        48,
        name="局部 KV1",
        shape="<- 接收对端 KV",
        tone="highlight",
        font_size=12,
    )
    c.node(
        "cp_attn1",
        512,
        384,
        160,
        120,
        "P2P Send/Recv\n通信掩盖在 Attention 内",
        tone="activation",
        font_size=12,
    )
    c.connect("cp_c1", "cp_q0", "cp_attn0", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.2))
    c.connect("cp_c2", "cp_kv0", "cp_attn0", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.8))
    c.connect(
        "cp_c3",
        "cp_kv0",
        "cp_kv1",
        tone="muted",
        dashed=True,
        exit_xy=(0.5, 1.0),
        entry_xy=(0.5, 1.0),
        points=[(76, 536), (412, 536)],
    )
    c.text("lbl_ring_kv", 184, 512, 120, 20, "Ring 轮转 KV", size=12, tone="muted", align="center")
    c.connect("cp_c4", "cp_q1", "cp_attn1", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.2))
    c.connect("cp_c5", "cp_kv1", "cp_attn1", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.8))

    out_path = (
        POSTS_ROOT
        / "02-parallelism-and-disaggregation"
        / "diagrams"
        / "02-tp-sp-sharding.drawio"
    )
    c.save(out_path, strict=True, build_svg=True)


def build_02_pd_disaggregation() -> None:
    """Chapter 02: Prefill-Decode disaggregation with Mooncake/NIXL/Ascend MemFabric KV transfer."""
    c = DrawioCanvas(
        page_name="PD Disaggregation",
        diagram_id="dist-02-pd-disaggregation",
        width=CANVAS_W,
    )

    c.node(
        "router",
        0,
        0,
        CANVAS_W,
        40,
        "全局调度器 Router / Proxy：分离 TTFT 与 TPOT SLA，交换 Block ID 与远端端口元数据",
        tone="neutral",
        font_size=12,
        bold=True,
    )

    # Left: Prefill Pool
    c.group(
        "g_prefill",
        0,
        80,
        176,
        304,
        title="Prefill 实例池 (算力密集)",
        tone="active",
        dashed=False,
    )
    c.node(
        "p_cfg",
        12,
        112,
        152,
        48,
        "高 TP 并行 (TP4 / TP8)\n低批并发吃满 Prefill 算力",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "p_comp",
        12,
        184,
        152,
        56,
        "1. 长 Prompt 全序列计算\n生成首字 (TTFT) + KV",
        tone="neutral",
        font_size=12,
    )
    c.tensor_block(
        "p_kv",
        16,
        272,
        144,
        64,
        name="Paged KV Blocks",
        shape="[blocks, block_sz, kv]",
        tone="active",
        stack=2,
        font_size=12,
    )

    # Middle: Async KV Transfer Fabric
    c.group(
        "g_xfer",
        240,
        80,
        208,
        304,
        title="异步零拷贝 KV 传输引擎",
        tone="highlight",
        dashed=True,
    )
    c.node(
        "xfer_nv",
        248,
        120,
        192,
        104,
        "NVIDIA 栈 · NIXL / Mooncake\n• UCX / GPUDirect / NVLink\n• Layer-wise 边算边推 KV 分页",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "xfer_npu",
        248,
        248,
        192,
        112,
        "昇腾栈 · MooncakeLayerwise\n+ MemFabric (接替 LLMDataDist)\n• SDMA / DEVICE_RDMA / URMA",
        tone="activation",
        emphasis=True,
        font_size=12,
    )

    # Right: Decode Pool
    c.group(
        "g_decode",
        512,
        80,
        176,
        304,
        title="Decode 实例池 (访存密集)",
        tone="activation",
        dashed=False,
    )
    c.node(
        "d_cfg",
        524,
        112,
        152,
        48,
        "Attention DP + MoE EP\n消除权重多卡副本冗余",
        tone="activation",
        emphasis=True,
        font_size=12,
    )
    c.tensor_block(
        "d_kv",
        528,
        192,
        144,
        64,
        name="远端注册 HBM 槽位",
        shape="单向 RDMA Write 直写 HBM",
        tone="neutral",
        stack=2,
        font_size=12,
    )
    c.node(
        "d_gen",
        524,
        288,
        152,
        64,
        "2. 持续自回归 Decode\n稳态低抖动 TPOT 输出",
        tone="neutral",
        font_size=12,
    )

    c.connect("e_rp", "router", "g_prefill", tone="fg", ortho=False, exit_xy=(0.1279, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_rp", 96, 48, 112, 24, "1. Prefill 请求", size=12, tone="fg", align="left")
    c.connect("e_rd", "router", "g_decode", tone="muted", dashed=True, ortho=False, exit_xy=(0.8721, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_rd", 480, 48, 112, 24, "2. 元数据建链", size=12, tone="muted", align="right")
    c.connect("e_pc", "p_cfg", "p_comp", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.connect("e_pk", "p_comp", "p_kv", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.connect("e_p2nv", "p_kv", "xfer_nv", tone="fg", exit_xy=(1.0, 0.25), entry_xy=(0.0, 0.5), points=[(196, 288), (196, 172)])
    c.text("lbl_p2nv", 198, 200, 40, 32, "RDMA\nWrite", size=11, tone="muted", align="center")
    c.connect("e_p2npu", "p_kv", "xfer_npu", tone="fg", ortho=False, exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5))
    c.text("lbl_p2npu", 184, 312, 48, 32, "SDMA\nRoCE", size=11, tone="muted", align="center")
    c.connect("e_nv2d", "xfer_nv", "d_kv", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.25), points=[(480, 172), (480, 208)])
    c.text("lbl_nv2d", 448, 144, 64, 20, "KV Ready", size=11, tone="muted", align="center")
    c.connect("e_npu2d", "xfer_npu", "d_kv", tone="fg", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.75), points=[(480, 304), (480, 240)])
    c.text("lbl_npu2d", 456, 312, 48, 20, "Notify", size=11, tone="muted", align="center")
    c.connect("e_dstep", "d_kv", "d_gen", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))

    out_path = (
        POSTS_ROOT
        / "02-parallelism-and-disaggregation"
        / "diagrams"
        / "02-pd-disaggregation-arch.drawio"
    )
    c.save(out_path, strict=True, build_svg=True)


def build_03_deepep_vs_mc2() -> None:
    """Chapter 03: NVIDIA DeepEP HT/LL vs Ascend HCCL MC2 operator fusion."""
    c = DrawioCanvas(
        page_name="DeepEP vs MC2",
        diagram_id="dist-03-deepep-vs-mc2",
        width=CANVAS_W,
    )

    c.text(
        "hdr",
        0,
        0,
        CANVAS_W,
        24,
        "MoE EP 通信与算子卸载：GPU DeepEP 无阻塞 Kernel vs 昇腾 MC2 AIV-AICore-RDMA 全核融合",
        size=12,
        tone="muted",
        align="center",
    )

    (lx, ly, lw, lh), (rx, ry, rw, rh) = c.swimlane_pair(
        "ep",
        "NVIDIA DeepEP (EPBuffer) + vLLM",
        "华为昇腾 HCCL MC2 通算融合",
        y=32,
        h=480,
        total_w=CANVAS_W,
        gap=16,
        left_tone="active",
        right_tone="activation",
    )

    # Left: NVIDIA DeepEP
    c.group(
        "l_ht",
        lx + 8,
        ly,
        lw - 16,
        112,
        title="Prefill：High-Throughput (HT) 分层转发",
        tone="active",
        dashed=False,
    )
    c.node(
        "l_ht_body",
        lx + 24,
        ly + 32,
        lw - 48,
        64,
        "RDMA 单份跨机中继 + NVLink 机内扇出\n跨机只传 1 份副本，节省网卡带宽",
        tone="active",
        font_size=12,
    )

    c.group(
        "l_ll",
        lx + 8,
        ly + 144,
        lw - 16,
        120,
        title="Decode：Low-Latency (LL) 纯 RDMA IBGDA",
        tone="highlight",
        dashed=False,
    )
    c.node(
        "l_ll_body",
        lx + 24,
        ly + 176,
        lw - 48,
        72,
        "GPU Warp 直接写网卡 Doorbell (IBGDA)\n绕过 CPU 与 Host 中转，压低启动延迟",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )

    c.node(
        "l_v2",
        lx + 8,
        ly + 296,
        lw - 16,
        120,
        "vLLM DeepEP v2 / Async Worker\n• DeepEPV2PrepareAndFinalize (CUDA Graph / 异步)\n• v1 HT/LL 路径提供 DBO recv_hook 双微批机制",
        tone="neutral",
        font_size=12,
    )

    # Right: Ascend MC2
    c.group(
        "r_disp",
        rx + 8,
        ry,
        rw - 16,
        112,
        title="Dispatch：npu_moe_distribute_dispatch_v2",
        tone="activation",
        dashed=False,
    )
    c.node(
        "r_disp_body",
        rx + 24,
        ry + 32,
        rw - 48,
        64,
        "AIV 向量核打包 + 窗口化 HCCS/SDMA/RDMA\n通信与量化融合在单一融合算子内完成",
        tone="activation",
        emphasis=True,
        font_size=12,
    )

    c.node(
        "r_gmm",
        rx + 8,
        ry + 144,
        rw - 16,
        56,
        "AICore GroupedMatmul (GMM)\n接收即算，按专家偏移直接启动矩阵计算",
        tone="neutral",
        font_size=12,
    )

    c.group(
        "r_comb",
        rx + 8,
        ry + 232,
        rw - 16,
        104,
        title="Combine：npu_moe_distribute_combine_v2",
        tone="highlight",
        dashed=False,
    )
    c.node(
        "r_comb_body",
        rx + 24,
        ry + 264,
        rw - 48,
        56,
        "专家回传后原地 Top-K 加权归约\n省去独立 ReduceScatter 与临时缓冲",
        tone="highlight",
        font_size=12,
    )

    c.node(
        "r_mc2",
        rx + 8,
        ry + 360,
        rw - 16,
        56,
        "A2 HCCS / A3 Unified Bus SDMA\nDispatch-FFN-Combine 算子级通算融合",
        tone="activation",
        font_size=12,
    )

    c.connect("l_e1", "l_ht", "l_ll", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_l_e1", 180, 148, 96, 24, "模式切换", size=12, tone="muted", align="left")
    c.connect("l_e2", "l_ll", "l_v2", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.connect("r_e1", "r_disp", "r_gmm", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_r_e1", 532, 148, 128, 24, "按偏移传给 GMM", size=12, tone="muted", align="left")
    c.connect("r_e2", "r_gmm", "r_comb", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))
    c.text("lbl_r_e2", 532, 236, 80, 24, "回传", size=12, tone="muted", align="left")
    c.connect("r_e3", "r_comb", "r_mc2", tone="fg", ortho=False, exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0))

    out_path = (
        POSTS_ROOT
        / "03-moe-comm-and-overlap"
        / "diagrams"
        / "03-deepep-vs-mc2-arch.drawio"
    )
    c.save(out_path, strict=True, build_svg=True)


def main() -> None:
    build_01_nvlink_vs_hccs()
    build_02_tp_sp_sharding()
    build_02_pd_disaggregation()
    build_03_deepep_vs_mc2()
    print("Built all 4 distributed Draw.io diagrams and compiled .wisp.svg files.")


if __name__ == "__main__":
    main()
