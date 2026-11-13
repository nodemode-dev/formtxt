import copy
import os
import threading
import time
from pathlib import Path

from app.core import config
from app.core.ids import is_id, new_id
from app.services import model, versions, versions_vault as package

EXT = ".ftxt"
_lock = threading.Lock()


class NotFound(LookupError):
    pass


class Conflict(Exception):
    pass


def _path(doc_id: str, folder: Path | None = None) -> Path:
    if not is_id(doc_id, "d_"):
        raise NotFound(doc_id)
    return (folder or config.documents_dir()) / f"{doc_id}{EXT}"


def _write(path: Path, data: bytes) -> None:
    tmp = path.with_suffix(EXT + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def create(title: str = "", author: str = "", size: str = "letter") -> dict:
    doc = model.new_document(title or "Untitled document", author, size)
    with _lock:
        _write(_path(doc["id"]), package.pack(doc))
    return doc


def load(doc_id: str) -> tuple[dict, dict[str, bytes]]:
    path = _path(doc_id)
    if not path.is_file():
        raise NotFound(doc_id)
    return package.unpack(path.read_bytes())


def save(doc: dict, media: dict[str, bytes] | None = None) -> dict:
    model.validate(doc)
    path = _path(doc["id"])
    with _lock:
        if not path.is_file() and _path(doc["id"], config.trash_dir()).is_file():
            raise Conflict(doc["id"])
        kept = media
        if kept is None and path.is_file():
            kept = package.unpack(path.read_bytes())[1]
        doc.setdefault("meta", {})["modified"] = time.time()
        data = package.pack(doc, kept)
        _write(path, data)
    versions.after_save(doc, data)
    return model.summary(doc, len(data))


def listing(folder: Path | None = None) -> list[dict]:
    out = []
    for path in (folder or config.documents_dir()).glob(f"d_*{EXT}"):
        try:
            data = path.read_bytes()
            doc, _ = package.unpack(data)
            out.append(package.flag(model.summary(doc, len(data)), data))
        except (OSError, ValueError) as exc:
            row = package.locked_row(exc)
            if row:
                out.append(row)
    return sorted(out, key=lambda s: s["modified"], reverse=True)


def trash(doc_id: str) -> None:
    path = _path(doc_id)
    if not path.is_file():
        raise NotFound(doc_id)
    with _lock:
        target = _path(doc_id, config.trash_dir())
        path.replace(target)
        os.utime(target)


def restore(doc_id: str) -> None:
    path = _path(doc_id, config.trash_dir())
    if not path.is_file():
        raise NotFound(doc_id)
    with _lock:
        if _path(doc_id).is_file():
            raise Conflict(doc_id)
        path.replace(_path(doc_id))


def trashed() -> list[dict]:
    rows = listing(config.trash_dir())
    for row in rows:
        try:
            row["deletedAt"] = _path(row["id"], config.trash_dir()).stat().st_mtime
        except OSError:
            row["deletedAt"] = 0
    return sorted(rows, key=lambda r: r["deletedAt"], reverse=True)


def purge(doc_id: str) -> None:
    path = _path(doc_id, config.trash_dir())
    if not path.is_file():
        raise NotFound(doc_id)
    with _lock:
        path.unlink()


def empty_trash() -> int:
    n = 0
    with _lock:
        for path in config.trash_dir().glob(f"d_*{EXT}"):
            path.unlink(missing_ok=True)
            n += 1
    return n


def add_media(doc_id: str, name: str, data: bytes) -> None:
    path = _path(doc_id)
    with _lock:
        if not path.is_file():
            raise NotFound(doc_id)
        doc, media = package.unpack(path.read_bytes())
        if name in media:
            return
        media[name] = data
        _write(path, package.pack(doc, media))


def media_file(doc_id: str, name: str) -> bytes:
    media = load(doc_id)[1]
    if name not in media:
        raise NotFound(name)
    return media[name]


def adopt(doc: dict, media: dict[str, bytes] | None = None, title: str = "") -> dict:
    fresh = copy.deepcopy(doc)
    fresh["id"] = new_id("d_")
    if title:
        fresh["title"] = title.strip()[:200]
    now = time.time()
    fresh.setdefault("meta", {}).update(created=now, modified=now)
    model.validate(fresh)
    fresh, media = package.prune(fresh, media)
    with _lock:
        _write(_path(fresh["id"]), package.pack(fresh, media))
    return fresh


def duplicate(doc_id: str) -> dict:
    doc, media = load(doc_id)
    return adopt(doc, media, f"{doc['title']} (copy)")
