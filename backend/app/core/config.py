import json
import os
import sys
from pathlib import Path

from app import __version__

APP_NAME = "formtxt"
APP_TITLE = "FormTxt"
VERSION = __version__
FRONTEND_PORT = 5210
PREVIEW_PORT = 5310
BACKEND_PORT = 8210
MAX_UPLOAD_BYTES = 512 * 1024 * 1024
MAX_DOCUMENT_BYTES = 256 * 1024 * 1024
MAX_MEDIA_BYTES = 40 * 1024 * 1024
BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


def _load_env_file() -> None:
    env_file = BACKEND_DIR / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if value.strip():
            os.environ.setdefault(key.strip(), value.strip())


_load_env_file()


def env(key: str, default: str | None = None) -> str | None:
    value = os.environ.get(f"FORMTXT_{key}")
    return default if value is None else value


def _ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def data_dir() -> Path:
    raw = env("DATA_DIR")
    return _ensure(Path(raw).expanduser() if raw else Path.home() / "FormTxt")


def documents_dir() -> Path:
    return _ensure(data_dir() / "Documents")


def trash_dir() -> Path:
    return _ensure(data_dir() / "Trash")


def templates_dir() -> Path:
    return _ensure(data_dir() / "Templates")


def settings_path() -> Path:
    return data_dir() / "settings.json"


def discovery_path() -> Path:
    return data_dir() / "engine.json"


def resource_dir() -> Path:
    return Path(getattr(sys, "_MEIPASS", BACKEND_DIR))


def is_desktop() -> bool:
    return env("DESKTOP") == "1"


def port() -> int:
    return int(env("ENGINE_PORT") or env("PORT") or BACKEND_PORT)


def cors_origins() -> list[str]:
    raw = env("CORS_ORIGINS")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    ui = int(env("UI_PORT") or FRONTEND_PORT)
    return [f"http://localhost:{ui}", f"http://127.0.0.1:{ui}", f"http://localhost:{PREVIEW_PORT}", "tauri://localhost", "http://tauri.localhost"]


def dist_dir() -> Path | None:
    raw = env("DIST")
    if raw and (Path(raw) / "index.html").is_file():
        return Path(raw)
    return None


def read_settings() -> dict:
    try:
        return json.loads(settings_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_settings(patch: dict) -> dict:
    merged = {**read_settings(), **patch}
    tmp = settings_path().with_suffix(".tmp")
    tmp.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    tmp.replace(settings_path())
    return merged
