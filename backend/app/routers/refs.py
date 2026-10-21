import asyncio

from fastapi import APIRouter, HTTPException

from app.services import refs

router = APIRouter(tags=["refs"])


@router.get("/refs/link-title")
async def link_title(url: str) -> dict:
    try:
        return await asyncio.to_thread(refs.page_info, url)
    except refs.RefsError as e:
        raise HTTPException(e.status, str(e))
