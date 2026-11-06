"""骨架 JSON → .excalidraw（diagrams.md §6.2）。

骨架只写 type、位置、尺寸、label、语义色名、箭头起止 id；完整元素（seed、boundElements、文本测量…）
由 Excalidraw 自己的 convertToExcalidrawElements 在 Playwright 中生成。随机数被种子化，同一骨架多次
转换得到相同结果。
"""
from __future__ import annotations

import json
import math
import re
from typing import Any

from .browser import BrowserSession
from .env import WispError
from .excalidraw import normalize_excalidraw
from .jsjson import js_number
from .palette import palette

SHAPE = {"rect": "rectangle", "ellipse": "ellipse", "diamond": "diamond"}
#: Excalidraw FONT_FAMILY.Excalifont
EXCALIFONT = 5
#: ROUNDNESS.ADAPTIVE_RADIUS
ADAPTIVE_RADIUS = 3
#: 箭头端点与节点边缘的间隙（px），与 Excalidraw 编辑器中绑定箭头的观感一致
ARROW_GAP = 6


def resolve_skeleton_color(name: str | None) -> dict[str, str]:
    """hue / 语义名 / 基础色 → 浅色 stroke + fill（导出时再由 to_portable_svg 变量化）。"""
    p = palette()["color"]
    if not name or name == "fg":
        return {"stroke": p["base"]["fg"]["light"], "fill": "transparent"}
    if name == "muted":
        return {"stroke": p["base"]["muted"]["light"], "fill": "transparent"}
    hue = name if name in p["hue"] else p["semantic"].get(name)
    h = p["hue"].get(hue) if isinstance(hue, str) else None
    if not isinstance(h, dict) or "stroke" not in h:
        valid = [*p["hue"].keys(), *[k for k in p["semantic"] if not k.startswith("$")], "fg", "muted"]
        raise WispError(f'[wisp-diagram] 未知颜色名 "{name}"。可用：{", ".join(valid)}')
    return {"stroke": h["stroke"]["light"], "fill": h["fill"]["light"]}


def distance_to_edge(n: dict, ux: float, uy: float) -> float:
    """从节点中心沿方向 (ux, uy)（单位向量）到形状边缘的距离。"""
    hw, hh = n["w"] / 2, n["h"] / 2
    ax, ay = abs(ux), abs(uy)
    shape = n.get("shape") or "rect"
    if shape == "ellipse":
        return 1 / math.sqrt((ax / hw) ** 2 + (ay / hh) ** 2)
    if shape == "diamond":
        return 1 / (ax / hw + ay / hh)
    return min(hw / ax if ax > 1e-9 else math.inf, hh / ay if ay > 1e-9 else math.inf)


def _round2(v: float) -> float:
    return math.floor(v * 100 + 0.5) / 100


def edge_geometry(a: dict, b: dict) -> dict[str, float]:
    """两节点之间直线箭头的几何：起点在 a 的边缘外 ARROW_GAP，终点在 b 的边缘外 ARROW_GAP。"""
    ax, ay = a["x"] + a["w"] / 2, a["y"] + a["h"] / 2
    bx, by = b["x"] + b["w"] / 2, b["y"] + b["h"] / 2
    ln = math.hypot(bx - ax, by - ay)
    if ln < 1e-6:
        raise WispError(f"[wisp-diagram] 连线 {a['id']} → {b['id']} 的两个节点中心重合")
    ux, uy = (bx - ax) / ln, (by - ay) / ln
    s = distance_to_edge(a, ux, uy) + ARROW_GAP
    t = distance_to_edge(b, -ux, -uy) + ARROW_GAP
    if s + t >= ln:
        raise WispError(f"[wisp-diagram] 节点 {a['id']} 与 {b['id']} 距离太近，放不下箭头")
    x, y = ax + ux * s, ay + uy * s
    return {"x": _round2(x), "y": _round2(y), "dx": _round2(bx - ux * t - x), "dy": _round2(by - uy * t - y)}


def _is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def skeleton_to_element_skeletons(sk: dict) -> tuple[list[dict], list[str]]:
    """骨架 → ExcalidrawElementSkeleton[]（纯函数）。"""
    d = palette()["diagram"]
    grid = d["grid-px"]
    warnings: list[str] = []
    common = {"roughness": d["excalidraw"]["roughness"], "fillStyle": d["excalidraw"]["fillStyle"]}

    def sw(emph: Any) -> float:
        return d["stroke-width"]["bold"] if emph else d["stroke-width"]["normal"]

    by_id: dict[str, dict] = {}
    out: list[dict] = []
    for n in sk.get("nodes") or []:
        if not n.get("id"):
            raise WispError("[wisp-diagram] 节点缺少 id")
        if n["id"] in by_id:
            raise WispError(f"[wisp-diagram] 节点 id 重复：{n['id']}")
        by_id[n["id"]] = n
        for k in ("x", "y", "w", "h"):
            if not _is_num(n.get(k)):
                raise WispError(f"[wisp-diagram] 节点 {n['id']} 缺少数值字段 {k}")
            if math.fmod(n[k], grid) != 0:
                warnings.append(f"节点 {n['id']} 的 {k}={js_number(n[k])} 不在 {js_number(grid)}px 网格上")
        c = resolve_skeleton_color(n.get("color"))
        shape = SHAPE.get(n.get("shape") or "rect")
        if not shape:
            raise WispError(f"[wisp-diagram] 节点 {n['id']} 的 shape 无效：{n.get('shape')}")
        el: dict[str, Any] = {
            "type": shape, "id": n["id"], "x": n["x"], "y": n["y"], "width": n["w"], "height": n["h"],
            "strokeColor": c["stroke"], "backgroundColor": c["fill"], "strokeWidth": sw(n.get("emphasis")),
            "strokeStyle": "dashed" if n.get("dashed") else d["excalidraw"]["strokeStyle"], **common,
        }
        if shape in ("rectangle", "diamond"):
            el["roundness"] = {"type": ADAPTIVE_RADIUS}
        if n.get("label"):
            el["label"] = {
                "text": n["label"], "fontSize": d["font-size-px"][n.get("size") or "label"], "fontFamily": EXCALIFONT,
                "strokeColor": resolve_skeleton_color(n["labelColor"])["stroke"] if n.get("labelColor") else c["stroke"],
                "textAlign": "center", "verticalAlign": "middle",
            }
        out.append(el)

    for i, e in enumerate(sk.get("edges") or []):
        a = by_id.get(e.get("from"))
        b = by_id.get(e.get("to"))
        if not a or not b:
            raise WispError(f"[wisp-diagram] 连线 {e.get('from')} → {e.get('to')} 引用了不存在的节点")
        c = resolve_skeleton_color(e.get("color") or "fg")
        g = edge_geometry(a, b)
        el = {
            "type": "arrow", "id": e.get("id") or f"edge-{i + 1}-{e['from']}-{e['to']}",
            "x": g["x"], "y": g["y"], "width": abs(g["dx"]), "height": abs(g["dy"]), "points": [[0, 0], [g["dx"], g["dy"]]],
            "strokeColor": c["stroke"], "backgroundColor": "transparent", "strokeWidth": sw(e.get("emphasis")),
            "strokeStyle": "dashed" if e.get("dashed") else d["excalidraw"]["strokeStyle"], **common,
            "roundness": None,
            "start": {"id": e["from"]}, "end": {"id": e["to"]},
            "startArrowhead": "arrow" if e.get("arrow") == "both" else None,
            "endArrowhead": None if e.get("arrow") == "none" else "arrow",
        }
        if e.get("label"):
            el["label"] = {"text": e["label"], "fontSize": d["font-size-px"]["note"], "fontFamily": EXCALIFONT, "strokeColor": c["stroke"]}
        out.append(el)

    for i, t in enumerate(sk.get("texts") or []):
        size = t.get("size") or "label"
        color = t.get("color") or ("muted" if size == "note" else "fg")
        out.append({
            "type": "text", "id": t.get("id") or f"text-{i + 1}", "x": t["x"], "y": t["y"], "text": t["text"],
            "fontSize": d["font-size-px"][size], "fontFamily": EXCALIFONT,
            "strokeColor": resolve_skeleton_color(color)["stroke"], **common,
        })
    return out, warnings


def skeleton_to_excalidraw(session: BrowserSession, sk: dict, seed: int = 1) -> tuple[str, list[str]]:
    """骨架 → 完整 .excalidraw 文档（字符串，已规范化）。"""
    from .excalidraw_export import convert_skeleton_in_browser

    if sk.get("style") and sk["style"] != "hand":
        raise WispError("[wisp-diagram] 骨架只支持 hand 风格（clean 风格请直接写 draw.io XML）")
    skel, warnings = skeleton_to_element_skeletons(sk)
    elements = json.loads(convert_skeleton_in_browser(session, skel, seed))
    for el in elements:
        el["updated"] = 1  # 去掉时间戳，保证可复现
    doc = {
        "type": "excalidraw", "version": 2, "source": "wisp-diagram", "elements": elements,
        "appState": {"gridSize": palette()["diagram"]["grid-px"], "viewBackgroundColor": "#ffffff"}, "files": {},
    }
    return normalize_excalidraw(doc), warnings


def default_skeleton_output(inp: str) -> str:
    return re.sub(r"(\.skeleton)?\.json$", "", inp, flags=re.I) + ".excalidraw"
