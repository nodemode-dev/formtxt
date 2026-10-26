import hashlib
import io

from PIL import Image

from app.core.ids import new_id
from app.services import model


def png_bytes(color=(200, 30, 30), size=(40, 20)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


def media_name(data, ext="png"):
    return f"{hashlib.sha256(data).hexdigest()[:20]}.{ext}"


def paragraph(text, style="Normal", section=None, **extra):
    run = {"type": "text", "text": text}
    if "marks" in extra:
        run["marks"] = extra.pop("marks")
    block = {"type": "paragraph", "id": new_id("p_"), "style": style, "content": [run], **extra}
    if section:
        block["section"] = section
    return block


def rich_document(title="Round trip"):
    doc = model.new_document(title)
    first = doc["sections"][0]
    second = model.default_section("a4", "landscape")
    doc["sections"].append(second)
    png = png_bytes()
    name = media_name(png)
    doc["media"][name] = {"type": "image/png", "bytes": len(png), "width": 40, "height": 20}
    sid = first["id"]
    body = [
        paragraph("Chapter", "Heading1", sid),
        paragraph("plain bold", "Normal", sid, marks={"bold": True}),
        paragraph("first", "Normal", sid, list={"kind": "bullet", "level": 0}),
        paragraph("second", "Normal", sid, list={"kind": "number", "level": 0}),
        paragraph("nested", "Normal", sid, list={"kind": "number", "level": 1}),
        {"type": "table", "id": new_id("t_"), "columns": [100, 100], "rows": [
            {"cells": [{"body": [paragraph("merged", "Normal", sid)], "colspan": 2}]},
            {"cells": [{"body": [paragraph("left", "Normal", sid)]}, {"body": [paragraph("right", "Normal", sid)]}]},
        ]},
        {"type": "paragraph", "id": new_id("p_"), "style": "Normal", "section": sid,
         "content": [{"type": "image", "media": name, "width": 40, "height": 20, "alt": "red box"}]},
        {"type": "sectionBreak", "id": new_id("p_"), "next": second["id"]},
        paragraph("Landscape", "Heading2", second["id"]),
    ]
    doc["tabs"][0]["body"] = body
    return doc, {name: png}


def texts(blocks):
    out = []
    for block in blocks:
        if block.get("type") == "table":
            for row in block["rows"]:
                for cell in row["cells"]:
                    out += texts(cell["body"])
        else:
            out.append("".join(r.get("text", "") for r in block.get("content", []) if isinstance(r, dict)))
    return out
