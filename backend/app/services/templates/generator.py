from app.core.ids import new_id
from app.services import model
from app.services.templates.catalog import DocTemplate
from app.services.templates.samples import sample_body

LINE_SPACING = {"Essay": 2.0}


def _style(doc: dict, sid: str, run: dict | None = None, para: dict | None = None) -> None:
    style = doc["styles"][sid]
    style.setdefault("run", {}).update(run or {})
    style.setdefault("para", {}).update(para or {})


def build(t: DocTemplate, title: str = "", author: str = "") -> dict:
    body = sample_body(t)
    doc = model.new_document(title or t.name, author, t.size)
    heading, text = t.fonts
    _style(doc, "Normal", {"font": text, "color": t.ink}, {"lineSpacing": LINE_SPACING.get(t.category, 1.15)})
    _style(doc, "Title", {"font": heading, "color": t.accent if t.layout != "banded" else t.ink, "bold": t.layout in ("centered", "banded")},
           {"align": "center" if t.layout == "centered" else "left"})
    _style(doc, "Subtitle", {"font": text}, {"align": "center" if t.layout == "centered" else "left"})
    for level in range(1, 10):
        _style(doc, f"Heading{level}", {"font": heading, "color": t.accent if level <= 2 else t.ink})
    if t.category == "Essay":
        _style(doc, "Title", {"size": 16.0, "color": t.ink}, {"align": "center"})
    doc["settings"]["template"] = {"id": t.id, "layout": t.layout, "accent": t.accent}
    section = doc["sections"][0]["id"]
    doc["tabs"][0]["body"] = [
        {"type": "paragraph", "id": new_id("p_"), "style": style, "section": section,
         "content": [{"type": "text", "text": text_}] if text_ else []}
        for style, text_ in body
    ]
    if title:
        for block in doc["tabs"][0]["body"]:
            if block["style"] == "Title":
                block["content"] = [{"type": "text", "text": title}]
                break
    return doc
