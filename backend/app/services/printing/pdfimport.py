import io
import re
from collections import Counter

import pdfplumber
import pypdfium2 as pdfium
from pdfplumber.utils import cluster_objects

from app.core.ids import new_id
from app.services import model

from .reader import (BULLET_RE, END_RE, MONO_RE, NUMBER_RE, SERIF_RE, PdfReaderState, font_info, hex_color, join_lines,
                     line_stats, merge_runs, rect_in, table_block)

MAX_PAGES = 400


def find_gutter(groups: list[list[dict]], page_width: float) -> tuple[float, float] | None:
    if len(groups) < 10:
        return None
    lo, hi = page_width * 0.3, page_width * 0.7
    step = 2.0
    bins = int((hi - lo) / step)
    covered = [0] * bins
    for g in groups:
        hit = [False] * bins
        for c in g:
            a = max(0, int((c["x0"] - lo) / step))
            b = min(bins - 1, int((c["x1"] - lo) / step))
            for k in range(a, b + 1):
                hit[k] = True
        for k in range(bins):
            if hit[k]:
                covered[k] += 1
    free = [covered[k] <= 0.12 * len(groups) for k in range(bins)]
    best, run = (0, 0), 0
    for k in range(bins + 1):
        if k < bins and free[k]:
            run += 1
        else:
            if run * step >= 12 and run > best[1] - best[0]:
                best = (k - run, k)
            run = 0
    if best[1] - best[0] < 6:
        return None
    g0, g1 = lo + best[0] * step, lo + best[1] * step
    both = sum(1 for g in groups if any(c["x1"] <= g0 + 1 for c in g) and any(c["x0"] >= g1 - 1 for c in g))
    return (g0, g1) if both >= 6 else None


def split_groups(groups: list[list[dict]], gutter: tuple[float, float] | None) -> list[list[dict]]:
    if not gutter:
        return groups
    out: list[list[dict]] = []
    for g in groups:
        left = [c for c in g if c["x1"] <= gutter[0] + 1]
        right = [c for c in g if c["x0"] >= gutter[1] - 1]
        if left and right and len(left) + len(right) == len(g):
            out.extend([left, right])
        else:
            out.append(g)
    return out


def build_lines(chars: list[dict], body_size: float, page_width: float) -> tuple[list[dict], tuple[float, float] | None]:
    lines = []
    mid = lambda c: round((c["top"] + c["bottom"]) / 2, 1)
    groups = []
    for g in cluster_objects(chars, mid, max(2.5, body_size * 0.6)):
        spread = max(mid(c) for c in g) - min(mid(c) for c in g)
        groups.extend(cluster_objects(g, mid, 2.5) if spread > body_size * 0.85 else [g])
    gutter = find_gutter(groups, page_width)
    for group in split_groups(groups, gutter):
        group = sorted(group, key=lambda c: c["x0"])
        big = max(float(c.get("size", 0)) for c in group)
        ref = [c for c in group if float(c.get("size", 0)) >= big * 0.95]
        ref_mid = sum((c["top"] + c["bottom"]) / 2 for c in ref) / max(1, len(ref))
        for c in group:
            if float(c.get("size", 0)) < big * 0.88 and c["text"].strip():
                shift = (c["top"] + c["bottom"]) / 2 - ref_mid
                c["_shift"] = "super" if shift < -0.5 else "sub" if shift > 1.5 else None
        flat: list[dict] = []
        prev = None
        for i, c in enumerate(group):
            if c["text"].startswith("(cid:"):
                c = dict(c)
                c["text"] = "•" if i == 0 else ""
            if prev is not None and c["x0"] - prev["x1"] > max(1.2, float(c.get("size", 10)) * 0.18) and not prev["text"].isspace() and not c["text"].isspace():
                flat.append({"text": " ", "fontname": prev.get("fontname", ""), "size": prev.get("size", 10), "non_stroking_color": prev.get("non_stroking_color"),
                             "_link": prev.get("_link") if prev.get("_link") == c.get("_link") else None})
            if c["text"]:
                flat.append(c)
                prev = c
        text = "".join(c["text"] for c in flat).strip()
        if text:
            lines.append({"text": text, "chars": flat, "x0": min(c["x0"] for c in group), "x1": max(c["x1"] for c in group),
                          "top": min(c["top"] for c in group), "bottom": max(c["bottom"] for c in group)})
    return lines, gutter


def page_items(state: PdfReaderState, page, pdf_page, body_size: float, links: list[dict]) -> tuple[list, float | None]:
    try:
        tables = [t for t in page.find_tables() if len(t.cells) >= 4]
    except (ValueError, KeyError, IndexError):
        tables = []
    boxes = [t.bbox for t in tables]
    chars = [c for c in page.chars if not any(rect_in((c["x0"], c["top"], c["x1"], c["bottom"]), b) for b in boxes)]
    for c in chars:
        mx, my = (c["x0"] + c["x1"]) / 2, (c["top"] + c["bottom"]) / 2
        for link in links:
            if link["x0"] - 1 <= mx <= link["x1"] + 1 and link["top"] - 1 <= my <= link["bottom"] + 1:
                c["_link"] = link["uri"]
                break
    built, gutter = build_lines(chars, body_size, float(page.width)) if chars else ([], None)
    items = [("line", ln["top"], ln["x0"], ln) for ln in built]
    for t in tables:
        block = table_block(state, page, t, body_size)
        if block:
            items.append(("block", t.bbox[1], t.bbox[0], block))
    pw, ph = pdf_page.get_size()
    for im in page.images:
        w, h = im["x1"] - im["x0"], im["bottom"] - im["top"]
        if w < 12 or h < 12 or any(rect_in((im["x0"], im["top"], im["x1"], im["bottom"]), b) for b in boxes):
            continue
        try:
            bitmap = pdf_page.render(scale=min(3.0, max(1.0, 900 / max(w, 1))), crop=(max(0, im["x0"]), max(0, ph - im["bottom"]), max(0, pw - im["x1"]), max(0, im["top"])))
            name = state.add_picture(bitmap.to_pil().convert("RGB"))
        except (ValueError, RuntimeError, OSError):
            state.note("Some pictures could not be extracted from the PDF.")
            continue
        state.counts["pictures"] += 1
        centred = abs((im["x0"] + im["x1"]) / 2 - page.width / 2) < page.width * 0.08
        block = {"type": "paragraph", "id": new_id("p_"), "style": "Normal", "section": "", "content": [{"type": "image", "media": name, "width": round(w, 1), "height": round(h, 1), "alt": ""}]}
        if centred:
            block["props"] = {"align": "center"}
        items.append(("block", im["top"], im["x0"], block))
    return items, (sum(gutter) / 2 if gutter else None)


def order_items(items: list, gutter: float | None) -> list:
    plain = sorted(items, key=lambda i: (round(i[1], 0), i[2]))
    if gutter is None:
        return plain
    mid = gutter
    span_ids = {id(i) for i in items if i[0] == "line" and i[3]["x0"] < mid - 6 and i[3]["x1"] > mid + 6}
    ordered: list = []
    buf_l: list = []
    buf_r: list = []
    for item in plain:
        if item[0] != "line" or id(item) in span_ids:
            ordered.extend(sorted(buf_l, key=lambda i: i[1]) + sorted(buf_r, key=lambda i: i[1]))
            buf_l, buf_r = [], []
            ordered.append(item)
        elif item[2] < mid:
            buf_l.append(item)
        else:
            buf_r.append(item)
    ordered.extend(sorted(buf_l, key=lambda i: i[1]) + sorted(buf_r, key=lambda i: i[1]))
    return ordered


class Importer:
    def __init__(self, state: PdfReaderState, body_size: float, levels: dict[float, int]) -> None:
        self.state = state
        self.body_size = body_size
        self.levels = levels
        self.body: list[dict] = []
        self.buffer: list[dict] = []
        self.last: dict | None = None
        self.last_page = -1
        self.jump = False
        self.last_number: tuple[int, int] | None = None
        self.section = ""
        self.left = 0.0
        self.right = 0.0
        self.width = 0.0
        self.page = 0

    def add_block(self, block: dict) -> None:
        self.flush()
        if block["type"] == "paragraph":
            block["section"] = self.section
        else:
            for row in block.get("rows") or []:
                for cell in row["cells"]:
                    for p in cell["body"]:
                        p["section"] = self.section
        self.body.append(block)
        self.last = None

    def classify(self) -> tuple[str, bool, dict | None, list[dict]]:
        first = self.buffer[0]
        size, _ = line_stats(first)
        all_bold = all(line_stats(b)[1] for b in self.buffer)
        text = " ".join(b["text"] for b in self.buffer)
        level = self.levels.get(size)
        if all(MONO_RE.search(font_info(c.get("fontname", ""))[0]) for b in self.buffer for c in b["chars"] if c["text"].strip()):
            return "Code", False, None, self.buffer
        if level and len(text) < 160 and len(self.buffer) <= 3:
            return f"Heading{level}", True, None, self.buffer
        if all_bold and len(text) < 90 and not END_RE.search(text) and len(self.buffer) == 1 and size >= self.body_size - 0.5:
            return "Heading4", True, None, self.buffer
        bm = BULLET_RE.match(first["text"])
        nm = None if bm else NUMBER_RE.match(first["text"])
        if not (bm or nm):
            return "Normal", False, None, self.buffer
        marker = bm.group(1) if bm else nm.group(1)
        kept, removed, skipping = [], 0, True
        for c in first["chars"]:
            if skipping and removed < len(marker):
                removed += len(c["text"])
                continue
            if skipping and c["text"].isspace():
                continue
            skipping = False
            kept.append(c)
        head = dict(first)
        head["chars"] = kept
        head["text"] = bm.group(2) if bm else nm.group(2)
        level0 = min(3, max(0, int(round((first["x0"] - self.left) / 18))))
        if bm:
            info: dict = {"kind": "bullet", "level": level0}
        else:
            token = marker.strip("().")
            fmt = "decimal" if token.isdigit() else "lower-roman" if re.fullmatch(r"[ivx]+", token) else "lower-alpha" if token.islower() else "upper-alpha"
            info = {"kind": "number", "level": level0, "format": fmt}
            prior = self.last_number
            if token.isdigit():
                if not (prior and prior[0] == level0 and prior[1] + 1 == int(token) and self.body and self.body[-1].get("list")):
                    info["start"] = int(token)
                self.last_number = (level0, int(token))
            if marker.startswith("("):
                info.update(prefix="(", suffix=")")
            elif marker.endswith(")"):
                info["suffix"] = ")"
        self.state.counts["lists"] += 1
        return "Normal", False, info, [head] + self.buffer[1:]

    def flush(self) -> None:
        if not self.buffer:
            return
        style, plain, info, lines = self.classify()
        first = self.buffer[0]
        if style == "Code":
            base = min(ln["x0"] for ln in lines)
            rows = [" " * int(round((ln["x0"] - base) / 5.4)) + ln["text"] for ln in lines]
            self.buffer = []
            self.body.append({"type": "code", "id": new_id("p_"), "text": "\n".join(rows)})
            self.last = None
            return
        runs = join_lines(lines, self.body_size, plain)
        self.buffer = []
        if not runs:
            return
        para = {"type": "paragraph", "id": new_id("p_"), "style": style, "section": self.section, "content": runs}
        props: dict = {}
        if style == "Normal" and not info:
            centre = abs((first["x0"] + first["x1"]) / 2 - self.width / 2) < self.width * 0.06
            if centre and first["x0"] - self.left > 20 and self.right - first["x1"] > 20 and len(lines) <= 3:
                props["align"] = "center"
            elif self.right - first["x1"] < 6 and first["x0"] - self.left > 40 and len(lines) <= 3:
                props["align"] = "right"
            elif first["x0"] - self.left > 30:
                props["indent"] = round(first["x0"] - self.left)
        if props:
            para["props"] = props
        if info:
            para["list"] = info
        last = self.last
        carried = self.jump or self.last_page == self.page - 1
        self.jump = False
        if last is not None and carried and style == "Normal" and not info and not props and last["content"]:
            tail = last["content"][-1]["text"]
            if tail and not END_RE.search(tail) and runs[0]["text"][:1].islower():
                if tail.endswith("-") and len(tail) > 1 and tail[-2].isalpha():
                    last["content"][-1]["text"] = tail[:-1]
                    last["content"] = merge_runs(last["content"] + runs)
                else:
                    last["content"] = merge_runs(last["content"] + [{"type": "text", "text": " "}] + runs)
                self.last_page = self.page
                return
        self.body.append(para)
        self.state.counts["headings" if style != "Normal" else "paragraphs"] += 1
        self.last = para if style == "Normal" and not info and not props else None
        self.last_page = self.page

    def feed(self, ln: dict, prev: dict | None) -> None:
        size, bold = line_stats(ln)
        if prev is not None:
            psize, pbold = line_stats(prev)
            gap = ln["top"] - prev["bottom"]
            lead = max(psize, size, 1)
            shift = ln["x0"] - prev["x0"]
            wide = self.right - self.left
            if ln["top"] < prev["top"] - 2:
                self.flush()
                self.jump = True
            elif gap > 0.55 * lead or abs(size - psize) > 0.9 or (bold != pbold and (self.levels.get(size) or self.levels.get(psize))):
                self.flush()
            elif BULLET_RE.match(ln["text"]) or (NUMBER_RE.match(ln["text"]) and shift <= 8):
                self.flush()
            elif shift > 8 and prev["x1"] < self.right - 40:
                self.flush()
            elif prev["x1"] < self.right - 0.18 * wide and END_RE.search(prev["text"]):
                self.flush()
        self.buffer.append(ln)


def pdf_to_document(data: bytes, filename: str = "document.pdf") -> tuple[dict, dict[str, bytes], dict]:
    state = PdfReaderState()
    try:
        pdf = pdfplumber.open(io.BytesIO(data))
        pages = list(pdf.pages[:MAX_PAGES])
        total = len(pdf.pages)
    except Exception as exc:
        text = str(exc).lower()
        if "password" in text or "encrypt" in text:
            raise ValueError("This PDF is password protected. Remove the password and try again.") from exc
        raise ValueError("This file is not a PDF FormTxt can read.") from exc
    with pdf:
        if not pages:
            raise ValueError("This PDF has no pages.")
        if total > MAX_PAGES:
            state.note(f"Only the first {MAX_PAGES} of {total} pages were read.")
        render = pdfium.PdfDocument(data)
        size_counts: Counter = Counter()
        fam_counts: Counter = Counter()
        for page in pages:
            for c in page.chars[:6000]:
                if c["text"].strip():
                    size_counts[round(float(c.get("size", 0)) * 2) / 2] += 1
                    fam_counts[font_info(c.get("fontname", ""))[0]] += 1
        body_size = size_counts.most_common(1)[0][0] if size_counts else 11.0
        main_family = fam_counts.most_common(1)[0][0] if fam_counts else ""
        font = "Source Serif 4" if SERIF_RE.search(main_family) else "Inter"
        if main_family and not MONO_RE.search(main_family):
            state.note(f"The PDF's main font ({main_family}) is shown in {font}, because fonts inside a PDF cannot be reused.")

        per_page: list[tuple[int, list, float, float, float | None]] = []
        heading_sizes: Counter = Counter()
        furniture: dict[tuple[str, bool, tuple[int, int]], list] = {}
        for pi, page in enumerate(pages):
            try:
                links = [lk for lk in page.hyperlinks if lk.get("uri")]
            except (ValueError, KeyError):
                links = []
            items, gutter = page_items(state, page, render[pi], body_size, links)
            per_page.append((pi, items, float(page.width), float(page.height), gutter))
            for kind, _top, _x, ln in items:
                if kind != "line":
                    continue
                if ln["bottom"] < 0.08 * page.height or ln["top"] > 0.92 * page.height:
                    furniture.setdefault((re.sub(r"\d+", "#", ln["text"]), ln["top"] > 0.5 * page.height, (round(page.width), round(page.height))), []).append((pi, ln))
                else:
                    size, _ = line_stats(ln)
                    if size >= body_size * 1.15 and len(ln["text"]) < 140:
                        heading_sizes[size] += len(ln["text"])
        size_pages = Counter((round(p.width), round(p.height)) for p in pages)
        repeated = {k: v for k, v in furniture.items() if len({p for p, _ in v}) >= max(2, int(0.4 * size_pages[k[2]]))}
        skip = {id(ln) for v in repeated.values() for _, ln in v}
        levels = {s: i + 1 for i, s in enumerate(sorted(heading_sizes, reverse=True)[:4])}
        header_specs: dict[tuple[int, int], dict] = {}
        footer_specs: dict[tuple[int, int], dict] = {}
        for (_key, is_footer, size_key), occurrences in repeated.items():
            pi, ln = occurrences[0]
            text = ln["text"]
            if str(pi + 1) in re.findall(r"\d+", text):
                done = []

                def swap(m, pi=pi, done=done):
                    if not done and m.group(0) == str(pi + 1):
                        done.append(1)
                        return "{PAGE}"
                    if done and m.group(0) == str(len(pages)) and len(pages) > 1:
                        return "{NUMPAGES}"
                    return m.group(0)

                text = re.sub(r"\d+", swap, text)
            width = per_page[pi][2]
            centre = (ln["x0"] + ln["x1"]) / 2
            align = "center" if abs(centre - width / 2) < width * 0.12 else "right" if centre > width / 2 else "left"
            target = (footer_specs if is_footer else header_specs).setdefault(size_key, {})
            if "text" not in target:
                target.update({"text": text, "align": align})

        meta = pdf.metadata or {}
        title = str(meta.get("Title") or "").strip() or re.sub(r"\.pdf$", "", filename, flags=re.I) or "Document"
        doc = model.new_document(title[:200], str(meta.get("Author") or "")[:200])
        doc["meta"]["subject"] = str(meta.get("Subject") or "")[:500]
        doc["meta"]["keywords"] = [k.strip() for k in re.split(r"[;,]", str(meta.get("Keywords") or "")) if k.strip()][:20]
        doc["styles"]["Normal"]["run"].update({"font": font, "size": float(max(8.0, min(16.0, body_size)))})
        for size, level in levels.items():
            doc["styles"][f"Heading{level}"]["run"].update({"size": size, "bold": True})

        imp = Importer(state, body_size, levels)
        sections: list[dict] = []
        previous = None
        by_size: dict[tuple[int, int], list] = {}
        for _pi, items, pw, ph, _g in per_page:
            by_size.setdefault((round(pw), round(ph)), []).extend(it[3] for it in items if it[0] == "line" and id(it[3]) not in skip)
        for pi, items, pw, ph, gutter_x in per_page:
            key = (round(pw), round(ph))
            lines = [it[3] for it in items if it[0] == "line" and id(it[3]) not in skip]
            if key != previous:
                lines_all = by_size[key]
                sec = model.default_section("letter")
                sec["page"] = {"size": "custom", "width": round(pw, 2), "height": round(ph, 2), "orientation": "landscape" if pw > ph else "portrait"}
                for name, (w, h) in model.PAGE_SIZES.items():
                    if (abs(w - pw) < 2 and abs(h - ph) < 2) or (abs(h - pw) < 2 and abs(w - ph) < 2):
                        sec["page"]["size"] = name
                clamp = lambda v: float(max(18.0, min(120.0, round(v / 2) * 2)))
                sec["margins"].update({"left": clamp(min([ln["x0"] for ln in lines_all] or [72])), "right": clamp(min([pw - ln["x1"] for ln in lines_all] or [72])),
                                       "top": clamp(min([ln["top"] for ln in lines_all] or [72])), "bottom": clamp(min([ph - ln["bottom"] for ln in lines_all] or [72]))})
                if header_specs.get(key):
                    sec["headers"] = {"default": dict(header_specs[key])}
                if footer_specs.get(key):
                    sec["footers"] = {"default": dict(footer_specs[key])}
                if sections:
                    imp.add_block({"type": "sectionBreak", "id": new_id("p_"), "next": sec["id"]})
                sections.append(sec)
                imp.section = sec["id"]
                previous = key
            imp.flush()
            imp.page = pi
            imp.width = pw
            imp.left = min([ln["x0"] for ln in lines] or [0.0])
            imp.right = max([ln["x1"] for ln in lines] or [pw])
            prev = None
            for kind, _top, _x, payload in order_items(items, gutter_x):
                if kind == "line":
                    if id(payload) in skip:
                        continue
                    imp.feed(payload, prev)
                    prev = payload
                else:
                    imp.add_block(payload)
                    prev = None
            imp.flush()

    body = imp.body
    if not body:
        body = [{"type": "paragraph", "id": new_id("p_"), "style": "Normal", "section": sections[0]["id"], "content": []}]
        state.note("No text was found in this PDF. Scanned pages are not read by OCR in this version.")
    doc["sections"] = sections
    doc["tabs"][0]["body"] = body
    doc["media"] = state.media_meta
    doc["settings"]["importedFrom"] = "pdf"
    state.note("Page breaks, text columns and floating objects are not kept; the text is reflowed in the editor.")
    info = {"pages": len(pages), "notes": state.notes, **state.counts}
    return doc, state.media, info
