import json
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core import config
from app.routers import commands, documents, system, templates


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
app.include_router(system.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(commands.router)

_dist = config.dist_dir()
if _dist is not None:
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
