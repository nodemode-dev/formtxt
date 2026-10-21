import ipaddress
import json
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict

from app.core import config

OPENVERSE = "https://api.openverse.org/v1/images/"
PEXELS = "https://api.pexels.com/v1/"
UA = f"FormTxt/{config.VERSION} (local document editor)"
MAX_BYTES = 25 * 1024 * 1024
TIMEOUT = 20

_lock = threading.Lock()
_seen: "OrderedDict[str, dict]" = OrderedDict()
_thumbs: "OrderedDict[str, tuple[bytes, str]]" = OrderedDict()


class StockError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _remember(item: dict) -> None:
    with _lock:
        key = f"{item['source']}:{item['id']}"
        _seen[key] = item
        _seen.move_to_end(key)
        while len(_seen) > 2000:
            _seen.popitem(last=False)


def _public(url: str) -> None:
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("https", "http") or not p.hostname:
        raise StockError(400, "That picture address is not a web address.")
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise StockError(502, f"{p.hostname} could not be found.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise StockError(400, "Pictures are only fetched from public web addresses.")


class _CheckedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _public(newurl)
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and urllib.parse.urlparse(newurl).hostname != urllib.parse.urlparse(req.full_url).hostname:
            new.remove_header("Authorization")
        return new


_opener = urllib.request.build_opener(_CheckedRedirect)


def _get(url: str, headers: dict | None = None, limit: int = MAX_BYTES) -> tuple[bytes, str]:
    _public(url)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*", **(headers or {})})
    try:
        with _opener.open(req, timeout=TIMEOUT) as r:
            data = r.read(limit + 1)
            ctype = r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise StockError(401, "The picture service refused the request; check the API key in Preferences.")
        if e.code == 429:
            raise StockError(429, "The picture service is busy; try again in a minute.")
        raise StockError(502, f"The picture service answered {e.code}.")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise StockError(502, f"Could not reach the picture service ({getattr(e, 'reason', e)}).")
    if len(data) > limit:
        raise StockError(413, f"That picture is larger than {limit // (1024 * 1024)} MB.")
    return data, ctype


def _json(url: str, headers: dict | None = None) -> dict:
    data, _ = _get(url, {"Accept": "application/json", **(headers or {})}, 4 * 1024 * 1024)
    try:
        return json.loads(data)
    except ValueError:
        raise StockError(502, "The picture service sent something that is not JSON.")


def _pexels_key() -> str:
    return str(config.read_settings().get("pexelsKey") or "").strip()


def sources() -> list[dict]:
    return [{"id": "openverse", "name": "Openverse", "ready": True, "note": "Openly licensed pictures (Creative Commons and public domain) from WordPress's Openverse."},
            {"id": "pexels", "name": "Pexels", "ready": bool(_pexels_key()), "note": "Free photos from Pexels; needs a free API key from pexels.com/api, added in Preferences."}]


def search(source: str, q: str, page: int = 1, per: int = 24) -> dict:
    q = q.strip()[:200]
    if not q:
        raise StockError(400, "Type what the picture should show.")
    page = max(1, min(50, page))
    per = max(1, min(40, per))
    if source == "openverse":
        data = _json(f"{OPENVERSE}?{urllib.parse.urlencode({'q': q, 'page': page, 'page_size': per, 'mature': 'false'})}")
        items = []
        for r in data.get("results", []):
            if not r.get("id") or not r.get("url"):
                continue
            lic = str(r.get("license") or "").upper()
            ver = str(r.get("license_version") or "")
            items.append({"source": "openverse", "id": str(r["id"]), "title": str(r.get("title") or "")[:200], "width": r.get("width"), "height": r.get("height"),
                          "creator": str(r.get("creator") or "")[:120], "creatorUrl": str(r.get("creator_url") or ""), "license": ("CC0" if lic == "CC0" else "Public domain" if lic == "PDM" else f"CC {lic} {ver}".strip()),
                          "licenseUrl": str(r.get("license_url") or ""), "sourceUrl": str(r.get("foreign_landing_url") or ""), "provider": str(r.get("provider") or r.get("source") or "Openverse"),
                          "full": str(r["url"]), "thumbUrl": str(r.get("thumbnail") or f"{OPENVERSE}{r['id']}/thumb/")})
        total = int(data.get("result_count") or len(items))
    elif source == "pexels":
        key = _pexels_key()
        if not key:
            raise StockError(401, "Add a Pexels API key in Preferences to search Pexels (free at pexels.com/api).")
        data = _json(f"{PEXELS}search?{urllib.parse.urlencode({'query': q, 'page': page, 'per_page': per})}", {"Authorization": key})
        items = []
        for r in data.get("photos", []):
            src = r.get("src") or {}
            if not r.get("id") or not src:
                continue
            items.append({"source": "pexels", "id": str(r["id"]), "title": str(r.get("alt") or "")[:200], "width": r.get("width"), "height": r.get("height"),
                          "creator": str(r.get("photographer") or "")[:120], "creatorUrl": str(r.get("photographer_url") or ""), "license": "Pexels License",
                          "licenseUrl": "https://www.pexels.com/license/", "sourceUrl": str(r.get("url") or ""), "provider": "Pexels",
                          "full": str(src.get("large2x") or src.get("large") or src.get("original") or ""), "thumbUrl": str(src.get("medium") or src.get("small") or src.get("tiny") or "")})
        total = int(data.get("total_results") or len(items))
    else:
        raise StockError(400, "source must be openverse or pexels.")
    for it in items:
        _remember(it)
    public = [{k: v for k, v in it.items() if k not in ("full", "thumbUrl")} for it in items]
    return {"source": source, "query": q, "page": page, "total": total, "items": public}


def _item(source: str, item_id: str) -> dict:
    with _lock:
        hit = _seen.get(f"{source}:{item_id}")
    if not hit:
        raise StockError(404, "Search again; that picture is no longer in the recent results.")
    return hit


def thumb(source: str, item_id: str) -> tuple[bytes, str]:
    key = f"{source}:{item_id}"
    with _lock:
        if key in _thumbs:
            _thumbs.move_to_end(key)
            return _thumbs[key]
    it = _item(source, item_id)
    data, ctype = _get(it["thumbUrl"], limit=3 * 1024 * 1024)
    if not ctype.startswith("image/"):
        ctype = "image/jpeg"
    with _lock:
        _thumbs[key] = (data, ctype)
        while len(_thumbs) > 300:
            _thumbs.popitem(last=False)
    return data, ctype


def download(source: str, item_id: str) -> tuple[bytes, dict]:
    it = _item(source, item_id)
    data, _ = _get(it["full"])
    credit = {k: it[k] for k in ("source", "id", "title", "creator", "creatorUrl", "license", "licenseUrl", "sourceUrl", "provider")}
    return data, credit


def credit_text(c: dict) -> str:
    who = c.get("creator") or "unknown creator"
    if c.get("source") == "pexels":
        return f"Photo by {who} on Pexels"
    title = f"\"{c['title']}\" " if c.get("title") else ""
    return f"{title}by {who}, {c.get('license') or 'licence unknown'}, via {c.get('provider') or 'Openverse'}".strip()
