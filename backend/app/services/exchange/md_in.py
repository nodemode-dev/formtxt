import base64
import re
import urllib.parse

from app.core.ids import new_id
from app.services import intake
from app.services.exchange import common
from app.services.exchange.common import Builder

INLINE = re.compile(
    r"(?P<esc>\\[\\`*_\[\]<>#+\-.!|{}()$~])"
    r"|(?P<fn>\[\^(?P<fid>[^\]\s]+)\])"
    r"|(?P<code>(?P<tick>`+)(?P<codetext>.+?)(?P=tick))"
    r"|(?P<img>!\[(?P<alt>[^\]]*)\]\((?P<isrc>[^)\s]+)(?:\s+\"[^\"]*\")?\))"
    r"|(?P<link>\[(?P<ltext>(?:[^\[\]]|\[[^\]]*\])*)\]\((?P<lhref>[^)\s]+)(?:\s+\"[^\"]*\")?\))"
    r"|(?P<math2>\$\$(?P<m2>.+?)\$\$)"
    r"|(?P<math>\$(?=\S)(?P<m1>[^$\n]+?)(?<=\S)\$(?!\d))"
    r"|(?P<bold>\*\*(?P<btext>.+?)\*\*|__(?P<btext2>.+?)__)"
    r"|(?P<strike>~~(?P<stext>.+?)~~)"
    r"|(?P<ital>\*(?=\S)(?P<itext>.+?)(?<=\S)\*|(?<![A-Za-z0-9_])_(?=\S)(?P<itext2>.+?)(?<=\S)_(?![A-Za-z0-9_]))"
    r"|(?P<tag><(?P<tname>u|sup|sub)>(?P<ttext>.*?)</(?P=tname)>)"
    r"|(?P<br><br\s*/?>)",
    re.S)
FENCE = re.compile(r"^(\s*)(```+|~~~+)\s*([\w+-]*)\s*$")
BULLET = re.compile(r"^(\s*)([-*+])\s+(.*)$")
NUMBER = re.compile(r"^(\s*)(\d{1,9})([.)])\s+(.*)$")
CHECK = re.compile(r"^\[([ xX])\]\s+(.*)$")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
RULE = re.compile(r"^\s{0,3}([-*_])(\s*\1){2,}\s*$")
SEP = re.compile(r"^:?-{1,}:?$")


class Reader:
    def __init__(self, text: str, name: str) -> None:
        self.text = text
        self.defs: dict[str, str] = {}
        self.note_counts: dict[str, int] = {}
        self.b = Builder(common.title_of(name))
        self.section = self.b.doc["sections"][0]["id"]
        self.b.doc["styles"]["ListParagraph"] = {"type": "paragraph", "name": "List Paragraph", "basedOn": "Normal", "next": "ListParagraph", "run": {}, "para": {"indentLeft": 18.0}}

    def inline(self, text: str, marks: dict | None = None) -> list[dict]:
        marks = marks or {}
        out: list[dict] = []
        pos = 0

        def add(t: str, m: dict) -> None:
            if t:
                out.append(common.text_run(t, dict(m) or None))
        for m in INLINE.finditer(text):
            add(text[pos:m.start()], marks)
            pos = m.end()
            if m.group("esc"):
                add(m.group("esc")[1:], marks)
            elif m.group("fn"):
                fid = m.group("fid")
                if fid in self.defs:
                    kind = "endnote" if re.fullmatch(r"e\d+", fid) else "footnote"
                    self.note_counts[kind] = self.note_counts.get(kind, 0) + 1
                    n = self.note_counts[kind]
                    out.append({"type": "noteRef", "id": new_id("n_"), "kind": kind, "n": n, "note": self.defs[fid], "text": str(n)})
                else:
                    add(m.group("fn"), marks)
            elif m.group("code"):
                add(m.group("codetext"), {**marks, "code": True})
            elif m.group("img"):
                run = self.image(m.group("isrc"), m.group("alt"))
                out.append(run if run else common.text_run(f"[{m.group('alt') or 'picture'}]", marks or None))
            elif m.group("link"):
                out.extend(self.inline(m.group("ltext"), {**marks, "link": m.group("lhref")}))
            elif m.group("math2"):
                out.append({"type": "math", "latex": m.group("m2").strip(), "display": True})
            elif m.group("math"):
                out.append({"type": "math", "latex": m.group("m1")})
            elif m.group("bold"):
                out.extend(self.inline(m.group("btext") or m.group("btext2"), {**marks, "bold": True}))
            elif m.group("strike"):
                out.extend(self.inline(m.group("stext"), {**marks, "strike": True}))
            elif m.group("ital"):
                out.extend(self.inline(m.group("itext") or m.group("itext2"), {**marks, "italic": True}))
            elif m.group("tag"):
                key = {"u": "underline", "sup": "superscript", "sub": "subscript"}[m.group("tname")]
                out.extend(self.inline(m.group("ttext"), {**marks, key: True}))
            elif m.group("br"):
                out.append({"type": "break"})
        add(text[pos:], marks)
        return common.merge_runs(out)

    def image(self, src: str, alt: str) -> dict | None:
        m = re.match(r"data:([^;,]+)?(;base64)?,(.*)", src, re.S)
        if not m:
            return None
        try:
            data = base64.b64decode(m.group(3)) if m.group(2) else urllib.parse.unquote_to_bytes(m.group(3))
        except ValueError:
            return None
        return self.b.image(data, None, None, alt)

    def para(self, style: str, text: str, lst: dict | None = None, props: dict | None = None) -> dict:
        runs = self.inline(text)
        if runs and runs[-1].get("type") == "break":
            runs.pop()
        return common.para(style, runs, self.section, props, lst)

    def read(self) -> tuple[dict, dict[str, bytes]]:
        lines = self.text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        kept = []
        for ln in lines:
            d = re.match(r"^\[\^([^\]\s]+)\]:\s*(.*)$", ln)
            if d:
                self.defs[d.group(1)] = d.group(2).strip()
            else:
                kept.append(ln)
        lines = kept
        blocks: list[dict] = []
        buf: list[str] = []
        i = 0
        n = len(lines)

        def flush() -> None:
            if buf:
                joined = ""
                for line in buf:
                    hard = line.endswith("  ") or line.endswith("\\")
                    piece = line.strip() if not line.endswith("\\") else line.strip()[:-1]
                    joined += piece + ("<br>" if hard else " ")
                blocks.append(self.para("Normal", joined.rstrip().removesuffix("<br>").rstrip()))
                buf.clear()

        while i < n:
            line = lines[i]
            stripped = line.strip()
            f = FENCE.match(line)
            if f:
                flush()
                fence, lang = f.group(2), f.group(3)
                body = []
                i += 1
                while i < n and not (lines[i].strip().startswith(fence[:3]) and set(lines[i].strip()) <= set(fence[0])):
                    body.append(lines[i][len(f.group(1)):] if lines[i].startswith(f.group(1)) else lines[i])
                    i += 1
                i += 1
                if lang == "mermaid":
                    blocks.append({"type": "mermaid", "id": new_id("p_"), "code": "\n".join(body), "svg": "", "w": 0, "h": 0})
                else:
                    blocks.append({"type": "code", "id": new_id("p_"), "text": "\n".join(body)})
                continue
            if not stripped:
                flush()
                i += 1
                continue
            h = HEADING.match(stripped)
            if h:
                flush()
                blocks.append(self.para(f"Heading{len(h.group(1))}", h.group(2)))
                i += 1
                continue
            if buf and i + 1 <= n and re.fullmatch(r"=+|-+", stripped) and not BULLET.match(line) and len(buf) >= 1:
                level = 1 if stripped[0] == "=" else 2
                text = " ".join(s.strip() for s in buf)
                buf.clear()
                blocks.append(self.para(f"Heading{level}", text))
                i += 1
                continue
            if RULE.match(line) and not buf:
                i += 1
                continue
            if stripped.startswith("|") and stripped.count("|") >= 2:
                flush()
                rows = []
                while i < n and lines[i].strip().startswith("|") and lines[i].strip().count("|") >= 2:
                    rows.append(lines[i].strip())
                    i += 1
                blocks.append(self.table(rows))
                continue
            if stripped.startswith(">"):
                flush()
                quote = []
                while i < n and lines[i].strip().startswith(">"):
                    quote.append(re.sub(r"^\s*>\s?", "", lines[i]))
                    i += 1
                for para_text in re.split(r"\n\s*\n", "\n".join(quote)):
                    if para_text.strip():
                        blocks.append(self.para("Quote", " ".join(s.strip() for s in para_text.split("\n"))))
                continue
            lm = BULLET.match(line) or NUMBER.match(line)
            if lm:
                flush()
                i = self.read_list(lines, i, blocks)
                continue
            buf.append(line)
            i += 1
        flush()
        doc = self.b.doc
        first = next((b for b in blocks if b["type"] == "paragraph"), None)
        for b in blocks:
            if b["type"] == "paragraph" and b["style"] == "Heading1":
                doc["title"] = common.plain(b["content"]).strip()[:200] or doc["title"]
                if b is first:
                    b["style"] = "Title"
                break
        doc["tabs"][0]["body"] = blocks or doc["tabs"][0]["body"]
        return doc, self.b.media

    def read_list(self, lines: list[str], i: int, blocks: list[dict]) -> int:
        n = len(lines)
        indents: list[int] = []
        counters: dict[int, int] = {}
        while i < n:
            line = lines[i].replace("\t", "    ")
            m = BULLET.match(line)
            nm = NUMBER.match(line)
            if not (m or nm):
                if line.strip() and line.startswith(("  ", " ")) and blocks and blocks[-1]["type"] == "paragraph" and blocks[-1].get("list") and not FENCE.match(line):
                    blocks[-1]["content"] = common.merge_runs(blocks[-1]["content"] + [common.text_run(" ")] + self.inline(line.strip()))
                    i += 1
                    continue
                if not line.strip() and i + 1 < n and (BULLET.match(lines[i + 1].replace("\t", "    ")) or NUMBER.match(lines[i + 1].replace("\t", "    "))):
                    i += 1
                    continue
                break
            indent = len((m or nm).group(1))
            while indents and indent < indents[-1]:
                indents.pop()
            if not indents or indent > indents[-1]:
                indents.append(indent)
            level = min(len(indents) - 1, 8)
            body = m.group(3) if m else nm.group(4)
            if m:
                ck = CHECK.match(body)
                if ck:
                    lst = {"kind": "check", "level": level, "checked": ck.group(1) in "xX"}
                    body = ck.group(2)
                else:
                    lst = {"kind": "bullet", "level": level}
            else:
                lst = {"kind": "number", "level": level, "format": "decimal"}
                start = int(nm.group(2))
                if start != counters.get(level, 0) + 1:
                    lst["start"] = start
                counters[level] = start
                for deeper in [k for k in counters if k > level]:
                    del counters[deeper]
            blocks.append(self.para("Normal", body, lst))
            i += 1
        return i

    def split_row(self, line: str) -> list[str]:
        return intake._cells(line)

    def table(self, rows: list[str]) -> dict:
        cells = [self.split_row(r) for r in rows]
        header = len(cells) > 1 and bool(cells[1]) and all(SEP.match(c) for c in cells[1])
        align = cells[1] if header else []
        grid = [cells[0]] + cells[2:] if header else cells
        ncols = max(len(r) for r in grid)
        out = []
        for ri, r in enumerate(grid):
            row = []
            for c in range(ncols):
                value = r[c] if c < len(r) else ""
                spec = align[c] if c < len(align) else ""
                props = {"align": "center" if spec.startswith(":") and spec.endswith(":") else "right"} if spec.endswith(":") else None
                body = [common.para("Normal", self.inline(value), self.section, props)]
                cell: dict = {"body": body}
                if header and ri == 0:
                    cell["header"] = True
                row.append(cell)
            out.append(row)
        avail = self.b.body_width()
        return common.table_block(out, [round((avail - 0.75) / ncols, 2)] * ncols, "grid")


def read(data: bytes, name: str) -> tuple[dict, dict[str, bytes]]:
    return Reader(intake.decode(data), name).read()
