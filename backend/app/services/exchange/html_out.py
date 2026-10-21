import base64
import re
from collections.abc import Callable
from xml.sax.saxutils import escape, quoteattr

from lxml import etree

from app.services.exchange import common

LIST_STYLE = {"decimal": "decimal", "decimal-leading-zero": "decimal-leading-zero", "lower-alpha": "lower-alpha", "upper-alpha": "upper-alpha",
              "lower-roman": "lower-roman", "upper-roman": "upper-roman"}
OL_TYPE = {"decimal": "1", "lower-alpha": "a", "upper-alpha": "A", "lower-roman": "i", "upper-roman": "I"}
BORDER = {"solid": "solid", "dashed": "dashed", "dotted": "dotted", "double": "double", "none": "none"}


def esc(text: str) -> str:
    return escape(str(text), {'"': "&quot;"})


def css_of(run: dict, para: dict) -> str:
    out = []
    if run.get("font"):
        out.append(f"font-family:'{run['font']}',sans-serif")
    if run.get("size"):
        out.append(f"font-size:{run['size']:g}pt")
    if run.get("color"):
        out.append(f"color:{run['color']}")
    if run.get("bold"):
        out.append("font-weight:700")
    if run.get("italic"):
        out.append("font-style:italic")
    if run.get("underline"):
        out.append("text-decoration:underline")
    if run.get("smallCaps"):
        out.append("font-variant:small-caps")
    if run.get("allCaps"):
        out.append("text-transform:uppercase")
    if para.get("spaceBefore") is not None:
        out.append(f"margin-top:{para['spaceBefore']:g}pt")
    if para.get("spaceAfter") is not None:
        out.append(f"margin-bottom:{para['spaceAfter']:g}pt")
    if para.get("lineSpacing"):
        out.append(f"line-height:{para['lineSpacing']:g}")
    if para.get("align"):
        out.append(f"text-align:{para['align']}")
    left = para.get("indentLeft", para.get("indent"))
    if left is not None:
        out.append(f"margin-left:{left:g}pt")
    if para.get("indentRight") is not None:
        out.append(f"margin-right:{para['indentRight']:g}pt")
    if para.get("indentFirst") is not None:
        out.append(f"text-indent:{para['indentFirst']:g}pt")
    if para.get("shading"):
        out.append(f"background:{para['shading']}")
    border = para.get("border")
    if border:
        out.append("border:0.75pt solid #808080" if border == "box" else f"border-{border}:0.75pt solid #808080")
    if para.get("keepNext") or para.get("keepWithNext"):
        out.append("break-after:avoid")
    return ";".join(out)


class Html:
    def __init__(self, doc: dict, media: dict[str, bytes], image_src: Callable[[str], str | None] | None = None) -> None:
        self.doc = doc
        self.media = media
        self.styles = doc.get("styles") or {}
        self.image_src = image_src or self.data_uri
        self.counter = common.ListCounter()
        self.fn: list[tuple[str, list]] = []
        self.notes = doc.get("notes") or {}
        self.collect = False
        self.anchors: list[tuple[int, str, str]] = []

    def data_uri(self, name: str) -> str | None:
        data = self.media.get(name)
        if data is None:
            return None
        kind = common.sniff(data)
        mime = kind[1] if kind else "application/octet-stream"
        return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"

    def inline(self, runs: list[dict]) -> str:
        return "".join(self.run(r) for r in runs or [])

    def run(self, r: dict) -> str:
        kind = r.get("type")
        if kind == "text":
            return self.text(r)
        if kind == "tab":
            return '<span class="tab" style="display:inline-block;width:36pt"></span>'
        if kind == "break":
            return "<br/>"
        if kind == "image":
            return self.image(r)
        if kind == "math":
            tag = "div" if r.get("display") else "span"
            return f'<{tag} class="math" data-latex={quoteattr(str(r.get("latex", "")))} style="font-family:serif;font-style:italic"><code>{esc(r.get("latex", ""))}</code></{tag}>'
        if kind == "field":
            return esc(r.get("result", ""))
        if kind == "chip":
            label = esc(r.get("text") or r.get("value") or r.get("name") or "")
            return f'<span class="chip" data-chip={quoteattr(str(r.get("kind", "")))} style="background:#e8e8e8;border-radius:9pt;padding:0 5pt">{label}</span>'
        if kind == "shape":
            text = r.get("text") or common.plain([x for blk in (r.get("content") or []) for x in (blk.get("content") or [])])
            return f'<span class="shape">{esc(text)}</span>' if text else ""
        if kind in ("footnote", "noteRef", "footnoteRef", "endnote"):
            return self.note_ref(r)
        return ""

    def note_ref(self, r: dict) -> str:
        nid = str(r.get("id") or "")
        self.fn.append((nid, str(r.get("note") or "")))
        n = len(self.fn)
        return f'<sup><a id="fnref{n}" href="#fn{n}">{n}</a></sup>'

    def text(self, r: dict) -> str:
        m = r.get("marks") or {}
        out = esc(r.get("text", ""))
        css = []
        if m.get("font"):
            css.append(f"font-family:'{m['font']}'")
        if m.get("size"):
            css.append(f"font-size:{m['size']:g}pt")
        if m.get("color"):
            css.append(f"color:{m['color']}")
        if m.get("highlight"):
            css.append(f"background:{m['highlight']}")
        if m.get("spacing"):
            css.append(f"letter-spacing:{m['spacing']:g}pt")
        if m.get("smallCaps"):
            css.append("font-variant:small-caps")
        if m.get("allCaps"):
            css.append("text-transform:uppercase")
        u = m.get("underline")
        if u and u is not True and u != "single":
            css.append("text-decoration:underline " + {"double": "double", "dotted": "dotted", "dash": "dashed", "wavy": "wavy"}.get(u, "solid"))
        if css:
            out = f'<span style="{";".join(css)}">{out}</span>'
        if m.get("code"):
            out = f'<code style="font-family:Consolas,monospace">{out}</code>'
        if m.get("superscript"):
            out = f"<sup>{out}</sup>"
        if m.get("subscript"):
            out = f"<sub>{out}</sub>"
        if m.get("strike"):
            out = f"<s>{out}</s>"
        if u and (u is True or u == "single"):
            out = f"<u>{out}</u>"
        if m.get("italic"):
            out = f"<i>{out}</i>"
        if m.get("bold"):
            out = f"<b>{out}</b>"
        if m.get("link"):
            out = f'<a href={quoteattr(str(m["link"]))}>{out}</a>'
        return out

    def image(self, r: dict) -> str:
        src = self.image_src(str(r.get("media")))
        if not src:
            return ""
        css = [f"width:{float(r.get('width', 100)):g}pt", f"height:{float(r.get('height', 100)):g}pt"]
        if r.get("rotate"):
            css.append(f"transform:rotate({r['rotate']:g}deg)")
        if r.get("border"):
            css.append(f"border:{r.get('borderWidth', 1):g}pt solid {r['border']}")
        if r.get("radius"):
            css.append(f"border-radius:{r['radius']:g}pt")
        crop = r.get("crop") or {}
        if any(crop.get(k) for k in "trbl"):
            css.append("object-fit:none")
        return f'<img src={quoteattr(src)} alt={quoteattr(str(r.get("alt") or ""))} style="{";".join(css)}"/>'

    def para_tag(self, b: dict) -> tuple[str, str]:
        style = b.get("style") or "Normal"
        run, para = common.resolved(self.styles, style)
        props = dict(b.get("props") or {})
        para = {**para, **props}
        tag = "p"
        if style.startswith("Heading") and style[7:].isdigit():
            tag = f"h{min(6, int(style[7:]))}"
        elif style == "Title":
            tag = "h1"
        css = css_of(run, para)
        attrs = f' style="{css}"' if css else ""
        if style != "Normal":
            attrs += f" data-style={quoteattr(style)}"
        return tag, attrs

    def blocks(self, blocks: list[dict], section: str = "") -> str:
        out: list[str] = []
        stack: list[str] = []

        def close_to(depth: int) -> None:
            while len(stack) > depth:
                out.append(f"</li></{stack.pop()}>")

        for b in blocks:
            kind = b.get("type")
            if kind == "paragraph" and b.get("list"):
                self.item(b, out, stack, close_to)
                continue
            close_to(0)
            self.counter.reset()
            out.append(self.block(b, section))
        close_to(0)
        return "".join(out)

    def item(self, b: dict, out: list[str], stack: list[str], close_to: Callable[[int], None]) -> None:
        lst = b["list"]
        level = min(int(lst.get("level", 0) or 0), 8)
        kind = lst.get("kind", "bullet")
        tag = "ol" if kind == "number" else "ul"
        close_to(level + 1)
        if len(stack) == level + 1:
            if stack[-1] != tag or (tag == "ol" and lst.get("start") is not None):
                out.append(f"</li></{stack.pop()}>")
            else:
                out.append("</li>")
        while len(stack) < level + 1:
            stack.append(tag)
            lv = len(stack) - 1
            if tag == "ol":
                fmt = common.list_format(lst, lv)
                start = f' start="{lst["start"]}"' if lst.get("start") not in (None, 1) else ""
                out.append(f'<ol type="{OL_TYPE.get(fmt, "1")}" style="list-style-type:{LIST_STYLE.get(fmt, "decimal")}"{start}>')
            elif kind == "check":
                out.append('<ul style="list-style:none;padding-left:18pt">')
            else:
                bullet = lst.get("bullet")
                css = f"list-style-type:'{bullet} '" if bullet else ""
                out.append(f'<ul style="{css}">' if css else "<ul>")
        _, attrs = self.para_tag(b)
        inner = self.inline(b.get("content") or [])
        mark = ""
        extra = ""
        if kind == "check":
            checked = bool(lst.get("checked"))
            mark = (chr(0x2611) if checked else chr(0x2610)) + " "
            extra = f' data-check="{"1" if checked else "0"}" style="list-style:none"'
            attrs = ""
        if kind == "number" and lst.get("start") not in (None, 1):
            extra += f' value="{lst["start"]}"'
        out.append(f"<li{extra}{attrs}>{mark}{inner}")

    def block(self, b: dict, section: str) -> str:
        kind = b.get("type")
        if kind == "paragraph":
            tag, attrs = self.para_tag(b)
            inner = self.inline(b.get("content") or [])
            if self.collect and re.fullmatch(r"h[1-6]", tag):
                aid = f"h{len(self.anchors) + 1}"
                self.anchors.append((int(tag[1]), common.plain(b.get("content")).strip() or "Untitled", aid))
                attrs += f' id="{aid}"'
            return f"<{tag}{attrs}>{inner or '<br/>'}</{tag}>"
        if kind == "code":
            return f'<pre style="font-family:Consolas,monospace;font-size:10pt;background:#f2f2f2;padding:6pt;white-space:pre-wrap">{esc(b.get("text", ""))}</pre>'
        if kind == "pageBreak":
            return '<div class="page-break" style="break-after:page"></div>'
        if kind == "columnBreak":
            return '<div class="column-break" style="break-after:column"></div>'
        if kind == "sectionBreak":
            return '<div class="section-break" style="break-after:page"></div>'
        if kind == "table":
            return self.table(b)
        if kind == "mermaid":
            svg = str(b.get("svg") or "")
            if svg:
                try:
                    etree.fromstring(svg.encode("utf-8"))
                    return f'<div class="mermaid" style="text-align:center">{svg}</div>'
                except etree.XMLSyntaxError:
                    pass
            return f'<pre class="mermaid-source">{esc(b.get("code", ""))}</pre>'
        if kind in ("chart", "diagram"):
            return self.blocks(common.degrade(b, section), section)
        return ""

    def table(self, b: dict) -> str:
        look = b.get("look") or "grid"
        cols = b.get("columns") or []
        width = sum(float(w or 0) for w in cols)
        css = "border-collapse:collapse" + (f";width:{width:g}pt" if width and all(cols) else "")
        if b.get("align") == "center":
            css += ";margin-left:auto;margin-right:auto"
        out = [f'<table style="{css}">']
        if cols and all(cols):
            out.append("<colgroup>" + "".join(f'<col style="width:{float(w):g}pt"/>' for w in cols) + "</colgroup>")
        rows = b.get("rows") or []
        head_rows = 0
        for row in rows:
            cells = row.get("cells") or []
            if cells and all(c.get("header") for c in cells):
                head_rows += 1
            else:
                break
        for ri, row in enumerate(rows):
            out.append("<tr>")
            for c in row.get("cells") or []:
                tag = "th" if c.get("header") else "td"
                attrs = ""
                if c.get("colspan", 1) > 1:
                    attrs += f' colspan="{c["colspan"]}"'
                if c.get("rowspan", 1) > 1:
                    attrs += f' rowspan="{c["rowspan"]}"'
                css = ["padding:3pt 5pt", "vertical-align:" + {"middle": "middle", "bottom": "bottom"}.get(c.get("valign"), "top")]
                if look == "grid" or look == "accent":
                    css.append("border:0.75pt solid #808080")
                elif look in ("rows", "banded"):
                    css.append("border-bottom:0.75pt solid #808080")
                fill = c.get("shading") or ("#dbe5f1" if look == "accent" and c.get("header") else "#f3f3f3" if look == "banded" and ri % 2 == 0 and ri >= head_rows and ri > 0 else "")
                if fill:
                    css.append(f"background:{fill}")
                for side, spec in (c.get("borders") or {}).items():
                    css.append(f"border-{side}:{spec.get('width', 0.5):g}pt {BORDER.get(spec.get('style', 'solid'), 'solid')} {spec.get('color', '#000000')}" if spec.get("style") != "none" else f"border-{side}:none")
                if tag == "th":
                    css.append("text-align:left")
                out.append(f'<{tag}{attrs} style="{";".join(css)}">{self.blocks(c.get("body") or []) or "<br/>"}</{tag}>')
            out.append("</tr>")
        out.append("</table>")
        return "".join(out)

    def footnotes(self) -> str:
        if not self.fn:
            return ""
        items = []
        for i, (nid, body) in enumerate(self.fn, start=1):
            inner = esc(body)
            items.append(f'<li id="fn{i}">{inner} <a href="#fnref{i}">Back</a></li>')
        return '<hr/><ol class="footnotes" style="font-size:9pt">' + "".join(items) + "</ol>"


def page_css(doc: dict) -> str:
    sec = (doc.get("sections") or [{}])[0]
    page = sec.get("page") or {}
    m = sec.get("margins") or {}
    return (f"@page{{size:{page.get('width', 612):g}pt {page.get('height', 792):g}pt;margin:{m.get('top', 72):g}pt {m.get('right', 72):g}pt "
            f"{m.get('bottom', 72):g}pt {m.get('left', 72):g}pt}}")


def body_css(doc: dict) -> str:
    run, para = common.resolved(doc.get("styles") or {}, "Normal")
    sec = (doc.get("sections") or [{}])[0]
    page = sec.get("page") or {}
    m = sec.get("margins") or {}
    inner = float(page.get("width", 612)) - float(m.get("left", 72)) - float(m.get("right", 72))
    css = css_of(run, {k: v for k, v in para.items() if k in ("lineSpacing",)})
    return f"{css};max-width:{inner:g}pt;margin:24pt auto;padding:0 12pt"


def build(doc: dict, media: dict[str, bytes]) -> bytes:
    h = Html(doc, media)
    parts = []
    tabs = common.doc_tabs(doc)
    for i, tab in enumerate(tabs):
        if len(tabs) > 1:
            parts.append(f'<section data-tab={quoteattr(str(tab.get("id", "")))}><h1 class="tab-title">{esc(tab.get("title", ""))}</h1>{h.blocks(tab.get("body") or [])}</section>')
        else:
            parts.append(h.blocks(tab.get("body") or []))
    body = "".join(parts) + h.footnotes()
    meta = doc.get("meta") or {}
    kw = meta.get("keywords")
    head = [f"<title>{esc(doc.get('title', ''))}</title>", '<meta charset="utf-8"/>', '<meta name="viewport" content="width=device-width,initial-scale=1"/>']
    if meta.get("author"):
        head.append(f'<meta name="author" content={quoteattr(str(meta["author"]))}/>')
    if meta.get("subject"):
        head.append(f'<meta name="description" content={quoteattr(str(meta["subject"]))}/>')
    if kw:
        head.append(f'<meta name="keywords" content={quoteattr(", ".join(kw) if isinstance(kw, list) else str(kw))}/>')
    head.append('<meta name="generator" content="FormTxt"/>')
    head.append(f"<style>{page_css(doc)}p,h1,h2,h3,h4,h5,h6{{margin:0 0 8pt}}table{{margin:0 0 8pt}}img{{max-width:100%}}</style>")
    lang = esc(meta.get("language") or "en")
    html = f'<!DOCTYPE html>\n<html lang="{lang}"><head>{"".join(head)}</head><body style="{body_css(doc)}">{body}</body></html>\n'
    return html.encode("utf-8")
