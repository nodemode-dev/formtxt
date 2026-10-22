import io
import re
import zipfile

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER, WD_UNDERLINE
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Emu, Pt, RGBColor, Twips
from docx.table import _Cell

from xml.sax.saxutils import escape, quoteattr

from app.services.exchange import common, docx_comments, docx_rev, notes, omml

RPR_ORDER = ["rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike", "dstrike", "outline", "shadow", "emboss", "imprint",
             "noProof", "snapToGrid", "vanish", "webHidden", "color", "spacing", "w", "kern", "position", "sz", "szCs", "highlight", "u",
             "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath"]
PPR_ORDER = ["pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl", "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs",
             "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd",
             "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection", "textAlignment",
             "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr", "pPrChange"]
SECT_ORDER = ["headerReference", "footerReference", "footnotePr", "endnotePr", "type", "pgSz", "pgMar", "paperSrc", "pgBorders", "lnNumType",
              "pgNumType", "cols", "formProt", "vAlign", "noEndnote", "titlePg", "textDirection", "bidi", "rtlGutter", "docGrid", "printerSettings", "sectPrChange"]
TBLPR_ORDER = ["tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize", "tblStyleColBandSize", "tblW", "jc", "tblCellSpacing", "tblInd",
               "tblBorders", "shd", "tblLayout", "tblCellMar", "tblLook"]
TCPR_ORDER = ["cnfStyle", "tcW", "gridSpan", "hMerge", "vMerge", "tcBorders", "shd", "noWrap", "tcMar", "textDirection", "tcFitText", "vAlign", "hideMark"]
TRPR_ORDER = ["cnfStyle", "divId", "gridBefore", "gridAfter", "wBefore", "wAfter", "cantSplit", "trHeight", "tblHeader", "tblCellSpacing", "jc", "hidden"]
ALIGN = {"left": WD_ALIGN_PARAGRAPH.LEFT, "center": WD_ALIGN_PARAGRAPH.CENTER, "right": WD_ALIGN_PARAGRAPH.RIGHT, "justify": WD_ALIGN_PARAGRAPH.JUSTIFY}
UNDERLINE = {True: WD_UNDERLINE.SINGLE, "single": WD_UNDERLINE.SINGLE, "double": WD_UNDERLINE.DOUBLE, "dotted": WD_UNDERLINE.DOTTED, "dash": WD_UNDERLINE.DASH, "wavy": WD_UNDERLINE.WAVY}
BORDER_STYLE = {"solid": "single", "dashed": "dash", "dotted": "dotted", "double": "double", "none": "nil"}
START = {"nextPage": WD_SECTION.NEW_PAGE, "continuous": WD_SECTION.CONTINUOUS, "evenPage": WD_SECTION.EVEN_PAGE, "oddPage": WD_SECTION.ODD_PAGE}
NUMFMT = {"decimal": "decimal", "decimal-leading-zero": "decimalZero", "lower-alpha": "lowerLetter", "upper-alpha": "upperLetter", "lower-roman": "lowerRoman", "upper-roman": "upperRoman"}
FIELD_TOKEN = re.compile(r"\{(PAGE|NUMPAGES)\}")
DOTX = "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"


W14_NS = "http://schemas.microsoft.com/office/word/2010/wordml"
TEXT_DIRECTION = {"rotate90": "tbRl", "rotate270": "btLr"}


def block_lists(blocks: list[dict]):
    yield blocks
    for b in blocks:
        if b.get("type") == "table":
            for row in b.get("rows") or []:
                for c in (row.get("cells") if isinstance(row, dict) else row) or []:
                    yield from block_lists(c.get("body") or [])


def local(el) -> str:
    return el.tag.rsplit("}", 1)[-1]


def ins(parent, child, order: list[str]):
    idx = order.index(local(child))
    for sib in parent:
        name = local(sib)
        if name in order and order.index(name) > idx:
            sib.addprevious(child)
            return child
    parent.append(child)
    return child


def put(parent, tag: str, order: list[str], **attrs):
    for old in parent.findall(qn(tag)):
        parent.remove(old)
    el = OxmlElement(tag)
    for k, v in attrs.items():
        el.set(qn("w:" + k), str(v))
    return ins(parent, el, order)


def twips(pt: float) -> int:
    return int(round(float(pt) * 20))


def shd(fill: str) -> object:
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:color"), "auto")
    el.set(qn("w:fill"), fill.lstrip("#").upper())
    return el


class DocxWriter:
    def __init__(self, doc: dict, media: dict[str, bytes]) -> None:
        self.src = doc
        self.media = media
        self.d = Document()
        self.styles = doc.get("styles") or {}
        self.sections = {s["id"]: s for s in doc.get("sections", [])}
        self.order = list(doc.get("sections", []))
        self.num_root = None
        self.next_abs = 1
        self.next_num = 1
        self.used_cells: set = set()
        self.pending_break = False
        self.seen_hf: set[str] = set()
        self.fn_ids: dict[str, int] = {}
        self.rev_n = 100
        self.sdt_n = 1000
        self.pid_bm: dict[str, str] = {}
        self.pmark: dict[str, dict] = {}
        self.cm_order: list[str] = []
        self.cm_map: dict[str, dict] = {}
        self.cm_open: list[str] = []
        self.cm_started: set[str] = set()
        self.last_p = None
        self.fresh = False
        self.grp = None
        self.has_toc = False

    def next_rev(self) -> int:
        self.rev_n += 1
        return self.rev_n

    def prepass(self) -> None:
        wanted: set[str] = set()
        exist: set[str] = set()
        comments = self.src.get("comments") or {}
        seen: list[str] = []
        for tab in common.doc_tabs(self.src):
            for lst in block_lists(tab.get("body") or []):
                for i, b in enumerate(lst):
                    kind = b.get("type")
                    if kind == "toc":
                        self.has_toc = True
                        for e in b.get("entries") or []:
                            tg = str(e.get("target") or "")
                            if tg and not tg.startswith(("bm:", "note:")):
                                wanted.add(tg)
                    if kind != "paragraph":
                        continue
                    if b.get("id"):
                        exist.add(b["id"])
                    props = b.get("props") or {}
                    nxt = lst[i + 1] if i + 1 < len(lst) else None
                    if nxt is not None and nxt.get("type") == "paragraph" and (nxt.get("props") or {}).get("rvSplit"):
                        self.pmark.setdefault(b.get("id"), {})["ins"] = nxt["props"]["rvSplit"]
                    if props.get("rvJoin"):
                        self.pmark.setdefault(b.get("id"), {})["del"] = props["rvJoin"]
                    for r in b.get("content") or []:
                        t = r.get("type")
                        if t == "text":
                            marks = r.get("marks") or {}
                            link = str(marks.get("link") or "")
                            if link.startswith("#") and not link.startswith("#bm:") and len(link) > 1:
                                wanted.add(link[1:])
                            for cid in docx_rev.ids_of(marks.get("comment")):
                                if cid in comments and cid not in seen:
                                    seen.append(cid)
                        elif t == "crossRef" and r.get("kind") in ("heading", "caption") and r.get("target"):
                            wanted.add(str(r["target"]))
        n = 0
        for pid in sorted(wanted & exist):
            n += 1
            self.pid_bm[pid] = f"_Toc{200000000 + n}"
        counter = 0
        for fid in seen:
            c = comments[fid]
            counter += 1
            info = {"id": counter - 1, "replies": []}
            for _ in c.get("replies") or []:
                counter += 1
                info["replies"].append(counter - 1)
            self.cm_map[fid] = info
            self.cm_order.append(fid)

    def build(self) -> Document:
        self.prepass()
        self.metadata()
        self.setup_styles()
        self.setup_numbering()
        self.setup_settings()
        self.notes = notes.DocxNotes(self, self.src.get("notes") or {})
        first = self.order[0] if self.order else None
        if first:
            self.configure(self.d.sections[0], first)
        body = self.d._body._body
        for child in list(body):
            if local(child) == "p":
                body.remove(child)
        tabs = common.doc_tabs(self.src)
        depth: dict[str, int] = {}
        for i, tab in enumerate(tabs):
            level = depth.get(tab.get("parent") or "", -1) + 1
            depth[tab["id"]] = level
            if len(tabs) > 1:
                self.emit_blocks(self.d, [common.para(f"Heading{min(level + 1, 9)}", [common.text_run(str(tab.get("title") or f"Tab {i + 1}"))], "")])
            self.emit_blocks(self.d, tab.get("body") or [])
        if self.pending_break:
            self.flush_break(self.d)
        self.cm_flush()
        docx_comments.write(self)
        self.notes.finish()
        last = body.findall(qn("w:p"))
        if not last and not body.findall(qn("w:tbl")):
            self.d.add_paragraph()
        if body.findall(qn("w:tbl")) and local(body[-2] if len(body) > 1 and local(body[-1]) == "sectPr" else body[-1]) == "tbl":
            self.d.add_paragraph()
        return self.d

    def metadata(self) -> None:
        meta = self.src.get("meta") or {}
        cp = self.d.core_properties
        cp.title = str(self.src.get("title") or "")
        cp.author = str(meta.get("author") or "")
        cp.subject = str(meta.get("subject") or "")
        kw = meta.get("keywords")
        cp.keywords = ", ".join(kw) if isinstance(kw, list) else str(kw or "")
        cp.language = str(meta.get("language") or "")
        import datetime
        for attr, key in (("created", "created"), ("modified", "modified")):
            v = meta.get(key)
            if isinstance(v, (int, float)) and v > 0:
                setattr(cp, attr, datetime.datetime.fromtimestamp(v, datetime.timezone.utc).replace(tzinfo=None))

    def setup_settings(self) -> None:
        st = self.src.get("settings") or {}
        settings = self.d.settings
        if st.get("evenOdd"):
            settings.odd_and_even_pages_header_footer = True
        tab = st.get("defaultTab")
        if isinstance(tab, (int, float)) and tab > 0:
            el = settings.element
            for old in el.findall(qn("w:defaultTabStop")):
                el.remove(old)
            node = OxmlElement("w:defaultTabStop")
            node.set(qn("w:val"), str(twips(tab)))
            anchor = el.find(qn("w:zoom"))
            if anchor is not None:
                anchor.addnext(node)
            else:
                el.insert(0, node)
        variables = self.src.get("variables")
        if isinstance(variables, dict) and variables:
            dv = OxmlElement("w:docVars")
            for name, value in variables.items():
                item = OxmlElement("w:docVar")
                item.set(qn("w:name"), str(name))
                item.set(qn("w:val"), str(value))
                dv.append(item)
            el = settings.element
            anchor = el.find(qn("w:compat"))
            if anchor is not None:
                anchor.addnext(dv)
            else:
                after = next((c for c in el if local(c) in ("rsids", "mathPr", "themeFontLang", "clrSchemeMapping")), None)
                if after is not None:
                    after.addprevious(dv)
                else:
                    el.append(dv)
        if st.get("trackChanges"):
            node = OxmlElement("w:trackRevisions")
            el = settings.element
            anchor = el.find(qn("w:zoom"))
            if anchor is not None:
                anchor.addnext(node)
            else:
                el.insert(0, node)

    def style_by_id(self, sid: str):
        for st in self.d.styles.element.findall(qn("w:style")):
            if st.get(qn("w:styleId")) == sid:
                return st
        return None

    def setup_styles(self) -> None:
        styles = self.d.styles
        root = styles.element
        defaults = {"CodeBlock": {"type": "paragraph", "name": "Code Block", "basedOn": "Normal", "next": "Normal",
                                  "run": {"font": "Consolas", "size": 10.0}, "para": {"spaceAfter": 8.0, "lineSpacing": 1.0}}}
        defaults["PlaceholderText"] = {"type": "character", "name": "Placeholder Text", "run": {"color": "#808080"}}
        if self.has_toc:
            defaults["TOCHeading"] = {"type": "paragraph", "name": "TOC Heading", "basedOn": "Normal", "next": "Normal",
                                      "run": {"size": 16.0, "bold": True}, "para": {"spaceBefore": 12.0, "spaceAfter": 6.0}}
            for n in range(1, 4):
                defaults[f"TOC{n}"] = {"type": "paragraph", "name": f"toc {n}", "basedOn": "Normal", "next": "Normal",
                                       "run": {}, "para": {"spaceAfter": 5.0, "indentLeft": 11.0 * (n - 1)}}
        everything = {**defaults, **{k: v for k, v in self.styles.items() if isinstance(v, dict)}}
        made: dict[str, object] = {}
        for sid, spec in everything.items():
            kind = spec.get("type")
            if kind not in ("paragraph", "character"):
                continue
            el = self.style_by_id(sid)
            if el is None:
                try:
                    obj = styles.add_style(str(spec.get("name") or sid), WD_STYLE_TYPE.PARAGRAPH if kind == "paragraph" else WD_STYLE_TYPE.CHARACTER)
                except ValueError:
                    obj = styles[str(spec.get("name") or sid)]
                obj.element.set(qn("w:styleId"), sid)
                el = obj.element
            for tag in ("w:rPr", "w:pPr", "w:basedOn", "w:next", "w:link", "w:uiPriority", "w:semiHidden", "w:unhideWhenUsed"):
                for old in el.findall(qn(tag)):
                    el.remove(old)
            nm = el.find(qn("w:name"))
            if nm is not None:
                nm.set(qn("w:val"), str(spec.get("name") or sid))
            made[sid] = el
        for sid, el in made.items():
            spec = everything[sid]
            for tag, key in (("w:basedOn", "basedOn"), ("w:next", "next")):
                target = spec.get(key)
                if target and target != sid and (target in made or self.style_by_id(target) is not None):
                    node = OxmlElement(tag)
                    node.set(qn("w:val"), target)
                    name = el.find(qn("w:name"))
                    prev = el.find(qn("w:basedOn")) if tag == "w:next" else None
                    (prev if prev is not None else name).addnext(node)
            if not el.findall(qn("w:qFormat")):
                el.append(OxmlElement("w:qFormat"))
            self.style_props(el, spec)

    def style_props(self, el, spec: dict) -> None:
        run = spec.get("run") or {}
        para = spec.get("para") or {}
        if spec.get("type") == "paragraph" and para:
            ppr = OxmlElement("w:pPr")
            self.apply_para(ppr, para)
            if para.get("outlineLevel"):
                put(ppr, "w:outlineLvl", PPR_ORDER, val=int(para["outlineLevel"]) - 1)
            if len(ppr):
                self.insert_style_child(el, ppr)
        if run:
            rpr = OxmlElement("w:rPr")
            self.apply_run_pr(rpr, run)
            if len(rpr):
                self.insert_style_child(el, rpr)

    def insert_style_child(self, el, child) -> None:
        order = ["name", "aliases", "basedOn", "next", "link", "autoRedefine", "hidden", "uiPriority", "semiHidden", "unhideWhenUsed", "qFormat", "locked",
                 "personal", "personalCompose", "personalReply", "rsid", "pPr", "rPr", "tblPr", "trPr", "tcPr", "tblStylePr"]
        ins(el, child, order)

    def apply_run_pr(self, rpr, marks: dict) -> None:
        font = marks.get("font")
        if font:
            put(rpr, "w:rFonts", RPR_ORDER, ascii=font, hAnsi=font, cs=font, eastAsia=font)
        if marks.get("code") and not font:
            put(rpr, "w:rFonts", RPR_ORDER, ascii="Consolas", hAnsi="Consolas", cs="Consolas", eastAsia="Consolas")
        for key, tag in (("bold", "w:b"), ("italic", "w:i"), ("allCaps", "w:caps"), ("smallCaps", "w:smallCaps"), ("strike", "w:strike")):
            if marks.get(key):
                put(rpr, tag, RPR_ORDER)
        if marks.get("color"):
            put(rpr, "w:color", RPR_ORDER, val=common.hex_color(marks["color"], "000000").upper())
        if marks.get("spacing") not in (None, 0):
            put(rpr, "w:spacing", RPR_ORDER, val=twips(float(marks["spacing"])))
        if marks.get("size"):
            half = int(round(float(marks["size"]) * 2))
            put(rpr, "w:sz", RPR_ORDER, val=half)
            put(rpr, "w:szCs", RPR_ORDER, val=half)
        underline = marks.get("underline")
        if underline:
            val = {"double": "double", "dotted": "dotted", "dash": "dash", "wavy": "wave"}.get(underline, "single") if underline is not True else "single"
            put(rpr, "w:u", RPR_ORDER, val=val)
        if marks.get("highlight"):
            for old in rpr.findall(qn("w:shd")):
                rpr.remove(old)
            ins(rpr, shd(marks["highlight"]), RPR_ORDER)
        if marks.get("superscript"):
            put(rpr, "w:vertAlign", RPR_ORDER, val="superscript")
        elif marks.get("subscript"):
            put(rpr, "w:vertAlign", RPR_ORDER, val="subscript")

    def apply_para(self, ppr, props: dict) -> None:
        if props.get("keepNext") or props.get("keepWithNext"):
            put(ppr, "w:keepNext", PPR_ORDER)
        if props.get("keepLines"):
            put(ppr, "w:keepLines", PPR_ORDER)
        if props.get("widowControl") is not None:
            put(ppr, "w:widowControl", PPR_ORDER, val="1" if props["widowControl"] else "0")
        border = props.get("border")
        if border:
            sides = ("top", "left", "bottom", "right") if border == "box" else (border,)
            bd = OxmlElement("w:pBdr")
            for side in sides:
                s = OxmlElement("w:" + side)
                s.set(qn("w:val"), "single")
                s.set(qn("w:sz"), "4")
                s.set(qn("w:space"), "4")
                s.set(qn("w:color"), "auto")
                bd.append(s)
            ins(ppr, bd, PPR_ORDER)
        if props.get("shading"):
            ins(ppr, shd(props["shading"]), PPR_ORDER)
        tabs = props.get("tabs")
        if tabs:
            node = OxmlElement("w:tabs")
            for t in tabs:
                tab = OxmlElement("w:tab")
                tab.set(qn("w:val"), {"center": "center", "right": "right", "decimal": "decimal"}.get(t.get("align"), "left"))
                leader = {"dot": "dot", "dash": "hyphen", "underline": "underscore"}.get(t.get("leader"))
                if leader:
                    tab.set(qn("w:leader"), leader)
                tab.set(qn("w:pos"), str(twips(t.get("pos", 0))))
                node.append(tab)
            ins(ppr, node, PPR_ORDER)
        sp = {}
        if props.get("spaceBefore") is not None:
            sp["before"] = twips(props["spaceBefore"])
        if props.get("spaceAfter") is not None:
            sp["after"] = twips(props["spaceAfter"])
        if props.get("lineSpacing"):
            sp["line"] = int(round(float(props["lineSpacing"]) * 240))
            sp["lineRule"] = "auto"
        if sp:
            put(ppr, "w:spacing", PPR_ORDER, **sp)
        ind = {}
        if props.get("indentLeft") is not None or props.get("indent") is not None:
            ind["left"] = twips(props.get("indentLeft", props.get("indent")))
        if props.get("indentRight") is not None:
            ind["right"] = twips(props["indentRight"])
        first = props.get("indentFirst")
        if first:
            ind["hanging" if first < 0 else "firstLine"] = twips(abs(first))
        if ind:
            put(ppr, "w:ind", PPR_ORDER, **ind)
        if props.get("align") in ALIGN:
            put(ppr, "w:jc", PPR_ORDER, val={"justify": "both"}.get(props["align"], props["align"]))

    def setup_numbering(self) -> None:
        part = self.d.part.numbering_part
        self.num_root = part.element
        for child in list(self.num_root):
            self.num_root.remove(child)

    def add_abstract(self, items: list[dict]) -> int:
        levels: dict[int, dict] = {}
        for it in items:
            lv = min(int(it.get("level", 0) or 0), 8)
            levels.setdefault(lv, it)
        aid = self.next_abs
        self.next_abs += 1
        lvls = []
        for lv in range(9):
            it = levels.get(lv) or levels.get(0) or {}
            kind = it.get("kind", "bullet")
            left, hang = 720 + 360 * lv, 360
            if kind == "number":
                fmt = common.list_format(it if lv in levels else {}, lv)
                pre, suf = it.get("prefix", ""), it.get("suffix", ".")
                text = f"{pre}%{lv + 1}{'.' if suf is None else suf}"
                first = int(it.get("start") or 1) if lv in levels else 1
                lvls.append(f'<w:lvl w:ilvl="{lv}"><w:start w:val="{first}"/><w:numFmt w:val="{NUMFMT[fmt]}"/><w:lvlText w:val="{text}"/><w:lvlJc w:val="left"/>'
                            f'<w:pPr><w:ind w:left="{left}" w:hanging="{hang}"/></w:pPr></w:lvl>')
            else:
                ch = (it.get("bullet") if lv in levels else None) or ("•", "◦", "▪")[lv % 3]
                from xml.sax.saxutils import quoteattr
                lvls.append(f'<w:lvl w:ilvl="{lv}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val={quoteattr(ch)}/><w:lvlJc w:val="left"/>'
                            f'<w:pPr><w:ind w:left="{left}" w:hanging="{hang}"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:lvl>')
        xml = f'<w:abstractNum {nsdecls("w")} w:abstractNumId="{aid}"><w:multiLevelType w:val="multilevel"/>{"".join(lvls)}</w:abstractNum>'
        node = parse_xml(xml)
        first_num = self.num_root.find(qn("w:num"))
        if first_num is not None:
            first_num.addprevious(node)
        else:
            self.num_root.append(node)
        return aid

    def add_num(self, aid: int, level: int | None = None, start: int | None = None) -> int:
        nid = self.next_num
        self.next_num += 1
        over = ""
        if level is not None and start is not None:
            over = f'<w:lvlOverride w:ilvl="{level}"><w:startOverride w:val="{start}"/></w:lvlOverride>'
        self.num_root.append(parse_xml(f'<w:num {nsdecls("w")} w:numId="{nid}"><w:abstractNumId w:val="{aid}"/>{over}</w:num>'))
        return nid

    def flush_break(self, container) -> None:
        p = container.add_paragraph()
        p.add_run().add_break(__import__("docx.enum.text", fromlist=["WD_BREAK"]).WD_BREAK.PAGE)
        self.pending_break = False

    def configure(self, sec, s: dict) -> None:
        sp = sec._sectPr
        page = s.get("page") or {}
        m = s.get("margins") or {}
        sec.orientation = WD_ORIENT.LANDSCAPE if page.get("orientation") == "landscape" else WD_ORIENT.PORTRAIT
        sec.page_width = Pt(float(page.get("width", 612)))
        sec.page_height = Pt(float(page.get("height", 792)))
        sec.top_margin = Pt(float(m.get("top", 72)))
        sec.bottom_margin = Pt(float(m.get("bottom", 72)))
        sec.left_margin = Pt(float(m.get("left", 72)))
        sec.right_margin = Pt(float(m.get("right", 72)))
        sec.header_distance = Pt(float(m.get("header", 36)))
        sec.footer_distance = Pt(float(m.get("footer", 36)))
        sec.gutter = Pt(float(m.get("gutter", 0)))
        cols = s.get("columns") or {}
        for old in sp.findall(qn("w:cols")):
            sp.remove(old)
        if int(cols.get("count", 1) or 1) > 1:
            put(sp, "w:cols", SECT_ORDER, num=int(cols["count"]), space=twips(cols.get("gap", 36)))
        if s.get("titlePage"):
            put(sp, "w:titlePg", SECT_ORDER)
        else:
            for old in sp.findall(qn("w:titlePg")):
                sp.remove(old)
        if s.get("pageNumberStart") is not None or s.get("pageNumberFormat"):
            attrs = {}
            if s.get("pageNumberStart") is not None:
                attrs["start"] = int(s["pageNumberStart"])
            if s.get("pageNumberFormat"):
                attrs["fmt"] = s["pageNumberFormat"]
            put(sp, "w:pgNumType", SECT_ORDER, **attrs)
        border = s.get("pageBorder")
        if border:
            bd = OxmlElement("w:pgBorders")
            bd.set(qn("w:offsetFrom"), "page")
            for side in ("top", "left", "bottom", "right"):
                e = OxmlElement("w:" + side)
                e.set(qn("w:val"), "double" if border == "double" else "single")
                e.set(qn("w:sz"), "12" if border == "accent" else "4")
                e.set(qn("w:space"), "24")
                e.set(qn("w:color"), "4472C4" if border == "accent" else "auto")
                bd.append(e)
            for old in sp.findall(qn("w:pgBorders")):
                sp.remove(old)
            ins(sp, bd, SECT_ORDER)
        ln = (self.src.get("settings") or {}).get("lineNumbers")
        if ln:
            put(sp, "w:lnNumType", SECT_ORDER, countBy=1, restart="newPage" if ln == "page" else "continuous")
        if s.get("pageColor") and sec is self.d.sections[0]:
            bg = OxmlElement("w:background")
            bg.set(qn("w:color"), common.hex_color(s["pageColor"], "ffffff").upper())
            self.d.element.insert(0, bg)
            disp = OxmlElement("w:displayBackgroundShape")
            self.d.settings.element.insert(0, disp)
        self.headers(sec, s)

    def headers(self, sec, s: dict) -> None:
        evenodd = bool((self.src.get("settings") or {}).get("evenOdd"))
        for kind, getter in (("headers", lambda k: {"default": sec.header, "first": sec.first_page_header, "even": sec.even_page_header}[k]),
                             ("footers", lambda k: {"default": sec.footer, "first": sec.first_page_footer, "even": sec.even_page_footer}[k])):
            spec = s.get(kind) or {}
            for key in ("default", "first", "even"):
                if key == "first" and not s.get("titlePage"):
                    continue
                if key == "even" and not evenodd:
                    continue
                item = spec.get(key)
                tag = f"{kind}:{key}"
                if item and (item.get("text") or "").strip():
                    hf = getter(key)
                    hf.is_linked_to_previous = False
                    self.hf_fill(hf, item)
                    self.seen_hf.add(tag)
                elif tag in self.seen_hf:
                    getter(key).is_linked_to_previous = False

    def hf_fill(self, hf, item: dict) -> None:
        paras = hf.paragraphs
        lines = str(item.get("text") or "").split("\n")
        for i, line in enumerate(lines):
            p = paras[0] if i == 0 else hf.add_paragraph()
            for old in list(p._p):
                if local(old) != "pPr":
                    p._p.remove(old)
            p.alignment = ALIGN.get(item.get("align"), WD_ALIGN_PARAGRAPH.LEFT)
            pos = 0
            for m in FIELD_TOKEN.finditer(line):
                if m.start() > pos:
                    p.add_run(line[pos:m.start()])
                self.field_runs(p, m.group(1), "1")
                pos = m.end()
            if pos < len(line):
                p.add_run(line[pos:])
            try:
                p.style = "Footer" if hf.__class__.__name__ == "_Footer" else "Header"
            except Exception:
                pass

    def field_runs(self, p, instr: str, result: str, marks: dict | None = None) -> None:
        def run_with(child):
            r = p.add_run()
            if marks:
                self.mark_run(r, marks)
            r._r.append(child)
            return r

        def fc(kind):
            e = OxmlElement("w:fldChar")
            e.set(qn("w:fldCharType"), kind)
            return e
        run_with(fc("begin"))
        t = OxmlElement("w:instrText")
        t.set(qn("xml:space"), "preserve")
        t.text = f" {instr} "
        run_with(t)
        run_with(fc("separate"))
        r = p.add_run(result)
        if marks:
            self.mark_run(r, marks)
        run_with(fc("end"))

    def mark_run(self, run, marks: dict) -> None:
        rpr = run._r.get_or_add_rPr()
        self.apply_run_pr(rpr, marks)
        fmt = marks.get("fmt")
        if isinstance(fmt, dict):
            chg = self.rev_el("w:rPrChange", fmt)
            prev = OxmlElement("w:rPr")
            self.apply_run_pr(prev, docx_rev.undo(marks, fmt.get("ops") or []))
            chg.append(prev)
            rpr.append(chg)

    def rev_el(self, tag: str, rv: dict):
        el = OxmlElement(tag)
        el.set(qn("w:id"), str(self.next_rev()))
        el.set(qn("w:author"), str(rv.get("author") or "Unknown"))
        el.set(qn("w:date"), docx_rev.iso(rv.get("time")))
        return el

    def rev_wrap(self, p, node, marks: dict, group: bool):
        ins_m, del_m = marks.get("ins"), marks.get("del")
        if not isinstance(ins_m, dict) and not isinstance(del_m, dict):
            return node
        ins_m = ins_m if isinstance(ins_m, dict) else None
        del_m = del_m if isinstance(del_m, dict) else None
        key = ((ins_m or {}).get("id"), (del_m or {}).get("id"))
        if group and self.grp and self.grp[0] == key and self.grp[1].getparent() is p._p and p._p[-1] is self.grp[1]:
            self.grp[2].append(node)
            return None
        outer = inner = None
        if ins_m:
            outer = inner = self.rev_el("w:ins", ins_m)
        if del_m:
            d = self.rev_el("w:del", del_m)
            if outer is None:
                outer = d
            else:
                outer.append(d)
            inner = d
        inner.append(node)
        if group:
            p._p.append(outer)
            self.grp = (key, outer, inner)
        return outer

    def paragraph_mark(self, ppr, pm: dict) -> None:
        rpr = OxmlElement("w:rPr")
        for kind in ("ins", "del"):
            if isinstance(pm.get(kind), dict):
                rpr.append(self.rev_el("w:" + kind, pm[kind]))
        if len(rpr):
            ins(ppr, rpr, PPR_ORDER)

    def bookmark_pair(self, p, name: str, point: bool = True):
        self.rev_n += 1
        start = OxmlElement("w:bookmarkStart")
        start.set(qn("w:id"), str(self.rev_n))
        start.set(qn("w:name"), name)
        p._p.append(start)
        if point:
            self.bookmark_end(p, self.rev_n)
        return self.rev_n

    def bookmark_end(self, p, bid: int) -> None:
        end = OxmlElement("w:bookmarkEnd")
        end.set(qn("w:id"), str(bid))
        p._p.append(end)

    def sync_comments(self, p, ids: list[str]) -> None:
        target = self.last_p if (self.fresh and self.last_p is not None) else p
        for fid in list(self.cm_open):
            if fid not in ids:
                self.cm_close(target, fid)
        for fid in ids:
            if fid in self.cm_map and fid not in self.cm_started:
                info = self.cm_map[fid]
                for n in [info["id"]] + info["replies"]:
                    el = OxmlElement("w:commentRangeStart")
                    el.set(qn("w:id"), str(n))
                    p._p.append(el)
                self.cm_started.add(fid)
                self.cm_open.append(fid)

    def cm_close(self, p, fid: str) -> None:
        info = self.cm_map[fid]
        nums = [info["id"]] + info["replies"]
        for n in nums:
            el = OxmlElement("w:commentRangeEnd")
            el.set(qn("w:id"), str(n))
            p._p.append(el)
        for n in nums:
            r = OxmlElement("w:r")
            ref = OxmlElement("w:commentReference")
            ref.set(qn("w:id"), str(n))
            r.append(ref)
            p._p.append(r)
        self.cm_open.remove(fid)

    def cm_flush(self) -> None:
        if self.last_p is None:
            self.cm_open = []
            return
        for fid in list(self.cm_open):
            self.cm_close(self.last_p, fid)

    def container_paragraph(self, container):
        if isinstance(container, _Cell) and container._tc not in self.used_cells:
            self.used_cells.add(container._tc)
            return container.paragraphs[0]
        return container.add_paragraph()

    def emit_blocks(self, container, blocks: list[dict]) -> None:
        i = 0
        n = len(blocks)
        while i < n:
            b = blocks[i]
            kind = b.get("type")
            if kind == "paragraph" and b.get("list"):
                j = i
                run = []
                kinds: dict[int, str] = {}
                while j < n and blocks[j].get("type") == "paragraph" and blocks[j].get("list"):
                    lst = blocks[j]["list"]
                    lv = min(int(lst.get("level", 0) or 0), 8)
                    if lst.get("kind") != "check":
                        if kinds.setdefault(lv, lst.get("kind")) != lst.get("kind") or (run and lv == 0 and lst.get("start") is not None and lst.get("kind") == "number"):
                            break
                    run.append(blocks[j])
                    j += 1
                self.emit_list(container, run)
                i = j
                continue
            self.emit_block(container, b)
            i += 1

    def emit_list(self, container, items: list[dict]) -> None:
        lists = [it["list"] for it in items]
        aid = self.add_abstract([l for l in lists if l.get("kind") in ("bullet", "number")] or [{"kind": "bullet"}])
        nid = self.add_num(aid)
        for it in items:
            lst = it["list"]
            level = min(int(lst.get("level", 0) or 0), 8)
            if lst.get("kind") == "check":
                self.emit_paragraph(container, it, None, check=lst)
                continue
            if lst.get("kind") == "number" and lst.get("start") is not None:
                nid = self.add_num(aid, level, int(lst["start"]))
            self.emit_paragraph(container, it, (nid, level))

    def emit_block(self, container, b: dict) -> None:
        kind = b.get("type")
        if kind == "paragraph":
            self.emit_paragraph(container, b, None)
        elif kind == "code":
            p = self.container_paragraph(container)
            self.flush_pending(p)
            p._p.get_or_add_pPr().style = "CodeBlock"
            lines = str(b.get("text", "")).split("\n")
            for i, line in enumerate(lines):
                r = p.add_run(line)
                if i < len(lines) - 1:
                    r.add_break()
            ppr = p._p.get_or_add_pPr()
            ins(ppr, shd("f2f2f2"), PPR_ORDER)
        elif kind == "pageBreak":
            self.pending_break = True
        elif kind == "columnBreak":
            from docx.enum.text import WD_BREAK
            p = self.container_paragraph(container)
            p.add_run().add_break(WD_BREAK.COLUMN)
        elif kind == "sectionBreak":
            self.section_break(b)
        elif kind == "table":
            if self.pending_break:
                self.flush_break(container)
            self.emit_table(container, b)
        elif kind == "toc":
            self.emit_toc(container, b)
        elif kind in ("chart", "mermaid", "diagram"):
            self.emit_blocks(container, common.degrade(b, ""))

    def emit_toc(self, container, b: dict) -> None:
        opts = b.get("opts") or {}
        lo = max(1, min(9, int(opts.get("from", 1) or 1)))
        hi = max(lo, min(9, int(opts.get("to", 3) or 3)))
        pages = opts.get("pages", True) is not False
        links = opts.get("links", True) is not False
        instr = f' TOC \\o "{lo}-{hi}"' + (" \\h" if links else "") + ("" if pages else " \\n") + " \\z \\u "
        entries = [e for e in (b.get("entries") or []) if isinstance(e, dict)]
        width = twips(self.avail_width(container))
        title = str(b.get("title") or "")
        if title:
            tp = self.container_paragraph(container)
            self.flush_pending(tp)
            tp._p.get_or_add_pPr().style = "TOCHeading" if self.style_by_id("TOCHeading") is not None else "Normal"
            tp.add_run(title)

        def fld(kind: str) -> str:
            return f'<w:r><w:fldChar w:fldCharType="{kind}"/></w:r>'
        head = fld("begin") + f'<w:r><w:instrText xml:space="preserve">{escape(instr)}</w:instrText></w:r>' + fld("separate")
        if not entries:
            ep = self.container_paragraph(container)
            self.flush_pending(ep)
            ep._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:fldChar w:fldCharType="begin"/></w:r>'))
            ep._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:instrText xml:space="preserve">{escape(instr)}</w:instrText></w:r>'))
            ep._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:fldChar w:fldCharType="separate"/></w:r>'))
        for i, e in enumerate(entries):
            level = max(0, min(8, int(e.get("level", 0) or 0))) + lo
            label = str(e.get("n") or "")
            text = escape((label + " " if label else "") + str(e.get("text") or ""))
            target = str(e.get("target") or "")
            name = target[3:] if target.startswith("bm:") else self.pid_bm.get(target)
            page = str(e.get("page") or "")
            tail = ""
            if page and pages:
                tail = ('<w:r><w:tab/></w:r>' + fld("begin") + f'<w:r><w:instrText xml:space="preserve"> PAGEREF {name or "_Toc0"} \\h </w:instrText></w:r>'
                        + fld("separate") + f'<w:r><w:t>{escape(page)}</w:t></w:r>' + fld("end"))
                if not name:
                    tail = f'<w:r><w:tab/></w:r><w:r><w:t>{escape(page)}</w:t></w:r>'
            inner = f'<w:r><w:t xml:space="preserve">{text}</w:t></w:r>{tail}'
            if links and name:
                inner = f'<w:hyperlink w:anchor="{name}" w:history="1">{inner}</w:hyperlink>'
            tab = f'<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="{width}"/></w:tabs>' if page and pages else ""
            xml = (f'<w:p {nsdecls("w")}><w:pPr><w:pStyle w:val="TOC{min(level, 9)}"/>{tab}</w:pPr>{head if (i == 0) else ""}{inner}</w:p>')
            q = self.container_paragraph(container)
            self.flush_pending(q)
            q._p.getparent().replace(q._p, parse_xml(xml))
        endp = self.container_paragraph(container)
        endp._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:fldChar w:fldCharType="end"/></w:r>'))
        self.last_p = endp

    def flush_pending(self, p) -> None:
        if self.pending_break:
            put(p._p.get_or_add_pPr(), "w:pageBreakBefore", PPR_ORDER)
            self.pending_break = False

    def section_break(self, b: dict) -> None:
        nxt = self.sections.get(b.get("next"))
        if nxt is None:
            idx = len(self.d.sections)
            nxt = self.order[idx] if idx < len(self.order) else None
        if self.pending_break:
            self.flush_break(self.d)
        sec = self.d.add_section(START.get((nxt or {}).get("start"), WD_SECTION.NEW_PAGE))
        if nxt:
            self.configure(sec, nxt)

    def emit_dropcap(self, container, b: dict, cap: dict, content: list[dict]) -> list[dict]:
        first = content[0] if content else None
        if not first or first.get("type") != "text" or not str(first.get("text") or "").strip():
            return content
        text = str(first["text"])
        letter, rest = text[0], text[1:]
        cp = self.container_paragraph(container)
        cpr = cp._p.get_or_add_pPr()
        style = b.get("style") or "Normal"
        if style != "Normal":
            cpr.style = style if self.style_by_id(style) is not None else "Normal"
        self.flush_pending(cp)
        lines = max(1, min(10, int(cap.get("lines") or 3)))
        marks = dict(first.get("marks") or {})
        base = float(marks.get("size") or common.resolved(self.styles, style)[0].get("size") or 11.0)
        fr = OxmlElement("w:framePr")
        fr.set(qn("w:dropCap"), "margin" if cap.get("mode") == "margin" else "drop")
        fr.set(qn("w:lines"), str(lines))
        fr.set(qn("w:wrap"), "around")
        fr.set(qn("w:vAnchor"), "text")
        fr.set(qn("w:hAnchor"), "text")
        if cap.get("distance"):
            fr.set(qn("w:hSpace"), str(twips(cap["distance"])))
        ins(cpr, fr, PPR_ORDER)
        put(cpr, "w:spacing", PPR_ORDER, after=0, line=int(round(lines * base * 1.2 * 20)), lineRule="exact")
        put(cpr, "w:textAlignment", PPR_ORDER, val="baseline")
        r = cp.add_run(letter)
        marks["size"] = round(lines * base * 1.64, 1)
        if cap.get("font"):
            marks["font"] = cap["font"]
        marks.pop("link", None)
        self.mark_run(r, marks)
        put(r._r.get_or_add_rPr(), "w:position", RPR_ORDER, val=-int(round((lines - 1) * base * 0.45)))
        head = common.text_run(rest, first.get("marks")) if rest else None
        return ([head] if head else []) + list(content[1:])

    def emit_paragraph(self, container, b: dict, numbering, check: dict | None = None) -> None:
        content = b.get("content") or []
        cap = (b.get("props") or {}).get("dropCap")
        if cap and check is None and numbering is None:
            content = self.emit_dropcap(container, b, cap, content)
        p = self.container_paragraph(container)
        ppr = p._p.get_or_add_pPr()
        style = b.get("style") or "Normal"
        if style != "Normal":
            ppr.style = style if self.style_by_id(style) is not None else "Normal"
        self.flush_pending(p)
        props = dict(b.get("props") or {})
        props.pop("dropCap", None)
        if numbering:
            nid, level = numbering
            num = OxmlElement("w:numPr")
            il = OxmlElement("w:ilvl")
            il.set(qn("w:val"), str(level))
            ni = OxmlElement("w:numId")
            ni.set(qn("w:val"), str(nid))
            num.append(il)
            num.append(ni)
            ins(ppr, num, PPR_ORDER)
        if check is not None:
            level = min(int(check.get("level", 0) or 0), 8)
            props["indentLeft"] = 36 + 18 * level
            props["indentFirst"] = -18
        self.apply_para(ppr, props)
        pm = self.pmark.get(b.get("id"))
        if pm:
            self.paragraph_mark(ppr, pm)
        self.grp = None
        self.fresh = True
        bm = self.pid_bm.get(b.get("id"))
        bid = self.bookmark_pair(p, bm, False) if bm else None
        if check is not None:
            self.checkbox(p, bool(check.get("checked")))
            p.add_run("\t")
        self.emit_runs(p, content, container)
        if bid is not None:
            self.bookmark_end(p, bid)
        self.last_p = p
        if b.get("id"):
            self.notes.anchor(p, b)

    def checkbox(self, p, checked: bool) -> None:
        glyph = chr(0x2612) if checked else chr(0x2610)
        xml = (f'<w:sdt {nsdecls("w")} xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:sdtPr><w:tag w:val="ftxt-check"/>'
               f'<w14:checkbox><w14:checked w14:val="{1 if checked else 0}"/><w14:checkedState w14:val="2612" w14:font="MS Gothic"/>'
               f'<w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr><w:sdtContent><w:r><w:rPr>'
               f'<w:rFonts w:ascii="MS Gothic" w:eastAsia="MS Gothic" w:hAnsi="MS Gothic" w:hint="eastAsia"/></w:rPr><w:t>{glyph}</w:t></w:r></w:sdtContent></w:sdt>')
        p._p.append(parse_xml(xml))

    def hyperlink_parent(self, p, url: str, container):
        h = OxmlElement("w:hyperlink")
        if url.startswith("#"):
            anchor = url[4:] if url.startswith("#bm:") else self.pid_bm.get(url[1:])
            if not anchor:
                return None
            h.set(qn("w:anchor"), anchor)
        else:
            part = self.d.part
            rid = part.relate_to(url, RT.HYPERLINK, is_external=True)
            h.set(qn("r:id"), rid)
        h.set(qn("w:history"), "1")
        p._p.append(h)
        return h

    def emit_runs(self, p, runs: list[dict], container) -> None:
        for run in runs:
            kind = run.get("type")
            if kind == "text":
                self.emit_text(p, run)
            elif kind == "tab":
                p.add_run("\t")
            elif kind == "break":
                p.add_run().add_break()
            elif kind == "image":
                self.emit_image(p, run)
            elif kind == "math":
                if run.get("display"):
                    p._p.append(parse_xml(omml.to_omml(str(run.get("latex", "")), True)))
                else:
                    p._p.append(parse_xml(omml.to_omml(str(run.get("latex", "")), False)))
            elif kind == "field":
                self.emit_field(p, run)
            elif kind == "mergefield":
                name = str(run.get("name") or "")
                arg = f'"{name}"' if " " in name else name
                self.field_runs(p, f"MERGEFIELD {arg} \\* MERGEFORMAT", f"«{name}»", run.get("marks"))
            elif kind == "bookmark":
                name = str(run.get("name") or "")
                if docx_rev.BOOKMARK.match(name):
                    self.bookmark_pair(p, name)
            elif kind == "sequence":
                self.emit_sequence(p, run)
            elif kind == "crossRef":
                self.emit_crossref(p, run)
            elif kind == "control":
                self.emit_control(p, run)
            elif kind == "chip":
                self.emit_chip(p, run)
            elif kind == "shape":
                text = str(run.get("text") or common.plain([r for blk in (run.get("content") or []) for r in (blk.get("content") or [])]))
                if text:
                    p.add_run(text)
            elif kind in ("footnote", "endnote", "noteRef", "footnoteRef"):
                self.notes.reference(p, run)

    def emit_text(self, p, run: dict) -> None:
        marks = run.get("marks") or {}
        link = marks.get("link")
        text = str(run.get("text", ""))
        if not text:
            return
        self.sync_comments(p, docx_rev.ids_of(marks.get("comment")))
        self.fresh = False
        r = p.add_run(text)
        eff = dict(marks)
        if link:
            eff.setdefault("color", "#0563c1")
            eff.setdefault("underline", True)
        self.mark_run(r, eff)
        if isinstance(marks.get("del"), dict):
            for t in r._r.findall(qn("w:t")):
                t.tag = qn("w:delText")
        h = self.hyperlink_parent(p, str(link), None) if link else None
        node = self.rev_wrap(p, r._r, marks, h is None)
        if h is not None and node is not None:
            h.append(node)

    def emit_sequence(self, p, run: dict) -> None:
        label = str(run.get("label") or "Figure")
        n = str(run.get("n") or "1")
        text = str(run.get("text") or "")
        prefix = text[:-len(n)] if text.endswith(n) and len(text) > len(n) else label + " "
        self.fresh = False
        p.add_run(prefix)
        arg = f'"{label}"' if " " in label else label
        self.field_runs(p, f"SEQ {arg} \\* ARABIC", n)

    def emit_crossref(self, p, run: dict) -> None:
        kind = run.get("kind")
        target = str(run.get("target") or "")
        name = target if kind == "bookmark" else self.pid_bm.get(target)
        text = str(run.get("text") or "")
        self.fresh = False
        if not name:
            if text:
                p.add_run(text)
            return
        what = run.get("what") or "text"
        if what == "page":
            instr = f"PAGEREF {name} \\h"
        elif what == "number":
            instr = f"REF {name} \\n \\h"
        else:
            instr = f"REF {name} \\h"
        self.field_runs(p, instr, text)

    def emit_control(self, p, run: dict) -> None:
        kind = run.get("kind") or "text"
        text = str(run.get("text") or "")
        pr = ""
        if run.get("title"):
            pr += f'<w:alias w:val={quoteattr(str(run["title"]))}/>'
        pr += f'<w:tag w:val={quoteattr(str(run.get("tag") or "ftxt-control"))}/>'
        self.sdt_n += 1
        pr += f'<w:id w:val="{self.sdt_n}"/>'
        empty = kind in ("text", "richtext", "date", "dropdown") and not text
        if empty:
            pr += "<w:showingPlcHdr/>"
        if kind == "text":
            pr += "<w:text/>"
        elif kind == "richtext":
            pr += "<w:richText/>"
        elif kind == "dropdown":
            items = ""
            for o in run.get("options") or []:
                label = str(o.get("label", "") if isinstance(o, dict) else o)
                items += f"<w:listItem w:displayText={quoteattr(label)} w:value={quoteattr(label)}/>"
            pr += f"<w:dropDownList>{items}</w:dropDownList>"
        elif kind == "date":
            fmt = str(run.get("format") or "MMMM d, yyyy")
            pr += (f'<w:date><w:dateFormat w:val={quoteattr(fmt)}/><w:lid w:val="en-US"/><w:storeMappedDataAs w:val="dateTime"/>'
                   f'<w:calendar w:val="gregorian"/></w:date>')
        elif kind == "checkbox":
            checked = bool(run.get("checked"))
            glyph = chr(0x2612) if checked else chr(0x2610)
            xml = (f'<w:sdt {nsdecls("w")} xmlns:w14="{W14_NS}"><w:sdtPr>{pr}<w14:checkbox><w14:checked w14:val="{1 if checked else 0}"/>'
                   f'<w14:checkedState w14:val="2612" w14:font="MS Gothic"/><w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr>'
                   f'<w:sdtContent><w:r><w:rPr><w:rFonts w:ascii="MS Gothic" w:eastAsia="MS Gothic" w:hAnsi="MS Gothic" w:hint="eastAsia"/></w:rPr><w:t>{glyph}</w:t></w:r></w:sdtContent></w:sdt>')
            self.fresh = False
            p._p.append(parse_xml(xml))
            return
        sdt = parse_xml(f'<w:sdt {nsdecls("w")}><w:sdtPr>{pr}</w:sdtPr><w:sdtContent/></w:sdt>')
        content = sdt.find(qn("w:sdtContent"))
        self.fresh = False
        if empty:
            r = p.add_run(str(run.get("placeholder") or {"date": "Click or tap to enter a date.", "dropdown": "Choose an item.", "richtext": "Click or tap here to enter text."}.get(kind, "Click or tap here to enter text.")))
            rpr = r._r.get_or_add_rPr()
            rs = OxmlElement("w:rStyle")
            rs.set(qn("w:val"), "PlaceholderText")
            rpr.insert(0, rs)
            content.append(r._r)
        else:
            parts = run.get("content") if kind == "richtext" and run.get("content") else [common.text_run(text)]
            for part in parts:
                if part.get("type") != "text" or not part.get("text"):
                    continue
                r = p.add_run(str(part["text"]))
                self.mark_run(r, part.get("marks") or {})
                content.append(r._r)
        p._p.append(sdt)

    def emit_field(self, p, run: dict) -> None:
        marks = run.get("marks") or {}
        kind = run.get("kind")
        code = str(run.get("code", "")).strip()
        result = str(run.get("result", ""))
        if kind == "formula" and not run.get("error"):
            fmt = run.get("format")
            instr = f"= {code[1:].strip() if code.startswith('=') else code}" + (f' \\# "{fmt}"' if fmt else "")
            self.field_runs(p, instr, str(run.get("result", "")), marks)
        elif kind == "variable" and code and not run.get("error") and not code.startswith("!"):
            arg = f'"{code}"' if " " in code else code
            self.field_runs(p, f"DOCVARIABLE {arg}", result, marks)
        elif kind == "info" and code.upper() in docx_rev.INFO_CODES:
            word = code.upper()
            fmt = run.get("format")
            instr = word
            if fmt and word in docx_rev.DATE_CODES:
                instr += f' \\@ "{fmt}"'
            elif fmt and word in docx_rev.COUNT_CODES:
                instr += f' \\# "{fmt}"'
            elif fmt in ("upper", "lower", "title"):
                instr += " \\* " + {"upper": "Upper", "lower": "Lower", "title": "Caps"}[fmt]
            self.field_runs(p, instr, result, marks)
        else:
            r = p.add_run(str(run.get("result", "")))
            self.mark_run(r, marks)

    def emit_chip(self, p, run: dict) -> None:
        kind = run.get("kind")
        label = str(run.get("text") or run.get("value") or run.get("name") or "")
        if kind == "dropdown":
            from xml.sax.saxutils import quoteattr
            items = "".join(f"<w:listItem w:displayText={quoteattr(str(o.get('label', '')))} w:value={quoteattr(str(o.get('label', '')))}/>" for o in run.get("options") or [])
            xml = (f'<w:sdt {nsdecls("w")}><w:sdtPr><w:dropDownList>{items}</w:dropDownList></w:sdtPr><w:sdtContent><w:r><w:t xml:space="preserve">'
                   f'{label.replace("&", "&amp;").replace("<", "&lt;")}</w:t></w:r></w:sdtContent></w:sdt>')
            p._p.append(parse_xml(xml))
        elif kind == "doc" and run.get("doc"):
            r = p.add_run(label)
            self.mark_run(r, {"color": "#0563c1", "underline": True})
            self.hyperlink_parent(p, f"formtxt:{run['doc']}", None).append(r._r)
        elif label:
            p.add_run(label)

    def emit_image(self, p, run: dict) -> None:
        name = run.get("media")
        data = self.media.get(str(name))
        if data is None:
            return
        kind = common.sniff(data)
        if kind is None or kind[0] in ("webp", "svg"):
            png = common.to_png(data) if kind and kind[0] != "svg" else None
            if png is None:
                alt = str(run.get("alt") or "picture")
                p.add_run(f"[{alt}]")
                return
            data = png
        w, h = float(run.get("width", 100)), float(run.get("height", 100))
        crop = run.get("crop") or {}
        r = p.add_run()
        shape = r.add_picture(io.BytesIO(data), width=Pt(w), height=Pt(h))
        inline = shape._inline
        if run.get("alt"):
            inline.docPr.set("descr", str(run["alt"]))
        pic = inline.graphic.graphicData.pic
        if any(crop.get(k) for k in "trbl"):
            a = "http://schemas.openxmlformats.org/drawingml/2006/main"
            rect = parse_xml(f'<a:srcRect xmlns:a="{a}" ' + " ".join(f'{k}="{int(round(float(crop.get(k, 0)) * 100000))}"' for k in "tblr" if crop.get(k)) + "/>")
            blip = pic.blipFill.find("{%s}blip" % a)
            blip.addnext(rect)
        if run.get("rotate"):
            xfrm = pic.spPr.find("{http://schemas.openxmlformats.org/drawingml/2006/main}xfrm")
            if xfrm is not None:
                xfrm.set("rot", str(int(round(float(run["rotate"]) * 60000))))

    def emit_table(self, container, b: dict) -> None:
        rows = b.get("rows") or []
        if not rows:
            return
        placed = []
        occ: set[tuple[int, int]] = set()
        for r, row in enumerate(rows):
            c = 0
            for cell in row.get("cells") or []:
                while (r, c) in occ:
                    c += 1
                cs, rs = max(1, int(cell.get("colspan", 1) or 1)), max(1, int(cell.get("rowspan", 1) or 1))
                rs = min(rs, len(rows) - r)
                for dr in range(rs):
                    for dc in range(cs):
                        occ.add((r + dr, c + dc))
                placed.append((r, c, cell, rs, cs))
                c += cs
        ncols = max([len(b.get("columns") or [])] + [c + 1 for _, c in occ])
        widths = [float(w or 0) for w in (b.get("columns") or [])] + [0.0] * ncols
        widths = widths[:ncols]
        avail = self.avail_width(container)
        free = [i for i, w in enumerate(widths) if w <= 0]
        if free:
            share = max(36.0, (avail - sum(widths)) / len(free))
            for i in free:
                widths[i] = share
        tbl = container.add_table(rows=len(rows), cols=ncols)
        t = tbl._tbl
        tblpr = t.tblPr
        for old in tblpr.findall(qn("w:tblStyle")):
            tblpr.remove(old)
        tbl.autofit = False
        put(tblpr, "w:tblW", TBLPR_ORDER, w=twips(sum(widths)), type="dxa")
        if b.get("align") == "center":
            tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        self.table_look(tblpr, b.get("look") or "grid")
        margins = b.get("cellMargins")
        if isinstance(margins, dict) and margins:
            cm = OxmlElement("w:tblCellMar")
            for side in ("top", "left", "bottom", "right"):
                if margins.get(side) is not None:
                    e = OxmlElement("w:" + side)
                    e.set(qn("w:w"), str(twips(margins[side])))
                    e.set(qn("w:type"), "dxa")
                    cm.append(e)
            if len(cm):
                for old in tblpr.findall(qn("w:tblCellMar")):
                    tblpr.remove(old)
                ins(tblpr, cm, TBLPR_ORDER)
        for gc, w in zip(t.tblGrid.findall(qn("w:gridCol")), widths):
            gc.set(qn("w:w"), str(twips(w)))
        for r, c, cell, rs, cs in placed:
            if rs > 1 or cs > 1:
                tbl.cell(r, c).merge(tbl.cell(r + rs - 1, c + cs - 1))
        look = b.get("look") or "grid"
        for r, c, cell, rs, cs in placed:
            tc = tbl.cell(r, c)
            tcpr = tc._tc.get_or_add_tcPr()
            put(tcpr, "w:tcW", TCPR_ORDER, w=twips(sum(widths[c:c + cs])), type="dxa")
            fill = cell.get("shading")
            if not fill and look == "accent" and cell.get("header"):
                fill = "#dbe5f1"
            if not fill and look == "banded" and r % 2 == 0 and not cell.get("header") and r > 0:
                fill = "#f3f3f3"
            if fill:
                ins(tcpr, shd(fill), TCPR_ORDER)
            borders = cell.get("borders")
            if borders:
                bd = OxmlElement("w:tcBorders")
                for side in ("top", "left", "bottom", "right"):
                    spec = borders.get(side)
                    if not spec:
                        continue
                    e = OxmlElement("w:" + side)
                    e.set(qn("w:val"), BORDER_STYLE.get(spec.get("style", "solid"), "single"))
                    e.set(qn("w:sz"), str(max(2, int(round(float(spec.get("width", 0.5)) * 8)))))
                    e.set(qn("w:space"), "0")
                    e.set(qn("w:color"), common.hex_color(spec.get("color"), "000000").upper())
                    bd.append(e)
                if len(bd):
                    ins(tcpr, bd, TCPR_ORDER)
            if cell.get("valign") in ("middle", "bottom"):
                put(tcpr, "w:vAlign", TCPR_ORDER, val="center" if cell["valign"] == "middle" else "bottom")
            if cell.get("textDirection") in TEXT_DIRECTION:
                put(tcpr, "w:textDirection", TCPR_ORDER, val=TEXT_DIRECTION[cell["textDirection"]])
            body = cell.get("body") or []
            if not body:
                body = [common.para("Normal", [], "")]
            saved = self.pending_break
            self.pending_break = False
            saved_open, saved_last = self.cm_open, self.last_p
            self.cm_open, self.last_p = [], None
            self.emit_blocks(tc, body)
            self.cm_flush()
            self.cm_open, self.last_p = saved_open, saved_last
            self.pending_break = saved
            if local(tc._tc[-1]) == "tbl":
                tc._tc.append(OxmlElement("w:p"))
        for r, row in enumerate(rows):
            trpr = t.tr_lst[r].get_or_add_trPr()
            if b.get("rowSplit") is False:
                put(trpr, "w:cantSplit", TRPR_ORDER)
            if row.get("height"):
                put(trpr, "w:trHeight", TRPR_ORDER, val=twips(row["height"]), hRule="atLeast")
            if b.get("repeatHeader") and r < self.header_rows(rows):
                put(trpr, "w:tblHeader", TRPR_ORDER)
        if len(t.tr_lst[0].tc_lst) == 0:
            return

    def header_rows(self, rows: list[dict]) -> int:
        n = 0
        for row in rows:
            cells = row.get("cells") or []
            if cells and all(c.get("header") for c in cells):
                n += 1
            else:
                break
        return n

    def avail_width(self, container) -> float:
        if isinstance(container, _Cell):
            try:
                return max(72.0, container.width.pt) if container.width else 300.0
            except Exception:
                return 300.0
        sec = self.d.sections[-1]
        try:
            return (sec.page_width - sec.left_margin - sec.right_margin).pt
        except Exception:
            return 468.0

    def table_look(self, tblpr, look: str) -> None:
        def border(side: str, val: str, color: str = "808080") -> object:
            e = OxmlElement("w:" + side)
            e.set(qn("w:val"), val)
            e.set(qn("w:sz"), "4")
            e.set(qn("w:space"), "0")
            e.set(qn("w:color"), color)
            return e
        bd = OxmlElement("w:tblBorders")
        if look == "plain":
            names = {}
        elif look in ("rows", "banded"):
            names = {"top": "single", "bottom": "single", "insideH": "single"}
        else:
            names = {"top": "single", "left": "single", "bottom": "single", "right": "single", "insideH": "single", "insideV": "single"}
        for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
            bd.append(border(side, names.get(side, "nil")))
        ins(tblpr, bd, TBLPR_ORDER)


def build(doc: dict, media: dict[str, bytes], template: bool = False) -> bytes:
    writer = DocxWriter(doc, media)
    d = writer.build()
    buf = io.BytesIO()
    d.save(buf)
    data = buf.getvalue()
    if not template:
        return data
    src = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for item in src.infolist():
            raw = src.read(item.filename)
            if item.filename == "[Content_Types].xml":
                raw = raw.replace(DOCX.encode(), DOTX.encode())
            z.writestr(item, raw)
    return out.getvalue()
