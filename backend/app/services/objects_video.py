import hashlib
import re
import urllib.parse

from app.services import stock, store

YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"}
VIMEO_HOSTS = {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}
YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


class VideoError(ValueError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def parse(url: str) -> dict:
    text = (url or "").strip()
    if text and "://" not in text:
        text = "https://" + text
    p = urllib.parse.urlparse(text)
    host = (p.hostname or "").lower()
    parts = [x for x in p.path.split("/") if x]
    if host in YT_HOSTS:
        vid = ""
        if host == "youtu.be" and parts:
            vid = parts[0]
        elif parts and parts[0] in ("shorts", "embed", "live", "v") and len(parts) > 1:
            vid = parts[1]
        else:
            vid = (urllib.parse.parse_qs(p.query).get("v") or [""])[0]
        if not YT_ID.match(vid):
            raise VideoError(400, "That YouTube address does not name a video.")
        return {"provider": "youtube", "id": vid, "link": f"https://www.youtube.com/watch?v={vid}", "embed": f"https://www.youtube-nocookie.com/embed/{vid}"}
    if host in VIMEO_HOSTS:
        digits = [x for x in parts if x.isdigit()]
        if not digits:
            raise VideoError(400, "That Vimeo address does not name a video.")
        vid = digits[0]
        idx = parts.index(vid)
        key = parts[idx + 1] if idx + 1 < len(parts) and re.fullmatch(r"[0-9a-f]{6,20}", parts[idx + 1]) else (urllib.parse.parse_qs(p.query).get("h") or [""])[0]
        key = key if re.fullmatch(r"[0-9a-f]{6,20}", key or "") else ""
        link = f"https://vimeo.com/{vid}" + (f"/{key}" if key else "")
        return {"provider": "vimeo", "id": vid, "hash": key, "link": link, "embed": f"https://player.vimeo.com/video/{vid}"}
    raise VideoError(400, "Paste a YouTube or Vimeo video address.")


def _poster(urls: list[str]) -> tuple[bytes, str]:
    last: Exception | None = None
    for u in urls:
        try:
            data, ctype = stock._get(u, limit=4 * 1024 * 1024)
        except stock.StockError as exc:
            last = exc
            continue
        if data[:3] == b"\xff\xd8\xff":
            return data, "jpg"
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return data, "png"
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return data, "webp"
        last = VideoError(502, "The poster was not a picture.")
    raise VideoError(502, str(last) if last else "No poster frame could be fetched.")


def fetch(doc_id: str, url: str) -> dict:
    info = parse(url)
    title, author, thumbs = "", "", []
    try:
        if info["provider"] == "youtube":
            meta = stock._json("https://www.youtube.com/oembed?" + urllib.parse.urlencode({"url": info["link"], "format": "json"}))
            thumbs = [f"https://i.ytimg.com/vi/{info['id']}/maxresdefault.jpg", f"https://i.ytimg.com/vi/{info['id']}/mqdefault.jpg"]
        else:
            meta = stock._json("https://vimeo.com/api/oembed.json?" + urllib.parse.urlencode({"url": info["link"]}))
            if meta.get("thumbnail_url"):
                thumbs = [str(meta["thumbnail_url"])]
    except stock.StockError as exc:
        reason = "The video was not found, or it is private or cannot be embedded." if "answered 404" in str(exc) else str(exc).replace("picture service", "video provider")
        raise VideoError(exc.status, f"Could not read the video details. {reason}")
    title = str(meta.get("title") or "")[:200]
    author = str(meta.get("author_name") or "")[:120]
    if not thumbs:
        raise VideoError(502, "The provider did not give a poster frame.")
    data, ext = _poster(thumbs)
    name = f"{hashlib.sha256(data).hexdigest()[:20]}.{ext}"
    store.add_media(doc_id, name, data)
    width = int(meta.get("width") or 0)
    height = int(meta.get("height") or 0)
    return {**info, "title": title, "author": author, "poster": name, "bytes": len(data), "ratio": (width / height) if width and height and info["provider"] == "vimeo" else 16 / 9}
