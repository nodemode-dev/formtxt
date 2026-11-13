import asyncio
import hashlib
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.core import config
from app.routers import templates
from app.services import exchange, intake, model, package, store, thumbs, versions

router = APIRouter(prefix="/documents", tags=["documents"])


class NewDocument(BaseModel):
    title: str = ""
    size: str = "letter"
    template: str = ""


def _missing(doc_id: str) -> HTTPException:
    return HTTPException(404, f"No document has the id {doc_id}. List documents with GET /api/documents.")


@router.get("")
def listing() -> dict:
    return {"documents": store.listing()}


@router.get("/trash")
def trash_listing() -> dict:
    return {"documents": store.trashed()}


@router.delete("/trash")
def empty_trash() -> dict:
    return {"ok": True, "deleted": store.empty_trash()}


@router.delete("/trash/{doc_id}")
def purge(doc_id: str) -> dict:
    try:
        store.purge(doc_id)
    except store.NotFound:
        raise HTTPException(404, f"No document with the id {doc_id} is in the trash.")
    return {"ok": True}


def _import_one(name: str, data: bytes) -> dict:
    if exchange.handles(name):
        doc, media = exchange.read(name, data)
    else:
        doc, media = intake.to_document(name or "document.txt", data), None
    return model.summary(store.adopt(doc, media))


@router.post("/import")
async def import_files(files: list[UploadFile] = File(...)) -> dict:
    made, errors = [], []
    for f in files:
        data = await f.read(config.MAX_UPLOAD_BYTES + 1)
        if len(data) > config.MAX_UPLOAD_BYTES:
            errors.append(f"{f.filename}: larger than FormTxt opens")
            continue
        try:
            made.append(await asyncio.to_thread(_import_one, f.filename or "", data))
        except (intake.Unsupported, exchange.Unsupported) as exc:
            errors.append(str(exc))
            continue
        except Exception as exc:
            errors.append(f"{f.filename}: FormTxt could not read this file ({exc}).")
    if not made and errors:
        raise HTTPException(415, " ".join(errors))
    return {"documents": made, "errors": errors}


@router.post("")
def create(body: NewDocument) -> dict:
    if body.template:
        return templates.instantiate(body.template, body.title)
    if body.size not in model.PAGE_SIZES:
        raise HTTPException(422, f"Unknown page size {body.size}. Use one of {', '.join(model.PAGE_SIZES)}.")
    author = str(config.read_settings().get("author") or "")
    return store.create(body.title, author, body.size)


@router.get("/{doc_id}")
def read(doc_id: str) -> dict:
    try:
        return store.load(doc_id)[0]
    except store.NotFound:
        raise _missing(doc_id)


@router.put("/{doc_id}")
def save(doc_id: str, doc: dict, by: str = "") -> dict:
    if doc.get("id") != doc_id:
        raise HTTPException(422, "The document's id does not match the address it was saved to.")
    versions.set_editor_hint(by)
    try:
        return store.save(doc)
    except model.InvalidDocument as exc:
        raise HTTPException(422, str(exc))
    except store.Conflict:
        raise HTTPException(409, "This document is in the trash. Restore it from the trash to keep editing it.")
    finally:
        versions.set_editor_hint("")


@router.get("/{doc_id}/download")
def download(doc_id: str) -> Response:
    try:
        doc, media = store.load(doc_id)
    except store.NotFound:
        raise _missing(doc_id)
    name = "".join(c for c in doc["title"] if c.isalnum() or c in " -_").strip() or "document"
    doc, media = package.prune(doc, media)
    return Response(package.pack(doc, media), media_type=package.MIMETYPE,
                    headers={"content-disposition": f'attachment; filename="{name.encode("ascii", "ignore").decode().strip() or "document"}.ftxt"; filename*=UTF-8\'\'{quote(name + ".ftxt")}'})


@router.get("/{doc_id}/thumb.svg")
def thumb(doc_id: str) -> Response:
    try:
        doc = store.load(doc_id)[0]
    except store.NotFound:
        raise _missing(doc_id)
    return Response(thumbs.render(doc), media_type="image/svg+xml", headers={"cache-control": "no-cache"})


IMAGE_TYPES = {b"\x89PNG\r\n\x1a\n": ("png", "image/png"), b"\xff\xd8\xff": ("jpg", "image/jpeg"), b"GIF87a": ("gif", "image/gif"),
               b"GIF89a": ("gif", "image/gif"), b"BM": ("bmp", "image/bmp")}
MEDIA_TYPES = {"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif", "bmp": "image/bmp", "webp": "image/webp", "svg": "image/svg+xml"}


def _sniff(data: bytes) -> tuple[str, str] | None:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    head = data[:512].lstrip().lower()
    if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in data[:2048].lower()):
        return "svg", "image/svg+xml"
    for magic, kind in IMAGE_TYPES.items():
        if data.startswith(magic):
            return kind
    return None


@router.post("/{doc_id}/media")
async def add_media(doc_id: str, files: list[UploadFile] = File(...)) -> dict:
    added, errors = [], []
    for f in files:
        data = await f.read(config.MAX_MEDIA_BYTES + 1)
        if len(data) > config.MAX_MEDIA_BYTES:
            errors.append(f"{f.filename}: pictures up to {config.MAX_MEDIA_BYTES // (1024 * 1024)} MB are supported.")
            continue
        kind = _sniff(data)
        if not kind:
            errors.append(f"{f.filename}: not a PNG, JPEG, GIF, WebP, BMP or SVG picture.")
            continue
        name = f"{hashlib.sha256(data).hexdigest()[:20]}.{kind[0]}"
        try:
            await asyncio.to_thread(store.add_media, doc_id, name, data)
        except store.NotFound:
            raise _missing(doc_id)
        added.append({"name": name, "type": kind[1], "bytes": len(data), "source": (f.filename or "")[:200]})
    return {"media": added, "errors": errors}


@router.get("/{doc_id}/media/{name}")
def media(doc_id: str, name: str) -> Response:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in MEDIA_TYPES or "/" in name or ".." in name:
        raise HTTPException(404, f"No picture is named {name}.")
    try:
        data = store.media_file(doc_id, name)
    except store.NotFound:
        raise HTTPException(404, f"No picture named {name} is in document {doc_id}.")
    return Response(data, media_type=MEDIA_TYPES[ext], headers={"cache-control": "private, max-age=31536000, immutable",
                                                                 "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
                                                                 "x-content-type-options": "nosniff"})


@router.post("/{doc_id}/duplicate")
def duplicate(doc_id: str) -> dict:
    try:
        return model.summary(store.duplicate(doc_id))
    except store.NotFound:
        raise _missing(doc_id)


@router.delete("/{doc_id}")
def trash(doc_id: str) -> dict:
    try:
        store.trash(doc_id)
    except store.NotFound:
        raise _missing(doc_id)
    return {"ok": True}


@router.post("/{doc_id}/restore")
def restore(doc_id: str) -> dict:
    try:
        store.restore(doc_id)
    except store.NotFound:
        raise HTTPException(404, f"No document with the id {doc_id} is in the trash.")
    except store.Conflict:
        raise HTTPException(409, f"A document with the id {doc_id} is already in the library, so the trashed copy was left in the trash.")
    return {"ok": True}
