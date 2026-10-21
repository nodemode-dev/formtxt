from app.services.exchange import common


def build(doc: dict, media: dict[str, bytes]) -> bytes:
    counter = common.ListCounter()
    lines: list[str] = []

    def blocks(items: list[dict], indent: str = "") -> None:
        for b in items:
            kind = b.get("type")
            if kind == "paragraph":
                lst = b.get("list")
                text = common.plain(b.get("content"))
                if lst:
                    level = min(int(lst.get("level", 0) or 0), 8)
                    label = counter.label(lst)
                    lines.append(f"{indent}{'  ' * level}{label} {text}")
                    continue
                counter.reset()
                lines.append(indent + text)
                lines.append("")
            elif kind == "code":
                counter.reset()
                lines.extend(indent + ln for ln in str(b.get("text", "")).split("\n"))
                lines.append("")
            elif kind == "table":
                counter.reset()
                for row in b.get("rows") or []:
                    cells = []
                    for c in row.get("cells") or []:
                        cells.append(" ".join(common.plain(x.get("content")) for x in c.get("body") or [] if x.get("type") == "paragraph"))
                    lines.append(indent + "\t".join(cells))
                lines.append("")
            elif kind in ("pageBreak", "sectionBreak", "columnBreak"):
                counter.reset()
                lines.append("")
            elif kind in ("chart", "mermaid", "diagram"):
                blocks(common.degrade(b, ""), indent)

    tabs = common.doc_tabs(doc)
    for tab in tabs:
        if len(tabs) > 1:
            lines.append(str(tab.get("title", "")))
            lines.append("")
        blocks(tab.get("body") or [])
    import re
    notes = doc.get("notes") or {}
    for group in ("footnotes", "endnotes"):
        if notes.get(group):
            lines.append("")
            lines.extend(f"[{i}] {body}" for i, body in enumerate(notes[group].values(), start=1))
    text =re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() + "\n"
    return text.encode("utf-8")
