import hashlib
import io
import re
import zipfile

from app.core import config
from app.core.ids import is_id
from app.services import objects_fonts, store, tabular

VIDEO = {"mp4": "video/mp4", "m4v": "video/mp4", "mov": "video/quicktime", "webm": "video/webm", "ogv": "video/ogg"}
AUDIO = {"mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg", "oga": "audio/ogg", "opus": "audio/ogg", "m4a": "audio/mp4", "aac": "audio/aac", "flac": "audio/flac"}
INLINE_TYPES = {**VIDEO, **AUDIO}
FONT_TYPES = objects_fonts.TYPES
TABLE_EXT = ("csv", "tsv", "txt", "xlsx")
MAX_BYTES = 200 * 1024 * 1024


class FileError(ValueError):
    pass


def _valid(ext: str, head: bytes) -> bool:
    if ext in ("mp4", "m4v", "mov", "m4a"):
        return head[4:8] == b"ftyp" or head[4:8] in (b"moov", b"mdat", b"free", b"wide")
    if ext == "webm":
        return head[:4] == b"\x1aE\xdf\xa3"
    if ext in ("ogv", "ogg", "oga", "opus"):
        return head[:4] == b"OggS"
    if ext == "mp3":
        return head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0)
    if ext == "wav":
        return head[:4] == b"RIFF" and head[8:12] == b"WAVE"
    if ext == "flac":
        return head[:4] == b"fLaC"
    if ext == "aac":
        return len(head) > 1 and head[0] == 0xFF and head[1] & 0xF0 == 0xF0 or head[:3] == b"ID3"
    return True


def classify(filename: str, data: bytes) -> tuple[str, str, str]:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    ext = re.sub(r"[^a-z0-9]", "", ext)[:8]
    if ext in VIDEO or ext in AUDIO:
        if not _valid(ext, data[:16]):
            raise FileError(f"{filename}: the file does not look like a real .{ext} file.")
        return ("video" if ext in VIDEO else "audio"), ext, INLINE_TYPES[ext]
    return "embed", ext or "bin", "application/octet-stream"


def _rows_preview(name: str, data: bytes) -> list[list[str]]:
    try:
        rows = tabular.parse(name, data)["rows"][:7]
    except (tabular.Unreadable, ValueError, KeyError):
        return []
    return [[str(c)[:40] for c in r[:6]] for r in rows]


def _pdf_preview(data: bytes) -> tuple[bytes | None, int]:
    try:
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(data)
        count = len(pdf)
        image = pdf[0].render(scale=0.7).to_pil().convert("RGB")
        image.thumbnail((420, 560))
        buf = io.BytesIO()
        image.save(buf, "PNG", optimize=True)
        return buf.getvalue(), count
    except Exception:
        return None, 0


def add(doc_id: str, filename: str, data: bytes) -> dict:
    if len(data) > MAX_BYTES:
        raise FileError(f"{filename}: files up to {MAX_BYTES // (1024 * 1024)} MB are supported.")
    if not data:
        raise FileError(f"{filename}: the file is empty.")
    kind, ext, mime = classify(filename, data)
    name = f"{hashlib.sha256(data).hexdigest()[:20]}.{ext}"
    store.add_media(doc_id, name, data)
    out: dict = {"name": name, "kind": kind, "type": mime, "bytes": len(data), "source": filename[:200]}
    if kind == "embed":
        if ext in TABLE_EXT:
            out["rows"] = _rows_preview(filename, data)
        elif ext == "pdf":
            png, pages = _pdf_preview(data)
            if png:
                thumb = f"{hashlib.sha256(png).hexdigest()[:20]}.png"
                store.add_media(doc_id, thumb, png)
                out["thumb"] = thumb
            if pages:
                out["pages"] = pages
    return out


def member(doc_id: str, name: str) -> bytes:
    if not is_id(doc_id, "d_") or "/" in name or "\\" in name or ".." in name:
        raise store.NotFound(name)
    path = config.documents_dir() / f"{doc_id}{store.EXT}"
    if not path.is_file():
        raise store.NotFound(doc_id)
    try:
        with zipfile.ZipFile(path) as z:
            return z.read(f"media/{name}")
    except (KeyError, zipfile.BadZipFile):
        raise store.NotFound(name)


def serve_type(name: str) -> tuple[str, bool]:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext in INLINE_TYPES:
        return INLINE_TYPES[ext], True
    if ext in FONT_TYPES:
        return FONT_TYPES[ext], True
    if ext == "png":
        return "image/png", True
    return "application/octet-stream", False


def byte_range(header: str, size: int) -> tuple[int, int] | None:
    m = re.fullmatch(r"bytes=(\d*)-(\d*)", (header or "").strip())
    if not m or (not m.group(1) and not m.group(2)):
        return None
    if m.group(1):
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else size - 1
    else:
        start = max(0, size - int(m.group(2)))
        end = size - 1
    end = min(end, size - 1)
    return (start, end) if 0 <= start <= end else None
