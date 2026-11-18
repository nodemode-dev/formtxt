import asyncio
import os
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.routers import mcp, printing
from app.services import agents, exchange, package, store, tabular, versions_docs as docs
from app.services.exchange import common

router = APIRouter(prefix="/reports", tags=["reports"])


class Source(BaseModel):
    path: str = Field("", max_length=4096)
    sql: str = Field("", max_length=20000)
    records: list[dict] | None = Field(None, max_length=2000)


class Report(BaseModel):
    template: str = Field(..., min_length=1, max_length=80)
    data: Source
    mode: Literal["pages", "list"] = "list"
    groupBy: str = Field("", max_length=200)
    format: Literal["pdf", "docx", "ftxt"] = "pdf"
    out: str = Field("", max_length=4096)
    overwrite: bool = False
    title: str = Field("", max_length=200)


def _records(data: Source) -> list[dict]:
    if data.records is not None and data.path:
        raise HTTPException(422, "Give the data as a database query (path and sql) or as records, not both.")
    if data.records is not None:
        return [{str(k): "" if v is None else str(v) for k, v in r.items()} for r in data.records]
    if not data.path or not data.sql.strip():
        raise HTTPException(422, "Give the data as path and sql (one SELECT on a SQLite file) or as records.")
    try:
        rows = tabular.sqlite_rows(data.path, data.sql)["rows"]
    except tabular.Unreadable as exc:
        raise HTTPException(422, str(exc))
    head, body = rows[0], rows[1:]
    return [dict(zip(head, row)) for row in body]


def _target(out: str, fmt: str, overwrite: bool) -> Path | None:
    if not out.strip():
        return None
    path = Path(out.strip()).expanduser()
    if not path.is_absolute():
        raise HTTPException(422, "out needs a full path, such as /Users/me/invoice.pdf.")
    if path.suffix.lower() != f".{fmt}":
        raise HTTPException(422, f"out must end in .{fmt} to match format {fmt}.")
    if not path.parent.is_dir():
        raise HTTPException(422, f"The folder {path.parent} does not exist.")
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise HTTPException(409, f"{path} is not a plain file, so the report was not written.")
    if path.exists() and not overwrite:
        raise HTTPException(409, f"{path} already exists. Send overwrite true to replace it, or choose another name.")
    return path


def _export(doc: dict, media: dict[str, bytes], fmt: str) -> bytes:
    if fmt == "pdf":
        return bytes(printing._pdf(doc, media, True, True).body)
    if fmt == "docx":
        try:
            return exchange.export(doc, media, "docx")[0]
        except common.Unsupported as exc:
            raise HTTPException(415, str(exc)) from exc
    return package.pack(*package.prune(doc, media))


def _write(path: Path, data: bytes, overwrite: bool) -> None:
    try:
        if not overwrite:
            with open(path, "xb") as fh:
                fh.write(data)
            return
        mode = path.stat().st_mode & 0o777 if path.is_file() else 0o644
        fd, tmp = tempfile.mkstemp(prefix=".formtxt-report-", dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(data)
            os.chmod(tmp, mode)
            os.replace(tmp, path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
    except FileExistsError:
        raise HTTPException(409, f"{path} already exists. Send overwrite true to replace it, or choose another name.")
    except OSError as exc:
        raise HTTPException(422, f"The report was not written to {path}: {exc.strerror or exc}")


def _run(body: Report) -> dict:
    target = _target(body.out, body.format, body.overwrite)
    try:
        template, _ = store.load(body.template)
    except store.NotFound:
        raise HTTPException(404, f"No document has the id {body.template}. List documents with GET /api/documents.")
    records = _records(body.data)
    title = body.title or f"{template.get('title', 'Report')} (report)"
    try:
        made = docs.merge(body.template, template, "", records, title, body.mode, body.groupBy)
    except (ValueError, store.NotFound) as exc:
        raise HTTPException(422, str(exc))
    written = ""
    if target is not None:
        doc, media = store.load(made["id"])
        _write(target, _export(doc, media, body.format), body.overwrite)
        written = str(target)
    used = min(len(records), 2000 if body.mode == "list" else 1000)
    return {"id": made["id"], "title": made["title"], "records": used, "file": written}


@router.post("/run")
async def run(body: Report, request: Request) -> dict:
    refusal = await mcp.consent(agents.is_inapp(request.headers.get(agents.INAPP_HEADER)))
    if refusal:
        raise HTTPException(403, refusal)
    return await asyncio.to_thread(_run, body)
