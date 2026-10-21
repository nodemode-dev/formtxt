from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.core import config
from app.services import exchange, model, store
from app.services.exchange import common

router = APIRouter(tags=["exchange"])


def _reply(doc: dict, media: dict[str, bytes], fmt: str) -> Response:
    try:
        data, mime, name = exchange.export(doc, media, fmt)
    except common.Unsupported as exc:
        raise HTTPException(415, str(exc)) from exc
    ascii_name = name.encode("ascii", "ignore").decode() or f"document.{fmt}"
    disposition = f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"
    return Response(data, media_type=mime.split(";")[0], headers={"Content-Disposition": disposition, "Cache-Control": "no-store"})


def _stored(doc_id: str) -> tuple[dict, dict[str, bytes]]:
    try:
        return store.load(doc_id)
    except store.NotFound as exc:
        raise HTTPException(404, f"No document with the id {doc_id}.") from exc


@router.get("/exchange/formats")
def formats() -> dict:
    return {
        "export": [{"id": k, "label": v[0], "mime": v[1]} for k, v in exchange.FORMATS.items()],
        "import": sorted(exchange.READABLE),
    }


@router.get("/documents/{doc_id}/export")
def export_saved(doc_id: str, format: str = "docx") -> Response:
    doc, media = _stored(doc_id)
    return _reply(doc, media, format)


@router.post("/documents/{doc_id}/export")
def export_live(doc_id: str, doc: dict, format: str = "docx") -> Response:
    _, media = _stored(doc_id)
    try:
        model.validate(doc)
    except model.InvalidDocument as exc:
        raise HTTPException(422, str(exc)) from exc
    return _reply(doc, media, format)


@router.post("/exchange/import")
async def import_files(files: list[UploadFile] = File(...)) -> dict:
    made, errors = [], []
    for f in files:
        name = f.filename or "document.txt"
        data = await f.read(config.MAX_UPLOAD_BYTES + 1)
        if len(data) > config.MAX_UPLOAD_BYTES:
            errors.append(f"{name}: larger than FormTxt opens")
            continue
        try:
            doc, media = exchange.read(name, data)
            made.append(model.summary(store.adopt(doc, media)))
        except common.Unsupported as exc:
            errors.append(str(exc))
        except model.InvalidDocument as exc:
            errors.append(f"{name}: {exc}")
    if not made and errors:
        raise HTTPException(415, " ".join(errors))
    return {"documents": made, "errors": errors}
