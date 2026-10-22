import json
import os
import threading
import urllib.parse

from app.core import config
from app.services import secrets

DEFAULTS = {
    "enabled": False,
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "baseUrl": "",
    "key": "",
    "imageModel": "",
    "imageBaseUrl": "",
    "imageKey": "",
    "effort": "balanced",
}
PROVIDERS = ("anthropic", "openai")
EFFORTS = ("fast", "balanced", "thorough")
BASE = {"anthropic": "https://api.anthropic.com", "openai": "https://api.openai.com/v1"}
MODELS = {
    "anthropic": ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    "openai": ["gpt-4o-mini", "gpt-4o", "llama3.2", "qwen2.5"],
}
SECRETS = ("key", "imageKey")
_lock = threading.Lock()


class AIError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _path():
    return config.data_dir() / "ai.json"


def load() -> dict:
    with _lock:
        try:
            raw = json.loads(_path().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raw = None
        if not isinstance(raw, dict):
            _write(dict(DEFAULTS))
            return dict(DEFAULTS)
        data = {**DEFAULTS, **{k: v for k, v in raw.items() if k in DEFAULTS}}
        for k in SECRETS:
            data[k] = secrets.get(f"ai-{k}", lambda k=k: str(raw.get(k) or "") or None, lambda k=k: _blank(raw, k)) or ""
        return data


def _blank(raw: dict, k: str) -> None:
    raw[k] = ""
    _write(raw)


def _write(data: dict) -> None:
    data = {**data, **{k: "" for k in SECRETS}}
    p = _path()
    tmp = p.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    tmp.replace(p)
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass


def clean_url(raw: str) -> str:
    raw = (raw or "").strip().rstrip("/")
    if not raw:
        return ""
    p = urllib.parse.urlparse(raw)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise AIError(400, "The address must start with http:// or https://.")
    return raw[:300]


def save(patch: dict) -> dict:
    cur = load()
    if "enabled" in patch:
        cur["enabled"] = bool(patch["enabled"])
    if "provider" in patch:
        if patch["provider"] not in PROVIDERS:
            raise AIError(400, "The provider must be anthropic or openai.")
        cur["provider"] = patch["provider"]
    if "model" in patch:
        cur["model"] = str(patch["model"] or "").strip()[:120] or DEFAULTS["model"]
    if "effort" in patch:
        if patch["effort"] not in EFFORTS:
            raise AIError(400, "The effort must be fast, balanced or thorough.")
        cur["effort"] = patch["effort"]
    for k in ("baseUrl", "imageBaseUrl"):
        if k in patch:
            cur[k] = clean_url(str(patch[k] or ""))
    if "imageModel" in patch:
        cur["imageModel"] = str(patch["imageModel"] or "").strip()[:120]
    for k in SECRETS:
        if k in patch and str(patch[k] or "").strip():
            cur[k] = "".join(ch for ch in str(patch[k]) if ch.isprintable() and not ch.isspace())[:400]
            secrets.put(f"ai-{k}", cur[k])
        if patch.get("clear" + k[0].upper() + k[1:]):
            cur[k] = ""
            secrets.delete(f"ai-{k}")
    with _lock:
        _write(cur)
    return cur


def base_url(s: dict) -> str:
    return s["baseUrl"] or BASE[s["provider"]]


def image_target(s: dict) -> tuple[str, str] | None:
    if s["imageBaseUrl"]:
        return s["imageBaseUrl"], s["imageKey"] or s["key"]
    if s["provider"] == "openai":
        return base_url(s), s["key"]
    return None


def public(s: dict) -> dict:
    return {
        "enabled": s["enabled"], "provider": s["provider"], "model": s["model"], "baseUrl": s["baseUrl"],
        "defaultBaseUrl": BASE[s["provider"]], "keySet": bool(s["key"]), "needsKey": s["provider"] == "anthropic" and not s["key"],
        "imageModel": s["imageModel"], "imageBaseUrl": s["imageBaseUrl"], "imageKeySet": bool(s["imageKey"]),
        "keyLast4": s["key"][-4:] if len(s["key"]) >= 12 else "", "imageKeyLast4": s["imageKey"][-4:] if len(s["imageKey"]) >= 12 else "",
        "imageAvailable": image_target(s) is not None, "effort": s["effort"], "efforts": list(EFFORTS),
        "models": MODELS[s["provider"]], "providers": list(PROVIDERS),
    }


def require_enabled() -> dict:
    s = load()
    if not s["enabled"]:
        raise AIError(403, "AI is turned off. Turn it on in AI settings first.")
    if s["provider"] == "anthropic" and not s["key"]:
        raise AIError(401, "Add your Anthropic API key in AI settings.")
    return s
