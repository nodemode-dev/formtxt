import re

from app.services import store

CAP_DOC = 14000
CAP_ALL = 60000


def runs_text(content: list) -> str:
    out = []
    for r in content or []:
        t = r.get("type")
        if t == "text":
            out.append(str(r.get("text") or ""))
        elif t == "break":
            out.append("\n")
        elif t == "tab":
            out.append(" ")
        elif t == "chip":
            out.append(str(r.get("text") or ""))
        elif t == "field":
            out.append(str(r.get("result") or ""))
        elif t == "math":
            out.append(str(r.get("latex") or ""))
    return "".join(out)


def blocks_text(body: list, depth: int = 0) -> list[str]:
    lines: list[str] = []
    for b in body or []:
        kind = b.get("type")
        if kind == "paragraph":
            text = runs_text(b.get("content"))
            if not text.strip():
                continue
            style = str(b.get("style") or "")
            m = re.match(r"^Heading(\d)$", style)
            lst = b.get("list")
            if m:
                lines.append("#" * int(m.group(1)) + " " + text)
            elif style == "Title":
                lines.append("# " + text)
            elif lst:
                pad = "  " * int(lst.get("level") or 0)
                mark = "1." if lst.get("kind") == "number" else "- [ ]" if lst.get("kind") == "check" else "-"
                lines.append(f"{pad}{mark} {text}")
            elif style == "Quote":
                lines.append("> " + text)
            else:
                lines.append(text)
        elif kind == "code":
            lines.append(str(b.get("text") or ""))
        elif kind == "table":
            for r in b.get("rows") or []:
                cells = [" ".join(blocks_text(c.get("body"), depth + 1)).replace("|", "/") for c in r.get("cells") or []]
                lines.append("| " + " | ".join(cells) + " |")
    return lines


def doc_text(doc: dict) -> str:
    parts = []
    for tab in doc.get("tabs") or []:
        parts.extend(blocks_text(tab.get("body")))
    return "\n\n".join(parts)


def library_doc(doc_id: str, cap: int = CAP_DOC) -> tuple[str, str]:
    try:
        doc, _ = store.load(doc_id)
    except store.NotFound:
        raise LookupError(doc_id)
    text = doc_text(doc)
    return str(doc.get("title") or "Untitled"), text[:cap]


def search(q: str, limit: int = 20, skip: str = "") -> list[dict]:
    terms = [t for t in re.split(r"\s+", q.lower().strip()) if t]
    rows = []
    for row in store.listing()[:600]:
        if row["id"] == skip:
            continue
        title = str(row["title"])
        if not terms:
            rows.append({"id": row["id"], "title": title, "words": row["words"], "modified": row["modified"], "snippet": "", "score": 0})
            continue
        try:
            doc, _ = store.load(row["id"])
        except (store.NotFound, ValueError, OSError):
            continue
        body = doc_text(doc)
        low, tl = body.lower(), title.lower()
        score = sum(10 for t in terms if t in tl) + sum(min(low.count(t), 8) for t in terms)
        if not score or not all(t in low or t in tl for t in terms):
            continue
        plain = re.sub(r"\s+", " ", re.sub(r"(?m)^\s*(#{1,6}\s+|>\s*|[-*]\s+|\d+[.)]\s+|- \[[ x]\]\s+)", "", body.replace("|", " "))).strip()
        pl = plain.lower()
        first = min((pl.find(t) for t in terms if t in pl), default=0)
        start = max(0, first - 80)
        if start:
            start = plain.find(" ", start) + 1 or start
        piece = plain[start:start + 240]
        if start + 240 < len(plain):
            piece = piece[:piece.rfind(" ")] if " " in piece else piece
        snippet = ("... " if start else "") + piece.strip() + (" ..." if start + 240 < len(plain) else "")
        rows.append({"id": row["id"], "title": title, "words": row["words"], "modified": row["modified"], "snippet": snippet, "score": score})
    rows.sort(key=lambda r: (-r["score"], -r["modified"]))
    return rows[:limit]
