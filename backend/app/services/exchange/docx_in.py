import datetime
import io
import re
import zipfile

from docx import Document
from docx.oxml.ns import qn
from lxml import etree

from app.core.ids import new_id
from app.services import model
import json

from app.services.exchange import common, docx_comments, docx_rev, notes, omml
from app.services.exchange.common import Builder

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"
WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
W14 = "http://schemas.microsoft.com/office/word/2010/wordml"
M_NS = omml.M_NS
DOTX = b"wordprocessingml.template.main+xml"
HIGHLIGHT = {"yellow": "#ffff00", "green": "#00ff00", "cyan": "#00ffff", "magenta": "#ff00ff", "blue": "#0000ff", "red": "#ff0000", "darkBlue": "#000080",
             "darkCyan": "#008080", "darkGreen": "#008000", "darkMagenta": "#800080", "darkRed": "#800000", "darkYellow": "#808000",
             "darkGray": "#808080", "lightGray": "#c0c0c0", "black": "#000000", "white": "#ffffff"}
NUMFMT_IN = {"decimal": "decimal", "decimalZero": "decimal-leading-zero", "lowerLetter": "lower-alpha", "upperLetter": "upper-alpha",
             "lowerRoman": "lower-roman", "upperRoman": "upper-roman"}
EXT_TYPES = {"png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff", "svg"}


def on(el) -> bool:
    if el is None:
        return False
    return (el.get(qn("w:val")) or "true").lower() not in ("0", "false", "off", "none")


def val(el, name: str = "w:val"):
    return None if el is None else el.get(qn(name))


def child(el, tag: str):
    return None if el is None else el.find(qn(tag))


def num(value, div: float = 1.0):
    try:
        return float(value) / div
    except (TypeError, ValueError):
        return None


def border_spec(el) -> dict | None:
    if el is None:
        return None
    v = el.get(qn("w:val")) or "single"
    if v in ("nil", "none"):
        return {"style": "none", "width": 0.25, "color": "#000000"}
    style = "dashed" if "dash" in v.lower() else "dotted" if "dot" in v.lower() else "double" if v == "double" else "solid"
    sz = num(el.get(qn("w:sz")), 8) or 0.5
    color = el.get(qn("w:color")) or "auto"
    return {"style": style, "width": round(min(6.0, max(0.25, sz)), 2), "color": "#" + color.lower() if re.fullmatch(r"[0-9a-fA-F]{6}", color) else "#000000"}


def run_marks(rpr, charstyles: dict) -> dict:
    marks: dict = {}
    if rpr is None:
        return marks
    rs = val(child(rpr, "w:rStyle"))
    if rs and rs in charstyles:
        marks.update(charstyles[rs])
    if on(child(rpr, "w:b")):
        marks["bold"] = True
    if on(child(rpr, "w:i")):
        marks["italic"] = True
    if on(child(rpr, "w:strike")) or on(child(rpr, "w:dstrike")):
        marks["strike"] = True
    if on(child(rpr, "w:smallCaps")):
        marks["smallCaps"] = True
    if on(child(rpr, "w:caps")):
        marks["allCaps"] = True
    va = val(child(rpr, "w:vertAlign"))
    if va in ("superscript", "subscript"):
        marks[va] = True
    u = child(rpr, "w:u")
    if u is not None:
        uv = u.get(qn("w:val")) or "single"
        if uv != "none":
            low = uv.lower()
            marks["underline"] = "double" if low.startswith("double") else "dotted" if "dot" in low and "dash" not in low else "dash" if "dash" in low else "wavy" if "wav" in low else True
    fonts = child(rpr, "w:rFonts")
    if fonts is not None:
        f = fonts.get(qn("w:ascii")) or fonts.get(qn("w:hAnsi"))
        if f:
            marks["font"] = f
    sz = num(val(child(rpr, "w:sz")), 2)
    if sz:
        marks["size"] = sz
    col = val(child(rpr, "w:color"))
    if col and re.fullmatch(r"[0-9a-fA-F]{6}", col):
        marks["color"] = "#" + col.lower()
    hl = val(child(rpr, "w:highlight"))
    if hl in HIGHLIGHT:
        marks["highlight"] = HIGHLIGHT[hl]
    sh = child(rpr, "w:shd")
    if sh is not None and "highlight" not in marks:
        fill = sh.get(qn("w:fill"))
        if fill and re.fullmatch(r"[0-9a-fA-F]{6}", fill):
            marks["highlight"] = "#" + fill.lower()
    sp = num(val(child(rpr, "w:spacing")), 20)
    if sp:
        marks["spacing"] = round(sp, 2)
    return marks


class Reader:
    def __init__(self, data: bytes, name: str) -> None:
        data = self.untemplate(data)
        self.d = Document(io.BytesIO(data))
        cp = self.d.core_properties
        self.b = Builder((cp.title or "").strip() or common.title_of(name))
        self.doc = self.b.doc
        self.src_name = name
        self.idmap: dict[str, str] = {}
        self.charstyles: dict[str, dict] = {}
        self.pstyles: dict[str, dict] = {}
        self.abstract: dict[str, dict[int, dict]] = {}
        self.nums: dict[str, dict] = {}
        self.seen_levels: set[tuple[str, int]] = set()
        self.sect_ids: list[str] = []
        self.sect_cursor = 0
        self.section_id = ""
        self.sect_elements: list = []
        self.table_styles: dict[str, bool] = {}
        self.rev_active: dict[str, tuple] = {}
        self.rev_cur: dict[str, str] = {}
        self.bm_pid: dict[str, str] = {}
        self.bm_names: set[str] = set()
        self.bm_seen: set[str] = set()
        self.p_ids: dict = {}
        self.cap_pids: set[str] = set()
        self.pending_cap: dict | None = None
        self.pending_split: dict | None = None
        self.merge_names: list[str] = []
        self.cm_map: dict[str, str] = {}
        self.cm_active: list[str] = []
        self.cm_quote: dict[str, str] = {}

    def rev_info(self, el) -> dict:
        return {"author": (el.get(qn("w:author")) or "Unknown")[:200], "time": docx_rev.parse_iso(el.get(qn("w:date")))}

    def rev_id(self, kind: str, info: dict, extra: str = "") -> str:
        key = (kind, info["author"], info["time"], extra)
        if self.rev_active.get(kind) != key:
            self.rev_active[kind] = key
            self.rev_cur[kind] = new_id("r_")
        return self.rev_cur[kind]

    def prepass(self, body) -> None:
        for bs in body.iter(qn("w:bookmarkStart")):
            name = bs.get(qn("w:name")) or ""
            if name.startswith("_"):
                p = next(bs.iterancestors(qn("w:p")), None)
                if p is not None and name != "_GoBack":
                    pid = self.p_ids.get(p) or new_id("p_")
                    self.p_ids[p] = pid
                    self.bm_pid[name] = pid
            elif docx_rev.BOOKMARK.match(name):
                self.bm_names.add(name)
        for p, pid in self.p_ids.items():
            sid = val(child(child(p, "w:pPr"), "w:pStyle"))
            if sid and sid.lower() == "caption":
                self.cap_pids.add(pid)

    def anchor_url(self, anchor: str) -> str:
        if anchor in self.bm_pid:
            return "#" + self.bm_pid[anchor]
        if anchor in self.bm_names:
            return "#bm:" + anchor
        return "#" + anchor

    @staticmethod
    def untemplate(data: bytes) -> bytes:
        try:
            z = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as exc:
            raise common.Unsupported("This file is not a Word document (.docx or .dotx).") from exc
        if "[Content_Types].xml" not in z.namelist():
            raise common.Unsupported("This file is not a Word document (.docx or .dotx).")
        common.check_zip(z, "This Word document")
        ct = z.read("[Content_Types].xml")
        if DOTX not in ct and b"macroEnabled" not in ct:
            return data
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as w:
            for item in z.infolist():
                raw = z.read(item.filename)
                if item.filename == "[Content_Types].xml":
                    raw = raw.replace(b"wordprocessingml.template.main+xml", b"wordprocessingml.document.main+xml")
                    raw = raw.replace(b"wordprocessingml.document.macroEnabled.main+xml", b"wordprocessingml.document.main+xml")
                    raw = raw.replace(b"wordprocessingml.template.macroEnabledTemplate.main+xml", b"wordprocessingml.document.main+xml")
                w.writestr(item, raw)
        return out.getvalue()

    def read(self) -> tuple[dict, dict[str, bytes]]:
        self.meta()
        self.styles()
        self.numbering()
        body = self.d.element.body
        self.sections(body)
        self.section_id = self.sect_ids[0]
        docx_comments.read(self)
        self.prepass(body)
        self.doc["tabs"][0]["body"] = self.blocks(list(body), self.d.part) or self.doc["tabs"][0]["body"]
        for fid, quote in self.cm_quote.items():
            if fid in self.doc.get("comments", {}):
                self.doc["comments"][fid]["quote"] = quote.strip()[:240]
        if self.merge_names:
            mm = self.doc["settings"].setdefault("mailMerge", {"source": "", "columns": [], "rows": []})
            for name in self.merge_names:
                if name not in mm["columns"] and len(mm["columns"]) < 60:
                    mm["columns"].append(name)
        notes.read_docx(self)
        return self.doc, self.b.media

    def meta(self) -> None:
        cp = self.d.core_properties
        meta = self.doc["meta"]
        meta["author"] = (cp.author or "")[:200]
        meta["subject"] = (cp.subject or "")[:200]
        if cp.keywords:
            meta["keywords"] = [k.strip() for k in re.split(r"[;,]", cp.keywords) if k.strip()]
        if cp.language:
            meta["language"] = cp.language
        for key, v in (("created", cp.created), ("modified", cp.modified)):
            if isinstance(v, datetime.datetime):
                meta[key] = v.replace(tzinfo=datetime.timezone.utc).timestamp()
        if cp.title:
            self.doc["title"] = cp.title.strip()[:200]
        st = self.d.settings.element
        if st.find(qn("w:evenAndOddHeaders")) is not None:
            self.doc["settings"]["evenOdd"] = True
        tab = num(val(st.find(qn("w:defaultTabStop"))), 20)
        if tab:
            self.doc["settings"]["defaultTab"] = tab
        if st.find(qn("w:trackRevisions")) is not None:
            self.doc["settings"]["trackChanges"] = True
        dv = st.find(qn("w:docVars"))
        if dv is not None:
            variables = {}
            for item in dv.findall(qn("w:docVar")):
                name, value = item.get(qn("w:name")), item.get(qn("w:val"))
                if name and value is not None and len(variables) < 100:
                    variables[name[:40]] = value[:500]
            if variables:
                self.doc["variables"] = variables

    def styles(self) -> None:
        root = self.d.styles.element
        defaults_run: dict = {}
        defaults_para: dict = {}
        dd = root.find(qn("w:docDefaults"))
        if dd is not None:
            rpr = child(child(dd, "w:rPrDefault"), "w:rPr")
            defaults_run = self.style_run(rpr)
            defaults_para = self.style_para(child(child(dd, "w:pPrDefault"), "w:pPr"))
        els = [el for el in root.findall(qn("w:style")) if el.get(qn("w:styleId"))]
        for el in els:
            sid = el.get(qn("w:styleId"))
            nm = val(child(el, "w:name")) or sid
            self.idmap[sid] = common.BUILTIN_NAMES.get(nm.lower(), sid) if el.get(qn("w:type")) == "paragraph" else sid
        for el in els:
            sid = el.get(qn("w:styleId"))
            kind = el.get(qn("w:type"))
            if kind == "character":
                marks = run_marks(child(el, "w:rPr"), {})
                if sid != "Hyperlink":
                    base = val(child(el, "w:basedOn"))
                    self.charstyles[sid] = {**self.charstyles.get(base, {}), **marks}
            elif kind == "table":
                self.table_styles[sid] = self.style_has_borders(el, root)
            elif kind == "paragraph":
                fid = self.idmap[sid]
                nm = val(child(el, "w:name")) or sid
                spec = {"type": "paragraph", "name": nm, "basedOn": self.idmap.get(val(child(el, "w:basedOn")) or "") or None,
                        "next": self.idmap.get(val(child(el, "w:next")) or "") or fid,
                        "run": self.style_run(child(el, "w:rPr")), "para": self.style_para(child(el, "w:pPr"))}
                if fid == "Normal":
                    spec["basedOn"] = None
                    spec["run"] = {**{"font": "Calibri", "size": 11.0, "color": "#000000"}, **defaults_run, **spec["run"]}
                    spec["para"] = {**{"spaceBefore": 0.0, "spaceAfter": 0.0, "lineSpacing": 1.0, "align": "left"}, **defaults_para, **spec["para"]}
                if fid.startswith("Heading") and fid[7:].isdigit() and "outlineLevel" not in spec["para"]:
                    spec["para"]["outlineLevel"] = int(fid[7:])
                self.doc["styles"][fid] = spec
                self.pstyles[sid] = el
        for fid, spec in list(self.doc["styles"].items()):
            if spec.get("basedOn") == fid:
                spec["basedOn"] = None
        if "ListParagraph" not in self.doc["styles"]:
            self.doc["styles"]["ListParagraph"] = {"type": "paragraph", "name": "List Paragraph", "basedOn": "Normal", "next": "ListParagraph", "run": {}, "para": {"indentLeft": 18.0}}

    def style_has_borders(self, el, root, depth: int = 0) -> bool:
        tb = child(child(el, "w:tblPr"), "w:tblBorders")
        if tb is not None:
            return any((val(c) or "single") not in ("nil", "none") for c in tb)
        base = val(child(el, "w:basedOn"))
        if base and depth < 8:
            for other in root.findall(qn("w:style")):
                if other.get(qn("w:styleId")) == base:
                    return self.style_has_borders(other, root, depth + 1)
        return False

    def style_run(self, rpr) -> dict:
        m = run_marks(rpr, {})
        out = {}
        for key in ("font", "size", "color", "bold", "italic", "underline", "strike", "smallCaps", "allCaps"):
            if key in m:
                out[key] = m[key]
        return out

    def style_para(self, ppr) -> dict:
        if ppr is None:
            return {}
        out = self.para_props(ppr)
        for key in ("keepNext",):
            if key in out:
                out["keepWithNext"] = out.pop(key)
        ol = val(child(ppr, "w:outlineLvl"))
        if ol is not None and ol.isdigit() and int(ol) < 9:
            out["outlineLevel"] = int(ol) + 1
        for key in ("indent", "border", "shading", "tabs", "keepLines", "widowControl"):
            if key == "indent" and key in out:
                out["indentLeft"] = out.pop("indent")
            else:
                out.pop(key, None)
        return out

    def numbering(self) -> None:
        try:
            root = self.d.part.numbering_part.element
        except Exception:
            return
        for a in root.findall(qn("w:abstractNum")):
            levels = {}
            for lvl in a.findall(qn("w:lvl")):
                il = int(lvl.get(qn("w:ilvl")) or 0)
                levels[il] = {"fmt": val(child(lvl, "w:numFmt")) or "decimal", "text": val(child(lvl, "w:lvlText")) or "",
                              "start": int(num(val(child(lvl, "w:start"))) or 1)}
            self.abstract[a.get(qn("w:abstractNumId"))] = levels
        for n in root.findall(qn("w:num")):
            over = {}
            for o in n.findall(qn("w:lvlOverride")):
                so = child(o, "w:startOverride")
                if so is not None:
                    over[int(o.get(qn("w:ilvl")) or 0)] = int(num(val(so)) or 1)
            self.nums[n.get(qn("w:numId"))] = {"abstract": val(child(n, "w:abstractNumId")), "over": over}

    def list_of(self, ppr, style_el) -> dict | None:
        numpr = child(ppr, "w:numPr")
        nid = val(child(numpr, "w:numId")) if numpr is not None else None
        il = val(child(numpr, "w:ilvl")) if numpr is not None else None
        depth = 0
        el = style_el
        while (nid is None) and el is not None and depth < 8:
            sp = child(child(el, "w:pPr"), "w:numPr")
            if sp is not None:
                nid = val(child(sp, "w:numId"))
                il = il or val(child(sp, "w:ilvl"))
            base = val(child(el, "w:basedOn"))
            el = self.pstyles.get(base) if base else None
            depth += 1
        if nid is None or nid == "0" or nid not in self.nums:
            return None
        level = max(0, min(8, int(il or 0)))
        n = self.nums[nid]
        lvl = self.abstract.get(n["abstract"] or "", {}).get(level)
        if lvl is None:
            return {"kind": "bullet", "level": level}
        out: dict = {"level": level}
        if lvl["fmt"] == "bullet":
            out["kind"] = "bullet"
            ch = lvl["text"]
            if len(ch) == 1 and not (0xE000 <= ord(ch) <= 0xF8FF) and ch not in ("\u2022", "\u25e6", "\u25aa", "o", "-"):
                out["bullet"] = ch
        else:
            out["kind"] = "number"
            out["format"] = NUMFMT_IN.get(lvl["fmt"], "decimal")
            m = re.match(r"^(.*?)%(\d)(.*)$", lvl["text"])
            if m:
                pre = re.sub(r"%\d\.?", "", m.group(1))
                if pre:
                    out["prefix"] = pre
                if m.group(3) != ".":
                    out["suffix"] = re.sub(r"%\d\.?", "", m.group(3))
            key = (nid, level)
            if key not in self.seen_levels:
                self.seen_levels.add(key)
                start = n["over"].get(level, lvl["start"])
                if start != 1:
                    out["start"] = start
        return out

    def sections(self, body) -> None:
        sps = []
        for p in body.iter(qn("w:sectPr")):
            if p.getparent() is body or (p.getparent() is not None and p.getparent().tag == qn("w:pPr") and p.getparent().getparent().getparent() is body):
                sps.append(p)
        order = [s for s in sps if s.getparent() is not body] + [s for s in sps if s.getparent() is body]
        self.sect_elements = order or [None]
        secs = []
        for i, sp in enumerate(self.sect_elements):
            secs.append(self.make_section(sp, i))
        self.doc["sections"] = secs
        self.sect_ids = [s["id"] for s in secs]
        self.apply_headers(secs)

    def make_section(self, sp, index: int) -> dict:
        sec = model.default_section()
        if sp is None:
            return sec
        pg = child(sp, "w:pgSz")
        if pg is not None:
            w, h = num(pg.get(qn("w:w")), 20), num(pg.get(qn("w:h")), 20)
            if w and h:
                orient = "landscape" if (pg.get(qn("w:orient")) == "landscape" or w > h) else "portrait"
                name = "custom"
                for key, (pw, ph) in model.PAGE_SIZES.items():
                    if (abs(pw - w) < 3 and abs(ph - h) < 3) or (abs(ph - w) < 3 and abs(pw - h) < 3):
                        name = key
                        break
                sec["page"] = {"size": name, "width": round(w, 2), "height": round(h, 2), "orientation": orient}
        mg = child(sp, "w:pgMar")
        if mg is not None:
            m = sec["margins"]
            for key, attr in (("top", "top"), ("right", "right"), ("bottom", "bottom"), ("left", "left"), ("header", "header"), ("footer", "footer"), ("gutter", "gutter")):
                v = num(mg.get(qn("w:" + attr)), 20)
                if v is not None:
                    m[key] = round(abs(v), 2)
        cols = child(sp, "w:cols")
        if cols is not None:
            n = int(num(cols.get(qn("w:num"))) or 1)
            if n > 1:
                sec["columns"] = {"count": min(n, 4), "gap": round(num(cols.get(qn("w:space")), 20) or 36.0, 2)}
        tp = val(child(sp, "w:type"))
        sec["start"] = tp if tp in ("continuous", "evenPage", "oddPage") else "nextPage"
        if child(sp, "w:titlePg") is not None:
            sec["titlePage"] = True
        pn = child(sp, "w:pgNumType")
        if pn is not None:
            if pn.get(qn("w:start")):
                sec["pageNumberStart"] = int(num(pn.get(qn("w:start"))) or 1)
            if pn.get(qn("w:fmt")) in ("decimal", "lowerRoman", "upperRoman", "lowerLetter", "upperLetter"):
                sec["pageNumberFormat"] = pn.get(qn("w:fmt"))
        pb = child(sp, "w:pgBorders")
        if pb is not None and len(pb):
            first = pb[0]
            sec["pageBorder"] = "double" if val(first) == "double" else "accent" if (num(first.get(qn("w:sz"))) or 0) >= 12 else "thin"
        if index == 0:
            bg = self.d.element.find(qn("w:background"))
            col = val(bg, "w:color")
            if col and re.fullmatch(r"[0-9a-fA-F]{6}", col):
                sec["pageColor"] = "#" + col.lower()
        return sec

    def apply_headers(self, secs: list[dict]) -> None:
        real = list(self.d.sections)
        for i, sec in enumerate(secs):
            if i >= len(real):
                break
            s = real[i]
            for kind, getters in (("headers", (s.header, s.first_page_header, s.even_page_header)), ("footers", (s.footer, s.first_page_footer, s.even_page_footer))):
                for key, hf in zip(("default", "first", "even"), getters):
                    if hf.is_linked_to_previous:
                        prev = secs[i - 1].get(kind, {}).get(key) if i else None
                        if prev:
                            sec[kind][key] = dict(prev)
                        continue
                    item = self.hf_item(hf)
                    if item:
                        sec[kind][key] = item

    def hf_item(self, hf) -> dict | None:
        lines = []
        align = None
        for p in hf.paragraphs:
            text = self.hf_text(p._p)
            if text.strip() and align is None:
                al = val(child(child(p._p, "w:pPr"), "w:jc"))
                align = {"center": "center", "right": "right", "end": "right"}.get(al or "", "left")
            lines.append(text)
        while lines and not lines[-1].strip():
            lines.pop()
        if not any(l.strip() for l in lines):
            return None
        return {"text": "\n".join(lines), "align": align or "left"}

    def hf_text(self, p) -> str:
        out = []
        depth = 0
        skip = False
        instr = ""
        collecting = False
        for el in p.iter():
            tag = el.tag
            if tag == qn("w:fldChar"):
                t = el.get(qn("w:fldCharType"))
                if t == "begin":
                    depth += 1
                    instr = ""
                    collecting = True
                    skip = False
                elif t == "separate":
                    collecting = False
                    token = self.field_token(instr)
                    if token:
                        out.append(token)
                        skip = True
                elif t == "end":
                    depth = max(0, depth - 1)
                    skip = False
                    collecting = False
            elif tag == qn("w:instrText") and collecting:
                instr += el.text or ""
            elif tag == qn("w:fldSimple"):
                token = self.field_token(el.get(qn("w:instr")) or "")
                if token:
                    out.append(token)
                    for t in el.iter(qn("w:t")):
                        t.set("data-skip", "1")
            elif tag == qn("w:t") and not skip and not el.get("data-skip"):
                out.append(el.text or "")
            elif tag == qn("w:tab"):
                if el.getparent().tag == qn("w:r"):
                    out.append("\t")
        return "".join(out)

    @staticmethod
    def field_token(instr: str) -> str:
        word = instr.strip().split(" ")[0].upper() if instr.strip() else ""
        return {"PAGE": "{PAGE}", "NUMPAGES": "{NUMPAGES}"}.get(word, "")

    def para_props(self, ppr) -> dict:
        props: dict = {}
        if ppr is None:
            return props
        jc = val(child(ppr, "w:jc"))
        if jc:
            props["align"] = {"both": "justify", "distribute": "justify", "center": "center", "right": "right", "end": "right"}.get(jc, "left")
        ind = child(ppr, "w:ind")
        if ind is not None:
            left = num(ind.get(qn("w:left")) or ind.get(qn("w:start")), 20)
            right = num(ind.get(qn("w:right")) or ind.get(qn("w:end")), 20)
            if left is not None:
                props["indent"] = round(left, 2)
            if right is not None:
                props["indentRight"] = round(right, 2)
            fl, hg = num(ind.get(qn("w:firstLine")), 20), num(ind.get(qn("w:hanging")), 20)
            if hg:
                props["indentFirst"] = -round(hg, 2)
            elif fl:
                props["indentFirst"] = round(fl, 2)
        sp = child(ppr, "w:spacing")
        if sp is not None:
            b, a = num(sp.get(qn("w:before")), 20), num(sp.get(qn("w:after")), 20)
            if b is not None:
                props["spaceBefore"] = round(b, 2)
            if a is not None:
                props["spaceAfter"] = round(a, 2)
            line = num(sp.get(qn("w:line")))
            if line and (sp.get(qn("w:lineRule")) or "auto") == "auto":
                props["lineSpacing"] = round(line / 240, 3)
        if child(ppr, "w:keepNext") is not None and on(child(ppr, "w:keepNext")):
            props["keepNext"] = True
        if child(ppr, "w:keepLines") is not None and on(child(ppr, "w:keepLines")):
            props["keepLines"] = True
        wc = child(ppr, "w:widowControl")
        if wc is not None and not on(wc):
            props["widowControl"] = False
        pb = child(ppr, "w:pBdr")
        if pb is not None:
            sides = [c for c in pb if (val(c) or "single") not in ("nil", "none")]
            names = {c.tag.rsplit("}", 1)[-1] for c in sides}
            if {"top", "bottom", "left", "right"} <= names:
                props["border"] = "box"
            elif names:
                one = next(n for n in ("top", "bottom", "left", "right") if n in names)
                props["border"] = one
        sh = child(ppr, "w:shd")
        if sh is not None:
            fill = sh.get(qn("w:fill"))
            if fill and re.fullmatch(r"[0-9a-fA-F]{6}", fill):
                props["shading"] = "#" + fill.lower()
        tabs = child(ppr, "w:tabs")
        if tabs is not None:
            out = []
            for t in tabs.findall(qn("w:tab")):
                v = t.get(qn("w:val")) or "left"
                pos = num(t.get(qn("w:pos")), 20)
                if v == "clear" or pos is None:
                    continue
                item = {"pos": round(pos, 2), "align": v if v in ("center", "right", "decimal") else "left"}
                lead = t.get(qn("w:leader"))
                if lead in ("dot", "middleDot"):
                    item["leader"] = "dot"
                elif lead in ("hyphen", "heavy"):
                    item["leader"] = "dash"
                elif lead in ("underscore",):
                    item["leader"] = "underline"
                out.append(item)
            if out:
                props["tabs"] = out
        return props

    @staticmethod
    def toc_instr(p) -> str | None:
        begun = False
        for el in p.iter(qn("w:fldChar"), qn("w:instrText")):
            if el.tag == qn("w:fldChar"):
                if begun:
                    return None
                if el.get(qn("w:fldCharType")) != "begin":
                    return None
                begun = True
                continue
            text = (el.text or "").strip()
            return text if re.match(r"^TOC(\s|$)", text) else None
        return None

    def take_field(self, nodes: list, i: int) -> tuple[int, list]:
        depth = 0
        j = i
        group = []
        while j < len(nodes) and nodes[j].tag == qn("w:p"):
            group.append(nodes[j])
            for f in nodes[j].iter(qn("w:fldChar")):
                kind = f.get(qn("w:fldCharType"))
                depth += 1 if kind == "begin" else -1 if kind == "end" else 0
            j += 1
            if depth <= 0:
                break
        return j, group

    def toc_block(self, out: list[dict], group: list, instr: str) -> None:
        title = ""
        if out and out[-1].get("type") == "paragraph" and out[-1].get("style") == "TOCHeading":
            title = common.plain(out.pop()["content"]).strip()
        lo, hi = 1, 3
        m = re.search(r'\\o\s*"(\d)\s*-\s*(\d)"', instr)
        if m:
            lo, hi = int(m.group(1)), int(m.group(2))
        opts = {"from": lo, "to": max(lo, hi), "pages": "\\n" not in instr, "links": "\\h" in instr}
        stack: list[dict] = []
        entries: list[dict] = []
        for p in group:
            text = page = ""
            after_tab = False
            anchor = None
            sid = val(child(child(p, "w:pPr"), "w:pStyle")) or ""
            sm = re.fullmatch(r"(?i)toc\s*(\d)", sid)
            for el in p.iter():
                tag = el.tag
                if tag == qn("w:fldChar"):
                    kind = el.get(qn("w:fldCharType"))
                    if kind == "begin":
                        stack.append({"instr": "", "phase": "instr"})
                    elif kind == "separate" and stack:
                        stack[-1]["phase"] = "result"
                    elif kind == "end" and stack:
                        stack.pop()
                elif tag == qn("w:instrText"):
                    if stack and stack[-1]["phase"] == "instr":
                        stack[-1]["instr"] += el.text or ""
                elif tag == qn("w:hyperlink"):
                    if anchor is None and el.get(qn("w:anchor")):
                        anchor = el.get(qn("w:anchor"))
                elif tag == qn("w:tab") and el.getparent() is not None and el.getparent().tag == qn("w:r"):
                    if not (stack and stack[-1]["phase"] == "instr"):
                        after_tab = True
                elif tag == qn("w:t"):
                    inner = stack[1:]
                    if inner and inner[-1]["phase"] == "instr":
                        continue
                    if after_tab:
                        page += el.text or ""
                    else:
                        text += el.text or ""
            if not text.strip():
                continue
            entry: dict = {"text": text.strip()}
            level = max(0, int(sm.group(1)) - lo) if sm else 0
            if level:
                entry["level"] = min(8, level)
            if page.strip():
                entry["page"] = page.strip()
            if anchor:
                target = self.bm_pid.get(anchor) or ("bm:" + anchor if anchor in self.bm_names else None)
                if target:
                    entry["target"] = target
            entries.append(entry)
        out.append({"type": "toc", "id": new_id("r_"), "title": title, "entries": entries, "opts": opts})

    def blocks(self, nodes: list, part) -> list[dict]:
        out: list[dict] = []
        i = 0
        while i < len(nodes):
            el = nodes[i]
            tag = el.tag
            i += 1
            if tag == qn("w:p"):
                instr = self.toc_instr(el)
                if instr is not None:
                    i, group = self.take_field(nodes, i - 1)
                    self.toc_block(out, group, instr)
                    continue
                out.extend(self.paragraph(el, part))
            elif tag == qn("w:tbl"):
                self.pending_split = None
                out.append(self.table(el, part))
            elif tag == qn("w:sdt"):
                content = el.find(qn("w:sdtContent"))
                if content is not None:
                    sub = self.blocks(list(content), part)
                    if sub and sub[0].get("type") == "toc" and not sub[0].get("title") and out and out[-1].get("type") == "paragraph" and out[-1].get("style") == "TOCHeading":
                        sub[0]["title"] = common.plain(out.pop()["content"]).strip()
                    out.extend(sub)
            elif tag in (qn("w:ins"), qn("w:customXml")):
                out.extend(self.blocks(list(el), part))
            elif tag == qn("w:commentRangeStart"):
                self.cm_start(el.get(qn("w:id")))
            elif tag == qn("w:commentRangeEnd"):
                self.cm_end(el.get(qn("w:id")))
        if self.pending_cap:
            cap, self.pending_cap = self.pending_cap, None
            out.append(common.para("Normal", [common.text_run(cap["text"])], self.section_id))
        return out

    def cm_start(self, cid) -> None:
        fid = self.cm_map.get(cid or "")
        if fid and fid not in self.cm_active:
            self.cm_active.append(fid)

    def cm_end(self, cid) -> None:
        fid = self.cm_map.get(cid or "")
        if fid and fid in self.cm_active:
            self.cm_active.remove(fid)

    def new_section(self) -> dict:
        self.sect_cursor += 1
        idx = min(self.sect_cursor, len(self.sect_ids) - 1)
        self.section_id = self.sect_ids[idx]
        return {"type": "sectionBreak", "id": new_id("p_"), "next": self.section_id}

    def paragraph(self, p, part) -> list[dict]:
        ppr = child(p, "w:pPr")
        sid = val(child(ppr, "w:pStyle")) if ppr is not None else None
        style = self.idmap.get(sid or "", "Normal") if sid else "Normal"
        if style not in self.doc["styles"]:
            style = "Normal"
        style_el = self.pstyles.get(sid or "")
        props = self.para_props(ppr)
        fp = child(ppr, "w:framePr")
        if fp is not None and fp.get(qn("w:dropCap")) in ("drop", "margin"):
            letters = "".join(t.text or "" for t in p.iter(qn("w:t")))
            if letters.strip():
                cap = {"mode": "margin" if fp.get(qn("w:dropCap")) == "margin" else "dropped", "lines": max(1, min(10, int(num(fp.get(qn("w:lines"))) or 3))),
                       "distance": round(num(fp.get(qn("w:hSpace")), 20) or 0.0, 2)}
                rf = p.find(".//" + qn("w:rFonts"))
                font = (rf.get(qn("w:ascii")) or rf.get(qn("w:hAnsi"))) if rf is not None else None
                if font:
                    cap["font"] = font
                self.pending_cap = {"cap": cap, "text": letters.strip()}
                return []
        lst = self.list_of(ppr, style_el)
        sect = child(ppr, "w:sectPr")
        mark = child(child(ppr, "w:rPr"), "w:ins") if ppr is not None else None
        mark_del = child(child(ppr, "w:rPr"), "w:del") if ppr is not None else None
        segments = self.segments(p, part, ppr)
        before = []
        if ppr is not None and on(child(ppr, "w:pageBreakBefore")) and child(ppr, "w:pageBreakBefore") is not None:
            before.append({"type": "pageBreak", "id": new_id("p_")})
        checkbox = segments.get("check")
        if checkbox is not None and lst is None:
            lst = {"kind": "check", "level": min(8, max(0, int(((props.get("indent") or 36) - 36) // 18))), "checked": checkbox}
            props.pop("indent", None)
            props.pop("indentFirst", None)
            first_runs = next((s for s in segments["items"] if isinstance(s, list)), None)
            if first_runs and first_runs[0].get("type") == "tab":
                first_runs.pop(0)
            elif first_runs and first_runs[0].get("type") == "text" and first_runs[0]["text"].startswith(" "):
                first_runs[0]["text"] = first_runs[0]["text"][1:]
        out: list[dict] = list(before)
        if sid == "CodeBlock":
            text = "".join(common.plain([r]) if r.get("type") != "break" else "\n" for seg in segments["items"] if isinstance(seg, list) for r in seg)
            out.append({"type": "code", "id": new_id("p_"), "text": text})
        else:
            first = True
            for seg in segments["items"]:
                if seg == "pageBreak":
                    out.append({"type": "pageBreak", "id": new_id("p_")})
                    first = False
                    continue
                if seg == "columnBreak":
                    out.append({"type": "columnBreak", "id": new_id("p_")})
                    first = False
                    continue
                runs = common.merge_runs(seg)
                if not runs and not first:
                    continue
                if not runs and len(segments["items"]) > 1 and any(isinstance(s, str) for s in segments["items"]):
                    continue
                if not runs and sect is not None:
                    continue
                pprops = dict(props) if props else {}
                if self.pending_cap:
                    cap, self.pending_cap = self.pending_cap, None
                    lead = next((r for r in runs if r.get("type") == "text"), None)
                    runs = common.merge_runs([common.text_run(cap["text"], dict(lead["marks"]) if lead and lead.get("marks") else None)] + runs)
                    pprops["dropCap"] = cap["cap"]
                out.append(common.para(style, runs, self.section_id, pprops or None, lst if first else None))
                first = False
        paras = [b for b in out if b.get("type") == "paragraph"]
        if paras:
            if self.pending_split:
                paras[0].setdefault("props", {})["rvSplit"] = self.pending_split
                self.pending_split = None
            pid = self.p_ids.get(p)
            if pid:
                paras[0]["id"] = pid
            if mark_del is not None:
                paras[-1].setdefault("props", {})["rvJoin"] = {"id": new_id("r_"), **self.rev_info(mark_del)}
        if mark is not None:
            self.pending_split = {"id": new_id("r_"), **self.rev_info(mark)}
        if sect is not None:
            out.append(self.new_section())
        return out

    def segments(self, p, part, ppr) -> dict:
        items: list = [[]]
        state = {"check": None, "field": [], "result_link": None, "rev": {}, "bm_open": {}}
        marks_cache: dict = {}

        def cur() -> list:
            if not isinstance(items[-1], list):
                items.append([])
            return items[-1]

        def add_text(text: str, marks: dict, link: str | None) -> None:
            if not text:
                return
            m = dict(marks)
            if link:
                m["link"] = link
            if self.cm_active:
                m["comment"] = list(self.cm_active)
                for fid in self.cm_active:
                    if len(self.cm_quote.get(fid, "")) < 240:
                        self.cm_quote[fid] = self.cm_quote.get(fid, "") + text
            for kind in ("ins", "del"):
                info = state["rev"].get(kind)
                if info:
                    m[kind] = {"id": self.rev_id(kind, info), **info}
                else:
                    self.rev_active.pop(kind, None)
            fmt = m.pop("fmt", None)
            if fmt:
                m["fmt"] = {"id": self.rev_id("fmt", fmt, json.dumps(fmt["ops"], sort_keys=True)), **fmt}
            else:
                self.rev_active.pop("fmt", None)
            for bm in state["bm_open"].values():
                bm[1] += text
            cur().append(common.text_run(text, m or None))

        def handle_run(r, link: str | None) -> None:
            rpr_el = child(r, "w:rPr")
            marks = run_marks(rpr_el, self.charstyles)
            change = child(rpr_el, "w:rPrChange")
            if change is not None:
                ops = docx_rev.diff(run_marks(child(change, "w:rPr"), self.charstyles), marks)
                if ops:
                    marks["fmt"] = {**self.rev_info(change), "ops": ops}
            for c in r:
                t = c.tag
                fields = state["field"]
                if t == qn("w:fldChar"):
                    kind = c.get(qn("w:fldCharType"))
                    if kind == "begin":
                        fields.append({"instr": "", "phase": "instr", "result": [], "marks": marks})
                    elif kind == "separate" and fields:
                        fields[-1]["phase"] = "result"
                    elif kind == "end" and fields:
                        f = fields.pop()
                        finish_field(f, link)
                    continue
                if fields and t == qn("w:instrText"):
                    if fields[-1]["phase"] == "instr":
                        fields[-1]["instr"] += c.text or ""
                    continue
                if fields and fields[-1]["phase"] == "instr":
                    continue
                if fields and fields[-1]["phase"] == "result":
                    collect_into = fields[-1]["result"]
                    collect_into.append((c, marks))
                    continue
                emit_child(c, marks, link)

        def emit_child(c, marks: dict, link: str | None) -> None:
            t = c.tag
            if t == qn("w:t") or t == qn("w:delText"):
                add_text(c.text or "", marks, link)
            elif t == qn("w:tab"):
                cur().append({"type": "tab"})
            elif t in (qn("w:br"), qn("w:cr")):
                bt = c.get(qn("w:type")) if t == qn("w:br") else None
                if bt == "page":
                    items.append("pageBreak")
                elif bt == "column":
                    items.append("columnBreak")
                else:
                    cur().append({"type": "break"})
            elif t == qn("w:noBreakHyphen"):
                add_text("\u2011", marks, link)
            elif t == qn("w:sym"):
                ch = c.get(qn("w:char"))
                try:
                    add_text(chr(int(ch, 16) & 0xFFFF) if ch and not (0xF000 <= int(ch, 16) <= 0xF0FF or 0xD800 <= int(ch, 16) & 0xFFFF <= 0xDFFF) else "\u2022", marks, link)
                except ValueError:
                    pass
            elif t in (qn("w:drawing"), qn("w:pict"), "{%s}AlternateContent" % MC):
                run = self.drawing(c, part)
                if run:
                    cur().append(run)
            elif t == qn("w:footnoteReference") or t == qn("w:endnoteReference"):
                ref = notes.reference_run(self, c)
                if ref:
                    cur().append(ref)

        def finish_field(f: dict, link: str | None) -> None:
            instr = f["instr"].strip()
            word = instr.split(" ")[0].upper() if instr else ""
            result = f["result"]
            if word == "HYPERLINK":
                m = re.search(r'"([^"]+)"', instr)
                url = m.group(1) if m else None
                for c, marks in result:
                    emit_child(c, marks, url or link)
                return
            text = "".join(c.text or "" for c, _ in result if c.tag == qn("w:t"))
            parts = instr.split()
            if instr.startswith("="):
                code = "=" + instr[1:].split("\\#")[0].strip()
                fm = re.search(r'\\#\s*"([^"]*)"', instr)
                run: dict = {"type": "field", "kind": "formula", "code": code, "result": text}
                if fm:
                    run["format"] = fm.group(1)
                cur().append(run)
                return
            if word in ("REF", "PAGEREF") and len(parts) > 1:
                name = parts[1]
                pid = self.bm_pid.get(name)
                what = "page" if word == "PAGEREF" else "number" if re.search(r"\\[nrw]\b", instr) else "text"
                if pid:
                    cur().append({"type": "crossRef", "kind": "caption" if pid in self.cap_pids else "heading", "target": pid, "what": what, "text": text})
                    return
                if name in self.bm_names:
                    cur().append({"type": "crossRef", "kind": "bookmark", "target": name, "what": what, "text": text})
                    return
            elif word == "SEQ" and len(parts) > 1:
                label = parts[1].strip('"')
                if text.strip().isdigit():
                    items_now = cur()
                    if items_now and items_now[-1].get("type") == "text":
                        last = items_now[-1]["text"]
                        for suffix in (label + " ", label + "\u00a0", label):
                            if last.endswith(suffix):
                                last = last[:-len(suffix)]
                                break
                        if last:
                            items_now[-1] = {**items_now[-1], "text": last}
                        else:
                            items_now.pop()
                    cur().append({"type": "sequence", "label": label, "n": int(text.strip()), "text": f"{label} {text.strip()}"})
                    return
            elif word == "DOCVARIABLE" and len(parts) > 1:
                name = instr[len(parts[0]):].split("\\")[0].strip().strip('"')
                if name:
                    cur().append({"type": "field", "kind": "variable", "code": name[:40], "result": text})
                    return
            elif word == "MERGEFIELD" and len(parts) > 1:
                name = instr[len(parts[0]):].split("\\")[0].strip().strip('"')
                if name:
                    if name not in self.merge_names:
                        self.merge_names.append(name)
                    cur().append({"type": "mergefield", "name": name})
                    return
            elif word in docx_rev.INFO_CODES:
                run = {"type": "field", "kind": "info", "code": word, "result": text}
                fm = re.search(r'\\[@#]\s*"([^"]*)"', instr)
                if fm:
                    run["format"] = fm.group(1)
                else:
                    cm = re.search(r"\\\*\s*(Upper|Lower|Caps|FirstCap)", instr)
                    if cm:
                        run["format"] = {"Upper": "upper", "Lower": "lower"}.get(cm.group(1), "title")
                cur().append(run)
                return
            for c, marks in result:
                emit_child(c, marks, link)

        def control_run(pr, kind: str, unused: str, gathered: list, checked: bool) -> dict:
            title = val(child(pr, "w:alias")) or ""
            tg = val(child(pr, "w:tag")) or ""
            if tg in ("ftxt-control", "ftxt-check"):
                tg = ""
            run: dict = {"type": "control", "kind": kind, "title": title[:80]}
            if tg:
                run["tag"] = tg[:60]
            texts = [r for r in gathered if r.get("type") == "text"]
            text = "".join(r["text"] for r in texts)
            showing = child(pr, "w:showingPlcHdr") is not None
            if kind == "checkbox":
                run["checked"] = checked
                run["text"] = ""
                return run
            if showing:
                run["placeholder"] = text[:120]
                run["text"] = ""
            else:
                run["text"] = text
            if kind == "dropdown":
                lst = child(pr, "w:dropDownList")
                if lst is None:
                    lst = child(pr, "w:comboBox")
                run["options"] = [(li.get(qn("w:displayText")) or li.get(qn("w:value")) or "") for li in lst.findall(qn("w:listItem"))] if lst is not None else []
            if kind == "date":
                run["format"] = val(child(child(pr, "w:date"), "w:dateFormat")) or ""
            if kind in ("text", "richtext") and not showing:
                skip = ("comment", "ins", "del", "fmt")
                content = [common.text_run(r["text"], {k: v for k, v in r["marks"].items() if k not in skip} or None) for r in texts if r.get("marks")]
                if any(r.get("marks") for r in content):
                    run["content"] = [common.text_run(r["text"], {k: v for k, v in (r.get("marks") or {}).items() if k not in skip} or None) for r in texts]
            return run

        def walk(el, link: str | None) -> None:
            for c in el:
                t = c.tag
                if t == qn("w:r"):
                    handle_run(c, link)
                elif t == qn("w:hyperlink"):
                    rid = c.get(qn("r:id"))
                    url = None
                    if rid and rid in part.rels:
                        url = part.rels[rid].target_ref
                    elif c.get(qn("w:anchor")):
                        url = self.anchor_url(c.get(qn("w:anchor")))
                    walk(c, url or link)
                elif t == qn("w:fldSimple"):
                    result = []
                    for r in c.findall(qn("w:r")):
                        rm = run_marks(child(r, "w:rPr"), self.charstyles)
                        result.extend((x, rm) for x in r if x.tag != qn("w:rPr"))
                    finish_field({"instr": c.get(qn("w:instr")) or "", "result": result}, link)
                elif t in (qn("w:ins"), qn("w:del"), qn("w:moveTo"), qn("w:moveFrom")):
                    kind = "ins" if t in (qn("w:ins"), qn("w:moveTo")) else "del"
                    saved = state["rev"].get(kind)
                    state["rev"][kind] = self.rev_info(c)
                    walk(c, link)
                    if saved is None:
                        state["rev"].pop(kind, None)
                    else:
                        state["rev"][kind] = saved
                elif t in (qn("w:smartTag"), qn("w:customXml"), qn("w:dir"), qn("w:bdo")):
                    walk(c, link)
                elif t == qn("w:commentRangeStart"):
                    self.cm_start(c.get(qn("w:id")))
                elif t == qn("w:commentRangeEnd"):
                    self.cm_end(c.get(qn("w:id")))
                elif t == qn("w:bookmarkStart"):
                    name = c.get(qn("w:name")) or ""
                    if docx_rev.BOOKMARK.match(name) and name not in self.bm_seen:
                        self.bm_seen.add(name)
                        run = {"type": "bookmark", "name": name, "text": ""}
                        cur().append(run)
                        state["bm_open"][c.get(qn("w:id"))] = [run, ""]
                elif t == qn("w:bookmarkEnd"):
                    open_bm = state["bm_open"].pop(c.get(qn("w:id")), None)
                    if open_bm and open_bm[1].strip():
                        open_bm[0]["covers"] = open_bm[1][:200]
                elif t == qn("w:sdt"):
                    pr = child(c, "w:sdtPr")
                    content = child(c, "w:sdtContent")
                    cb = pr.find("{%s}checkbox" % W14) if pr is not None else None
                    tag = val(child(pr, "w:tag")) if pr is not None else None
                    if cb is not None:
                        ch = cb.find("{%s}checked" % W14)
                        checked = ch is not None and ch.get("{%s}val" % W14) in ("1", "true")
                        lead = not any(isinstance(s, list) and s for s in items)
                        if tag == "ftxt-check" or (lead and tag is None and child(pr, "w:alias") is None):
                            state["check"] = checked
                            continue
                        cur().append(control_run(pr, "checkbox", "", [], checked))
                        continue
                    kind = None
                    if pr is not None:
                        for name, k in (("w:text", "text"), ("w:richText", "richtext"), ("w:dropDownList", "dropdown"), ("w:comboBox", "dropdown"), ("w:date", "date")):
                            if child(pr, name) is not None:
                                kind = k
                                break
                    if kind is not None and content is not None:
                        mark = len(items)
                        items.append([])
                        walk(content, link)
                        gathered = [r for seg in items[mark:] if isinstance(seg, list) for r in seg]
                        del items[mark:]
                        cur().append(control_run(pr, kind, "", gathered, False))
                        continue
                    if content is not None:
                        walk(content, link)
                elif t in ("{%s}oMath" % M_NS, "{%s}oMathPara" % M_NS):
                    latex = omml.from_omml(c).strip()
                    if latex:
                        cur().append({"type": "math", "latex": latex, **({"display": True} if t.endswith("oMathPara") else {})})
        walk(p, None)
        for open_bm in state["bm_open"].values():
            if open_bm[1].strip():
                open_bm[0]["covers"] = open_bm[1][:200]
        return {"items": items, "check": state["check"]}

    def drawing(self, el, part) -> dict | None:
        if el.tag == "{%s}AlternateContent" % MC:
            choice = el.find("{%s}Choice" % MC)
            el = choice if choice is not None else el
            for c in el:
                got = self.drawing(c, part)
                if got:
                    return got
            return None
        blip = el.find(".//{%s}blip" % A)
        extent = el.find(".//{%s}extent" % WP)
        if blip is None and el.tag == qn("w:pict"):
            return self.vml_image(el, part)
        w = num(extent.get("cx"), 12700) if extent is not None else None
        h = num(extent.get("cy"), 12700) if extent is not None else None
        if blip is not None:
            rid = blip.get(qn("r:embed"))
            if not rid or rid not in part.related_parts:
                return None
            related = part.related_parts[rid]
            alt = ""
            dp = el.find(".//{%s}docPr" % WP)
            if dp is not None:
                alt = dp.get("descr") or ""
            run = self.b.image(related.blob, w, h, alt, str(related.partname).rsplit("/", 1)[-1])
            if run is None:
                return {"type": "text", "text": f"[{alt or 'picture'}]"}
            sr = el.find(".//{%s}srcRect" % A)
            if sr is not None:
                crop = {k: round(min(0.9, (num(sr.get(a)) or 0) / 100000), 4) for k, a in (("t", "t"), ("r", "r"), ("b", "b"), ("l", "l"))}
                crop = {k: v for k, v in crop.items() if v > 0}
                if crop:
                    run["crop"] = crop
            xf = el.find(".//{%s}xfrm" % A)
            if xf is not None and xf.get("rot"):
                rot = (num(xf.get("rot")) or 0) / 60000 % 360
                if rot:
                    run["rotate"] = round(rot, 2)
            anchor = el.find(".//{%s}anchor" % WP)
            if anchor is not None:
                self.anchor_props(anchor, run)
            return run
        tx = None
        for c in el.iter():
            if c.tag.endswith("}txbxContent"):
                tx = c
                break
        if tx is not None and w and h:
            lines = []
            for p in tx.iter(qn("w:p")):
                lines.append("".join(t.text or "" for t in p.iter(qn("w:t"))))
            return {"type": "shape", "kind": "textBox", "width": round(w, 2), "height": round(h, 2), "text": "\n".join(lines).strip(), "fill": "", "stroke": "#000000", "strokeWidth": 0.75, "wrap": "inline"}
        return None

    def anchor_props(self, anchor, run: dict) -> None:
        if anchor.get("behindDoc") == "1":
            run["wrap"] = "behind"
        elif anchor.find("{%s}wrapSquare" % WP) is not None:
            run["wrap"] = "square"
        elif anchor.find("{%s}wrapTight" % WP) is not None or anchor.find("{%s}wrapThrough" % WP) is not None:
            run["wrap"] = "tight"
        elif anchor.find("{%s}wrapTopAndBottom" % WP) is not None:
            run["wrap"] = "topBottom"
            run["side"] = "center"
        else:
            run["wrap"] = "front"
        ph = anchor.find("{%s}positionH" % WP)
        pv = anchor.find("{%s}positionV" % WP)
        if run["wrap"] in ("behind", "front"):
            for tag, key in ((ph, "x"), (pv, "y")):
                off = tag.find("{%s}posOffset" % WP) if tag is not None else None
                if off is not None and off.text:
                    run[key] = round((num(off.text) or 0) / 12700, 2)
            if ph is not None and ph.get("relativeFrom") == "page":
                run["relative"] = "page"
        elif run["wrap"] in ("square", "tight") and ph is not None:
            al = ph.find("{%s}align" % WP)
            if al is not None and al.text == "right":
                run["side"] = "right"

    def vml_image(self, el, part) -> dict | None:
        for c in el.iter():
            if c.tag.endswith("}imagedata"):
                rid = c.get(qn("r:id"))
                if rid and rid in part.related_parts:
                    related = part.related_parts[rid]
                    return self.b.image(related.blob, None, None, "", str(related.partname).rsplit("/", 1)[-1])
        return None

    def table(self, tbl, part) -> dict:
        grid_el = child(tbl, "w:tblGrid")
        grid = [num(g.get(qn("w:w")), 20) or 0 for g in (grid_el if grid_el is not None else [])]
        rows_el = [tr for tr in tbl.iter(qn("w:tr")) if next(tr.iterancestors(qn("w:tbl")), None) is tbl]
        parsed = []
        for tr in rows_el:
            col = 0
            cells = []
            trpr = child(tr, "w:trPr")
            gb = child(trpr, "w:gridBefore")
            if gb is not None:
                col += int(num(val(gb)) or 0)
            for tc in [c for c in tr.iter(qn("w:tc")) if next(c.iterancestors(qn("w:tr")), None) is tr]:
                tcpr = child(tc, "w:tcPr")
                span = int(num(val(child(tcpr, "w:gridSpan"))) or 1)
                vm = child(tcpr, "w:vMerge")
                vmerge = None if vm is None else (vm.get(qn("w:val")) or "continue")
                cells.append({"el": tc, "pr": tcpr, "col": col, "span": span, "vmerge": vmerge})
                col += span
            parsed.append({"cells": cells, "pr": trpr, "tr": tr})
        ncols = max([len(grid)] + [c["col"] + c["span"] for r in parsed for c in r["cells"]] + [1])
        if len(grid) < ncols:
            known = sum(grid)
            grid = grid + [round(max(36.0, (468 - known) / max(1, ncols - len(grid))), 2)] * (ncols - len(grid))
        rows_out = []
        header_flags = [on(child(r["pr"], "w:tblHeader")) if child(r["pr"], "w:tblHeader") is not None else False for r in parsed]
        no_split = any(child(r["pr"], "w:cantSplit") is not None and on(child(r["pr"], "w:cantSplit")) for r in parsed)
        for ri, r in enumerate(parsed):
            cells = []
            for c in r["cells"]:
                if c["vmerge"] == "continue":
                    continue
                rowspan = 1
                if c["vmerge"] == "restart":
                    for nr in parsed[ri + 1:]:
                        match = next((x for x in nr["cells"] if x["col"] == c["col"] and x["vmerge"] == "continue"), None)
                        if match is None:
                            break
                        rowspan += 1
                cell: dict = {}
                body = self.blocks(list(c["el"]), part)
                if not body or body[-1]["type"] != "paragraph":
                    body.append(common.para("Normal", [], self.section_id))
                body = [b for b in body if b["type"] not in ("pageBreak", "sectionBreak", "columnBreak")] or [common.para("Normal", [], self.section_id)]
                cell["body"] = body
                if header_flags[ri]:
                    cell["header"] = True
                if c["span"] > 1:
                    cell["colspan"] = c["span"]
                if rowspan > 1:
                    cell["rowspan"] = rowspan
                pr = c["pr"]
                sh = child(pr, "w:shd")
                if sh is not None:
                    fill = sh.get(qn("w:fill"))
                    if fill and re.fullmatch(r"[0-9a-fA-F]{6}", fill):
                        cell["shading"] = "#" + fill.lower()
                va = val(child(pr, "w:vAlign"))
                if va in ("center", "bottom"):
                    cell["valign"] = "middle" if va == "center" else "bottom"
                td = val(child(pr, "w:textDirection"))
                if td in ("btLr", "tbRl", "tbRlV", "btLrV"):
                    cell["textDirection"] = "rotate270" if td.startswith("btLr") else "rotate90"
                tb = child(pr, "w:tcBorders")
                if tb is not None:
                    borders = {}
                    for side, names in (("top", ("top",)), ("right", ("right", "end")), ("bottom", ("bottom",)), ("left", ("left", "start"))):
                        for nm in names:
                            spec = border_spec(child(tb, "w:" + nm))
                            if spec:
                                borders[side] = spec
                                break
                    if borders:
                        cell["borders"] = borders
                cells.append(cell)
            row_out: dict = {"cells": cells}
            th = child(r["pr"], "w:trHeight")
            height = num(val(th), 20) if th is not None else None
            if height and height > 0:
                row_out = {"height": round(height, 2), "cells": cells}
            rows_out.append(row_out)
        pr = child(tbl, "w:tblPr")
        sid = val(child(pr, "w:tblStyle"))
        direct = child(pr, "w:tblBorders")
        if direct is not None:
            grid_look = any((val(c) or "single") not in ("nil", "none") for c in direct)
        else:
            grid_look = self.table_styles.get(sid or "", False)
        block = common.table_block([r["cells"] for r in rows_out], [round(w, 2) for w in grid], "grid" if grid_look else "plain")
        block["rows"] = rows_out
        if no_split:
            block["rowSplit"] = False
        if not any(header_flags):
            block.pop("repeatHeader", None)
        else:
            block["repeatHeader"] = True
        if val(child(pr, "w:jc")) == "center":
            block["align"] = "center"
        cm = child(pr, "w:tblCellMar")
        if cm is not None:
            margins = {}
            for side, names in (("top", ("top",)), ("right", ("right", "end")), ("bottom", ("bottom",)), ("left", ("left", "start"))):
                for nm in names:
                    v = num(val(child(cm, "w:" + nm), "w:w"), 20)
                    if v is not None:
                        margins[side] = round(max(0.0, v), 2)
                        break
            if margins:
                block["cellMargins"] = {"top": 0.0, "right": 0.0, "bottom": 0.0, "left": 0.0, **margins}
        return block


def read(data: bytes, name: str) -> tuple[dict, dict[str, bytes]]:
    try:
        return Reader(data, name).read()
    except common.Unsupported:
        raise
    except (KeyError, ValueError, AttributeError, TypeError, zipfile.BadZipFile, etree.XMLSyntaxError) as exc:
        raise common.Unsupported(f"{name}: could not be read as a Word document ({exc}).") from exc
