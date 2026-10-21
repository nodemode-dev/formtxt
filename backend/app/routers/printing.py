import json
import threading
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.core import config
from app.services import model, store
from app.services.printing import pdf_to_document, render_pdf

router = APIRouter(tags=["printing"])
_lock = threading.Lock()


def _name(title: str) -> str:
    return "".join(c for c in title if c.isalnum() or c in " -_").strip() or "document"


def _pdf(doc: dict, media: dict[str, bytes], tagged: bool, download: bool) -> Response:
    try:
        model.validate(doc)
        with _lock:
            data, info = render_pdf(doc, media, tagged)
    except model.InvalidDocument as exc:
        raise HTTPException(422, str(exc))
    headers = {
        "x-formtxt-pages": str(info["pages"]),
        "x-formtxt-notes": json.dumps(info["warnings"])[:3000],
        "x-formtxt-tagged": json.dumps(info["tagged"]),
        "content-disposition": f'{"attachment" if download else "inline"}; filename="{_name(doc.get("title", ""))}.pdf"',
        "cache-control": "no-store",
    }
    return Response(data, media_type="application/pdf", headers=headers)


@router.get("/documents/{doc_id}/export.pdf")
def export_saved(doc_id: str, tagged: bool = True, download: bool = True) -> Response:
    try:
        doc, media = store.load(doc_id)
    except store.NotFound:
        raise HTTPException(404, f"No document has the id {doc_id}. List documents with GET /api/documents.")
    return _pdf(doc, media, tagged, download)


@router.post("/print/export.pdf")
def export_current(doc: dict, tagged: bool = True, download: bool = True) -> Response:
    media: dict[str, bytes] = {}
    try:
        media = store.load(str(doc.get("id", "")))[1]
    except store.NotFound:
        media = {}
    return _pdf(doc, media, tagged, download)


def _open(data: bytes, name: str) -> dict:
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "This PDF is larger than FormTxt opens.")
    if b"%PDF" not in data[:1024]:
        raise HTTPException(415, "This file is not a PDF.")
    try:
        with _lock:
            doc, media, info = pdf_to_document(data, name)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    saved = store.adopt(doc, media)
    return {"document": model.summary(saved), "report": info}


@router.post("/print/open-pdf")
async def open_pdf(file: UploadFile = File(...)) -> dict:
    return _open(await file.read(config.MAX_UPLOAD_BYTES + 1), file.filename or "document.pdf")


class PdfPath(BaseModel):
    path: str


@router.post("/print/open-pdf-path")
def open_pdf_path(body: PdfPath, request: Request) -> dict:
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1", "localhost", "testclient"):
        raise HTTPException(403, "Only this computer can open a PDF by its path.")
    target = Path(body.path).expanduser()
    if not target.is_file() or target.suffix.lower() != ".pdf":
        raise HTTPException(404, f"No PDF file is at {body.path}.")
    return _open(target.read_bytes(), target.name)
