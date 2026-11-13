import copy
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

from app.core import config
from app.core.ids import block_id, new_id
from app.services import model, store, versions

ENVELOPES = {"dl": ("DL", 623.62, 311.81), "env10": ("#10", 684.0, 297.0), "c5": ("C5", 649.13, 459.21), "monarch": ("Monarch", 540.0, 279.0)}
LABEL_SHEETS = {
    "5160": {"name": "Avery 5160", "cols": 3, "rows": 10, "pitch": 198.0, "height": 72.0, "left": 13.5, "top": 36.0},
    "5163": {"name": "Avery 5163", "cols": 2, "rows": 5, "pitch": 288.0, "height": 144.0, "left": 11.25, "top": 36.0},
    "5161": {"name": "Avery 5161", "cols": 2, "rows": 10, "pitch": 288.0, "height": 72.0, "left": 11.25, "top": 36.0},
}
LABEL_FILL = {"line": 12.1, "frame": 9.6}


def _text(value: str, size: float | None = None, bold: bool = False) -> dict:
    run: dict = {"type": "text", "text": value}
    marks: dict = {}
    if size:
        marks["size"] = size
    if bold:
        marks["bold"] = True
    if marks:
        run["marks"] = marks
    return run


def _para(section: str, text: str = "", props: dict | None = None, size: float | None = None, bold: bool = False) -> dict:
    block: dict = {"type": "paragraph", "id": new_id("p_"), "style": "Normal", "section": section, "content": [_text(text, size, bold)] if text else []}
    if props:
        block["props"] = props
    return block


def _fresh(title: str) -> dict:
    author = str(config.read_settings().get("author") or "")
    return model.new_document(title, author)


def envelope(size: str, delivery: str, sender: str, font_size: float = 12.0) -> dict:
    if size not in ENVELOPES:
        raise ValueError(f"Unknown envelope size {size}. Use one of {', '.join(ENVELOPES)}.")
    label, width, height = ENVELOPES[size]
    doc = _fresh(f"Envelope {label}")
    section = doc["sections"][0]
    section["page"] = {"size": size, "width": width, "height": height, "orientation": "landscape"}
    section["margins"] = {"top": 24.0, "right": 36.0, "bottom": 24.0, "left": 36.0, "header": 0.0, "footer": 0.0, "gutter": 0.0}
    body = []
    lines = [x for x in sender.splitlines()]
    for line in lines:
        body.append(_para(section["id"], line, {"spaceAfter": 0.0, "lineSpacing": 1.0}, 10.0))
    to = [x for x in delivery.splitlines()]
    for i, line in enumerate(to):
        props: dict = {"indent": round(width * 0.4, 1), "spaceAfter": 0.0, "lineSpacing": 1.15}
        if i == 0:
            props["spaceBefore"] = max(24.0, round(height * 0.22 - len(lines) * 12.0, 1))
        body.append(_para(section["id"], line, props, font_size))
    if not body:
        body.append(_para(section["id"]))
    doc["tabs"][0]["body"] = body
    return store.adopt(doc)


def _fill(template: str, record: dict) -> str:
    return re.sub(r"\{([^{}]{1,60})\}", lambda m: str(record.get(m.group(1), "")), template)


def labels(sheet: str, template: str, records: list[dict] | None, count: int = 0, font_size: float = 10.0, skip: int = 0) -> dict:
    spec = LABEL_SHEETS.get(sheet)
    if not spec:
        raise ValueError(f"Unknown label sheet {sheet}. Use one of {', '.join(LABEL_SHEETS)}.")
    per_page = spec["cols"] * spec["rows"]
    if records:
        texts = [_fill(template, r) for r in records[:2000]]
    else:
        texts = [template] * max(1, min(int(count or per_page), 2000))
    texts = [""] * max(0, skip) + texts
    doc = _fresh(f"Labels {spec['name']}")
    section = doc["sections"][0]
    right = round(612.0 - spec["left"] - spec["cols"] * spec["pitch"], 2)
    section["margins"] = {"top": spec["top"], "right": max(0.0, right), "bottom": 0.0, "left": spec["left"], "header": 0.0, "footer": 0.0, "gutter": 0.0}
    lh = LABEL_FILL["line"] * font_size / 10.0
    rows = []
    for start in range(0, len(texts), spec["cols"]):
        cells = []
        chunk = texts[start:start + spec["cols"]]
        chunk += [""] * (spec["cols"] - len(chunk))
        for text in chunk:
            lines = text.splitlines() or [""]
            body = [_para(section["id"], ln, {"spaceAfter": 0.0, "lineSpacing": 1.0}, font_size) for ln in lines]
            pad = spec["height"] - LABEL_FILL["frame"] - len(lines) * lh - 2.0
            body.append(_para(section["id"], "", {"spaceBefore": round(max(0.0, pad), 1), "spaceAfter": 0.0, "lineSpacing": 0.1}, 1.0))
            cells.append({"body": body})
        rows.append({"cells": cells})
    table = {"type": "table", "id": new_id("t_"), "look": "plain", "columns": [spec["pitch"]] * spec["cols"], "rows": rows, "rowSplit": False}
    doc["tabs"][0]["body"] = [table, _para(section["id"], "", {"spaceBefore": 0.0, "spaceAfter": 0.0, "lineSpacing": 0.1}, 1.0)]
    return store.adopt(doc)


def _blocks_walk(blocks: list, fn) -> None:
    for block in blocks:
        if block.get("type") == "table":
            for row in block.get("rows") or []:
                for cell in (row or {}).get("cells") or []:
                    _blocks_walk(cell.get("body") or [], fn)
        else:
            fn(block)


def _reid(blocks: list) -> None:
    for block in blocks:
        block["id"] = block_id(block)
        if block.get("type") == "table":
            for row in block.get("rows") or []:
                for cell in (row or {}).get("cells") or []:
                    _reid(cell.get("body") or [])


def merge(source_id: str, doc: dict, tab_id: str, records: list[dict], title: str) -> dict:
    tab = next((t for t in doc.get("tabs", []) if t.get("id") == tab_id), (doc.get("tabs") or [None])[0])
    if not tab:
        raise ValueError("The document has no text to merge.")
    if not records:
        raise ValueError("The data file has no records.")
    _, media = store.load(source_id)
    merged: list[dict] = []
    for n, record in enumerate(records[:1000]):
        blocks = copy.deepcopy(tab.get("body") or [])

        def fill(block: dict, record=record) -> None:
            runs = block.get("content")
            if not isinstance(runs, list):
                return
            out = []
            for run in runs:
                if isinstance(run, dict) and run.get("type") == "mergefield":
                    value = str(record.get(str(run.get("name", "")), ""))
                    if value:
                        item = {"type": "text", "text": value}
                        if run.get("marks"):
                            item["marks"] = run["marks"]
                        out.append(item)
                else:
                    out.append(run)
            block["content"] = out
        _blocks_walk(blocks, fill)
        _reid(blocks)
        if n:
            merged.append({"type": "pageBreak", "id": new_id("p_")})
        merged.extend(blocks)
    fresh = copy.deepcopy(doc)
    fresh["tabs"] = [{**tab, "body": merged}]
    settings = fresh.setdefault("settings", {})
    for key in ("mailMerge", "protection", "approval"):
        settings.pop(key, None)
    return store.adopt(fresh, media, title)


def simple_pdf(doc: dict, target: Path) -> Path:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(str(target), pagesize=letter)
    width, height = letter
    y = height - 72
    c.setTitle(str(doc.get("title", "")))

    def line(text: str, size: float = 11, font: str = "Helvetica", gap: float = 4) -> None:
        nonlocal y
        words = text.split()
        row = ""
        for word in words + [None]:
            probe = f"{row} {word}".strip() if word else row
            if word is None or c.stringWidth(probe, font, size) > width - 144:
                if y < 72 + size:
                    c.showPage()
                    y = height - 72
                c.setFont(font, size)
                c.drawString(72, y, row)
                y -= size * 1.25 + gap
                row = word or ""
            else:
                row = probe
        if not words:
            y -= size

    for item in versions.outline(doc, 4000):
        style, text = item["style"], item["text"]
        if style == "Break":
            c.showPage()
            y = height - 72
        elif style == "Signature":
            y -= 18
            if y < 140:
                c.showPage()
                y = height - 72
            c.setFont("Helvetica", 12)
            c.drawString(72, y, "X")
            c.line(90, y - 2, 330, y - 2)
            y -= 14
            for part in text.split("\n"):
                c.setFont("Helvetica", 9)
                c.drawString(90, y, part)
                y -= 11
            y -= 14
        elif style == "Title":
            line(text, 24, "Helvetica-Bold", 8)
        elif style.startswith("Heading"):
            line(text, 16 if style == "Heading1" else 13, "Helvetica-Bold", 6)
        else:
            line(text)
    c.save()
    return target


def sign_handoff(doc_id: str) -> dict:
    doc, _ = store.load(doc_id)
    folder = config.data_dir() / "Signing"
    folder.mkdir(parents=True, exist_ok=True)
    name = "".join(ch for ch in str(doc.get("title", "")) if ch.isalnum() or ch in " -_").strip() or "document"
    pdf = simple_pdf(doc, folder / f"{name}.pdf")
    body = json.dumps({"path": str(pdf)}).encode("utf-8")
    req = urllib.request.Request("http://127.0.0.1:8198/api/pdf/open-path", data=body, headers={"content-type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=4) as res:
            res.read()
        return {"ok": True, "path": str(pdf), "message": "Opened in FormPDF. Add the signature there."}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "path": str(pdf), "message": f"FormPDF answered with an error ({exc.code}). The PDF is saved at {pdf}."}
    except (urllib.error.URLError, OSError):
        return {"ok": False, "path": str(pdf), "message": f"FormPDF is not running on this computer. Start FormPDF, then try again. The PDF is saved at {pdf}."}
