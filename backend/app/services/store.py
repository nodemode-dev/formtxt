import threading
import time
from pathlib import Path

from app.core import config
from app.core.ids import is_id
from app.services import model, package

EXT = ".ftxt"
_lock = threading.Lock()


class NotFound(LookupError):
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
        kept = media
        if kept is None and path.is_file():
            kept = package.unpack(path.read_bytes())[1]
        doc.setdefault("meta", {})["modified"] = time.time()
        data = package.pack(doc, kept)
        _write(path, data)
    return model.summary(doc, len(data))


def listing(folder: Path | None = None) -> list[dict]:
    out = []
    for path in (folder or config.documents_dir()).glob(f"d_*{EXT}"):
        try:
            data = path.read_bytes()
            doc, _ = package.unpack(data)
            out.append(model.summary(doc, len(data)))
        except (OSError, ValueError):
            continue
    return sorted(out, key=lambda s: s["modified"], reverse=True)


def trash(doc_id: str) -> None:
    path = _path(doc_id)
    if not path.is_file():
        raise NotFound(doc_id)
    with _lock:
        path.replace(_path(doc_id, config.trash_dir()))


def restore(doc_id: str) -> None:
    path = _path(doc_id, config.trash_dir())
    if not path.is_file():
        raise NotFound(doc_id)
    with _lock:
        path.replace(_path(doc_id))


def trashed() -> list[dict]:
    return listing(config.trash_dir())
