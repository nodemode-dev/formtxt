import base64
import re

from app.services.exchange import common

ESCAPE = re.compile(r"([\\`*_\[\]<>])")


def esc(text: str, table: bool = False) -> str:
    out = ESCAPE.sub(r"\\\1", text)
    if table:
        out = out.replace("|", "\\|")
    return out


class Markdown:
    def __init__(self, doc: dict, media: dict[str, bytes]) -> None:
        self.doc = doc
        self.media = media
        self.counts: dict[int, int] = {}

    def run(self, r: dict, table: bool = False) -> str:
        kind = r.get("type")
        if kind == "text":
            return self.text(r, table)
        if kind == "tab":
            return "    "
        if kind == "break":
            return "<br>" if table else "\\\n"
        if kind == "image":
            data = self.media.get(str(r.get("media")))
            if data is None:
                return ""
            k = common.sniff(data)
            uri = f"data:{k[1] if k else 'application/octet-stream'};base64,{base64.b64encode(data).decode('ascii')}"
            return f"![{esc(str(r.get('alt') or ''))}]({uri})"
        if kind == "math":
            latex = str(r.get("latex", ""))
            return f"$${latex}$$" if r.get("display") else f"${latex}$"
        if kind == "noteRef":
            return f"[^{'e' if r.get('kind') == 'endnote' else 'f'}{r.get('n')}]"
        if kind in ("field", "chip", "shape"):
            return esc(str(r.get("result") or r.get("text") or r.get("value") or ""), table)
        return ""

    def text(self, r: dict, table: bool) -> str:
        m = r.get("marks") or {}
        raw = str(r.get("text", ""))
        if not raw:
            return ""
        if m.get("code"):
            body = raw if "`" not in raw else raw.replace("`", "'")
            out = f"`{body}`"
        else:
            out = esc(raw, table)
        lead = len(out) - len(out.lstrip())
        trail = len(out) - len(out.rstrip())
        core = out.strip()
        if not core:
            return out
        if m.get("bold"):
            core = f"**{core}**"
        if m.get("italic"):
            core = f"*{core}*"
        if m.get("strike"):
            core = f"~~{core}~~"
        if m.get("underline"):
            core = f"<u>{core}</u>"
        if m.get("superscript"):
            core = f"<sup>{core}</sup>"
        if m.get("subscript"):
            core = f"<sub>{core}</sub>"
        if m.get("link"):
            core = f"[{core}]({m['link']})"
        return out[:lead] + core + out[len(out) - trail:] if trail else out[:lead] + core

    def inline(self, runs: list[dict], table: bool = False) -> str:
        return "".join(self.run(r, table) for r in runs or [])

    def guard(self, text: str) -> str:
        return re.sub(r"^(\s*)(#{1,6}\s|>|[-+]\s|\d+[.)]\s)", lambda m: m.group(1) + "\\" + m.group(2), text)

    def blocks(self, blocks: list[dict], indent: str = "") -> list[str]:
        out: list[str] = []
        prev_list = False
        prev_kind = ""
        for b in blocks:
            kind = b.get("type")
            is_list = kind == "paragraph" and bool(b.get("list"))
            this_kind = ((b.get("list") or {}).get("kind") == "number") if is_list else False
            if prev_list and (not is_list or (this_kind != prev_kind and int((b["list"].get("level") or 0)) == 0)):
                out.append("")
            if not is_list:
                self.counts.clear()
            prev_kind = this_kind
            chunk = self.block(b)
            if chunk is None:
                prev_list = is_list
                continue
            if is_list:
                out.append(chunk)
            else:
                out.append(chunk)
                out.append("")
            prev_list = is_list
        if prev_list:
            out.append("")
        return out

    def block(self, b: dict) -> str | None:
        kind = b.get("type")
        if kind == "paragraph":
            return self.paragraph(b)
        if kind == "code":
            text = str(b.get("text", ""))
            fence = "```" if "```" not in text else "~~~"
            return f"{fence}\n{text}\n{fence}"
        if kind in ("pageBreak", "sectionBreak"):
            return "---"
        if kind == "table":
            return self.table(b)
        if kind == "mermaid":
            return f"```mermaid\n{b.get('code', '')}\n```"
        if kind in ("chart", "diagram"):
            return "\n".join(self.blocks(common.degrade(b, ""))).rstrip()
        return None

    def paragraph(self, b: dict) -> str:
        style = b.get("style") or "Normal"
        text = self.inline(b.get("content") or [])
        lst = b.get("list")
        if lst:
            level = min(int(lst.get("level", 0) or 0), 8)
            kind = lst.get("kind")
            pad = "  " * level
            if kind == "number":
                cur = int(lst["start"]) if lst.get("start") is not None else self.counts.get(level, 0) + 1
                self.counts[level] = cur
                for deeper in [k for k in self.counts if k > level]:
                    del self.counts[deeper]
                return f"{'   ' * level}{cur}. {text}"
            for deeper in [k for k in self.counts if k >= level]:
                del self.counts[deeper]
            if kind == "check":
                return f"{pad}- [{'x' if lst.get('checked') else ' '}] {text}"
            return f"{pad}- {text}"
        if style == "Title":
            return f"# {text}"
        if style.startswith("Heading") and style[7:].isdigit():
            n = min(6, int(style[7:]))
            return f"{'#' * n} {text}"
        if style == "Subtitle":
            return f"*{text}*" if text else ""
        if style == "Quote":
            return "\n".join("> " + line for line in (text or "").split("\n"))
        return self.guard(text)

    def table(self, b: dict) -> str:
        rows = b.get("rows") or []
        grid: list[list[str]] = []
        aligns: list[str] = []
        for ri, row in enumerate(rows):
            cells = []
            for c in row.get("cells") or []:
                body = c.get("body") or []
                parts = []
                for blk in body:
                    if blk.get("type") == "paragraph":
                        parts.append(self.inline(blk.get("content") or [], True))
                    elif blk.get("type") == "code":
                        parts.append(esc(str(blk.get("text", "")), True))
                text = "<br>".join(p for p in parts if p).replace("\n", " ")
                cells.append(text)
                for _ in range(int(c.get("colspan", 1) or 1) - 1):
                    cells.append("")
                if ri == 0:
                    al = ((body[0].get("props") or {}).get("align") if body and body[0].get("type") == "paragraph" else None)
                    aligns.append({"center": ":---:", "right": "---:"}.get(al, "---"))
                    aligns.extend(["---"] * (int(c.get("colspan", 1) or 1) - 1))
            grid.append(cells)
        if not grid:
            return ""
        n = max(len(r) for r in grid)
        grid = [r + [""] * (n - len(r)) for r in grid]
        aligns = (aligns + ["---"] * n)[:n]
        lines = ["| " + " | ".join(grid[0]) + " |", "| " + " | ".join(aligns) + " |"]
        lines += ["| " + " | ".join(r) + " |" for r in grid[1:]]
        return "\n".join(lines)


def build(doc: dict, media: dict[str, bytes]) -> bytes:
    md = Markdown(doc, media)
    lines: list[str] = []
    tabs = common.doc_tabs(doc)
    for tab in tabs:
        if len(tabs) > 1:
            lines.append(f"## {esc(str(tab.get('title', '')))}")
            lines.append("")
        lines.extend(md.blocks(tab.get("body") or []))
    notes = doc.get("notes") or {}
    for group, tag in (("footnotes", "f"), ("endnotes", "e")):
        if notes.get(group):
            lines.append("")
            lines.extend(f"[^{tag}{i}]: {esc(body)}" for i, body in enumerate(notes[group].values(), start=1))
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"
    return text.encode("utf-8")
