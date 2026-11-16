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
