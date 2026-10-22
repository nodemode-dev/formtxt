import os
from pathlib import Path

from app.core import config

SERVICE = "formtxt"


def _store():
    try:
        import keyring
        from keyring.backends import fail, null
        kr = keyring.get_keyring()
    except Exception:
        return None
    if isinstance(kr, (fail.Keyring, null.Keyring)) or getattr(kr, "priority", 1) <= 0:
        return None
    return kr


def where() -> dict:
    kr = _store()
    return {"store": "system" if kr else "file", "backend": type(kr).__name__ if kr else "file readable only by you"}


def _file(name: str) -> Path:
    return config.data_dir() / "secrets" / f"{name}.key"


def _file_read(name: str) -> str | None:
    try:
        return _file(name).read_text(encoding="utf-8") or None
    except OSError:
        return None


def _file_write(name: str, value: str) -> None:
    path = _file(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(value)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _file_clear(name: str) -> None:
    try:
        _file(name).unlink()
    except OSError:
        pass


def get(name: str, legacy_read=None, legacy_clear=None) -> str | None:
    kr = _store()
    if not kr:
        value = _file_read(name)
        if value:
            return value
        old = legacy_read() if legacy_read else None
        if old:
            _file_write(name, old)
            if legacy_clear:
                legacy_clear()
        return old
    try:
        value = kr.get_password(SERVICE, name)
    except Exception:
        value = None
    if value:
        return value
    old = _file_read(name) or (legacy_read() if legacy_read else None)
    if old:
        try:
            kr.set_password(SERVICE, name, old)
            if kr.get_password(SERVICE, name) == old:
                _file_clear(name)
                if legacy_clear:
                    legacy_clear()
        except Exception:
            pass
    return old


def put(name: str, value: str, legacy_clear=None) -> str:
    kr = _store()
    if kr:
        try:
            kr.set_password(SERVICE, name, value)
            if kr.get_password(SERVICE, name) == value:
                _file_clear(name)
                if legacy_clear:
                    legacy_clear()
                return "system"
        except Exception:
            pass
    _file_write(name, value)
    if legacy_clear:
        legacy_clear()
    return "file"


def delete(name: str, legacy_clear=None) -> None:
    kr = _store()
    if kr:
        try:
            kr.delete_password(SERVICE, name)
        except Exception:
            pass
    _file_clear(name)
    if legacy_clear:
        legacy_clear()
