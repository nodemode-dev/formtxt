import platform
import sys

from fastapi import APIRouter

from app.core import config
from app.services import secrets, stock

router = APIRouter()


def _available(module: str) -> bool:
    try:
        __import__(module)
        return True
    except Exception:
        return False


@router.get("/health")
def health() -> dict:
    return {"ok": True, "app": config.APP_NAME, "version": config.VERSION}


@router.get("/version")
def version() -> dict:
    return {"app": config.APP_NAME, "title": config.APP_TITLE, "version": config.VERSION,
            "python": sys.version.split()[0], "platform": platform.system().lower()}


@router.get("/capabilities")
def capabilities() -> dict:
    return {"docx": _available("docx"), "lxml": _available("lxml"), "desktop": config.is_desktop(),
            "dataDir": str(config.data_dir()), "port": config.port()}


@router.get("/settings")
def get_settings() -> dict:
    s = config.read_settings()
    s.pop("pexelsKey", None)
    key = stock._pexels_key()
    return {**s, "pexelsKeySet": bool(key), "pexelsLast4": key[-4:] if len(key) >= 8 else "", "secretStore": secrets.where()}


@router.post("/settings")
def set_settings(patch: dict) -> dict:
    allowed = {k: v for k, v in patch.items() if k in {"author", "units", "defaultPageSize", "theme", "autosave", "pinned", "recentHidden", "keys", "pexelsKey", "stockImages", "linkPreviews", "autoVersionMinutes"}}
    if "autoVersionMinutes" in allowed:
        try:
            allowed["autoVersionMinutes"] = max(2.0, min(240.0, float(allowed["autoVersionMinutes"] or 10)))
        except (TypeError, ValueError):
            allowed.pop("autoVersionMinutes")
    if "linkPreviews" in allowed:
        allowed["linkPreviews"] = bool(allowed["linkPreviews"])
    if "pexelsKey" in allowed:
        cleaned = "".join(ch for ch in str(allowed.pop("pexelsKey") or "") if ch.isalnum())[:120]
        if cleaned:
            secrets.put("pexels", cleaned, stock.pexels_legacy_clear)
        else:
            secrets.delete("pexels", stock.pexels_legacy_clear)
    if "stockImages" in allowed:
        allowed["stockImages"] = bool(allowed["stockImages"])
    if "keys" in allowed:
        raw = allowed["keys"] if isinstance(allowed["keys"], dict) else {}
        allowed["keys"] = {str(cid)[:120]: [str(k)[:40] for k in combos][:4] for cid, combos in list(raw.items())[:2000] if isinstance(combos, list)}
    if "author" in allowed:
        allowed["author"] = str(allowed["author"] or "")[:200]
    for key in ("pinned", "recentHidden"):
        if key in allowed:
            allowed[key] = [str(i)[:80] for i in allowed[key] if isinstance(i, str)][:500] if isinstance(allowed[key], list) else []
    merged = config.write_settings(allowed)
    merged.pop("pexelsKey", None)
    key = stock._pexels_key()
    return {**merged, "pexelsKeySet": bool(key), "pexelsLast4": key[-4:] if len(key) >= 8 else "", "secretStore": secrets.where()}
