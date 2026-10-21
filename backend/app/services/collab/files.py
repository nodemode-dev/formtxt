import json
import threading
from pathlib import Path

from app.core import config

_lock = threading.Lock()


def folder() -> Path:
    path = config.data_dir() / "Collab"
    path.mkdir(parents=True, exist_ok=True)
    return path


def addins_dir() -> Path:
    path = config.data_dir() / "Add-ins"
    path.mkdir(parents=True, exist_ok=True)
    return path


def read(name: str, default: dict) -> dict:
    try:
        data = json.loads((folder() / name).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else dict(default)
    except (OSError, ValueError):
        return dict(default)


def write(name: str, data: dict) -> None:
    path = folder() / name
    tmp = path.with_suffix(".tmp")
    with _lock:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(path)


def update(name: str, default: dict, change) -> dict:
    with _lock:
        path = folder() / name
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                data = dict(default)
        except (OSError, ValueError):
            data = dict(default)
        change(data)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(path)
        return data
