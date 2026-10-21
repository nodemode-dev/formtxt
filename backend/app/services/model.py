import time
from copy import deepcopy

from app.core.ids import new_id

FORMAT = "ftxt"
FORMAT_VERSION = 1

PAGE_SIZES = {
    "letter": (612.0, 792.0),
    "legal": (612.0, 1008.0),
    "a4": (595.28, 841.89),
    "a5": (419.53, 595.28),
    "executive": (522.0, 756.0),
    "tabloid": (792.0, 1224.0),
}

DEFAULT_STYLES = {
    "Normal": {"type": "paragraph", "name": "Normal", "basedOn": None, "next": "Normal",
               "run": {"font": "Inter", "size": 11.0, "color": "#000000"},
               "para": {"spaceBefore": 0.0, "spaceAfter": 8.0, "lineSpacing": 1.15, "align": "left"}},
    "Title": {"type": "paragraph", "name": "Title", "basedOn": "Normal", "next": "Normal",
              "run": {"size": 28.0}, "para": {"spaceAfter": 12.0}},
    "Subtitle": {"type": "paragraph", "name": "Subtitle", "basedOn": "Normal", "next": "Normal",
                 "run": {"size": 15.0, "color": "#5a5a5a"}, "para": {"spaceAfter": 12.0}},
    "Quote": {"type": "paragraph", "name": "Quote", "basedOn": "Normal", "next": "Normal",
              "run": {"italic": True}, "para": {"indentLeft": 36.0, "indentRight": 36.0}},
}
for _level, _size in enumerate((20.0, 16.0, 14.0, 12.0, 11.0, 11.0, 11.0, 11.0, 11.0), start=1):
    DEFAULT_STYLES[f"Heading{_level}"] = {
        "type": "paragraph", "name": f"Heading {_level}", "basedOn": "Normal", "next": "Normal",
        "run": {"size": _size, "bold": _level <= 3},
        "para": {"spaceBefore": 18.0 if _level <= 2 else 12.0, "spaceAfter": 6.0, "keepWithNext": True, "outlineLevel": _level},
    }


def default_section(size: str = "letter", orientation: str = "portrait") -> dict:
    width, height = PAGE_SIZES.get(size, PAGE_SIZES["letter"])
    if orientation == "landscape":
        width, height = height, width
    return {
        "id": new_id("sec_"),
        "page": {"size": size, "width": width, "height": height, "orientation": orientation},
        "margins": {"top": 72.0, "right": 72.0, "bottom": 72.0, "left": 72.0, "header": 36.0, "footer": 36.0, "gutter": 0.0},
        "columns": {"count": 1, "gap": 36.0},
        "headers": {}, "footers": {}, "titlePage": False, "start": "nextPage",
    }


def new_document(title: str = "Untitled document", author: str = "", size: str = "letter") -> dict:
    now = time.time()
    section = default_section(size)
    return {
        "format": FORMAT,
        "formatVersion": FORMAT_VERSION,
        "id": new_id("d_"),
        "title": title.strip()[:200] or "Untitled document",
        "meta": {"author": author[:200], "created": now, "modified": now, "subject": "", "keywords": [], "language": "en-US"},
        "settings": {"pageless": False, "defaultTab": 36.0, "trackChanges": False},
        "styles": deepcopy(DEFAULT_STYLES),
        "numbering": {},
        "sections": [section],
        "tabs": [{"id": new_id("tab_"), "title": "Tab 1", "parent": None,
                  "body": [{"type": "paragraph", "id": new_id("p_"), "style": "Normal", "section": section["id"], "content": []}]}],
        "notes": {"footnotes": {}, "endnotes": {}},
        "comments": {},
        "media": {},
    }


class InvalidDocument(ValueError):
    pass


def validate(doc: dict) -> dict:
    if not isinstance(doc, dict) or doc.get("format") != FORMAT:
        raise InvalidDocument("not a FormTxt document")
    if int(doc.get("formatVersion") or 0) > FORMAT_VERSION:
        raise InvalidDocument(f"written by a newer FormTxt (format {doc.get('formatVersion')}); update FormTxt to open it")
    for key in ("id", "title", "sections", "tabs", "styles"):
        if key not in doc:
            raise InvalidDocument(f"missing {key}")
    if not doc["sections"] or not doc["tabs"]:
        raise InvalidDocument("a document needs at least one section and one tab")
    return doc


def summary(doc: dict, size: int = 0) -> dict:
    words = 0
    for tab in doc.get("tabs", []):
        for block in tab.get("body", []):
            for run in block.get("content", []) or []:
                if isinstance(run, dict) and run.get("type") == "text":
                    words += len(str(run.get("text", "")).split())
    return {"id": doc["id"], "title": doc["title"], "modified": doc.get("meta", {}).get("modified", 0),
            "created": doc.get("meta", {}).get("created", 0), "words": words, "bytes": size,
            "page": doc["sections"][0]["page"]}
