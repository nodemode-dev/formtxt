#!/usr/bin/env python3
"""Build the three demo documents Home > Demos opens, as .ftxt packages in frontend/public/demos.

  backend/venv/bin/python -B scripts/demo-docs.py                                   the three .ftxt files
  backend/venv/bin/python -B scripts/demo-docs.py --covers http://localhost:5210    and the Home card pictures

With --covers, a running window (./formtxt) opens each demo and headless Chrome photographs the top of its first page:
the cover is the app's own drawing of the document, saved as <id>.webp at 640 by 360. The copies it imported are
deleted again. Every name, company, figure and source is invented; pictures are drawn here with Pillow. The documents are made with
the engine's own model (app.services.model) and packed with app.services.package, so they follow docs/FORMAT.md.
"""

from __future__ import annotations

import hashlib
import io
import math
import json
import random
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.dont_write_bytecode = True

from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

from app.services import model, package  # noqa: E402

OUT = ROOT / "frontend" / "public" / "demos"
WHEN = 1793000000.0


class Doc:
    def __init__(self, key: str, title: str, author: str, size: str = "letter") -> None:
        self.key = key
        self.n = 0
        self.doc = model.new_document(title, author, size)
        self.doc["id"] = self.id("d_")
        self.doc["meta"].update(created=WHEN, modified=WHEN)
        self.sec = self.doc["sections"][0]
        self.sec["id"] = self.id("sec_")
        self.tab = self.doc["tabs"][0]
        self.tab["id"] = self.id("tab_")
        self.body: list = []
        self.tab["body"] = self.body
        self.media: dict[str, bytes] = {}

    def id(self, prefix: str) -> str:
        self.n += 1
        return prefix + hashlib.sha1(f"{self.key}:{self.n}".encode()).hexdigest()[:12]

    def style(self, sid: str, name: str, run: dict, para: dict, based: str = "Normal") -> None:
        self.doc["styles"][sid] = {"type": "paragraph", "name": name, "basedOn": based, "next": "Normal", "run": run, "para": para}

    def restyle(self, sid: str, run: dict | None = None, para: dict | None = None) -> None:
        self.doc["styles"][sid].setdefault("run", {}).update(run or {})
        self.doc["styles"][sid].setdefault("para", {}).update(para or {})

    def p(self, style: str = "Normal", *runs, props: dict | None = None, lst: dict | None = None, into: list | None = None) -> dict:
        block = {"type": "paragraph", "id": self.id("p_"), "style": style, "section": self.sec["id"], "content": [T(r) if isinstance(r, str) else r for r in runs]}
        if props:
            block["props"] = props
        if lst:
            block["list"] = lst
        (self.body if into is None else into).append(block)
        return block

    def cell(self, text, header: bool = False, **extra) -> dict:
        runs = [T(text, bold=header)] if isinstance(text, str) else text
        out = {"body": [{"type": "paragraph", "id": self.id("p_"), "style": "Normal", "section": self.sec["id"], "content": runs, "props": {"spaceAfter": 0.0}}]}
        if header:
            out["header"] = True
        out.update(extra)
        return out

    def table(self, rows: list[list], widths: list[float], look: str = "banded", **extra) -> dict:
        block = {"type": "table", "id": self.id("t_"), "columns": widths, "look": look, "repeatHeader": True,
                 "rows": [{"cells": [c if isinstance(c, dict) else self.cell(c, header=i == 0) for c in row]} for i, row in enumerate(rows)]}
        block.update(extra)
        self.body.append(block)
        return block

    def chart(self, kind: str, title: str, cats: list[str], series: list[dict], width: float = 468, height: float = 230, **options) -> dict:
        block = {"type": "chart", "id": self.id("c_"), "kind": kind, "title": title, "width": width, "height": height,
                 "data": {"categories": cats, "series": series}, "options": {"legend": len(series) > 1, "labels": True, **options}}
        self.body.append(block)
        return block

    def diagram(self, layout: str, items: list, width: float = 468, height: float = 170, **extra) -> dict:
        block = {"type": "diagram", "id": self.id("g_"), "layout": layout, "items": [{"text": i} if isinstance(i, str) else i for i in items],
                 "width": width, "height": height, "style": "flat", "colors": "colorful"}
        block.update(extra)
        self.body.append(block)
        return block

    def picture(self, img: Image.Image, width: float, alt: str, **extra) -> dict:
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=84, optimize=True, progressive=True)
        data = buf.getvalue()
        name = hashlib.sha256(data).hexdigest()[:20] + ".jpg"
        self.media[name] = data
        self.doc["media"][name] = {"type": "image/jpeg", "bytes": len(data), "width": img.width, "height": img.height}
        run = {"type": "image", "media": name, "width": width, "height": round(width * img.height / img.width, 1), "alt": alt}
        run.update(extra)
        return run

    def section(self, **changes) -> dict:
        sec = model.default_section(self.sec["page"]["size"])
        sec["id"] = self.id("sec_")
        sec["margins"] = dict(self.sec["margins"])
        sec.update(changes)
        self.doc["sections"].append(sec)
        self.body.append({"type": "sectionBreak", "id": self.id("p_"), "next": sec["id"]})
        self.sec = sec
        return sec

    def save(self, name: str) -> Path:
        OUT.mkdir(parents=True, exist_ok=True)
        path = OUT / name
        doc, media = package.prune(self.doc, self.media)
        path.write_bytes(package.pack(doc, media))
        return path


def T(text: str, **marks) -> dict:
    run = {"type": "text", "text": text}
    marks = {k: v for k, v in marks.items() if v not in (None, False)}
    if marks:
        run["marks"] = marks
    return run


def caption_style(d: Doc) -> None:
    d.style("Caption", "Caption", {"size": 9.0, "italic": True, "color": "#44546a"}, {"spaceBefore": 4.0, "spaceAfter": 10.0})


def change(d: Doc, kind: str, who: str, minutes: int) -> dict:
    return {kind: {"id": d.id("r_"), "author": who, "time": WHEN + minutes * 60}}


def comment(d: Doc, who: str, minutes: int, text: str, quote: str, replies: list[tuple[str, int, str]] = (), **extra) -> str:
    cid = d.id("c_")
    d.doc["comments"][cid] = {"id": cid, "author": who, "time": WHEN + minutes * 60, "text": text, "quote": quote, "resolved": False,
                              "assignee": extra.get("assignee", ""), "mentions": extra.get("mentions", []), "reactions": extra.get("reactions", {}),
                              "replies": [{"id": d.id("r_"), "author": a, "time": WHEN + m * 60, "text": t, "reactions": {}} for a, m, t in replies]}
    return cid


MAYA, TOMAS, IRIS = "Maya Okafor", "Tomas Lindqvist", "Iris Fenwick"


def review() -> Doc:
    d = Doc("review", "Kestrel Harbour Trust: Annual Report 2026", IRIS)
    accent, ink = "#0f5e78", "#1c2530"
    d.restyle("Normal", {"font": "Source Serif 4", "color": ink, "size": 10.5}, {"lineSpacing": 1.2, "spaceAfter": 7.0})
    d.restyle("Title", {"font": "Inter", "size": 30.0, "bold": True, "color": accent}, {"spaceAfter": 4.0})
    d.restyle("Subtitle", {"font": "Inter", "size": 13.0, "color": "#5b6672"}, {"spaceAfter": 18.0})
    for lv in (1, 2, 3):
        d.restyle(f"Heading{lv}", {"font": "Inter", "color": accent if lv < 3 else ink})
    caption_style(d)
    d.doc["settings"]["trackChanges"] = True
    d.sec["headers"] = {"default": {"text": "Kestrel Harbour Trust · Annual Report 2026", "align": "right"}}
    d.sec["footers"] = {"default": {"text": "Page {PAGE} of {NUMPAGES}", "align": "center"}}
    d.sec["titlePage"] = True

    d.p("Title", "Annual Report 2026")
    d.p("Subtitle", "Kestrel Harbour Trust · prepared for the board meeting of 4 December")
    d.p("Normal", T("Draft for review. ", bold=True), "Suggested edits are on: every change below shows who proposed it, and the board secretary will accept or reject them before the report is printed. Open the review pane to step through them.")

    d.p("Heading1", "A year on the water")
    c1 = comment(d, TOMAS, 30, "Can we say how many visitors this is in total? The board will ask.", "welcomed more visitors than in any year",
                 [(MAYA, 52, "Added the figure in the next sentence: 48,200 across the year."), (IRIS, 75, "Thanks, that works. Leave the thread open until the count is audited.")],
                 assignee=MAYA, mentions=[MAYA])
    d.p("Normal", "The Trust looks after the old quay, the tide mill and four miles of salt marsh on the estuary's north shore. In 2026 the harbour ",
        T("welcomed more visitors than in any year", comment=[c1]), " since the Trust took it over, and ",
        T("48,200 people ", **change(d, "ins", MAYA, 50)), T("came through the gates between March and October. ", **change(d, "ins", MAYA, 50)),
        "Most came for the mill days and the low-tide walks; school groups doubled.")
    d.p("Normal", "Income held steady while costs rose. The new shop at the mill paid for itself in its first season, and the ",
        T("very generous ", **change(d, "del", TOMAS, 64)), "grant from the county heritage fund covered the quay wall repairs in full.")

    d.p("Heading2", "Visitors by month")
    d.chart("bar", "Visitors by month, 2025 and 2026", ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
            [{"name": "2025", "values": [2100, 3400, 4800, 5600, 7100, 7900, 4300, 2600], "color": "gray"},
             {"name": "2026", "values": [2600, 3900, 5600, 6800, 8400, 9300, 6900, 4700], "color": "blue"}], height=220)
    d.p("Caption", {"type": "sequence", "label": "Figure", "n": "1", "text": "Figure 1"}, ": Visitors counted at the quay and mill gates.")

    d.p("Heading1", "Money")
    c2 = comment(d, IRIS, 90, "Please check the shop line against the audited accounts before this goes out.", "Mill shop",
                 reactions={"agree": [TOMAS]})
    fmt = {"fmt": {"id": d.id("r_"), "author": TOMAS, "time": WHEN + 95 * 60, "ops": [{"op": "add", "mark": "bold", "attrs": True}]}}
    d.p("Normal", "The table sets this year's income and spending against last year's. ", T("All figures are in thousands.", **fmt))
    t = d.table([["", "2025", "2026", "Change"], ["Gate and membership", "412", "468", "+14%"], [d.cell([T("Mill shop", comment=[c2])]), "0", "96", "new"],
                 ["Grants", "310", "355", "+15%"], ["Events and hire", "88", "104", "+18%"], ["Spending", "781", "902", "+15%"], ["Surplus", "29", "121", ""]],
                [180, 90, 90, 108], look="banded", align="center")
    for row in t["rows"][1:]:
        for c in row["cells"][1:]:
            c["body"][0]["props"]["align"] = "right"
    d.p("Caption", {"type": "sequence", "label": "Table", "n": "1", "text": "Table 1"}, ": Income and spending, in thousands.")

    d.p("Heading1", "The quay wall")
    d.p("Normal", "The south face of the quay wall had lost its pointing along forty metres and two courses had slipped. The repair ran from January to April, between the spring tides, and used lime mortar matched to the original.",
        T(" The contractor finished a week early.", **change(d, "ins", TOMAS, 70)))
    d.p("Normal", "Work done this year:")
    for item in ("Forty metres of wall repointed in lime", "Two slipped courses reset on new footings", "The tide gauge moved to the end of the quay", "A handrail along the landing steps"):
        d.p("Normal", item, lst={"kind": "bullet", "level": 0})

    d.p("Heading1", "Next year")
    c3 = comment(d, MAYA, 120, "Should the marsh boardwalk come first? It is the top request in the visitor survey.", "three things")
    d.p("Normal", "The board is asked to agree ", T("three things", comment=[c3]), " for 2027: a second mill day each month in summer, a part-time learning officer for school visits, and a survey of the marsh boardwalk before any repair is planned.")
    d.diagram("process-chevron", ["Agree the plan", "Fund the post", "Survey the boardwalk", "Report back in June"], height=120)
    d.p("Normal", "Iris Fenwick, Board Secretary", props={"spaceBefore": 18.0})
    return d


SOURCES = [
    {"id": "s_hale2019", "type": "article", "authors": [{"family": "Hale", "given": "Rosa"}, {"family": "Mbeki", "given": "Daniel"}], "title": "Settling velocities of mixed mud and sand under slack water",
     "year": "2019", "container": "Estuary Letters", "volume": "14", "issue": "2", "pages": "88-104"},
    {"id": "s_orr2022", "type": "book", "authors": [{"family": "Orr", "given": "Catriona"}], "title": "Tidal flats: form and process", "year": "2022", "publisher": "Northshore Press", "edition": "2"},
    {"id": "s_saltmarsh2024", "type": "report", "authors": [{"family": "Saltmarsh Field Station", "given": ""}], "title": "Sediment traps on the north shore: three seasons of records",
     "year": "2024", "number": "SFS-24-03", "publisher": "Saltmarsh Field Station"},
    {"id": "s_quint2021", "type": "article", "authors": [{"family": "Quint", "given": "Ada"}, {"family": "Larsen", "given": "Per"}, {"family": "Obi", "given": "Ngozi"}],
     "title": "Floc size and turbulence in shallow tidal channels", "year": "2021", "container": "Coastal Process Notes", "volume": "7", "issue": "1", "pages": "1-19"},
]


def initials(given: str) -> str:
    return " ".join("-".join(f"{x[0].upper()}." for x in w.split("-") if x) for w in given.split())


def end(s: str) -> str:
    return s if not s or s[-1] in ".?!" else s + "."


def apa(s: dict) -> tuple[str, list[str]]:
    names = [f"{a['family']}, {initials(a['given'])}" if a["given"] else a["family"] for a in s["authors"]]
    who = names[0] if len(names) == 1 else f"{names[0]}, & {names[1]}" if len(names) == 2 else f"{', '.join(names[:-1])}, & {names[-1]}"
    head = f"{end(who)} ({s['year']}). "
    if s["type"] == "article":
        return f"{head}{end(s['title'])} {s['container']}, {s['volume']}({s['issue']}), {s['pages']}.", [s["container"], s["volume"]]
    if s["type"] == "report":
        return f"{head}{s['title']} (Report No. {s['number']}). {end(s['publisher'])}", [s["title"]]
    nth = {"2": "2nd"}.get(s.get("edition", ""), "")
    return f"{head}{s['title']}{f' ({nth} ed.)' if nth else ''}. {end(s['publisher'])}", [s["title"]]


def cite(ids: list[tuple[str, str]]) -> dict:
    by = {s["id"]: s for s in SOURCES}
    parts = []
    for sid, loc in ids:
        a = by[sid]["authors"]
        lead = f"{a[0]['family']} et al." if len(a) >= 3 else f"{a[0]['family']} & {a[1]['family']}" if len(a) == 2 else a[0]["family"]
        parts.append(f"{lead}, {by[sid]['year']}{f', p. {loc}' if loc else ''}")
    return {"type": "citation", "items": [{"id": i, **({"locator": loc} if loc else {})} for i, loc in ids], "text": f"({'; '.join(parts)})"}


def paper() -> Doc:
    d = Doc("paper", "How fast mud settles on the north shore flats", "Rosa Hale")
    ink = "#1d1d1f"
    d.restyle("Normal", {"font": "Source Serif 4", "color": ink, "size": 11.0}, {"lineSpacing": 1.3, "spaceAfter": 6.0, "align": "justify"})
    d.restyle("Title", {"font": "Libre Baskerville", "size": 22.0, "color": ink}, {"align": "center", "spaceAfter": 8.0})
    d.restyle("Subtitle", {"font": "Source Serif 4", "size": 12.0, "color": "#4a4a4f"}, {"align": "center", "spaceAfter": 4.0})
    for lv in (1, 2):
        d.restyle(f"Heading{lv}", {"font": "Libre Baskerville", "color": "#7a2e2e" if lv == 1 else ink, "size": 15.0 if lv == 1 else 12.0})
    caption_style(d)
    d.doc["sources"] = SOURCES
    d.doc["settings"]["citationStyle"] = "apa"
    d.sec["titlePage"] = True
    d.sec["headers"] = {"default": {"text": "Hale and Mbeki · Settling on the north shore flats", "align": "right"}}
    d.sec["footers"] = {"default": {"text": "{PAGE}", "align": "center"}}

    notes: list[tuple[str, str]] = []

    def note(text: str) -> dict:
        nid = d.id("n_")
        notes.append((nid, text))
        n = str(len(notes))
        return {"type": "noteRef", "id": nid, "kind": "footnote", "n": n, "note": text, "text": n}

    d.p("Title", "How fast mud settles on the north shore flats", props={"spaceBefore": 72.0})
    d.p("Subtitle", "Rosa Hale and Daniel Mbeki")
    d.p("Subtitle", "Saltmarsh Field Station, working paper 26-07")
    d.p("Normal", T("Abstract. ", bold=True), "We measured how quickly suspended mud settles over the intertidal flats at slack high water on twelve spring tides. Settling velocity rose with concentration up to about 1.2 grams per litre and fell above it, as flocs began to hinder each other. A two-term fit describes all twelve tides within 15 percent.",
        props={"spaceBefore": 36.0, "indent": 36.0, "indentRight": 36.0})
    d.body.append({"type": "pageBreak", "id": d.id("p_")})

    heads: list[tuple[dict, int]] = []

    def H(text: str, lv: int = 1) -> dict:
        b = d.p(f"Heading{lv}", text)
        heads.append((b, lv))
        return b

    toc = {"type": "toc", "id": d.id("r_"), "title": "Contents", "entries": [], "opts": {"from": 1, "to": 2, "pages": True, "links": True}}
    d.body.append(toc)

    H("1. Introduction")
    d.p("Normal", "Mud that settles at slack water builds the flats; mud that stays in suspension leaves on the ebb. How fast it settles therefore decides whether a flat grows or wastes ",
        cite([("s_orr2022", "41")]), ". Laboratory work suggests that settling velocity first rises with concentration, as particles join into flocs, and then falls as the flocs crowd each other ",
        cite([("s_hale2019", ""), ("s_quint2021", "")]), ".", note("Field values are rare because slack water lasts only twenty to forty minutes on these flats."))
    d.p("Normal", "This paper asks whether the same pattern holds in the field on the north shore, using the sediment traps the Field Station has run since 2021 ",
        cite([("s_saltmarsh2024", "")]), ".")

    H("2. Method")
    H("2.1 Site and tides", 2)
    d.p("Normal", "The traps stand in a line of six across the flat, 40 metres apart, from the marsh edge to the low-water channel. We sampled on twelve spring tides between April and September 2026.",
        note("Neap tides were left out: at neaps the outer traps are not covered long enough to fill."))
    H("2.2 Settling velocity", 2)
    d.p("Normal", "Each trap collects a mass ", {"type": "math", "latex": "M"}, " over a time ", {"type": "math", "latex": "t"}, " from water of concentration ",
        {"type": "math", "latex": "C"}, ". Over a trap mouth of area ", {"type": "math", "latex": "A"}, " the mean settling velocity is")
    eq1 = d.p("Normal", {"type": "math", "latex": "w_s = \\frac{M}{C\\,A\\,t}", "display": True}, props={"align": "center"})
    d.p("Caption", {"type": "sequence", "label": "Equation", "n": "1", "text": "Equation 1"}, ": settling velocity from trap mass.", props={"align": "center"})
    d.p("Normal", "We fit the velocities with a rising term and a hindering term, after the form used in the laboratory ", cite([("s_hale2019", "95")]), ":")
    d.p("Normal", {"type": "math", "latex": "w_s(C) = a\\,C^{m}\\left(1 - \\frac{C}{C_h}\\right)^{n}", "display": True}, props={"align": "center"})
    d.p("Caption", {"type": "sequence", "label": "Equation", "n": "2", "text": "Equation 2"}, ": the two-term fit, with hindering above ", {"type": "math", "latex": "C_h"}, ".", props={"align": "center"})

    H("3. Results")
    d.chart("line", "Settling velocity against concentration", ["0.2", "0.4", "0.6", "0.8", "1.0", "1.2", "1.4", "1.6", "1.8", "2.0"],
                      [{"name": "Measured (mm/s)", "values": [0.21, 0.38, 0.55, 0.71, 0.84, 0.92, 0.88, 0.79, 0.68, 0.57], "color": "rose"},
                       {"name": "Fit", "values": [0.2, 0.39, 0.56, 0.7, 0.82, 0.89, 0.89, 0.81, 0.69, 0.56], "color": "gray"}], height=220, smooth=True, labels=False)
    cap1 = d.p("Caption", {"type": "sequence", "label": "Figure", "n": "1", "text": "Figure 1"}, ": settling velocity (mm/s) against concentration (g/L), all twelve tides.")
    to_table = {"type": "crossRef", "kind": "caption", "target": "", "what": "label", "text": "Table 1"}
    d.p("Normal", "Velocity rose steadily to a peak near 1.2 grams per litre and fell beyond it (",
        {"type": "crossRef", "kind": "caption", "target": cap1["id"], "what": "label", "text": "Figure 1"}, "). The fitted constants are in ", to_table, ".")
    d.table([["Constant", "Value", "Unit"], ["a", "0.86", "mm/s"], ["m", "1.4", ""], [d.cell([{"type": "math", "latex": "C_h"}]), "4.1", "g/L"], ["n", "3.2", ""]],
                  [120, 90, 90], look="plain", align="center")
    cap2 = d.p("Caption", {"type": "sequence", "label": "Table", "n": "1", "text": "Table 1"}, ": constants of Equation 2 fitted to all tides.", props={"align": "center"})
    to_table["target"] = cap2["id"]
    d.p("Normal", "The outer traps, nearest the channel, settled fastest on every tide.", note("Their water was also the most turbid: mean concentration 1.4 g/L against 0.6 g/L at the marsh edge."))

    H("4. Discussion")
    d.p("Normal", "The field peak sits close to the laboratory value of 1.0 to 1.5 grams per litre ", cite([("s_quint2021", "12")]),
        ". It means the flats trap most mud on the turbid tides that follow a storm, and least on calm tides, when concentrations are low and flocs are small.")
    H("5. Conclusion")
    d.p("Normal", "A simple two-term law, fitted once, describes mud settling across the north shore flats at slack water. The next step is to run it inside the Field Station's model of the flat's growth.")

    d.body.append({"type": "bibliography", "id": d.id("r_"), "title": "References", "entries": [], "opts": {"scope": "cited", "style": "apa"}})
    bib = d.body[-1]
    for s in sorted(SOURCES, key=lambda s: f"{s['authors'][0]['family'].lower()}|{s['year']}"):
        text, em = apa(s)
        bib["entries"].append({"text": text, "em": [e for e in em if e]})
    toc["entries"] = [{"text": b["content"][0]["text"], "level": lv - 1, "target": b["id"]} for b, lv in heads]
    d.body.append({"type": "notes", "id": d.id("r_"), "title": "Footnotes", "entries": [{"n": str(i + 1), "text": t, "target": f"note:{nid}"} for i, (nid, t) in enumerate(notes)], "opts": {"kind": "footnote"}})
    eq1["props"]["keepNext"] = True
    return d


def landscape(w: int, h: int, seed: int, sky: tuple, hills: list[tuple], water: tuple | None, sun: tuple) -> Image.Image:
    rnd = random.Random(seed)
    img = Image.new("RGB", (w, h))
    px = ImageDraw.Draw(img)
    for y in range(h):
        f = y / h
        px.line([(0, y), (w, y)], fill=tuple(int(sky[0][i] + (sky[1][i] - sky[0][i]) * f) for i in range(3)))
    glow = Image.new("L", (w, h), 0)
    ImageDraw.Draw(glow).ellipse([sun[0] - 160, sun[1] - 160, sun[0] + 160, sun[1] + 160], fill=110)
    img.paste(Image.new("RGB", (w, h), (255, 236, 200)), (0, 0), glow.filter(ImageFilter.GaussianBlur(70)))
    px.ellipse([sun[0] - 34, sun[1] - 34, sun[0] + 34, sun[1] + 34], fill=(255, 244, 222))
    for k, colour in enumerate(hills):
        base = h * (0.42 + k * 0.12)
        amp = h * (0.10 - k * 0.015)
        ph, fr = rnd.uniform(0, 6.28), rnd.uniform(1.2, 2.4)
        pts = [(x, base - amp * (0.6 * math.sin(fr * x / w * 6.28 + ph) + 0.4 * math.sin(2.7 * fr * x / w * 6.28 + ph * 1.7))) for x in range(0, w + 8, 8)]
        px.polygon(pts + [(w, h), (0, h)], fill=colour)
    if water:
        top = int(h * 0.78)
        px.polygon([(0, top + 20), (w * 0.35, top), (w, top + 10), (w, h), (0, h)], fill=water)
        for _ in range(40):
            x, y = rnd.uniform(0, w), rnd.uniform(top + 8, h - 4)
            px.line([(x, y), (x + rnd.uniform(14, 40), y)], fill=tuple(min(255, c + 40) for c in water), width=2)
    return img.filter(ImageFilter.SMOOTH)


def garden(w: int, h: int, seed: int) -> Image.Image:
    rnd = random.Random(seed)
    img = Image.new("RGB", (w, h), (236, 228, 208))
    px = ImageDraw.Draw(img)
    for y in range(h):
        f = y / h
        px.line([(0, y), (w, y)], fill=(int(206 - 60 * f), int(226 - 50 * f), int(236 - 120 * f)))
    px.rectangle([0, int(h * 0.38), w, h], fill=(120, 92, 62))
    colours = [(86, 140, 70), (122, 166, 74), (196, 92, 74), (232, 176, 72), (150, 110, 170)]
    for row in range(5):
        y0 = h * (0.42 + row * 0.115)
        px.rounded_rectangle([w * 0.06, y0, w * 0.94, y0 + h * 0.08], radius=10, fill=(96, 72, 48))
        c = colours[row % len(colours)]
        for i in range(26):
            x = w * 0.08 + i * (w * 0.84 / 26) + rnd.uniform(-4, 4)
            r = rnd.uniform(9, 16) * (1 + row * 0.12)
            px.ellipse([x - r, y0 - r * 0.6, x + r, y0 + r * 0.9], fill=tuple(max(0, min(255, v + rnd.randint(-18, 18))) for v in c))
    px.polygon([(w * 0.72, h * 0.38), (w * 0.82, h * 0.2), (w * 0.92, h * 0.38)], fill=(176, 64, 52))
    px.rectangle([w * 0.74, h * 0.38 - 1, w * 0.9, h * 0.38 + 2], fill=(90, 60, 40))
    return img.filter(ImageFilter.SMOOTH)


def newsletter() -> Doc:
    d = Doc("newsletter", "The Riverside Post: Autumn 2026", "Riverside Residents' Association")
    accent, ink = "#b4532a", "#22201d"
    d.restyle("Normal", {"font": "Lora", "color": ink, "size": 10.0}, {"lineSpacing": 1.25, "spaceAfter": 6.0})
    for lv in (1, 2):
        d.restyle(f"Heading{lv}", {"font": "Playfair Display", "color": accent if lv == 1 else ink, "size": 16.0 if lv == 1 else 12.5}, {"spaceBefore": 10.0})
    d.style("Kicker", "Kicker", {"font": "Work Sans", "size": 8.5, "bold": True, "allCaps": True, "spacing": 1.2, "color": accent}, {"spaceAfter": 2.0})
    d.style("PullQuote", "Pull quote", {"font": "Playfair Display", "size": 14.0, "italic": True, "color": accent},
            {"spaceBefore": 8.0, "spaceAfter": 10.0, "align": "center"})
    caption_style(d)
    d.sec["margins"].update(top=54.0, bottom=54.0, left=54.0, right=54.0)
    d.sec["footers"] = {"default": {"text": "The Riverside Post · Autumn 2026 · page {PAGE}", "align": "center"}}
    body_w = 612 - 108

    d.p("Normal", {"type": "shape", "kind": "wordArt", "id": d.id("s_"), "width": body_w, "height": 64, "text": "The Riverside Post", "wordart": "gradient", "fill": accent,
                   "size": 44.0, "bold": True, "font": "Playfair Display", "color": ink, "stroke": "", "strokeWidth": 0, "wrap": "topBottom", "side": "center"},
        props={"align": "center", "spaceAfter": 0.0})
    d.p("Normal", T("Autumn 2026 · news from the streets between the mill race and the river · free", font="Work Sans", size=9.0, color="#6b645b"),
        props={"align": "center", "border": "bottom", "spaceAfter": 10.0})
    d.p("Normal", d.picture(landscape(1200, 520, 7, ((246, 196, 150), (180, 196, 214)), [(122, 140, 150), (86, 112, 102), (52, 82, 70)], (70, 110, 132), (860, 190)),
                            body_w, "An evening view over the river meadows, with hills behind and the river in front", wrap="topBottom", side="center"),
        props={"align": "center", "spaceAfter": 4.0})
    d.p("Caption", "The river meadows at dusk, drawn for this issue.", props={"align": "center"})

    d.section(start="continuous", columns={"count": 2, "gap": 24.0})
    d.p("Kicker", "Cover story")
    d.p("Heading1", "The footbridge reopens")
    d.p("Normal", "After fourteen months behind fencing, the footbridge over the mill race opened again on 3 October. The new deck is oak, the handrails are lower for children and wheelchair users, and the lamps along it now dim after midnight.")
    d.p("Normal", "More than two hundred neighbours came to the opening. The brass band played, the bakery on Weir Street gave away a thousand small loaves, and the youngest resident present, aged nine days, was carried across first.")
    d.p("PullQuote", "“It feels like the street has been stitched back together.”")
    d.p("Heading2", "What it cost")
    d.p("Normal", "The repair cost 186,000, shared between the council, the river trust and the association's own bridge fund, which raised 23,400 from 412 households over two years.")
    d.chart("donut", "Who paid for the bridge", ["Council", "River trust", "Bridge fund"], [{"name": "Thousands", "values": [118, 44.6, 23.4]}], width=230, height=140)

    d.p("Kicker", "Around the streets")
    d.p("Heading1", "The repair cafe, step by step")
    d.p("Normal", "On the first Saturday of the month the church hall fills with toasters, bicycles and torn coats. Here is how a visit works:")
    d.diagram("list-vertical", ["Book a slot online or at the library", "Bring the broken thing in", "Fix it together with a volunteer", "Take it home, or leave it for spares"], width=230, height=170, colors="accent2")
    d.p("Normal", "Volunteers fixed 61 percent of what came in this year. The rest went home with a list of parts, or to the spares shelf.")
    d.chart("bar", "Things mended this year", ["Lamps", "Bikes", "Clothes", "Toasters", "Radios"], [{"name": "Mended", "values": [34, 29, 51, 18, 12], "color": "amber"}], width=230, height=160)

    d.body.append({"type": "columnBreak", "id": d.id("p_")})
    d.p("Kicker", "Growing")
    d.p("Heading1", "Allotment notes")
    d.p("Normal", d.picture(garden(900, 600, 11), 230, "Raised beds at the Mill Lane allotments, with a red shed at the back", wrap="topBottom", side="center"), props={"align": "center"})
    d.p("Caption", "Raised beds on Mill Lane, drawn for this issue.", props={"align": "center"})
    d.p("Normal", "The Mill Lane plots had their best squash year since records began, and the new rainwater tanks were full until the last week of August. Three plots are free from January: write to the plot secretary to put your name down.")
    d.p("Normal", "For the winter:")
    for item in ("Lift the last carrots before the first frost", "Mulch the asparagus bed with leaf mould", "Order seed potatoes by the end of November"):
        d.p("Normal", item, lst={"kind": "check", "level": 0, "checked": False})

    d.p("Kicker", "Diary")
    d.p("Heading1", "Coming up")
    d.table([["When", "What", "Where"], ["Sat 6 Dec", "Repair cafe", "St Anne's hall"], ["Sun 14 Dec", "Carols on the bridge", "Footbridge"],
             ["Sat 10 Jan", "Seed swap", "Library"], ["Sat 7 Feb", "Repair cafe", "St Anne's hall"], ["Wed 18 Feb", "Association meeting", "Mill Street school"]],
            [64, 92, 74], look="accent")
    d.p("Normal", T("Write for the next issue: ", bold=True), "the deadline is 15 January. Short pieces, drawings and recipes are all welcome.", props={"spaceBefore": 8.0})
    return d


DEMOS = (("review", review, "harbour-trust-annual-report.ftxt"), ("paper", paper, "tidal-flats-paper.ftxt"), ("newsletter", newsletter, "riverside-newsletter.ftxt"))


def request(url: str, method: str = "GET", data: bytes | None = None, ctype: str = "") -> dict:
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": ctype} if ctype else {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


def cover(window: str, demo_id: str, path: Path) -> Path:
    boundary = "ftxtdemo" + hashlib.sha1(path.name.encode()).hexdigest()[:16]
    body = (f"--{boundary}\r\ncontent-disposition: form-data; name=\"files\"; filename=\"{path.name}\"\r\ncontent-type: application/x-formtxt\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    doc_id = request(f"{window}/api/documents/import", "POST", body, f"multipart/form-data; boundary={boundary}")["documents"][0]["id"]
    tmp = Path(tempfile.mkdtemp(prefix="ftxt-cover-"))
    try:
        shot = tmp / "shot.png"
        chrome = shutil.which("google-chrome") or shutil.which("chromium") or "chromium"
        subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1400,900", "--virtual-time-budget=15000",
                        f"--user-data-dir={tmp / 'profile'}", f"--screenshot={shot}", f"{window}/?doc={doc_id}"], check=True, capture_output=True, timeout=120)
        img = Image.open(shot).convert("RGB").crop((380, 196, 1240, 680)).resize((640, 360), Image.LANCZOS)
        out = OUT / f"{demo_id}.webp"
        img.save(out, "WEBP", quality=80, method=6)
        return out
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        request(f"{window}/api/documents/{doc_id}", "DELETE")
        request(f"{window}/api/documents/trash/{doc_id}", "DELETE")


def main() -> int:
    window = sys.argv[sys.argv.index("--covers") + 1].rstrip("/") if "--covers" in sys.argv[1:-1] else ""
    made = []
    for demo_id, build, name in DEMOS:
        doc = build()
        model.validate(doc.doc)
        path = doc.save(name)
        made.append(f"{path.relative_to(ROOT)}  {path.stat().st_size:,} bytes")
        if window:
            pic = cover(window, demo_id, path)
            made.append(f"{pic.relative_to(ROOT)}  {pic.stat().st_size:,} bytes")
    print("\n".join(made))
    return 0


if __name__ == "__main__":
    sys.exit(main())
