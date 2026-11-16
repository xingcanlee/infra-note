"""可复用 Excalidraw 骨架生成器：统一 8px 网格、预设构图原语，并自动调用 wisp_diagram.py new --build。"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any, Sequence

from .tokens import MAX_HUES, WISP_SCRIPT, non_slate_hues, snap8, snap8_pos
from wisp_diagram_lib.lint import lint_excalidraw  # type: ignore[import-not-found]


class ExcalidrawScene:
    """面向对象 Excalidraw 骨架构建器。"""

    def __init__(self, seed: int = 1):
        self.seed = seed
        self.nodes: list[dict[str, Any]] = []
        self.edges: list[dict[str, Any]] = []
        self.texts: list[dict[str, Any]] = []
        self._node_ids: set[str] = set()
        self._used_tones: list[str] = []

    def _track(self, tone: str | None) -> str | None:
        if tone and tone not in ("neutral", "fg", "muted"):
            self._used_tones.append(tone)
        return tone

    def add_node(
        self,
        nid: str,
        x: float,
        y: float,
        w: float,
        h: float,
        label: str = "",
        shape: str = "rect",
        color: str = "neutral",
        size: str = "label",
        emphasis: bool = False,
        dashed: bool = False,
        label_color: str = "fg",
    ) -> str:
        if nid in self._node_ids:
            raise ValueError(f"重复 Excalidraw node id: {nid!r}")
        self._node_ids.add(nid)
        self._track(color)
        node: dict[str, Any] = {
            "id": nid,
            "shape": shape,
            "x": snap8(x),
            "y": snap8(y),
            "w": snap8_pos(w, 16),
            "h": snap8_pos(h, 16),
            "color": color,
        }
        if label:
            node["label"] = label
        if size != "label":
            node["size"] = size
        if label_color != "fg":
            node["labelColor"] = label_color
        if emphasis:
            node["emphasis"] = True
        if dashed:
            node["dashed"] = True
        self.nodes.append(node)
        return nid

    def add_edge(
        self,
        frm: str,
        to: str,
        label: str = "",
        color: str = "fg",
        dashed: bool = False,
        emphasis: bool = False,
        arrow: str = "end",
        via: Sequence[Sequence[float]] | None = None,
    ) -> None:
        self._track(color)
        edge: dict[str, Any] = {"from": frm, "to": to, "color": color}
        if label:
            edge["label"] = label
        if dashed:
            edge["dashed"] = True
        if emphasis:
            edge["emphasis"] = True
        if arrow != "end":
            edge["arrow"] = arrow
        if via:
            edge["via"] = [[snap8(px), snap8(py)] for px, py in via]
        self.edges.append(edge)

    def add_text(
        self,
        x: float,
        y: float,
        text: str,
        size: str = "note",
        color: str | None = None,
    ) -> None:
        item: dict[str, Any] = {"x": snap8(x), "y": snap8(y), "text": text, "size": size}
        if color:
            self._track(color)
            item["color"] = color
        self.texts.append(item)

    # ------------------------------------------------------------ 复用构图模式

    def bitfield_comparison(
        self,
        rows: Sequence[tuple[str, Sequence[tuple[int, str, str]], str]],
        x: float = 0,
        y: float = 0,
        bit_px: int = 24,
        row_h: int = 40,
        row_gap: int = 24,
        label_w: int = 112,
    ) -> None:
        """按比特位宽严格比例渲染数据格式对照（如 BF16 16b vs INT8 8b vs FP8 8b vs MXFP4 4.25b）。"""
        x8, y8 = snap8(x), snap8(y)
        lh_pad = snap8_pos(label_w, 64)
        for ri, (name, fields, summary) in enumerate(rows):
            ry = y8 + ri * (snap8_pos(row_h, 24) + snap8_pos(row_gap, 16))
            self.add_text(x8, ry + 8, name, size="label", color="fg")
            cur_x = x8 + lh_pad
            for fi, (bits, lbl, tone) in enumerate(fields):
                bw = snap8_pos(bits * bit_px, 24)
                self.add_node(f"bf_{ri}_{fi}", cur_x, ry, bw, row_h, lbl, color=tone, size="note")
                cur_x += bw
            if summary:
                self.add_text(cur_x + 16, ry + 8, summary, size="note", color="muted")

    def quadrant_cards(
        self,
        cards: Sequence[tuple[str, str, str, bool]],
        x: float = 0,
        y: float = 0,
        card_w: int = 320,
        card_h: int = 128,
        gap_x: int = 32,
        gap_y: int = 24,
    ) -> list[str]:
        """双列对比象限/边界卡（适合 4 类边界不变量或正交对比）。"""
        ids: list[str] = []
        for idx, (cid, text, tone, emph) in enumerate(cards):
            col = idx % 2
            row = idx // 2
            cx = snap8(x) + col * (snap8(card_w) + snap8(gap_x))
            cy = snap8(y) + row * (snap8(card_h) + snap8(gap_y))
            ids.append(self.add_node(cid, cx, cy, card_w, card_h, text, color=tone, emphasis=emph))
        return ids

    def tap_contrast(
        self,
        tokens: Sequence[str],
        top_title: str,
        top_groups: Sequence[tuple[int, int, str, str]],
        bottom_title: str,
        bottom_taps: Sequence[tuple[int, int, str, str]],
        x: float = 0,
        y: float = 0,
        slot_w: int = 48,
        gap: int = 8,
    ) -> None:
        """局部词组抽头/感受野对比（如 ShortConv δ=1 重叠 vs δ=3 零重叠）。"""
        x8, y8 = snap8(x), snap8(y)
        self.add_text(x8, y8, top_title, size="label", color="fg")
        row1_y = y8 + 32
        for ti, tok in enumerate(tokens):
            tx = x8 + ti * (snap8(slot_w) + snap8(gap))
            self.add_node(f"tok_t_{ti}", tx, row1_y, slot_w, 32, tok, color="neutral", size="note")
        for gi, (s_idx, e_idx, lbl, tone) in enumerate(top_groups):
            gx = x8 + s_idx * (snap8(slot_w) + snap8(gap))
            gw = (e_idx - s_idx + 1) * snap8(slot_w) + (e_idx - s_idx) * snap8(gap)
            self.add_node(f"grp_t_{gi}", gx, row1_y + 48, gw, 32, lbl, color=tone, size="note", dashed=True)

        row2_base = row1_y + 112
        self.add_text(x8, row2_base, bottom_title, size="label", color="fg")
        row2_y = row2_base + 32
        for ti, tok in enumerate(tokens):
            tx = x8 + ti * (snap8(slot_w) + snap8(gap))
            is_tap = any(s <= ti <= e and ti == e for s, e, _, _ in bottom_taps)
            self.add_node(
                f"tok_b_{ti}",
                tx,
                row2_y,
                slot_w,
                32,
                tok,
                color="highlight" if is_tap else "neutral",
                emphasis=is_tap,
                size="note",
            )
        for gi, (s_idx, e_idx, lbl, tone) in enumerate(bottom_taps):
            gx = x8 + s_idx * (snap8(slot_w) + snap8(gap))
            gw = (e_idx - s_idx + 1) * snap8(slot_w) + (e_idx - s_idx) * snap8(gap)
            self.add_node(f"grp_b_{gi}", gx, row2_y + 48, gw, 32, lbl, color=tone, size="note", emphasis=True)

    def to_skeleton(self) -> dict[str, Any]:
        hues = non_slate_hues(self._used_tones)
        if len(hues) > MAX_HUES:
            raise ValueError(f"Excalidraw 超过 {MAX_HUES} 种非中性 hue: {hues}")
        return {
            "style": "hand",
            "nodes": self.nodes,
            "edges": self.edges,
            "texts": self.texts,
        }

    def build(self, out_excalidraw: Path | str, also_build_svg: bool = True, strict: bool = True) -> Path:
        out = Path(out_excalidraw).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        skel_path = out.with_suffix(".skeleton.json")
        try:
            skel_path.write_text(
                json.dumps(self.to_skeleton(), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            cmd = [
                "uv",
                "run",
                str(WISP_SCRIPT),
                "new",
                str(skel_path),
                "-o",
                str(out),
                "--seed",
                str(self.seed),
            ]
            if also_build_svg:
                cmd.append("--build")
            proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
            if proc.returncode != 0:
                raise RuntimeError(
                    f"wisp_diagram.py new 失败 ({out}):\n{proc.stdout}\n{proc.stderr}"
                )
            issues = lint_excalidraw(out.read_text("utf-8"))
            if strict and issues:
                msgs = "; ".join(f"[{i.level}:{i.rule}] {i.message}" for i in issues)
                raise RuntimeError(f"Excalidraw lint 失败 ({out}): {msgs}")
            return out
        finally:
            if skel_path.exists():
                skel_path.unlink()
