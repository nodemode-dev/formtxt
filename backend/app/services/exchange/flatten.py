import copy

from app.core.ids import new_id
from app.services.exchange import common

GENERATED = ("toc", "tableOfFigures", "index", "bibliography")
DROP_RUNS = ("bookmark", "indexEntry")


def _entry(e: dict, section: str) -> dict:
    label = str(e.get("n") or "")
    text = str(e.get("text") or "")
    runs = [common.text_run((label + " " if label else "") + text, {"bold": True} if e.get("heading") else None)]
    if e.get("page"):
        runs.append({"type": "tab"})
        runs.append(common.text_run(str(e["page"])))
    props = {"indentLeft": 18.0 * int(e.get("level", 0) or 0)} if e.get("level") else None
    return common.para("Normal", runs, section, props)


def _runs(runs: list[dict], counter: dict[str, int], notes: list[dict]) -> list[dict]:
    out: list[dict] = []
    for r in runs:
        t = r.get("type")
        if t in DROP_RUNS:
            continue
        if t in ("sequence", "crossRef", "citation"):
            if r.get("text"):
                out.append(common.text_run(str(r["text"])))
            continue
        if t == "linkChip":
            out.append(common.text_run(str(r.get("text") or r.get("title") or r.get("href") or ""), {"link": r.get("href"), "underline": True, "color": "#0563c1"}))
            continue
        if t == "noteRef":
            kind = "endnote" if r.get("kind") == "endnote" else "footnote"
            counter[kind] = counter.get(kind, 0) + 1
            r = dict(r)
            r["kind"] = kind
            r["n"] = counter[kind]
            r["text"] = str(counter[kind])
            notes.append(r)
            out.append(r)
            continue
        if t == "shape" and r.get("content"):
            r = dict(r)
            r["content"] = _blocks(r["content"], "", counter, notes)
        out.append(r)
    return out


def _blocks(blocks: list[dict], section: str, counter: dict[str, int], notes: list[dict]) -> list[dict]:
    out: list[dict] = []
    for b in blocks:
        t = b.get("type")
        sec = b.get("section") or section
        if t in GENERATED:
            if b.get("title"):
                out.append(common.para("Heading2", [common.text_run(str(b["title"]))], sec))
            out.extend(_entry(e, sec) for e in b.get("entries") or [])
        elif t == "notes":
            continue
        elif t == "paragraph":
            b = dict(b)
            b["content"] = _runs(b.get("content") or [], counter, notes)
            out.append(b)
        elif t == "table":
            b = copy.copy(b)
            rows = []
            for row in b.get("rows") or []:
                cells = []
                for c in row if isinstance(row, list) else row.get("cells", []):
                    c = dict(c)
                    c["body"] = _blocks(c.get("body") or [], sec, counter, notes)
                    cells.append(c)
                rows.append(cells if isinstance(row, list) else {**row, "cells": cells})
            b["rows"] = rows
            out.append(b)
        else:
            out.append(b)
    return out


def prepare(doc: dict) -> dict:
    doc = dict(doc)
    counter: dict[str, int] = {}
    notes: list[dict] = []
    tabs = []
    for tab in doc.get("tabs") or []:
        tab = dict(tab)
        tab["body"] = _blocks(tab.get("body") or [], "", counter, notes)
        tabs.append(tab)
    doc["tabs"] = tabs
    doc["notes"] = {
        "footnotes": {str(r.get("id") or new_id("n_")): str(r.get("note") or "") for r in notes if r["kind"] == "footnote"},
        "endnotes": {str(r.get("id") or new_id("n_")): str(r.get("note") or "") for r in notes if r["kind"] == "endnote"},
    }
    return doc
