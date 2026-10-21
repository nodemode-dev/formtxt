from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.core import config
from app.services import model, package, store

router = APIRouter(prefix="/documents", tags=["documents"])


class NewDocument(BaseModel):
    title: str = ""
    size: str = "letter"


def _missing(doc_id: str) -> HTTPException:
    return HTTPException(404, f"No document has the id {doc_id}. List documents with GET /api/documents.")


@router.get("")
def listing() -> dict:
    return {"documents": store.listing()}


@router.get("/trash")
def trash_listing() -> dict:
    return {"documents": store.trashed()}


@router.post("")
def create(body: NewDocument) -> dict:
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
def save(doc_id: str, doc: dict) -> dict:
    if doc.get("id") != doc_id:
        raise HTTPException(422, "The document's id does not match the address it was saved to.")
    try:
        return store.save(doc)
    except model.InvalidDocument as exc:
        raise HTTPException(422, str(exc))


@router.get("/{doc_id}/download")
def download(doc_id: str) -> Response:
    try:
        doc, media = store.load(doc_id)
    except store.NotFound:
        raise _missing(doc_id)
    name = "".join(c for c in doc["title"] if c.isalnum() or c in " -_").strip() or "document"
    return Response(package.pack(doc, media), media_type=package.MIMETYPE,
                    headers={"content-disposition": f'attachment; filename="{name}.ftxt"'})


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
    return {"ok": True}
