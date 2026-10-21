import asyncio
import hashlib
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.routers.documents import _sniff
from app.core import config
from app.services import store
from app.services.ai import AIError, providers, settings, tasks, text, translate

router = APIRouter(tags=["ai"])


def _fail(e: AIError) -> HTTPException:
    return HTTPException(e.status, str(e))


async def _run(fn, *args):
    try:
        return await asyncio.to_thread(fn, *args)
    except AIError as e:
        raise _fail(e)


@router.get("/ai/status")
def status() -> dict:
    return settings.public(settings.load())


class SettingsBody(BaseModel):
    enabled: bool | None = None
    provider: str | None = Field(default=None, max_length=20)
    model: str | None = Field(default=None, max_length=120)
    baseUrl: str | None = Field(default=None, max_length=300)
    key: str | None = Field(default=None, max_length=400)
    clearKey: bool = False
    imageModel: str | None = Field(default=None, max_length=120)
    imageBaseUrl: str | None = Field(default=None, max_length=300)
    imageKey: str | None = Field(default=None, max_length=400)
    clearImageKey: bool = False
    effort: str | None = Field(default=None, max_length=20)


@router.post("/ai/settings")
def save_settings(body: SettingsBody) -> dict:
    try:
        return settings.public(settings.save(body.model_dump(exclude_none=True)))
    except AIError as e:
        raise _fail(e)


class CompleteBody(BaseModel):
    task: str = Field(max_length=20)
    instruction: str = Field(default="", max_length=20000)
    text: str = Field(default="", max_length=400000)
    mode: str = Field(default="", max_length=20)
    language: str = Field(default="", max_length=60)
    selection: bool = False
    sources: list[str] = Field(default_factory=list, max_length=12)
    files: list[dict] = Field(default_factory=list, max_length=8)
    history: list[dict] = Field(default_factory=list, max_length=24)
    model: str = Field(default="", max_length=120)
    effort: str = Field(default="", max_length=20)


@router.post("/ai/complete")
async def complete(body: CompleteBody) -> dict:
    return await _run(tasks.run, body.model_dump())


@router.post("/ai/test")
async def test() -> dict:
    return await _run(tasks.run, {"task": "define", "text": "test", "instruction": "Reply with the single word OK.", "effort": "fast"})


class ReviseBody(BaseModel):
    instruction: str = Field(max_length=4000)
    paragraphs: list[str] = Field(max_length=600)
    model: str = Field(default="", max_length=120)
    effort: str = Field(default="", max_length=20)


@router.post("/ai/revise")
async def revise(body: ReviseBody) -> dict:
    return await _run(tasks.revise, body.model_dump())


class TranslateBody(BaseModel):
    language: str = Field(max_length=60)
    languageCode: str = Field(default="", max_length=20)
    docId: str = Field(default="", max_length=60)
    doc: dict | None = None
    model: str = Field(default="", max_length=120)
    effort: str = Field(default="", max_length=20)


@router.post("/ai/translate")
async def translate_document(body: TranslateBody) -> dict:
    return await _run(translate.document, body.model_dump())


class ImageBody(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    documentId: str = Field(max_length=60)
    size: str = Field(default="1024x1024", max_length=12)


def _generate(body: ImageBody) -> dict:
    s = settings.require_enabled()
    target = settings.image_target(s)
    if target is None:
        raise AIError(501, "This provider has no image endpoint. Use Insert > Stock images, or point the image address in AI settings at an OpenAI-compatible provider.")
    if not re.fullmatch(r"\d{3,4}x\d{3,4}", body.size):
        raise AIError(400, "The size must look like 1024x1024.")
    data, revised = providers.image(target[0], target[1], s["imageModel"], body.prompt.strip(), body.size)
    kind = _sniff(data)
    if not kind or kind[0] == "svg":
        raise AIError(502, "The provider sent something that is not a PNG, JPEG, GIF, WebP or BMP picture.")
    if len(data) > config.MAX_MEDIA_BYTES:
        raise AIError(413, f"Pictures up to {config.MAX_MEDIA_BYTES // (1024 * 1024)} MB are supported.")
    name = f"{hashlib.sha256(data).hexdigest()[:20]}.{kind[0]}"
    try:
        store.add_media(body.documentId, name, data)
    except store.NotFound:
        raise AIError(404, "That document is not in the library.")
    return {"media": {"name": name, "type": kind[1], "bytes": len(data), "source": "AI generated"}, "revisedPrompt": revised}


@router.post("/ai/image")
async def image(body: ImageBody) -> dict:
    return await _run(_generate, body)


@router.get("/ai/library")
async def library(q: str = "", limit: int = 20, skip: str = "") -> dict:
    rows = await asyncio.to_thread(text.search, q[:200], max(1, min(50, limit)), skip)
    return {"query": q, "results": [{k: v for k, v in r.items() if k != "score"} for r in rows]}


@router.get("/ai/library/{doc_id}/text")
def library_text(doc_id: str, limit: int = 20000) -> dict:
    try:
        title, body = text.library_doc(doc_id, max(100, min(200000, limit)))
    except (LookupError, store.NotFound):
        raise HTTPException(404, f"No document has the id {doc_id}.")
    return {"id": doc_id, "title": title, "text": body}
