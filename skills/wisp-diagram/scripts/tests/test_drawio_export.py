"""移植自 exporters/drawio.test.ts。"""
import pytest

from wisp_diagram_lib.drawio_export import (
    choose_drawio_method, clean_drawio_svg, drawio_page_labels, drawio_pages, drawio_unavailable_message,
    Probe, strip_light_dark,
)
from wisp_diagram_lib.env import WispError

XML = """<mxfile><diagram id="a" name="encoder"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="2" value="多头注意力&lt;br&gt;Multi-Head Attention" style="html=1;" vertex="1" parent="1"/>
<mxCell id="3" value="Add &amp;amp; Norm" vertex="1" parent="1"/></root></mxGraphModel></diagram>
<diagram id="b" name="数据流"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="e" value="矩阵乘" edge="1" parent="1"/></root></mxGraphModel></diagram></mxfile>"""


def test_strip_light_dark():
    assert strip_light_dark("fill: light-dark(rgb(1, 2, 3), rgb(4, 5, 6));") == "fill: rgb(1, 2, 3);"
    assert strip_light_dark("color: light-dark(#1d1d1f, #d4d4d6)") == "color: #1d1d1f"
    assert strip_light_dark("a light-dark(#fff, var(--x, #121212)) b") == "a #fff b"
    assert strip_light_dark("no-op") == "no-op"


RAW = ('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" style="background: transparent; color-scheme: light;" viewBox="0 0 10 10" id="ge-svg-abc" content="&lt;mxfile/&gt;">'
       '<style type="text/css">@supports (color: light-dark(#000, #fff)) { #ge-svg-abc { --ge-adaptive-fg: light-dark(#000000, var(--ge-light-color, #ffffff)); } }</style>'
       '<rect fill="#dbeafe" stroke="#1d4ed8" style="fill: light-dark(rgb(219, 234, 254), rgb(26, 39, 56)); stroke: light-dark(rgb(29, 78, 216), rgb(129, 171, 255));"/>'
       '<text fill="#000000" style="fill: var(--ge-adaptive-fg, #000000);">x</text><div style="color: light-dark(#1d1d1f, #d4d4d6); font-size: 12px"></div></svg>')


class TestClean:
    out = clean_drawio_svg(RAW)

    def test_strips_adaptive(self):
        for s in ("light-dark", "--ge-", "ge-svg-abc", "content=", "<?xml"):
            assert s not in self.out

    def test_dedupes_style(self):
        assert '<rect fill="#dbeafe" stroke="#1d4ed8"/>' in self.out
        assert '<text fill="#000000">' in self.out

    def test_html_color(self):
        assert "color: #1d1d1f" in self.out
        assert "font-size: 12px" in self.out


class TestPages:
    def test_lists_pages(self):
        assert [(p.index, p.name) for p in drawio_pages(XML)] == [(0, "encoder"), (1, "数据流")]

    def test_default_name(self):
        assert [(p.index, p.name) for p in drawio_pages('<mxfile><diagram id="a"></diagram></mxfile>')] == [(0, "Page-1")]

    def test_labels(self):
        labels = drawio_page_labels(XML, 0)
        assert "多头注意力 Multi-Head Attention" in labels
        assert "Add & Norm" in labels
        assert "矩阵乘" in drawio_page_labels(XML, 1)


class TestProbe:
    def test_forced_unavailable_gives_install_help(self, monkeypatch):
        monkeypatch.setenv("WISP_DRAWIO_BIN", "/nonexistent/drawio")
        with pytest.raises(WispError, match="drawio-desktop"):
            choose_drawio_method("cli")

    def test_unknown_method(self):
        with pytest.raises(WispError, match="未知"):
            choose_drawio_method("nope")

    def test_all_unavailable_message(self):
        msg = drawio_unavailable_message([Probe("cli", False, "x"), Probe("docker", False, "y"), Probe("browser", False, "z")])
        assert "drawio-desktop" in msg
        assert "docker pull rlespinasse/drawio-export" in msg
        assert "WISP_DRAWIO_VIEWER" in msg
