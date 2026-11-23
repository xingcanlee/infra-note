from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = SCRIPTS_DIR.parent
ACLGRAPH_POSTS_DIR = ROOT_DIR / "src" / "content" / "posts" / "aclgraph"

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from diagram_kit import DrawioCanvas, ExcalidrawScene  # noqa: E402


def build_00_three_layer_execution_stack() -> None:
    out_dir = ACLGRAPH_POSTS_DIR / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "00-three-layer-execution-stack.drawio"

    c = DrawioCanvas("ACL Graph Three Layer Execution Stack", "aclgraph-00-stack", width=688)

    c.group("l3", 0, 0, 688, 96, "第三层：静态图捕获、重放与生产系统（第 3–6 章）", tone="done")
    c.node("c3", 16, 32, 152, 48, "Ch03 CUDA Graph\nDAG 与四大静态边界", tone="done", font_size=12)
    c.node("c4", 184, 32, 152, 48, "Ch04 影子流机制\nArgs 备份与 EndGraph", tone="done", emphasis=True, font_size=12)
    c.node("c5", 352, 32, 152, 48, "Ch05 动态扩展\nTaskGrp 与条件子图", tone="done", font_size=12)
    c.node("c6", 520, 32, 152, 48, "Ch06 昇腾全栈\nvLLM-Ascend 与排障", tone="done", font_size=12)

    c.group("l2", 0, 144, 688, 96, "第二层：编译期静态化与融合限界（第 2 章 torch.compile）", tone="active")
    c.node("d1", 16, 176, 152, 48, "TorchDynamo\nPEP 523 与 Guard", tone="active", font_size=12)
    c.node("d2", 184, 176, 152, 48, "Symbolic Shapes\n符号推导与分片切图", tone="active", font_size=12)
    c.node("d3", 352, 176, 152, 48, "Inductor / Ascend\n降低 HBM 访存带宽", tone="active", emphasis=True, font_size=12)
    c.node("d4", 520, 176, 152, 48, "遗留 Launch 墙\nHost 下发仍需图化", tone="active", font_size=12)

    c.group("l1", 0, 288, 688, 96, "第一层：异构算力流、硬件队列与同步原语（第 1 章底层基石）", tone="highlight")
    c.node("b1", 16, 320, 152, 48, "Host 异步入队\nPushbuffer / TaskQ", tone="highlight", font_size=12)
    c.node("b2", 184, 320, 152, 48, "SQ / CQ 硬件队列\n物理槽位上限 1024", tone="highlight", font_size=12)
    c.node("b3", 352, 320, 152, 48, "单流与多流并发\nFIFO 保序与重叠掩盖", tone="highlight", font_size=12)
    c.node("b4", 520, 320, 152, 48, "Event 与 Notify\n跨流与 Host 同步原语", tone="highlight", emphasis=True, font_size=12)

    # Group-to-group upward transitions in open 48px corridors (zero overlap with titles or nodes)
    c.connect("e12", "l1", "l2", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0), tone="fg")
    c.connect("e23", "l2", "l3", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0), tone="fg")
    c.text("lbl_12", 360, 256, 264, 24, "算子融合降 HBM，但仍留 Launch 墙", size=12, tone="muted", align="left")
    c.text("lbl_23", 360, 112, 264, 24, "静态捕图，单次触发消除 Host 空泡", size=12, tone="muted", align="left")

    c.save(out_path, strict=True, build_svg=True)


def build_01_host_device_sqcq_arch() -> None:
    out_dir = ACLGRAPH_POSTS_DIR / "01-heterogeneous-streams-and-events" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "01-host-device-sqcq-arch.drawio"

    c = DrawioCanvas("Host Device SQ CQ Arch", "aclgraph-01-sqcq", width=688)

    c.group("host_grp", 0, 0, 688, 96, "Host 侧：异步任务构建与队列入队", tone="neutral")
    c.node("py", 16, 32, 184, 48, "PyTorch / ACL API\n下发异步算子与 Event", tone="neutral", font_size=12)
    c.node("disp", 240, 32, 200, 48, "Runtime 队列缓冲\nCUDA Pushbuffer / CANN TaskQ", tone="active", emphasis=True, font_size=12)
    c.node("doorbell", 480, 32, 192, 48, "Doorbell 唤醒寄存器\n写物理 SQ 尾指针后返回", tone="neutral", font_size=12)
    c.connect("h1", "py", "disp", tone="fg")
    c.connect("h2", "disp", "doorbell", tone="fg")

    # 56px gap (y=96..152), short title on left, internal routing channel y=184..216 below title
    c.group("dev_grp", 0, 152, 688, 256, "Device 侧：硬件 SQ/CQ 与 TS 调度", tone="active")
    c.node("sq0", 16, 216, 288, 64, "Stream 0 -> SQ0 / CQ0 (Compute)\nFIFO 串行出队：MatMul -> AddNorm", tone="active", emphasis=True, font_size=12)
    c.node("sq1", 384, 216, 288, 64, "Stream 1 -> SQ1 / CQ1 (Copy/Comm)\n与 SQ0 并行运行，硬件独立仲裁", tone="highlight", font_size=12)
    c.node("ts", 16, 328, 656, 64, "TS 任务调度与硬同步原语池\nEvent (65536/卡) 跨流阻断放行 · Notify (8192/卡) 轻量通知 · 完成后回写 CQ", tone="done", font_size=12)

    # doorbell (x=480..672): x=528 is 0.25, x=624 is 0.75; sq0 center x=160; sq1 x=624 is (624-384)/288 = 0.8333
    c.connect("d_sq0", "doorbell", "sq0", exit_xy=(0.25, 1.0), entry_xy=(0.5, 0.0), points=[(528, 192), (160, 192)], tone="fg")
    c.connect("d_sq1", "doorbell", "sq1", exit_xy=(0.75, 1.0), entry_xy=(0.8333, 0.0), tone="fg")
    c.text("lbl_sqe", 344, 112, 168, 24, "写 SQE + 敲 Doorbell", size=12, tone="fg", align="right")

    # Straight vertical arrows between sq0/sq1 (x=160 / x=528) and ts (x=16..672)
    c.connect("s0_ts", "sq0", "ts", exit_xy=(0.5, 1.0), entry_xy=(0.2195, 0.0), tone="fg")
    c.connect("ts_s1", "ts", "sq1", exit_xy=(0.7805, 0.0), entry_xy=(0.5, 1.0), tone="fg")
    c.text("lbl_rec", 176, 292, 112, 24, "Record E1", size=12, tone="fg", align="left")
    c.text("lbl_wait", 544, 292, 104, 24, "Wait E1", size=12, tone="fg", align="left")

    c.save(out_path, strict=True, build_svg=True)


def build_02_dynamo_aot_inductor_vs_ascend() -> None:
    out_dir = ACLGRAPH_POSTS_DIR / "02-torch-compile-fundamentals" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "02-dynamo-aot-inductor-vs-ascend.drawio"

    c = DrawioCanvas("Torch Compile Frontend and Backends", "aclgraph-02-compile", width=688)

    c.group("fe_grp", 0, 0, 688, 112, "PyTorch 通用前端：字节码拦截、Guard 校验与算子降级", tone="highlight")
    c.node("fe0", 16, 32, 192, 64, "TorchDynamo (PEP 523)\nFrame Hook 提取 FX Graph\n遇数据依赖则 Graph Break", tone="highlight", font_size=12)
    c.node("fe1", 240, 32, 200, 64, "SymInt & Guards\nBACKED vs UNBACKED\n0/1 步长特化防重编", tone="highlight", emphasis=True, font_size=12)
    c.node("fe2", 472, 32, 200, 64, "AOTAutograd\nFakeTensor + Functionalization\n输出 ATen Core IR 分片", tone="neutral", font_size=12)
    c.connect("f01", "fe0", "fe1", tone="fg")
    c.connect("f12", "fe1", "fe2", tone="fg")

    (lx, ly, lw, _), (rx, ry, rw, _) = c.swimlane_pair(
        "comp_lanes",
        "GPU · Inductor 编译路径",
        "Ascend NPU · 编译与算子融合路径",
        y=168,
        h=264,
        left_tone="active",
        right_tone="activation",
    )

    c.node("g1", lx + 8, ly + 8, lw - 16, 56, "TorchInductor Loop Fusion\n内存级点算/归约自动融合", tone="active", font_size=12)
    c.node("g2", lx + 8, ly + 88, lw - 16, 56, "Triton / CUDA Kernel 生成\n降低全局 HBM 往返读写", tone="active", emphasis=True, font_size=12)
    c.node("g3", lx + 8, ly + 168, lw - 16, 56, "局限：仍需 Python / CPU\n逐个调用 LaunchWrapper", tone="neutral", font_size=12)
    c.connect("eg1", "g1", "g2", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("eg2", "g2", "g3", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")

    c.node("n1", rx + 8, ry + 8, rw - 16, 56, "AscendCompiler + split_graph\noot_compiler 切出分段子图", tone="activation", font_size=12)
    c.node("n2", rx + 8, ry + 88, rw - 16, 56, "npugraph_ex / GraphFusionPass\n图模式替换与大颗粒算子融合", tone="activation", emphasis=True, font_size=12)
    c.node("n3", rx + 8, ry + 168, rw - 16, 56, "接入静态捕获下沉\n交由 ACLGraphWrapper 消除发射气泡", tone="neutral", font_size=12)
    c.connect("en1", "n1", "n2", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("en2", "n2", "n3", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")

    # Connect to swimlane top borders so edges never cross container titles
    # comp_lanes_left center x=168; comp_lanes_right center x=528
    # fe2 is x=472..672 -> x=496 is 0.12, x=528 is 0.28
    c.connect("fe_g", "fe2", "comp_lanes_left", exit_xy=(0.12, 1.0), entry_xy=(0.5, 0.0), points=[(496, 152), (168, 152)], tone="fg")
    c.connect("fe_n", "fe2", "comp_lanes_right", exit_xy=(0.28, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.text("lbl_ir", 208, 120, 240, 24, "下发纯净 Core ATen FX IR", size=12, tone="fg", align="center")

    c.save(out_path, strict=True, build_svg=True)


def build_03_cuda_graph_four_boundaries() -> None:
    out_dir = ACLGRAPH_POSTS_DIR / "03-cuda-graph-fundamentals" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "03-cuda-graph-four-boundaries.excalidraw"

    ex = ExcalidrawScene(seed=103)
    cards = [
        (
            "c1",
            "边界一：输入输出指针固化\n\n• 图节点直接硬编码显存虚拟地址\n• 重放前须按地址原位 copy_() 填输入\n• 末段退出使用 weak_ref_outputs 释缓存",
            "blue",
            True,
        ),
        (
            "c2",
            "边界二：静态 Batch 分桶与零分配\n\n• 动态请求填充 Padding 至离散捕获桶\n• 禁止图内按运行时维度动态 cudaMalloc\n• 复用全局 MemPool 控制显存峰值",
            "amber",
            True,
        ),
        (
            "c3",
            "边界三：零主机控制流同步\n\n• 禁止 .item() / .cpu() 触发同步读取\n• 动态长度改走 GPU 侧 seq_lens 张量\n• 控制分支依赖 CUDA 12.4 条件节点",
            "slate",
            False,
        ),
        (
            "c4",
            "边界四：多流 Fork-Join 汇合\n\n• 副流由 Record/Wait Event 自动拉入图\n• EndCapture 前未汇回报错 Unjoined\n• Global / ThreadLocal / Relaxed 三模式",
            "green",
            True,
        ),
    ]
    ex.quadrant_cards(cards, x=0, y=0, card_w=328, card_h=144, gap_x=24, gap_y=24)
    ex.build(out_path, also_build_svg=True, strict=True)


def build_04_aclgraph_capture_replay_flow() -> None:
    out_dir = ACLGRAPH_POSTS_DIR / "04-acl-graph-architecture-and-capture" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "04-aclgraph-capture-replay-flow.drawio"

    c = DrawioCanvas("ACL Graph Capture and Replay", "aclgraph-04-flow", width=688)

    c.group("cap_grp", 0, 0, 688, 152, "Capture 阶段：只建逻辑队列与参数备份，设备侧零执行", tone="active")
    c.node("u1", 16, 32, 136, 104, "用户流\nCaptureBegin\n进入捕获模式", tone="active", font_size=12)
    c.node(
        "rec",
        184,
        32,
        232,
        104,
        "Shadow Stream (影子流)\n1. 保存 Task 与 LogicSQ\n2. D2D 备份 Kernel Args\n3. 保持原序，设备零执行",
        tone="active",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "endg",
        448,
        32,
        224,
        104,
        "CaptureEnd 收尾\n1. Fork-Join 拓扑校验\n2. 追加 EndGraph Notify\n3. 冻结逻辑流产出 modelRI",
        tone="highlight",
        font_size=12,
    )
    c.connect("ec1", "u1", "rec", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5), tone="fg")
    c.connect("ec2", "rec", "endg", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5), tone="fg")

    c.group("rep_grp", 0, 200, 688, 152, "Replay 阶段：物理队列懒绑定与单次 Trigger 连续运行", tone="done")
    c.node(
        "pre",
        16,
        232,
        176,
        104,
        "PreModelExecute\n1. BuildSqCq 分配物理队列\n2. UpdateNotifyId 绑资源\n3. Refresh 外部与条件状态",
        tone="highlight",
        font_size=12,
    )
    c.node(
        "usr_rep",
        216,
        232,
        192,
        104,
        "ExecuteAsync 用户流\n向用户执行流下发：\n• model exe 触发指令\n• notify wait 阻断后文",
        tone="done",
        emphasis=True,
        font_size=12,
    )
    c.node(
        "mdl_run",
        480,
        232,
        192,
        104,
        "影子队列满载直通\nmemcpy -> aclnnMul\n零间隙跑完发 Notify\n唤醒用户流 Task n",
        tone="done",
        font_size=12,
    )
    c.connect("er1", "pre", "usr_rep", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5), tone="fg")
    c.connect("er2", "usr_rep", "mdl_run", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5), tone="fg")
    c.text("lbl_trig", 408, 256, 72, 24, "Trigger", size=12, tone="fg", align="center")

    # Group-to-group handoff across 48px gap (y=152..200)
    c.connect("e_cr", "cap_grp", "rep_grp", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.text("lbl_mri", 360, 160, 200, 24, "冻结图句柄：modelRI", size=12, tone="fg", align="left")

    c.save(out_path, strict=True, build_svg=True)


def build_05_cond_subgraph_runtime_flow() -> None:
    out_dir = ACLGRAPH_POSTS_DIR / "05-acl-graph-task-update-and-conditional-subgraph" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "05-cond-subgraph-runtime-flow.drawio"

    c = DrawioCanvas("ACL Graph TaskUpdate and Cond Subgraph", "aclgraph-05-cond", width=688)

    c.group("p_grp", 0, 0, 688, 112, "父 ACL Graph 主逻辑流 (Parent CaptureModel)", tone="active")
    c.node("p0", 16, 32, 128, 64, "静态前驱 Task\nNorm / QKV 投影", tone="active", font_size=12)
    c.node("p1", 168, 32, 144, 64, "TaskGrp 槽位\nisUpdateSinkSqe=1\n供 TaskUpdate 覆写", tone="done", emphasis=True, font_size=12)
    c.node("p2", 344, 32, 184, 64, "aclmdlRIAddCondTask\n读 *devAddr 判断分支\n紧接 notify wait (SQE+1)", tone="highlight", emphasis=True, font_size=12)
    c.node("p3", 552, 32, 120, 64, "后续静态 Task\n接收 Notify 唤醒", tone="active", font_size=12)
    c.connect("ep01", "p0", "p1", tone="fg")
    c.connect("ep12", "p1", "p2", tone="fg")
    c.connect("ep23", "p2", "p3", tone="fg")

    # 64px vertical corridor (y=112..176); short titles on left of bottom groups
    c.group("ctl_grp", 0, 176, 320, 184, "Replay 前热刷新", tone="done")
    c.node("upd", 16, 208, 128, 128, "update_stream\nTaskUpdateBegin\n原地重写 PA/FIA\nTiling 描述符", tone="done", font_size=12)
    c.node("ext", 176, 208, 128, 128, "ExternalEvent\n更新流 record ->\n主图 wait + reset\n防跨步竞态", tone="highlight", font_size=12)
    c.connect("ec_ue", "upd", "ext", exit_xy=(1.0, 0.5), entry_xy=(0.0, 0.5), tone="fg")
    # Straight vertical line at x=240, well right of ctl_grp title (~x=12..112)
    c.connect("ec_ep", "ext", "p1", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0), tone="fg")
    c.text("lbl_ext", 80, 128, 152, 24, "ExternalEvent 序同步", size=12, tone="fg", align="right")

    c.group("sub_grp", 344, 176, 344, 184, "CondHandle 与子图", tone="highlight")
    c.node("hdl", 360, 208, 136, 128, "CondHandle (8B)\ndevAddr_ 驻留设备\ndefaultValue_ 前传\n由 PreExecute H2D", tone="highlight", font_size=12)
    c.node("sub0", 520, 208, 152, 56, "Sub Graph 0 (IF/WHILE)\n结尾共享 subModelNotify_", tone="active", font_size=12)
    c.node("sub1", 520, 280, 152, 56, "Sub Graph 1 (Else 分支)\n同发 Notify Record 返回", tone="active", font_size=12)

    # hdl right-top x=480 (0.8824), clear of sub_grp title (x=356..464); p2 x=408 (0.3478) & x=504 (0.8696)
    c.connect("es_h", "hdl", "p2", exit_xy=(0.8824, 0.0), entry_xy=(0.3478, 1.0), points=[(480, 152), (408, 152)], tone="fg")
    c.connect("es_s0", "p2", "sub0", exit_xy=(0.8696, 1.0), entry_xy=(0.5, 0.0), points=[(504, 144), (596, 144)], tone="fg")
    c.connect("es_ret", "sub1", "sub0", exit_xy=(0.5, 0.0), entry_xy=(0.5, 1.0), arrow_end=False, tone="fg")
    c.text("lbl_cond", 296, 120, 104, 24, "Device 条件字", size=12, tone="fg", align="right")
    c.text("lbl_wake", 520, 112, 88, 24, "唤醒子流", size=12, tone="fg", align="left")

    c.save(out_path, strict=True, build_svg=True)


def build_06_aclgraph_four_layer_stack() -> None:
    out_dir = ACLGRAPH_POSTS_DIR / "06-acl-graph-fullstack-and-vllm-ascend" / "diagrams"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "06-aclgraph-four-layer-stack.drawio"

    c = DrawioCanvas("ACL Graph Four Layer Fullstack", "aclgraph-06-stack", width=688)

    c.group("s1", 0, 0, 688, 104, "L1 · vLLM-Ascend 调度与编译层", tone="active")
    c.node("l1_a", 16, 32, 200, 56, "cudagraph_mode 分桶\nFULL / PIECEWISE + MTP", tone="active", font_size=12)
    c.node("l1_b", 232, 32, 216, 56, "npugraph_ex / XliteGraph\ninplace_pass · 图模式替换", tone="active", emphasis=True, font_size=12)
    c.node("l1_c", 464, 32, 208, 56, "ACLGraphWrapper\nweak_ref 与 SuperKernel", tone="active", font_size=12)

    c.group("s2", 0, 144, 688, 104, "L2 · PyTorch + torch_npu 框架桥接层", tone="highlight")
    c.node("l2_a", 16, 176, 200, 56, "NPUGraph 与 Pool 管理\ncapture_begin / replay", tone="highlight", font_size=12)
    c.node("l2_b", 232, 176, 216, 56, "_GraphDispatchMode\n自动包裹 TaskGrp 与更新流", tone="highlight", emphasis=True, font_size=12)
    c.node("l2_c", 464, 176, 208, 56, "ExternalEvent 与条件流\nupdate_capture_record 保序", tone="highlight", font_size=12)

    c.group("s3", 0, 288, 688, 104, "L3 · CANN Runtime C++ 模型运行时 (cann/runtime)", tone="activation")
    c.node("l3_a", 16, 320, 200, 56, "CaptureSession 拓扑校验\nGLOBAL / LOCAL / RELAXED", tone="activation", font_size=12)
    c.node("l3_b", 232, 320, 216, 56, "CaptureModel & LogicSQ\nCopyTaskArgs · IsUpdateSinkSqe", tone="activation", emphasis=True, font_size=12)
    c.node("l3_c", 464, 320, 208, 56, "DeviceSqCqPool & Notify\n物理 SQ/CQ 上限 1024", tone="activation", font_size=12)

    c.group("s4", 0, 432, 688, 104, "L4 · Ascend HDK 驱动与 NPU 物理执行层", tone="neutral")
    c.node("l4_a", 16, 464, 200, 56, "物理 SQ / CQ 硬件队列\n超限触发错误码 207008", tone="neutral", font_size=12)
    c.node("l4_b", 232, 464, 216, 56, "TS 固件与硬件调度器\nNotify Wait / CondTask 状态机", tone="neutral", emphasis=True, font_size=12)
    c.node("l4_c", 464, 464, 208, 56, "AICore / AICPU / HCCL\n异常触发错误码 507011 / UAF", tone="neutral", font_size=12)

    # Group-to-group downward arrows across 40px gaps (zero overlap with internal boxes or group headers)
    c.connect("st12", "s1", "s2", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("st23", "s2", "s3", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.connect("st34", "s3", "s4", exit_xy=(0.5, 1.0), entry_xy=(0.5, 0.0), tone="fg")
    c.text("lbl_s12", 360, 112, 200, 24, "封装捕获 / 重放语义", size=12, tone="muted", align="left")
    c.text("lbl_s23", 360, 256, 200, 24, "下沉 C++ Runtime 逻辑队列", size=12, tone="muted", align="left")
    c.text("lbl_s34", 360, 400, 200, 24, "分配并提交物理 SQ/CQ", size=12, tone="muted", align="left")

    c.save(out_path, strict=True, build_svg=True)


def main() -> None:
    build_00_three_layer_execution_stack()
    build_01_host_device_sqcq_arch()
    build_02_dynamo_aot_inductor_vs_ascend()
    build_03_cuda_graph_four_boundaries()
    build_04_aclgraph_capture_replay_flow()
    build_05_cond_subgraph_runtime_flow()
    build_06_aclgraph_four_layer_stack()
    print("Generated all 7 ACL Graph static diagrams and SVGs.")


if __name__ == "__main__":
    main()
