import re
import secrets
import time

from app.services import package, store
from app.services.collab import files, render

_DEFAULT = {"pages": {}}
TOKEN = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _file(token: str):
    folder = files.folder() / "published"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{token}.html"


def status(doc_id: str) -> dict | None:
    for token, info in files.read("published.json", _DEFAULT).get("pages", {}).items():
        if info.get("doc") == doc_id:
            return {"token": token, **info}
    return None


def _build(doc_id: str) -> tuple[str, str]:
    doc, media = store.load(doc_id)
    doc, media = package.prune(doc, media)
    return render.page(doc, media), str(doc.get("title", ""))


def publish(doc_id: str) -> dict:
    html, title = _build(doc_id)
    now = time.time()
    current = status(doc_id)
    token = current["token"] if current else secrets.token_urlsafe(12)
    created = current["created"] if current else now
    _file(token).write_text(html, encoding="utf-8")
    info = {"doc": doc_id, "title": title, "created": created, "updated": now, "bytes": len(html.encode("utf-8"))}
    files.update("published.json", _DEFAULT, lambda d: d.setdefault("pages", {}).__setitem__(token, info))
    return {"token": token, **info}


def unpublish(doc_id: str) -> bool:
    current = status(doc_id)
    if not current:
        return False
    try:
        _file(current["token"]).unlink()
    except OSError:
        pass
    files.update("published.json", _DEFAULT, lambda d: d.setdefault("pages", {}).pop(current["token"], None))
    return True


def html_for(token: str) -> str | None:
    if not TOKEN.match(token) or token not in files.read("published.json", _DEFAULT).get("pages", {}):
        return None
    try:
        return _file(token).read_text(encoding="utf-8")
    except OSError:
        return None


def export_html(doc_id: str) -> tuple[str, str]:
    return _build(doc_id)
