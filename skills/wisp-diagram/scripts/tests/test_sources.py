"""移植自 lib/sources.test.ts：drawio 压缩/解压/规范化、excalidraw 规范化、lint 规则与 --fix、CLI 退出码。"""
import json
import re
import shutil

from conftest import FIX, fx, snap
from wisp_diagram_lib.cli import cmd_lint, cmd_normalize
from wisp_diagram_lib.drawio import compress_diagram, decompress_diagram, list_pages, normalize_drawio
from wisp_diagram_lib.excalidraw import normalize_excalidraw
from wisp_diagram_lib.lint import apply_fixes, lint_drawio, lint_excalidraw


class TestDrawio:
    def test_round_trips_compression(self):
        xml = '<mxGraphModel><root><mxCell id="0" value="中文 &amp; é"/></root></mxGraphModel>'
        assert decompress_diagram(compress_diagram(xml)) == xml

    def test_lists_pages(self):
        assert [(p.name, p.compressed) for p in list_pages(fx("sample-compressed.drawio"))] == [("Page-1", True), ("Second", True)]
        assert all(not p.compressed for p in list_pages(fx("sample-plain.drawio")))

    def test_normalize_compressed_equals_plain_and_idempotent(self):
        a = normalize_drawio(fx("sample-compressed.drawio"))
        assert a == normalize_drawio(fx("sample-plain.drawio"))
        assert normalize_drawio(a) == a
        assert not re.search(r"<diagram[^>]*>[A-Za-z0-9+/=]{40,}", a)
        assert a == snap("normalized.drawio")


class TestExcalidrawNormalize:
    out = normalize_excalidraw(fx("sample.excalidraw"))

    def test_sorts_and_trims(self):
        doc = json.loads(self.out)
        assert [e["id"] for e in doc["elements"]] == ["a3", "b2", "c4", "d5", "t1"]
        assert doc["appState"] == {"viewBackgroundColor": "#ffffff", "gridSize": 8}

    def test_idempotent(self):
        assert normalize_excalidraw(self.out) == self.out


class TestLintExcalidraw:
    issues = lint_excalidraw(fx("sample.excalidraw"))

    def by(self, rule):
        return [i for i in self.issues if i.rule == rule]

    def test_reports_rules(self):
        assert [i.element_id for i in self.by("palette-color")] == ["a3"]
        assert self.by("palette-color")[0].fix.to == "#1d4ed8"
        assert [i.element_id for i in self.by("font-size")] == ["c4"]
        assert [i.element_id for i in self.by("grid")] == ["a3"]

    def test_oversize_and_gradient(self):
        big = json.dumps({"elements": [{"id": "x", "type": "rectangle", "x": 0, "y": 0, "strokeColor": "linear-gradient(red, blue)"}],
                          "files": {"a": "x" * int(2.1 * 1024 * 1024)}})
        rules = [i.rule for i in lint_excalidraw(big)]
        assert "file-size" in rules
        assert "gradient" in rules

    def test_apply_fixes_snaps_colors(self):
        fixed = apply_fixes("excalidraw", fx("sample.excalidraw"), self.issues)
        assert [i for i in lint_excalidraw(fixed) if i.rule == "palette-color"] == []


class TestLintDrawio:
    src = fx("sample-compressed.drawio")
    issues = lint_drawio(src)

    def by(self, rule):
        return [i for i in self.issues if i.rule == rule]

    def test_reports_rules(self):
        assert [i.element_id for i in self.by("palette-color")] == ["3"]
        assert len(self.by("shadow")) == 1
        assert len(self.by("gradient")) == 1
        assert [i.element_id for i in self.by("font-size")] == ["3"]
        assert [i.element_id for i in self.by("grid")] == ["3"]
        assert len(self.by("compressed")) == 1

    def test_apply_fixes(self):
        fixed = apply_fixes("drawio", self.src, self.issues)
        assert [i for i in lint_drawio(fixed) if i.level == "error"] == []
        assert "fillColor=#" in fixed
        assert all(not p.compressed for p in list_pages(fixed))

    def test_messages_match_ts(self):
        # 与 T5a 的 TS 实现输出逐字一致（ΔE 用同一套 lab65 CIEDE2000 计算）
        msgs = [i.message for i in self.issues]
        assert "style fillColor: #ff00ff is not in the palette; nearest is #7c3aed (--wd-violet, ΔE 21.8)" in msgs
        assert "fontSize=20 is not one of 14/18/12 (±1)" in msgs
        assert "x=13 not aligned to 8px grid" in msgs


class TestCli:
    def test_lint_exit_codes_and_fix(self, tmp_path):
        for f in ("sample.excalidraw", "sample-compressed.drawio"):
            shutil.copy(FIX / f, tmp_path / f)
        logs = []
        assert cmd_lint([str(tmp_path / "*.excalidraw"), str(tmp_path / "*.drawio")], log=logs.append) == 1
        assert any("palette-color" in line for line in logs)
        assert cmd_lint([str(tmp_path / "*.excalidraw"), str(tmp_path / "*.drawio")], fix=True, log=logs.append) == 0
        assert cmd_lint([str(tmp_path / "*.drawio")], strict=True, log=logs.append) == 1  # warnings remain

    def test_lint_exit_2(self, tmp_path):
        logs = []
        assert cmd_lint([], log=logs.append) == 2
        (tmp_path / "bad.excalidraw").write_text("{nope")
        assert cmd_lint([str(tmp_path / "bad.excalidraw")], log=logs.append) == 2

    def test_normalize_check_then_write(self, tmp_path):
        f = tmp_path / "sample.excalidraw"
        f.write_text(fx("sample.excalidraw"))
        logs = []
        assert cmd_normalize([str(f)], check=True, log=logs.append) == 1
        assert cmd_normalize([str(f)], log=logs.append) == 0
        assert cmd_normalize([str(f)], check=True, log=logs.append) == 0
