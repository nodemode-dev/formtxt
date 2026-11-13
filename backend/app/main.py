import json
import mimetypes
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core import config
from app.core.local_guard import LocalGuard
from app.routers import blocks, commands, data, documents, formula, live, mcp, stock, system, templates
from app.routers import ai, collab, exchange, objects, printing, proofing, refs, review, versions

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")


def _write_discovery() -> None:
    info = {"port": config.port(), "pid": os.getpid(), "version": config.VERSION, "desktop": config.is_desktop(), "started": time.time()}
    try:
        config.discovery_path().write_text(json.dumps(info), encoding="utf-8")
    except OSError:
        pass


def _clear_discovery() -> None:
    try:
        info = json.loads(config.discovery_path().read_text(encoding="utf-8"))
        if info.get("pid") == os.getpid():
            config.discovery_path().unlink()
    except (OSError, ValueError):
        pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    _write_discovery()
    yield
    _clear_discovery()


app = FastAPI(title=config.APP_TITLE, version=config.VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins(), allow_methods=["*"], allow_headers=["*"])
app.add_middleware(LocalGuard, origins=config.cors_origins())
app.include_router(system.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(data.router, prefix="/api")
app.include_router(formula.router, prefix="/api")
app.include_router(blocks.router, prefix="/api")
app.include_router(stock.router, prefix="/api")
for _area in (refs, review, versions, exchange, printing, proofing, ai, objects, collab):
    app.include_router(_area.router, prefix="/api")
app.include_router(commands.router)
app.include_router(live.router)
app.include_router(mcp.router)

_dist = config.dist_dir()
if _dist is not None:
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
