from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import review, store

router = APIRouter(prefix="/review", tags=["review"])


class CompareBody(BaseModel):
    other: str
    base: dict | None = None
    baseId: str = ""
    mode: str = "compare"
    author: str = ""
    title: str = ""


def _load(doc_id: str) -> tuple[dict, dict]:
    try:
        return store.load(doc_id)
    except store.NotFound:
        raise HTTPException(404, f"No document has the id {doc_id}. List documents with GET /api/documents.")


@router.get("/{doc_id}")
def summary(doc_id: str) -> dict:
    doc, _ = _load(doc_id)
    comments = doc.get("comments") or {}
    return {
        "id": doc["id"],
        "trackChanges": bool((doc.get("settings") or {}).get("trackChanges")),
        "comments": len(comments),
        "openComments": sum(1 for c in comments.values() if isinstance(c, dict) and not c.get("resolved")),
        "changes": review.tracked_changes(doc),
    }


@router.post("/compare")
def compare(body: CompareBody) -> dict:
    if body.mode not in ("compare", "suggest", "combine"):
        raise HTTPException(400, "mode must be compare, suggest or combine")
    other, other_media = _load(body.other)
    if body.base is not None:
        base, base_media = body.base, {}
        if body.baseId:
            base_media = _load(body.baseId)[1]
    elif body.baseId:
        base, base_media = _load(body.baseId)
    else:
        raise HTTPException(400, "give base (a document) or baseId")
    if base.get("id") == other.get("id") and body.mode == "compare":
        raise HTTPException(400, "Pick a different document to compare with.")
    result, changes = review.compare(base, other, body.author, body.mode == "combine")
    if body.mode != "compare":
        return {"document": result, "changes": changes}
    title = body.title.strip() or f"Comparison of {base.get('title', 'document')} and {other.get('title', 'document')}"
    media = {**other_media, **base_media}
    saved = store.adopt(result, media, title)
    return {"id": saved["id"], "title": saved["title"], "changes": changes}
