import io
import re
import time
import zipfile
from xml.sax.saxutils import escape, quoteattr

from app.services.exchange import common

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0", "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0", "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "draw": "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0", "fo": "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
    "xlink": "http://www.w3.org/1999/xlink", "dc": "http://purl.org/dc/elements/1.1/", "meta": "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
    "svg": "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0", "manifest": "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0",
}
DECL = " ".join(f'xmlns:{k}="{v}"' for k, v in NS.items())
NUMFMT = {"decimal": "1", "decimal-leading-zero": "01", "lower-alpha": "a", "upper-alpha": "A", "lower-roman": "i", "upper-roman": "I"}
UNDERLINE = {True: ("solid", "single"), "single": ("solid", "single"), "double": ("solid", "double"), "dotted": ("dotted", "single"), "dash": ("dash", "single"), "wavy": ("wave", "single")}
BORDER = {"solid": "solid", "dashed": "dashed", "dotted": "dotted", "double": "double", "none": "none"}


def pt(v: float) -> str:
    return f"{float(v):.2f}pt"


def text_xml(text: str) -> str:
    out = []
    for i, part in enumerate(text.split("\n")):
        if i:
            out.append("<text:line-break/>")
        for j, seg in enumerate(part.split("\t")):
            if j:
                out.append("<text:tab/>")
            out.append(spaces(escape(seg)))
    return "".join(out)


def spaces(s: str) -> str:
    def sub(m: re.Match) -> str:
        n = len(m.group())
        if m.start() == 0 or m.end() == len(s):
            return f'<text:s text:c="{n}"/>'
        return " " if n == 1 else f' <text:s text:c="{n - 1}"/>'
    return re.sub(r" +", sub, s)


class Odt:
    def __init__(self, doc: dict, media: dict[str, bytes]) -> None:
        self.doc = doc
        self.media = media
        self.styles = doc.get("styles") or {}
        self.sections = list(doc.get("sections") or [])
        self.auto: list[str] = []
        self.cache: dict[str, str] = {}
        self.counts = {"P": 0, "T": 0, "L": 0, "Tbl": 0, "C": 0, "fr": 0, "ftn": 0}
        self.pictures: dict[str, str] = {}
        self.pending_break = ""
        self.pending_master = ""
        self.pending_pgnum: int | None = None
        self.master_for: dict[str, str] = {}
        self.sec_index = 0
        self.styles_auto = ""

    def new(self, prefix: str) -> str:
        self.counts[prefix] += 1
        return f"{prefix}{self.counts[prefix]}"

    def auto_style(self, key: str, prefix: str, xml: str) -> str:
        if key in self.cache:
            return self.cache[key]
        name = self.new(prefix)
        self.cache[key] = name
        self.auto.append(xml.replace("@NAME@", name))
        return name

    def text_props(self, m: dict) -> str:
        a = []
        if m.get("font"):
            a.append(f'fo:font-family={quoteattr(str(m["font"]))} style:font-family-generic="system"')
        elif m.get("code"):
            a.append('fo:font-family="Consolas"')
        if m.get("size"):
            a.append(f'fo:font-size="{pt(m["size"])}"')
        if m.get("bold"):
            a.append('fo:font-weight="bold"')
        if m.get("italic"):
            a.append('fo:font-style="italic"')
        if m.get("underline"):
            style, kind = UNDERLINE.get(m["underline"], ("solid", "single"))
            a.append(f'style:text-underline-style="{style}" style:text-underline-type="{kind}" style:text-underline-width="auto" style:text-underline-color="font-color"')
        if m.get("strike"):
            a.append('style:text-line-through-style="solid" style:text-line-through-type="single"')
        if m.get("superscript"):
            a.append('style:text-position="super 58%"')
        elif m.get("subscript"):
            a.append('style:text-position="sub 58%"')
        if m.get("smallCaps"):
            a.append('fo:font-variant="small-caps"')
        if m.get("allCaps"):
            a.append('fo:text-transform="uppercase"')
        if m.get("color"):
            a.append(f'fo:color="{m["color"]}"')
        if m.get("highlight"):
            a.append(f'fo:background-color="{m["highlight"]}"')
        if m.get("spacing"):
            a.append(f'fo:letter-spacing="{pt(m["spacing"])}"')
        return " ".join(a)

    def para_props(self, p: dict, style: bool = False) -> str:
        a = []
        left = p.get("indentLeft", p.get("indent"))
        if p.get("align"):
            a.append(f'fo:text-align="{ {"left": "start", "right": "end", "center": "center", "justify": "justify"}.get(p["align"], "start") }"')
        if left is not None:
            a.append(f'fo:margin-left="{pt(left)}"')
        if p.get("indentRight") is not None:
            a.append(f'fo:margin-right="{pt(p["indentRight"])}"')
        if p.get("indentFirst") is not None:
            a.append(f'fo:text-indent="{pt(p["indentFirst"])}"')
        if p.get("spaceBefore") is not None:
            a.append(f'fo:margin-top="{pt(p["spaceBefore"])}"')
        if p.get("spaceAfter") is not None:
            a.append(f'fo:margin-bottom="{pt(p["spaceAfter"])}"')
        if p.get("lineSpacing"):
            a.append(f'fo:line-height="{int(round(float(p["lineSpacing"]) * 100))}%"')
        if p.get("keepNext") or p.get("keepWithNext"):
            a.append('fo:keep-with-next="always"')
        if p.get("keepLines"):
            a.append('fo:keep-together="always"')
        if p.get("widowControl") is False:
            a.append('fo:orphans="1" fo:widows="1"')
        border = p.get("border")
        if border == "box":
            a.append('fo:border="0.75pt solid #808080" fo:padding="2pt"')
        elif border:
            a.append(f'fo:border-{border}="0.75pt solid #808080"')
        if p.get("shading"):
            a.append(f'fo:background-color="{p["shading"]}"')
        return " ".join(a)

    def tabs_xml(self, p: dict) -> str:
        tabs = p.get("tabs")
        if not tabs:
            return ""
        items = []
        for t in tabs:
            kind = {"center": "center", "right": "right", "decimal": "char"}.get(t.get("align"), "left")
            lead = {"dot": ".", "dash": "-", "underline": "_"}.get(t.get("leader"))
            items.append(f'<style:tab-stop style:position="{pt(t.get("pos", 0))}" style:type="{kind}"' + (f' style:leader-style="solid" style:leader-text={quoteattr(lead)}' if lead else "") + (' style:char="."' if kind == "char" else "") + "/>")
        return "<style:tab-stops>" + "".join(items) + "</style:tab-stops>"

    def named_style(self, sid: str, spec: dict) -> str:
        name = str(spec.get("name") or sid)
        parent = spec.get("basedOn")
        attrs = f'style:name={quoteattr(sid)} style:display-name={quoteattr(name)} style:family="paragraph" style:class="text"'
        if parent and parent != sid and parent in self.styles:
            attrs += f" style:parent-style-name={quoteattr(parent)}"
        nxt = spec.get("next")
        if nxt and nxt in self.styles:
            attrs += f" style:next-style-name={quoteattr(nxt)}"
        para = spec.get("para") or {}
        if para.get("outlineLevel"):
            attrs += f' style:default-outline-level="{int(para["outlineLevel"])}"'
        pp = self.para_props(para, True)
        tp = self.text_props(spec.get("run") or {})
        inner = (f"<style:paragraph-properties {pp}/>" if pp else "") + (f"<style:text-properties {tp}/>" if tp else "")
        return f"<style:style {attrs}>{inner}</style:style>"

    def para_style(self, b: dict, extra: dict | None = None) -> str:
        style = b.get("style") or "Normal"
        props = dict(b.get("props") or {})
        pp = self.para_props(props)
        tabs = self.tabs_xml(props)
        attrs = ""
        if self.pending_break:
            pp += f' fo:break-before="{self.pending_break}"'
            self.pending_break = ""
        if self.pending_master:
            attrs += f" style:master-page-name={quoteattr(self.pending_master)}"
            self.pending_master = ""
        if self.pending_pgnum is not None:
            pp += f' style:page-number="{self.pending_pgnum}"'
            self.pending_pgnum = None
        pp = pp.strip()
        if not pp and not tabs and not attrs and not extra:
            return style
        parent = style if style in self.styles else "Normal"
        extra = extra or {}
        if extra.get("left") is not None:
            pp += f' fo:margin-left="{pt(extra["left"])}" fo:text-indent="{pt(extra["first"])}"'
        key = f"P|{parent}|{pp}|{tabs}|{attrs}"
        return self.auto_style(key, "P", f'<style:style style:name="@NAME@" style:family="paragraph" style:parent-style-name={quoteattr(parent)}{attrs}>'
                               f'<style:paragraph-properties {pp}>{tabs}</style:paragraph-properties></style:style>')

    def span(self, text: str, marks: dict) -> str:
        m = {k: v for k, v in marks.items() if k != "link"}
        tp = self.text_props(m)
        body = text_xml(text)
        if tp:
            name = self.auto_style(f"T|{tp}", "T", f'<style:style style:name="@NAME@" style:family="text"><style:text-properties {tp}/></style:style>')
            body = f"<text:span text:style-name={quoteattr(name)}>{body}</text:span>"
        if marks.get("link"):
            body = f'<text:a xlink:type="simple" xlink:href={quoteattr(str(marks["link"]))}>{body}</text:a>'
        return body

    def inline(self, runs: list[dict]) -> str:
        return "".join(self.run(r) for r in runs or [])

    def run(self, r: dict) -> str:
        kind = r.get("type")
        if kind == "text":
            return self.span(str(r.get("text", "")), r.get("marks") or {})
        if kind == "tab":
            return "<text:tab/>"
        if kind == "break":
            return "<text:line-break/>"
        if kind == "image":
            return self.image(r)
        if kind == "math":
            return self.span(str(r.get("latex", "")), {"italic": True})
        if kind == "field":
            return self.span(str(r.get("result", "")), r.get("marks") or {})
        if kind == "noteRef":
            cls = "endnote" if r.get("kind") == "endnote" else "footnote"
            return (f'<text:note text:id="{self.new("ftn")}" text:note-class="{cls}"><text:note-citation>{escape(str(r.get("text", "")))}</text:note-citation>'
                    f'<text:note-body><text:p>{escape(str(r.get("note") or ""))}</text:p></text:note-body></text:note>')
        if kind in ("chip", "shape"):
            text = r.get("text") or r.get("value") or r.get("name") or ""
            return self.span(str(text), {}) if text else ""
        return ""

    def image(self, r: dict) -> str:
        name = str(r.get("media"))
        data = self.media.get(name)
        if data is None:
            return ""
        kind = common.sniff(data)
        if kind is None:
            return ""
        self.pictures[name] = data
        fr = self.new("fr")
        alt = f"<svg:title>{escape(str(r.get('alt')))}</svg:title>" if r.get("alt") else ""
        style = self.auto_style("G|inline", "C", '<style:style style:name="@NAME@" style:family="graphic"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" style:horizontal-pos="center" style:horizontal-rel="paragraph" style:wrap="none"/></style:style>')
        return (f'<draw:frame draw:style-name="{style}" draw:name="{fr}" text:anchor-type="as-char" svg:width="{pt(r.get("width", 100))}" svg:height="{pt(r.get("height", 100))}">'
                f'<draw:image xlink:href="Pictures/{name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>{alt}</draw:frame>')

    def blocks(self, blocks: list[dict]) -> str:
        out = []
        for kind, item in common.list_runs(blocks):
            out.append(self.list_xml(item) if kind == "list" else self.block(item))
        return "".join(out)

    def list_style(self, items: list[dict]) -> str:
        levels: dict[int, dict] = {}
        for it in items:
            levels.setdefault(max(0, min(int(it["list"].get("level", 0) or 0), 8)), it["list"])
        name = self.new("L")
        lv_xml = []
        for lv in range(9):
            lst = levels.get(lv) or levels.get(0) or levels[min(levels)]
            left = 36 + 18 * lv
            props = f'<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="{pt(left)}" fo:text-indent="-18pt" fo:margin-left="{pt(left)}"/></style:list-level-properties>'
            if lst["kind"] == "number":
                fmt = common.list_format(lst if lv in levels else {}, lv)
                suf = lst.get("suffix", ".")
                suf = "." if suf is None else suf
                lv_xml.append(f'<text:list-level-style-number text:level="{lv + 1}" style:num-format="{NUMFMT[fmt]}" style:num-prefix={quoteattr(lst.get("prefix", ""))} style:num-suffix={quoteattr(suf)}>{props}</text:list-level-style-number>')
            else:
                ch = (lst.get("bullet") if lv in levels else None) or "•"
                lv_xml.append(f'<text:list-level-style-bullet text:level="{lv + 1}" text:bullet-char={quoteattr(ch)}>{props}</text:list-level-style-bullet>')
        self.auto.append(f'<text:list-style style:name="{name}">{"".join(lv_xml)}</text:list-style>')
        return name

    def list_xml(self, items: list[dict]) -> str:
        sname = self.list_style(items)
        out = [f'<text:list text:style-name="{sname}">']
        depth = 1
        open_item = [False] * 11
        for it in items:
            level = max(0, min(int(it["list"].get("level", 0) or 0), 8))
            while depth > level + 1:
                out.append("</text:list-item></text:list>" if open_item[depth] else "</text:list>")
                open_item[depth] = False
                depth -= 1
            if open_item[depth]:
                out.append("</text:list-item>")
                open_item[depth] = False
            while depth < level + 1:
                if not open_item[depth]:
                    out.append("<text:list-item>")
                    open_item[depth] = True
                out.append("<text:list>")
                depth += 1
            start = it["list"].get("start") if it["list"].get("kind") == "number" else None
            out.append("<text:list-item" + (f' text:start-value="{int(start)}"' if start is not None else "") + ">")
            open_item[depth] = True
            out.append(self.paragraph(it, None, in_list=True))
        while depth >= 1:
            if open_item[depth]:
                out.append("</text:list-item>")
            out.append("</text:list>")
            open_item[depth] = False
            depth -= 1
        return "".join(out)

    def paragraph(self, b: dict, check: dict | None, in_list: bool = False) -> str:
        style = b.get("style") or "Normal"
        extra = None
        prefix = ""
        if check is not None:
            level = min(int(check.get("level", 0) or 0), 8)
            extra = {"left": 36 + 18 * level, "first": -18}
            prefix = (chr(0x2611) if check.get("checked") else chr(0x2610)) + "<text:tab/>"
        pname = self.para_style(b, extra)
        inner = prefix + self.inline(b.get("content") or [])
        if style.startswith("Heading") and style[7:].isdigit() and not in_list:
            return f'<text:h text:style-name={quoteattr(pname)} text:outline-level="{min(10, int(style[7:]))}">{inner}</text:h>'
        return f"<text:p text:style-name={quoteattr(pname)}>{inner}</text:p>"

    def block(self, b: dict) -> str:
        kind = b.get("type")
        if kind == "paragraph":
            lst = b.get("list")
            return self.paragraph(b, lst if lst and lst.get("kind") == "check" else None)
        if kind == "code":
            return f'<text:p text:style-name={quoteattr(self.para_style({"style": "CodeBlock"}))}>{text_xml(str(b.get("text", "")))}</text:p>'
        if kind == "pageBreak":
            self.pending_break = "page"
            return ""
        if kind == "columnBreak":
            self.pending_break = "column"
            return ""
        if kind == "sectionBreak":
            self.sec_index += 1
            nxt = next((s for s in self.sections if s["id"] == b.get("next")), None)
            if nxt is not None:
                self.pending_master = self.master_for.get(nxt["id"], "")
                if nxt.get("pageNumberStart") is not None:
                    self.pending_pgnum = int(nxt["pageNumberStart"])
            return ""
        if kind == "table":
            return self.table(b)
        if kind in ("chart", "mermaid", "diagram"):
            return self.blocks(common.degrade(b, ""))
        return ""

    def table(self, b: dict) -> str:
        rows = b.get("rows") or []
        if not rows:
            return ""
        placed: dict[tuple[int, int], tuple] = {}
        covered: set[tuple[int, int]] = set()
        for r, row in enumerate(rows):
            c = 0
            for cell in row.get("cells") or []:
                while (r, c) in covered or (r, c) in placed:
                    c += 1
                cs, rs = max(1, int(cell.get("colspan", 1) or 1)), max(1, min(int(cell.get("rowspan", 1) or 1), len(rows) - r))
                placed[(r, c)] = (cell, cs, rs)
                for dr in range(rs):
                    for dc in range(cs):
                        if dr or dc:
                            covered.add((r + dr, c + dc))
                c += cs
        ncols = max([len(b.get("columns") or [])] + [c + 1 for _, c in list(placed) + list(covered)] + [1])
        widths = [float(w or 0) for w in (b.get("columns") or [])] + [0.0] * ncols
        widths = widths[:ncols]
        free = [i for i, w in enumerate(widths) if w <= 0]
        if free:
            share = max(36.0, (468.0 - sum(widths)) / len(free))
            for i in free:
                widths[i] = share
        tname = self.new("Tbl")
        look = b.get("look") or "grid"
        brk = ""
        if self.pending_break:
            brk = f' fo:break-before="{self.pending_break}"'
            self.pending_break = ""
        master = ""
        if self.pending_master:
            master = f" style:master-page-name={quoteattr(self.pending_master)}"
            self.pending_master = ""
        align = "center" if b.get("align") == "center" else "left"
        self.auto.append(f'<style:style style:name="{tname}" style:family="table"{master}><style:table-properties style:width="{pt(sum(widths))}" table:align="{align}"{brk}/></style:style>')
        out = [f'<table:table table:name="{tname}" table:style-name="{tname}">']
        for i, w in enumerate(widths):
            cn = f"{tname}.{chr(65 + i) if i < 26 else i}"
            self.auto.append(f'<style:style style:name="{cn}" style:family="table-column"><style:table-column-properties style:column-width="{pt(w)}"/></style:style>')
            out.append(f'<table:table-column table:style-name="{cn}"/>')
        head = 0
        for row in rows:
            cells = row.get("cells") or []
            if b.get("repeatHeader") and cells and all(c.get("header") for c in cells):
                head += 1
            else:
                break
        for ri in range(len(rows)):
            if ri == 0 and head:
                out.append("<table:table-header-rows>")
            out.append("<table:table-row>")
            for ci in range(ncols):
                if (ri, ci) in placed:
                    cell, cs, rs = placed[(ri, ci)]
                    out.append(self.cell(cell, cs, rs, look, ri, head))
                elif (ri, ci) in covered:
                    out.append("<table:covered-table-cell/>")
                else:
                    out.append(f'<table:table-cell office:value-type="string"><text:p text:style-name="Normal"/></table:table-cell>')
            out.append("</table:table-row>")
            if ri == head - 1 and head:
                out.append("</table:table-header-rows>")
        out.append("</table:table>")
        return "".join(out)

    def cell(self, cell: dict, cs: int, rs: int, look: str, ri: int, head: int) -> str:
        props = []
        side_names = ("top", "left", "bottom", "right")
        borders = cell.get("borders") or {}
        for side in side_names:
            spec = borders.get(side)
            if spec:
                props.append(f'fo:border-{side}="{spec.get("width", 0.5):g}pt {BORDER.get(spec.get("style", "solid"), "solid") if spec.get("style") != "none" else "none"} {spec.get("color", "#000000")}"' if spec.get("style") != "none" else f'fo:border-{side}="none"')
            elif look in ("grid", "accent") or (look in ("rows", "banded") and side in ("top", "bottom")):
                props.append(f'fo:border-{side}="0.75pt solid #808080"')
            else:
                props.append(f'fo:border-{side}="none"')
        fill = cell.get("shading") or ("#dbe5f1" if look == "accent" and cell.get("header") else "#f3f3f3" if look == "banded" and ri % 2 == 0 and ri >= head and ri > 0 else "")
        if fill:
            props.append(f'fo:background-color="{fill}"')
        props.append('fo:padding="3pt"')
        props.append(f'style:vertical-align="{ {"middle": "middle", "bottom": "bottom"}.get(cell.get("valign"), "top") }"')
        key = "C|" + " ".join(props)
        name = self.auto_style(key, "C", f'<style:style style:name="@NAME@" style:family="table-cell"><style:table-cell-properties {" ".join(props)}/></style:style>')
        attrs = f'table:style-name="{name}" office:value-type="string"'
        if cs > 1:
            attrs += f' table:number-columns-spanned="{cs}"'
        if rs > 1:
            attrs += f' table:number-rows-spanned="{rs}"'
        saved = (self.pending_break, self.pending_master, self.pending_pgnum)
        self.pending_break, self.pending_master, self.pending_pgnum = "", "", None
        body = self.blocks(cell.get("body") or []) or '<text:p text:style-name="Normal"/>'
        self.pending_break, self.pending_master, self.pending_pgnum = saved
        return f"<table:table-cell {attrs}>{body}</table:table-cell>"

    def hf(self, tag: str, item: dict) -> str:
        paras = []
        for line in str(item.get("text") or "").split("\n"):
            parts, pos = [], 0
            for m in re.finditer(r"\{(PAGE|NUMPAGES)\}", line):
                parts.append(text_xml(line[pos:m.start()]))
                parts.append("<text:page-number text:select-page=\"current\">1</text:page-number>" if m.group(1) == "PAGE" else "<text:page-count>1</text:page-count>")
                pos = m.end()
            parts.append(text_xml(line[pos:]))
            pname = self.para_style({"style": "Normal", "props": {"align": item.get("align", "left")}})
            paras.append(f"<text:p text:style-name={quoteattr(pname)}>{''.join(parts)}</text:p>")
        return f"<style:{tag}>{''.join(paras)}</style:{tag}>"

    def page_layouts(self) -> tuple[str, str]:
        layouts, masters = [], []
        saved_auto, saved_cache = self.auto, self.cache
        self.auto, self.cache = [], {}
        evenodd = bool((self.doc.get("settings") or {}).get("evenOdd"))
        for i, s in enumerate(self.sections):
            page = s.get("page") or {}
            m = s.get("margins") or {}
            ln = f"pm{i + 1}"
            mn = "Standard" if i == 0 else f"MP{i + 1}"
            self.master_for[s["id"]] = mn
            has_h = any((s.get("headers") or {}).get(k) for k in ("default", "first", "even"))
            has_f = any((s.get("footers") or {}).get(k) for k in ("default", "first", "even"))
            top = float(m.get("header", 36)) if has_h else float(m.get("top", 72))
            bottom = float(m.get("footer", 36)) if has_f else float(m.get("bottom", 72))
            props = [f'fo:page-width="{pt(page.get("width", 612))}"', f'fo:page-height="{pt(page.get("height", 792))}"',
                     f'style:print-orientation="{page.get("orientation", "portrait")}"', f'fo:margin-top="{pt(top)}"', f'fo:margin-bottom="{pt(bottom)}"',
                     f'fo:margin-left="{pt(m.get("left", 72))}"', f'fo:margin-right="{pt(m.get("right", 72))}"']
            props.append(f'style:num-format="{ {"lowerRoman": "i", "upperRoman": "I", "lowerLetter": "a", "upperLetter": "A"}.get(s.get("pageNumberFormat"), "1") }"')
            if s.get("pageColor"):
                props.append(f'fo:background-color="{s["pageColor"]}"')
            if s.get("pageBorder"):
                props.append('fo:border="0.75pt solid #000000" fo:padding="12pt"')
            cols = s.get("columns") or {}
            colxml = f'<style:columns fo:column-count="{int(cols["count"])}" fo:column-gap="{pt(cols.get("gap", 36))}"/>' if int(cols.get("count", 1) or 1) > 1 else ""
            hstyle = (f'<style:header-style><style:header-footer-properties fo:min-height="{pt(max(0, float(m.get("top", 72)) - float(m.get("header", 36))))}" fo:margin-bottom="0pt"/></style:header-style>' if has_h else "")
            fstyle = (f'<style:footer-style><style:header-footer-properties fo:min-height="{pt(max(0, float(m.get("bottom", 72)) - float(m.get("footer", 36))))}" fo:margin-top="0pt"/></style:footer-style>' if has_f else "")
            layouts.append(f'<style:page-layout style:name="{ln}"><style:page-layout-properties {" ".join(props)}>{colxml}</style:page-layout-properties>{hstyle}{fstyle}</style:page-layout>')
            inner = []
            for kind, tags in (("headers", ("header", "header-first", "header-left")), ("footers", ("footer", "footer-first", "footer-left"))):
                spec = s.get(kind) or {}
                if spec.get("default"):
                    inner.append(self.hf(tags[0], spec["default"]))
                if spec.get("first") and s.get("titlePage"):
                    inner.append(self.hf(tags[1], spec["first"]))
                if evenodd and (spec.get("even") or spec.get("default")):
                    inner.append(self.hf(tags[2], spec.get("even") or spec["default"]))
            masters.append(f'<style:master-page style:name="{mn}" style:page-layout-name="{ln}">{"".join(inner)}</style:master-page>')
        self.styles_auto = "".join(self.auto)
        self.auto, self.cache = saved_auto, saved_cache
        return "".join(layouts), "".join(masters)

    def build(self) -> bytes:
        doc = self.doc
        named = [self.named_style(sid, spec) for sid, spec in self.styles.items() if isinstance(spec, dict) and spec.get("type") == "paragraph"]
        if "CodeBlock" not in self.styles:
            named.append('<style:style style:name="CodeBlock" style:display-name="Code Block" style:family="paragraph" style:parent-style-name="Normal">'
                         '<style:paragraph-properties fo:background-color="#f2f2f2" fo:margin-bottom="8pt"/><style:text-properties fo:font-family="Consolas" fo:font-size="10pt"/></style:style>')
        if "Normal" not in self.styles:
            named.append('<style:style style:name="Normal" style:family="paragraph" style:class="text"/>')
        self.styles.setdefault("CodeBlock", {"type": "paragraph"})
        layouts, masters = self.page_layouts()
        if self.sections:
            first = self.sections[0]
            if first.get("pageNumberStart") is not None:
                self.pending_pgnum = int(first["pageNumberStart"])
        tabs = common.doc_tabs(doc)
        body = []
        for tab in tabs:
            if len(tabs) > 1:
                body.append(self.blocks([common.para("Heading1", [common.text_run(str(tab.get("title", "")))], "")]))
            body.append(self.blocks(tab.get("body") or []))
        if self.pending_break:
            body.append(f'<text:p text:style-name={quoteattr(self.para_style({"style": "Normal"}))}/>')
        tabw = (doc.get("settings") or {}).get("defaultTab", 36)
        default = f'<style:default-style style:family="paragraph"><style:paragraph-properties style:tab-stop-distance="{pt(tabw)}"/></style:default-style>'
        styles_xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles {DECL} office:version="1.3"><office:styles>{default}{"".join(named)}</office:styles>'
                      f'<office:automatic-styles>{layouts}{self.styles_auto}</office:automatic-styles><office:master-styles>{masters}</office:master-styles></office:document-styles>')
        content_xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content {DECL} office:version="1.3"><office:automatic-styles>{"".join(self.auto)}</office:automatic-styles>'
                       f'<office:body><office:text>{"".join(body)}</office:text></office:body></office:document-content>')
        meta = doc.get("meta") or {}
        kw = meta.get("keywords")
        stamp = lambda v: time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(v if isinstance(v, (int, float)) and v > 0 else time.time()))
        meta_xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta {DECL} office:version="1.3"><office:meta><dc:title>{escape(str(doc.get("title", "")))}</dc:title>'
                    f'<dc:creator>{escape(str(meta.get("author", "")))}</dc:creator><meta:initial-creator>{escape(str(meta.get("author", "")))}</meta:initial-creator>'
                    f'<dc:subject>{escape(str(meta.get("subject", "")))}</dc:subject><dc:language>{escape(str(meta.get("language") or "en-US"))}</dc:language>'
                    + "".join(f"<meta:keyword>{escape(str(k))}</meta:keyword>" for k in (kw if isinstance(kw, list) else [kw] if kw else []))
                    + f'<meta:creation-date>{stamp(meta.get("created"))}</meta:creation-date><dc:date>{stamp(meta.get("modified"))}</dc:date><meta:generator>FormTxt</meta:generator></office:meta></office:document-meta>')
        manifest = ['<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>']
        for path in ("content.xml", "styles.xml", "meta.xml"):
            manifest.append(f'<manifest:file-entry manifest:full-path="{path}" manifest:media-type="text/xml"/>')
        for name in self.pictures:
            kind = common.sniff(self.pictures[name])
            manifest.append(f'<manifest:file-entry manifest:full-path="Pictures/{name}" manifest:media-type="{kind[1] if kind else "application/octet-stream"}"/>')
        manifest_xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="{NS["manifest"]}" manifest:version="1.3">{"".join(manifest)}</manifest:manifest>'
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr(zipfile.ZipInfo("mimetype"), "application/vnd.oasis.opendocument.text", compress_type=zipfile.ZIP_STORED)
            for path, data in (("content.xml", content_xml), ("styles.xml", styles_xml), ("meta.xml", meta_xml), ("META-INF/manifest.xml", manifest_xml)):
                z.writestr(path, data, compress_type=zipfile.ZIP_DEFLATED)
            for name, data in self.pictures.items():
                z.writestr(f"Pictures/{name}", data, compress_type=zipfile.ZIP_STORED)
        return buf.getvalue()


def build(doc: dict, media: dict[str, bytes]) -> bytes:
    return Odt(doc, media).build()
