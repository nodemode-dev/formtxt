import json
import time

from app.core import config
from app.core.ids import is_id, new_id
from app.services import package

EXT = ".ftxt"
CATEGORY = "Yours"


class NotFound(LookupError):
    pass


def _path(tid: str):
    if not is_id(tid, "t_"):
        raise NotFound(tid)
    return config.templates_dir() / f"{tid}{EXT}"


def save(doc: dict, media: dict[str, bytes], name: str, description: str = "") -> dict:
    tid = new_id("t_")
    tpl = json.loads(json.dumps(doc))
    tpl["title"] = name.strip()[:120] or doc["title"]
    tpl.setdefault("settings", {})["userTemplate"] = {"id": tid, "description": description.strip()[:300], "saved": time.time()}
    _path(tid).write_bytes(package.pack(tpl, media))
    return summary(tid, tpl)


def summary(tid: str, doc: dict) -> dict:
    meta = (doc.get("settings") or {}).get("template") or {}
    info = (doc.get("settings") or {}).get("userTemplate") or {}
    return {"id": tid, "name": doc["title"], "category": CATEGORY, "layout": meta.get("layout", "classic"),
            "accent": meta.get("accent", "#f97316"), "fonts": {"heading": "", "body": ""},
            "description": info.get("description") or "Saved from one of your documents.", "tags": [],
            "size": doc["sections"][0]["page"]["size"], "builtin": False}


def load(tid: str) -> tuple[dict, dict[str, bytes]]:
    path = _path(tid)
    if not path.is_file():
        raise NotFound(tid)
    return package.unpack(path.read_bytes())


def listing() -> list[dict]:
    out = []
    for path in sorted(config.templates_dir().glob(f"t_*{EXT}"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            doc, _ = package.unpack(path.read_bytes())
            out.append(summary(path.stem, doc))
        except (OSError, ValueError):
            continue
    return out


def delete(tid: str) -> None:
    path = _path(tid)
    if not path.is_file():
        raise NotFound(tid)
    path.unlink()
