import io
import re
import struct

import olefile

from app.core.ids import new_id
from app.services import model
from app.services.exchange import common
from app.services.exchange.common import Builder

HEADING = {i: f"Heading{i}" for i in range(1, 10)}
ICO = ["", "#000000", "#0000ff", "#00ffff", "#00ff00", "#ff00ff", "#ff0000", "#ffff00", "#ffffff", "#000080", "#008080", "#008000", "#800080", "#800000", "#808000", "#808080", "#c0c0c0"]
KUL = {1: True, 2: True, 3: "double", 4: "dotted", 6: True, 7: "dash", 9: "dash", 17: "wavy", 18: "wavy"}
SPRA_SIZE = {0: 1, 1: 1, 2: 2, 3: 4, 4: 2, 5: 2, 7: 3}
CP1252 = {0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8A: "Š",
          0x8B: "‹", 0x8C: "Œ", 0x8E: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: chr(0x2014),
          0x98: "˜", 0x99: "™", 0x9A: "š", 0x9B: "›", 0x9C: "œ", 0x9E: "ž", 0x9F: "Ÿ"}


def u16(b: bytes, o: int) -> int:
    return struct.unpack_from("<H", b, o)[0]


def i16(b: bytes, o: int) -> int:
    return struct.unpack_from("<h", b, o)[0]


def u32(b: bytes, o: int) -> int:
    return struct.unpack_from("<I", b, o)[0]


def sprms(buf: bytes):
    pos = 0
    n = len(buf)
    while pos + 2 <= n:
        op = u16(buf, pos)
        pos += 2
        spra = op >> 13
        if spra == 6:
            if pos >= n:
                return
            if op == 0xD608:
                size = u16(buf, pos) if pos + 2 <= n else 0
                yield op, buf[pos:pos + 2 + size]
                pos += 2 + size
                continue
            size = buf[pos]
            yield op, buf[pos + 1:pos + 1 + size]
            pos += 1 + size
        else:
            size = SPRA_SIZE[spra]
            yield op, buf[pos:pos + size]
            pos += size


class Reader:
    def __init__(self, data: bytes, name: str) -> None:
        try:
            self.ole = olefile.OleFileIO(io.BytesIO(data))
        except Exception as exc:
            raise common.Unsupported(f"{name}: not a Word 97-2003 document.") from exc
        if not self.ole.exists("WordDocument"):
            raise common.Unsupported(f"{name}: not a Word 97-2003 document.")
        self.name = name
        self.wd = self.ole.openstream("WordDocument").read()
        if len(self.wd) < 0x200 or u16(self.wd, 0) != 0xA5EC:
            raise common.Unsupported(f"{name}: not a Word 97-2003 document.")
        flags = u16(self.wd, 0x0A)
        if flags & 0x0100:
            raise common.Unsupported(f"{name}: the document is password protected; remove the password in Word and try again.")
        tname = "1Table" if flags & 0x0200 else "0Table"
        if not self.ole.exists(tname):
            raise common.Unsupported(f"{name}: the document is damaged (no table stream).")
        self.table = self.ole.openstream(tname).read()
        self.data_stream = self.ole.openstream("Data").read() if self.ole.exists("Data") else b""
        csw = u16(self.wd, 32)
        pos = 34 + csw * 2
        cslw = u16(self.wd, pos)
        self.lw = pos + 2
        pos = self.lw + cslw * 4
        self.ccp = {k: u32(self.wd, self.lw + i * 4) for k, i in (("text", 3), ("ftn", 4), ("hdd", 5), ("atn", 7), ("edn", 8), ("txbx", 9), ("hdrtxbx", 10))}
        self.fclcb = pos + 2

    def pair(self, i: int) -> tuple[int, int]:
        o = self.fclcb + i * 8
        if o + 8 > len(self.wd):
            return 0, 0
        return u32(self.wd, o), u32(self.wd, o + 4)

    def read_text(self) -> None:
        fc, lcb = self.pair(33)
        clx = self.table[fc:fc + lcb]
        pos = 0
        pcd = b""
        while pos < len(clx):
            t = clx[pos]
            if t == 1:
                pos += 3 + u16(clx, pos + 1)
            elif t == 2:
                n = u32(clx, pos + 1)
                pcd = clx[pos + 5:pos + 5 + n]
                break
            else:
                break
        if not pcd:
            raise common.Unsupported(f"{self.name}: the document text could not be located.")
        count = (len(pcd) - 4) // 12
        cps = [u32(pcd, i * 4) for i in range(count + 1)]
        self.pieces = []
        chars: list[str] = []
        for i in range(count):
            fcv = u32(pcd, (count + 1) * 4 + i * 8 + 2)
            n = cps[i + 1] - cps[i]
            if fcv & 0x40000000:
                start = (fcv & 0x3FFFFFFF) // 2
                raw = self.wd[start:start + n]
                piece = "".join(CP1252.get(b, chr(b)) for b in raw)
                self.pieces.append((cps[i], cps[i + 1], start, 1))
            else:
                start = fcv & 0x3FFFFFFF
                piece = self.wd[start:start + n * 2].decode("utf-16-le", "replace")
                self.pieces.append((cps[i], cps[i + 1], start, 2))
            chars.append(piece.ljust(n, "\x00")[:n])
        self.text = "".join(chars)

    def fc_to_cps(self, f0: int, f1: int):
        for cs, ce, start, size in self.pieces:
            end = start + (ce - cs) * size
            lo, hi = max(f0, start), min(f1, end)
            if lo < hi:
                yield cs + (lo - start) // size, cs + (hi - start) // size

    def plc(self, i: int, cb: int) -> tuple[list[int], list[bytes]]:
        fc, lcb = self.pair(i)
        if not lcb:
            return [], []
        data = self.table[fc:fc + lcb]
        n = (lcb - 4) // (4 + cb)
        cps = [u32(data, k * 4) for k in range(n + 1)]
        items = [data[(n + 1) * 4 + k * cb:(n + 1) * 4 + (k + 1) * cb] for k in range(n)]
        return cps, items

    def char_runs(self) -> list[tuple[int, int, bytes]]:
        out = []
        fcs, items = self.plc(12, 4)
        for fc0, item in zip(fcs, items):
            page = u32(item, 0) * 512
            blk = self.wd[page:page + 512]
            if len(blk) < 512:
                continue
            crun = blk[511]
            for r in range(crun):
                f0, f1 = u32(blk, r * 4), u32(blk, r * 4 + 4)
                off = blk[(crun + 1) * 4 + r] * 2
                if not off:
                    continue
                cb = blk[off]
                grp = blk[off + 1:off + 1 + cb]
                for c0, c1 in self.fc_to_cps(f0, f1):
                    out.append((c0, c1, grp))
        return out

    def para_runs(self) -> list[tuple[int, int, int, bytes]]:
        out = []
        fcs, items = self.plc(13, 4)
        for fc0, item in zip(fcs, items):
            page = u32(item, 0) * 512
            blk = self.wd[page:page + 512]
            if len(blk) < 512:
                continue
            crun = blk[511]
            for r in range(crun):
                f0, f1 = u32(blk, r * 4), u32(blk, r * 4 + 4)
                off = blk[(crun + 1) * 4 + r * 13] * 2
                if not off:
                    istd, grp = 0, b""
                else:
                    cb = blk[off]
                    if cb == 0:
                        cb2 = blk[off + 1]
                        body = blk[off + 2:off + 2 + cb2 * 2]
                    else:
                        body = blk[off + 1:off + 1 + cb * 2 - 1]
                    istd = u16(body, 0) if len(body) >= 2 else 0
                    grp = body[2:]
                for c0, c1 in self.fc_to_cps(f0, f1):
                    out.append((c0, c1, istd, grp))
        return out

    def stylesheet(self) -> dict[int, tuple[str, bytes, bytes]]:
        fc, lcb = self.pair(1)
        if not lcb:
            return {}
        data = self.table[fc:fc + lcb]
        cb_stshi = u16(data, 0)
        base_size = u16(data, 4) if cb_stshi >= 4 else 10
        pos = 2 + cb_stshi
        out = {}
        istd = 0
        while pos + 2 <= len(data):
            cb = u16(data, pos)
            pos += 2
            if cb:
                std = data[pos:pos + cb]
                if len(std) > base_size + 2:
                    w1, w2 = u16(std, 2), u16(std, 4)
                    stk, cupx = w1 & 0xF, w2 & 0xF
                    cch = u16(std, base_size)
                    name = std[base_size + 2:base_size + 2 + cch * 2].decode("utf-16-le", "replace")
                    p = base_size + 2 + (cch + 1) * 2
                    if p % 2:
                        p += 1
                    upx = []
                    for _ in range(cupx):
                        if p + 2 > len(std):
                            break
                        n = u16(std, p)
                        upx.append(std[p + 2:p + 2 + n])
                        p += 2 + n + (n % 2)
                    papx = upx[0][2:] if stk == 1 and len(upx) >= 1 and len(upx[0]) >= 2 else b""
                    chpx = upx[1] if stk == 1 and len(upx) >= 2 else (upx[0] if stk == 2 and upx else b"")
                    out[istd] = (name, papx, chpx)
            pos += cb
            istd += 1
        return out

    def fonts(self) -> list[str]:
        fc, lcb = self.pair(15)
        if not lcb:
            return []
        data = self.table[fc:fc + lcb]
        names = []
        pos = 2 if len(data) > 2 else 0
        cdata = u16(data, 0)
        pos = 4 if u16(data, 2) == 0 and cdata < 4096 else 2
        while pos < len(data):
            cb = data[pos]
            ffn = data[pos + 1:pos + 1 + cb]
            if len(ffn) < 40:
                break
            raw = ffn[39:]
            end = 0
            while end + 1 < len(raw) and (raw[end] or raw[end + 1]):
                end += 2
            names.append(raw[:end].decode("utf-16-le", "replace"))
            pos += 1 + cb
        return names

    def char_marks(self, grp: bytes, fonts: list[str]) -> dict:
        m: dict = {}
        for op, val in sprms(grp):
            if op in (0x0835, 0x0836, 0x0837, 0x083B, 0x083C):
                on = val[:1] in (b"\x01", b"\x81")
                key = {0x0835: "bold", 0x0836: "italic", 0x0837: "strike", 0x083B: "smallCaps", 0x083C: "allCaps"}[op]
                if on:
                    m[key] = True
                elif val[:1] == b"\x00":
                    m[key] = False
            elif op == 0x2A3E and val:
                if val[0] in KUL:
                    m["underline"] = KUL[val[0]]
                elif val[0] == 0:
                    m["underline"] = False
            elif op == 0x4A43 and len(val) >= 2:
                m["size"] = u16(val, 0) / 2
            elif op == 0x2A42 and val and 0 < val[0] < len(ICO):
                m["color"] = ICO[val[0]]
            elif op == 0x6870 and len(val) >= 3:
                m["color"] = "#%02x%02x%02x" % (val[0], val[1], val[2])
            elif op == 0x2A48 and val:
                if val[0] == 1:
                    m["superscript"] = True
                elif val[0] == 2:
                    m["subscript"] = True
            elif op == 0x4A4F and len(val) >= 2:
                idx = u16(val, 0)
                if idx < len(fonts):
                    m["font"] = fonts[idx]
            elif op == 0x2A0C and val and 0 < val[0] < len(ICO):
                m["highlight"] = ICO[val[0]]
        return m

    def para_props(self, grp: bytes) -> dict:
        p: dict = {}
        for op, val in sprms(grp):
            if op in (0x2403, 0x2461) and val:
                p["align"] = {0: "left", 1: "center", 2: "right", 3: "justify"}.get(val[0], "left")
            elif op == 0x2416:
                p["intable"] = bool(val[:1] == b"\x01")
            elif op == 0x2417:
                p["ttp"] = bool(val[:1] == b"\x01")
            elif op == 0x260A and val:
                p["ilvl"] = val[0]
            elif op == 0x460B and len(val) >= 2:
                p["ilfo"] = u16(val, 0)
            elif op in (0x845E, 0x840F) and len(val) >= 2:
                p["indent"] = round(i16(val, 0) / 20, 2)
            elif op == 0x845D and len(val) >= 2:
                p["indentRight"] = round(i16(val, 0) / 20, 2)
            elif op == 0x8460 and len(val) >= 2:
                p["indentFirst"] = round(i16(val, 0) / 20, 2)
            elif op == 0xA413 and len(val) >= 2:
                p["spaceBefore"] = round(u16(val, 0) / 20, 2)
            elif op == 0xA414 and len(val) >= 2:
                p["spaceAfter"] = round(u16(val, 0) / 20, 2)
            elif op == 0x2407 and val[:1] == b"\x01":
                p["pagebb"] = True
            elif op == 0xD608 and len(val) > 4:
                n = val[2]
                if len(val) >= 3 + (n + 1) * 2:
                    xs = [i16(val, 3 + k * 2) for k in range(n + 1)]
                    p["cols"] = [round((xs[k + 1] - xs[k]) / 20, 2) for k in range(n)]
        return p

    def sections(self) -> list[tuple[int, dict]]:
        cps, items = self.plc(6, 12)
        out = []
        for cp_end, item in zip(cps[1:], items):
            fc = u32(item, 2)
            props: dict = {}
            if fc != 0xFFFFFFFF and fc + 2 <= len(self.wd):
                cb = u16(self.wd, fc)
                for op, val in sprms(self.wd[fc + 2:fc + 2 + cb]):
                    if op == 0xB01F and len(val) >= 2:
                        props["w"] = u16(val, 0) / 20
                    elif op == 0xB020 and len(val) >= 2:
                        props["h"] = u16(val, 0) / 20
                    elif op == 0x301D and val:
                        props["land"] = val[0] == 2
                    elif op == 0xB021 and len(val) >= 2:
                        props["left"] = u16(val, 0) / 20
                    elif op == 0xB022 and len(val) >= 2:
                        props["right"] = u16(val, 0) / 20
                    elif op == 0x9023 and len(val) >= 2:
                        props["top"] = abs(i16(val, 0)) / 20
                    elif op == 0x9024 and len(val) >= 2:
                        props["bottom"] = abs(i16(val, 0)) / 20
                    elif op == 0x3009 and val:
                        props["bkc"] = val[0]
                    elif op == 0x500B and len(val) >= 2:
                        props["cols"] = u16(val, 0) + 1
                    elif op == 0x900C and len(val) >= 2:
                        props["gap"] = u16(val, 0) / 20
                    elif op == 0x300A and val:
                        props["title"] = val[0] == 1
            out.append((cp_end, props))
        return out

    def hdd_stories(self) -> list[str]:
        cps, _ = self.plc(11, 0)
        if not cps:
            fc, lcb = self.pair(11)
            if not lcb:
                return []
            data = self.table[fc:fc + lcb]
            cps = [u32(data, k * 4) for k in range(lcb // 4)]
        base = self.ccp["text"] + self.ccp["ftn"]
        out = []
        for a, b in zip(cps, cps[1:]):
            out.append(self.clean_story(self.text[base + a:base + b]))
        return out

    @staticmethod
    def clean_story(text: str) -> str:
        out = []
        depth = 0
        in_instr = False
        skip = False
        instr = ""
        for ch in text:
            if ch == "\x13":
                depth += 1
                in_instr = True
                skip = False
                instr = ""
            elif ch == "\x14" and in_instr:
                in_instr = False
                word = instr.strip().split(" ")[0].upper()
                if word in ("PAGE", "NUMPAGES"):
                    out.append("{" + word + "}")
                    skip = True
            elif ch == "\x15":
                if in_instr:
                    in_instr = False
                    word = instr.strip().split(" ")[0].upper()
                    if word in ("PAGE", "NUMPAGES"):
                        out.append("{" + word + "}")
                skip = False
                depth = max(0, depth - 1)
            elif skip:
                continue
            elif in_instr:
                instr += ch
            elif ch == "\r":
                out.append("\n")
            elif ch == "\x07":
                out.append("\t")
            elif ch >= " " or ch == "\t":
                out.append(ch)
        return "".join(out).strip("\n")

    def read(self) -> tuple[dict, dict[str, bytes]]:
        self.read_text()
        fonts = self.fonts()
        styles = self.stylesheet()
        char_runs = self.char_runs()
        para_runs = self.para_runs()
        total = self.ccp["text"]
        text = self.text[:total]
        b = Builder(common.title_of(self.name))
        doc = b.doc
        doc["settings"]["compatMode"] = "word97"
        style_ids: dict[int, str] = {}
        for istd, (nm, papx, chpx) in styles.items():
            fid = common.BUILTIN_NAMES.get(nm.lower())
            if fid is None and 1 <= istd <= 9 and nm.lower().startswith("heading"):
                fid = HEADING[istd]
            if fid is None:
                fid = re.sub(r"[^A-Za-z0-9]", "", nm) or f"Style{istd}"
            style_ids[istd] = fid
            run = {k: v for k, v in self.char_marks(chpx, fonts).items() if k in ("font", "size", "color", "bold", "italic", "underline", "strike", "smallCaps", "allCaps") and v}
            para = {k: v for k, v in self.para_props(papx).items() if k in ("align", "spaceBefore", "spaceAfter", "indent", "indentRight", "indentFirst")}
            if "indent" in para:
                para["indentLeft"] = para.pop("indent")
            if fid in doc["styles"] and fid != "Normal":
                spec = doc["styles"][fid]
                spec["run"] = {**spec["run"], **run}
                spec["para"] = {**spec["para"], **para}
            elif fid == "Normal":
                doc["styles"]["Normal"]["run"].update(run)
                doc["styles"]["Normal"]["para"].update(para)
                if fonts and "font" not in run:
                    doc["styles"]["Normal"]["run"]["font"] = fonts[0]
            else:
                doc["styles"][fid] = {"type": "paragraph", "name": nm, "basedOn": "Normal", "next": fid, "run": run, "para": para}
        doc["styles"].setdefault("ListParagraph", {"type": "paragraph", "name": "List Paragraph", "basedOn": "Normal", "next": "ListParagraph", "run": {}, "para": {"indentLeft": 18.0}})
        cmark = [0] * (total + 1)
        cprops: list[dict] = [{}]
        seen: dict[bytes, int] = {}
        for c0, c1, grp in char_runs:
            if c0 >= total:
                continue
            idx = seen.get(grp)
            if idx is None:
                idx = len(cprops)
                cprops.append(self.char_marks(grp, fonts))
                seen[grp] = idx
            for k in range(c0, min(c1, total)):
                cmark[k] = idx
        pmark: list[tuple[int, bytes] | None] = [None] * (total + 1)
        for c0, c1, istd, grp in para_runs:
            for k in range(c0, min(c1, total)):
                pmark[k] = (istd, grp)
        secs = self.sections()
        sec_ends = {end - 1 for end, _ in secs}
        sections = []
        for i, (end, props) in enumerate(secs or [(total, {})]):
            sections.append(self.make_section(props, i == 0))
        doc["sections"] = sections
        hdd = self.hdd_stories()
        for i, sec in enumerate(sections):
            base = 6 + i * 6
            for key, idx in (("default", base + 1), ("first", base + 4), ("even", base)):
                if key == "first" and not sec.get("titlePage"):
                    continue
                if key == "even" and not doc["settings"].get("evenOdd"):
                    continue
                if idx < len(hdd) and hdd[idx].strip():
                    sec["headers"][key] = {"text": hdd[idx], "align": "left"}
            for key, idx in (("default", base + 3), ("first", base + 5), ("even", base + 2)):
                if key == "first" and not sec.get("titlePage"):
                    continue
                if key == "even" and not doc["settings"].get("evenOdd"):
                    continue
                if idx < len(hdd) and hdd[idx].strip():
                    sec["footers"][key] = {"text": hdd[idx], "align": "left"}
        blocks = self.build_blocks(b, text, cmark, cprops, pmark, style_ids, sections, sec_ends)
        doc["tabs"][0]["body"] = blocks or doc["tabs"][0]["body"]
        self.meta(doc)
        return doc, b.media

    def meta(self, doc: dict) -> None:
        try:
            m = self.ole.get_metadata()
            if m.title:
                doc["title"] = m.title.decode("cp1252", "replace").strip()[:200] if isinstance(m.title, bytes) else str(m.title)[:200]
            if m.author:
                doc["meta"]["author"] = (m.author.decode("cp1252", "replace") if isinstance(m.author, bytes) else str(m.author))[:200]
            if m.subject:
                doc["meta"]["subject"] = (m.subject.decode("cp1252", "replace") if isinstance(m.subject, bytes) else str(m.subject))[:200]
        except Exception:
            return

    def make_section(self, props: dict, first: bool) -> dict:
        sec = model.default_section()
        w, h = props.get("w"), props.get("h")
        if w and h:
            name = next((k for k, (pw, ph) in model.PAGE_SIZES.items() if (abs(pw - w) < 3 and abs(ph - h) < 3) or (abs(ph - w) < 3 and abs(pw - h) < 3)), "custom")
            sec["page"] = {"size": name, "width": round(w, 2), "height": round(h, 2), "orientation": "landscape" if w > h else "portrait"}
        for key in ("left", "right", "top", "bottom"):
            if props.get(key) is not None:
                sec["margins"][key] = round(props[key], 2)
        if props.get("cols", 1) > 1:
            sec["columns"] = {"count": min(4, props["cols"]), "gap": round(props.get("gap", 36.0), 2)}
        if props.get("title"):
            sec["titlePage"] = True
        sec["start"] = {0: "continuous", 3: "evenPage", 4: "oddPage"}.get(props.get("bkc", 2), "nextPage")
        return sec

    def build_blocks(self, b: Builder, text: str, cmark: list[int], cprops: list[dict], pmark: list, style_ids: dict[int, str], sections: list[dict], sec_ends: set[int]) -> list[dict]:
        blocks: list[dict] = []
        sec_idx = 0
        cur_section = sections[0]["id"]
        n = len(text)
        pos = 0
        para_start = 0
        cell_paras: list[dict] = []
        row_cells: list[dict] = []
        table_rows: list[dict] = []
        row_widths: list[float] = []

        def inline(a: int, z: int) -> list[dict]:
            runs: list[dict] = []
            buf: list[str] = []
            cur = None
            field_stack: list[dict] = []

            def flush() -> None:
                if buf:
                    marks = {k: v for k, v in (cur or {}).items() if v}
                    runs.append(common.text_run("".join(buf), marks or None))
                    buf.clear()
            for k in range(a, z):
                ch = text[k]
                if ch == "\x13":
                    flush()
                    field_stack.append({"instr": "", "phase": "instr", "link": None})
                    continue
                if ch == "\x14" and field_stack:
                    f = field_stack[-1]
                    f["phase"] = "result"
                    m = re.search(r'HYPERLINK\s+"([^"]+)"', f["instr"])
                    f["link"] = m.group(1) if m else None
                    continue
                if ch == "\x15":
                    if field_stack:
                        field_stack.pop()
                    flush()
                    continue
                if field_stack and field_stack[-1]["phase"] == "instr":
                    field_stack[-1]["instr"] += ch
                    continue
                if ch in ("\x01", "\x08", "\x02", "\x05", "\x0c", "\r", "\x07", "\x1f", "\x00"):
                    continue
                marks = cprops[cmark[k]]
                link = next((f["link"] for f in reversed(field_stack) if f["link"]), None)
                eff = dict(marks)
                if link:
                    eff["link"] = link
                if eff != cur:
                    flush()
                    cur = eff
                if ch == "\t":
                    flush()
                    runs.append({"type": "tab"})
                elif ch == "\x0b":
                    flush()
                    runs.append({"type": "break"})
                elif ch == "\x1e":
                    buf.append("‑")
                else:
                    buf.append(ch)
            flush()
            return common.merge_runs(runs)

        def make_para(a: int, z: int, term: int) -> dict:
            istd, grp = pmark[term] if pmark[term] is not None else (0, b"")
            props = self.para_props(grp)
            fid = style_ids.get(istd, "Normal")
            if fid not in b.doc["styles"]:
                fid = "Normal"
            runs = inline(a, z)
            direct = {k: v for k, v in props.items() if k in ("align", "indent", "indentRight", "indentFirst", "spaceBefore", "spaceAfter")}
            lst = None
            if props.get("ilfo"):
                lst = {"kind": "bullet", "level": min(8, props.get("ilvl", 0))}
                direct.pop("indent", None)
                direct.pop("indentFirst", None)
            blk = common.para(fid, runs, cur_section, direct or None, lst)
            blk["_pb"] = props.get("pagebb", False)
            blk["_tab"] = props
            return blk

        def close_table() -> None:
            nonlocal table_rows
            if not table_rows:
                return
            ncols = max(len(r) for r in table_rows)
            widths = next((w for w in (row_widths_list) if len(w) == ncols), [])
            if len(widths) != ncols:
                avail = b.body_width()
                widths = [round(avail / ncols, 2)] * ncols
            rows = []
            for r in table_rows:
                cells = [{"body": c or [common.para("Normal", [], cur_section)]} for c in r]
                while len(cells) < ncols:
                    cells.append({"body": [common.para("Normal", [], cur_section)]})
                rows.append(cells)
            blocks.append(common.table_block(rows, widths, "grid"))
            table_rows = []
            row_widths_list.clear()

        row_widths_list: list[list[float]] = []
        i = 0
        start = 0
        while i < n:
            ch = text[i]
            if ch in ("\r", "\x07") or ch == "\x0c":
                if ch == "\x0c":
                    if start < i:
                        pass
                    if i in sec_ends and sec_idx + 1 < len(sections):
                        close_table()
                        sec_idx += 1
                        cur_section = sections[sec_idx]["id"]
                        blocks.append({"type": "sectionBreak", "id": new_id("p_"), "next": cur_section})
                    else:
                        close_table()
                        blocks.append({"type": "pageBreak", "id": new_id("p_")})
                    start = i + 1
                    i += 1
                    continue
                para = make_para(start, i, i)
                props = para.pop("_tab")
                pb = para.pop("_pb")
                if props.get("intable") or props.get("ttp"):
                    if ch == "\x07" and (props.get("ttp") or (start == i and not cell_paras and False)):
                        if row_cells or cell_paras:
                            pass
                        table_rows.append(list(row_cells))
                        if props.get("cols"):
                            row_widths_list.append(props["cols"])
                        row_cells.clear()
                        cell_paras.clear()
                    else:
                        cell_paras.append(para)
                        if ch == "\x07":
                            row_cells.append(list(cell_paras))
                            cell_paras.clear()
                else:
                    close_table()
                    if pb:
                        blocks.append({"type": "pageBreak", "id": new_id("p_")})
                    blocks.append(para)
                start = i + 1
            i += 1
        if start < n and text[start:n].strip("\x00\r\x07\x0c"):
            para = make_para(start, n, min(n, len(pmark) - 1))
            para.pop("_tab")
            para.pop("_pb")
            blocks.append(para)
        close_table()
        while blocks and blocks[-1]["type"] == "paragraph" and not blocks[-1]["content"] and len(blocks) > 1:
            blocks.pop()
        return blocks


def read(data: bytes, name: str) -> tuple[dict, dict[str, bytes]]:
    try:
        return Reader(data, name).read()
    except common.Unsupported:
        raise
    except (struct.error, IndexError, ValueError, KeyError) as exc:
        raise common.Unsupported(f"{name}: this Word 97-2003 file could not be read completely ({exc}).") from exc
