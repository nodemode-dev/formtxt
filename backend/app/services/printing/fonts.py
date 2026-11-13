import io
import re
import struct
import zlib
from functools import lru_cache
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from app.core import config

from . import full_fonts

BUNDLED = {
    "inter": "inter",
    "source serif 4": "source-serif-4",
    "libre baskerville": "libre-baskerville",
    "work sans": "work-sans",
    "ibm plex sans": "ibm-plex-sans",
    "ibm plex serif": "ibm-plex-serif",
    "lora": "lora",
    "merriweather": "merriweather",
    "playfair display": "playfair-display",
    "space grotesk": "space-grotesk",
}
SERIF = re.compile(r"serif|times|georgia|cambria|garamond|palatino|book antiqua|baskerville|bookman|century|minion|constantia|didot|caslon", re.I)
MONO = re.compile(r"mono|courier|consolas|menlo|monaco|code|typewriter|lucida console", re.I)
STANDARD = {
    "sans": ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"),
    "serif": ("Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"),
    "mono": ("Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"),
}
SUBSETS = ("latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese")
FACES = (("regular", 400, "normal"), ("bold", 700, "normal"), ("italic", 400, "italic"), ("boldItalic", 700, "italic"))


def woff_to_ttf(data: bytes) -> bytes:
    sig, flavor, _length, count = struct.unpack(">4sIIH", data[:14])
    if sig != b"wOFF":
        raise ValueError("not a WOFF font")
    tables = []
    for i in range(count):
        tag, offset, comp, orig, checksum = struct.unpack(">4sIIII", data[44 + 20 * i:64 + 20 * i])
        blob = data[offset:offset + comp]
        if comp < orig:
            blob = zlib.decompress(blob)
        tables.append((tag, checksum, blob))
    tables.sort()
    power, shift = 1, 0
    while power * 2 <= count:
        power *= 2
        shift += 1
    head = struct.pack(">IHHHH", flavor, count, power * 16, shift, count * 16 - power * 16)
    position = 12 + 16 * count
    directory, body = b"", b""
    for tag, checksum, blob in tables:
        directory += struct.pack(">4sIII", tag, checksum, position + len(body), len(blob))
        body += blob + b"\0" * ((4 - len(blob) % 4) % 4)
    return head + directory + body


def font_roots() -> list[Path]:
    roots = []
    extra = config.env("FONTS_DIR")
    if extra:
        roots.append(Path(extra))
    roots.append(config.REPO_DIR / "frontend" / "node_modules" / "@fontsource")
    roots.append(config.BACKEND_DIR / "fonts")
    return [r for r in roots if r.is_dir()]


def _face_file(folder: str, weight: int, style: str, subset: str) -> Path | None:
    for root in font_roots():
        for s in dict.fromkeys((style, "normal")):
            for w in dict.fromkeys((weight, 400 if weight == 700 else 700)):
                path = root / folder / "files" / f"{folder}-{subset}-{w}-{s}.woff"
                if path.is_file():
                    return path
    return None


class Family:
    def __init__(self, name: str, faces: dict[str, str], bundled: bool, fallbacks: list[dict[str, str]]) -> None:
        self.name = name
        self.faces = faces
        self.bundled = bundled
        self.fallbacks = fallbacks

    def covers(self, ch: str, face: str = "regular") -> str | None:
        for chain in [self.faces, *self.fallbacks]:
            font = pdfmetrics.getFont(chain[face])
            table = getattr(getattr(font, "face", None), "charToGlyph", None)
            if table is None:
                if ord(ch) < 256 or ord(ch) in (0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC, 0x2122):
                    return chain[face]
                continue
            if ord(ch) in table:
                return chain[face]
        return None


_registered: dict[str, Family] = {}


def clean_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().strip("'\"").split(",")[0]).strip()


def note(name: str) -> str:
    clean = clean_name(name)
    if not clean:
        return ""
    folder = BUNDLED.get(clean.lower())
    if folder and f"ft-{folder}" in _registered:
        return ""
    if folder:
        return f"The font files for {clean} could not be loaded, so a standard font was used instead."
    return f"{clean} is not a bundled font, so a similar bundled or standard font was used."


def _register_ttf(name: str, path: Path) -> None:
    if name in pdfmetrics.getRegisteredFontNames():
        return
    font = TTFont(name, io.BytesIO(woff_to_ttf(path.read_bytes())))
    font.face.name = name.encode("latin-1")
    pdfmetrics.registerFont(font)


def _standard(kind: str) -> Family:
    key = f"std-{kind}"
    if key not in _registered:
        regular, bold, italic, bold_italic = STANDARD[kind]
        pdfmetrics.registerFontFamily(regular, normal=regular, bold=bold, italic=italic, boldItalic=bold_italic)
        _registered[key] = Family(regular, dict(zip(("regular", "bold", "italic", "boldItalic"), STANDARD[kind])), False, [])
    return _registered[key]


def _inter_chains(clean: str) -> list[dict[str, str]]:
    if clean.lower() == "inter":
        return []
    inter = family("Inter")
    return [inter.faces, *inter.fallbacks] if inter.bundled else []


@lru_cache(maxsize=64)
def family(name: str) -> Family:
    clean = clean_name(name)
    folder = BUNDLED.get(clean.lower())
    if folder:
        key = f"ft-{folder}"
        if key in _registered:
            return _registered[key]
        faces: dict[str, str] = {}
        extras: dict[str, dict[str, str]] = {}
        full = full_fonts.faces(folder)
        if full:
            for face, data in full.items():
                name = f"{key}-{face}"
                if name not in pdfmetrics.getRegisteredFontNames():
                    font = TTFont(name, io.BytesIO(data))
                    font.face.name = name.encode("latin-1")
                    pdfmetrics.registerFont(font)
                faces[face] = name
            pdfmetrics.registerFontFamily(key, normal=faces["regular"], bold=faces["bold"], italic=faces["italic"], boldItalic=faces["boldItalic"])
            pdfmetrics.registerFontFamily(faces["regular"], normal=faces["regular"], bold=faces["bold"], italic=faces["italic"], boldItalic=faces["boldItalic"])
            fam = Family(faces["regular"], faces, True, _inter_chains(clean))
            _registered[key] = fam
            return fam
        try:
            for face, weight, style in FACES:
                path = _face_file(folder, weight, style, "latin")
                if not path:
                    raise FileNotFoundError(folder)
                _register_ttf(f"{key}-{face}", path)
                faces[face] = f"{key}-{face}"
                for subset in SUBSETS:
                    ext = _face_file(folder, weight, style, subset)
                    if ext:
                        fname = f"{key}-ext-{face}" if subset == "latin-ext" else f"{key}-{subset}-{face}"
                        _register_ttf(fname, ext)
                        extras.setdefault(subset, {})[face] = fname
            pdfmetrics.registerFontFamily(key, normal=faces["regular"], bold=faces["bold"], italic=faces["italic"], boldItalic=faces["boldItalic"])
            pdfmetrics.registerFontFamily(faces["regular"], normal=faces["regular"], bold=faces["bold"], italic=faces["italic"], boldItalic=faces["boldItalic"])
            chains = [e for e in extras.values() if len(e) == 4]
            for e in chains:
                pdfmetrics.registerFontFamily(e["regular"], normal=e["regular"], bold=e["bold"], italic=e["italic"], boldItalic=e["boldItalic"])
            fam = Family(faces["regular"], faces, True, chains + _inter_chains(clean))
            _registered[key] = fam
            return fam
        except (OSError, ValueError, KeyError, struct.error, zlib.error):
            pass
    kind = "mono" if MONO.search(clean) else "serif" if SERIF.search(clean) else "sans"
    if kind == "sans" and clean.lower() != "inter" and font_roots():
        inter = family("Inter")
        if inter.bundled:
            return inter
    return _standard(kind)


def encodable(ch: str) -> bool:
    try:
        ch.encode("cp1252")
        return True
    except UnicodeEncodeError:
        return False
