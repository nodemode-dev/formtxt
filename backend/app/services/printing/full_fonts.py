import io
from functools import lru_cache
from pathlib import Path

from app.core import config

FAMILIES = {
    "lora": ("lora", "Lora"),
    "merriweather": ("merriweather", "Merriweather"),
    "playfair-display": ("playfairdisplay", "PlayfairDisplay"),
}
FACES = (("regular", 400, False), ("bold", 700, False), ("italic", 400, True), ("boldItalic", 700, True))


def roots() -> list[Path]:
    found = []
    dist = config.dist_dir()
    if dist:
        found.append(dist / "fonts" / "full")
    found.append(config.resource_dir() / "frontend_dist" / "fonts" / "full")
    found.append(config.REPO_DIR / "frontend" / "public" / "fonts" / "full")
    return [r for r in found if r.is_dir()]


def _file(folder: str, stem: str, italic: bool) -> Path | None:
    prefix = f"{stem}-Italic[" if italic else f"{stem}["
    for root in roots():
        target = root / folder
        if not target.is_dir():
            continue
        for path in sorted(target.iterdir()):
            if path.name.startswith(prefix) and path.suffix == ".ttf":
                return path
    return None


@lru_cache(maxsize=16)
def _instance(path: str, weight: int) -> bytes:
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    font = TTFont(path)
    axes = {}
    for axis in font["fvar"].axes:
        value = axis.defaultValue
        if axis.axisTag == "wght":
            value = max(axis.minValue, min(axis.maxValue, weight))
        axes[axis.axisTag] = value
    try:
        static = instantiateVariableFont(font, axes, updateFontNames=True)
    except Exception:
        static = instantiateVariableFont(TTFont(path), axes)
    out = io.BytesIO()
    static.save(out)
    return out.getvalue()


def faces(slug: str) -> dict[str, bytes] | None:
    entry = FAMILIES.get(slug)
    if not entry:
        return None
    folder, stem = entry
    result = {}
    try:
        for face, weight, italic in FACES:
            path = _file(folder, stem, italic)
            if path is None:
                return None
            result[face] = _instance(str(path), weight)
    except Exception:
        return None
    return result
