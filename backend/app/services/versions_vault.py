import base64
import hashlib
import json
import os
import struct

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException

from app.services import package
from app.services.package import MIMETYPE, prune, referenced

__all__ = ["MIMETYPE", "prune", "referenced", "pack", "unpack", "Locked"]
MAGIC = b"FTXTENC1"
ITERATIONS = 600_000
_keys: dict[str, tuple[bytes, bytes, int]] = {}


class Locked(HTTPException, ValueError):
    def __init__(self, header: dict):
        HTTPException.__init__(self, 423, "This document is password protected. Unlock it with its password to open it.")
        self.header = header


def is_sealed(data: bytes) -> bool:
    return data[:8] == MAGIC


def _split(data: bytes) -> tuple[dict, bytes, bytes, bytes]:
    n = struct.unpack(">I", data[8:12])[0]
    raw = data[12:12 + n]
    rest = data[12 + n:]
    return json.loads(raw.decode("utf-8")), raw, rest[:12], rest[12:]


def header_of(data: bytes) -> dict:
    return _split(data)[0]


def derive(password: str, salt: bytes, iterations: int = ITERATIONS) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, 32)


def has_key(doc_id: str) -> bool:
    return doc_id in _keys


def forget(doc_id: str) -> None:
    _keys.pop(doc_id, None)


def adopt_key(doc_id: str, key: bytes, salt: bytes, iterations: int) -> None:
    _keys[doc_id] = (key, salt, iterations)


def make_key(password: str) -> tuple[bytes, bytes, int]:
    salt = os.urandom(16)
    return derive(password, salt), salt, ITERATIONS


def seal(plain: bytes, doc: dict, key: tuple[bytes, bytes, int]) -> bytes:
    meta = doc.get("meta") or {}
    header = json.dumps({"v": 1, "id": doc["id"], "title": doc.get("title", ""), "created": meta.get("created", 0), "modified": meta.get("modified", 0),
                         "kdf": "pbkdf2-sha256", "iter": key[2], "salt": base64.b64encode(key[1]).decode("ascii")}, separators=(",", ":")).encode("utf-8")
    nonce = os.urandom(12)
    return MAGIC + struct.pack(">I", len(header)) + header + nonce + AESGCM(key[0]).encrypt(nonce, plain, header)


def open_plain(data: bytes) -> bytes:
    if not is_sealed(data):
        return data
    header, raw, nonce, body = _split(data)
    key = _keys.get(header["id"])
    if not key:
        raise Locked(header)
    try:
        return AESGCM(key[0]).decrypt(nonce, body, raw)
    except InvalidTag as exc:
        raise ValueError("the document could not be decrypted") from exc


def try_password(data: bytes, password: str) -> bool:
    header, raw, nonce, body = _split(data)
    salt = base64.b64decode(header["salt"])
    key = derive(password, salt, int(header.get("iter") or ITERATIONS))
    try:
        AESGCM(key).decrypt(nonce, body, raw)
    except InvalidTag:
        return False
    adopt_key(header["id"], key, salt, int(header.get("iter") or ITERATIONS))
    return True


def pack(doc: dict, media: dict[str, bytes] | None = None) -> bytes:
    plain = package.pack(doc, media)
    key = _keys.get(doc.get("id", ""))
    return seal(plain, doc, key) if key else plain


def unpack(data: bytes) -> tuple[dict, dict[str, bytes]]:
    return package.unpack(open_plain(data))


def locked_row(exc: BaseException, size: int = 0) -> dict | None:
    if not isinstance(exc, Locked):
        return None
    h = exc.header
    return {"id": h["id"], "title": h.get("title") or "Locked document", "modified": h.get("modified", 0), "created": h.get("created", 0), "words": 0, "bytes": size,
            "page": {"size": "letter", "width": 612.0, "height": 792.0, "orientation": "portrait"}, "locked": True}


def flag(row: dict, data: bytes) -> dict:
    if is_sealed(data):
        row["locked"] = True
    return row
