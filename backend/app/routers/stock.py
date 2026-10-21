import asyncio
import hashlib

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core import config
from app.routers.documents import _sniff
from app.services import stock, store

router = APIRouter(tags=["stock"])


def _guard() -> None:
    if config.read_settings().get("stockImages") is False:
        raise HTTPException(403, "Stock picture search is turned off in Preferences.")


@router.get("/stock/sources")
def sources() -> dict:
    return {"enabled": config.read_settings().get("stockImages") is not False, "sources": stock.sources()}


@router.get("/stock/search")
async def search(q: str, source: str = "openverse", page: int = 1, per: int = 24) -> dict:
    _guard()
    try:
        return await asyncio.to_thread(stock.search, source, q, page, per)
    except stock.StockError as e:
        raise HTTPException(e.status, str(e))


@router.get("/stock/thumb/{source}/{item_id}")
async def thumb(source: str, item_id: str) -> Response:
    _guard()
    try:
        data, ctype = await asyncio.to_thread(stock.thumb, source, item_id)
    except stock.StockError as e:
        raise HTTPException(e.status, str(e))
    if not _sniff(data) or _sniff(data)[0] == "svg":
        raise HTTPException(415, "The preview is not a picture.")
    return Response(data, media_type=ctype, headers={"cache-control": "private, max-age=3600", "content-security-policy": "default-src 'none'"})


class Pick(BaseModel):
    source: str = Field(max_length=20)
    id: str = Field(max_length=80)


@router.post("/documents/{doc_id}/media/stock")
async def add_stock(doc_id: str, body: Pick) -> dict:
    _guard()
    try:
        data, credit = await asyncio.to_thread(stock.download, body.source, body.id)
    except stock.StockError as e:
        raise HTTPException(e.status, str(e))
    kind = _sniff(data)
    if not kind or kind[0] == "svg":
        raise HTTPException(415, "The service sent something that is not a PNG, JPEG, GIF, WebP or BMP picture.")
    if len(data) > config.MAX_MEDIA_BYTES:
        raise HTTPException(413, f"Pictures up to {config.MAX_MEDIA_BYTES // (1024 * 1024)} MB are supported.")
    name = f"{hashlib.sha256(data).hexdigest()[:20]}.{kind[0]}"
    try:
        await asyncio.to_thread(store.add_media, doc_id, name, data)
    except store.NotFound:
        raise HTTPException(404, "That document is not in the library.")
    return {"media": {"name": name, "type": kind[1], "bytes": len(data), "source": credit["sourceUrl"][:200]}, "credit": {**credit, "text": stock.credit_text(credit)}}
