import io
import json
import math
import re
import shutil
import tempfile
from copy import copy
from pathlib import Path
from xml.sax.saxutils import escape

from pypdf import PdfReader
from PIL import Image as PILImage
from PIL import ImageDraw, ImageEnhance
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, FrameBreak, Image, NextPageTemplate, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table)

from . import fonts
from .charts import chart_flowable
from .tagging import Elem, Tagged, artifact_begin, artifact_end, write_structure

DEFAULT_RUN = {"font": "Inter", "size": 11.0, "color": "#000000", "bold": False, "italic": False}
DEFAULT_PARA = {"spaceBefore": 0.0, "spaceAfter": 8.0, "lineSpacing": 1.15, "align": "left"}
ALIGN = {"left": TA_LEFT, "center": TA_CENTER, "right": TA_RIGHT, "justify": TA_JUSTIFY}
BULLETS = ["•", "–", "•", "–"]
LOOK_LINE = {
    "grid": (0.5, "#8c8c8c"), "banded": (0.5, "#d6d6d6"), "accent": (0.5, "#d6d6d6"),
}
CHART_COLORS = {"orange": "#f97316", "blue": "#3b82f6", "teal": "#14b8a6", "amber": "#f59e0b", "rose": "#f43f5e",
                "green": "#22c55e", "cyan": "#06b6d4", "pink": "#ec4899", "violet": "#8b5cf6", "gray": "#6b7280"}
MAX_PAGES = 5000


def color(value: str | None, fallback: str = "#000000") -> Color:
    try:
        return HexColor(value or fallback)
    except (ValueError, TypeError):
        return HexColor(fallback)


def roman(n: int, upper: bool) -> str:
    out = ""
    for value, sym in ((1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")):
        while n >= value:
            out += sym
            n -= value
    return out.upper() if upper else out


def alpha(n: int, upper: bool) -> str:
    out = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        out = chr(97 + r) + out
    return out.upper() if upper else out


def number_text(n: int, fmt: str) -> str:
    if fmt == "lowerRoman" or fmt == "lower-roman":
        return roman(n, False)
    if fmt == "upperRoman" or fmt == "upper-roman":
        return roman(n, True)
    if fmt == "lowerLetter" or fmt == "lower-alpha":
        return alpha(n, False)
    if fmt == "upperLetter" or fmt == "upper-alpha":
        return alpha(n, True)
    if fmt == "decimal-leading-zero":
        return f"{n:02d}"
    return str(n)


class ParityBreak(Flowable):
    def __init__(self, odd: bool) -> None:
        super().__init__()
        self.odd = odd

    def wrap(self, aw, ah):
        page = self.canv.getPageNumber()
        if (page % 2 == 1) == self.odd:
            return 0, 0
        return aw, ah

    def draw(self):
        return None


class TabLine(Flowable):
    def __init__(self, segments, stops, default_tab, left, size, leading, base_face, color_value) -> None:
        super().__init__()
        self.segments = segments
        self.stops = stops
        self.default_tab = default_tab
        self.left = left
        self.size = size
        self.leading = leading
        self.base_face = base_face
        self.color = color_value
        self.hAlign = "LEFT"

    def wrap(self, aw, ah):
        self.aw = aw
        self.width = aw
        self.height = self.leading
        return aw, self.leading

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        x = 0.0
        y = self.leading * 0.28
        for i, (text, face) in enumerate(self.segments):
            w = pdfmetrics.stringWidth(text, face, self.size)
            if i == 0:
                start, leader = self.left, ""
            else:
                stop = next((s for s in sorted(self.stops, key=lambda s: s["pos"]) if s["pos"] + self.left > x + 0.5), None)
                if stop is None:
                    pos = (math.floor((x - self.left) / self.default_tab) + 1) * self.default_tab + self.left
                    stop = {"pos": pos - self.left, "align": "left", "leader": "none"}
                pos = stop["pos"] + self.left
                align = stop.get("align", "left")
                if align == "right":
                    start = pos - w
                elif align == "center":
                    start = pos - w / 2
                elif align == "decimal":
                    head = text.split(".")[0]
                    start = pos - pdfmetrics.stringWidth(head, face, self.size)
                else:
                    start = pos
                start = max(start, x)
                leader = {"dot": ".", "dash": "-", "underline": "_"}.get(stop.get("leader", "none"), "")
            if leader and start > x + 2:
                lw = pdfmetrics.stringWidth(leader, face, self.size)
                count = int((start - x - 2) // max(lw, 0.1))
                if count > 0:
                    c.setFont(face, self.size)
                    c.drawString(start - lw * count - 1, y, leader * count)
            c.setFont(face, self.size)
            c.drawString(start, y, text)
            x = start + w


class Ctx:
    def __init__(self, doc: dict, media: dict[str, bytes], tmp: Path) -> None:
        self.doc = doc
        self.media = media
        self.tmp = tmp
        self.styles = doc.get("styles") or {}
        self.warnings: list[str] = []
        self.counters = [0] * 9
        self.last_list_parent: Elem | None = None
        self.list_elem: Elem | None = None
        self.picture_cache: dict[str, tuple[str, float, float] | None] = {}
        self.accent = str((doc.get("settings", {}).get("template") or {}).get("accent") or "#f97316")
        self.headings = 0
        self.base_family = self.fam(str(self.resolve("Normal")[0].get("font") or "Inter"))
        self.default_tab = float(doc.get("settings", {}).get("defaultTab") or 36)
        self.max_h = 648.0 * 0.9

    def warn(self, text: str) -> None:
        if text and text not in self.warnings:
            self.warnings.append(text)

    def drawing(self, group: str, key: str) -> tuple[str, int, int] | None:
        import base64
        cache = self.__dict__.setdefault("drawing_cache", {})
        if (group, key) in cache:
            return cache[(group, key)]
        url = ((self.doc.get("_drawings") or {}).get(group) or {}).get(key)
        out = None
        if isinstance(url, str) and url.startswith("data:image/png;base64,"):
            try:
                data = base64.b64decode(url.split(",", 1)[1])
                im = PILImage.open(io.BytesIO(data))
                im.load()
                path = self.tmp / f"draw{len(cache)}.png"
                im.save(path, "PNG")
                out = (str(path), im.size[0], im.size[1])
            except (OSError, ValueError):
                out = None
        cache[(group, key)] = out
        return out

    def fam(self, name: str) -> fonts.Family:
        family = fonts.family(name)
        self.warn(fonts.note(name))
        return family

    def resolve(self, sid: str) -> tuple[dict, dict]:
        chain, seen, cur = [], set(), sid if sid in self.styles else "Normal"
        while cur and cur in self.styles and cur not in seen:
            seen.add(cur)
            chain.append(self.styles[cur])
            cur = self.styles[cur].get("basedOn")
        run, para = dict(DEFAULT_RUN), dict(DEFAULT_PARA)
        for st in reversed(chain):
            run.update({k: v for k, v in (st.get("run") or {}).items() if v is not None})
            para.update({k: v for k, v in (st.get("para") or {}).items() if v is not None})
        return run, para

    def picture(self, run: dict) -> tuple[str, float, float] | None:
        name = str(run.get("media") or "")
        data = self.media.get(name)
        if not data:
            return None
        width = float(run.get("width") or 0)
        height = float(run.get("height") or 0)
        key = repr(sorted((k, str(v)) for k, v in run.items() if k not in {"type", "alt", "wrap", "side", "x", "y", "relative"}))
        if key in self.picture_cache:
            return self.picture_cache[key]
        out = None
        try:
            im = PILImage.open(io.BytesIO(data))
            im.load()
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "transparency" in im.info or im.mode in ("LA", "PA", "P") else "RGB")
            crop = run.get("crop") or {}
            if crop:
                w, h = im.size
                l, t = int(w * float(crop.get("l", 0))), int(h * float(crop.get("t", 0)))
                r, b = w - int(w * float(crop.get("r", 0))), h - int(h * float(crop.get("b", 0)))
                if r - l > 1 and b - t > 1:
                    im = im.crop((l, t, r, b))
            if not width or not height:
                width = width or im.size[0] * 0.75
                height = height or width * im.size[1] / max(im.size[0], 1)
            target = (max(1, int(width * 2.5)), max(1, int(height * 2.5)))
            if im.size[0] > target[0] * 1.2:
                im = im.resize(target, PILImage.LANCZOS)
            for fn, val in ((ImageEnhance.Brightness, run.get("brightness")), (ImageEnhance.Contrast, run.get("contrast")), (ImageEnhance.Color, run.get("saturation"))):
                if val is not None and float(val) != 100:
                    rgb = im.convert("RGB")
                    rgb = fn(rgb).enhance(float(val) / 100)
                    if im.mode == "RGBA":
                        rgb.putalpha(im.getchannel("A"))
                    im = rgb
            if run.get("transparency"):
                im = im.convert("RGBA")
                alpha_band = im.getchannel("A").point(lambda v: int(v * (100 - float(run["transparency"])) / 100))
                im.putalpha(alpha_band)
            rotate = float(run.get("rotate") or 0)
            if rotate % 360:
                im = im.convert("RGBA").rotate(-rotate, expand=False, resample=PILImage.BICUBIC)
            if run.get("border") and run.get("borderWidth"):
                im = im.convert("RGBA")
                bw = max(1, int(float(run["borderWidth"]) * im.size[0] / max(width, 1)))
                ImageDraw.Draw(im).rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), outline=str(run["border"]), width=bw)
            has_alpha = im.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 255
            path = self.tmp / f"pic{len(self.picture_cache)}.{'png' if has_alpha else 'jpg'}"
            if has_alpha:
                im.save(path, "PNG")
            else:
                im.convert("RGB").save(path, "JPEG", quality=88)
            out = (str(path), width, height)
        except (OSError, ValueError, SyntaxError):
            self.warn(f"Picture {name} could not be read, so it was left out.")
        self.picture_cache[key] = out
        return out


def plain_text(content: list) -> str:
    out = []
    for run in content or []:
        if not isinstance(run, dict):
            continue
        t = run.get("type")
        if t == "text":
            out.append(str(run.get("text", "")))
        elif t == "break":
            out.append(" ")
        elif t == "tab":
            out.append(" ")
        elif t == "field":
            out.append(str(run.get("result", "")))
        elif run.get("text"):
            out.append(str(run["text"]))
    return "".join(out).strip()


def clean(text: str) -> str:
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)


def text_markup(ctx: Ctx, text: str, fam: fonts.Family) -> str:
    text = clean(text)
    if text.isascii() or not fam.bundled and all(fonts.encodable(c) for c in text):
        return escape(text)
    out, buf, cur = [], "", None
    for ch in text:
        name = None
        if ord(ch) >= 128:
            found = fam.covers(ch)
            if found is None:
                ch, found = ("?", "Helvetica") if not fonts.encodable(ch) else (ch, "Helvetica")
            name = None if found == fam.faces["regular"] else found
        if name != cur:
            if buf:
                out.append(f'<font name="{cur}">{escape(buf)}</font>' if cur else escape(buf))
            buf, cur = "", name
        buf += ch
    if buf:
        out.append(f'<font name="{cur}">{escape(buf)}</font>' if cur else escape(buf))
    return "".join(out)


def run_markup(ctx: Ctx, run: dict, base: dict, fam: fonts.Family) -> str:
    marks = run.get("marks") or {}
    text = str(run.get("text", ""))
    size = float(marks.get("size") or base["size"])
    family = ctx.fam(str(marks["font"])) if marks.get("font") else fam
    if marks.get("allCaps"):
        text = text.upper()
    if marks.get("smallCaps") and not marks.get("allCaps"):
        parts, buf, low = [], "", None
        for ch in text:
            is_low = ch.islower()
            if is_low != low and buf:
                parts.append((buf, low))
                buf = ""
            buf, low = buf + ch, is_low
        if buf:
            parts.append((buf, low))
        inner = "".join(f'<font size="{size * 0.8:.2f}">{text_markup(ctx, b.upper(), family)}</font>' if lw else text_markup(ctx, b, family) for b, lw in parts)
    else:
        inner = text_markup(ctx, text, family)
    if marks.get("code"):
        inner = f'<font name="Courier">{inner}</font>'
    if marks.get("superscript"):
        inner = f"<super>{inner}</super>"
    if marks.get("subscript"):
        inner = f"<sub>{inner}</sub>"
    if marks.get("strike"):
        inner = f"<strike>{inner}</strike>"
    if marks.get("underline"):
        inner = f"<u>{inner}</u>"
    if marks.get("italic"):
        inner = f"<i>{inner}</i>"
    if marks.get("bold"):
        inner = f"<b>{inner}</b>"
    attrs = []
    if marks.get("font"):
        attrs.append(f'name="{family.faces["regular"]}"')
    if marks.get("size"):
        attrs.append(f'size="{size:.2f}"')
    link = marks.get("link")
    if marks.get("color"):
        attrs.append(f'color="{marks["color"]}"')
    elif link:
        attrs.append('color="#0563c1"')
    if attrs:
        inner = f"<font {' '.join(attrs)}>{inner}</font>"
    if marks.get("highlight"):
        inner = f'<span backColor="{marks["highlight"]}">{inner}</span>'
    if link:
        inner = f'<a href="{escape(str(link), {chr(34): "&quot;"})}">{"<u>" + inner + "</u>" if not marks.get("underline") else inner}</a>'
    return inner


def build_style(ctx: Ctx, block: dict, extra_left: float = 0.0) -> tuple[ParagraphStyle, dict, dict]:
    run, para = ctx.resolve(str(block.get("style") or "Normal"))
    props = block.get("props") or {}
    fam = ctx.fam(str(run.get("font") or "Inter"))
    size = float(run.get("size") or 11)
    ls = float(props.get("lineSpacing") or para.get("lineSpacing") or 1.15)
    left = float(props.get("indent") if props.get("indent") is not None else para.get("indentLeft") or 0) + extra_left
    right = float(props.get("indentRight") if props.get("indentRight") is not None else para.get("indentRight") or 0)
    align = str(props.get("align") or para.get("align") or "left")
    before = props.get("spaceBefore")
    after = props.get("spaceAfter")
    st = ParagraphStyle(
        "p", fontName=fam.faces["regular"], fontSize=size, leading=size * ls, textColor=color(str(run.get("color") or "#000000")),
        alignment=ALIGN.get(align, TA_LEFT), leftIndent=left, rightIndent=right, firstLineIndent=float(props.get("indentFirst") or 0),
        spaceBefore=float(before if before is not None else para.get("spaceBefore") or 0),
        spaceAfter=float(after if after is not None else para.get("spaceAfter") or 0),
        keepWithNext=1 if (props.get("keepNext") or para.get("keepWithNext")) else 0,
        allowWidows=0 if props.get("widowControl") is False else 1, allowOrphans=0 if props.get("widowControl") is False else 1,
        autoLeading="max", splitLongWords=1, backColor=color(props["shading"]) if props.get("shading") else None,
    )
    return st, run, para


def list_label(ctx: Ctx, info: dict) -> str:
    level = max(0, min(8, int(info.get("level") or 0)))
    kind = info.get("kind")
    if kind == "check":
        return "[x]" if info.get("checked") else "[ ]"
    if kind == "bullet":
        return str(info.get("bullet") or BULLETS[level % 4])
    if info.get("start") is not None:
        ctx.counters[level] = int(info["start"]) - 1
    ctx.counters[level] += 1
    for deeper in range(level + 1, 9):
        ctx.counters[deeper] = 0
    fmt = str(info.get("format") or ("decimal", "lower-alpha", "lower-roman")[level % 3])
    return f"{info.get('prefix') or ''}{number_text(ctx.counters[level], fmt)}{info.get('suffix') if info.get('suffix') is not None else '.'}"


def paragraph_flowables(ctx: Ctx, block: dict, avail: float, parent: Elem, top: bool) -> list[Flowable]:
    info = block.get("list")
    extra = 0.0
    run_base, para_base = ctx.resolve(str(block.get("style") or "Normal"))
    if info:
        extra = 18.0 * (int(info.get("level") or 0) + 1)
    else:
        ctx.counters = [0] * 9
    st, run, para = build_style(ctx, block, extra)
    fam = ctx.fam(str(run.get("font") or "Inter"))
    content =[r for r in (block.get("content") or []) if isinstance(r, dict)]
    level = int(para.get("outlineLevel") or 0)
    text = plain_text(content)
    if info:
        st.bulletIndent = max(0.0, st.leftIndent - 18.0)
        bullet = str(info.get("bullet") or BULLETS[int(info.get("level") or 0) % 4])
        st.bulletFontName = fam.faces["regular"] if info.get("kind") == "number" or (fam.bundled and all(fam.covers(ch) == fam.faces["regular"] for ch in bullet)) else "Helvetica"
        st.bulletFontSize = st.fontSize
        st.firstLineIndent = 0
        label = list_label(ctx, info)
    else:
        label = ""
    images = [r for r in content if r.get("type") == "image" or (r.get("type") == "shape" and ctx.drawing("shapes", shape_key(r)))]
    only_images = bool(images) and all(r in images or (r.get("type") == "text" and not str(r.get("text", "")).strip()) or r.get("type") == "break" for r in content)
    if only_images and not info:
        out: list[Flowable] = []
        for r in images:
            if r.get("type") == "shape":
                drawn = ctx.drawing("shapes", shape_key(r))
                pic = (drawn[0], float(r.get("width") or drawn[1] * 0.375), float(r.get("height") or drawn[2] * 0.375)) if drawn else None
            else:
                pic = ctx.picture(r)
            if not pic:
                continue
            if str(r.get("wrap") or "inline") not in ("inline", "topBottom"):
                ctx.warn("Pictures that float around text are placed in line in the PDF.")
            w, h = pic[1], pic[2]
            scale = min(1.0, (avail - st.leftIndent - st.rightIndent) / max(w, 1), ctx.max_h / max(h, 1))
            img = Image(pic[0], w * scale, h * scale)
            img.hAlign = "CENTER" if st.alignment == TA_CENTER else "RIGHT" if st.alignment == TA_RIGHT else "LEFT"
            img.spaceBefore, img.spaceAfter = st.spaceBefore, st.spaceAfter
            ctx.last_list_parent = None
            out.append(Tagged(img, Elem("Figure", parent, str(r.get("alt") or "")), None))
        return out
    parts: list[str] = []
    seg_text: list[tuple[str, str]] = []
    has_tab = any(r.get("type") == "tab" for r in content)
    tabs = (block.get("props") or {}).get("tabs") or []
    alt_texts = []
    for r in content:
        t = r.get("type")
        if t == "text":
            parts.append(run_markup(ctx, r, {"size": st.fontSize}, fam))
            seg_text.append(("text", str(r.get("text", ""))))
        elif t == "break":
            parts.append("<br/>")
            seg_text.append(("br", ""))
        elif t == "tab":
            parts.append("&nbsp;&nbsp;&nbsp;&nbsp;")
            seg_text.append(("tab", ""))
        elif t == "image":
            pic = ctx.picture(r)
            if pic:
                scale = min(1.0, (avail - st.leftIndent) / max(pic[1], 1), ctx.max_h / max(pic[2], 1))
                parts.append(f'<img src="{pic[0]}" width="{pic[1] * scale:.1f}" height="{pic[2] * scale:.1f}" valign="bottom"/>')
                if r.get("alt"):
                    alt_texts.append(str(r["alt"]))
                if str(r.get("wrap") or "inline") not in ("inline", "topBottom"):
                    ctx.warn("Pictures that float around text are placed in line in the PDF.")
        elif t == "field":
            parts.append(text_markup(ctx, str(r.get("result", "")), fam))
        elif t == "shape":
            drawn = ctx.drawing("shapes", shape_key(r))
            if drawn:
                w = float(r.get("width") or drawn[1] * 0.375)
                h = float(r.get("height") or drawn[2] * 0.375)
                sc = min(1.0, (avail - st.leftIndent) / max(w, 1), ctx.max_h / max(h, 1))
                parts.append(f'<img src="{drawn[0]}" width="{w * sc:.1f}" height="{h * sc:.1f}" valign="bottom"/>')
                if str(r.get("wrap") or "front") not in ("inline", "topBottom"):
                    ctx.warn("Shapes and pictures that float around text are placed in line in the PDF.")
            else:
                ctx.warn("Drawn shapes are written to the PDF when it is exported from the open window; otherwise their text is.")
                if r.get("text"):
                    parts.append(text_markup(ctx, str(r["text"]), fam))
        elif t == "math":
            ctx.warn("Equations are written as their LaTeX source.")
            parts.append(text_markup(ctx, str(r.get("latex", "")), fam))
        elif r.get("text"):
            parts.append(text_markup(ctx, str(r["text"]), fam))
        elif r.get("label") or r.get("name"):
            parts.append(text_markup(ctx, str(r.get("label") or r.get("name")), fam))
    if run.get("bold"):
        parts = ["<b>"] + parts + ["</b>"]
    if run.get("italic"):
        parts = ["<i>"] + parts + ["</i>"]
    xml = "".join(parts) or "&nbsp;"
    tag = f"H{min(6, max(1, level))}" if level and text else "P"
    if level and text:
        ctx.headings += 1
    if info:
        if ctx.last_list_parent is not parent or ctx.list_elem is None:
            ctx.list_elem = Elem("L", parent)
            ctx.last_list_parent = parent
        li = Elem("LI", ctx.list_elem)
        elem = Elem("LBody", li)
        elem.alt = "; ".join(alt_texts)
    else:
        ctx.last_list_parent = None
        ctx.list_elem = None
        elem = Elem(tag, parent, "; ".join(alt_texts))
    if has_tab and tabs:
        segments, current = [], ""
        bold_i = bool(run.get("bold"))
        face = fam.faces["bold" if bold_i else "regular"]
        for kind, t in seg_text:
            if kind == "tab":
                segments.append((current, face))
                current = ""
            elif kind == "text":
                current += t
        segments.append((current, face))
        stops = [{"pos": float(s.get("pos", 0)), "align": s.get("align", "left"), "leader": s.get("leader", "none")} for s in tabs if isinstance(s, dict)]
        flow = TabLine(segments, stops, ctx.default_tab, st.leftIndent, st.fontSize, st.leading, face, st.textColor)
        flow.spaceBefore, flow.spaceAfter = st.spaceBefore, st.spaceAfter
        return [Tagged(flow, elem, (text, level) if level and top and text else None)]
    try:
        flow = Paragraph(xml, st, bulletText=label or None)
    except (ValueError, AttributeError, KeyError, IndexError):
        flow = Paragraph(escape(text) or "&nbsp;", st, bulletText=label or None)
    out = [Tagged(flow, elem, (text, level) if level and top and text else None)]
    border = str((block.get("props") or {}).get("border") or "")
    if border:
        sides = ("top", "bottom", "left", "right") if border == "box" else (border,)
        cmds = [("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
        names = {"top": "LINEABOVE", "bottom": "LINEBELOW", "left": "LINEBEFORE", "right": "LINEAFTER"}
        for s in sides:
            if s in names:
                cmds.append((names[s], (0, 0), (-1, -1), 0.75, color("#404040")))
        flow.style = copy(st)
        flow.style.leftIndent = 0
        flow.style.spaceBefore = flow.style.spaceAfter = 0
        wrapper = Table([[out[0]]], colWidths=[max(10, avail - st.leftIndent - st.rightIndent)], style=cmds, hAlign="RIGHT" if st.leftIndent else "LEFT", splitInRow=1)
        if st.leftIndent:
            wrapper = Table([[wrapper]], colWidths=[avail - st.rightIndent], style=[("LEFTPADDING", (0, 0), (-1, -1), st.leftIndent), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)], splitInRow=1)
        wrapper.spaceBefore, wrapper.spaceAfter = st.spaceBefore, st.spaceAfter
        return [wrapper]
    return out


def code_flowables(ctx: Ctx, block: dict, avail: float, parent: Elem) -> list[Flowable]:
    ctx.last_list_parent = None
    ctx.counters = [0] * 9
    text = clean(str(block.get("text") or ""))
    lines = []
    for line in text.split("\n"):
        stripped = line.lstrip(" ")
        lead = "&nbsp;" * (len(line) - len(stripped))
        lines.append(lead + escape(stripped).replace("  ", "&nbsp;&nbsp;").replace("\t", "&nbsp;" * 4))
    st = ParagraphStyle("c", fontName="Courier", fontSize=9, leading=12, backColor=HexColor("#f4f4f5"), borderPadding=4, spaceBefore=4, spaceAfter=10, leftIndent=4, rightIndent=4, splitLongWords=1)
    flow = Paragraph("<br/>".join(lines) or "&nbsp;", st)
    return [Tagged(flow, Elem("P", parent), None)]


def cell_flowables(ctx: Ctx, body: list, avail: float, parent: Elem, header: bool, text_color: str | None) -> list[Flowable]:
    out = blocks_flowables(ctx, body, avail, parent, top=False, header=header, text_color=text_color)
    first = out[0] if out else None
    last = out[-1] if out else None
    for f, attr in ((first, "spaceBefore"), (last, "spaceAfter")):
        inner = getattr(f, "inner", f)
        st = getattr(inner, "style", None)
        if st is not None and isinstance(st, ParagraphStyle):
            setattr(st, attr, 0)
        elif f is not None:
            try:
                setattr(f, attr, 0)
            except AttributeError:
                pass
    return out


def table_flowable(ctx: Ctx, block: dict, avail: float, parent: Elem) -> list[Flowable]:
    ctx.last_list_parent = None
    ctx.counters = [0] * 9
    rows = [r for r in (block.get("rows") or []) if isinstance(r, dict)]
    if not rows:
        return []
    look = str(block.get("look") or "grid")
    columns = [float(w or 0) for w in (block.get("columns") or [])]
    placements: list[tuple[int, int, int, int, dict]] = []
    taken: dict[tuple[int, int], bool] = {}
    ncols = len(columns)
    for r, row in enumerate(rows):
        c = 0
        for cell in row.get("cells") or []:
            while taken.get((r, c)):
                c += 1
            cs, rs = max(1, int(cell.get("colspan") or 1)), max(1, int(cell.get("rowspan") or 1))
            rs = min(rs, len(rows) - r)
            placements.append((r, c, rs, cs, cell))
            for dr in range(rs):
                for dc in range(cs):
                    taken[(r + dr, c + dc)] = True
            c += cs
            ncols = max(ncols, c)
    if not ncols:
        return []
    widths = (columns + [0.0] * ncols)[:ncols]
    known = sum(w for w in widths if w > 0)
    autos = [i for i, w in enumerate(widths) if w <= 0]
    if autos:
        share = max(30.0, (avail - known) / len(autos))
        for i in autos:
            widths[i] = share
    total = sum(widths)
    if total > avail:
        widths = [w * avail / total for w in widths]
    nrows = len(rows)
    t_elem = Elem("Table", parent)
    tr_elems = [Elem("TR", t_elem) for _ in rows]
    header_rows = 0
    for r, row in enumerate(rows):
        cells = row.get("cells") or []
        if cells and all(c.get("header") for c in cells):
            header_rows += 1
        else:
            break
    data: list[list] = [["" for _ in range(ncols)] for _ in range(nrows)]
    cmds: list[tuple] = [("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("VALIGN", (0, 0), (-1, -1), "TOP")]
    owner: dict[tuple[int, int], int] = {}
    default_line = LOOK_LINE.get(look)
    edges: dict[tuple, tuple[float, str, str]] = {}
    for idx, (r, c, rs, cs, cell) in enumerate(placements):
        for dr in range(rs):
            for dc in range(cs):
                owner[(r + dr, c + dc)] = idx
    for r in range(nrows + 1):
        for c in range(ncols):
            if look == "rows":
                edges[("h", r, c)] = (0.5, "#c4c4c4", "solid")
            elif default_line:
                edges[("h", r, c)] = (*default_line, "solid")
    for r in range(nrows):
        for c in range(ncols + 1):
            if default_line:
                edges[("v", r, c)] = (*default_line, "solid")
    if look == "rows" and header_rows:
        for c in range(ncols):
            edges[("h", header_rows, c)] = (1.5, "#4a4a4a", "solid")
    for r, c, rs, cs, cell in placements:
        header = bool(cell.get("header"))
        span_w = sum(widths[c:c + cs])
        text_color = "#ffffff" if look == "accent" and header else None
        td = Elem("TH" if header else "TD", tr_elems[r])
        flows = cell_flowables(ctx, cell.get("body") or [], max(10.0, span_w - 10), td, header, text_color)
        data[r][c] = flows or ""
        shade = cell.get("shading")
        if not shade:
            if header and look in ("grid", "banded"):
                shade = "#f1f2f4"
            elif header and look == "accent":
                shade = ctx.accent
            elif look == "banded" and not header and r % 2 == 1:
                shade = "#f3f5f8"
        if shade:
            cmds.append(("BACKGROUND", (c, r), (c + cs - 1, r + rs - 1), color(shade)))
        if cell.get("valign") in ("middle", "bottom"):
            cmds.append(("VALIGN", (c, r), (c + cs - 1, r + rs - 1), "MIDDLE" if cell["valign"] == "middle" else "BOTTOM"))
        if cs > 1 or rs > 1:
            cmds.append(("SPAN", (c, r), (c + cs - 1, r + rs - 1)))
        for side, spec in (cell.get("borders") or {}).items():
            if not isinstance(spec, dict):
                continue
            style = str(spec.get("style") or "solid")
            keys = []
            if side == "top":
                keys = [("h", r, c + k) for k in range(cs)]
            elif side == "bottom":
                keys = [("h", r + rs, c + k) for k in range(cs)]
            elif side == "left":
                keys = [("v", r + k, c) for k in range(rs)]
            elif side == "right":
                keys = [("v", r + k, c + cs) for k in range(rs)]
            for key in keys:
                if style == "none":
                    edges.pop(key, None)
                else:
                    edges[key] = (float(spec.get("width") or 0.5), str(spec.get("color") or "#000000"), style)
    for key, (w, col, style) in edges.items():
        kind, r, c = key
        if kind == "h":
            if 0 < r < nrows and owner.get((r - 1, c)) == owner.get((r, c)):
                continue
            pos = (c, r) if r < nrows else (c, nrows - 1)
            name = "LINEABOVE" if r < nrows else "LINEBELOW"
        else:
            if 0 < c < ncols and owner.get((r, c - 1)) == owner.get((r, c)):
                continue
            pos = (c, r) if c < ncols else (ncols - 1, r)
            name = "LINEBEFORE" if c < ncols else "LINEAFTER"
        weight = w * 3 if style == "double" else w
        dash = (3, 2) if style == "dashed" else (1, 2) if style == "dotted" else None
        cmds.append((name, pos, pos, weight, color(col), 0, dash))
    table = Table(data, colWidths=widths, style=cmds, repeatRows=header_rows if block.get("repeatHeader") else 0, splitByRow=1, splitInRow=1,
                  hAlign="CENTER" if block.get("align") == "center" else "LEFT")
    table.spaceBefore, table.spaceAfter = 2, 8
    return [table]


def chart_blocks(ctx: Ctx, block: dict, avail: float, parent: Elem) -> list[Flowable]:
    ctx.last_list_parent = None
    flow = chart_flowable(block, avail, CHART_COLORS)
    if flow is None and block.get("id") and ctx.drawing("blocks", str(block["id"])):
        return figure_image(ctx, block, avail, parent, f"{block.get('kind')} chart: {block.get('title') or ''}".strip())
    if flow is None:
        ctx.warn(f"A {block.get('kind')} chart is written as a caption only; bar, horizontal bar, line, area and donut charts are drawn.")
        data = block.get("data") or {}
        names = ", ".join(str(s.get("name", "")) for s in data.get("series") or [])
        st = ParagraphStyle("cap", fontName=ctx.base_family.faces["regular"], fontSize=9, textColor=HexColor("#5a5a5a"), spaceAfter=8)
        flow = Paragraph(escape(f"Chart: {block.get('title') or block.get('kind')} ({names})"), st)
        return [Tagged(flow, Elem("P", parent), None)]
    alt = f"{block.get('kind')} chart: {block.get('title') or ''}".strip()
    cats = (block.get("data") or {}).get("categories") or []
    if cats:
        alt += f". Categories: {', '.join(str(c) for c in cats[:12])}"
    flow.hAlign = {"left": "LEFT", "right": "RIGHT"}.get(str(block.get("align") or ""), "CENTER")
    tagged = Tagged(flow, Elem("Figure", parent, alt), None)
    tagged.space = (4, 10)
    return [tagged]


def shape_key(r: dict) -> str:
    fx = lambda v: f"{float(v or 0):.2f}"
    return json.dumps([str(r.get("kind") or ""), fx(r.get("width")), fx(r.get("height")), fx(r.get("x")), fx(r.get("y")), str(r.get("path") or ""), str(r.get("text") or "")], separators=(",", ":"), ensure_ascii=False)


def figure_image(ctx: Ctx, block: dict, avail: float, parent: Elem, alt: str) -> list[Flowable]:
    ctx.last_list_parent = None
    path, pw, ph = ctx.drawing("blocks", str(block["id"]))
    natural = pw * 0.375
    width = float(block.get("width") or 0) or natural
    width = min(avail, width)
    img = Image(path, width, width * ph / max(pw, 1))
    img.hAlign = {"left": "LEFT", "right": "RIGHT"}.get(str(block.get("align") or ""), "CENTER")
    tagged = Tagged(img, Elem("Figure", parent, alt), None)
    tagged.space = (4, 10)
    return [tagged]


def blocks_flowables(ctx: Ctx, body: list, avail: float, parent: Elem, top: bool = True, header: bool = False, text_color: str | None = None) -> list[Flowable]:
    out: list[Flowable] = []
    for block in body:
        if not isinstance(block, dict):
            continue
        t = block.get("type")
        if t == "paragraph":
            if header or text_color:
                block = {**block, "content": [{**r, "marks": {**(r.get("marks") or {}), **({"bold": True} if header else {}), **({"color": text_color} if text_color and not (r.get("marks") or {}).get("color") else {})}} if r.get("type") == "text" else r for r in block.get("content") or []]}
            out.extend(paragraph_flowables(ctx, block, avail, parent, top))
        elif t == "code":
            out.extend(code_flowables(ctx, block, avail, parent))
        elif t == "table":
            out.extend(table_flowable(ctx, block, avail, parent))
        elif t == "chart":
            out.extend(chart_blocks(ctx, block, avail, parent))
        elif t in ("mermaid", "diagram") and block.get("id") and ctx.drawing("blocks", str(block["id"])):
            out.extend(figure_image(ctx, block, avail, parent, str(block.get("alt") or (f"Diagram ({block.get('layout')})" if t == "diagram" else "Mermaid diagram"))))
        elif t in ("mermaid", "diagram"):
            ctx.warn("Mermaid drawings and IntelligentArt diagrams are drawn when the PDF is exported from the open window; otherwise a caption stands in.")
            label = block.get("alt") or (f"Diagram: {block.get('code', '')[:60]}" if t == "mermaid" else f"Diagram ({block.get('layout')})")
            st = ParagraphStyle("cap", fontName=ctx.base_family.faces["regular"], fontSize=9, textColor=HexColor("#5a5a5a"), spaceAfter=8)
            out.append(Tagged(Paragraph(escape(str(label)), st), Elem("P", parent), None))
        elif t in ("pageBreak", "columnBreak", "sectionBreak"):
            out.append(block)
        else:
            ctx.warn(f"Blocks of type {t} are not written to the PDF.")
    return out


def geometry(sec: dict) -> dict:
    page, m = sec["page"], sec["margins"]
    w, h = float(page["width"]), float(page["height"])
    return {"w": w, "h": h, "top": float(m.get("top", 72)), "bottom": float(m.get("bottom", 72)), "left": float(m.get("left", 72)) + float(m.get("gutter", 0)),
            "right": float(m.get("right", 72)), "cols": max(1, min(4, int((sec.get("columns") or {}).get("count") or 1))), "gap": float((sec.get("columns") or {}).get("gap") or 36)}


def same_geometry(a: dict, b: dict) -> bool:
    return geometry(a) == geometry(b)


class Builder:
    def __init__(self, doc: dict, media: dict[str, bytes], tmp: Path, tagged: bool) -> None:
        self.doc = doc
        self.ctx = Ctx(doc, media, tmp)
        self.tagged = tagged
        self.sections = doc["sections"]
        self.by_id = {s["id"]: s for s in self.sections}
        self.settings = doc.get("settings") or {}
        self.total = 1
        self.pages: dict[int, tuple[int, str, int, bool]] = {}
        self.outline_last = 0

    def story(self) -> tuple[list, Elem]:
        root = Elem("Document")
        story: list = []
        current = self.sections[0]
        self.ctx.counters = [0] * 9
        flat = []
        for tab in self.doc.get("tabs") or []:
            flat.extend(tab.get("body") or [])
        group: list = []

        def flush() -> None:
            if group:
                geo = geometry(current)
                avail = (geo["w"] - geo["left"] - geo["right"] - geo["gap"] * (geo["cols"] - 1)) / geo["cols"]
                self.ctx.max_h = max(36.0, (geo["h"] - geo["top"] - geo["bottom"]) * 0.9)
                story.extend(blocks_flowables(self.ctx, list(group), avail, root))
                group.clear()

        for block in flat:
            t = block.get("type") if isinstance(block, dict) else None
            if t in ("pageBreak", "columnBreak", "sectionBreak"):
                flush()
                geo = geometry(current)
                if t == "pageBreak":
                    story.append(PageBreak())
                elif t == "columnBreak":
                    story.append(FrameBreak() if geo["cols"] > 1 else PageBreak())
                else:
                    nxt = self.by_id.get(str(block.get("next")))
                    if nxt is None:
                        continue
                    start = str(nxt.get("start") or "nextPage")
                    if start == "continuous" and same_geometry(current, nxt):
                        current = nxt
                        story.append(NextPageTemplate(nxt["id"]))
                        continue
                    if start == "continuous":
                        self.ctx.warn("A continuous section break that changes page layout starts a new page in the PDF.")
                    story.append(NextPageTemplate(nxt["id"]))
                    story.append(PageBreak())
                    if start in ("oddPage", "evenPage"):
                        story.append(ParityBreak(start == "oddPage"))
                    current = nxt
                continue
            group.append(block)
        flush()
        if not story:
            story.append(Spacer(1, 1))
        return story, root

    def header_text(self, sec: dict, which: str, where: str) -> dict | None:
        spec = (sec.get(where) or {}).get(which)
        if isinstance(spec, dict) and spec.get("text"):
            return spec
        return None

    def fill(self, text: str, num: int, fmt: str) -> str:
        return text.replace("{PAGE}", number_text(num, fmt)).replace("{NUMPAGES}", str(self.total))

    def on_page(self, sec: dict):
        geo = geometry(sec)

        def draw(canv, _doc) -> None:
            physical = canv.getPageNumber()
            prev = self.pages.get(physical - 1)
            first = prev is None or prev[1] != sec["id"]
            if prev is None:
                num = int(sec.get("pageNumberStart") or 1)
            elif first and isinstance(sec.get("pageNumberStart"), int):
                num = int(sec["pageNumberStart"])
            else:
                num = prev[0] + 1
            self.pages[physical] = (num, sec["id"], 0, first)
            fmt = str(sec.get("pageNumberFormat") or "decimal")
            which = "first" if first and sec.get("titlePage") else "even" if self.settings.get("evenOdd") and num % 2 == 0 else "default"
            artifact_begin(canv)
            if sec.get("pageColor") and str(sec["pageColor"]).lower() not in ("#ffffff", "#fff"):
                canv.setFillColor(color(sec["pageColor"]))
                canv.rect(0, 0, geo["w"], geo["h"], stroke=0, fill=1)
            border = sec.get("pageBorder")
            if border:
                canv.saveState()
                canv.setStrokeColor(color("#f97316" if border == "accent" else "#6b6b6b"))
                canv.setLineWidth(3 if border == "double" else 1.5 if border == "accent" else 0.75)
                canv.rect(18, 18, geo["w"] - 36, geo["h"] - 36, stroke=1, fill=0)
                canv.restoreState()
            mark = str(self.settings.get("watermark") or "")
            if mark:
                canv.saveState()
                canv.setFillColor(Color(0, 0, 0, alpha=0.07))
                canv.setFont(self.ctx.base_family.faces["bold"], 80)
                canv.translate(geo["w"] / 2, geo["h"] / 2)
                canv.rotate(35)
                canv.drawCentredString(0, -28, mark)
                canv.restoreState()
            face = self.ctx.base_family.faces["regular"]
            canv.setFillColor(color("#5f5c55"))
            canv.setFont(face, 9)
            hd = self.header_text(sec, which, "headers")
            ft = self.header_text(sec, which, "footers")
            m = sec["margins"]
            for spec, top in ((hd, True), (ft, False)):
                if not spec:
                    continue
                lines = self.fill(str(spec["text"]), num, fmt).split("\n")
                align = str(spec.get("align") or ("left" if top else "center"))
                for i, line in enumerate(lines):
                    y = geo["h"] - float(m.get("header", 36)) - 9 - i * 12 if top else float(m.get("footer", 36)) + 3 + (len(lines) - 1 - i) * 12
                    text = line if self.ctx.base_family.bundled else line.encode("cp1252", "replace").decode("cp1252")
                    if align == "right":
                        canv.drawRightString(geo["w"] - geo["right"], y, text)
                    elif align == "center":
                        canv.drawCentredString(geo["left"] + (geo["w"] - geo["left"] - geo["right"]) / 2, y, text)
                    else:
                        canv.drawString(geo["left"], y, text)
            artifact_end(canv)

        return draw

    def build(self, title: str) -> tuple[bytes, Elem]:
        buf = io.BytesIO()
        meta = self.doc.get("meta") or {}
        keywords = meta.get("keywords") or []
        doc = BaseDocTemplate(buf, pagesize=(612, 792), title=title, author=str(meta.get("author") or ""), subject=str(meta.get("subject") or ""),
                              keywords=", ".join(keywords) if isinstance(keywords, list) else str(keywords), creator="FormTxt", producer="FormTxt (ReportLab)",
                              leftMargin=0, rightMargin=0, topMargin=0, bottomMargin=0)
        for sec in self.sections:
            geo = geometry(sec)
            width = (geo["w"] - geo["left"] - geo["right"] - geo["gap"] * (geo["cols"] - 1)) / geo["cols"]
            frames = [Frame(geo["left"] + i * (width + geo["gap"]), geo["bottom"], width, geo["h"] - geo["top"] - geo["bottom"],
                            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id=f"{sec['id']}-{i}") for i in range(geo["cols"])]
            doc.addPageTemplates(PageTemplate(id=sec["id"], frames=frames, onPage=self.on_page(sec), pagesize=(geo["w"], geo["h"])))
        story, root = self.story()
        builder = self

        def after(flowable) -> None:
            outline = getattr(flowable, "outline", None)
            if outline and builder.tagged:
                text, level = outline
                level = max(1, min(level, builder.outline_last + 1))
                key = f"h{id(flowable)}"
                doc.canv.bookmarkPage(key)
                doc.canv.addOutlineEntry(text[:200], key, level - 1, closed=False)
                builder.outline_last = level

        doc.afterFlowable = after
        self.outline_last = 0
        self.pages = {}
        doc.build(story)
        self.total = doc.page
        return buf.getvalue(), root


def render(doc: dict, media: dict[str, bytes], tagged: bool = True) -> tuple[bytes, dict]:
    tmp = Path(tempfile.mkdtemp(prefix="ftxt-pdf-"))
    try:
        title = str(doc.get("title") or "Document")
        needs_total = "{NUMPAGES}" in repr([s.get("headers") for s in doc["sections"]]) + repr([s.get("footers") for s in doc["sections"]])
        builder = Builder(doc, media, tmp, tagged)
        data, root = builder.build(title)
        if needs_total:
            builder = Builder(doc, media, tmp, tagged)
            builder.total = 1
            builder.total = len(PdfReader(io.BytesIO(data)).pages)
            data, root = builder.build(title)
        stats = {"elements": 0, "headings": builder.ctx.headings}
        if tagged:
            data, stats = write_structure(data, root, title, str((doc.get("meta") or {}).get("language") or "en-US"), builder.ctx.headings)
        info = {"pages": builder.total, "warnings": builder.ctx.warnings, "tagged": stats, "bytes": len(data)}
        return data, info
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
