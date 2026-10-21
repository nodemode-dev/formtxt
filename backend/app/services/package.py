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


def unpack(data: bytes) -> tuple[dict, dict[str, bytes]]:
    if len(data) > config.MAX_DOCUMENT_BYTES:
        raise model.InvalidDocument("file is larger than FormTxt opens")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise model.InvalidDocument("not a .ftxt package") from exc
    with z:
        names = set(z.namelist())
        if "mimetype" not in names or z.read("mimetype").decode("ascii", "replace").strip() != MIMETYPE or DOCUMENT not in names:
            raise model.InvalidDocument("not a .ftxt package")
        doc = model.validate(json.loads(z.read(DOCUMENT).decode("utf-8")))
        media = {n[len("media/"):]: z.read(n) for n in names if n.startswith("media/") and not n.endswith("/") and ".." not in n}
    return doc, media
