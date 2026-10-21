import re

from app.core.ids import new_id
from app.services import model

TEXT_TYPES = {".md": "markdown", ".markdown": "markdown", ".txt": "text"}
INLINE = re.compile(r"(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)")


class Unsupported(ValueError):
    pass


def decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16"):
        try:
            text = data.decode(enc)
            if enc == "utf-16" and not data[:2] in (b"\xff\xfe", b"\xfe\xff"):
                continue
            return text
        except UnicodeDecodeError:
            continue
    return data.decode("cp1252", errors="replace")


def _runs(text: str) -> list[dict]:
    runs: list[dict] = []
    pos = 0
    for m in INLINE.finditer(text):
        if m.start() > pos:
            runs.append({"type": "text", "text": text[pos:m.start()]})
        if m.group(2) is not None:
            runs.append({"type": "text", "text": m.group(2), "marks": {"bold": True}})
        elif m.group(4) is not None:
            runs.append({"type": "text", "text": m.group(4), "marks": {"italic": True}})
        elif m.group(5) is not None:
            runs.append({"type": "text", "text": m.group(5), "marks": {"code": True}})
        else:
            runs.append({"type": "text", "text": m.group(6), "marks": {"link": m.group(7)}})
        pos = m.end()
    if pos < len(text):
        runs.append({"type": "text", "text": text[pos:]})
    return [r for r in runs if r["text"]]


def _paragraphs(text: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    buf: list[str] = []

    table: list[str] = []

    def flush(style: str = "Normal") -> None:
        if buf:
            out.append((style, " ".join(s.strip() for s in buf)))
            buf.clear()
        if table:
            out.append(("Table", "\n".join(table)))
            table.clear()

    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("|") and stripped.count("|") >= 2:
            if buf:
                out.append(("Normal", " ".join(s.strip() for s in buf)))
                buf.clear()
            table.append(stripped)
            continue
        if table:
            flush()
        if not stripped:
            flush()
            continue
        heading = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading:
            flush()
            out.append((f"Heading{len(heading.group(1))}", heading.group(2).strip()))
        elif stripped.startswith(">"):
            flush()
            out.append(("Quote", stripped.lstrip("> ").strip()))
        elif re.match(r"^([-*+]|\d+[.)])\s+", stripped):
            flush()
            out.append(("ListParagraph", stripped))
        elif re.match(r"^(-{3,}|\*{3,}|_{3,})$", stripped):
            flush()
        else:
            buf.append(stripped)
    flush()
    return out


SEPARATOR = re.compile(r"^:?-{2,}:?$")


def _cells(line: str) -> list[str]:
    parts = re.split(r"(?<!\\)\|", line.strip())
    if parts and not parts[0].strip():
        parts = parts[1:]
    if parts and not parts[-1].strip():
        parts = parts[:-1]
    return [p.strip().replace("\\|", "|") for p in parts]


def _table(source: str, section: str, width: float) -> dict:
    lines = [_cells(line) for line in source.splitlines()]
    header = len(lines) > 1 and bool(lines[1]) and all(SEPARATOR.match(c) for c in lines[1])
    align = lines[1] if header else []
    grid = [lines[0]] + lines[2:] if header else lines
    cols = max(len(r) for r in grid) if grid else 1
    rows = []
    for i, r in enumerate(grid):
        cells = []
        for c in range(cols):
            value = r[c] if c < len(r) else ""
            spec = align[c] if c < len(align) else ""
            para: dict = {"type": "paragraph", "id": new_id("p_"), "style": "Normal", "section": section, "content": _runs(value)}
            if spec.endswith(":"):
                para["props"] = {"align": "center" if spec.startswith(":") else "right"}
            cell: dict = {"body": [para]}
            if header and i == 0:
                cell["header"] = True
            cells.append(cell)
        rows.append({"cells": cells})
    table = {"type": "table", "id": new_id("t_"), "look": "grid", "columns": [round((width - 0.75) / cols, 2)] * cols, "rows": rows}
    if header:
        table["repeatHeader"] = True
    return table


def to_document(name: str, data: bytes) -> dict:
    ext = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
    kind = TEXT_TYPES.get(ext)
    if kind is None:
        raise Unsupported(f"{name}: FormTxt opens .md, .markdown and .txt today; Word, OpenDocument, RTF, HTML, .doc and PDF arrive with the exchange phase.")
    text = decode(data)
    stem = name.rsplit(".", 1)[0] or "Imported document"
    doc = model.new_document(stem)
    doc["styles"]["ListParagraph"] = {"type": "paragraph", "name": "List Paragraph", "basedOn": "Normal", "next": "ListParagraph",
                                      "run": {}, "para": {"indentLeft": 18.0, "spaceAfter": 2.0}}
    section = doc["sections"][0]["id"]
    rows = _paragraphs(text) if kind == "markdown" else [("Normal", p.strip()) for p in re.split(r"\n\s*\n", text) if p.strip()]
    if kind == "markdown":
        for i, (style, value) in enumerate(rows):
            if style == "Heading1":
                doc["title"] = value[:200]
                rows[i] = ("Title", value) if i == 0 else rows[i]
                break
    body = []
    width = float(doc["sections"][0]["page"]["width"]) - float(doc["sections"][0]["margins"]["left"]) - float(doc["sections"][0]["margins"]["right"])
    for style, value in rows:
        if style == "Table":
            body.append(_table(value, section, width))
            continue
        runs = _runs(value) if kind == "markdown" else [{"type": "text", "text": value}]
        body.append({"type": "paragraph", "id": new_id("p_"), "style": style, "section": section, "content": runs})
    doc["tabs"][0]["body"] = body or doc["tabs"][0]["body"]
    return doc
