import secrets
import socket
import time

from app.core import config
from app.services import store
from app.services.collab import files

MODES = ("view", "comment", "edit")
_DEFAULT = {"links": {}}
_SETTINGS = {"network": False, "voice": False}


def settings() -> dict:
    return {**_SETTINGS, **{k: bool(v) for k, v in files.read("settings.json", {}).items() if k in _SETTINGS}}


def set_settings(patch: dict) -> dict:
    clean = {k: bool(v) for k, v in patch.items() if k in _SETTINGS}
    files.update("settings.json", {}, lambda d: d.update(clean))
    return settings()


def lan_address() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return ""
    finally:
        s.close()


def bind_host() -> str:
    return config.env("HOST", "127.0.0.1") or "127.0.0.1"


def network_info() -> dict:
    host = bind_host()
    return {"optIn": settings()["network"], "bindHost": host, "reachable": host not in ("127.0.0.1", "localhost", "::1"), "lan": lan_address(), "port": config.port()}


def create(doc_id: str, mode: str, label: str = "") -> dict:
    if mode not in MODES:
        raise ValueError("A link is view, comment or edit.")
    doc, _ = store.load(doc_id)
    token = secrets.token_urlsafe(18)
    link = {"token": token, "doc": doc_id, "mode": mode, "label": label[:80], "created": time.time(), "title": doc.get("title", "")}
    files.update("links.json", _DEFAULT, lambda d: d.setdefault("links", {}).__setitem__(token, link))
    return link


def listing(doc_id: str | None = None) -> list[dict]:
    items = list(files.read("links.json", _DEFAULT).get("links", {}).values())
    if doc_id:
        items = [i for i in items if i.get("doc") == doc_id]
    return sorted(items, key=lambda i: i.get("created", 0), reverse=True)


def resolve(token: str) -> dict | None:
    if not token or len(token) > 80:
        return None
    link = files.read("links.json", _DEFAULT).get("links", {}).get(token)
    return link if isinstance(link, dict) else None


def revoke(token: str) -> bool:
    found = {"v": False}

    def change(d: dict) -> None:
        found["v"] = d.setdefault("links", {}).pop(token, None) is not None

    files.update("links.json", _DEFAULT, change)
    return found["v"]
