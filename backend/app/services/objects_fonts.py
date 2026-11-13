import hashlib
import json
import re
import struct
import threading
import zlib
from pathlib import Path

from app.core import config

MAX_FONT_BYTES = 16 * 1024 * 1024
SIGNATURES = {
    b"\x00\x01\x00\x00": ("ttf", "font/ttf"),
    b"true": ("ttf", "font/ttf"),
    b"OTTO": ("otf", "font/otf"),
    b"wOFF": ("woff", "font/woff"),
    b"wOF2": ("woff2", "font/woff2"),
}
TYPES = {ext: mime for ext, mime in SIGNATURES.values()}
_lock = threading.Lock()


class FontError(ValueError):
    pass


def folder() -> Path:
    path = config.data_dir() / "Fonts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _index_path() -> Path:
    return folder() / "index.json"


def _read_index() -> dict:
    try:
        data = json.loads(_index_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_index(index: dict) -> None:
    tmp = _index_path().with_suffix(".tmp")
    tmp.write_text(json.dumps(index, indent=1), encoding="utf-8")
    tmp.replace(_index_path())


def sniff(data: bytes) -> tuple[str, str] | None:
    return SIGNATURES.get(data[:4])


def _sfnt_tables(data: bytes) -> dict[str, bytes]:
    if data[:4] == b"wOFF":
        count = struct.unpack(">H", data[12:14])[0]
        tables: dict[str, bytes] = {}
        for i in range(min(count, 64)):
            tag, offset, comp, orig = struct.unpack(">4sIII", data[44 + i * 20: 44 + i * 20 + 16])
            raw = data[offset:offset + comp]
            if comp < orig:
                try:
                    raw = zlib.decompressobj().decompress(raw, min(orig, MAX_FONT_BYTES))
                except zlib.error:
                    continue
            tables[tag.decode("latin-1")] = raw
        return tables
    count = struct.unpack(">H", data[4:6])[0]
    tables = {}
    for i in range(min(count, 64)):
        tag, _, offset, length = struct.unpack(">4sIII", data[12 + i * 16: 12 + i * 16 + 16])
        tables[tag.decode("latin-1")] = data[offset:offset + length]
    return tables


def _names(table: bytes) -> dict[int, str]:
    out: dict[int, str] = {}
    if len(table) < 6:
        return out
    count, string_offset = struct.unpack(">HH", table[2:6])
    for i in range(min(count, 400)):
        rec = table[6 + i * 12: 6 + i * 12 + 12]
        if len(rec) < 12:
            break
        platform, encoding, _, name_id, length, offset = struct.unpack(">HHHHHH", rec)
        raw = table[string_offset + offset: string_offset + offset + length]
        if platform in (0, 3):
            text = raw.decode("utf-16-be", "ignore")
        elif platform == 1:
            text = raw.decode("mac_roman", "ignore")
        else:
            continue
        if text and (name_id not in out or platform == 3):
            out[name_id] = text
    return out


def _clean_family(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w .&+-]", "", text)).strip()[:80]


def describe(data: bytes, filename: str) -> dict:
    stem = re.sub(r"\.[A-Za-z0-9]+$", "", filename or "Font")
    family, weight, italic = "", 400, False
    if data[:4] != b"wOF2":
        try:
            tables = _sfnt_tables(data)
            names = _names(tables.get("name", b""))
            family = _clean_family(names.get(16) or names.get(1) or "")
            sub = (names.get(17) or names.get(2) or "").lower()
            os2 = tables.get("OS/2", b"")
            if len(os2) >= 6:
                weight = max(100, min(900, struct.unpack(">H", os2[4:6])[0]))
            head = tables.get("head", b"")
            if len(head) >= 46:
                italic = bool(struct.unpack(">H", head[44:46])[0] & 2)
            italic = italic or "italic" in sub or "oblique" in sub
        except (struct.error, IndexError, ValueError):
            family = ""
    if not family:
        base = re.sub(r"[-_ ](regular|bold|italic|oblique|light|medium|semibold|black|thin|extrabold)+.*$", "", stem, flags=re.I)
        family = _clean_family(re.sub(r"[-_]+", " ", base)) or "Custom font"
        low = stem.lower()
        weight = 700 if "bold" in low else 300 if "light" in low else 400
        italic = "italic" in low or "oblique" in low
    return {"family": family, "weight": weight, "style": "italic" if italic else "normal"}


def listing() -> list[dict]:
    index = _read_index()
    out = []
    for name, meta in index.items():
        if (folder() / name).is_file():
            out.append({"file": name, **meta})
    return sorted(out, key=lambda m: (m["family"].lower(), m["weight"], m["style"]))


def add(data: bytes, filename: str, family: str = "") -> dict:
    if len(data) > MAX_FONT_BYTES:
        raise FontError(f"{filename}: fonts up to {MAX_FONT_BYTES // (1024 * 1024)} MB are supported.")
    kind = sniff(data)
    if not kind:
        raise FontError(f"{filename}: not a TrueType, OpenType, WOFF or WOFF2 font file.")
    meta = describe(data, filename)
    if family.strip():
        meta["family"] = _clean_family(family) or meta["family"]
    name = f"{hashlib.sha256(data).hexdigest()[:20]}.{kind[0]}"
    meta.update(bytes=len(data), source=(filename or "")[:200])
    with _lock:
        path = folder() / name
        if not path.is_file():
            path.write_bytes(data)
        index = _read_index()
        index[name] = {**index.get(name, {}), **meta}
        _write_index(index)
    return {"file": name, **index[name]}


def read(name: str) -> tuple[bytes, str]:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in TYPES or "/" in name or "\\" in name or ".." in name:
        raise FileNotFoundError(name)
    return (folder() / name).read_bytes(), TYPES[ext]


def remove(name: str) -> bool:
    if "/" in name or "\\" in name or ".." in name or name == "index.json":
        return False
    with _lock:
        index = _read_index()
        found = name in index
        index.pop(name, None)
        _write_index(index)
        (folder() / name).unlink(missing_ok=True)
    return found


def for_families(families: list[str]) -> list[dict]:
    wanted = {f.strip().lower() for f in families if f.strip()}
    return [m for m in listing() if m["family"].lower() in wanted]
