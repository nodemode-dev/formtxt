import hashlib
import io
import re
from collections.abc import Iterator

from app.core.ids import new_id
from app.services import model

MEDIA_TYPES = {"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif", "bmp": "image/bmp", "webp": "image/webp", "svg": "image/svg+xml"}
HEADING_NAMES = {f"heading {n}": f"Heading{n}" for n in range(1, 10)}
BUILTIN_NAMES = {"normal": "Normal", "title": "Title", "subtitle": "Subtitle", "quote": "Quote", **HEADING_NAMES}
NUM_FORMATS = ("decimal", "decimal-leading-zero", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman")
DEFAULT_CYCLE = ("decimal", "lower-alpha", "lower-roman")


class Unsupported(ValueError):
    pass


MAX_ZIP_TOTAL = 1 << 30
MAX_ZIP_ENTRY = 256 << 20


XML_BAD = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f￾￿\ud800-\udfff]")


def xml_safe(value):
    if isinstance(value, str):
        return XML_BAD.sub("", value) if XML_BAD.search(value) else value
    if isinstance(value, dict):
        return {k: xml_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [xml_safe(v) for v in value]
    return value


def check_zip(z, name: str = "This file") -> None:
    sizes = [i.file_size for i in z.infolist()]
    if sum(sizes) > MAX_ZIP_TOTAL or any(s > MAX_ZIP_ENTRY for s in sizes):
        raise Unsupported(f"{name}: unpacks to more data than FormTxt opens.")


def sniff(data: bytes) -> tuple[str, str] | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png", "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "jpg", "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif", "image/gif"
    if data[:2] == b"BM":
        return "bmp", "image/bmp"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    head = data[:2048].lstrip().lower()
    if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in head):
        return "svg", "image/svg+xml"
    return None


def pixel_size(data: bytes) -> tuple[int, int] | None:
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as im:
            return im.size
    except Exception:
        return None


def to_png(data: bytes) -> bytes | None:
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as im:
            out = io.BytesIO()
            im.convert("RGBA").save(out, "PNG")
            return out.getvalue()
    except Exception:
        return None


class Builder:
    def __init__(self, title: str) -> None:
        self.doc = model.new_document(title)
        self.media: dict[str, bytes] = {}
        self.section = self.doc["sections"][0]
        self.doc["sections"] = [self.section]

    def media_add(self, data: bytes, source: str = "") -> str | None:
        kind = sniff(data)
        if kind is None:
            png = to_png(data)
            if png is None:
                return None
            data, kind = png, ("png", "image/png")
        name = f"{hashlib.sha256(data).hexdigest()[:20]}.{kind[0]}"
        if name not in self.media:
            self.media[name] = data
            meta: dict = {"type": kind[1], "bytes": len(data)}
            if source:
                meta["source"] = source[:200]
            size = pixel_size(data)
            if size:
                meta["width"], meta["height"] = size
            self.doc["media"][name] = meta
        return name

    def image(self, data: bytes, width: float | None, height: float | None, alt: str = "", source: str = "") -> dict | None:
        name = self.media_add(data, source)
        if name is None:
            return None
        meta = self.doc["media"][name]
        pw, ph = float(meta.get("width") or 0), float(meta.get("height") or 0)
        if not width and not height:
            width, height = (pw * 0.75, ph * 0.75) if pw and ph else (200.0, 150.0)
        elif not width:
            width = height * (pw / ph) if pw and ph else height
        elif not height:
            height = width * (ph / pw) if pw and ph else width
        run: dict = {"type": "image", "media": name, "width": round(float(width), 2), "height": round(float(height), 2)}
        if alt:
            run["alt"] = alt[:500]
        return run

    def body_width(self, section: dict | None = None) -> float:
        s = section or self.section
        return float(s["page"]["width"]) - float(s["margins"]["left"]) - float(s["margins"]["right"])

    def finish(self, body_by_tab: list[tuple[str, list[dict]]] | None = None) -> tuple[dict, dict[str, bytes]]:
        return self.doc, self.media


def para(style: str, content: list[dict], section: str, props: dict | None = None, lst: dict | None = None) -> dict:
    block: dict = {"type": "paragraph", "id": new_id("p_"), "style": style, "section": section, "content": content}
    if props:
        block["props"] = props
    if lst:
        block["list"] = lst
    return block


def text_run(text: str, marks: dict | None = None) -> dict:
    run: dict = {"type": "text", "text": text}
    if marks:
        run["marks"] = marks
    return run


def merge_runs(runs: list[dict]) -> list[dict]:
    out: list[dict] = []
    for r in runs:
        if r.get("type") == "text" and not r.get("text"):
            continue
        if out and r.get("type") == "text" and out[-1].get("type") == "text" and (out[-1].get("marks") or {}) == (r.get("marks") or {}):
            out[-1] = {**out[-1], "text": out[-1]["text"] + r["text"]}
        else:
            out.append(r)
    return out


def table_block(rows: list[list[dict]], widths: list[float], look: str = "grid") -> dict:
    cols = max([len(widths)] + [sum(int(c.get("colspan", 1)) for c in r) for r in rows])
    widths = list(widths) + [0.0] * (cols - len(widths))
    block: dict = {"type": "table", "id": new_id("t_"), "look": look, "columns": widths, "rows": [{"cells": r} for r in rows]}
    head = 0
    for r in rows:
        if r and all(c.get("header") for c in r):
            head += 1
        else:
            break
    if head:
        block["repeatHeader"] = True
    return block


def style_chain(styles: dict, sid: str | None) -> list[dict]:
    chain: list[dict] = []
    seen: set[str] = set()
    while sid and sid in styles and sid not in seen:
        seen.add(sid)
        chain.append(styles[sid])
        sid = styles[sid].get("basedOn")
    return chain


def resolved(styles: dict, sid: str | None) -> tuple[dict, dict]:
    run: dict = {}
    para_: dict = {}
    for st in reversed(style_chain(styles, sid or "Normal")):
        run.update({k: v for k, v in (st.get("run") or {}).items() if v is not None})
        para_.update({k: v for k, v in (st.get("para") or {}).items() if v is not None})
    return run, para_


def plain(runs: list[dict] | None) -> str:
    out = []
    for r in runs or []:
        t = r.get("type")
        if t == "text":
            out.append(str(r.get("text", "")))
        elif t == "tab":
            out.append("\t")
        elif t == "break":
            out.append("\n")
        elif t == "field":
            out.append(str(r.get("result", "")))
        elif t == "chip":
            out.append(str(r.get("text", "")))
        elif t == "noteRef":
            out.append(f"[{r.get('text', '')}]")
        elif t == "math":
            out.append(str(r.get("latex", "")))
        elif t == "shape":
            out.append(str(r.get("text", "")))
    return "".join(out)


def list_format(lst: dict, level: int) -> str:
    fmt = lst.get("format")
    return fmt if fmt in NUM_FORMATS else DEFAULT_CYCLE[level % 3]


def alpha(n: int, upper: bool) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(97 + r) + s
    return s.upper() if upper else s


def roman(n: int, upper: bool) -> str:
    vals = ((1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"))
    s = ""
    for v, r in vals:
        while n >= v:
            s += r
            n -= v
    return s.upper() if upper else s


def format_number(n: int, fmt: str) -> str:
    if fmt == "decimal-leading-zero":
        return f"{n:02d}"
    if fmt in ("lower-alpha", "upper-alpha"):
        return alpha(n, fmt.startswith("upper"))
    if fmt in ("lower-roman", "upper-roman"):
        return roman(n, fmt.startswith("upper"))
    return str(n)


class ListCounter:
    def __init__(self) -> None:
        self.counts: list[int] = []

    def reset(self) -> None:
        self.counts = []

    def label(self, lst: dict) -> str:
        level = max(0, int(lst.get("level", 0) or 0))
        kind = lst.get("kind")
        if kind == "check":
            return chr(0x2611) if lst.get("checked") else chr(0x2610)
        if kind == "bullet":
            return str(lst.get("bullet") or ("•", "◦", "▪")[level % 3])
        del self.counts[level + 1:]
        while len(self.counts) <= level:
            self.counts.append(0)
        if lst.get("start") is not None:
            self.counts[level] = int(lst["start"]) - 1
        self.counts[level] += 1
        suffix = lst.get("suffix", ".")
        return f"{lst.get('prefix', '')}{format_number(self.counts[level], list_format(lst, level))}{suffix if suffix is not None else '.'}"


def degrade(block: dict, section: str) -> list[dict]:
    kind = block.get("type")
    if kind == "chart":
        data = block.get("data") or {}
        cats = data.get("categories") or []
        series = data.get("series") or []
        rows = []
        head = [{"body": [para("Normal", [text_run(str(block.get("title") or "Chart"), {"bold": True})], section)], "header": True}]
        for s in series:
            head.append({"body": [para("Normal", [text_run(str(s.get("name", "")), {"bold": True})], section)], "header": True})
        rows.append(head)
        for i, c in enumerate(cats):
            row = [{"body": [para("Normal", [text_run(str(c))], section)]}]
            for s in series:
                vals = s.get("values") or []
                v = vals[i] if i < len(vals) else None
                row.append({"body": [para("Normal", [text_run("" if v is None else f"{v:g}" if isinstance(v, (int, float)) else str(v))], section)]})
            rows.append(row)
        return [table_block(rows, [0.0] * (len(series) + 1))]
    if kind == "mermaid":
        return [{"type": "code", "id": new_id("p_"), "text": str(block.get("code", ""))}]
    if kind == "diagram":
        out: list[dict] = []

        def walk(items: list, level: int) -> None:
            for it in items or []:
                out.append(para("Normal", [text_run(str(it.get("text", "")))], section, None, {"kind": "bullet", "level": min(level, 8)}))
                walk(it.get("children") or [], level + 1)
        walk(block.get("items") or [], 0)
        return out
    return []


def iter_blocks(doc: dict) -> Iterator[dict]:
    for tab in doc.get("tabs", []):
        yield from tab.get("body", [])


def doc_tabs(doc: dict) -> list[dict]:
    return doc.get("tabs") or []


def safe_name(title: str) -> str:
    return "".join(c for c in title if c.isalnum() or c in " -_").strip() or "document"


def section_map(doc: dict) -> dict[str, dict]:
    return {s["id"]: s for s in doc.get("sections", [])}


def hex_color(value: object, fallback: str = "") -> str:
    v = str(value or "")
    return v[1:].lower() if len(v) == 7 and v.startswith("#") else fallback


def int_color(h: str) -> str:
    return "#" + h.lower() if len(h) == 6 else ""


def title_of(name: str) -> str:
    stem = name.rsplit("/", 1)[-1]
    return (stem.rsplit(".", 1)[0] if "." in stem else stem).strip() or "Imported document"


def list_runs(blocks: list[dict]):
    i, n = 0, len(blocks)
    while i < n:
        b = blocks[i]
        if b.get("type") == "paragraph" and (b.get("list") or {}).get("kind") in ("bullet", "number"):
            run: list[dict] = []
            kinds: dict[int, str] = {}
            while i < n and blocks[i].get("type") == "paragraph" and (blocks[i].get("list") or {}).get("kind") in ("bullet", "number"):
                lst = blocks[i]["list"]
                lv = min(int(lst.get("level", 0) or 0), 8)
                if kinds.setdefault(lv, lst["kind"]) != lst["kind"] or (run and lv == 0 and lst["kind"] == "number" and lst.get("start") is not None):
                    break
                run.append(blocks[i])
                i += 1
            yield "list", run
        else:
            yield "block", b
            i += 1
