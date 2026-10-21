import hashlib
import io
import re
from collections import Counter

import pdfplumber
import pypdfium2 as pdfium

from app.core.ids import new_id
from app.services import model

MAX_PAGES = 400
BULLETS = "".join(map(chr, (0x2022, 0x25E6, 0x25AA, 0x25CF, 0x25CB, 0x25A0, 0x2023, 0x2043, 0xB7, 0x2013, 0x2014))) + "*-"
BULLET_RE = re.compile(r"^([" + re.escape(BULLETS) + r"])\s+(.*)$")
NUMBER_RE = re.compile(r"^(\(?(?:\d{1,2}|[a-zA-Z]|[ivxIVX]{1,4})[.)])\s+(\S.*)$")
SERIF_RE = re.compile(r"times|serif|georgia|garamond|palatino|cambria|book|minion|baskerville|century|caslon", re.I)
MONO_RE = re.compile(r"mono|courier|consolas|menlo|code", re.I)
END_RE = re.compile(r"[.!?:;\"”)\]]$")


def hex_color(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        value = (value,)
    try:
        vals = [float(v) for v in value]
    except (TypeError, ValueError):
        return None
    if len(vals) == 1:
        r = g = b = vals[0]
    elif len(vals) == 3:
        r, g, b = vals
    elif len(vals) == 4:
        c, m, y, k = vals
        r, g, b = (1 - min(1, c + k)), (1 - min(1, m + k)), (1 - min(1, y + k))
    else:
        return None
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v * 255))) for v in (r, g, b))


def is_dark(hexcolor: str | None) -> bool:
    if not hexcolor:
        return True
    return all(int(hexcolor[i:i + 2], 16) < 60 for i in (1, 3, 5))


def font_info(name: str) -> tuple[str, bool, bool]:
    base = (name or "").split("+")[-1]
    low = base.lower()
    bold = any(k in low for k in ("bold", "black", "heavy", "semibold", "demi"))
    italic = any(k in low for k in ("italic", "oblique"))
    family = re.sub(r"[-,](bold|italic|oblique|regular|roman|medium|light|semibold|black|heavy|mt|ps|psmt|boldmt|it)+.*$", "", base, flags=re.I)
    family = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", family).strip()
    return family or base, bold, italic


def group_chars(chars: list[dict]) -> list[dict]:
    runs: list[dict] = []
    for ch in chars:
        family, bold, italic = font_info(ch.get("fontname", ""))
        fill = hex_color(ch.get("non_stroking_color"))
        key = (round(float(ch.get("size", 0)) * 2) / 2, bold, italic, fill if not is_dark(fill) else None, ch.get("_link"), ch.get("_shift"))
        text = ch["text"]
        if runs and runs[-1]["key"] == key:
            runs[-1]["text"] += text
        else:
            runs.append({"key": key, "text": text, "family": family})
    return runs


def run_dict(run: dict, base_size: float, plain: bool) -> dict | None:
    text = run["text"]
    if not text:
        return None
    size, bold, italic, fill, link, shift = run["key"]
    marks: dict = {}
    if bold and not plain:
        marks["bold"] = True
    if italic:
        marks["italic"] = True
    if shift:
        marks["superscript" if shift == "super" else "subscript"] = True
    elif not plain and abs(size - base_size) >= 0.75 and size > 0:
        marks["size"] = size
    if fill:
        marks["color"] = fill
    if link:
        marks["link"] = link
    if MONO_RE.search(run.get("family", "")):
        marks["code"] = True
    out: dict = {"type": "text", "text": text}
    if marks:
        out["marks"] = marks
    return out


def merge_runs(runs: list[dict]) -> list[dict]:
    out: list[dict] = []
    for r in runs:
        if out and out[-1].get("marks") == r.get("marks"):
            out[-1]["text"] += r["text"]
        else:
            out.append(r)
    return out


def join_lines(lines: list[dict], base_size: float, plain: bool) -> list[dict]:
    runs: list[dict] = []
    for i, line in enumerate(lines):
        chars = line["chars"]
        if i > 0 and runs:
            prev_text = runs[-1]["text"]
            first = line["text"][:1]
            if prev_text.endswith(("-", "­")) and len(prev_text) > 1 and prev_text[-2].isalpha() and first.islower():
                runs[-1]["text"] = prev_text[:-1]
            else:
                runs[-1]["text"] = prev_text + " "
        for r in group_chars(chars):
            d = run_dict(r, base_size, plain)
            if d:
                runs.append(d)
    merged = merge_runs(runs)
    if merged:
        merged[0]["text"] = merged[0]["text"].lstrip()
        merged[-1]["text"] = merged[-1]["text"].rstrip()
    return [r for r in merged if r["text"]]


def line_stats(line: dict) -> tuple[float, bool]:
    chars = [c for c in line["chars"] if c["text"].strip()]
    if not chars:
        return 0.0, False
    size = Counter(round(float(c.get("size", 0)) * 2) / 2 for c in chars).most_common(1)[0][0]
    bold = all(font_info(c.get("fontname", ""))[1] for c in chars)
    return size, bold


class PdfReaderState:
    def __init__(self) -> None:
        self.media: dict[str, bytes] = {}
        self.media_meta: dict[str, dict] = {}
        self.notes: list[str] = []
        self.counts = {"paragraphs": 0, "headings": 0, "tables": 0, "pictures": 0, "lists": 0}

    def note(self, text: str) -> None:
        if text not in self.notes:
            self.notes.append(text)

    def add_picture(self, pil) -> str:
        buf = io.BytesIO()
        pil.save(buf, "PNG", optimize=True)
        data = buf.getvalue()
        name = hashlib.sha256(data).hexdigest()[:20] + ".png"
        self.media[name] = data
        self.media_meta[name] = {"type": "image/png", "bytes": len(data), "source": "pdf", "width": pil.size[0], "height": pil.size[1]}
        return name


def cell_text(page, bbox) -> str:
    x0, top, x1, bottom = bbox
    try:
        crop = page.within_bbox((max(0, x0 + 0.5), max(0, top + 0.5), min(page.width, x1 - 0.5), min(page.height, bottom - 0.5)))
        text = crop.extract_text() or ""
    except (ValueError, KeyError):
        return ""
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    out = ""
    for ln in lines:
        if out.endswith("-") and ln[:1].islower() and len(out) > 1 and out[-2].isalpha():
            out = out[:-1] + ln
        else:
            out = f"{out} {ln}" if out else ln
    return out


def table_block(state: PdfReaderState, page, table, base_size: float) -> dict | None:
    cells = [c for c in table.cells]
    if len(cells) < 4:
        return None
    xs = sorted({round(c[0], 1) for c in cells} | {round(c[2], 1) for c in cells})
    merged_x: list[float] = []
    for x in xs:
        if not merged_x or x - merged_x[-1] > 2:
            merged_x.append(x)
    xs = merged_x
    if len(xs) < 3:
        return None

    def col_of(x: float) -> int:
        return min(range(len(xs)), key=lambda i: abs(xs[i] - x))

    ncols = len(xs) - 1
    rows_out: list[list[dict]] = []
    owners: dict[tuple[int, int], tuple[int, dict]] = {}
    fills = [(r["x0"], r["top"], r["x1"], r["bottom"], hex_color(r.get("non_stroking_color"))) for r in page.rects if r.get("fill")]
    for ri, row in enumerate(table.rows):
        out_cells: list[dict] = []
        seen = set()
        for cell in row.cells:
            if cell is None:
                continue
            c0, c1 = col_of(cell[0]), col_of(cell[2])
            if c1 <= c0:
                continue
            seen.update(range(c0, c1))
            text = cell_text(page, cell)
            para = {"type": "paragraph", "id": new_id("p_"), "style": "Normal", "section": "", "content": [{"type": "text", "text": text}] if text else []}
            para["props"] = {"spaceAfter": 0}
            entry: dict = {"body": [para], "_c": c0}
            if c1 - c0 > 1:
                entry["colspan"] = c1 - c0
            for fx0, ftop, fx1, fbottom, fcol in fills:
                if fcol and fcol.lower() not in ("#ffffff", "#fefefe") and abs(fx0 - cell[0]) < 2 and abs(ftop - cell[1]) < 2 and abs(fx1 - cell[2]) < 2 and abs(fbottom - cell[3]) < 2:
                    entry["shading"] = fcol
                    break
            out_cells.append(entry)
            for k in range(c0, c1):
                owners[(ri, k)] = (ri, entry)
        for k in range(ncols):
            if k not in seen:
                for back in range(ri - 1, -1, -1):
                    own = owners.get((back, k))
                    if own:
                        start_row, entry = own
                        if start_row + entry.get("rowspan", 1) == ri or start_row + entry.get("rowspan", 1) > ri:
                            entry["rowspan"] = ri - start_row + 1
                            owners[(ri, k)] = own
                        break
        rows_out.append(out_cells)
    if len(rows_out) < 2 or not any(c["body"][0]["content"] for r in rows_out for c in r):
        return None
    first = table.rows[0]
    header = False
    try:
        head_chars = [c for c in page.within_bbox(first.bbox).chars if c["text"].strip()]
        header = bool(head_chars) and all(font_info(c.get("fontname", ""))[1] for c in head_chars)
    except (ValueError, KeyError):
        header = False
    final_rows = []
    for ri, cells_ in enumerate(rows_out):
        row_cells = []
        for entry in sorted(cells_, key=lambda e: e["_c"]):
            entry = {k: v for k, v in entry.items() if k != "_c"}
            if header and ri == 0:
                entry["header"] = True
            row_cells.append(entry)
        if row_cells:
            final_rows.append({"cells": row_cells})
    widths = [round(xs[i + 1] - xs[i], 1) for i in range(ncols)]
    state.counts["tables"] += 1
    return {"type": "table", "id": new_id("t_"), "columns": widths, "rows": final_rows, "look": "grid", "repeatHeader": header, "align": ""}


def rect_in(inner, outer, pad: float = 1.5) -> bool:
    return inner[0] >= outer[0] - pad and inner[2] <= outer[2] + pad and inner[1] >= outer[1] - pad and inner[3] <= outer[3] + pad
