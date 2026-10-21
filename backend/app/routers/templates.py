from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.core import config
from app.services import store, thumbs
from app.services.templates import catalog, generator, user

router = APIRouter(prefix="/templates", tags=["templates"])
SVG = {"cache-control": "no-cache"}


class SaveTemplate(BaseModel):
    document: str
    name: str = ""
    description: str = ""


def _doc(tid: str) -> tuple[dict, dict]:
    if tid in catalog.BY_ID:
        return generator.build(catalog.BY_ID[tid]), {}
    try:
        return user.load(tid)
    except user.NotFound:
        raise HTTPException(404, f"No template has the id {tid}. List templates with GET /api/templates.")


@router.get("")
def listing() -> dict:
    mine = user.listing()
    cats = catalog.CATEGORIES + ([user.CATEGORY] if mine else [])
    return {"categories": cats, "templates": [catalog.summary(t) for t in catalog.TEMPLATES] + mine}


@router.get("/{tid}")
def read(tid: str) -> dict:
    return _doc(tid)[0]


@router.get("/{tid}/preview.svg")
def preview(tid: str) -> Response:
    return Response(thumbs.render(_doc(tid)[0]), media_type="image/svg+xml", headers=SVG)


@router.post("")
def save(body: SaveTemplate) -> dict:
    try:
        doc, media = store.load(body.document)
    except store.NotFound:
        raise HTTPException(404, f"No document has the id {body.document}.")
    return user.save(doc, media, body.name or doc["title"], body.description)


@router.delete("/{tid}")
def delete(tid: str) -> dict:
    if tid in catalog.BY_ID:
        raise HTTPException(409, "Built-in templates cannot be deleted.")
    try:
        user.delete(tid)
    except user.NotFound:
        raise HTTPException(404, f"No saved template has the id {tid}.")
    return {"ok": True}


def instantiate(tid: str, title: str) -> dict:
    doc, media = _doc(tid)
    author = str(config.read_settings().get("author") or "")
    if author:
        doc.setdefault("meta", {})["author"] = author
    return store.adopt(doc, media, title or doc["title"])
