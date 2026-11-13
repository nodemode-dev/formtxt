import copy
import json
import re
import time

from app.core.ids import block_id, new_id

TOKEN = re.compile(r"\s+|[\w']+|[^\w\s]", re.UNICODE)
LIMIT = 6_000_000
SIMILAR = 0.35
KEEP_FROM_OTHER = ("comment", "ins", "del")


def lcs(a: list, b: list) -> list[tuple[int, int]]:
    n, m = len(a), len(b)
    head = 0
    while head < n and head < m and a[head] == b[head]:
        head += 1
    tail = 0
    while tail < n - head and tail < m - head and a[n - 1 - tail] == b[m - 1 - tail]:
        tail += 1
    pairs = [(i, i) for i in range(head)]
    ra, rb = a[head:n - tail], b[head:m - tail]
    x, y = len(ra), len(rb)
    if x and y and x * y <= LIMIT:
        table = [[0] * (y + 1) for _ in range(x + 1)]
        for i in range(x - 1, -1, -1):
            row, nxt = table[i], table[i + 1]
            for j in range(y - 1, -1, -1):
                row[j] = nxt[j + 1] + 1 if ra[i] == rb[j] else max(nxt[j], row[j + 1])
        i = j = 0
        while i < x and j < y:
            if ra[i] == rb[j]:
                pairs.append((head + i, head + j))
                i += 1
                j += 1
            elif table[i + 1][j] >= table[i][j + 1]:
                i += 1
            else:
                j += 1
    pairs.extend((n - tail + k, m - tail + k) for k in range(tail))
    return pairs


def ops(a: list, b: list) -> list[tuple[str, int, int]]:
    out: list[tuple[str, int, int]] = []
    i = j = 0
    for pi, pj in lcs(a, b) + [(len(a), len(b))]:
        while i < pi:
            out.append(("del", i, -1))
            i += 1
        while j < pj:
            out.append(("ins", -1, j))
            j += 1
        if pi < len(a) and pj < len(b):
            out.append(("eq", pi, pj))
            i, j = pi + 1, pj + 1
    return out


def run_text(run: dict) -> str:
    kind = run.get("type", "text")
    if kind == "text":
        return str(run.get("text", ""))
    if kind == "break":
        return "\n"
    if kind == "tab":
        return "\t"
    return "￼"


def block_text(block: dict) -> str:
    return "".join(run_text(r) for r in block.get("content") or [] if isinstance(r, dict))


def signature(block: dict) -> str:
    if block.get("type") == "paragraph":
        return "p:" + block_text(block)
    skip = {"id", "section"}
    return "o:" + json.dumps({k: v for k, v in block.items() if k not in skip}, sort_keys=True, default=str)


def tokens(content: list) -> list[tuple[str, dict, dict]]:
    out: list[tuple[str, dict, dict]] = []
    for run in content or []:
        if not isinstance(run, dict):
            continue
        if run.get("type", "text") == "text":
            marks = run.get("marks") or {}
            for piece in TOKEN.findall(str(run.get("text", ""))):
                out.append((piece, {"type": "text"}, marks))
        else:
            body = {k: v for k, v in run.items() if k != "marks"}
            out.append(("\x00" + json.dumps(body, sort_keys=True, default=str), run, {}))
    return out


class Marker:
    def __init__(self, author: str, when: float, remap: dict[str, str] | None = None):
        self.author = author
        self.when = int(when)
        self.remap = remap or {}
        self.count = 0

    def change(self) -> dict:
        self.count += 1
        return {"id": new_id("r_"), "author": self.author, "time": self.when}

    def foreign(self, marks: dict) -> dict:
        out: dict = {}
        for key in KEEP_FROM_OTHER:
            if key not in marks or marks[key] in (None, False):
                continue
            value = copy.deepcopy(marks[key])
            if key == "comment":
                ids = value if isinstance(value, list) else [value]
                value = [self.remap.get(str(i), str(i)) for i in ids]
            out[key] = value
        return out


def merged(base_marks: dict, extra: dict) -> dict:
    out = copy.deepcopy(base_marks)
    for key, value in extra.items():
        if key == "comment":
            have = out.get("comment") or []
            have = have if isinstance(have, list) else [have]
            out["comment"] = have + [v for v in value if v not in have]
        else:
            out[key] = value
    return out


def emit(runs: list, piece: str, template: dict, marks: dict) -> None:
    if template.get("type", "text") != "text":
        run = copy.deepcopy(template)
        if marks:
            run["marks"] = marks
        runs.append(run)
        return
    if runs and runs[-1].get("type", "text") == "text" and (runs[-1].get("marks") or {}) == marks:
        runs[-1]["text"] += piece
        return
    run = {"type": "text", "text": piece}
    if marks:
        run["marks"] = marks
    runs.append(run)


def similarity(a: str, b: str) -> float:
    wa, wb = set(re.findall(r"\w+", a.lower())), set(re.findall(r"\w+", b.lower()))
    if not wa and not wb:
        return 1.0 if a == b else 0.0
    return len(wa & wb) / max(1, len(wa | wb))


def diff_paragraph(base: dict, other: dict, marker: Marker, combine: bool) -> dict:
    a, b = tokens(base.get("content") or []), tokens(other.get("content") or [])
    out: list = []
    change: dict | None = None
    last = ""
    for kind, i, j in ops([t[0] for t in a], [t[0] for t in b]):
        if kind == "eq":
            tok, template, marks = a[i]
            if combine:
                marks = merged(marks, marker.foreign(b[j][2]))
            emit(out, tok, template, copy.deepcopy(marks))
            change, last = None, ""
            continue
        if change is None or last != kind:
            change = marker.change()
        last = kind
        if kind == "del":
            tok, template, marks = a[i]
            if template.get("type", "text") != "text":
                continue
            emit(out, tok, template, merged(copy.deepcopy(marks), {"del": change}))
        else:
            tok, template, marks = b[j]
            if template.get("type", "text") != "text":
                emit(out, tok, template, {})
                continue
            extra = marker.foreign(marks) if combine else {}
            plain = {k: copy.deepcopy(v) for k, v in marks.items() if k not in KEEP_FROM_OTHER}
            emit(out, tok, template, merged(plain, {**extra, "ins": extra.get("ins", change)}))
    result = copy.deepcopy(base)
    result["content"] = out
    return result


def walk_runs(node, fn) -> None:
    if isinstance(node, dict):
        if node.get("type") == "text" and "text" in node:
            fn(node)
        for value in node.values():
            walk_runs(value, fn)
    elif isinstance(node, list):
        for item in node:
            walk_runs(item, fn)


def tag_block(block: dict, kind: str, marker: Marker, combine: bool) -> dict:
    out = copy.deepcopy(block)
    change = marker.change()

    def apply(run: dict) -> None:
        marks = run.get("marks") or {}
        if kind == "ins" and not combine:
            for key in KEEP_FROM_OTHER:
                marks.pop(key, None)
        if kind == "ins" and combine:
            marks.setdefault("ins", change)
        else:
            marks[kind] = change
        run["marks"] = marks

    walk_runs(out, apply)
    return out


def remap_block(block: dict, marker: Marker) -> dict:
    out = copy.deepcopy(block)

    def apply(run: dict) -> None:
        marks = run.get("marks")
        if marks and "comment" in marks:
            ids = marks["comment"] if isinstance(marks["comment"], list) else [marks["comment"]]
            marks["comment"] = [marker.remap.get(str(i), str(i)) for i in ids]

    walk_runs(out, apply)
    return out


def diff_body(base: list, other: list, marker: Marker, combine: bool, section: str) -> list:
    a = [signature(b) for b in base]
    b = [signature(x) for x in other]
    result: list = []
    script = ops(a, b)
    k = 0
    while k < len(script):
        kind, i, j = script[k]
        if kind == "eq":
            if combine and base[i].get("type") == "paragraph":
                result.append(diff_paragraph(base[i], other[j], marker, True))
            else:
                result.append(copy.deepcopy(base[i]))
            k += 1
            continue
        dels, inss = [], []
        while k < len(script) and script[k][0] != "eq":
            if script[k][0] == "del":
                dels.append(script[k][1])
            else:
                inss.append(script[k][2])
            k += 1
        ptr = 0
        for d in dels:
            hit = -1
            if base[d].get("type") == "table":
                for q in range(ptr, len(inss)):
                    o = other[inss[q]]
                    if o.get("type") == "table" and same_shape(base[d], o):
                        hit = q
                        break
                if hit >= 0:
                    for q in range(ptr, hit):
                        result.append(incoming(other[inss[q]], marker, combine, section))
                    result.append(diff_table(base[d], other[inss[hit]], marker, combine, section))
                    ptr = hit + 1
                    continue
            if base[d].get("type") == "paragraph":
                for q in range(ptr, len(inss)):
                    o = other[inss[q]]
                    if o.get("type") == "paragraph" and similarity(block_text(base[d]), block_text(o)) >= SIMILAR:
                        hit = q
                        break
            if hit < 0:
                result.append(tag_block(base[d], "del", marker, False))
                continue
            for q in range(ptr, hit):
                result.append(incoming(other[inss[q]], marker, combine, section))
            result.append(diff_paragraph(base[d], other[inss[hit]], marker, combine))
            ptr = hit + 1
        for q in range(ptr, len(inss)):
            result.append(incoming(other[inss[q]], marker, combine, section))
    return result


def same_shape(a: dict, b: dict) -> bool:
    ra, rb = a.get("rows") or [], b.get("rows") or []
    return len(ra) == len(rb) and all(len(x.get("cells") or []) == len(y.get("cells") or []) for x, y in zip(ra, rb))


def diff_table(base: dict, other: dict, marker: Marker, combine: bool, section: str) -> dict:
    out = copy.deepcopy(base)
    for r, (row_a, row_b) in enumerate(zip(base.get("rows") or [], other.get("rows") or [])):
        for c, (cell_a, cell_b) in enumerate(zip(row_a.get("cells") or [], row_b.get("cells") or [])):
            out["rows"][r]["cells"][c]["body"] = diff_body(cell_a.get("body") or [], cell_b.get("body") or [], marker, combine, section)
    return out


def incoming(block: dict, marker: Marker, combine: bool, section: str) -> dict:
    out = tag_block(remap_block(block, marker) if combine else block, "ins", marker, combine)
    out["id"] = block_id(out)
    if section:
        out["section"] = section
    return out


def count_changes(doc: dict) -> int:
    seen: set[str] = set()

    def visit(run: dict) -> None:
        for key in ("ins", "del"):
            mark = (run.get("marks") or {}).get(key)
            if isinstance(mark, dict) and mark.get("id"):
                seen.add(str(mark["id"]))

    for tab in doc.get("tabs", []):
        walk_runs(tab.get("body"), visit)
    return len(seen)


def tracked_changes(doc: dict) -> list[dict]:
    found: dict[str, dict] = {}

    def visit(run: dict) -> None:
        for key in ("ins", "del"):
            mark = (run.get("marks") or {}).get(key)
            if isinstance(mark, dict) and mark.get("id"):
                row = found.setdefault(str(mark["id"]), {"id": str(mark["id"]), "kind": "insertion" if key == "ins" else "deletion", "author": mark.get("author", ""), "time": mark.get("time", 0), "text": ""})
                row["text"] += str(run.get("text", ""))

    for tab in doc.get("tabs", []):
        walk_runs(tab.get("body"), visit)
    return list(found.values())


def compare(base: dict, other: dict, author: str = "", combine: bool = False) -> tuple[dict, int]:
    who = author.strip() or str((other.get("meta") or {}).get("author") or "") or str(other.get("title") or "Other")
    when = (other.get("meta") or {}).get("modified") or time.time()
    remap: dict[str, str] = {}
    comments = copy.deepcopy(base.get("comments") or {})
    if combine:
        for cid, body in (other.get("comments") or {}).items():
            fresh = new_id("c_")
            remap[str(cid)] = fresh
            body = copy.deepcopy(body)
            if isinstance(body, dict):
                body["id"] = fresh
            comments[fresh] = body
    marker = Marker(who, when, remap)
    out = copy.deepcopy(base)
    section = str(out["sections"][0]["id"]) if out.get("sections") else ""
    other_tabs = list(other.get("tabs") or [])
    used: set[int] = set()
    for index, tab in enumerate(out["tabs"]):
        match = next((n for n, t in enumerate(other_tabs) if t.get("id") == tab.get("id") and n not in used), None)
        if match is None and index < len(other_tabs) and index not in used and not any(t.get("id") == tab.get("id") for t in other_tabs):
            match = index
        if match is None:
            continue
        used.add(match)
        tab["body"] = diff_body(tab.get("body") or [], other_tabs[match].get("body") or [], marker, combine, section)
    for n, extra in enumerate(other_tabs):
        if n in used:
            continue
        out["tabs"].append({"id": new_id("tab_"), "title": str(extra.get("title") or f"Tab {len(out['tabs']) + 1}"), "parent": None, "body": [incoming(b, marker, combine, section) for b in extra.get("body") or []]})
    if comments:
        out["comments"] = comments
    for name, meta in (other.get("media") or {}).items():
        out.setdefault("media", {}).setdefault(name, meta)
    return out, marker.count
