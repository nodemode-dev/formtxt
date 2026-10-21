import secrets
import string

_ALPHABET = string.ascii_lowercase + string.digits


def new_id(prefix: str, size: int = 10) -> str:
    return prefix + "".join(secrets.choice(_ALPHABET) for _ in range(size))


def is_id(value: str, prefix: str) -> bool:
    body = value[len(prefix):] if value.startswith(prefix) else ""
    return 4 <= len(body) <= 40 and all(c in _ALPHABET for c in body)
