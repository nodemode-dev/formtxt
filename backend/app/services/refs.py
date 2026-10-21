import html
import re
import urllib.error
import urllib.parse
import urllib.request

from app.core import config
from app.services import stock

MAX_READ = 262144
TIMEOUT = 6

_META = re.compile(r"<meta\b[^>]*>", re.I | re.S)
_ATTR = re.compile(r"([a-zA-Z:_-]+)\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)")
_TITLE = re.compile(r"<title\b[^>]*>(.*?)</title>", re.I | re.S)


class RefsError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _clean(text: str, limit: int) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", "", text))).strip()[:limit]


def host_of(url: str) -> str:
    host = urllib.parse.urlparse(url).hostname or ""
    return host[4:] if host.startswith("www.") else host


def _decode(data: bytes, ctype: str) -> str:
    m = re.search(r"charset=([\w-]+)", ctype, re.I) or re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", data[:4096], re.I)
    enc = (m.group(1).decode("ascii", "ignore") if m and isinstance(m.group(1), bytes) else m.group(1) if m else "utf-8")
    try:
        return data.decode(enc, "replace")
    except LookupError:
        return data.decode("utf-8", "replace")


def _soft(url: str, reason: str) -> dict:
    return {"url": url, "title": "", "site": host_of(url), "fetched": False, "reason": reason}


def page_info(url: str) -> dict:
    url = url.strip()
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise RefsError(400, "Link previews work for web addresses that start with http or https.")
    if config.read_settings().get("linkPreviews") is False:
        raise RefsError(403, "Link previews are turned off in Preferences.")
    try:
        stock._public(url)
    except stock.StockError as e:
        return _soft(url, "Link previews are only fetched from public web addresses." if e.status == 400 else str(e))
    req = urllib.request.Request(url, headers={"User-Agent": stock.UA, "Accept": "text/html,application/xhtml+xml;q=0.9"})
    try:
        with stock._opener.open(req, timeout=TIMEOUT) as r:
            ctype = r.headers.get("content-type", "")
            if "html" not in ctype.lower():
                return {"url": url, "title": "", "site": host_of(url), "fetched": False}
            data = r.read(MAX_READ)
            final = r.geturl()
    except stock.StockError as e:
        return _soft(url, "Link previews are only fetched from public web addresses." if e.status == 400 else str(e))
    except urllib.error.HTTPError as e:
        return _soft(url, f"The page answered {e.code}.")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return _soft(url, f"Could not reach the page ({getattr(e, 'reason', e)}).")
    body = _decode(data, ctype)
    metas: dict[str, str] = {}
    for tag in _META.findall(body):
        attrs = {k.lower(): v.strip("\"'") for k, v in _ATTR.findall(tag)}
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        if key and "content" in attrs and key not in metas:
            metas[key] = attrs["content"]
    t = _TITLE.search(body)
    title = _clean(metas.get("og:title") or (t.group(1) if t else "") or metas.get("twitter:title", ""), 200)
    site = _clean(metas.get("og:site_name", ""), 80) or host_of(final or url)
    desc = _clean(metas.get("og:description") or metas.get("description") or metas.get("twitter:description", ""), 300)
    return {"url": url, "title": title, "site": site, "description": desc, "fetched": True}
