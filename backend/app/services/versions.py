import difflib
import hashlib
import io
import json
import os
import re
import shutil
import threading
import time
import zipfile
from pathlib import Path

from app.core import config
from app.services import model, secrets, versions_vault as vault

AUTO_GAP = 300.0
MAX_AUTO = 100
MAX_NAMED = 200
AGENT_SECONDS = 8.0
_lock = threading.RLock()
_agent_until = 0.0
VID = re.compile(r"^v_\d{10,16}$")


def agent_mark() -> None:
    global _agent_until
    _agent_until = time.time() + AGENT_SECONDS


def is_agent() -> bool:
    return time.time() < _agent_until


_hint = threading.local()


def set_editor_hint(by: str) -> None:
    _hint.by = by if by in ("agent", "person", "both") else ""


def actor(doc: dict | None = None) -> str:
    person = str(config.read_settings().get("author") or ((doc or {}).get("meta") or {}).get("author") or "You")[:80]
    by = getattr(_hint, "by", "")
    if by == "agent":
        return "Agent"
    if by == "both":
        return f"{person} and Agent"
    if by == "person":
        return person
    if is_agent():
        return "Agent"
    return person


def _root(doc_id: str) -> Path:
    path = config.data_dir() / "Versions" / doc_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _index_path(doc_id: str) -> Path:
    return _root(doc_id) / "index.json"


def _read_index(doc_id: str) -> list[dict]:
    try:
        return json.loads(_index_path(doc_id).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def _write_index(doc_id: str, rows: list[dict]) -> None:
    tmp = _index_path(doc_id).with_suffix(".tmp")
    tmp.write_text(json.dumps(rows), encoding="utf-8")
    tmp.replace(_index_path(doc_id))


def content_hash(doc: dict) -> str:
    body = {k: v for k, v in doc.items() if k != "meta"}
    meta = {k: v for k, v in (doc.get("meta") or {}).items() if k != "modified"}
    return hashlib.sha1(json.dumps([body, meta], sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _thin(rows: list[dict], now: float) -> list[dict]:
    keep: list[dict] = []
    seen: set[tuple[str, int]] = set()
    autos = sorted((r for r in rows if r.get("auto") and not r.get("name")), key=lambda r: -r["ts"])
    drop: set[str] = set()
    for r in autos:
        age = now - r["ts"]
        if age < 3600:
            continue
        bucket = ("h", int(r["ts"] // 3600)) if age < 86400 else ("d", int(r["ts"] // 86400))
        if bucket in seen:
            drop.add(r["id"])
        else:
            seen.add(bucket)
    autos = [r for r in autos if r["id"] not in drop]
    for r in autos[MAX_AUTO:]:
        drop.add(r["id"])
    named = sorted((r for r in rows if not (r.get("auto") and not r.get("name"))), key=lambda r: -r["ts"])
    for r in named[MAX_NAMED:]:
        drop.add(r["id"])
    for r in rows:
        if r["id"] in drop:
            (_root(r["doc"]) / f"{r['id']}.ftxt").unlink(missing_ok=True)
        else:
            keep.append(r)
    return keep


def snapshot(doc: dict, data: bytes, name: str = "", auto: bool = True, reason: str = "") -> dict | None:
    doc_id = doc["id"]
    digest = content_hash(doc)
    now = time.time()
    with _lock:
        rows = _read_index(doc_id)
        last = max(rows, key=lambda r: r["ts"], default=None)
        if last and last.get("hash") == digest:
            if name and not last.get("name"):
                last["name"] = name
                last["auto"] = False
                _write_index(doc_id, rows)
                return last
            if not name:
                return None
        vid = f"v_{int(now * 1000)}"
        (_root(doc_id) / f"{vid}.ftxt").write_bytes(data)
        row = {"id": vid, "doc": doc_id, "ts": now, "name": name[:120], "auto": auto, "author": actor(doc), "words": model.summary(doc)["words"], "bytes": len(data), "hash": digest, "reason": reason}
        rows.append(row)
        _write_index(doc_id, _thin(rows, now))
        return row


def after_save(doc: dict, data: bytes) -> None:
    try:
        log(doc["id"], "edit", doc=doc)
        rows = _read_index(doc["id"])
        last = max((r["ts"] for r in rows), default=0.0)
        if time.time() - last >= AUTO_GAP:
            snapshot(doc, data)
        copy_out(doc, data)
    except Exception:
        pass


def on_open(doc_id: str) -> dict:
    from app.services import store
    data = store._path(doc_id).read_bytes()
    doc, _ = vault.unpack(data)
    log(doc_id, "open", doc=doc)
    row = snapshot(doc, data, reason="open")
    return {"snapshot": bool(row)}


def listing(doc_id: str) -> list[dict]:
    rows = sorted(_read_index(doc_id), key=lambda r: -r["ts"])
    return [{k: v for k, v in r.items() if k not in ("doc", "hash")} for r in rows]


def _find(doc_id: str, vid: str) -> dict:
    if not VID.match(vid):
        raise LookupError(vid)
    for r in _read_index(doc_id):
        if r["id"] == vid:
            return r
    raise LookupError(vid)


def load_version(doc_id: str, vid: str) -> tuple[dict, dict[str, bytes], dict]:
    row = _find(doc_id, vid)
    data = (_root(doc_id) / f"{vid}.ftxt").read_bytes()
    doc, media = vault.unpack(data)
    return doc, media, row


def rename(doc_id: str, vid: str, name: str) -> dict:
    with _lock:
        rows = _read_index(doc_id)
        for r in rows:
            if r["id"] == vid:
                r["name"] = name.strip()[:120]
                r["auto"] = not r["name"]
                _write_index(doc_id, rows)
                return r
    raise LookupError(vid)


def remove(doc_id: str, vid: str) -> None:
    with _lock:
        rows = _read_index(doc_id)
        _find(doc_id, vid)
        (_root(doc_id) / f"{vid}.ftxt").unlink(missing_ok=True)
        _write_index(doc_id, [r for r in rows if r["id"] != vid])


def name_current(doc_id: str, name: str) -> dict:
    from app.services import store
    data = store._path(doc_id).read_bytes()
    doc, _ = vault.unpack(data)
    row = snapshot(doc, data, name=name or time.strftime("Version %Y-%m-%d %H:%M"), auto=False, reason="named")
    log(doc_id, "version", doc=doc, detail=row["name"] if row else name)
    return row or {}


def restore(doc_id: str, vid: str) -> dict:
    from app.services import store
    old, media, row = load_version(doc_id, vid)
    data = store._path(doc_id).read_bytes()
    cur, _ = vault.unpack(data)
    snapshot(cur, data, name="Before restore", auto=False, reason="before-restore")
    old["id"] = doc_id
    saved = store.save(old, media)
    fresh = store._path(doc_id).read_bytes()
    label = row.get("name") or time.strftime("%Y-%m-%d %H:%M", time.localtime(row["ts"]))
    doc, _ = vault.unpack(fresh)
    snapshot(doc, fresh, name=f"Restored from {label}"[:120], auto=False, reason="restore")
    log(doc_id, "restore", doc=doc, detail=label)
    return saved


def outline(doc: dict, limit: int = 600) -> list[dict]:
    out: list[dict] = []
    for tab in doc.get("tabs", []):
        for block in tab.get("body", []):
            if block.get("type") == "table":
                text = " | ".join(" ".join(_run_text(r) for r in model_runs(c.get("body") or [])) for row in block.get("rows") or [] for c in (row or {}).get("cells") or [])
                out.append({"style": "Table", "text": text[:300]})
            elif block.get("type") == "paragraph":
                out.append({"style": block.get("style", "Normal"), "text": "".join(_run_text(r) for r in block.get("content") or [])})
            elif block.get("type") == "signatureLine":
                out.append({"style": "Signature", "text": "\n".join(str(block.get(k) or "") for k in ("signer", "title", "instructions") if block.get(k))})
            elif block.get("type") == "code":
                out.append({"style": "Code", "text": str(block.get("text", ""))[:300]})
            elif block.get("type") in ("pageBreak", "sectionBreak"):
                out.append({"style": "Break", "text": ""})
            if len(out) >= limit:
                return out
    return out


def model_runs(blocks: list):
    return list(model.iter_runs(blocks))


def _run_text(run: dict) -> str:
    if not isinstance(run, dict):
        return ""
    if run.get("type") == "text":
        return str(run.get("text", ""))
    if run.get("type") == "field":
        return str(run.get("result", ""))
    if run.get("type") == "control":
        return str(run.get("text") or run.get("placeholder") or "")
    if run.get("type") == "mergefield":
        return "<<" + str(run.get("name", "")) + ">>"
    if run.get("type") == "tab":
        return " "
    return str(run.get("text", "")) if run.get("type") == "chip" else ""


def words_of(doc: dict) -> list[str]:
    return " ".join(p["text"] for p in outline(doc, 100000)).split()


def diff(old: dict, new: dict) -> dict:
    a, b = words_of(old), words_of(new)
    out = {"wordsThen": len(a), "wordsNow": len(b), "added": 0, "removed": 0, "changes": []}
    if len(a) + len(b) > 40000:
        out["added"] = max(0, len(b) - len(a))
        out["removed"] = max(0, len(a) - len(b))
        return out
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        out["removed"] += i2 - i1
        out["added"] += j2 - j1
        if len(out["changes"]) < 12:
            out["changes"].append({"removed": " ".join(a[i1:i2])[:160], "added": " ".join(b[j1:j2])[:160]})
    return out


def _activity_path(doc_id: str) -> Path:
    folder = config.data_dir() / "Activity"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{doc_id}.json"


def log(doc_id: str, kind: str, doc: dict | None = None, detail: str = "") -> None:
    who = actor(doc)
    now = time.time()
    with _lock:
        try:
            rows = json.loads(_activity_path(doc_id).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            rows = []
        last = rows[-1] if rows else None
        if kind == "edit" and last and last["kind"] == "edit" and last["who"] == who and now - last["until"] < 600:
            last["until"] = now
            last["count"] += 1
        elif kind == "open" and last and last["kind"] == "open" and last["who"] == who and now - last["until"] < 30:
            last["until"] = now
        else:
            rows.append({"ts": now, "until": now, "who": who, "kind": kind, "count": 1, "detail": detail[:200]})
        tmp = _activity_path(doc_id).with_suffix(".tmp")
        tmp.write_text(json.dumps(rows[-500:]), encoding="utf-8")
        tmp.replace(_activity_path(doc_id))


def activity(doc_id: str) -> list[dict]:
    try:
        rows = json.loads(_activity_path(doc_id).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        rows = []
    return list(reversed(rows))


def cloud_folder() -> str:
    return str(config.read_settings().get("cloudFolder") or "")


def _cloud_secret_path() -> Path:
    return config.data_dir() / "cloud.json"


def _cloud_user_file() -> dict:
    try:
        raw = json.loads(_cloud_secret_path().read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, ValueError):
        return {}


def _cloud_legacy_clear() -> None:
    raw = _cloud_user_file()
    if "password" in raw:
        raw.pop("password")
        path = _cloud_secret_path()
        path.write_text(json.dumps(raw), encoding="utf-8")
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass


def _cloud_auth() -> tuple[str, str]:
    raw = _cloud_user_file()
    password = secrets.get("cloud-password", lambda: str(raw.get("password", "")) or None, _cloud_legacy_clear)
    return str(raw.get("user", "")), password or ""


def cloud_status() -> dict:
    user, password = _cloud_auth()
    return {"folder": cloud_folder(), "user": user, "passwordSet": bool(password)}


def _dav_request(method: str, url: str, data: bytes | None = None, headers: dict | None = None, timeout: float = 20) -> tuple[int, bytes]:
    import base64
    import urllib.error
    import urllib.request
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    user, password = _cloud_auth()
    if user or password:
        req.add_header("Authorization", "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read(64 * 1024 * 1024)
    except urllib.error.HTTPError as exc:
        return exc.code, b""


def is_dav(folder: str) -> bool:
    return folder.startswith(("http://", "https://"))


def _dav_name(doc: dict) -> str:
    import urllib.parse
    name = "".join(c for c in str(doc.get("title", "")) if c.isalnum() or c in " -_").strip() or "document"
    return urllib.parse.quote(f"{name} ({doc['id'][2:8]}).ftxt")


def dav_list() -> list[dict]:
    import urllib.parse
    from xml.etree import ElementTree
    folder = cloud_folder()
    if not is_dav(folder):
        raise ValueError("Cloud storage is not set to a WebDAV address.")
    status, body = _dav_request("PROPFIND", folder, b'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/><d:getcontentlength/></d:prop></d:propfind>', {"Depth": "1", "Content-Type": "application/xml"})
    if status not in (200, 207):
        raise ValueError(f"The cloud folder answered {status}.")
    out = []
    for resp in ElementTree.fromstring(body).iter("{DAV:}response"):
        href = resp.findtext("{DAV:}href") or ""
        name = urllib.parse.unquote(href.rstrip("/").rsplit("/", 1)[-1])
        if not name.endswith(".ftxt"):
            continue
        out.append({"name": name, "href": href, "modified": resp.findtext(".//{DAV:}getlastmodified") or "", "bytes": int(resp.findtext(".//{DAV:}getcontentlength") or 0)})
    return out


def dav_fetch(name: str) -> bytes:
    import urllib.parse
    folder = cloud_folder()
    if not is_dav(folder) or "/" in name or not name.endswith(".ftxt"):
        raise ValueError("Choose a .ftxt file from the cloud folder.")
    status, body = _dav_request("GET", folder.rstrip("/") + "/" + urllib.parse.quote(name))
    if status != 200 or not body:
        raise ValueError(f"The cloud folder answered {status}.")
    return body


def set_cloud_folder(folder: str, user: str = "", password: str = "") -> str:
    folder = folder.strip()
    if is_dav(folder):
        import urllib.parse
        parts = urllib.parse.urlsplit(folder)
        if parts.username or parts.password:
            user, password = urllib.parse.unquote(parts.username or ""), urllib.parse.unquote(parts.password or "")
            folder = urllib.parse.urlunsplit((parts.scheme, parts.hostname + (f":{parts.port}" if parts.port else ""), parts.path, "", ""))
        if not folder.endswith("/"):
            folder += "/"
        if user or password:
            path = _cloud_secret_path()
            path.write_text(json.dumps({"user": user}), encoding="utf-8")
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
            if password:
                secrets.put("cloud-password", password, _cloud_legacy_clear)
        try:
            status, _ = _dav_request("PROPFIND", folder, None, {"Depth": "0"}, timeout=10)
        except OSError as exc:
            raise ValueError(f"Could not reach that address ({exc}).") from exc
        if status == 401:
            raise ValueError("The cloud folder refused the user name or password.")
        if status not in (200, 207):
            raise ValueError(f"That address is not a WebDAV folder (it answered {status}).")
        config.write_settings({"cloudFolder": folder})
        return folder
    if folder:
        path = Path(folder).expanduser()
        if not path.is_dir():
            raise ValueError("That folder does not exist on this computer.")
        probe = path / ".formtxt-write-test"
        try:
            probe.write_text("ok")
            probe.unlink()
        except OSError as exc:
            raise ValueError("FormTxt cannot write to that folder.") from exc
        folder = str(path)
    config.write_settings({"cloudFolder": folder})
    return folder


def copy_out(doc: dict, data: bytes) -> None:
    folder = cloud_folder()
    if is_dav(folder):
        url = folder.rstrip("/") + "/" + _dav_name(doc)

        def push() -> None:
            try:
                status, _ = _dav_request("PUT", url, data, {"Content-Type": "application/zip"})
                log(doc["id"], "cloud", doc=doc, detail="Saved to cloud storage" if status in (200, 201, 204) else f"Cloud save failed ({status})")
            except OSError as exc:
                log(doc["id"], "cloud", doc=doc, detail=f"Cloud save failed ({exc})")
        threading.Thread(target=push, daemon=True).start()
        return
    if not folder or not Path(folder).is_dir():
        return
    name = "".join(c for c in str(doc.get("title", "")) if c.isalnum() or c in " -_").strip() or "document"
    target = Path(folder) / f"{name} ({doc['id'][2:8]}).ftxt"
    tmp = target.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(target)


def reseal_versions(doc_id: str, key: tuple[bytes, bytes, int] | None) -> None:
    root = _root(doc_id)
    with _lock:
        for r in _read_index(doc_id):
            path = root / f"{r['id']}.ftxt"
            try:
                data = path.read_bytes()
                plain = vault.open_plain(data)
                if key:
                    doc = json.loads(zipfile.ZipFile(io.BytesIO(plain)).read("document.json").decode("utf-8"))
                    plain = vault.seal(plain, doc, key)
                path.write_bytes(plain)
            except Exception:
                continue


def forget(doc_id: str) -> None:
    shutil.rmtree(config.data_dir() / "Versions" / doc_id, ignore_errors=True)


def _para_texts(doc: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for tab in doc.get("tabs") or []:
        for block in tab.get("body") or []:
            if isinstance(block, dict) and block.get("id") and block.get("type", "paragraph") == "paragraph":
                out[str(block["id"])] = "".join(_run_text(r) for r in block.get("content") or [])
    return out


def editors(doc_id: str, ids: list[str]) -> dict[str, list[dict]]:
    want = set(ids)
    seen: dict[str, str] = {}
    out: dict[str, list[dict]] = {i: [] for i in ids}
    for row in sorted(_read_index(doc_id), key=lambda r: r["ts"]):
        try:
            doc, _media, _row = load_version(doc_id, row["id"])
        except (OSError, LookupError, ValueError):
            continue
        for pid, text in _para_texts(doc).items():
            if pid not in want or seen.get(pid) == text:
                continue
            seen[pid] = text
            who = str(row.get("author") or "You")
            hist = out[pid]
            if hist and hist[-1]["author"] == who:
                hist[-1]["time"] = row["ts"]
            else:
                hist.append({"author": who, "time": row["ts"]})
    return out
