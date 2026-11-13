import io
import re
import zipfile

from lxml import etree

from app.core.ids import new_id
from app.services import model
from app.services.exchange import common
from app.services.exchange.common import Builder

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0", "style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0", "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "draw": "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0", "fo": "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
    "xlink": "http://www.w3.org/1999/xlink", "dc": "http://purl.org/dc/elements/1.1/", "meta": "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
    "svg": "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0",
}
FORMATS = {"1": "decimal", "01": "decimal-leading-zero", "a": "lower-alpha", "A": "upper-alpha", "i": "lower-roman", "I": "upper-roman"}
PAGE_FORMAT = {"i": "lowerRoman", "I": "upperRoman", "a": "lowerLetter", "A": "upperLetter"}


def q(prefix: str, name: str) -> str:
    return "{%s}%s" % (NS[prefix], name)


def length(value: str | None) -> float | None:
    m = re.fullmatch(r"\s*(-?[\d.]+)\s*(pt|cm|mm|in|px|pc|em)?\s*", value or "")
    if not m:
        return None
    n = float(m.group(1))
    return {"pt": n, "cm": n * 28.3465, "mm": n * 2.83465, "in": n * 72, "px": n * 0.75, "pc": n * 12, None: n, "em": n * 11}[m.group(2)]


def border_of(value: str | None) -> dict | None:
    if not value or value.strip() == "none":
        return None
    parts = value.split()
    w = length(parts[0]) if parts else None
    style = parts[1] if len(parts) > 1 else "solid"
    color = parts[2] if len(parts) > 2 and parts[2].startswith("#") else "#000000"
    return {"style": style if style in ("solid", "dashed", "dotted", "double") else "solid", "width": round(min(6.0, max(0.25, w or 0.5)), 2), "color": color}


class Reader:
    def __init__(self, data: bytes, name: str) -> None:
        self.note_counts: dict[str, int] = {}
        try:
            self.z = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as exc:
            raise common.Unsupported(f"{name}: not an OpenDocument text file.") from exc
        if "content.xml" not in self.z.namelist():
            raise common.Unsupported(f"{name}: not an OpenDocument text file.")
        common.check_zip(self.z, name)
        self.b = Builder(common.title_of(name))
        self.doc = self.b.doc
        self.named: dict[str, etree._Element] = {}
        self.auto: dict[str, etree._Element] = {}
        self.list_styles: dict[str, etree._Element] = {}
        self.masters: dict[str, etree._Element] = {}
        self.layouts: dict[str, etree._Element] = {}
        self.fonts: dict[str, str] = {}
        self.style_ids: dict[str, str] = {}
        self.sections: dict[str, dict] = {}
        self.cur_master = ""
        self.cur_section = self.doc["sections"][0]
        self.counts: dict[str, dict[int, int]] = {}
        self.seen_lists: set = set()

    def xml(self, path: str):
        return etree.fromstring(self.z.read(path), etree.XMLParser(resolve_entities=False, no_network=True)) if path in self.z.namelist() else None

    def read(self) -> tuple[dict, dict[str, bytes]]:
        styles = self.xml("styles.xml")
        content = self.xml("content.xml")
        meta = self.xml("meta.xml")
        if styles is not None:
            self.collect(styles)
        self.collect(content)
        self.read_meta(meta)
        self.import_styles()
        first = next(iter(self.masters), "")
        self.cur_master = first
        self.cur_section = self.make_section(first)
        self.doc["sections"] = [self.cur_section]
        self.sections[first] = self.cur_section
        body = content.find(".//" + q("office", "text"))
        blocks = self.blocks(list(body)) if body is not None else []
        self.doc["tabs"][0]["body"] = blocks or self.doc["tabs"][0]["body"]
        self.strip_defaults()
        return self.doc, self.b.media

    def collect(self, root) -> None:
        for el in root.iter(q("style", "font-face")):
            fam = el.get(q("svg", "font-family")) or el.get(q("style", "name"))
            self.fonts[el.get(q("style", "name"))] = (fam or "").strip("'\"")
        for el in root.iter(q("style", "style")):
            name = el.get(q("style", "name"))
            parent = el.getparent().tag
            if parent == q("office", "styles"):
                self.named[name] = el
            elif parent == q("office", "automatic-styles"):
                self.auto[name] = el
        for el in root.iter(q("text", "list-style")):
            self.list_styles[el.get(q("style", "name"))] = el
        for el in root.iter(q("style", "master-page")):
            self.masters[el.get(q("style", "name"))] = el
        for el in root.iter(q("style", "page-layout")):
            self.layouts[el.get(q("style", "name"))] = el

    def read_meta(self, meta) -> None:
        if meta is None:
            return
        m = self.doc["meta"]
        t = meta.find(".//" + q("dc", "title"))
        if t is not None and (t.text or "").strip():
            self.doc["title"] = t.text.strip()[:200]
        for tag, key in (("creator", "author"), ("subject", "subject")):
            e = meta.find(".//" + q("dc", tag))
            if e is not None and e.text:
                m[key] = e.text.strip()[:200]
        lang = meta.find(".//" + q("dc", "language"))
        if lang is not None and lang.text:
            m["language"] = lang.text.strip()
        kws = [k.text.strip() for k in meta.iter(q("meta", "keyword")) if k.text and k.text.strip()]
        if kws:
            m["keywords"] = kws

    def props(self, style, kind: str) -> dict:
        if style is None:
            return {}
        el = style.find(q("style", kind + "-properties"))
        return dict(el.attrib) if el is not None else {}

    def chain(self, name: str | None) -> list:
        out, seen = [], set()
        while name and name not in seen:
            seen.add(name)
            st = self.auto.get(name) or self.named.get(name)
            if st is None:
                break
            out.append(st)
            name = st.get(q("style", "parent-style-name"))
        return out

    def marks_of(self, attrs: dict) -> dict:
        m: dict = {}
        fw = attrs.get(q("fo", "font-weight"))
        if fw == "bold" or (fw and fw.isdigit() and int(fw) >= 600):
            m["bold"] = True
        if attrs.get(q("fo", "font-style")) in ("italic", "oblique"):
            m["italic"] = True
        us = attrs.get(q("style", "text-underline-style"))
        if us and us != "none":
            kind = attrs.get(q("style", "text-underline-type"), "single")
            m["underline"] = "double" if kind == "double" else "dotted" if us == "dotted" else "dash" if "dash" in us else "wavy" if us == "wave" else True
        if attrs.get(q("style", "text-line-through-style"), "none") != "none":
            m["strike"] = True
        pos = attrs.get(q("style", "text-position"), "")
        if pos.startswith("super") or (pos[:1].isdigit() and not pos.startswith("0")):
            m["superscript"] = True
        elif pos.startswith("sub") or pos.startswith("-"):
            m["subscript"] = True
        if attrs.get(q("fo", "font-variant")) == "small-caps":
            m["smallCaps"] = True
        if attrs.get(q("fo", "text-transform")) == "uppercase":
            m["allCaps"] = True
        size = length(attrs.get(q("fo", "font-size")))
        if size and "%" not in (attrs.get(q("fo", "font-size")) or ""):
            m["size"] = round(size, 2)
        col = attrs.get(q("fo", "color"))
        if col and re.fullmatch(r"#[0-9a-fA-F]{6}", col):
            m["color"] = col.lower()
        bg = attrs.get(q("fo", "background-color"))
        if bg and re.fullmatch(r"#[0-9a-fA-F]{6}", bg):
            m["highlight"] = bg.lower()
        ls = length(attrs.get(q("fo", "letter-spacing")))
        if ls:
            m["spacing"] = round(ls, 2)
        fam = attrs.get(q("fo", "font-family")) or self.fonts.get(attrs.get(q("style", "font-name"), ""), "")
        if fam:
            m["font"] = fam.split(",")[0].strip("'\" ")
        return m

    def text_marks(self, style_name: str | None, own_only: bool = False) -> dict:
        m: dict = {}
        for st in reversed(self.chain(style_name)):
            if own_only and st.get(q("style", "name")) not in self.auto:
                continue
            m.update(self.marks_of(self.props(st, "text")))
        return m

    def para_of(self, attrs: dict, style: bool = False) -> dict:
        p: dict = {}
        ta = attrs.get(q("fo", "text-align"))
        if ta:
            p["align"] = {"start": "left", "left": "left", "end": "right", "right": "right", "center": "center", "justify": "justify"}.get(ta, "left")
        left = length(attrs.get(q("fo", "margin-left")))
        if left is not None:
            p["indentLeft" if style else "indent"] = round(left, 2)
        right = length(attrs.get(q("fo", "margin-right")))
        if right is not None:
            p["indentRight"] = round(right, 2)
        first = length(attrs.get(q("fo", "text-indent")))
        if first:
            p["indentFirst"] = round(first, 2)
        top, bottom = length(attrs.get(q("fo", "margin-top"))), length(attrs.get(q("fo", "margin-bottom")))
        if top is not None:
            p["spaceBefore"] = round(top, 2)
        if bottom is not None:
            p["spaceAfter"] = round(bottom, 2)
        lh = attrs.get(q("fo", "line-height"), "")
        if lh.endswith("%"):
            try:
                p["lineSpacing"] = round(float(lh[:-1]) / 100, 3)
            except ValueError:
                pass
        if attrs.get(q("fo", "keep-with-next")) == "always":
            p["keepWithNext" if style else "keepNext"] = True
        if style:
            return p
        if attrs.get(q("fo", "keep-together")) == "always":
            p["keepLines"] = True
        border = attrs.get(q("fo", "border"))
        if border and border != "none":
            p["border"] = "box"
        else:
            for side in ("top", "bottom", "left", "right"):
                if attrs.get(q("fo", "border-" + side), "none") != "none":
                    p["border"] = side
                    break
        bg = attrs.get(q("fo", "background-color"))
        if bg and re.fullmatch(r"#[0-9a-fA-F]{6}", bg):
            p["shading"] = bg.lower()
        return p

    def import_styles(self) -> None:
        doc_styles = self.doc["styles"]
        for name, st in self.named.items():
            if st.get(q("style", "family")) != "paragraph":
                continue
            disp = st.get(q("style", "display-name")) or name.replace("_20_", " ")
            fid = common.BUILTIN_NAMES.get(disp.lower())
            if fid is None:
                if disp.lower() in ("standard", "default paragraph style"):
                    fid = "Normal"
                elif disp.lower() in ("text body", "body text"):
                    fid = "Normal"
                else:
                    fid = re.sub(r"[^A-Za-z0-9]", "", disp) or name
            self.style_ids[name] = fid
        for name, st in self.named.items():
            if st.get(q("style", "family")) != "paragraph" or name not in self.style_ids:
                continue
            fid = self.style_ids[name]
            parent = self.style_ids.get(st.get(q("style", "parent-style-name")) or "")
            nxt = self.style_ids.get(st.get(q("style", "next-style-name")) or "")
            run = {k: v for k, v in self.marks_of(self.props(st, "text")).items() if k in ("font", "size", "color", "bold", "italic", "underline", "strike", "smallCaps", "allCaps")}
            para = self.para_of(self.props(st, "paragraph"), True)
            lvl = st.get(q("style", "default-outline-level"))
            if lvl and lvl.isdigit():
                para["outlineLevel"] = int(lvl)
            if fid in doc_styles and fid == "Normal" and name != "Standard" and "Standard" in self.named:
                continue
            spec = {"type": "paragraph", "name": st.get(q("style", "display-name")) or fid, "basedOn": parent if parent != fid else None, "next": nxt or fid, "run": run, "para": para}
            if fid == "Normal":
                spec["basedOn"] = None
                spec["run"] = {**doc_styles["Normal"]["run"], **run}
                spec["para"] = {**doc_styles["Normal"]["para"], **para}
            doc_styles[fid] = spec
        for fid, spec in doc_styles.items():
            if spec.get("basedOn") and spec["basedOn"] not in doc_styles:
                spec["basedOn"] = "Normal" if fid != "Normal" else None
            if spec.get("next") and spec["next"] not in doc_styles:
                spec["next"] = fid
        doc_styles.setdefault("ListParagraph", {"type": "paragraph", "name": "List Paragraph", "basedOn": "Normal", "next": "ListParagraph", "run": {}, "para": {"indentLeft": 18.0}})
        default = self.xml("styles.xml")
        if default is not None:
            for ds in default.iter(q("style", "default-style")):
                if ds.get(q("style", "family")) == "paragraph":
                    tab = length(self.props(ds, "paragraph").get(q("style", "tab-stop-distance")))
                    if tab:
                        self.doc["settings"]["defaultTab"] = round(tab, 2)

    def make_section(self, master: str) -> dict:
        sec = model.default_section()
        m = self.masters.get(master)
        if m is None:
            return sec
        layout = self.layouts.get(m.get(q("style", "page-layout-name")))
        if layout is not None:
            lp = layout.find(q("style", "page-layout-properties"))
            if lp is not None:
                a = lp.attrib
                w, h = length(a.get(q("fo", "page-width"))), length(a.get(q("fo", "page-height")))
                if w and h:
                    name = next((k for k, (pw, ph) in model.PAGE_SIZES.items() if (abs(pw - w) < 3 and abs(ph - h) < 3) or (abs(ph - w) < 3 and abs(pw - h) < 3)), "custom")
                    sec["page"] = {"size": name, "width": round(w, 2), "height": round(h, 2), "orientation": "landscape" if w > h else "portrait"}
                mg = sec["margins"]
                for key, att in (("top", "margin-top"), ("bottom", "margin-bottom"), ("left", "margin-left"), ("right", "margin-right")):
                    v = length(a.get(q("fo", att)))
                    if v is not None:
                        mg[key] = round(v, 2)
                fmt = PAGE_FORMAT.get(a.get(q("style", "num-format"), ""))
                if fmt:
                    sec["pageNumberFormat"] = fmt
                bg = a.get(q("fo", "background-color"))
                if bg and re.fullmatch(r"#[0-9a-fA-F]{6}", bg):
                    sec["pageColor"] = bg.lower()
                if a.get(q("fo", "border"), "none") != "none":
                    sec["pageBorder"] = "thin"
                cols = lp.find(q("style", "columns"))
                if cols is not None and int(cols.get(q("fo", "column-count"), "1")) > 1:
                    sec["columns"] = {"count": min(4, int(cols.get(q("fo", "column-count")))), "gap": round(length(cols.get(q("fo", "column-gap"))) or 36.0, 2)}
                hs = layout.find(q("style", "header-style") + "/" + q("style", "header-footer-properties"))
                fs = layout.find(q("style", "footer-style") + "/" + q("style", "header-footer-properties"))
                if hs is not None:
                    mg["header"] = round(mg["top"], 2)
                    mg["top"] = round(mg["top"] + (length(hs.get(q("fo", "min-height"))) or 0) + (length(hs.get(q("fo", "margin-bottom"))) or 0), 2)
                if fs is not None:
                    mg["footer"] = round(mg["bottom"], 2)
                    mg["bottom"] = round(mg["bottom"] + (length(fs.get(q("fo", "min-height"))) or 0) + (length(fs.get(q("fo", "margin-top"))) or 0), 2)
        for kind, tags in (("headers", {"header": "default", "header-first": "first", "header-left": "even"}), ("footers", {"footer": "default", "footer-first": "first", "footer-left": "even"})):
            for tag, key in tags.items():
                el = m.find(q("style", tag))
                if el is not None:
                    item = self.hf_item(el)
                    if item:
                        sec[kind][key] = item
                        if key == "first":
                            sec["titlePage"] = True
                        if key == "even":
                            self.doc["settings"]["evenOdd"] = True
        return sec

    def hf_item(self, el) -> dict | None:
        lines = []
        align = None
        for p in el.iter(q("text", "p")):
            parts = [self.hf_text(p)]
            text = "".join(parts)
            if text.strip() and align is None:
                st = p.get(q("text", "style-name"))
                a = {}
                for s in reversed(self.chain(st)):
                    a.update(self.props(s, "paragraph"))
                align = self.para_of(a).get("align", "left")
            lines.append(text)
        while lines and not lines[-1].strip():
            lines.pop()
        if not any(l.strip() for l in lines):
            return None
        return {"text": "\n".join(lines), "align": align or "left"}

    def hf_text(self, p) -> str:
        out = [p.text or ""]
        for c in p:
            if c.tag == q("text", "page-number"):
                out.append("{PAGE}")
            elif c.tag == q("text", "page-count"):
                out.append("{NUMPAGES}")
            elif c.tag == q("text", "tab"):
                out.append("\t")
            elif c.tag == q("text", "s"):
                out.append(" " * min(int(c.get(q("text", "c"), "1")), 1000))
            else:
                out.append(self.hf_text(c))
            out.append(c.tail or "")
        return "".join(out)

    def blocks(self, nodes: list) -> list[dict]:
        out: list[dict] = []
        for el in nodes:
            tag = el.tag
            if tag in (q("text", "p"), q("text", "h")):
                out.extend(self.paragraph(el, None))
            elif tag == q("text", "list"):
                out.extend(self.list_block(el, 0, None))
            elif tag == q("table", "table"):
                out.extend(self.table(el))
            elif tag in (q("text", "section"), q("text", "index-body"), q("text", "table-of-content"), q("text", "alphabetical-index")):
                out.extend(self.blocks(list(el)))
            elif tag == q("text", "index-title"):
                out.extend(self.blocks(list(el)))
        return out

    def style_info(self, name: str | None) -> tuple[str, dict, dict, str | None, str | None]:
        st = self.auto.get(name or "")
        named_name = name
        direct_text: dict = {}
        direct_para: dict = {}
        brk = None
        master = None
        if st is not None:
            attrs = self.props(st, "paragraph")
            direct_para = self.para_of(attrs)
            direct_text = self.marks_of(self.props(st, "text"))
            b = attrs.get(q("fo", "break-before"))
            brk = b if b in ("page", "column") else None
            master = st.get(q("style", "master-page-name"))
            named_name = st.get(q("style", "parent-style-name"))
            if self.props(st, "paragraph").get(q("style", "page-number")) is not None:
                direct_para.setdefault("_pgnum", attrs.get(q("style", "page-number")))
        fid = self.style_ids.get(named_name or "", "Normal")
        return fid, direct_para, direct_text, brk, master

    def apply_master(self, master: str | None) -> list[dict]:
        if not master or master == self.cur_master or master not in self.masters:
            return []
        self.cur_master = master
        sec = self.make_section(master)
        self.doc["sections"].append(sec)
        self.cur_section = sec
        return [{"type": "sectionBreak", "id": new_id("p_"), "next": sec["id"]}]

    def paragraph(self, el, lst: dict | None) -> list[dict]:
        name = el.get(q("text", "style-name"))
        fid, props, base_marks, brk, master = self.style_info(name)
        out: list[dict] = []
        if master:
            out.extend(self.apply_master(master))
        pgnum = props.pop("_pgnum", None)
        if pgnum and pgnum.isdigit() and out:
            self.cur_section["pageNumberStart"] = int(pgnum)
        if brk:
            out.append({"type": "pageBreak" if brk == "page" else "columnBreak", "id": new_id("p_")})
        if el.tag == q("text", "h") and not (fid.startswith("Heading") or fid in ("Title", "Subtitle")):
            lvl = int(el.get(q("text", "outline-level"), "1") or 1)
            fid = f"Heading{min(max(lvl, 1), 9)}"
        runs: list[dict] = []
        self.inline(el, base_marks, runs)
        runs = common.merge_runs(runs)
        if not any(r.get("type") != "text" or r.get("text") for r in runs) and not lst and master:
            pass
        if fid == "CodeBlock":
            text = "".join("\n" if r.get("type") == "break" else r.get("text", "") for r in runs)
            out.append({"type": "code", "id": new_id("p_"), "text": text})
            return out
        check = None
        if lst is None and runs and runs[0].get("type") == "text" and runs[0]["text"][:1] in (chr(0x2610), chr(0x2611), chr(0x2612)):
            glyph = runs[0]["text"][0]
            rest = runs[0]["text"][1:].lstrip()
            runs = ([common.text_run(rest, runs[0].get("marks"))] if rest else []) + runs[1:]
            if runs and runs[0].get("type") == "tab":
                runs.pop(0)
            level = max(0, int(((props.get("indent") or 36) - 36) // 18))
            check = {"kind": "check", "level": min(level, 8), "checked": glyph != chr(0x2610)}
            props.pop("indent", None)
            props.pop("indentFirst", None)
        if lst is not None:
            props.pop("indent", None)
            props.pop("indentFirst", None)
        out.append(common.para(fid, runs, self.cur_section["id"], props or None, lst or check))
        return out

    def inline(self, el, marks: dict, out: list[dict]) -> None:
        if el.text:
            out.append(common.text_run(el.text, dict(marks) or None))
        for c in el:
            t = c.tag
            if t == q("text", "span"):
                m = {**marks, **self.text_marks(c.get(q("text", "style-name")))}
                self.inline(c, m, out)
            elif t == q("text", "a"):
                m = {**marks, "link": c.get(q("xlink", "href")) or ""}
                self.inline(c, m, out)
            elif t == q("text", "s"):
                out.append(common.text_run(" " * min(int(c.get(q("text", "c"), "1")), 1000), dict(marks) or None))
            elif t == q("text", "tab"):
                out.append({"type": "tab"})
            elif t == q("text", "line-break"):
                out.append({"type": "break"})
            elif t == q("draw", "frame"):
                run = self.frame(c)
                if run:
                    out.append(run)
            elif t in (q("text", "page-number"), q("text", "page-count"), q("text", "date"), q("text", "title"), q("text", "bookmark-ref"), q("text", "sequence")):
                self.inline(c, marks, out)
            elif t in (q("text", "bookmark"), q("text", "bookmark-start"), q("text", "bookmark-end"), q("text", "soft-page-break")):
                pass
            elif t == q("text", "note"):
                out.extend(self.note(c))
            elif t in (q("text", "ruby"), q("text", "meta"), q("text", "user-field-get")):
                self.inline(c, marks, out)
            if c.tail:
                out.append(common.text_run(c.tail, dict(marks) or None))

    def note(self, c) -> list[dict]:
        kind = "endnote" if c.get(q("text", "note-class")) == "endnote" else "footnote"
        self.note_counts[kind] = self.note_counts.get(kind, 0) + 1
        body = c.find(q("text", "note-body"))
        text = " ".join("".join(p.itertext()).strip() for p in body.iter(q("text", "p"))) if body is not None else ""
        n = self.note_counts[kind]
        return [{"type": "noteRef", "id": new_id("n_"), "kind": kind, "n": n, "note": text.strip(), "text": str(n)}]

    def frame(self, fr) -> dict | None:
        w, h = length(fr.get(q("svg", "width"))), length(fr.get(q("svg", "height")))
        img = fr.find(q("draw", "image"))
        alt = ""
        t = fr.find(q("svg", "title"))
        if t is not None and t.text:
            alt = t.text
        if img is not None:
            href = img.get(q("xlink", "href")) or ""
            data = None
            if href in self.z.namelist():
                data = self.z.read(href)
            elif img.find(q("office", "binary-data")) is not None:
                import base64
                try:
                    data = base64.b64decode(img.find(q("office", "binary-data")).text or "")
                except ValueError:
                    data = None
            if data is None:
                return {"type": "text", "text": f"[{alt or 'picture'}]"} if alt else None
            run = self.b.image(data, w, h, alt, href.rsplit("/", 1)[-1])
            return run or {"type": "text", "text": f"[{alt or 'picture'}]"}
        tb = fr.find(q("draw", "text-box"))
        if tb is not None and w and h:
            lines = ["".join(p.itertext()) for p in tb.iter(q("text", "p"))]
            return {"type": "shape", "kind": "textBox", "width": round(w, 2), "height": round(h, 2), "text": "\n".join(lines), "fill": "", "stroke": "#000000", "strokeWidth": 0.75, "wrap": "inline"}
        return None

    def list_block(self, lst_el, level: int, inherited_style: str | None) -> list[dict]:
        style_name = lst_el.get(q("text", "style-name")) or inherited_style
        ls = self.list_styles.get(style_name or "")
        out: list[dict] = []
        for item in lst_el:
            if item.tag not in (q("text", "list-item"), q("text", "list-header")):
                continue
            first = True
            for c in item:
                if c.tag == q("text", "list"):
                    out.extend(self.list_block(c, level + 1, style_name))
                elif c.tag in (q("text", "p"), q("text", "h")):
                    info = self.list_info(ls, level, item, style_name)
                    out.extend(self.paragraph(c, info if first else None))
                    first = False
        return out

    def list_info(self, ls, level: int, item, style_name: str | None) -> dict:
        lv = None
        if ls is not None:
            for node in ls:
                if node.get(q("text", "level")) == str(level + 1):
                    lv = node
                    break
        out: dict = {"level": min(level, 8)}
        if lv is None or lv.tag == q("text", "list-level-style-bullet") or lv.tag == q("text", "list-level-style-image"):
            out["kind"] = "bullet"
            ch = lv.get(q("text", "bullet-char")) if lv is not None else None
            if ch and ch not in ("•", "●", "◦", "▪", "-", "o") and not (0xE000 <= ord(ch) <= 0xF8FF):
                out["bullet"] = ch
            return out
        out["kind"] = "number"
        out["format"] = FORMATS.get(lv.get(q("style", "num-format"), "1"), "decimal")
        pre, suf = lv.get(q("style", "num-prefix")) or "", lv.get(q("style", "num-suffix"))
        if pre:
            out["prefix"] = pre
        if suf is not None and suf != ".":
            out["suffix"] = suf
        key = (style_name, level)
        start = item.get(q("text", "start-value"))
        if start and start.isdigit():
            out["start"] = int(start)
        elif key not in self.seen_lists:
            sv = lv.get(q("text", "start-value"))
            if sv and sv.isdigit() and int(sv) != 1:
                out["start"] = int(sv)
        self.seen_lists.add(key)
        return out

    def table(self, tbl) -> list[dict]:
        out: list[dict] = []
        tname = tbl.get(q("table", "style-name"))
        tstyle = self.auto.get(tname or "")
        pre: list[dict] = []
        if tstyle is not None:
            tp = self.props(tstyle, "table")
            if tp.get(q("fo", "break-before")) == "page":
                pre.append({"type": "pageBreak", "id": new_id("p_")})
            master = tstyle.get(q("style", "master-page-name"))
            if master:
                pre = self.apply_master(master) + pre
        widths: list[float] = []
        for col in tbl.iter(q("table", "table-column")):
            if next(col.iterancestors(q("table", "table")), None) is not tbl:
                continue
            st = self.auto.get(col.get(q("table", "style-name")) or "")
            w = length(self.props(st, "table-column").get(q("style", "column-width"))) if st is not None else None
            for _ in range(min(int(col.get(q("table", "number-columns-repeated"), "1")), 64)):
                widths.append(round(w, 2) if w else 0.0)
        rows: list[list[dict]] = []
        header_rows = 0
        spans: dict[tuple[int, int], dict] = {}
        carry: dict[int, tuple[dict, int]] = {}

        def read_rows(parent, header: bool) -> None:
            nonlocal header_rows
            for tr in parent:
                if tr.tag == q("table", "table-header-rows"):
                    read_rows(tr, True)
                elif tr.tag == q("table", "table-row-group"):
                    read_rows(tr, header)
                elif tr.tag == q("table", "table-row"):
                    ri = len(rows)
                    cells = []
                    col = 0
                    for tc in tr:
                        if tc.tag not in (q("table", "table-cell"), q("table", "covered-table-cell")):
                            continue
                        rep = int(tc.get(q("table", "number-columns-repeated"), "1"))
                        if tc.tag == q("table", "covered-table-cell"):
                            col += rep
                            continue
                        cell = self.cell(tc, header)
                        for _ in range(min(rep, 40)):
                            cells.append(dict(cell))
                            col += 1
                    rows.append(cells)
                    if header:
                        header_rows += 1
        read_rows(tbl, False)
        if not rows:
            return pre
        ncols = max(max(sum(int(c.get("colspan", 1)) for c in r) for r in rows), len(widths), 1)
        if len(widths) < ncols:
            widths += [0.0] * (ncols - len(widths))
        if not all(widths):
            avail = self.b.body_width(self.cur_section)
            known = sum(widths)
            free = [i for i, w in enumerate(widths) if not w]
            for i in free:
                widths[i] = round(max(36.0, (avail - known) / len(free)), 2)
        sample = next((c for r in rows for c in r), None)
        ref = dict(sample.get("_b") or {}) if sample is not None else {}
        look = "grid" if len(ref) == 4 else "rows" if set(ref) == {"top", "bottom"} else "plain"
        none = {"style": "none", "width": 0.25, "color": "#000000"}
        for r in rows:
            for c in r:
                own = c.pop("_b", {})
                diff = {s: own.get(s, none) for s in ("top", "right", "bottom", "left") if own.get(s) != ref.get(s)}
                if diff:
                    c["borders"] = diff
        block = common.table_block(rows, widths, look)
        block["repeatHeader"] = bool(header_rows)
        if not header_rows:
            block.pop("repeatHeader", None)
        for r in rows:
            for c in r:
                if not header_rows:
                    c.pop("header", None)
        return pre + [block]

    def cell(self, tc, header: bool) -> dict:
        body = self.blocks(list(tc)) or []
        body = [b for b in body if b["type"] not in ("pageBreak", "sectionBreak", "columnBreak")]
        if not body or body[-1]["type"] != "paragraph":
            body.append(common.para("Normal", [], self.cur_section["id"]))
        cell: dict = {"body": body}
        if header:
            cell["header"] = True
        cs, rs = int(tc.get(q("table", "number-columns-spanned"), "1")), int(tc.get(q("table", "number-rows-spanned"), "1"))
        if cs > 1:
            cell["colspan"] = cs
        if rs > 1:
            cell["rowspan"] = rs
        st = self.auto.get(tc.get(q("table", "style-name")) or "")
        if st is not None:
            a = self.props(st, "table-cell")
            bg = a.get(q("fo", "background-color"))
            if bg and re.fullmatch(r"#[0-9a-fA-F]{6}", bg):
                cell["shading"] = bg.lower()
            va = a.get(q("style", "vertical-align"))
            if va in ("middle", "bottom"):
                cell["valign"] = va
            borders = {}
            all_sides = a.get(q("fo", "border"))
            for side in ("top", "right", "bottom", "left"):
                raw = a.get(q("fo", "border-" + side), all_sides)
                spec = border_of(raw)
                if spec:
                    borders[side] = spec
            cell["_b"] = borders
        else:
            cell["_b"] = {}
        return cell

    def strip_defaults(self) -> None:
        styles = self.doc["styles"]
        for b in self.walk(self.doc["tabs"][0]["body"]):
            if b["type"] != "paragraph":
                continue
            run, para = common.resolved(styles, b["style"])
            for r in b["content"]:
                m = r.get("marks")
                if m:
                    for k in ("font", "size", "color", "bold", "italic"):
                        if k in m and run.get(k) == m[k]:
                            del m[k]
                    if not m:
                        r.pop("marks", None)
            props = b.get("props")
            if props:
                for k, sk in (("align", "align"), ("indent", "indentLeft"), ("indentRight", "indentRight"), ("spaceBefore", "spaceBefore"), ("spaceAfter", "spaceAfter"),
                              ("lineSpacing", "lineSpacing"), ("keepNext", "keepWithNext")):
                    if k in props and para.get(sk) == props[k]:
                        del props[k]
                if not props:
                    b.pop("props", None)

    def walk(self, blocks: list[dict]):
        for b in blocks:
            yield b
            if b["type"] == "table":
                for r in b["rows"]:
                    for c in r["cells"]:
                        yield from self.walk(c["body"])


def read(data: bytes, name: str) -> tuple[dict, dict[str, bytes]]:
    reader = Reader(data, name)
    try:
        return reader.read()
    except common.Unsupported:
        raise
    except (KeyError, ValueError, AttributeError, TypeError, zipfile.BadZipFile, etree.XMLSyntaxError) as exc:
        manifest = reader.z.read("META-INF/manifest.xml") if "META-INF/manifest.xml" in reader.z.namelist() else b""
        if b"encryption-data" in manifest:
            raise common.Unsupported(f"{name}: the document is password protected; remove the password and try again.") from exc
        raise common.Unsupported(f"{name}: could not be read as an OpenDocument text file ({exc}).") from exc
