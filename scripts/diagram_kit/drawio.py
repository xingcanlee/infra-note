"""可复用 Draw.io 组件化生成器：自动遵守 8px 网格、12/14/18 字号、<=3 hue、无压缩 XML 与 lint --strict。"""
from __future__ import annotations

import html
import re
import subprocess
from pathlib import Path
from typing import Any, Sequence

from .tokens import BASE_LIGHT, CANVAS_W, MAX_HUES, WISP_SCRIPT, non_slate_hues, resolve_tone, snap8, snap8_pos
from wisp_diagram_lib.lint import lint_drawio  # type: ignore[import-not-found]
from wisp_diagram_lib.xmlfmt import format_xml  # type: ignore[import-not-found]

_MATH_RE = re.compile(r"\\\(.+?\\\)")


def escape_html_text(text: str) -> str:
    """将纯文本按换行转义为 Draw.io html=1 的 value，保留内联 \\(...\\) 公式与显式 <br>。"""
    parts = text.replace("<br/>", "<br>").replace("<br />", "<br>").split("\n")
    out: list[str] = []
    for line in parts:
        # 按 <br> 再分段，允许传入带 \n 或 <br> 的字符串
        sublines = line.split("<br>")
        out.extend(html.escape(s, quote=False) for s in sublines)
    return "<br>".join(out)


def _attr(s: str) -> str:
    return html.escape(s, quote=True)


def _normalize_fs(fs: int) -> int:
    if fs <= 12:
        return 12
    if fs >= 17:
        return 18
    return 14


class DrawioCanvas:
    """面向对象 Draw.io 画布，提供张量块、热力图矩阵、比例条、泳道图、多线总线等复用组件。"""

    def __init__(self, page_name: str = "Page-1", diagram_id: str = "diagram", width: int = CANVAS_W):
        self.page_name = page_name
        self.diagram_id = diagram_id
        self.width = snap8(width)
        self._cells: list[str] = []
        self._used_ids: set[str] = {"0", "1"}
        self._used_tones: list[str] = []
        self._has_math = False
        self._auto_idx = 0

    def _next_id(self, prefix: str = "el") -> str:
        self._auto_idx += 1
        cid = f"{prefix}_{self._auto_idx}"
        while cid in self._used_ids:
            self._auto_idx += 1
            cid = f"{prefix}_{self._auto_idx}"
        self._used_ids.add(cid)
        return cid

    def _claim_id(self, cid: str) -> str:
        if cid in self._used_ids:
            raise ValueError(f"重复的 Draw.io cell id: {cid!r}")
        self._used_ids.add(cid)
        return cid

    def _track_tone(self, tone: str | None) -> tuple[str, str]:
        if tone:
            self._used_tones.append(tone)
        _, fill, stroke = resolve_tone(tone)
        return fill, stroke

    def _check_value(self, raw_value: str, already_html: bool = False) -> str:
        if _MATH_RE.search(raw_value):
            self._has_math = True
        return raw_value if already_html else escape_html_text(raw_value)

    def _add_vertex(
        self,
        cid: str,
        value: str,
        style: str,
        x: float,
        y: float,
        w: float,
        h: float,
        already_html: bool = False,
    ) -> str:
        x8, y8 = snap8(x), snap8(y)
        w8, h8 = max(8, int(round(w))) if w < 8 else snap8_pos(w), max(8, int(round(h))) if h < 8 else snap8_pos(h)
        val = self._check_value(value, already_html=already_html)
        self._cells.append(
            f'<mxCell id="{_attr(cid)}" value="{_attr(val)}" style="{_attr(style)}" vertex="1" parent="1">'
            f'<mxGeometry x="{x8}" y="{y8}" width="{w8}" height="{h8}" as="geometry"/>'
            f"</mxCell>"
        )
        return cid

    def _add_raw_line(
        self,
        cid: str,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        stroke: str,
        stroke_w: float = 1.25,
        dashed: bool = False,
        arrow_end: bool = False,
        arrow_start: bool = False,
    ) -> str:
        parts = [
            f"endArrow={'classic' if arrow_end else 'none'}",
            f"startArrow={'classic' if arrow_start else 'none'}",
            "html=1",
            f"strokeColor={stroke}",
            f"strokeWidth={stroke_w}",
        ]
        if dashed:
            parts.append("dashed=1;dashPattern=4 4")
        style = ";".join(parts) + ";"
        self._cells.append(
            f'<mxCell id="{_attr(cid)}" value="" style="{_attr(style)}" edge="1" parent="1">'
            f'<mxGeometry relative="1" as="geometry">'
            f'<mxPoint x="{snap8(x1) if x1 == snap8(x1) else round(x1, 1)}" y="{snap8(y1) if y1 == snap8(y1) else round(y1, 1)}" as="sourcePoint"/>'
            f'<mxPoint x="{snap8(x2) if x2 == snap8(x2) else round(x2, 1)}" y="{snap8(y2) if y2 == snap8(y2) else round(y2, 1)}" as="targetPoint"/>'
            f"</mxGeometry></mxCell>"
        )
        return cid

    # ------------------------------------------------------------ 基础图元

    def group(
        self,
        cid: str,
        x: float,
        y: float,
        w: float,
        h: float,
        title: str = "",
        tone: str | None = None,
        dashed: bool = True,
    ) -> str:
        self._claim_id(cid)
        if tone:
            fill, stroke = self._track_tone(tone)
            font_color = stroke
        else:
            fill, stroke = BASE_LIGHT["surface"], BASE_LIGHT["border"]
            font_color = BASE_LIGHT["muted"]
        style = (
            f"rounded=1;absoluteArcSize=1;arcSize=8;whiteSpace=wrap;html=1;"
            f"fillColor={fill};strokeColor={stroke};strokeWidth=1.25;"
            f"{'dashed=1;' if dashed else ''}verticalAlign=top;align=left;"
            f"spacingLeft=12;spacingTop=6;fontFamily=Inter;fontSize=12;fontStyle=1;"
            f"fontColor={font_color};container=0;"
        )
        return self._add_vertex(cid, title, style, x, y, w, h)

    def node(
        self,
        cid: str,
        x: float,
        y: float,
        w: float,
        h: float,
        label: str,
        tone: str = "neutral",
        emphasis: bool = False,
        dashed: bool = False,
        font_size: int = 14,
        align: str = "center",
        valign: str = "middle",
        bold: bool = False,
    ) -> str:
        self._claim_id(cid)
        fill, stroke = self._track_tone("emphasis" if emphasis and tone == "neutral" else tone)
        sw = 2 if emphasis and tone != "neutral" else (1.25 if emphasis or tone != "neutral" else 1)
        fs = _normalize_fs(font_size)
        style = (
            f"rounded=1;absoluteArcSize=1;arcSize=8;whiteSpace=wrap;html=1;"
            f"fillColor={fill};strokeColor={stroke};strokeWidth={sw};"
            f"{'dashed=1;dashPattern=4 4;' if dashed else ''}"
            f"align={align};verticalAlign={valign};spacing=4;"
            f"fontFamily=Inter;fontSize={fs};{'fontStyle=1;' if bold else ''}"
            f"fontColor={BASE_LIGHT['fg']};"
        )
        return self._add_vertex(cid, label, style, x, y, w, h)

    def text(
        self,
        cid: str,
        x: float,
        y: float,
        w: float,
        h: float,
        text: str,
        size: int | str = 12,
        tone: str = "muted",
        align: str = "left",
        valign: str = "middle",
        bold: bool = False,
    ) -> str:
        self._claim_id(cid)
        size_map = {"note": 12, "label": 14, "title": 18}
        fs = _normalize_fs(size_map[size] if isinstance(size, str) else int(size))
        if tone in ("fg", "muted"):
            color = BASE_LIGHT[tone]
        else:
            _, color = self._track_tone(tone)
        style = (
            f"text;html=1;whiteSpace=wrap;align={align};verticalAlign={valign};"
            f"fontFamily=Inter;fontSize={fs};{'fontStyle=1;' if bold else ''}fontColor={color};"
        )
        return self._add_vertex(cid, text, style, x, y, w, h)

    def connect(
        self,
        cid: str,
        src: str,
        dst: str,
        label: str = "",
        tone: str = "fg",
        dashed: bool = False,
        ortho: bool = True,
        exit_xy: tuple[float, float] | None = None,
        entry_xy: tuple[float, float] | None = None,
        points: Sequence[tuple[float, float]] | None = None,
        arrow_end: bool = True,
        arrow_start: bool = False,
        emphasis: bool = False,
    ) -> str:
        self._claim_id(cid)
        if tone in ("fg", "muted"):
            stroke = BASE_LIGHT[tone]
        else:
            _, _, stroke = self._track_tone(tone)
        parts = [
            f"endArrow={'classic' if arrow_end else 'none'}",
            f"startArrow={'classic' if arrow_start else 'none'}",
            "html=1",
            f"strokeColor={stroke}",
            f"strokeWidth={2 if emphasis else 1.25}",
        ]
        if ortho:
            parts.append("edgeStyle=orthogonalEdgeStyle;rounded=1")
        if dashed:
            parts.append("dashed=1;dashPattern=4 4")
        if exit_xy is not None:
            parts.append(f"exitX={exit_xy[0]};exitY={exit_xy[1]};exitDx=0;exitDy=0")
        if entry_xy is not None:
            parts.append(f"entryX={entry_xy[0]};entryY={entry_xy[1]};entryDx=0;entryDy=0")
        val = self._check_value(label) if label else ""
        if val:
            parts.append(
                f"fontFamily=Inter;fontSize=12;fontColor={stroke if tone not in ('fg', 'muted') else BASE_LIGHT['fg']};"
                f"labelBackgroundColor={BASE_LIGHT['bg']}"
            )
        style = ";".join(parts) + ";"
        pts_xml = ""
        if points:
            pts = "".join(f'<mxPoint x="{snap8(px)}" y="{snap8(py)}"/>' for px, py in points)
            pts_xml = f'<Array as="points">{pts}</Array>'
        self._cells.append(
            f'<mxCell id="{_attr(cid)}" value="{_attr(val)}" style="{_attr(style)}" edge="1" parent="1" source="{_attr(src)}" target="{_attr(dst)}">'
            f'<mxGeometry relative="1" as="geometry">{pts_xml}</mxGeometry>'
            f"</mxCell>"
        )
        return cid

    # ------------------------------------------------------------ 高级复用领域组件

    def tensor_block(
        self,
        prefix: str,
        x: float,
        y: float,
        w: float,
        h: float,
        name: str = "",
        shape: str = "",
        tone: str = "neutral",
        emphasis: bool = False,
        dashed: bool = False,
        stack: int = 1,
        splits: Sequence[tuple[float, str, str, str]] | None = None,
        font_size: int = 14,
    ) -> str:
        """实体化张量矩阵块：支持 3D 堆叠页、内部虚线切分、零重叠维度标注。"""
        x8, y8 = snap8(x), snap8(y)
        w8, h8 = snap8_pos(w, 16), snap8_pos(h, 16)
        fill, stroke = self._track_tone(tone)

        # 3D 堆叠背页使用 8px 偏移以严格满足 wisp lint 8px 网格检查
        for layer in range(max(1, stack) - 1, 0, -1):
            bx = x8 + layer * 8
            by = y8 - layer * 8
            self._add_vertex(
                self._claim_id(f"{prefix}__s{layer}"),
                "",
                f"rounded=1;absoluteArcSize=1;arcSize=8;html=1;fillColor={BASE_LIGHT['surface']};strokeColor={stroke};strokeWidth=1;",
                bx,
                by,
                w8,
                h8,
            )

        main_id = self._claim_id(prefix)
        label_lines = [name] if (name and not splits) else []
        if shape and not splits and h8 >= 48:
            label_lines.append(shape)
        sw = 2 if emphasis else (1.25 if tone != "neutral" else 1)
        style = (
            f"rounded=1;absoluteArcSize=1;arcSize=8;whiteSpace=wrap;html=1;"
            f"fillColor={fill};strokeColor={stroke};strokeWidth={sw};"
            f"{'dashed=1;dashPattern=4 4;' if dashed else ''}"
            f"align=center;verticalAlign=middle;spacing=4;"
            f"fontFamily=Inter;fontSize={_normalize_fs(font_size)};fontColor={BASE_LIGHT['fg']};"
        )
        self._add_vertex(main_id, "\n".join(label_lines), style, x8, y8, w8, h8)

        if splits:
            if name:
                self.text(
                    f"{prefix}__title",
                    x8,
                    y8 - 24,
                    max(w8, 96),
                    24,
                    name,
                    size=12,
                    tone="fg",
                    align="left",
                    bold=True,
                )
            for idx, (ratio, axis, left_lbl, right_lbl) in enumerate(splits):
                if axis == "x":
                    sx = snap8(x8 + w8 * ratio)
                    sx = max(x8 + 8, min(x8 + w8 - 8, sx))
                    self._add_raw_line(f"{prefix}__sp{idx}", sx, y8, sx, y8 + h8, stroke, 1.25, dashed=True)
                    lw, rw = sx - x8, (x8 + w8) - sx
                    if left_lbl and lw >= 32:
                        self.text(
                            f"{prefix}__sl{idx}",
                            x8,
                            y8,
                            lw,
                            h8,
                            left_lbl,
                            size=12,
                            tone="fg",
                            align="center",
                        )
                    if right_lbl and rw >= 32:
                        self.text(
                            f"{prefix}__sr{idx}",
                            sx,
                            y8,
                            rw,
                            h8,
                            right_lbl,
                            size=12,
                            tone="fg",
                            align="center",
                        )
                else:
                    sy = snap8(y8 + h8 * ratio)
                    sy = max(y8 + 8, min(y8 + h8 - 8, sy))
                    self._add_raw_line(f"{prefix}__sp{idx}", x8, sy, x8 + w8, sy, stroke, 1.25, dashed=True)
                    th, bh = sy - y8, (y8 + h8) - sy
                    if left_lbl and th >= 16:
                        self.text(
                            f"{prefix}__sl{idx}",
                            x8,
                            y8,
                            w8,
                            th,
                            left_lbl,
                            size=12,
                            tone="fg",
                            align="center",
                        )
                    if right_lbl and bh >= 16:
                        self.text(
                            f"{prefix}__sr{idx}",
                            x8,
                            sy,
                            w8,
                            bh,
                            right_lbl,
                            size=12,
                            tone="fg",
                            align="center",
                        )
        if shape and (splits or h8 < 48):
            self.text(
                f"{prefix}__shape",
                x8,
                y8 + h8,
                max(w8, 128),
                24,
                shape,
                size=12,
                tone="muted",
                align="left",
            )
        return main_id

    def proportional_strip(
        self,
        prefix: str,
        x: float,
        y: float,
        total_w: float,
        h: float,
        segments: Sequence[tuple[float, str, str, bool]],
        title: str = "",
        total_label: str = "",
    ) -> list[str]:
        """严格按数值（字节/周期）切分的横条；极窄片段 (<56px) 自动交替引出下方/上方标注。"""
        x8, y8 = snap8(x), snap8(y)
        tw8 = snap8_pos(total_w, 64)
        h8 = snap8_pos(h, 24)
        total_val = sum(max(0.0, s[0]) for s in segments) or 1.0

        hdr_w = max(tw8, snap8(self.width - x8 - 8))
        title_w = snap8(hdr_w * 0.78)
        if title:
            self.text(f"{prefix}__title", x8, y8 - 24, title_w, 24, title, size=12, tone="fg", align="left", bold=True)
        if total_label:
            self.text(f"{prefix}__tot", x8 + title_w, y8 - 24, hdr_w - title_w, 24, total_label, size=12, tone="muted", align="right")

        # 计算各段 8px 网格宽度并守恒总宽
        widths = [max(16, snap8((val / total_val) * tw8)) if val > 0 else 8 for val, _, _, _ in segments]
        diff = tw8 - sum(widths)
        if widths:
            max_idx = max(range(len(widths)), key=lambda i: widths[i])
            widths[max_idx] = max(16, widths[max_idx] + diff)

        ids: list[str] = []
        cur_x = x8
        narrow_idx = 0
        for i, ((_, lbl, tone, emph), sw) in enumerate(zip(segments, widths)):
            sid = f"{prefix}_{i}"
            fill, stroke = self._track_tone(tone)
            if sw >= 56:
                self.node(sid, cur_x, y8, sw, h8, lbl, tone=tone, emphasis=emph, font_size=12)
            else:
                self.node(sid, cur_x, y8, sw, h8, "", tone=tone, emphasis=emph, font_size=12)
                cx = cur_x + sw // 2
                # 窄段交替放下方两行，绝不撞上方标题或邻近窄段
                cy = y8 + h8 + (16 if narrow_idx % 2 == 0 else 32)
                narrow_idx += 1
                self._add_raw_line(f"{prefix}__tk{i}", cx, y8 + h8, cx, cy, stroke, 1.0)
                lw = 96
                nl_x = max(8, snap8(cx - lw // 2))
                self.text(
                    f"{prefix}__nl{i}",
                    nl_x,
                    cy,
                    lw,
                    24,
                    lbl,
                    size=12,
                    tone=tone,
                    align="left" if nl_x == 8 and cx < 40 else "center",
                    bold=True,
                )
            ids.append(sid)
            cur_x += sw
        return ids

    def heatmap_grid(
        self,
        prefix: str,
        x: float,
        y: float,
        cell_w: int,
        cell_h: int,
        cells: Sequence[Sequence[tuple[str, str, bool]]],
        col_labels: Sequence[str] | None = None,
        row_labels: Sequence[str] | None = None,
        title: str = "",
        gap: int = 0,
    ) -> list[list[str]]:
        """二维热力/分块填充/稀疏掩码网格：cells[r][c] = (text, tone, emphasis)。"""
        x8, y8 = snap8(x), snap8(y)
        cw = snap8_pos(cell_w, 16)
        ch = snap8_pos(cell_h, 16)
        gap8 = snap8(gap)
        row_hdr_w = 48 if row_labels else 0
        gx = x8 + row_hdr_w
        gy = y8 + (24 if title else 0) + (24 if col_labels else 0)

        if title:
            self.text(f"{prefix}__title", gx, y8, 256, 24, title, size=12, tone="fg", align="left", bold=True)
        if col_labels:
            for c, cl in enumerate(col_labels):
                self.text(f"{prefix}__cl{c}", gx + c * (cw + gap8), gy - 24, cw, 24, cl, size=12, tone="muted", align="center")
        if row_labels:
            for r, rl in enumerate(row_labels):
                self.text(f"{prefix}__rl{r}", x8, gy + r * (ch + gap8), row_hdr_w - 8, ch, rl, size=12, tone="muted", align="right")

        out: list[list[str]] = []
        for r, row in enumerate(cells):
            r_ids: list[str] = []
            for c, (txt, tone, emph) in enumerate(row):
                cid = self.node(
                    f"{prefix}_{r}_{c}",
                    gx + c * (cw + gap8),
                    gy + r * (ch + gap8),
                    cw,
                    ch,
                    txt,
                    tone=tone,
                    emphasis=emph,
                    font_size=12,
                )
                r_ids.append(cid)
            out.append(r_ids)
        return out

    def swimlane_pair(
        self,
        prefix: str,
        left_title: str,
        right_title: str,
        y: float,
        h: float,
        total_w: int = CANVAS_W,
        gap: int = 24,
        left_tone: str = "active",
        right_tone: str = "activation",
    ) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
        """双硬件（GPU vLLM vs 昇腾 vllm-ascend）标准左右泳道容器，返回各自内框 (x, y, w, h)。"""
        tw8 = snap8_pos(total_w, 320)
        g8 = snap8_pos(gap, 16)
        col_w = snap8((tw8 - g8) // 2)
        rx = col_w + g8
        y8 = snap8(y)
        h8 = snap8_pos(h, 64)
        self.group(f"{prefix}_left", 0, y8, col_w, h8, left_title, tone=left_tone, dashed=False)
        self.group(f"{prefix}_right", rx, y8, col_w, h8, right_title, tone=right_tone, dashed=False)
        return (16, y8 + 32, col_w - 32, h8 - 48), (rx + 16, y8 + 32, col_w - 32, h8 - 48)

    def horizontal_lanes(
        self,
        prefix: str,
        lanes: Sequence[tuple[str, Sequence[tuple[float, float, str, str, bool]]]],
        x: float = 0,
        y: float = 0,
        total_w: int = CANVAS_W,
        gutter_w: int = 128,
        lane_h: int = 40,
        lane_gap: int = 16,
        total_units: float = 100.0,
        ticks: Sequence[tuple[float, str]] | None = None,
    ) -> None:
        """比例对齐的水平硬件时间泳道：lanes = [(lane_title, [(start, dur, label, tone, dashed), ...])]。"""
        x8, y8 = snap8(x), snap8(y)
        tw8 = snap8_pos(total_w, 320)
        gw8 = snap8_pos(gutter_w, 64)
        track_x = x8 + gw8
        track_w = tw8 - gw8
        lh8 = snap8_pos(lane_h, 24)
        lg8 = snap8_pos(lane_gap, 8)
        total_h = len(lanes) * lh8 + max(0, len(lanes) - 1) * lg8
        scale = total_units or 1.0

        if ticks:
            for tk_val, tk_lbl in ticks:
                tx = track_x + snap8((tk_val / scale) * track_w)
                self._add_raw_line(f"{prefix}__tk_{int(tk_val*10)}", tx, y8, tx, y8 + total_h + 8, BASE_LIGHT["border"], 1.0, dashed=True)
                self.text(f"{prefix}__tl_{int(tk_val*10)}", snap8(tx - 32), y8 + total_h + 8, 64, 24, tk_lbl, size=12, tone="muted", align="center")

        for li, (lane_title, blocks) in enumerate(lanes):
            ly = y8 + li * (lh8 + lg8)
            self.text(f"{prefix}__ln{li}", x8, ly, gw8 - 8, lh8, lane_title, size=12, tone="fg", align="right", bold=True)
            self._add_vertex(
                self._claim_id(f"{prefix}__bg{li}"),
                "",
                f"rounded=1;absoluteArcSize=1;arcSize=8;html=1;fillColor={BASE_LIGHT['surface']};strokeColor={BASE_LIGHT['border']};strokeWidth=1;",
                track_x,
                ly,
                track_w,
                lh8,
            )
            for bi, (st, dur, lbl, tone, dashed) in enumerate(blocks):
                bx = track_x + snap8((st / scale) * track_w)
                bw = max(16, snap8((dur / scale) * track_w))
                self.node(f"{prefix}__b{li}_{bi}", bx, ly, bw, lh8, lbl, tone=tone, dashed=dashed, font_size=12)

    def multi_lane_bus(
        self,
        prefix: str,
        x: float,
        y: float,
        w: float,
        count: int = 4,
        lane_h: int = 16,
        lane_gap: int = 8,
        labels: Sequence[str] | None = None,
        tone: str = "active",
    ) -> list[str]:
        """多流并行总线（用于 mHC 4 路超连接残差流 / 4 路 Engram 门控流）。"""
        x8, y8 = snap8(x), snap8(y)
        w8 = snap8_pos(w, 64)
        ids: list[str] = []
        for i in range(count):
            ly = y8 + i * (snap8_pos(lane_h, 8) + snap8(lane_gap))
            lbl = labels[i] if labels and i < len(labels) else f"流 {i}"
            ids.append(self.node(f"{prefix}_{i}", x8, ly, w8, lane_h, lbl, tone=tone, font_size=12))
        return ids

    # ------------------------------------------------------------ 导出与校验

    def to_xml(self) -> str:
        hues = non_slate_hues(self._used_tones)
        if len(hues) > MAX_HUES:
            raise ValueError(f"当前页面使用了超过 {MAX_HUES} 种非中性色调: {hues}")
        math_attr = "1" if self._has_math else "0"
        cells_xml = "\n".join(self._cells)
        raw = (
            f'<mxfile host="wisp-diagram">\n'
            f'  <diagram id="{_attr(self.diagram_id)}" name="{_attr(self.page_name)}">\n'
            f'    <mxGraphModel dx="800" dy="600" grid="1" gridSize="8" guides="1" page="0" math="{math_attr}" shadow="0">\n'
            f"      <root>\n"
            f'        <mxCell id="0"/>\n'
            f'        <mxCell id="1" parent="0"/>\n'
            f"{cells_xml}\n"
            f"      </root>\n"
            f"    </mxGraphModel>\n"
            f"  </diagram>\n"
            f"</mxfile>\n"
        )
        return format_xml(raw)

    def save(self, out_path: Path | str, strict: bool = True, build_svg: bool = False) -> Path:
        p = Path(out_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        xml = self.to_xml()
        issues = lint_drawio(xml)
        if strict and issues:
            msgs = "; ".join(f"[{i.level}:{i.rule}] {i.message}" for i in issues)
            raise RuntimeError(f"Draw.io 校验失败 ({p}): {msgs}")
        p.write_text(xml, encoding="utf-8", newline="\n")
        if build_svg:
            proc = subprocess.run(
                ["uv", "run", str(WISP_SCRIPT), "build", str(p)],
                capture_output=True,
                text=True,
                encoding="utf-8",
            )
            if proc.returncode != 0:
                raise RuntimeError(f"wisp_diagram.py build 失败 ({p}):\n{proc.stdout}\n{proc.stderr}")
        return p
