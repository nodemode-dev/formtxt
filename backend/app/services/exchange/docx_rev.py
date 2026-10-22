import datetime
import re

FLAGS = ("bold", "italic", "strike", "superscript", "subscript", "smallCaps", "allCaps", "code")
ATTR = {"spacing": "pt", "font": "family", "size": "pt", "color": "value", "highlight": "value", "link": "href"}
KNOWN = set(FLAGS) | set(ATTR) | {"underline"}
BOOKMARK = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,39}$")
INFO_CODES = ("DATE", "TIME", "CREATEDATE", "SAVEDATE", "AUTHOR", "FILENAME", "TITLE", "SUBJECT", "NUMWORDS", "NUMPAGES")
DATE_CODES = ("DATE", "TIME", "CREATEDATE", "SAVEDATE")
COUNT_CODES = ("NUMWORDS", "NUMPAGES")


def iso(ts) -> str:
    try:
        value = float(ts or 0)
    except (TypeError, ValueError):
        value = 0.0
    return datetime.datetime.fromtimestamp(max(0.0, value), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(text) -> int:
    s = str(text or "").strip()
    if not s:
        return 0
    try:
        d = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return 0
    if d.tzinfo is None:
        d = d.replace(tzinfo=datetime.timezone.utc)
    return int(d.timestamp())


def ids_of(value) -> list[str]:
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, (list, tuple)):
        return [str(v) for v in value if v]
    return []


def to_attrs(key: str, value) -> dict:
    if key in FLAGS:
        return {}
    if key == "underline":
        return {"style": "single" if value is True else str(value)}
    return {ATTR[key]: value}


def from_attrs(key: str, attrs: dict):
    if key in FLAGS:
        return True
    if key == "underline":
        style = (attrs or {}).get("style", "single")
        return True if style == "single" else style
    return (attrs or {}).get(ATTR[key])


def undo(marks: dict, ops: list) -> dict:
    out = {k: v for k, v in marks.items() if k in KNOWN}
    for op in reversed(ops or []):
        if not isinstance(op, dict):
            continue
        key = op.get("mark")
        if key not in KNOWN:
            continue
        if op.get("op") == "add":
            out.pop(key, None)
        else:
            value = from_attrs(key, op.get("attrs") or {})
            if value is not None:
                out[key] = value
    return out


def diff(prev: dict, cur: dict) -> list[dict]:
    ops: list[dict] = []
    for key in sorted(KNOWN):
        a, b = prev.get(key), cur.get(key)
        if a == b:
            continue
        if a is not None:
            ops.append({"op": "remove", "mark": key, "attrs": to_attrs(key, a)})
        if b is not None:
            ops.append({"op": "add", "mark": key, "attrs": to_attrs(key, b)})
    return ops
