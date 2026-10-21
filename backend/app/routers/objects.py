import asyncio

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core import config
from app.services import objects_files, objects_fonts, objects_source, objects_video, store

router = APIRouter(prefix="/objects", tags=["objects"])

SAFE_HEADERS = {"x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox"}


@router.get("/fonts")
def fonts() -> dict:
    return {"fonts": objects_fonts.listing()}


@router.post("/fonts")
async def add_fonts(files: list[UploadFile] = File(...), family: str = Form("")) -> dict:
    added, errors = [], []
    for f in files:
        data = await f.read(objects_fonts.MAX_FONT_BYTES + 1)
        try:
            added.append(objects_fonts.add(data, f.filename or "font", family if len(files) == 1 else ""))
        except objects_fonts.FontError as exc:
            errors.append(str(exc))
    if not added and errors:
        raise HTTPException(415, " ".join(errors))
    return {"fonts": added, "errors": errors}


@router.get("/fonts/{name}")
def font_file(name: str) -> Response:
    try:
        data, mime = objects_fonts.read(name)
    except (FileNotFoundError, OSError):
        raise HTTPException(404, f"No font file is named {name}.")
    return Response(data, media_type=mime, headers={"cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff"})


@router.delete("/fonts/{name}")
def remove_font(name: str) -> dict:
    if not objects_fonts.remove(name):
        raise HTTPException(404, f"No font file is named {name}.")
    return {"ok": True}


class Families(BaseModel):
    families: list[str] = Field(default_factory=list, max_length=60)


@router.post("/{doc_id}/embed-fonts")
def embed_fonts(doc_id: str, body: Families) -> dict:
    out = []
    for meta in objects_fonts.for_families(body.families):
        data, _ = objects_fonts.read(meta["file"])
        try:
            store.add_media(doc_id, meta["file"], data)
        except store.NotFound:
            raise HTTPException(404, f"No document has the id {doc_id}.")
        out.append({"family": meta["family"], "weight": meta["weight"], "style": meta["style"], "media": meta["file"], "bytes": meta["bytes"]})
    return {"fonts": out}


@router.post("/{doc_id}/files")
async def add_files(doc_id: str, files: list[UploadFile] = File(...)) -> dict:
    added, errors = [], []
    for f in files:
        data = await f.read(objects_files.MAX_BYTES + 1)
        try:
            added.append(await asyncio.to_thread(objects_files.add, doc_id, f.filename or "file", data))
        except objects_files.FileError as exc:
            errors.append(str(exc))
        except store.NotFound:
            raise HTTPException(404, f"No document has the id {doc_id}.")
    if not added and errors:
        raise HTTPException(415, " ".join(errors))
    return {"files": added, "errors": errors}


@router.get("/{doc_id}/file/{name}")
def get_file(doc_id: str, name: str, request: Request, download: str = "") -> Response:
    try:
        data = objects_files.member(doc_id, name)
    except store.NotFound:
        raise HTTPException(404, f"No file named {name} is in document {doc_id}.")
    mime, inline = objects_files.serve_type(name)
    headers = {**SAFE_HEADERS, "cache-control": "private, max-age=31536000, immutable", "accept-ranges": "bytes"}
    if not inline or download:
        label = (download or name).replace('"', "").replace("\\", "")[:150]
        headers["content-disposition"] = f'attachment; filename="{label}"'
        mime = "application/octet-stream" if not inline else mime
    span = objects_files.byte_range(request.headers.get("range", ""), len(data)) if inline else None
    if span:
        start, end = span
        headers["content-range"] = f"bytes {start}-{end}/{len(data)}"
        return Response(data[start:end + 1], status_code=206, media_type=mime, headers=headers)
    return Response(data, media_type=mime, headers=headers)


class VideoLink(BaseModel):
    url: str = Field(max_length=600)


@router.post("/{doc_id}/online-video")
async def online_video(doc_id: str, body: VideoLink) -> dict:
    try:
        return await asyncio.to_thread(objects_video.fetch, doc_id, body.url)
    except objects_video.VideoError as exc:
        raise HTTPException(exc.status, str(exc))
    except store.NotFound:
        raise HTTPException(404, f"No document has the id {doc_id}.")


class SourceRequest(BaseModel):
    path: str = Field(max_length=1000)
    sheet: str = Field("", max_length=200)
    mtime: float | None = None


@router.post("/chart-source")
def chart_source(body: SourceRequest) -> dict:
    try:
        return objects_source.read(body.path, body.sheet, body.mtime)
    except objects_source.SourceError as exc:
        raise HTTPException(exc.status, str(exc))


@router.get("/library")
def library() -> dict:
    return {"files": objects_source.library_files()}


@router.post("/library")
async def library_add(files: list[UploadFile] = File(...)) -> dict:
    added, errors = [], []
    for f in files:
        data = await f.read(config.MAX_MEDIA_BYTES + 1)
        try:
            added.append(objects_source.library_add(f.filename or "data.csv", data))
        except objects_source.SourceError as exc:
            errors.append(str(exc))
    if not added and errors:
        raise HTTPException(415, " ".join(errors))
    return {"files": added, "errors": errors}
