from app.services.exchange import common
from app.services.exchange.common import Unsupported, safe_name

FORMATS = {
    "docx": ("Word document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "dotx": ("Word template", "application/vnd.openxmlformats-officedocument.wordprocessingml.template"),
    "odt": ("OpenDocument text", "application/vnd.oasis.opendocument.text"),
    "rtf": ("Rich text", "application/rtf"),
    "txt": ("Plain text", "text/plain; charset=utf-8"),
    "html": ("Web page", "text/html; charset=utf-8"),
    "md": ("Markdown", "text/markdown; charset=utf-8"),
    "epub": ("EPUB", "application/epub+zip"),
}
READABLE = {".docx": "docx", ".dotx": "docx", ".docm": "docx", ".odt": "odt", ".ott": "odt", ".rtf": "rtf", ".html": "html", ".htm": "html",
            ".xhtml": "html", ".doc": "doc", ".dot": "doc", ".md": "md", ".markdown": "md"}


def handles(name: str) -> bool:
    return _ext(name) in READABLE


def _ext(name: str) -> str:
    return ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""


def export(doc: dict, media: dict[str, bytes], fmt: str) -> tuple[bytes, str, str]:
    fmt = fmt.lower().lstrip(".")
    if fmt not in FORMATS:
        raise Unsupported(f"Cannot export to {fmt}. Use one of {', '.join(FORMATS)}.")
    from app.services import package
    doc, media = package.prune(doc, media)
    from app.services.exchange import flatten
    doc = flatten.prepare(doc, fmt in ("docx", "dotx"))
    if fmt in ("docx", "dotx"):
        from app.services.exchange import docx_out
        data = docx_out.build(doc, media, fmt == "dotx")
    elif fmt == "odt":
        from app.services.exchange import odt_out
        data = odt_out.build(doc, media)
    elif fmt == "rtf":
        from app.services.exchange import rtf_out
        data = rtf_out.build(doc, media)
    elif fmt == "txt":
        from app.services.exchange import txt_out
        data = txt_out.build(doc, media)
    elif fmt == "html":
        from app.services.exchange import html_out
        data = html_out.build(doc, media)
    elif fmt == "md":
        from app.services.exchange import md_out
        data = md_out.build(doc, media)
    else:
        from app.services.exchange import epub_out
        data = epub_out.build(doc, media)
    return data, FORMATS[fmt][1], f"{safe_name(str(doc.get('title') or ''))}.{fmt}"


def read(name: str, data: bytes) -> tuple[dict, dict[str, bytes]]:
    kind = READABLE.get(_ext(name))
    if kind is None:
        raise Unsupported(f"{name}: FormTxt opens .ftxt, .docx, .dotx, .odt, .rtf, .html, .htm, .doc, .md and .txt files.")
    if kind == "docx":
        from app.services.exchange import docx_in as reader
    elif kind == "odt":
        from app.services.exchange import odt_in as reader
    elif kind == "rtf":
        from app.services.exchange import rtf_in as reader
    elif kind == "html":
        from app.services.exchange import html_in as reader
    elif kind == "md":
        from app.services.exchange import md_in as reader
    else:
        from app.services.exchange import doc_in as reader
    doc, media = reader.read(data, name)
    if not doc.get("title") or doc["title"] == "Imported document":
        doc["title"] = common.title_of(name)
    doc["title"] = str(doc["title"]).strip()[:200] or "Imported document"
    return doc, media
