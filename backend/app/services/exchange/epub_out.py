import io
import time
import uuid
import zipfile
from xml.sax.saxutils import quoteattr

from lxml import etree

from app.services.exchange import common
from app.services.exchange.html_out import Html, esc

CSS = ("body{font-family:serif;line-height:1.4}img{max-width:100%;height:auto}table{border-collapse:collapse}"
       "td,th{padding:2pt 4pt}pre{white-space:pre-wrap;font-family:monospace}.tab{display:inline-block;width:2em}")
NS = 'xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"'


def heading_level(b: dict) -> int:
    style = b.get("style") or ""
    if b.get("type") == "paragraph" and style.startswith("Heading") and style[7:].isdigit():
        return int(style[7:])
    return 0


def split_chapters(doc: dict) -> list[tuple[str, list[dict]]]:
    chapters: list[tuple[str, list[dict]]] = []
    tabs = common.doc_tabs(doc)
    for tab in tabs:
        body = tab.get("body") or []
        if len(tabs) > 1:
            title = str(tab.get("title") or "Untitled")
            head = {"type": "paragraph", "id": "p_tab", "style": "Heading1", "section": "", "content": [{"type": "text", "text": title}]}
            chapters.append((title, [head] + body))
            continue
        cur_title, cur = str(doc.get("title") or "Document"), []
        for b in body:
            if heading_level(b) == 1:
                if cur:
                    chapters.append((cur_title, cur))
                cur_title = common.plain(b.get("content")).strip() or "Untitled"
                cur = [b]
            else:
                cur.append(b)
        if cur:
            chapters.append((cur_title, cur))
    return chapters or [(str(doc.get("title") or "Document"), [])]


def nested(items: list[tuple[int, str, str]]) -> str:
    out: list[str] = []
    stack: list[int] = []
    for lvl, text, href in items:
        while stack and stack[-1] > lvl:
            out.append("</li></ol>")
            stack.pop()
        if stack and stack[-1] == lvl:
            out.append("</li>")
        else:
            out.append("<ol>")
            stack.append(lvl)
        out.append(f'<li><a href="{href}">{esc(text)}</a>')
    out.append("</li></ol>" * len(stack))
    return "".join(out)


def build(doc: dict, media: dict[str, bytes]) -> bytes:
    used: dict[str, str] = {}

    def src(name: str) -> str | None:
        data = media.get(name)
        kind = common.sniff(data) if data is not None else None
        if kind is None:
            return None
        used[name] = kind[1]
        return f"images/{name}"

    meta = doc.get("meta") or {}
    lang = str(meta.get("language") or "en")
    h = Html(doc, media, src)
    h.collect = True
    files: list[tuple[str, str]] = []
    nav_items: list[tuple[int, str, str]] = []
    for i, (title, blocks) in enumerate(chapters := split_chapters(doc), start=1):
        h.fn = []
        h.anchors = []
        body = h.blocks(blocks) + h.footnotes()
        name = f"chapter{i}.xhtml"
        xhtml = (f'<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html {NS} lang={quoteattr(lang)} xml:lang={quoteattr(lang)}><head><meta charset="utf-8"/>'
                 f'<title>{esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>{body}</body></html>')
        etree.fromstring(xhtml.encode("utf-8"))
        files.append((name, xhtml))
        if h.anchors:
            top = min(a[0] for a in h.anchors)
            first = True
            for lvl, text, aid in h.anchors:
                nav_items.append((min(6, lvl - top + 1), text, name if first else f"{name}#{aid}"))
                first = False
        else:
            nav_items.append((1, title, name))
    uid = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, str(doc.get('id', '')))}"
    manifest = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
                '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>', '<item id="css" href="style.css" media-type="text/css"/>']
    spine = []
    for i, (name, _) in enumerate(files, start=1):
        manifest.append(f'<item id="c{i}" href="{name}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="c{i}"/>')
    for i, (name, mime) in enumerate(used.items()):
        manifest.append(f'<item id="img{i}" href="images/{name}" media-type="{mime}"/>')
    dc = [f'<dc:identifier id="uid">{uid}</dc:identifier>', f"<dc:title>{esc(doc.get('title', 'Document'))}</dc:title>", f"<dc:language>{esc(lang)}</dc:language>"]
    if meta.get("author"):
        dc.append(f"<dc:creator>{esc(meta['author'])}</dc:creator>")
    if meta.get("subject"):
        dc.append(f"<dc:description>{esc(meta['subject'])}</dc:description>")
    kw = meta.get("keywords")
    for k in (kw if isinstance(kw, list) else [kw] if kw else []):
        dc.append(f"<dc:subject>{esc(str(k))}</dc:subject>")
    modified = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    opf = ('<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">'
           f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">{"".join(dc)}<meta property="dcterms:modified">{modified}</meta></metadata>'
           f'<manifest>{"".join(manifest)}</manifest><spine toc="ncx">{"".join(spine)}</spine></package>')
    nav = (f'<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html {NS} lang={quoteattr(lang)}><head><meta charset="utf-8"/><title>{esc(doc.get("title", ""))}</title></head>'
           f'<body><nav epub:type="toc" id="toc"><h1>Contents</h1>{nested(nav_items)}</nav></body></html>')
    points = "".join(f'<navPoint id="n{i}" playOrder="{i}"><navLabel><text>{esc(t)}</text></navLabel><content src="{href}"/></navPoint>' for i, (_, t, href) in enumerate(nav_items, start=1))
    ncx = ('<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">'
           f'<head><meta name="dtb:uid" content="{uid}"/></head><docTitle><text>{esc(doc.get("title", ""))}</text></docTitle><navMap>{points}</navMap></ncx>')
    container = ('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                 '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for path, content in (("META-INF/container.xml", container), ("OEBPS/content.opf", opf), ("OEBPS/nav.xhtml", nav), ("OEBPS/toc.ncx", ncx), ("OEBPS/style.css", CSS)):
            z.writestr(path, content, compress_type=zipfile.ZIP_DEFLATED)
        for name, xhtml in files:
            z.writestr(f"OEBPS/{name}", xhtml, compress_type=zipfile.ZIP_DEFLATED)
        for name in used:
            z.writestr(f"OEBPS/images/{name}", media[name], compress_type=zipfile.ZIP_STORED)
    return buf.getvalue()
