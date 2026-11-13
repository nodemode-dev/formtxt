import asyncio

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core import config
from app.services import tabular

router = APIRouter(prefix="/data", tags=["data"])


@router.post("/parse")
async def parse(files: list[UploadFile] = File(...), sheet: str = Form("")) -> dict:
    file = files[0]
    data = await file.read(config.MAX_MEDIA_BYTES + 1)
    if len(data) > config.MAX_MEDIA_BYTES:
        raise HTTPException(413, f"{file.filename}: data files up to {config.MAX_MEDIA_BYTES // (1024 * 1024)} MB are supported.")
    try:
        return await asyncio.to_thread(tabular.parse, file.filename or "", data, sheet)
    except tabular.Unreadable as exc:
        raise HTTPException(415, str(exc))
