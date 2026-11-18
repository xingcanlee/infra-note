from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = SCRIPTS_DIR.parent
VLLM_POSTS_DIR = ROOT_DIR / "src" / "content" / "posts" / "vllm"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from diagram_kit import DrawioCanvas, ExcalidrawScene  # noqa: E402


def build_01_scheduler_arch() -> None:
    out_dir = VLLM_POSTS_DIR / "01-paged-attention-and-scheduler" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "01-v1-scheduler-arch.drawio"

    c = DrawioCanvas("V1 Scheduler Arch", "vllm-01-sched-arch", width=688)

    c.group("sched_grp", 0, 0, 688, 104, "vLLM V1 Scheduler.schedule() 统一配额调度", tone="active")
    c.node("req_q", 16, 32, 152, 56, "等待/运行请求队列\n(Chunked + Decode)", tone="neutral", font_size=12)
    c.node("budget", 248, 32, 192, 56, "token_budget 配额裁剪\n(消除 V0 Prefill/Decode 阶段隔离)", tone="active", emphasis=True, font_size=12)
    c.node("out_dict", 464, 32, 208, 56, "num_scheduled_tokens\n{req_id: tok_cnt}", tone="highlight", font_size=12)
    c.connect("e_rq_bd", "req_q", "budget", label="按轮扫描", tone="fg")
    c.connect("e_bd_od", "budget", "out_dict", tone="fg")

    c.group("kv_grp", 0, 144, 688, 112, "KVCacheManager 与 BlockPool 物理块管理", tone="neutral")
    c.node("prefix", 16, 176, 168, 64, "Prefix Cache 哈希树\n满块命中即 ref_cnt += 1", tone="highlight", font_size=12)
    c.node("pool", 264, 176, 176, 64, "BlockPool (Free FIFO)\nB0 永久保留为 null_block", tone="active", emphasis=True, font_size=12)
    c.node("slot_map", 512, 176, 160, 64, "slot_mapping[]\nPadding 槽位填 PAD (-1)", tone="neutral", font_size=12)
    c.connect(
        "e_od_pl",
        "out_dict",
        "pool",
        label="alloc / free",
        exit_xy=(0.5, 1.0),
        entry_xy=(0.65, 0.0),
        points=[(568, 124), (376, 124)],
        tone="fg",
    )
    c.connect("e_pf_pl", "prefix", "pool", label="零拷贝复用", tone="fg")
    c.connect("e_pl_sm", "pool", "slot_map", label="块内偏移", tone="fg")

    (lx, ly, lw, _), (rx, ry, rw, _) = c.swimlane_pair(
        "kv_hw",
        "NVIDIA GPU · vLLM Kernel",
        "Ascend NPU · vllm-ascend Kernel",
        y=288,
        h=128,
        left_tone="active",
        right_tone="activation",
    )
    c.node(
        "gpu_kv",
        lx + 8,
        ly + 8,
        lw - 16,
        72,
        "reshape_and_cache_flash\n读 slot_mapping；遇到 slot < 0 直接跳过写回",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "npu_kv",
        rx + 8,
        ry + 8,
        rw - 16,
        72,
        "torch_npu.npu_scatter_pa_kv_cache\nAICore 向量单元按 slot_mapping Scatter 写入物理 KV 块",
        tone="activation",
        emphasis=True,
        font_size=12,
    )
    c.connect(
        "e_sm_gpu",
        "slot_map",
        "gpu_kv",
        exit_xy=(0.25, 1.0),
        entry_xy=(0.85, 0.0),
        points=[(552, 272), (272, 272)],
        tone="fg",
    )
    c.connect(
        "e_sm_npu",
        "slot_map",
        "npu_kv",
        exit_xy=(0.75, 1.0),
        entry_xy=(0.86, 0.0),
        tone="fg",
    )

    c.save(out_path, strict=True, build_svg=True)


def build_02_async_output_arch() -> None:
    out_dir = VLLM_POSTS_DIR / "02-async-execution-and-launch-wall" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "02-async-output-arch.drawio"

    c = DrawioCanvas("AsyncOutput Arch", "vllm-02-async-arch", width=688)
    (lx, _, lw, _), (rx, _, rw, _) = c.swimlane_pair(
        "async",
        "NVIDIA GPU · AsyncOutput (MRV2)",
        "Ascend NPU · NPUModelRunner 异步流水",
        y=0,
        h=400,
        left_tone="active",
        right_tone="activation",
    )

    c.node("g_sched", lx + 8, 40, lw - 16, 64, "GPUModelRunner 主线程\nPrep Step N -> 入队无同步发射", tone="active", font_size=12)
    c.node("g_comp", lx + 8, 128, lw - 16, 64, "Default CUDA Stream\n前向计算 + 采样 (非阻塞返回)", tone="active", emphasis=True, font_size=12)
    c.node("g_copy", lx + 8, 224, lw - 16, 64, "copy_stream + AsyncOutput\n锁页 D2H -> copy_event.record()", tone="highlight", font_size=12)
    c.node("g_wait", lx + 8, 320, lw - 16, 64, "AsyncOutput.get_output()\n准备完 Step N+1 再兑现同步", tone="neutral", font_size=12)
    c.connect("e_g0", "g_sched", "g_comp", tone="fg")
    c.connect("e_g1", "g_comp", "g_copy", label="async copy", tone="fg")
    c.connect("e_g2", "g_copy", "g_wait", label="copy_event", tone="muted", dashed=True)

    c.node("n_sched", rx + 8, 40, rw - 16, 64, "NPUModelRunner 主线程\n异步下发 ACL Task 至 CANN 队列", tone="activation", font_size=12)
    c.node("n_comp", rx + 8, 128, rw - 16, 64, "CANN TaskQueue 硬件流水\nAICore 连续消费算子任务块", tone="activation", emphasis=True, font_size=12)
    c.node("n_copy", rx + 8, 224, rw - 16, 64, "copy_stream + AscendAsyncOutput\n锁页拷贝并记录异步完成事件", tone="highlight", font_size=12)
    c.node("n_wait", rx + 8, 320, rw - 16, 64, "aclrtSynchronizeEvent\n推迟至必须读取 token 时等待", tone="neutral", font_size=12)
    c.connect("e_n0", "n_sched", "n_comp", tone="fg")
    c.connect("e_n1", "n_comp", "n_copy", label="async copy", tone="fg")
    c.connect("e_n2", "n_copy", "n_wait", label="NPU Event", tone="muted", dashed=True)

    c.save(out_path, strict=True, build_svg=True)


def build_03_fx_split_graph() -> None:
    out_dir = VLLM_POSTS_DIR / "03-torch-compile-and-piecewise" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "03-fx-split-graph.drawio"

    c = DrawioCanvas("FX Split Graph", "vllm-03-fx-split", width=688)

    c.group("before_g", 0, 0, 688, 120, "切分前：单层原始 Torch FX 图（含自定义 Attention 节点）", tone="neutral")
    c.node("b0", 16, 40, 128, 64, "RMSNorm + Act\n(Pointwise)", tone="active", font_size=12)
    c.node("b1", 168, 40, 112, 64, "QKV Linear\n(GEMM)", tone="active", font_size=12)
    c.node("b2", 304, 40, 160, 64, "unified_attention\n(命中 splitting_ops)", tone="highlight", emphasis=True, font_size=12)
    c.node("b3", 488, 40, 184, 64, "Gate Linear + SiLU*Up\n(GEMM + Pointwise)", tone="active", font_size=12)
    c.connect("e_b01", "b0", "b1", tone="fg")
    c.connect("e_b12", "b1", "b2", tone="fg")
    c.connect("e_b23", "b2", "b3", tone="fg")

    c.group("after_g", 0, 160, 688, 200, "split_graph 切分后：纯张量融合与旁路隔离", tone="neutral")
    c.node(
        "s0",
        16,
        200,
        184,
        72,
        "submod_0 (静态编译)\nRMSNorm 融合算子 + QKV GEMM\n同子图编译与捕获",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "s1",
        232,
        200,
        208,
        72,
        "submod_1 (Eager 隔离)\n不进 Inductor / npugraph_ex\n直调 PagedAttention 算子",
        tone="highlight",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "s2",
        472,
        200,
        200,
        72,
        "submod_2 (静态编译)\nGate/Up GEMM + SiLU * Mul\n同子图融合与捕获",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node("s0_tag", 16, 296, 184, 48, "CUDAGraph / ACLGraph (PW)", tone="neutral", font_size=12)
    c.node("s1_tag", 232, 296, 208, 48, "跳过 Graph 捕获，动态读 KV", tone="neutral", font_size=12)
    c.node("s2_tag", 472, 296, 200, 48, "CUDAGraph / ACLGraph (PW)", tone="neutral", font_size=12)

    c.connect("e_split", "b2", "s1", label="split_graph 切出", exit_xy=(0.5, 1.0), entry_xy=(0.73, 0.0), tone="fg", dashed=True)
    c.connect("e_s01", "s0", "s1", tone="fg")
    c.connect("e_s12", "s1", "s2", tone="fg")
    c.connect("e_t0", "s0", "s0_tag", tone="muted", dashed=True, arrow_end=False)
    c.connect("e_t1", "s1", "s1_tag", tone="muted", dashed=True, arrow_end=False)
    c.connect("e_t2", "s2", "s2_tag", tone="muted", dashed=True, arrow_end=False)

    c.save(out_path, strict=True, build_svg=True)


def build_03_inductor_vs_ascend_compile() -> None:
    out_dir = VLLM_POSTS_DIR / "03-torch-compile-and-piecewise" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "03-inductor-vs-ascend-compile.drawio"

    c = DrawioCanvas("Inductor vs AscendCompiler", "vllm-03-compile-arch", width=688)
    (lx, _, lw, _), (rx, _, rw, _) = c.swimlane_pair(
        "comp",
        "NVIDIA GPU · TorchInductor + Triton",
        "Ascend NPU · AscendCompiler + npugraph_ex",
        y=0,
        h=384,
        left_tone="active",
        right_tone="activation",
    )

    c.node("gi0", lx + 8, 40, lw - 16, 64, "TorchCompileWithNoGuardsWrapper\n跳过动态 Shape Guard 防重追踪", tone="neutral", font_size=12)
    c.node("gi1", lx + 8, 128, lw - 16, 64, "VllmBackend + split_graph\n按 splitting_ops 切出分段 FX 子图", tone="active", font_size=12)
    c.node("gi2", lx + 8, 216, lw - 16, 64, "TorchInductor FX Fusion\n自动生成并编译 Triton 融合 Kernel", tone="active", emphasis=True, font_size=12)
    c.node("gi3", lx + 8, 304, lw - 16, 64, "CUDAGraphWrapper (PIECEWISE)\n捕获各分段静态序列供低开销重放", tone="highlight", font_size=12)
    c.connect("e_gi0", "gi0", "gi1", tone="fg")
    c.connect("e_gi1", "gi1", "gi2", tone="fg")
    c.connect("e_gi2", "gi2", "gi3", tone="fg")

    c.node("ni0", rx + 8, 40, rw - 16, 64, "TorchCompileWithNoGuardsWrapper\n共用 vLLM 上层无 Guard 入口", tone="neutral", font_size=12)
    c.node("ni1", rx + 8, 128, rw - 16, 64, "AscendCompiler.compile\noot_compiler (use_inductor=False)", tone="activation", font_size=12)
    c.node("ni2", rx + 8, 216, rw - 16, 64, "npugraph_ex (FULL) / GraphFusionPass (PW)\n下沉 GE 图或模式匹配算子融合", tone="activation", emphasis=True, font_size=12)
    c.node("ni3", rx + 8, 304, rw - 16, 64, "ACLGraphWrapper / UpdatableGraph\n驱动 aclmdlRI 静态图捕获与热更新重放", tone="highlight", font_size=12)
    c.connect("e_ni0", "ni0", "ni1", tone="fg")
    c.connect("e_ni1", "ni1", "ni2", tone="fg")
    c.connect("e_ni2", "ni2", "ni3", tone="fg")

    c.save(out_path, strict=True, build_svg=True)


def build_04_four_boundaries_cards() -> None:
    out_dir = VLLM_POSTS_DIR / "04-cuda-graph-and-boundaries" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "04-four-boundaries-cards.excalidraw"

    ex = ExcalidrawScene(seed=42)
    cards = [
        (
            "b1",
            "约束一：输入输出指针固定\n\n• 捕获硬编码张量虚拟地址 (data_ptr)\n• 重放必须原位 copy_() 覆写静态缓冲\n• 重新赋值将导致图仍读取旧地址 0x7f00_1000\n• 末图启用 weak_ref_tensors() 释放中间结果",
            "blue",
            True,
        ),
        (
            "b2",
            "约束二：静态批形与零分配\n\n• 真实 Batch 必须垫齐进 Capture 桶\n• 禁止图内按运行时标量动态申请张量\n• 捕获共享 global_graph_pool 控制显存\n• Padding 槽位 slot_mapping 须刷写为 -1",
            "amber",
            True,
        ),
        (
            "b3",
            "约束三：零主机控制流同步\n\n• 禁止图内调用 .item() / .cpu() / .tolist()\n• 禁止数据依赖分支与 torch.nonzero()\n• 分支条件须前置至 Runner CPU 侧\n• 违例直接触发 StreamCaptureUnsupported",
            "rose",
            True,
        ),
        (
            "b4",
            "约束四：副流汇合与通信池隔离\n\n• 旁路拷贝流必须经 Event 汇回主流\n• Offloader 末尾执行 join_after_forward()\n• 对称内存切换至 nccl_symm_mem_context\n• 暂停 graph_pool 后登记跨卡通信窗地址",
            "slate",
            False,
        ),
    ]
    ex.quadrant_cards(cards, x=0, y=0, card_w=328, card_h=144, gap_x=24, gap_y=24)
    ex.build(out_path, also_build_svg=True, strict=True)


def build_06_aclgraph_vs_npugraph_arch() -> None:
    out_dir = VLLM_POSTS_DIR / "06-ascend-aclgraph-and-npugraph" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "06-aclgraph-vs-npugraph-arch.drawio"

    c = DrawioCanvas("ACLGraph vs npugraph_ex", "vllm-06-acl-vs-nge", width=688)
    (lx, _, lw, _), (rx, _, rw, _) = c.swimlane_pair(
        "ascend",
        "ACLGraphWrapper (aclmdlRI 捕获重放)",
        "npugraph_ex (AscendCompiler FX 图下沉)",
        y=0,
        h=384,
        left_tone="active",
        right_tone="activation",
    )

    c.node("a0", lx + 8, 40, lw - 16, 64, "ModelAclGraphManager 分桶\n稀疏档位 [32, 48, 64] 防 207008 流耗尽", tone="active", font_size=12)
    c.node("a1", lx + 8, 128, lw - 16, 64, "UpdatableGraph.register_task\n捕获 FIA 算子并保存 TaskGroup 句柄", tone="active", emphasis=True, font_size=12)
    c.node("a2", lx + 8, 216, lw - 16, 64, "update_stream 热更新 Tiling\ngraph_task_update_begin 原位刷新 seq_kv", tone="highlight", emphasis=True, font_size=12)
    c.node("a3", lx + 8, 304, lw - 16, 64, "ExternalEvent 跨流事件同步\nevent.record() 放行主流且防并发踩踏", tone="neutral", font_size=12)
    c.connect("e_a0", "a0", "a1", tone="fg")
    c.connect("e_a1", "a1", "a2", tone="fg")
    c.connect("e_a2", "a2", "a3", tone="muted", dashed=True)

    c.node("n0", rx + 8, 40, rw - 16, 64, "AscendCompiler.compile\n接收切分后 Torch FX 子图", tone="activation", font_size=12)
    c.node("n1", rx + 8, 128, rw - 16, 64, "npugraph_ex (回退 torchair)\nFX 下沉 GE 计算图 + 静态核编译选项", tone="activation", emphasis=True, font_size=12)
    c.node("n2", rx + 8, 216, rw - 16, 64, "含 Triton 算子时跳过图缓存\n检测到 triton_kernel_wrapper 不写磁盘", tone="highlight", font_size=12)
    c.node("n3", rx + 8, 304, rw - 16, 64, "适用强静态图与全局算子融合\n与 ACLGraphWrapper 在分段处协同工作", tone="neutral", font_size=12)
    c.connect("e_n0", "n0", "n1", tone="fg")
    c.connect("e_n1", "n1", "n2", tone="fg")
    c.connect("e_n2", "n2", "n3", tone="muted", dashed=True)

    c.save(out_path, strict=True, build_svg=True)


def main() -> None:
    build_01_scheduler_arch()
    build_02_async_output_arch()
    build_03_fx_split_graph()
    build_03_inductor_vs_ascend_compile()
    build_04_four_boundaries_cards()
    build_06_aclgraph_vs_npugraph_arch()
    print("Generated all 6 vLLM static diagrams and SVGs.")


if __name__ == "__main__":
    main()
