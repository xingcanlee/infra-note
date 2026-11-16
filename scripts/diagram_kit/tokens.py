"""Wisp 调色板与 8px 网格辅助模块（对齐 design/palette.json 与 wisp-diagram 规范）。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PALETTE_PATH = ROOT / "design" / "palette.json"
WISP_SCRIPT = ROOT / "node_modules" / "astro-wisp" / "skills" / "wisp-diagram" / "scripts" / "wisp_diagram.py"
WISP_SCRIPTS_DIR = WISP_SCRIPT.parent

if str(WISP_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(WISP_SCRIPTS_DIR))

PALETTE: dict = json.loads(PALETTE_PATH.read_text("utf-8"))
BASE_LIGHT: dict[str, str] = {k: v["light"] for k, v in PALETTE["color"]["base"].items() if isinstance(v, dict)}
SEMANTIC_MAP: dict[str, str] = {
    k: v for k, v in PALETTE["color"]["semantic"].items() if not k.startswith("$")
}
HUE_NAMES: tuple[str, ...] = tuple(
    k for k in PALETTE["color"]["hue"].keys() if not k.startswith("$")
)

NEUTRAL_HUES = {"slate"}
MAX_HUES = 3
CANVAS_W = 688  # <= 700px 正文自然宽度


def snap8(v: float | int) -> int:
    """将像素坐标吸附到 8px 网格。"""
    return int(round(float(v) / 8.0) * 8)


def snap8_pos(v: float | int, minimum: int = 8) -> int:
    return max(minimum, snap8(v))


def resolve_tone(tone: str | None) -> tuple[str | None, str, str]:
    """返回 (hue_name_or_None, fill_hex, stroke_hex)。"""
    t = (tone or "neutral").strip()
    if t == "neutral":
        return None, BASE_LIGHT["surface"], BASE_LIGHT["muted"]
    if t == "subtle":
        return None, BASE_LIGHT["bg"], BASE_LIGHT["subtle"]
    if t == "emphasis":
        return None, BASE_LIGHT["surface"], BASE_LIGHT["fg"]
    if t in ("fg", "muted"):
        return None, "none", BASE_LIGHT[t]
    hue = t if t in HUE_NAMES else SEMANTIC_MAP.get(t)
    if hue and hue in PALETTE["color"]["hue"]:
        entry = PALETTE["color"]["hue"][hue]
        return hue, entry["fill"]["light"], entry["stroke"]["light"]
    raise ValueError(f"未知 Wisp 色调名 {tone!r}")


def non_slate_hues(tones: list[str] | set[str]) -> list[str]:
    found: set[str] = set()
    for t in tones:
        hue, _, _ = resolve_tone(t)
        if hue and hue not in NEUTRAL_HUES:
            found.add(hue)
    return [h for h in HUE_NAMES if h in found]
