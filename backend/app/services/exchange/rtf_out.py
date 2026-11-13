import re

from app.services.exchange import common

CHARS = re.compile(r"[\\{}\n\t\u0080-\U0010ffff]")
UNDERLINE = {True: "\\ul", "single": "\\ul", "double": "\\uldb", "dotted": "\\uld", "dash": "\\uldash", "wavy": "\\ulwave"}
NFC = {"decimal": 0, "decimal-leading-zero": 22, "lower-alpha": 4, "upper-alpha": 3, "lower-roman": 2, "upper-roman": 1}
FIELD = re.compile(r"\{(PAGE|NUMPAGES)\}")
BORDER_STYLE = {"solid": "\\brdrs", "dashed": "\\brdrdash", "dotted": "\\brdrdot", "double": "\\brdrdb", "none": "\\brdrnil"}


def esc(text: str) -> str:
    def sub(m: re.Match) -> str:
        c = m.group(0)
        if c in "\\{}":
            return "\\" + c
        if c == "\n":
            return "\\line "
        if c == "\t":
            return "\\tab "
        n = ord(c)
        if n > 0xFFFF:
            n -= 0x10000
            hi, lo = 0xD800 + (n >> 10), 0xDC00 + (n & 0x3FF)
            return f"\\u{hi - 65536}?\\u{lo - 65536}?"
        return f"\\u{n - 65536 if n > 32767 else n}?"
    return CHARS.sub(sub, text)


def twips(pt: float) -> int:
    return int(round(float(pt) * 20))


class Rtf:
    def __init__(self, doc: dict, media: dict[str, bytes]) -> None:
        self.doc = doc
        self.media = media
        self.styles = doc.get("styles") or {}
        self.fonts: list[str] = []
        self.colors: list[str] = []
        self.lists: list[str] = []
        self.overrides: list[str] = []
        self.style_ids: dict[str, int] = {}
        self.pending_break = False
        self.base_font = common.resolved(self.styles, "Normal")[0].get("font") or "Calibri"
        self.font(self.base_font)
        self.font("Consolas")

    def font(self, name: str) -> int:
        if name not in self.fonts:
            self.fonts.append(name)
        return self.fonts.index(name)

    def color(self, hexv: str) -> int:
        h = hexv.lower()
        if h not in self.colors:
            self.colors.append(h)
        return self.colors.index(h) + 1

    def char_props(self, m: dict) -> str:
        out = []
        if m.get("font"):
            out.append(f"\\f{self.font(m['font'])}")
        if m.get("code") and not m.get("font"):
            out.append("\\f1")
        if m.get("size"):
            out.append(f"\\fs{int(round(float(m['size']) * 2))}")
        if m.get("bold"):
            out.append("\\b")
        if m.get("italic"):
            out.append("\\i")
        if m.get("underline"):
            out.append(UNDERLINE.get(m["underline"], "\\ul"))
        if m.get("strike"):
            out.append("\\strike")
        if m.get("superscript"):
            out.append("\\super")
        elif m.get("subscript"):
            out.append("\\sub")
        if m.get("smallCaps"):
            out.append("\\scaps")
        if m.get("allCaps"):
            out.append("\\caps")
        if m.get("color"):
            out.append(f"\\cf{self.color(m['color'])}")
        if m.get("highlight"):
            out.append(f"\\highlight{self.color(m['highlight'])}")
        if m.get("spacing"):
            out.append(f"\\expndtw{twips(m['spacing'])}")
        return "".join(out)

    def para_props(self, p: dict, direct: bool = False) -> str:
        out = []
        al = p.get("align")
        if al:
            out.append({"center": "\\qc", "right": "\\qr", "justify": "\\qj"}.get(al, "\\ql"))
        left = p.get("indentLeft", p.get("indent"))
        if left is not None:
            out.append(f"\\li{twips(left)}")
        if p.get("indentRight") is not None:
            out.append(f"\\ri{twips(p['indentRight'])}")
        if p.get("indentFirst") is not None:
            out.append(f"\\fi{twips(p['indentFirst'])}")
        if p.get("spaceBefore") is not None:
            out.append(f"\\sb{twips(p['spaceBefore'])}")
        if p.get("spaceAfter") is not None:
            out.append(f"\\sa{twips(p['spaceAfter'])}")
        if p.get("lineSpacing"):
            out.append(f"\\sl{int(round(float(p['lineSpacing']) * 240))}\\slmult1")
        if p.get("keepNext") or p.get("keepWithNext"):
            out.append("\\keepn")
        if p.get("keepLines"):
            out.append("\\keep")
        if p.get("widowControl") is False:
            out.append("\\nowidctlpar")
        if p.get("outlineLevel"):
            out.append(f"\\outlinelevel{int(p['outlineLevel']) - 1}")
        border = p.get("border")
        if border:
            sides = ("t", "l", "b", "r") if border == "box" else ({"top": "t", "bottom": "b", "left": "l", "right": "r"}[border],)
            out.extend(f"\\brdr{s}\\brdrs\\brdrw10\\brsp20" for s in sides)
        if p.get("shading"):
            out.append(f"\\cbpat{self.color(p['shading'])}")
        for t in p.get("tabs") or []:
            align = {"center": "\\tqc", "right": "\\tqr", "decimal": "\\tqdec"}.get(t.get("align"), "")
            lead = {"dot": "\\tldot", "dash": "\\tlhyph", "underline": "\\tlul"}.get(t.get("leader"), "")
            out.append(f"{align}{lead}\\tx{twips(t.get('pos', 0))}")
        return "".join(out)

    def inline(self, runs: list[dict]) -> str:
        return "".join(self.run(r) for r in runs or [])

    def run(self, r: dict) -> str:
        kind = r.get("type")
        if kind == "text":
            m = r.get("marks") or {}
            body = esc(str(r.get("text", "")))
            props = self.char_props(m)
            link = m.get("link")
            if link:
                props = (props if "\\ul" in props else props + "\\ul") + (f"\\cf{self.color('#0563c1')}" if not m.get("color") else "")
                url = str(link).replace("\\", "\\\\").replace('"', "'").replace("{", "").replace("}", "")
                return f'{{\\field{{\\*\\fldinst{{HYPERLINK "{url}"}}}}{{\\fldrslt{{{props} {body}}}}}}}'
            return f"{{{props} {body}}}" if props else body
        if kind == "tab":
            return "\\tab "
        if kind == "break":
            return "\\line "
        if kind == "image":
            return self.image(r)
        if kind == "math":
            return "{\\i " + esc(str(r.get("latex", ""))) + "}"
        if kind == "field":
            return esc(str(r.get("result", "")))
        if kind == "noteRef":
            alt = "\\ftnalt" if r.get("kind") == "endnote" else ""
            return "{\\super\\chftn{\\*\\footnote" + alt + "\\pard\\plain {\\super\\chftn} " + esc(str(r.get("note") or "")) + "}}"
        if kind in ("chip", "shape"):
            text = r.get("text") or r.get("value") or r.get("name") or ""
            return esc(str(text))
        return ""

    def image(self, r: dict) -> str:
        data = self.media.get(str(r.get("media")))
        if data is None:
            return ""
        kind = common.sniff(data)
        if kind is None or kind[0] not in ("png", "jpg"):
            png = common.to_png(data) if kind is None or kind[0] != "svg" else None
            if png is None:
                return esc(f"[{r.get('alt') or 'picture'}]")
            data, kind = png, ("png", "image/png")
        size = common.pixel_size(data) or (100, 100)
        w, h = float(r.get("width", 100)), float(r.get("height", 100))
        blip = "\\pngblip" if kind[0] == "png" else "\\jpegblip"
        return f"{{\\pict{blip}\\picw{size[0]}\\pich{size[1]}\\picwgoal{twips(w)}\\pichgoal{twips(h)}\n{data.hex()}}}"

    def style_defs(self) -> str:
        defs = []
        for i, (sid, spec) in enumerate(self.styles.items(), start=1):
            if spec.get("type") != "paragraph":
                continue
            self.style_ids[sid] = i
        for sid, i in self.style_ids.items():
            spec = self.styles[sid]
            based = self.style_ids.get(spec.get("basedOn") or "", 0)
            nxt = self.style_ids.get(spec.get("next") or "", i)
            props = self.para_props(spec.get("para") or {})
            run = spec.get("run") or {}
            chars = self.char_props({k: v for k, v in run.items()})
            defs.append(f"{{\\s{i}\\sbasedon{based or 222}\\snext{nxt}{props}{chars} {esc(str(spec.get('name') or sid))};}}")
        return "".join(defs)

    def blocks(self, blocks: list[dict], in_cell: bool = False) -> str:
        out: list[str] = []
        i, n = 0, len(blocks)
        while i < n:
            b = blocks[i]
            if b.get("type") == "paragraph" and b.get("list") and b["list"].get("kind") in ("bullet", "number"):
                j = i
                items = []
                kinds: dict[int, str] = {}
                while j < n and blocks[j].get("type") == "paragraph" and blocks[j].get("list") and blocks[j]["list"].get("kind") in ("bullet", "number"):
                    lst = blocks[j]["list"]
                    lv = min(int(lst.get("level", 0) or 0), 8)
                    if kinds.setdefault(lv, lst["kind"]) != lst["kind"] or (items and lv == 0 and lst.get("start") is not None and lst["kind"] == "number"):
                        break
                    items.append(blocks[j])
                    j += 1
                out.append(self.list_run(items, in_cell))
                i = j
                continue
            out.append(self.block(b, in_cell))
            i += 1
        return "".join(out)

    def list_run(self, items: list[dict], in_cell: bool) -> str:
        levels: dict[int, dict] = {}
        for it in items:
            levels.setdefault(min(int(it["list"].get("level", 0) or 0), 8), it["list"])
        lid = len(self.lists) + 1
        lv_defs = []
        for lv in range(9):
            lst = levels.get(lv) or levels.get(0) or levels[min(levels)]
            left, hang = 720 + 360 * lv, 360
            if lst["kind"] == "number":
                fmt = common.list_format(lst if lv in levels else {}, lv)
                pre, suf = lst.get("prefix", ""), lst.get("suffix", ".")
                suf = "." if suf is None else suf
                text = pre + chr(lv) + suf
                hex_text = "".join(f"\\'{ord(c):02x}" for c in (pre + chr(lv) + suf) if ord(c) < 128)
                start = int(lst.get("start") or 1) if lv in levels else 1
                lv_defs.append(f"{{\\listlevel\\levelnfc{NFC[fmt]}\\leveljc0\\levelfollow0\\levelstartat{start}{{\\leveltext\\'{len(text):02x}{hex_text};}}"
                               f"{{\\levelnumbers\\'{len(pre) + 1:02x};}}\\fi-{hang}\\li{left}}}")
            else:
                ch = (lst.get("bullet") if lv in levels else None) or "\u2022"
                lv_defs.append(f"{{\\listlevel\\levelnfc23\\leveljc0\\levelfollow0\\levelstartat1{{\\leveltext\\'01{esc(ch)};}}{{\\levelnumbers;}}\\fi-{hang}\\li{left}}}")
        self.lists.append(f"{{\\list\\listtemplateid{lid * 7 + 100}\\listhybrid{''.join(lv_defs)}{{\\listname ;}}\\listid{lid}}}")
        self.overrides.append(f"{{\\listoverride\\listid{lid}\\listoverridecount0\\ls{lid}}}")
        counter = common.ListCounter()
        out = []
        for it in items:
            lst = it["list"]
            level = min(int(lst.get("level", 0) or 0), 8)
            label = counter.label(lst) if lst["kind"] == "number" else ("\u2022" if not lst.get("bullet") else lst["bullet"])
            left = 720 + 360 * level
            sid = self.style_ids.get(it.get("style") or "Normal")
            head = f"\\pard\\plain{self.page_break()}{f'\\s{sid}' if sid else ''}\\ls{lid}\\ilvl{level}\\fi-360\\li{left}"
            out.append(self.paragraph_body(it, head, f"{{\\*\\listtext {esc(label)}\\tab}}", in_cell))
        return "".join(out)

    def page_break(self) -> str:
        if self.pending_break:
            self.pending_break = False
            return "\\pagebb"
        return ""

    def paragraph_body(self, b: dict, head: str, prefix: str, in_cell: bool) -> str:
        style = b.get("style") or "Normal"
        _, base = common.resolved(self.styles, style)
        props = dict(b.get("props") or {})
        direct = self.para_props({k: v for k, v in props.items() if k != "collapsed"})
        run, _ = common.resolved(self.styles, style)
        chars = self.char_props({k: v for k, v in run.items() if k in ("font", "size", "bold", "italic", "color", "underline", "strike", "smallCaps", "allCaps")})
        end = "\\cell " if in_cell else "\\par\n"
        base_props = self.para_props({k: v for k, v in base.items() if k not in ("outlineLevel", "keepWithNext")}) if "\\s" not in head else ""
        intbl = "\\intbl" if in_cell else ""
        return f"{head}{intbl}{base_props}{direct}{chars} {prefix}{self.inline(b.get('content') or [])}{end}"

    def block(self, b: dict, in_cell: bool = False) -> str:
        kind = b.get("type")
        if kind == "paragraph":
            style = b.get("style") or "Normal"
            sid = self.style_ids.get(style)
            lst = b.get("list")
            head = f"\\pard\\plain{self.page_break()}{f'\\s{sid}' if sid else ''}"
            if lst and lst.get("kind") == "check":
                level = min(int(lst.get("level", 0) or 0), 8)
                glyph = "\u2611" if lst.get("checked") else "\u2610"
                head += f"\\li{720 + 360 * level}\\fi-360"
                return self.paragraph_body(b, head, esc(glyph) + "\\tab ", in_cell)
            return self.paragraph_body(b, head, "", in_cell)
        if kind == "code":
            text = esc(str(b.get("text", "")))
            end = "\\cell " if in_cell else "\\par\n"
            return f"\\pard\\plain{self.page_break()}{'\\intbl' if in_cell else ''}\\cbpat{self.color('#f2f2f2')}\\f1\\fs20 {text}{end}"
        if kind == "pageBreak":
            self.pending_break = True
            return ""
        if kind == "columnBreak":
            return "\\pard\\plain\\column\\par\n"
        if kind == "sectionBreak":
            return self.section_break(b)
        if kind == "table":
            return self.table(b, in_cell)
        if kind in ("chart", "mermaid", "diagram"):
            return self.blocks(common.degrade(b, ""), in_cell)
        return ""

    def sect_def(self, s: dict, first: bool) -> str:
        page = s.get("page") or {}
        m = s.get("margins") or {}
        out = ["\\sectd"]
        start = {"continuous": "\\sbknone", "evenPage": "\\sbkeven", "oddPage": "\\sbkodd"}.get(s.get("start"), "\\sbkpage")
        if not first:
            out.append(start)
        out.append(f"\\pgwsxn{twips(page.get('width', 612))}\\pghsxn{twips(page.get('height', 792))}")
        if page.get("orientation") == "landscape":
            out.append("\\lndscpsxn")
        out.append(f"\\marglsxn{twips(m.get('left', 72))}\\margrsxn{twips(m.get('right', 72))}\\margtsxn{twips(m.get('top', 72))}\\margbsxn{twips(m.get('bottom', 72))}"
                   f"\\headery{twips(m.get('header', 36))}\\footery{twips(m.get('footer', 36))}\\guttersxn{twips(m.get('gutter', 0))}")
        cols = s.get("columns") or {}
        if int(cols.get("count", 1) or 1) > 1:
            out.append(f"\\cols{int(cols['count'])}\\colsx{twips(cols.get('gap', 36))}")
        if s.get("titlePage"):
            out.append("\\titlepg")
        if s.get("pageNumberStart") is not None:
            out.append(f"\\pgnstarts{int(s['pageNumberStart'])}\\pgnrestart")
        fmt = {"lowerRoman": "\\pgnlcrm", "upperRoman": "\\pgnucrm", "lowerLetter": "\\pgnlcltr", "upperLetter": "\\pgnucltr"}.get(s.get("pageNumberFormat"))
        if fmt:
            out.append(fmt)
        if s.get("pageBorder"):
            out.append("\\pgbrdrt\\brdrs\\brdrw10\\pgbrdrb\\brdrs\\brdrw10\\pgbrdrl\\brdrs\\brdrw10\\pgbrdrr\\brdrs\\brdrw10")
        for kind, tags in (("headers", {"default": "header", "first": "headerf", "even": "headerl"}), ("footers", {"default": "footer", "first": "footerf", "even": "footerl"})):
            for key, tag in tags.items():
                item = (s.get(kind) or {}).get(key)
                if item and (item.get("text") or "").strip():
                    out.append(self.hf(tag, item))
                    if key == "default" and (self.doc.get("settings") or {}).get("evenOdd"):
                        out.append(self.hf("headerr" if kind == "headers" else "footerr", item))
        return "".join(out) + "\n"

    def hf(self, tag: str, item: dict) -> str:
        align = {"center": "\\qc", "right": "\\qr"}.get(item.get("align"), "\\ql")
        paras = []
        for line in str(item.get("text") or "").split("\n"):
            body, pos = [], 0
            for m in FIELD.finditer(line):
                body.append(esc(line[pos:m.start()]))
                body.append(f"{{\\field{{\\*\\fldinst {m.group(1)}}}{{\\fldrslt 1}}}}")
                pos = m.end()
            body.append(esc(line[pos:]))
            paras.append(f"\\pard\\plain{align} {''.join(body)}\\par")
        return "{\\" + tag + " " + "".join(paras) + "}"

    def section_break(self, b: dict) -> str:
        nxt = next((s for s in self.doc.get("sections", []) if s.get("id") == b.get("next")), None)
        return "\\sect" + (self.sect_def(nxt, False) if nxt else "\\sectd\n")

    def table(self, b: dict, in_cell: bool = False) -> str:
        if in_cell:
            parts = []
            for row in b.get("rows") or []:
                parts.append(" \u00b7 ".join(common.plain([r for blk in c.get("body") or [] if blk.get("type") == "paragraph" for r in blk.get("content") or []]) for c in row.get("cells") or []))
            return "\\pard\\intbl " + esc("\n".join(parts)) + "\\cell "
        rows = b.get("rows") or []
        placed: dict[tuple[int, int], tuple] = {}
        occ: dict[tuple[int, int], tuple] = {}
        for r, row in enumerate(rows):
            c = 0
            for cell in row.get("cells") or []:
                while (r, c) in occ:
                    c += 1
                cs, rs = max(1, int(cell.get("colspan", 1) or 1)), max(1, min(int(cell.get("rowspan", 1) or 1), len(rows) - r))
                for dr in range(rs):
                    for dc in range(cs):
                        occ[(r + dr, c + dc)] = (r, c, dr, dc, cell)
                placed[(r, c)] = (cell, cs, rs)
                c += cs
        ncols = max([len(b.get("columns") or [])] + [c + 1 for _, c in occ] + [1])
        widths = [float(w or 0) for w in (b.get("columns") or [])] + [0.0] * ncols
        widths = widths[:ncols]
        avail = 468.0
        free = [i for i, w in enumerate(widths) if w <= 0]
        if free:
            share = max(36.0, (avail - sum(widths)) / len(free))
            for i in free:
                widths[i] = share
        look = b.get("look") or "grid"
        head_rows = 0
        for row in rows:
            cells = row.get("cells") or []
            if cells and all(c.get("header") for c in cells):
                head_rows += 1
            else:
                break
        out = []
        for r in range(len(rows)):
            prefix = "\\trowd\\trgaph80\\trleft0" + ("\\trqc" if b.get("align") == "center" else "")
            if b.get("repeatHeader") and r < head_rows:
                prefix += "\\trhdr"
            if b.get("rowSplit") is False:
                prefix += "\\trkeep"
            defs, bodies = [], []
            x = 0.0
            for c in range(ncols):
                x += widths[c]
                info = occ.get((r, c))
                spec = ""
                content = ""
                if info is None:
                    cell = {"body": []}
                    ro, co, dr, dc = r, c, 0, 0
                else:
                    ro, co, dr, dc, cell = info
                if dc > 0 and dr == 0:
                    spec += "\\clmrg"
                elif dc == 0 and info and placed[(ro, co)][1] > 1 and dr == 0:
                    spec += "\\clmgf"
                if dr > 0:
                    spec += "\\clvmrg"
                elif info and placed[(ro, co)][2] > 1:
                    spec += "\\clvmgf"
                if cell.get("valign") in ("middle", "bottom"):
                    spec += "\\clvertalc" if cell["valign"] == "middle" else "\\clvertalb"
                borders = cell.get("borders") or {}
                for side, tag in (("top", "t"), ("left", "l"), ("bottom", "b"), ("right", "r")):
                    sp = borders.get(side)
                    if sp:
                        spec += f"\\clbrdr{tag}{BORDER_STYLE.get(sp.get('style', 'solid'), '\\brdrs')}\\brdrw{max(5, int(float(sp.get('width', 0.5)) * 20))}\\brdrcf{self.color(sp.get('color', '#000000'))}"
                    elif look in ("grid", "accent") or (look in ("rows", "banded") and side in ("top", "bottom")):
                        spec += f"\\clbrdr{tag}\\brdrs\\brdrw10"
                fill = cell.get("shading") or ("#dbe5f1" if look == "accent" and cell.get("header") else "")
                if fill:
                    spec += f"\\clcbpat{self.color(fill)}"
                defs.append(f"{spec}\\cellx{twips(x)}")
                if info is not None and dr == 0 and dc == 0:
                    body = cell.get("body") or []
                    saved = self.pending_break
                    self.pending_break = False
                    content = self.blocks(body or [common.para("Normal", [], "")], True)
                    self.pending_break = saved
                    if not content.endswith("\\cell "):
                        content += "\\cell "
                else:
                    content = "\\pard\\intbl\\cell "
                bodies.append(content)
            out.append(prefix + "".join(defs) + "\n" + "".join(bodies) + "\\row\n")
        return "".join(out)


def build(doc: dict, media: dict[str, bytes]) -> bytes:
    r = Rtf(doc, media)
    r.style_defs()
    sections = doc.get("sections") or []
    body = []
    first = r.sect_def(sections[0], True) if sections else ""
    tabs = common.doc_tabs(doc)
    for tab in tabs:
        if len(tabs) > 1:
            body.append(r.blocks([common.para("Heading1", [common.text_run(str(tab.get("title", "")))], "")]))
        body.append(r.blocks(tab.get("body") or []))
    if r.pending_break:
        body.append("\\pard\\pagebb\\par\n")
    text = "".join(body)
    fonts = "".join(f"{{\\f{i}\\fnil\\fcharset0 {esc(f)};}}" for i, f in enumerate(r.fonts))
    colors = "".join(f"\\red{int(c[1:3], 16)}\\green{int(c[3:5], 16)}\\blue{int(c[5:7], 16)};" for c in r.colors)
    meta = doc.get("meta") or {}
    info = f"{{\\info{{\\title {esc(str(doc.get('title', '')))}}}{{\\author {esc(str(meta.get('author', '')))}}}{{\\subject {esc(str(meta.get('subject', '')))}}}"
    kw = meta.get("keywords")
    info += f"{{\\keywords {esc(', '.join(kw) if isinstance(kw, list) else str(kw or ''))}}}}}"
    lists = f"{{\\*\\listtable{''.join(r.lists)}}}{{\\*\\listoverridetable{''.join(r.overrides)}}}" if r.lists else ""
    facing = "\\facingp" if (doc.get("settings") or {}).get("evenOdd") else ""
    dtab = int(twips((doc.get("settings") or {}).get("defaultTab", 36)))
    head = (f"{{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0\\deftab{dtab}{facing}{{\\fonttbl{fonts}}}{{\\colortbl;{colors}}}"
            f"{{\\stylesheet{{\\s222 Base;}}{r.style_defs()}}}{lists}{info}\n")
    return (head + first + text + "}").encode("ascii", "replace")
