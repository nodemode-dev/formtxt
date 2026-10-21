import re
from pathlib import Path

from app.core import config
from app.services import tabular

EXTENSIONS = ("csv", "tsv", "txt", "xlsx")


class SourceError(ValueError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def library() -> Path:
    path = config.data_dir() / "Library"
    path.mkdir(parents=True, exist_ok=True)
    return path


def library_files() -> list[dict]:
    out = []
    for p in sorted(library().iterdir(), key=lambda p: p.name.lower()):
        if p.is_file() and p.suffix.lstrip(".").lower() in EXTENSIONS:
            st = p.stat()
            out.append({"name": p.name, "bytes": st.st_size, "mtime": st.st_mtime})
    return out


def library_add(name: str, data: bytes) -> dict:
    safe = re.sub(r"[^\w .()+-]", "_", Path(name or "data").name).strip(" .")[:120] or "data.csv"
    if safe.rsplit(".", 1)[-1].lower() not in EXTENSIONS:
        raise SourceError(415, f"{safe}: the library keeps .csv, .tsv, .txt and .xlsx data files.")
    if len(data) > config.MAX_MEDIA_BYTES:
        raise SourceError(413, f"{safe}: data files up to {config.MAX_MEDIA_BYTES // (1024 * 1024)} MB are supported.")
    target = library() / safe
    target.write_bytes(data)
    st = target.stat()
    return {"name": safe, "bytes": st.st_size, "mtime": st.st_mtime}


def resolve(path: str) -> Path:
    text = (path or "").strip()
    if not text:
        raise SourceError(400, "Give a file path or choose a library file.")
    if text.lower().startswith("library:"):
        name = text[8:].strip()
        if not name or "/" in name or "\\" in name or ".." in name:
            raise SourceError(400, "A library file is named without folders.")
        target = library() / name
    else:
        target = Path(text).expanduser()
        if not target.is_absolute():
            raise SourceError(400, "Use a full path such as /home/me/sales.xlsx, or library:name.csv.")
    if target.suffix.lstrip(".").lower() not in EXTENSIONS:
        raise SourceError(415, "Charts read .csv, .tsv, .txt and .xlsx files.")
    if not target.is_file():
        raise SourceError(404, f"{target.name} was not found at that path.")
    return target


def read(path: str, sheet: str = "", known_mtime: float | None = None) -> dict:
    target = resolve(path)
    st = target.stat()
    if known_mtime is not None and abs(st.st_mtime - known_mtime) < 0.001:
        return {"changed": False, "mtime": st.st_mtime, "bytes": st.st_size, "name": target.name}
    if st.st_size > config.MAX_MEDIA_BYTES:
        raise SourceError(413, f"{target.name} is larger than FormTxt reads.")
    try:
        parsed = tabular.parse(target.name, target.read_bytes(), sheet)
    except tabular.Unreadable as exc:
        raise SourceError(415, str(exc))
    return {"changed": True, "mtime": st.st_mtime, "bytes": st.st_size, "name": target.name, **parsed}
