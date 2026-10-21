import base64
import re
import urllib.parse

import lxml.html
from lxml import etree

from app.core.ids import new_id
from app.services import model
from app.services.exchange import common
from app.services.exchange.common import Builder

BLOCK_TAGS = {"p", "div", "section", "article", "main", "header", "footer", "nav", "aside", "figure", "figcaption", "form", "fieldset", "address", "details", "summary", "center"}
SKIP = {"script", "style", "head", "title", "meta", "link", "noscript", "template", "svg", "iframe", "object", "video", "audio", "canvas"}
OL_FORMAT = {"1": "decimal", "a": "lower-alpha", "A": "upper-alpha", "i": "lower-roman", "I": "upper-roman"}
LIST_FORMAT = {"decimal": "decimal", "decimal-leading-zero": "decimal-leading-zero", "lower-alpha": "lower-alpha", "lower-latin": "lower-alpha", "upper-alpha": "upper-alpha",
               "upper-latin": "upper-alpha", "lower-roman": "lower-roman", "upper-roman": "upper-roman"}
NAMED = {"black": "#000000", "white": "#ffffff", "red": "#ff0000", "green": "#008000", "blue": "#0000ff", "yellow": "#ffff00", "gray": "#808080", "grey": "#808080",
         "orange": "#ffa500", "purple": "#800080", "navy": "#000080", "teal": "#008080", "silver": "#c0c0c0", "maroon": "#800000", "lime": "#00ff00", "aqua": "#00ffff", "fuchsia": "#ff00ff"}
CHECK_GLYPHS = (chr(0x2610), chr(0x2611), chr(0x2612))


def parse_style(value: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in (value or "").split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip().lower()] = v.strip()
    return out


def color(value: str | None) -> str:
    v = (value or "").strip().lower()
    if re.fullmatch(r"#[0-9a-f]{6}", v):
        return v
    if re.fullmatch(r"#[0-9a-f]{3}", v):
        return "#" + "".join(c * 2 for c in v[1:])
    m = re.match(r"rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)", v)
    if m:
        return "#%02x%02x%02x" % tuple(min(255, int(x)) for x in m.groups())
    return NAMED.get(v, "")


def length_pt(value: str | None) -> float | None:
    m = re.fullmatch(r"\s*(-?[\d.]+)\s*(pt|px|in|cm|mm|pc)?\s*", value or "")
    if not m:
        return None
    n = float(m.group(1))
    return {"pt": n, "px": n * 0.75, None: n * 0.75, "in": n * 72, "cm": n * 28.3465, "mm": n * 2.83465, "pc": n * 12}[m.group(2)]


class Reader:
    def __init__(self, data: bytes, name: str) -> None:
        self.text = common_decode(data)
        self.b = Builder(common.title_of(name))
        self.section = self.b.doc["sections"][0]["id"]
        self.styles = self.b.doc["styles"]
        self.b.doc["styles"].setdefault("ListParagraph", {"type": "paragraph", "name": "List Paragraph", "basedOn": "Normal", "next": "ListParagraph", "run": {}, "para": {"indentLeft": 18.0}})

    def read(self) -> tuple[dict, dict[str, bytes]]:
        try:
            root = lxml.html.document_fromstring(self.text)
        except (etree.ParserError, ValueError) as exc:
            raise common.Unsupported(f"The HTML could not be read: {exc}") from exc
        doc = self.b.doc
        title = root.findtext(".//title")
        if title and title.strip():
            doc["title"] = re.sub(r"\s+", " ", title).strip()[:200]
        for m in root.iter("meta"):
            nm, content = (m.get("name") or "").lower(), m.get("content") or ""
            if nm == "author":
                doc["meta"]["author"] = content[:200]
            elif nm == "description":
                doc["meta"]["subject"] = content[:200]
            elif nm == "keywords":
                doc["meta"]["keywords"] = [k.strip() for k in content.split(",") if k.strip()]
        lang = root.get("lang")
        if lang:
            doc["meta"]["language"] = lang
        for st in root.iter("style"):
            self.page_rule(st.text or "")
        body = root.find("body")
        if body is None:
            body = root
        self.notes = {}
        for ol in list(root.iter("ol")):
            if "footnotes" in (ol.get("class") or "").split():
                for li in ol.findall("li"):
                    if li.get("id"):
                        self.notes[li.get("id")] = re.sub(r"\s*Back\s*$", "","".join(li.itertext()).strip())
                prev = ol.getprevious()
                if prev is not None and prev.tag == "hr":
                    prev.getparent().remove(prev)
                ol.getparent().remove(ol)
        self.note_count = 0
        blocks = self.container(body)
        doc["tabs"][0]["body"] = blocks or doc["tabs"][0]["body"]
        return doc, self.b.media

    def page_rule(self, css: str) -> None:
        m = re.search(r"@page\s*\{([^}]*)\}", css)
        if not m:
            return
        rule = parse_style(m.group(1))
        sec = self.b.doc["sections"][0]
        size = re.findall(r"[\d.]+pt", rule.get("size", ""))
        if len(size) == 2:
            w, h = float(size[0][:-2]), float(size[1][:-2])
            sec["page"] = {"size": next((k for k, (pw, ph) in model.PAGE_SIZES.items() if abs(pw - w) < 3 and abs(ph - h) < 3), "custom"), "width": w, "height": h,
                           "orientation": "landscape" if w > h else "portrait"}
        mg = re.findall(r"[\d.]+pt", rule.get("margin", ""))
        if len(mg) == 4:
            for key, v in zip(("top", "right", "bottom", "left"), mg):
                sec["margins"][key] = float(v[:-2])

    def para(self, style: str, runs: list[dict], props: dict | None = None, lst: dict | None = None) -> dict:
        return common.para(style, common.merge_runs(runs), self.section, props or None, lst)

    def container(self, el) -> list[dict]:
        out: list[dict] = []
        pending: list[dict] = []
        marks: dict = {}

        def flush() -> None:
            runs = self.trim(pending)
            if runs:
                out.append(self.para("Normal", runs))
            pending.clear()

        if el.text and el.text.strip():
            pending.append(common.text_run(re.sub(r"\s+", " ", el.text)))
        for c in el:
            tag = c.tag if isinstance(c.tag, str) else ""
            if tag in SKIP or not tag:
                self.tail(c, pending, marks)
                continue
            if self.is_block(c):
                flush()
                out.extend(self.block(c))
            else:
                self.inline(c, marks, pending)
            self.tail(c, pending, marks)
        flush()
        return out

    def tail(self, c, pending: list[dict], marks: dict) -> None:
        if c.tail and (c.tail.strip() or pending):
            pending.append(common.text_run(re.sub(r"\s+", " ", c.tail), dict(marks) or None))

    def is_block(self, el) -> bool:
        tag = el.tag
        if tag in BLOCK_TAGS or tag in ("h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "pre", "blockquote", "hr", "dl", "li"):
            return True
        return False

    def trim(self, runs: list[dict]) -> list[dict]:
        runs = common.merge_runs([dict(r) for r in runs])
        while runs and runs[0].get("type") == "text" and not runs[0]["text"].strip():
            runs.pop(0)
        while runs and runs[-1].get("type") == "text" and not runs[-1]["text"].strip():
            runs.pop()
        if runs and runs[0].get("type") == "text":
            runs[0]["text"] = runs[0]["text"].lstrip()
        if runs and runs[-1].get("type") == "text":
            runs[-1]["text"] = runs[-1]["text"].rstrip()
        return runs

    def css_marks(self, css: dict[str, str]) -> dict:
        m: dict = {}
        c = color(css.get("color"))
        if c:
            m["color"] = c
        bg = color(css.get("background-color") or css.get("background"))
        if bg:
            m["highlight"] = bg
        fam = css.get("font-family")
        if fam:
            first = fam.split(",")[0].strip().strip("'\"")
            if first and first.lower() not in ("inherit", "sans-serif", "serif", "monospace"):
                m["font"] = first
        size = length_pt(css.get("font-size"))
        if size and 1 < size < 200:
            m["size"] = round(size, 2)
        fw = css.get("font-weight", "")
        if fw == "bold" or (fw.isdigit() and int(fw) >= 600):
            m["bold"] = True
        if css.get("font-style") == "italic":
            m["italic"] = True
        td = css.get("text-decoration", "") + " " + css.get("text-decoration-line", "")
        if "underline" in td:
            m["underline"] = "double" if "double" in td else "dotted" if "dotted" in td else "dash" if "dashed" in td else "wavy" if "wavy" in td else True
        if "line-through" in td:
            m["strike"] = True
        if "small-caps" in css.get("font-variant", ""):
            m["smallCaps"] = True
        if css.get("text-transform") == "uppercase":
            m["allCaps"] = True
        ls = length_pt(css.get("letter-spacing"))
        if ls:
            m["spacing"] = round(ls, 2)
        return m

    def inline(self, el, marks: dict, out: list[dict]) -> None:
        tag = el.tag
        if tag in SKIP and tag != "svg":
            return
        if tag == "sup":
            a = el.find("a")
            href = (a.get("href") or "") if a is not None else ""
            if href.startswith("#fn") and href[1:] in self.notes:
                self.note_count += 1
                out.append({"type": "noteRef", "id": new_id("n_"), "kind": "footnote", "n": self.note_count, "note": self.notes[href[1:]], "text": str(self.note_count)})
                return
        m = dict(marks)
        if tag in ("b", "strong"):
            m["bold"] = True
        elif tag in ("i", "em", "cite", "dfn", "var"):
            m["italic"] = True
        elif tag == "u" or tag == "ins":
            m["underline"] = True
        elif tag in ("s", "strike", "del"):
            m["strike"] = True
        elif tag == "sup":
            m["superscript"] = True
        elif tag == "sub":
            m["subscript"] = True
        elif tag in ("code", "kbd", "samp", "tt"):
            m["code"] = True
        elif tag == "mark":
            m["highlight"] = "#ffff00"
        elif tag == "a" and el.get("href"):
            m["link"] = el.get("href")
        elif tag == "font":
            c = color(el.get("color"))
            if c:
                m["color"] = c
            if el.get("face"):
                m["font"] = el.get("face").split(",")[0].strip()
        if tag == "br":
            out.append({"type": "break"})
            return
        if tag == "img":
            run = self.image(el)
            if run:
                out.append(run)
            return
        if "tab" in (el.get("class") or "").split():
            out.append({"type": "tab"})
            return
        if el.get("data-latex") is not None:
            out.append({"type": "math", "latex": el.get("data-latex")})
            return
        m.update(self.css_marks(parse_style(el.get("style"))))
        if el.text:
            out.append(common.text_run(re.sub(r"\s+", " ", el.text), dict(m) or None))
        for c in el:
            if isinstance(c.tag, str):
                if self.is_block(c):
                    continue
                self.inline(c, m, out)
            if c.tail:
                out.append(common.text_run(re.sub(r"\s+", " ", c.tail), dict(m) or None))

    def image(self, el) -> dict | None:
        src = el.get("src") or ""
        alt = el.get("alt") or ""
        css = parse_style(el.get("style"))
        w = length_pt(css.get("width")) or length_pt(el.get("width"))
        h = length_pt(css.get("height")) or length_pt(el.get("height"))
        data = None
        m = re.match(r"data:([^;,]+)?(;base64)?,(.*)", src, re.S)
        if m:
            try:
                data = base64.b64decode(m.group(3)) if m.group(2) else urllib.parse.unquote_to_bytes(m.group(3))
            except ValueError:
                data = None
        if data is None:
            return {"type": "text", "text": f"[{alt or 'picture'}]"} if (alt or src) else None
        run = self.b.image(data, w, h, alt)
        return run or ({"type": "text", "text": f"[{alt or 'picture'}]"})

    def para_props(self, el, style: str) -> dict:
        css = parse_style(el.get("style"))
        props: dict = {}
        _, base = common.resolved(self.styles, style)
        ta = css.get("text-align")
        if ta in ("left", "center", "right", "justify") and ta != base.get("align", "left"):
            props["align"] = ta
        for key, name, base_key in (("margin-left", "indent", "indentLeft"), ("margin-right", "indentRight", "indentRight"), ("margin-top", "spaceBefore", "spaceBefore"),
                                    ("margin-bottom", "spaceAfter", "spaceAfter"), ("text-indent", "indentFirst", "indentFirst")):
            v = length_pt(css.get(key))
            if v is not None and abs(v - float(base.get(base_key) or 0)) > 0.05:
                props[name] = round(v, 2)
        lh = css.get("line-height", "")
        if re.fullmatch(r"[\d.]+", lh) and abs(float(lh) - float(base.get("lineSpacing") or 0)) > 0.005:
            props["lineSpacing"] = float(lh)
        bg = color(css.get("background") or css.get("background-color"))
        if bg:
            props["shading"] = bg
        return props

    def style_for(self, el, default: str) -> str:
        s = el.get("data-style")
        return s if s and s in self.styles else default

    def block(self, el) -> list[dict]:
        tag = el.tag
        css = parse_style(el.get("style"))
        cls = (el.get("class") or "").split()
        brk = ("break-after" in css and css["break-after"] in ("page", "always")) or css.get("page-break-after") == "always" or "page-break" in cls or "section-break" in cls
        if tag == "div" and not len(el) and not (el.text or "").strip():
            if brk or "page-break" in cls:
                return [{"type": "pageBreak", "id": new_id("p_")}]
            if "column-break" in cls:
                return [{"type": "columnBreak", "id": new_id("p_")}]
            return []
        pre_break = [{"type": "pageBreak", "id": new_id("p_")}] if css.get("break-before") in ("page", "always") or css.get("page-break-before") == "always" else []
        if re.fullmatch(r"h[1-6]", tag):
            default = f"Heading{tag[1]}"
            style = self.style_for(el, default)
            runs = []
            self.inline_content(el, runs)
            runs = self.trim(runs)
            if "tab-title" in cls:
                return []
            return pre_break + [self.para(style, runs, self.para_props(el, style))]
        if tag == "p" or tag == "figcaption" or tag == "summary" or tag == "address":
            style = self.style_for(el, "Normal")
            runs = []
            self.inline_content(el, runs)
            images_only = [r for r in runs if r.get("type") not in ("text",) or r["text"].strip()]
            runs = self.trim(runs)
            if not runs and not images_only:
                return pre_break + [self.para(style, [], self.para_props(el, style))]
            return pre_break + [self.para(style, runs, self.para_props(el, style))]
        if tag in ("ul", "ol"):
            return self.list_block(el, 0)
        if tag == "table":
            return pre_break + [self.table(el)]
        if tag == "pre":
            return pre_break + [{"type": "code", "id": new_id("p_"), "text": "".join(el.itertext()).strip("\n")}]
        if tag == "blockquote":
            inner = self.container(el)
            for b in inner:
                if b["type"] == "paragraph" and b["style"] == "Normal":
                    b["style"] = "Quote"
            return inner
        if tag == "hr":
            return []
        if tag == "dl":
            return self.container(el)
        if tag == "li":
            return self.container(el)
        if tag == "section" and el.get("data-tab") is not None:
            return self.container(el)
        inner = self.container(el)
        if inner and brk:
            inner.append({"type": "pageBreak", "id": new_id("p_")})
        return pre_break + inner

    def inline_content(self, el, runs: list[dict]) -> None:
        marks = self.css_marks(parse_style(el.get("style"))) if el.tag not in ("h1", "h2", "h3", "h4", "h5", "h6") else {}
        if el.text:
            runs.append(common.text_run(re.sub(r"\s+", " ", el.text), dict(marks) or None))
        for c in el:
            if isinstance(c.tag, str) and c.tag not in SKIP:
                if self.is_block(c) and c.tag not in ("ul", "ol"):
                    sub: list[dict] = []
                    self.inline_content(c, sub)
                    if sub and runs:
                        runs.append({"type": "break"})
                    runs.extend(sub)
                elif not self.is_block(c):
                    self.inline(c, marks, runs)
            if c.tail:
                runs.append(common.text_run(re.sub(r"\s+", " ", c.tail), dict(marks) or None))

    def list_block(self, el, level: int) -> list[dict]:
        out: list[dict] = []
        ordered = el.tag == "ol"
        css = parse_style(el.get("style"))
        fmt = OL_FORMAT.get(el.get("type") or "") or LIST_FORMAT.get(css.get("list-style-type", ""), "decimal")
        counter = 0
        start_attr = el.get("start")
        for li in el:
            if li.tag != "li":
                continue
            counter += 1
            runs: list[dict] = []
            nested: list = []
            extra_blocks: list[dict] = []
            if li.text:
                runs.append(common.text_run(re.sub(r"\s+", " ", li.text)))
            for c in li:
                if not isinstance(c.tag, str):
                    continue
                if c.tag in ("ul", "ol"):
                    nested.append(c)
                elif c.tag in BLOCK_TAGS or re.fullmatch(r"h[1-6]", c.tag):
                    sub: list[dict] = []
                    self.inline_content(c, sub)
                    if runs:
                        runs.append({"type": "break"})
                    runs.extend(sub)
                else:
                    self.inline(c, {}, runs)
                if c.tail:
                    runs.append(common.text_run(re.sub(r"\s+", " ", c.tail)))
            runs = self.trim(runs)
            lst: dict = {"kind": "number" if ordered else "bullet", "level": min(level, 8)}
            checked = li.get("data-check")
            if runs and runs[0].get("type") == "text" and runs[0]["text"][:1] in CHECK_GLYPHS:
                checked = "1" if runs[0]["text"][0] != chr(0x2610) else "0"
                runs[0]["text"] = runs[0]["text"][1:].lstrip()
            if checked is not None:
                lst = {"kind": "check", "level": min(level, 8), "checked": checked == "1"}
            elif ordered:
                lst["format"] = fmt
                if counter == 1 and start_attr and start_attr.isdigit() and int(start_attr) != 1:
                    lst["start"] = int(start_attr)
                if li.get("value", "").isdigit():
                    lst["start"] = int(li.get("value"))
            style = self.style_for(li, "Normal")
            out.append(self.para(style, runs, self.para_props(li, style) if li.get("style") else None, lst))
            for n in nested:
                out.extend(self.list_block(n, level + 1))
            out.extend(extra_blocks)
        return out

    def table(self, el) -> dict:
        rows_el = []
        for part in el:
            if part.tag in ("thead", "tbody", "tfoot"):
                rows_el.extend(r for r in part if r.tag == "tr")
            elif part.tag == "tr":
                rows_el.append(part)
        widths: list[float] = []
        for col in el.iter("col"):
            w = length_pt(parse_style(col.get("style")).get("width")) or length_pt(col.get("width"))
            widths.append(round(w, 2) if w else 0.0)
        rows = []
        first_css = ""
        for tr in rows_el:
            cells = []
            for td in tr:
                if td.tag not in ("td", "th"):
                    continue
                css = parse_style(td.get("style"))
                if not first_css:
                    first_css = td.get("style") or ""
                body = self.container(td)
                body = [b for b in body if b["type"] not in ("pageBreak", "columnBreak", "sectionBreak")] or [self.para("Normal", [])]
                cell: dict = {"body": body}
                if td.tag == "th":
                    cell["header"] = True
                for attr, key in (("colspan", "colspan"), ("rowspan", "rowspan")):
                    v = td.get(attr)
                    if v and v.isdigit() and int(v) > 1:
                        cell[key] = min(int(v), 50)
                fill = color(css.get("background") or css.get("background-color") or td.get("bgcolor"))
                if fill:
                    cell["shading"] = fill
                if css.get("vertical-align") in ("middle", "bottom"):
                    cell["valign"] = css["vertical-align"]
                cells.append(cell)
            if cells:
                rows.append(cells)
        if not rows:
            rows = [[{"body": [self.para("Normal", [])]}]]
        look = "plain"
        if el.get("border") not in (None, "", "0") or "border:" in first_css.replace(" ", "") or "border-top" in first_css:
            look = "grid"
        elif "border-bottom" in first_css:
            look = "rows"
        block = common.table_block(rows, widths if widths and all(widths) else [], look)
        if not widths or not all(widths):
            n = max(sum(int(c.get("colspan", 1)) for c in r) for r in rows)
            avail = self.b.body_width()
            block["columns"] = [round(avail / n, 2)] * n
        return block


def common_decode(data: bytes) -> str:
    m = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", data[:2048], re.I)
    encodings = ["utf-8-sig"]
    if m:
        encodings.append(m.group(1).decode("ascii", "ignore"))
    encodings += ["cp1252"]
    for enc in encodings:
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("utf-8", "replace")


def read(data: bytes, name: str) -> tuple[dict, dict[str, bytes]]:
    return Reader(data, name).read()
