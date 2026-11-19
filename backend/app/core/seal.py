import hashlib
import hmac
import json
import secrets

SERVICE = "formtxt"
ACCOUNT = "settings-seal"
FIELD = "seal"
SEALED = ("agentsAllowed",)
_CACHE: dict = {"tried": False, "available": False, "key": None}


def reset() -> None:
    _CACHE.update(tried=False, available=False, key=None)


def _keyring():
    try:
        import keyring
        from keyring.backends import fail, null

        found = keyring.get_keyring()
    except Exception:
        return None
    if isinstance(found, (fail.Keyring, null.Keyring)) or getattr(found, "priority", 1) <= 0:
        return None
    return found


def _load(create: bool) -> bytes | None:
    if _CACHE["tried"] and (_CACHE["key"] is not None or not _CACHE["available"] or not create):
        return _CACHE["key"]
    _CACHE["tried"] = True
    store = _keyring()
    if store is None:
        _CACHE.update(available=False, key=None)
        return None
    try:
        stored = store.get_password(SERVICE, ACCOUNT)
        if not stored and create:
            store.set_password(SERVICE, ACCOUNT, secrets.token_hex(32))
            stored = store.get_password(SERVICE, ACCOUNT)
        key = bytes.fromhex(stored) if stored else None
    except Exception:
        _CACHE.update(available=False, key=None)
        return None
    _CACHE.update(available=True, key=key)
    return key


def available() -> bool:
    _load(False)
    return _CACHE["available"]


def digest(values: dict, key: bytes) -> str:
    body = json.dumps({k: values.get(k) for k in SEALED}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hmac.new(key, body.encode("utf-8"), hashlib.sha256).hexdigest()


def loosened(values: dict) -> bool:
    return values.get("agentsAllowed") is True


def effective(stored: dict) -> dict:
    out = {k: v for k, v in stored.items() if k != FIELD}
    key = _load(False)
    if not _CACHE["available"]:
        return {**out, "seal": "unavailable", "sealBroken": False}
    mark = stored.get(FIELD)
    if key is not None and isinstance(mark, str) and hmac.compare_digest(mark, digest(stored, key)):
        return {**out, "seal": "ok", "sealBroken": False}
    if not loosened(stored):
        return {**out, "seal": "unsealed", "sealBroken": False}
    out.update(agentsAllowed=False)
    return {**out, "seal": "broken", "sealBroken": True}


def sign(merged: dict) -> dict:
    key = _load(True)
    if key is None:
        return {k: v for k, v in merged.items() if k != FIELD}
    return {**merged, FIELD: digest(merged, key)}
