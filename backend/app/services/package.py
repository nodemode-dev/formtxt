import io
import json
import zipfile

from app.core import config
from app.services import model

MIMETYPE = "application/x-formtxt"
DOCUMENT = "document.json"


def pack(doc: dict, media: dict[str, bytes] | None = None) -> bytes:
    model.validate(doc)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), MIMETYPE, compress_type=zipfile.ZIP_STORED)
        z.writestr(DOCUMENT, json.dumps(doc, ensure_ascii=False, separators=(",", ":")), compress_type=zipfile.ZIP_DEFLATED)
        for name, data in (media or {}).items():
            z.writestr(f"media/{name}", data, compress_type=zipfile.ZIP_STORED)
    return buf.getvalue()


def referenced(doc: dict) -> set[str]:
    names: set[str] = set()
    stack: list = [doc.get("tabs") or [], (doc.get("settings") or {}).get("embeddedFonts") or []]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            if item.get("type") in ("image", "video", "audio", "embed", "onlineVideo") or "family" in item:
                for key in ("media", "thumb", "poster"):
                    if isinstance(item.get(key), str):
                        names.add(item[key])
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return names


def prune(doc: dict, media: dict[str, bytes] | None) -> tuple[dict, dict[str, bytes]]:
    keep = referenced(doc)
    kept = {k: v for k, v in (media or {}).items() if k in keep}
    out = dict(doc)
    if isinstance(doc.get("media"), dict):
        out["media"] = {k: v for k, v in doc["media"].items() if k in keep}
    return out, kept


def unpack(data: bytes) -> tuple[dict, dict[str, bytes]]:
    if len(data) > config.MAX_DOCUMENT_BYTES:
        raise model.InvalidDocument("file is larger than FormTxt opens")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise model.InvalidDocument("not a .ftxt package") from exc
    with z:
        names = set(z.namelist())
        if sum(i.file_size for i in z.infolist()) > config.MAX_DOCUMENT_BYTES:
            raise model.InvalidDocument("file is larger than FormTxt opens")
        if "mimetype" not in names or z.read("mimetype").decode("ascii", "replace").strip() != MIMETYPE or DOCUMENT not in names:
            raise model.InvalidDocument("not a .ftxt package")
        doc = model.validate(json.loads(z.read(DOCUMENT).decode("utf-8")))
        media = {n[len("media/"):]: z.read(n) for n in names if n.startswith("media/") and not n.endswith("/") and ".." not in n}
    return doc, media
