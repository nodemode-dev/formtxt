import re
from collections import Counter

from app.core.ids import new_id
from app.services import model
from app.services.exchange import common
from app.services.exchange.common import Builder

TOKEN = re.compile(rb"\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z'])|([{}])|([^\\{}\r\n]+)|[\r\n]+")
SKIP_DEST = {"rsidtbl", "generator", "themedata", "colorschememapping", "latentstyles", "datastore", "xmlnstbl", "mmathpr", "pgdsctbl", "revtbl", "userprops",
             "listtext", "pntext", "pn", "pnseclvl", "bkmkstart", "bkmkend", "falt", "panose", "ftnsep", "ftnsepc", "aftnsep", "aftnsepc", "nonshppict",
             "shpinst", "txbxcontent", "private", "wgrffmtfilter", "fchars", "lchars", "xe", "tc", "tcn", "protusertbl", "docvar", "operator", "company", "manager",
             "category", "comment", "doccomm", "hlinkbase", "creatim", "revtim", "printim", "buptim", "pgdsc", "template", "filetbl", "mmath", "background",
             "defchp", "defpap", "formfield", "objdata"}
KEEP_IGNORABLE = {"shppict", "header", "footer", "headerf", "footerf", "headerl", "footerl", "headerr", "footerr", "pict", "listtable", "listoverridetable", "footnote"}
NFC_FORMAT = {0: "decimal", 1: "upper-roman", 2: "lower-roman", 3: "upper-alpha", 4: "lower-alpha", 22: "decimal-leading-zero"}
CHARS = {"emdash": "\u2014", "endash": "\u2013", "lquote": "\u2018", "rquote": "\u2019", "ldblquote": "\u201c", "rdblquote": "\u201d", "bullet": "\u2022",
         "emspace": "\u2003", "enspace": "\u2002", "qmspace": "\u2005", "zwj": "\u200d", "zwnj": "\u200c"}
HF_KEYS = {"header": ("headers", "default"), "footer": ("footers", "default"), "headerf": ("headers", "first"), "footerf": ("footers", "first"),
           "headerl": ("headers", "even"), "footerl": ("footers", "even"), "headerr": ("headers", "default"), "footerr": ("footers", "default")}
GLYPHS = ("\u2610", "\u2611", "\u2612")
PARA_KEYS = {"li": "li", "ri": "ri", "fi": "fi", "sb": "sb", "sa": "sa", "sl": "sl", "slmult": "slmult", "ls": "ls", "ilvl": "ilvl", "s": "s",
             "outlinelevel": "ol", "pagebb": "pagebb", "keepn": "keepn", "keep": "keep", "cbpat": "shade", "nowidctlpar": "nowidow"}
UL_KINDS = {"ul": True, "ulw": True, "ulth": True, "uldb": "double", "uld": "dotted", "uldash": "dash", "uldashd": "dash", "ulwave": "wavy", "ulhwave": "wavy"}


class Frame:
    def __init__(self, dest: str = "body", char: dict | None = None, uc: int = 1) -> None:
        self.dest = dest
        self.char = dict(char or {})
        self.uc = uc
        self.skip = 0
        self.opened = ""


class Reader:
    def __init__(self, data: bytes, name: str) -> None:
        if data.lstrip()[:5] != b"{\\rtf":
            raise common.Unsupported(f"{name}: not an RTF file.")
        self.data = data
        self.b = Builder(common.title_of(name))
        self.doc = self.b.doc
        self.codepage = "cp1252"
        self.fonts: dict[int, str] = {}
        self.deff = 0
        self.colors: list[str] = []
        self.rgb: dict[str, int] = {}
        self.style_map: dict[int, str] = {}
        self.pending_styles: dict[str, tuple[str, dict]] = {}
        self.lists: dict[int, dict] = {}
        self.overrides: dict[int, int] = {}
        self.ov_list: int | None = None
        self.seen: set[tuple[int, int]] = set()
        self.sections = [self.doc["sections"][0]]
        self.cur_sect = self.sections[0]
        self.blocks: list[dict] = []
        self.runs: list[dict] = []
        self.note_text = ""
        self.note_end = False
        self.note_counts: dict[str, int] = {}
        self.para: dict = {}
        self.table_rows: list[dict] = []
        self.row_cells: list[dict] = []
        self.cell_blocks: list[dict] = []
        self.cell_defs: list[dict] = []
        self.cur_cell_def: dict = {}
        self.row_flags: dict = {}
        self.in_table = False
        self.facing = False
        self.pict: dict | None = None
        self.field_inst = ""
        self.field_link: str | None = None
        self.hf_lines: list[str] = []
        self.hf_target: tuple[str, str] | None = None
        self.hf_align = "left"
        self.font_name = ""
        self.style_def: dict | None = None
        self.style_id = -1
        self.style_text = ""
        self.cur_list: dict | None = None
        self.cur_level: dict | None = None
        self.leveltext: list[str] = []
        self.info_key = ""
        self.info: dict[str, str] = {}
        self.legacy_bullet = False
        self.legacy_num = False

    def read(self) -> tuple[dict, dict[str, bytes]]:
        self.parse()
        if self.runs:
            self.finish_paragraph()
        self.close_table()
        if self.blocks and self.blocks[-1]["type"] == "sectionBreak":
            self.blocks.pop()
            self.sections.pop()
        self.doc["sections"] = self.sections
        self.normalise()
        self.doc["tabs"][0]["body"] = self.blocks or self.doc["tabs"][0]["body"]
        return self.doc, self.b.media

    def marks(self, frame: Frame) -> dict:
        c = frame.char
        m: dict = {}
        if c.get("b"):
            m["bold"] = True
        if c.get("i"):
            m["italic"] = True
        if c.get("ul"):
            m["underline"] = c["ul"]
        if c.get("strike"):
            m["strike"] = True
        if c.get("sup") == 1:
            m["superscript"] = True
        elif c.get("sup") == -1:
            m["subscript"] = True
        if c.get("scaps"):
            m["smallCaps"] = True
        if c.get("caps"):
            m["allCaps"] = True
        if c.get("fs"):
            m["size"] = c["fs"] / 2
        font = self.fonts.get(c.get("f", self.deff))
        if font:
            m["font"] = font
        if self.color_at(c.get("cf")):
            m["color"] = self.color_at(c["cf"])
        if self.color_at(c.get("hl")):
            m["highlight"] = self.color_at(c["hl"])
        if c.get("exp"):
            m["spacing"] = c["exp"] / 20
        if self.field_link and c.get("in_rslt"):
            m["link"] = self.field_link
        return m

    def color_at(self, idx: int | None) -> str:
        if idx and 0 < idx < len(self.colors):
            return self.colors[idx]
        return ""

    def add_text(self, frame: Frame, text: str) -> None:
        dest = frame.dest
        if not text:
            return
        if dest == "fonttbl":
            self.font_name += text
        elif dest == "stylesheet":
            self.style_text += text
        elif dest == "info":
            if self.info_key:
                self.info[self.info_key] = self.info.get(self.info_key, "") + text
        elif dest == "fldinst":
            self.field_inst += text
        elif dest == "footnote":
            self.note_text += text
        elif dest == "leveltext":
            self.leveltext.append(text)
        elif self.hf_target is not None:
            self.hf_lines[-1] += text
        elif dest in ("body", "fldrslt"):
            self.runs.append(common.text_run(text, self.marks(frame) or None))

    def parse(self) -> None:
        data = self.data
        pos = 0
        n = len(data)
        stack: list[Frame] = []
        frame = Frame()
        while pos < n:
            m = TOKEN.match(data, pos)
            if not m:
                pos += 1
                continue
            pos = m.end()
            word, param, hexv, sym, brace, text = m.groups()
            if brace == b"{":
                stack.append(frame)
                frame = Frame(frame.dest, frame.char, frame.uc)
                continue
            if brace == b"}":
                self.close_group(frame)
                if stack:
                    frame = stack.pop()
                continue
            if frame.dest == "skip":
                if word == b"bin" and param and int(param) > 0:
                    pos += int(param)
                continue
            if text is not None:
                if frame.skip:
                    take = min(frame.skip, len(text))
                    frame.skip -= take
                    text = text[take:]
                    if not text:
                        continue
                if frame.dest == "pict":
                    if self.pict is not None:
                        self.pict["hex"].append(text.decode("ascii", "ignore"))
                elif frame.dest == "colortbl":
                    for _ in range(text.count(b";")):
                        self.colors.append("#%02x%02x%02x" % (self.rgb["red"], self.rgb["green"], self.rgb["blue"]) if self.rgb.get("set") else "")
                        self.rgb = {"red": 0, "green": 0, "blue": 0}
                else:
                    self.add_text(frame, text.decode(self.codepage, "replace"))
                continue
            if hexv is not None:
                if frame.skip:
                    frame.skip -= 1
                else:
                    self.add_text(frame, bytes([int(hexv, 16)]).decode(self.codepage, "replace"))
                continue
            if sym is not None:
                self.symbol(frame, sym.decode("ascii"), data, pos)
                if sym == b"*":
                    nxt = TOKEN.match(data, pos)
                    name = nxt.group(1).decode().lower() if nxt and nxt.group(1) else ""
                    if name == "fldinst":
                        frame.dest = "fldinst"
                        self.field_inst = ""
                        pos = nxt.end()
                    elif name not in KEEP_IGNORABLE:
                        frame.dest = "skip"
                continue
            if word is not None:
                w = word.decode("ascii")
                self.control(frame, w, int(param) if param is not None else None)
                if w == "bin" and param and int(param) > 0:
                    pos += int(param)

    def symbol(self, frame: Frame, s: str, data: bytes, pos: int) -> None:
        if s == "~":
            self.add_text(frame, "\u00a0")
        elif s == "_":
            self.add_text(frame, "\u2011")
        elif s in ("\\", "{", "}"):
            self.add_text(frame, s)
        elif s in ("\n", "\r"):
            self.control(frame, "par", None)

    def close_group(self, frame: Frame) -> None:
        dest = frame.dest
        if dest == "fonttbl" and frame.char.get("fontdef") is not None:
            name = self.font_name.split(";")[0].strip()
            if name:
                self.fonts[frame.char["fontdef"]] = name
            self.font_name = ""
        elif frame.opened == "pict":
            self.end_pict()
        elif dest == "stylesheet" and self.style_id >= 0:
            self.end_style()
        elif frame.opened == "hf":
            self.end_hf()
        elif frame.opened == "leveltext" and self.cur_level is not None:
            self.cur_level["text"] = "".join(self.leveltext)
            self.leveltext = []
        elif frame.opened == "footnote":
            kind = "endnote" if self.note_end else "footnote"
            self.note_counts[kind] = self.note_counts.get(kind, 0) + 1
            n = self.note_counts[kind]
            self.runs.append({"type": "noteRef", "id": new_id("n_"), "kind": kind, "n": n, "note": self.note_text.strip(), "text": str(n)})
        elif frame.opened == "info":
            self.info_key = ""
        elif frame.opened == "fldrslt":
            self.field_link = None

    def control(self, frame: Frame, w: str, p: int | None) -> None:
        dest = frame.dest
        if w == "ansicpg" and p:
            self.codepage = f"cp{p}"
            return
        if w == "deff":
            self.deff = p or 0
            return
        if w == "uc":
            frame.uc = 1 if p is None else p
            return
        if w == "u" and p is not None:
            cp = p & 0xFFFF
            if 0xD800 <= cp <= 0xDBFF:
                frame.char["_hi"] = cp
            else:
                if 0xDC00 <= cp <= 0xDFFF and frame.char.get("_hi"):
                    cp = 0x10000 + ((frame.char.pop("_hi") - 0xD800) << 10) + (cp - 0xDC00)
                self.add_text(frame, chr(cp))
            frame.skip = frame.uc
            return
        if dest == "fonttbl":
            if w == "f" and p is not None:
                frame.char["fontdef"] = p
            return
        if dest == "colortbl":
            if w in ("red", "green", "blue"):
                self.rgb[w] = p or 0
                self.rgb["set"] = 1
            return
        if w == "fonttbl":
            frame.dest = "fonttbl"
        elif w == "colortbl":
            frame.dest = "colortbl"
            self.rgb = {"red": 0, "green": 0, "blue": 0}
            self.colors = []
        elif w == "stylesheet":
            frame.dest = "stylesheet"
            self.style_id = -1
        elif w == "info":
            frame.dest = frame.opened = "info"
        elif w == "listtable":
            frame.dest = "listtable"
        elif w == "listoverridetable":
            frame.dest = "listoverridetable"
        elif w == "leveltext":
            frame.dest = frame.opened = "leveltext"
            self.leveltext = []
        elif w == "pict":
            frame.dest = frame.opened = "pict"
            self.pict = {"hex": [], "kind": "", "w": None, "h": None, "sx": 100, "sy": 100}
        elif w == "fldinst":
            frame.dest = "fldinst"
            self.field_inst = ""
        elif w == "field":
            self.field_inst = ""
            self.field_link = None
        elif w == "fldrslt":
            self.begin_result(frame)
        elif w == "footnote" and dest == "body":
            frame.dest = frame.opened = "footnote"
            self.note_text = ""
            self.note_end = False
        elif dest == "footnote":
            if w == "ftnalt":
                self.note_end = True
        elif w in HF_KEYS and dest in ("body", "hf"):
            self.start_hf(frame, w)
        elif w in SKIP_DEST and dest == "body":
            frame.dest = "skip"
        elif dest == "stylesheet":
            self.style_control(frame, w, p)
        elif dest == "info":
            if w in ("title", "author", "subject", "keywords"):
                self.info_key = w
        elif dest == "listtable":
            self.list_control(w, p)
        elif dest == "listoverridetable":
            self.override_control(w, p)
        elif dest == "pict":
            self.pict_control(w, p)
        elif dest in ("body", "fldrslt", "hf"):
            self.body_control(frame, w, p)

    def begin_result(self, frame: Frame) -> None:
        frame.char["in_rslt"] = True
        frame.opened = "fldrslt"
        m = re.search(r'HYPERLINK\s+(?:\\[a-z]\s+)*"([^"]+)"', self.field_inst) or re.search(r"HYPERLINK\s+(\S+)", self.field_inst)
        self.field_link = m.group(1) if m else None
        word = self.field_inst.strip().split(" ")[0].upper() if self.field_inst.strip() else ""
        if self.hf_target is not None and word in ("PAGE", "NUMPAGES"):
            self.hf_lines[-1] += "{" + word + "}"
            frame.dest = "skip"
        elif self.hf_target is None:
            frame.dest = "fldrslt"

    def pict_control(self, w: str, p: int | None) -> None:
        if self.pict is None:
            return
        if w in ("pngblip", "jpegblip"):
            self.pict["kind"] = w
        elif w == "picwgoal":
            self.pict["w"] = (p or 0) / 20
        elif w == "pichgoal":
            self.pict["h"] = (p or 0) / 20
        elif w == "picscalex":
            self.pict["sx"] = p or 100
        elif w == "picscaley":
            self.pict["sy"] = p or 100

    def end_pict(self) -> None:
        pic, self.pict = self.pict, None
        if not pic or not pic["hex"]:
            return
        hx = re.sub(r"[^0-9a-fA-F]", "", "".join(pic["hex"]))
        if len(hx) % 2:
            hx = hx[:-1]
        try:
            data = bytes.fromhex(hx)
        except ValueError:
            return
        w = pic["w"] * pic["sx"] / 100 if pic["w"] else None
        h = pic["h"] * pic["sy"] / 100 if pic["h"] else None
        run = self.b.image(data, w, h, "")
        if self.hf_target is None:
            self.runs.append(run if run else common.text_run("[picture]"))

    def style_control(self, frame: Frame, w: str, p: int | None) -> None:
        if w == "s" and p is not None:
            self.style_id = p
            self.style_def = {"run": {}, "para": {}, "based": None, "next": None}
            return
        if w == "cs" and p is not None:
            self.style_id = -2
            self.style_def = None
            return
        if self.style_def is None:
            return
        if w == "sbasedon":
            self.style_def["based"] = p
        elif w == "snext":
            self.style_def["next"] = p
        else:
            saved, self.para = self.para, {}
            tmp = Frame("body", {}, frame.uc)
            self.body_control(tmp, w, p)
            self.style_def["run"].update({k: v for k, v in self.marks(tmp).items() if k in ("font", "size", "color", "bold", "italic", "underline", "strike", "smallCaps", "allCaps")})
            self.style_def["para"].update(self.para_props(self.para, True))
            self.para = saved

    def end_style(self) -> None:
        name = self.style_text.split(";")[0].strip()
        self.style_text = ""
        d, sid = self.style_def, self.style_id
        self.style_def, self.style_id = None, -1
        if d is None or not name or sid < 0:
            return
        fid = common.BUILTIN_NAMES.get(name.lower())
        if fid is None:
            fid = re.sub(r"[^A-Za-z0-9]", "", name) or f"Style{sid}"
            if fid in self.doc["styles"] and self.doc["styles"][fid].get("name") != name:
                fid = f"{fid}{sid}"
        self.style_map[sid] = fid
        self.pending_styles[fid] = (name, d)

    def start_hf(self, frame: Frame, w: str) -> None:
        frame.dest = frame.opened = "hf"
        if w in ("headerl", "footerl"):
            self.facing = True
        self.hf_target = HF_KEYS[w]
        self.hf_lines = [""]
        self.hf_align = "left"

    def end_hf(self) -> None:
        if self.hf_target is None:
            return
        lines = list(self.hf_lines)
        while lines and not lines[-1].strip():
            lines.pop()
        kind, key = self.hf_target
        self.hf_target = None
        if lines:
            self.cur_sect[kind][key] = {"text": "\n".join(lines), "align": self.hf_align}

    def list_control(self, w: str, p: int | None) -> None:
        if w == "list":
            self.cur_list = {"levels": []}
        elif w == "listid" and p is not None and self.cur_list is not None:
            self.lists[p] = self.cur_list
        elif w == "listlevel" and self.cur_list is not None:
            self.cur_level = {"nfc": 0, "start": 1, "text": ""}
            self.cur_list["levels"].append(self.cur_level)
        elif self.cur_level is not None and w == "levelnfc" and p is not None:
            self.cur_level["nfc"] = p
        elif self.cur_level is not None and w == "levelstartat" and p is not None:
            self.cur_level["start"] = p

    def override_control(self, w: str, p: int | None) -> None:
        if w == "listoverride":
            self.ov_list = None
        elif w == "listid":
            self.ov_list = p
        elif w == "ls" and p is not None and self.ov_list is not None:
            self.overrides[p] = self.ov_list

    def body_control(self, frame: Frame, w: str, p: int | None) -> None:
        c = frame.char
        on = p is None or p != 0
        if w == "plain":
            for k in ("b", "i", "ul", "strike", "sup", "scaps", "caps", "fs", "cf", "hl", "exp", "f"):
                c.pop(k, None)
        elif w == "b":
            c["b"] = on
        elif w == "i":
            c["i"] = on
        elif w in UL_KINDS:
            c["ul"] = UL_KINDS[w] if on else False
        elif w == "ulnone":
            c["ul"] = False
        elif w in ("strike", "striked"):
            c["strike"] = on
        elif w == "super":
            c["sup"] = 1
        elif w == "sub":
            c["sup"] = -1
        elif w == "nosupersub":
            c["sup"] = 0
        elif w == "scaps":
            c["scaps"] = on
        elif w == "caps":
            c["caps"] = on
        elif w == "fs" and p:
            c["fs"] = p
        elif w == "f" and p is not None:
            c["f"] = p
        elif w == "cf" and p is not None:
            c["cf"] = p
        elif w == "highlight" and p is not None:
            c["hl"] = p
        elif w == "expndtw" and p is not None:
            c["exp"] = p
        elif w == "par":
            self.finish_paragraph()
        elif w == "line":
            if self.hf_target is not None:
                self.hf_lines[-1] += "\n"
            else:
                self.runs.append({"type": "break"})
        elif w == "tab":
            if self.hf_target is not None:
                self.hf_lines[-1] += "\t"
            else:
                self.runs.append({"type": "tab"})
        elif w == "page":
            if self.runs:
                self.finish_paragraph()
            self.close_table()
            self.blocks.append({"type": "pageBreak", "id": new_id("p_")})
        elif w == "column":
            if self.runs:
                self.finish_paragraph()
            self.close_table()
            self.blocks.append({"type": "columnBreak", "id": new_id("p_")})
        elif w in CHARS:
            self.add_text(frame, CHARS[w])
        elif w == "pard":
            self.para = {}
            self.legacy_bullet = self.legacy_num = False
        elif w in ("qc", "qr", "qj", "ql"):
            self.para["align"] = {"qc": "center", "qr": "right", "qj": "justify", "ql": "left"}[w]
        elif w in PARA_KEYS:
            self.para[PARA_KEYS[w]] = True if p is None else p
        elif w in ("brdrt", "brdrb", "brdrl", "brdrr", "box") and not self.cur_cell_def.get("_side"):
            self.para.setdefault("borders", set()).update({"t", "b", "l", "r"} if w == "box" else {w[-1]})
        elif w == "tx" and p is not None:
            self.para.setdefault("tabs", []).append({"pos": p / 20, "align": self.para.pop("_tq", "left"), "leader": self.para.pop("_tl", None)})
        elif w in ("tqc", "tqr", "tqdec"):
            self.para["_tq"] = {"tqc": "center", "tqr": "right", "tqdec": "decimal"}[w]
        elif w in ("tldot", "tlhyph", "tlul"):
            self.para["_tl"] = {"tldot": "dot", "tlhyph": "dash", "tlul": "underline"}[w]
        elif w == "pnlvlblt":
            self.legacy_bullet = True
        elif w in ("pndec", "pnlvlbody"):
            self.legacy_num = True
        elif w == "intbl":
            self.in_table = True
            self.para["intbl"] = True
        elif w == "trowd":
            self.begin_row()
        elif w == "cellx" and p is not None:
            self.cell_defs.append({**self.cur_cell_def, "x": p / 20})
            self.cur_cell_def = {}
        elif w == "cell":
            self.end_cell()
        elif w == "row":
            self.end_row()
        elif w in ("clmgf", "clmrg", "clvmgf", "clvmrg", "clvertalc", "clvertalb"):
            self.cur_cell_def[w] = True
        elif w == "clcbpat" and p is not None:
            self.cur_cell_def["shade"] = p
        elif w in ("clbrdrt", "clbrdrb", "clbrdrl", "clbrdrr"):
            self.cur_cell_def["_side"] = w[-1]
            self.cur_cell_def.setdefault("borders", {})[w[-1]] = {"style": "solid", "width": 0.5, "color": "#000000"}
        elif w in ("brdrs", "brdrdash", "brdrdot", "brdrdb", "brdrnil") and self.cur_cell_def.get("_side"):
            self.cur_cell_def["borders"][self.cur_cell_def["_side"]]["style"] = {"brdrs": "solid", "brdrdash": "dashed", "brdrdot": "dotted", "brdrdb": "double", "brdrnil": "none"}[w]
        elif w == "brdrw" and p and self.cur_cell_def.get("_side"):
            self.cur_cell_def["borders"][self.cur_cell_def["_side"]]["width"] = round(min(6.0, max(0.25, p / 20)), 2)
        elif w == "brdrcf" and p is not None and self.cur_cell_def.get("_side"):
            self.cur_cell_def["borders"][self.cur_cell_def["_side"]]["cf"] = p
        elif w == "trhdr":
            self.row_flags["hdr"] = True
        elif w == "trkeep":
            self.row_flags["keep"] = True
        elif w == "trqc":
            self.row_flags["center"] = True
        elif w == "sectd":
            self.cur_sect["headers"], self.cur_sect["footers"] = {}, {}
            self.cur_sect["titlePage"] = False
        elif w == "sect":
            self.end_section()
        elif w in ("paperw", "paperh", "margl", "margr", "margt", "margb", "landscape", "deftab", "facingp", "gutter"):
            self.doc_prop(w, p)
        else:
            self.sect_prop(w, p)

    def doc_prop(self, w: str, p: int | None) -> None:
        sec = self.sections[0]
        v = (p or 0) / 20
        if w == "paperw" and p:
            sec["page"]["width"] = v
        elif w == "paperh" and p:
            sec["page"]["height"] = v
        elif w in ("margl", "margr", "margt", "margb"):
            sec["margins"][{"margl": "left", "margr": "right", "margt": "top", "margb": "bottom"}[w]] = v
        elif w == "gutter":
            sec["margins"]["gutter"] = v
        elif w == "landscape":
            sec["page"]["orientation"] = "landscape"
        elif w == "deftab" and p:
            self.doc["settings"]["defaultTab"] = v
        elif w == "facingp":
            self.doc["settings"]["evenOdd"] = True
            self.facing = True

    def sect_prop(self, w: str, p: int | None) -> None:
        sec = self.cur_sect
        v = (p or 0) / 20
        if w == "pgwsxn":
            sec["page"]["width"] = v
        elif w == "pghsxn":
            sec["page"]["height"] = v
        elif w == "lndscpsxn":
            sec["page"]["orientation"] = "landscape"
        elif w in ("marglsxn", "margrsxn", "margtsxn", "margbsxn", "headery", "footery", "guttersxn"):
            sec["margins"][{"marglsxn": "left", "margrsxn": "right", "margtsxn": "top", "margbsxn": "bottom", "headery": "header", "footery": "footer", "guttersxn": "gutter"}[w]] = v
        elif w == "cols" and p and p > 1:
            sec["columns"] = {"count": min(p, 4), "gap": sec["columns"].get("gap", 36.0)}
        elif w == "colsx":
            sec["columns"]["gap"] = v
        elif w == "titlepg":
            sec["titlePage"] = True
        elif w in ("sbknone", "sbkpage", "sbkeven", "sbkodd"):
            sec["start"] = {"sbknone": "continuous", "sbkpage": "nextPage", "sbkeven": "evenPage", "sbkodd": "oddPage"}[w]
        elif w == "pgnstarts" and p is not None:
            sec["pageNumberStart"] = p
        elif w in ("pgnlcrm", "pgnucrm", "pgnlcltr", "pgnucltr"):
            sec["pageNumberFormat"] = {"pgnlcrm": "lowerRoman", "pgnucrm": "upperRoman", "pgnlcltr": "lowerLetter", "pgnucltr": "upperLetter"}[w]
        elif w == "pgbrdrt":
            sec["pageBorder"] = "thin"

    def end_section(self) -> None:
        if self.runs:
            self.finish_paragraph()
        self.close_table()
        new = model.default_section()
        new["page"] = dict(self.cur_sect["page"])
        new["margins"] = dict(self.cur_sect["margins"])
        self.sections.append(new)
        self.blocks.append({"type": "sectionBreak", "id": new_id("p_"), "next": new["id"]})
        self.cur_sect = new

    def para_props(self, para: dict, style: bool = False) -> dict:
        out: dict = {}
        if "align" in para:
            out["align"] = para["align"]
        if "li" in para:
            out["indentLeft" if style else "indent"] = round(para["li"] / 20, 2)
        if "ri" in para:
            out["indentRight"] = round(para["ri"] / 20, 2)
        if para.get("fi"):
            out["indentFirst"] = round(para["fi"] / 20, 2)
        if "sb" in para:
            out["spaceBefore"] = round(para["sb"] / 20, 2)
        if "sa" in para:
            out["spaceAfter"] = round(para["sa"] / 20, 2)
        if para.get("sl") and para.get("slmult"):
            out["lineSpacing"] = round(para["sl"] / 240, 3)
        if para.get("keepn"):
            out["keepWithNext" if style else "keepNext"] = True
        if style:
            if para.get("ol") is not None and para["ol"] is not True:
                out["outlineLevel"] = int(para["ol"]) + 1
            return out
        if para.get("keep"):
            out["keepLines"] = True
        if para.get("nowidow"):
            out["widowControl"] = False
        if para.get("borders"):
            out["border"] = "box" if len(para["borders"]) == 4 else {"t": "top", "b": "bottom", "l": "left", "r": "right"}[sorted(para["borders"])[0]]
        shade = self.color_at(para.get("shade"))
        if shade:
            out["shading"] = shade
        if para.get("tabs"):
            out["tabs"] = [{"pos": round(t["pos"], 2), "align": t["align"], **({"leader": t["leader"]} if t.get("leader") else {})} for t in para["tabs"]]
        return out

    def finish_paragraph(self) -> None:
        runs, self.runs = self.runs, []
        para = self.para
        if self.hf_target is not None:
            if "align" in para and any(l.strip() for l in self.hf_lines):
                self.hf_align = para["align"]
            elif "align" in para and not any(l.strip() for l in self.hf_lines[:-1]):
                self.hf_align = para["align"]
            self.hf_lines.append("")
            return
        in_cell = bool(para.get("intbl")) and self.in_table
        if not in_cell:
            self.close_table()
        runs = common.merge_runs(runs)
        sid = self.style_map.get(para.get("s", -1), "Normal")
        if sid not in self.doc["styles"] and sid not in self.pending_styles:
            sid = "Normal"
        lst = None
        if para.get("ls") in self.overrides and self.overrides[para["ls"]] in self.lists:
            lst = self.list_dict(para)
        elif self.legacy_bullet:
            lst = {"kind": "bullet", "level": 0}
        elif self.legacy_num:
            lst = {"kind": "number", "level": 0, "format": "decimal"}
        props = self.para_props(para)
        if lst is not None:
            props.pop("indent", None)
            props.pop("indentFirst", None)
        if lst is None and runs and runs[0].get("type") == "text" and runs[0]["text"][:1] in GLYPHS:
            glyph = runs[0]["text"][0]
            rest = runs[0]["text"][1:].lstrip()
            runs = ([common.text_run(rest, runs[0].get("marks"))] if rest else []) + runs[1:]
            if runs and runs[0].get("type") == "tab":
                runs.pop(0)
            level = max(0, int(((para.get("li", 720) / 20) - 36) // 18))
            lst = {"kind": "check", "level": min(level, 8), "checked": glyph != "\u2610"}
            props.pop("indent", None)
            props.pop("indentFirst", None)
        if para.pop("pagebb", None):
            self.close_table()
            self.blocks.append({"type": "pageBreak", "id": new_id("p_")})
        text_runs = [r for r in runs if r.get("type") == "text"]
        if lst is None and props.get("shading") == "#f2f2f2" and text_runs and all((r.get("marks") or {}).get("font") in ("Consolas", "Courier New") for r in text_runs):
            text = "".join("\n" if r.get("type") == "break" else r.get("text", "") for r in runs)
            (self.cell_blocks if in_cell else self.blocks).append({"type": "code", "id": new_id("p_"), "text": text})
            return
        block = common.para(sid, runs, self.cur_sect["id"], props or None, lst)
        (self.cell_blocks if in_cell else self.blocks).append(block)

    def list_dict(self, para: dict) -> dict:
        lst = self.lists[self.overrides[para["ls"]]]
        level = min(int(para.get("ilvl") or 0), 8)
        levels = lst["levels"]
        lv = levels[level] if level < len(levels) else (levels[-1] if levels else {"nfc": 23, "start": 1, "text": ""})
        out: dict = {"level": level}
        text = lv["text"][1:] if lv["text"] else ""
        if lv["nfc"] in (23, 255):
            out["kind"] = "bullet"
            ch = text[:1]
            if ch and ch not in ("\u2022", "\u00b7", "o", "-", ";") and not (0xE000 <= ord(ch) <= 0xF8FF) and ord(ch) > 8:
                out["bullet"] = ch
            return out
        out["kind"] = "number"
        out["format"] = NFC_FORMAT.get(lv["nfc"], "decimal")
        idx = next((i for i, ch in enumerate(text) if ord(ch) <= 8), -1)
        if idx >= 0:
            pre = "".join(ch for ch in text[:idx] if ord(ch) > 8)
            suf = "".join(ch for ch in text[idx + 1:] if ord(ch) > 8).rstrip(";")
            if pre:
                out["prefix"] = pre
            if suf != ".":
                out["suffix"] = suf
        key = (para["ls"], level)
        if key not in self.seen:
            self.seen.add(key)
            if lv["start"] != 1:
                out["start"] = lv["start"]
        return out

    def begin_row(self) -> None:
        self.cell_defs = []
        self.cur_cell_def = {}
        self.row_flags = {}
        if not self.row_cells:
            self.cell_blocks = []
        self.in_table = True

    def end_cell(self) -> None:
        if self.runs or not self.cell_blocks:
            self.para["intbl"] = True
            self.finish_paragraph()
        self.row_cells.append({"body": self.cell_blocks or [common.para("Normal", [], self.cur_sect["id"])]})
        self.cell_blocks = []

    def end_row(self) -> None:
        widths, prev = [], 0.0
        for d in self.cell_defs:
            widths.append(round(max(1.0, d["x"] - prev), 2))
            prev = d["x"]
        self.table_rows.append({"cells": self.row_cells, "defs": self.cell_defs, "flags": dict(self.row_flags), "widths": widths})
        self.row_cells, self.cell_defs = [], []
        self.para = {}

    def close_table(self) -> None:
        if not self.table_rows:
            return
        rows_raw, self.table_rows = self.table_rows, []
        self.in_table = False
        grid = max((r["widths"] for r in rows_raw), key=len, default=[])
        out_rows: list[list[dict]] = []
        for ri, r in enumerate(rows_raw):
            cells: list[dict] = []
            col = 0
            for ci, d in enumerate(r["defs"]):
                cell = dict(r["cells"][ci]) if ci < len(r["cells"]) else {"body": [common.para("Normal", [], self.cur_sect["id"])]}
                if d.get("clmrg"):
                    host = next((c for c in reversed(cells) if c.get("_row") == ri), None)
                    if host is not None:
                        host["colspan"] = host.get("colspan", 1) + 1
                    col += 1
                    continue
                if d.get("clvmrg"):
                    done = False
                    for prow in range(ri - 1, -1, -1):
                        for pc in out_rows[prow]:
                            if pc.get("_col") == col:
                                pc["rowspan"] = pc.get("rowspan", 1) + 1
                                done = True
                                break
                        if done:
                            break
                    col += 1
                    continue
                cell["_col"], cell["_row"] = col, ri
                if r["flags"].get("hdr"):
                    cell["header"] = True
                shade = self.color_at(d.get("shade"))
                if shade:
                    cell["shading"] = shade
                if d.get("clvertalc"):
                    cell["valign"] = "middle"
                elif d.get("clvertalb"):
                    cell["valign"] = "bottom"
                custom = {}
                for side, spec in (d.get("borders") or {}).items():
                    sp = {k: v for k, v in spec.items() if k != "cf"}
                    colr = self.color_at(spec.get("cf"))
                    if colr:
                        sp["color"] = colr
                    custom[{"t": "top", "b": "bottom", "l": "left", "r": "right"}[side]] = sp
                if custom:
                    cell["_custom"] = custom
                cells.append(cell)
                col += 1
            out_rows.append(cells)
        first = rows_raw[0]["defs"][0] if rows_raw and rows_raw[0]["defs"] else {}
        sides = set((first.get("borders") or {}).keys())
        look = "grid" if len(sides) == 4 else "rows" if sides == {"t", "b"} else "plain"
        for cells in out_rows:
            for c in cells:
                custom = c.pop("_custom", None)
                c.pop("_col", None)
                c.pop("_row", None)
                if custom:
                    base = {"style": "solid", "width": 0.5, "color": "#000000"}
                    if all(sp == base for sp in custom.values()):
                        continue
                    c["borders"] = custom
        block = common.table_block(out_rows, grid or [0.0], look)
        if any(r["flags"].get("hdr") for r in rows_raw):
            block["repeatHeader"] = True
        else:
            block.pop("repeatHeader", None)
        if any(r["flags"].get("keep") for r in rows_raw):
            block["rowSplit"] = False
        if any(r["flags"].get("center") for r in rows_raw):
            block["align"] = "center"
        self.blocks.append(block)

    def walk(self, blocks: list[dict]):
        for b in blocks:
            yield b
            if b["type"] == "table":
                for r in b["rows"]:
                    for c in r["cells"]:
                        yield from self.walk(c["body"])

    def normalise(self) -> None:
        doc = self.doc
        styles = doc["styles"]
        for fid, (name, d) in self.pending_styles.items():
            base = self.style_map.get(d["based"]) if d["based"] is not None else None
            nxt = self.style_map.get(d["next"]) if d["next"] is not None else None
            spec = {"type": "paragraph", "name": name, "basedOn": base if base != fid else None, "next": nxt or fid, "run": d["run"], "para": d["para"]}
            if fid == "Normal":
                spec["basedOn"] = None
                spec["run"] = {**styles["Normal"]["run"], **d["run"]}
                spec["para"] = {**styles["Normal"]["para"], **d["para"]}
            if fid.startswith("Heading") and fid[7:].isdigit():
                spec["para"].setdefault("outlineLevel", int(fid[7:]))
            styles[fid] = spec
        for fid, spec in styles.items():
            if spec.get("basedOn") and spec["basedOn"] not in styles:
                spec["basedOn"] = "Normal" if fid != "Normal" else None
            if spec.get("next") and spec["next"] not in styles:
                spec["next"] = fid
        count: Counter = Counter()
        for b in self.walk(self.blocks):
            if b["type"] == "paragraph" and b["style"] == "Normal":
                for r in b["content"]:
                    if r.get("type") == "text":
                        m = r.get("marks") or {}
                        count[(m.get("font"), m.get("size"))] += len(r["text"])
        normal = styles["Normal"]["run"]
        if count:
            (font, size), _ = count.most_common(1)[0]
            if font:
                normal["font"] = font
            if size:
                normal["size"] = size
        if not normal.get("font"):
            normal["font"] = self.fonts.get(self.deff, "Calibri")
        for b in self.walk(self.blocks):
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
        meta = doc["meta"]
        if self.info.get("title"):
            doc["title"] = self.info["title"].strip()[:200]
        if self.info.get("author"):
            meta["author"] = self.info["author"].strip()[:200]
        if self.info.get("subject"):
            meta["subject"] = self.info["subject"].strip()[:200]
        if self.info.get("keywords"):
            meta["keywords"] = [k.strip() for k in re.split(r"[;,]", self.info["keywords"]) if k.strip()]
        for s in self.sections:
            w, h = s["page"]["width"], s["page"]["height"]
            s["page"]["size"] = next((k for k, (pw, ph) in model.PAGE_SIZES.items() if (abs(pw - w) < 3 and abs(ph - h) < 3) or (abs(ph - w) < 3 and abs(pw - h) < 3)), "custom")
            s["page"]["orientation"] = "landscape" if w > h else "portrait"
        if self.facing:
            doc["settings"]["evenOdd"] = True


def read(data: bytes, name: str) -> tuple[dict, dict[str, bytes]]:
    return Reader(data, name).read()
