"""Smoke test verifying DrawioCanvas and ExcalidrawScene against wisp_diagram lint + build."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from diagram_kit import DrawioCanvas, ExcalidrawScene  # noqa: E402


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        td = Path(tmp)

        # 1. Test DrawioCanvas tensor_block + proportional_strip + heatmap_grid + swimlane_pair
        c = DrawioCanvas(page_name="Kit Smoke Test", diagram_id="smoke")
        (lx, ly, lw, lh), (rx, ry, rw, rh) = c.swimlane_pair("pair", "NVIDIA GPU", "昇腾 NPU", y=0, h=144)
        c.tensor_block(
            "t_left",
            lx,
            ly + 16,
            lw,
            40,
            name="Unified KV",
            shape="[B_blk, 64, 1, 576]",
            tone="q",
            splits=[(0.88, "x", "512 NoPE", "64")],
        )
        c.tensor_block(
            "t_right",
            rx,
            ry + 16,
            rw,
            40,
            name="Split PA_NZ",
            shape="[2, B_blk, 128, 512/64]",
            tone="activation",
            stack=2,
        )
        c.proportional_strip(
            "ledger",
            0,
            176,
            688,
            32,
            segments=[
                (512, "512 B FP8 NoPE", "q", False),
                (16, "16 B scale", "highlight", True),
                (128, "128 B BF16 RoPE", "activation", False),
            ],
            title="656 B/token 稀疏缓存带宽占比",
            total_label="656 B/tok",
        )
        c.heatmap_grid(
            "hm",
            0,
            264,
            32,
            24,
            cells=[
                [("1.0", "q", True), ("0.2", "q", False), ("—", "mask", False), ("—", "mask", False)],
                [("0.4", "q", False), ("0.9", "q", True), ("—", "mask", False), ("—", "mask", False)],
            ],
            col_labels=["k0", "k1", "k2", "k3"],
            row_labels=["q0", "q1"],
            title="因果掩码示意",
        )
        drawio_file = c.save(td / "smoke.drawio", strict=True, build_svg=True)
        assert drawio_file.with_suffix(".wisp.svg").exists(), "Missing compiled smoke.wisp.svg"

        # 1b. Test DrawioCanvas relative layout + paper primitives + floating edge label
        c2 = DrawioCanvas(page_name="Kit Layout Test", diagram_id="smoke-layout")
        chain = c2.vstack(
            16,
            48,
            [
                ("n0", "Embed \\([T, d]\\)", "neutral", {"h": 40}),
                ("n1", "Engram 注入", "violet", {"h": 40, "emphasis": True}),
                ("n2", "\\(\\text{wkv}\\) 投影", "active", {"kind": "trapezoid", "h": 40}),
            ],
            gap=24,
            default_w=144,
            connect_chain=True,
        )
        c2.wrap_group("g_chain", chain, "相对垂直栈", pad_x=16, pad_top=40, pad_bottom=16, tone="neutral", dashed=False)
        rx, ry = c2.place_right_of("n1", gap=64, w=96, h=56)
        c2.datastore("ds", rx, ry, 96, 56, "Host 表", tone="violet")
        px, py = c2.place_below("ds", gap=24, w=144, h=32)
        c2.token_pills("tok", px, py, ["\\(t-1\\)", "\\(t\\)"], slot_w=48, gap=8, pill_h=32, active_indices=[1])
        ax, ay = c2.place_right_of("ds", gap=32, w=24, h=24)
        c2.op_circle("op", ax, ay, size=24, op="add", tone="highlight")
        c2.stacked_cards("sc", 360, 176, 136, 40, "多头叠卡", layers=2, tone="active")
        bw, bh = c2.estimate_box_size("估计宽度 \\(O(1)\\)", font_size=12)
        assert bw >= 64 and bh >= 32
        c2.connect("e_ds", "n1", "ds", tone="fg", label="\\(O(1)\\)")
        c2.frustum_lines("fr", c2.bbox("n1"), c2.bbox("g_chain"), tone="muted", dashed=True)
        layout_file = c2.save(td / "smoke-layout.drawio", strict=True, build_svg=True)
        assert layout_file.with_suffix(".wisp.svg").exists(), "Missing compiled smoke-layout.wisp.svg"
        assert 'fontFamily=Inter, Noto Sans SC' in layout_file.read_text(encoding="utf-8")

        # 2. Test ExcalidrawScene bitfield comparison + SVG build
        ex = ExcalidrawScene(seed=1)
        ex.bitfield_comparison(
            [
                ("BF16", [(1, "S", "mask"), (8, "Exp (8b)", "q"), (7, "Mant (7b)", "activation")], "16 b"),
                ("FP8", [(1, "S", "mask"), (4, "E4", "q"), (3, "M3", "activation")], "8 b"),
                ("MXFP4", [(4, "E2M1×32", "highlight"), (2, "E8M0/32", "mask")], "4.25 b"),
            ]
        )
        ex_file = ex.build(td / "smoke-ex.excalidraw", also_build_svg=True, strict=True)
        assert ex_file.with_suffix(".wisp.svg").exists(), "Missing compiled smoke-ex.wisp.svg"

    print("OK diagram_kit smoke test passed (Drawio + Excalidraw build + lint --strict)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
