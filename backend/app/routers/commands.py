import json
import threading
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core import config
from app.services import bridge

router = APIRouter(prefix="/api/commands", tags=["commands"])
FILE = "commands-catalogue.json"
_lock = threading.Lock()
_state: dict = {"size": 0, "commands": [], "at": 0.0}


class Mirror(BaseModel):
    commands: list[dict] = Field(default_factory=list)


def require_local(request: Request) -> None:
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1", "localhost", "testclient"):
        raise HTTPException(403, "Only this computer can change the command catalogue.")


def _load() -> None:
    if _state["commands"]:
        return
    try:
        saved = json.loads((config.data_dir() / FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    with _lock:
        _state.update(size=saved.get("size", 0), commands=saved.get("commands", []), at=saved.get("at", 0.0))


def find(cid: str) -> dict | None:
    _load()
    return next((c for c in _state["commands"] if c.get("id") == cid), None)


def search(group: str = "", text: str = "") -> list[dict]:
    _load()
    g, t = group.strip().lower(), text.strip().lower()
    return [c for c in _state["commands"] if (not g or str(c.get("group", "")).lower() == g)
            and (not t or all(w in f"{c.get('id', '')} {c.get('label', '')} {c.get('description', '')}".lower() for w in t.split()))]


@router.post("/catalogue")
def mirror(body: Mirror, request: Request) -> dict:
    require_local(request)
    clean = [{k: c.get(k) for k in ("id", "label", "group", "description", "keys", "params") if k in c}
             for c in body.commands if isinstance(c.get("id"), str)][:5000]
    with _lock:
        _state.update(size=len(clean), commands=clean, at=time.time())
        text = json.dumps({"size": _state["size"], "at": _state["at"], "commands": clean})
    try:
        (config.data_dir() / FILE).write_text(text, encoding="utf-8")
    except OSError:
        pass
    return {"ok": True, "size": _state["size"]}


@router.get("")
def catalogue(group: str = "", text: str = "") -> dict:
    rows = search(group, text)
    groups = sorted({str(c.get("group", "")) for c in _state["commands"]})
    return {"size": _state["size"], "shown": len(rows), "groups": groups, "commands": rows,
            "hint": "" if _state["commands"] else "The catalogue is empty: open the FormTxt window (./formtxt), wait a few seconds, then ask again."}


class Run(BaseModel):
    params: dict = Field(default_factory=dict)


class Step(BaseModel):
    id: str
    params: dict = Field(default_factory=dict)


class Batch(BaseModel):
    steps: list[Step]
    stopOnError: bool = True


async def execute(cid: str, params: dict) -> dict:
    _load()
    if _state["commands"] and find(cid) is None:
        return {"ok": False, "error": f"No command has the id {cid}. Search with GET /api/commands?text=word."}
    return await bridge.call(cid, params)


@router.post("/batch")
async def batch(body: Batch, request: Request) -> dict:
    require_local(request)
    results = []
    for step in body.steps:
        out = await execute(step.id, step.params)
        results.append({"id": step.id, **out})
        if not out["ok"] and body.stopOnError:
            break
    return {"ok": all(r["ok"] for r in results), "results": results}


@router.get("/{cid}")
def describe(cid: str) -> dict:
    found = find(cid)
    if found is None:
        raise HTTPException(404, f"No command has the id {cid}. Search with GET /api/commands?text=word.")
    return found


@router.post("/{cid}")
async def run(cid: str, request: Request, body: Run | None = None) -> dict:
    require_local(request)
    return await execute(cid, body.params if body else {})
