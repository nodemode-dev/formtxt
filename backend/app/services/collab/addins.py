import base64
import io
import json
import re
import shutil
import zipfile

from app.services.collab import files

PERMISSIONS = {
    "read": "Read the document text and your selection",
    "write": "Insert or replace text",
    "commands": "Run formatting and editing commands",
    "display": "Show a result in the Add-ins window",
}
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")
_STATE = {"enabled": {}}
MAX_SCRIPT = 200_000

SAMPLES = {
    "word-frequency": {
        "manifest": {"id": "word-frequency", "name": "Word frequency", "version": "1.0.0", "author": "FormTxt", "description": "Lists the ten words you use most in the document.", "permissions": ["read", "display"], "script": "main.js"},
        "script": """const text = (await ft.text()).toLowerCase();
const stop = new Set(['the','a','an','and','or','of','to','in','is','it','for','on','as','at','by','be','with','that','this','are','was']);
const counts = new Map();
for (const w of text.match(/[a-z']+/g) || []) { if (w.length > 2 && !stop.has(w)) counts.set(w, (counts.get(w) || 0) + 1); }
const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
await ft.show(top.length ? top.map(([w, n]) => w + ': ' + n).join('\\n') : 'No words to count yet.');
""",
    },
    "lorem-text": {
        "manifest": {"id": "lorem-text", "name": "Lorem text", "version": "1.0.0", "author": "FormTxt", "description": "Inserts three paragraphs of placeholder text at the cursor.", "permissions": ["write"], "script": "main.js"},
        "script": """const base = ['Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.', 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'];
await ft.insert(base.join('\\n'));
""",
    },
    "title-case": {
        "manifest": {"id": "title-case", "name": "Title case", "version": "1.0.0", "author": "FormTxt", "description": "Turns the selected text into Title Case.", "permissions": ["read", "write", "display"], "script": "main.js"},
        "script": """const sel = await ft.selection();
if (!sel) { await ft.show('Select some text first.'); }
else {
  const small = new Set(['a','an','and','as','at','but','by','for','in','nor','of','on','or','the','to','up']);
  const out = sel.toLowerCase().replace(/[A-Za-z']+/g, (w, i) => (i > 0 && small.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
  await ft.replaceSelection(out);
}
""",
    },
}


class Invalid(ValueError):
    pass


def _clean_manifest(raw: object) -> dict:
    if not isinstance(raw, dict):
        raise Invalid("The manifest must be a JSON object.")
    ident = str(raw.get("id", "")).strip().lower()
    if not SLUG.match(ident):
        raise Invalid("The manifest id uses 2 to 41 lowercase letters, digits or dashes.")
    perms = raw.get("permissions", [])
    if not isinstance(perms, list) or any(p not in PERMISSIONS for p in perms):
        raise Invalid("Permissions can be: " + ", ".join(PERMISSIONS) + ".")
    prefixes = raw.get("commandPrefixes", [])
    if not isinstance(prefixes, list) or any(not isinstance(p, str) or not re.fullmatch(r"[A-Za-z0-9.]{1,40}", p) for p in prefixes):
        raise Invalid("commandPrefixes is a list of command id prefixes such as format.")
    return {"id": ident, "name": str(raw.get("name") or ident)[:80], "version": str(raw.get("version") or "0.0.0")[:20], "author": str(raw.get("author") or "")[:80],
            "description": str(raw.get("description") or "")[:300], "permissions": sorted(set(perms)), "commandPrefixes": prefixes[:20], "script": "main.js"}


def _enabled() -> dict:
    return files.read("addins-state.json", _STATE).get("enabled", {})


def _item(manifest: dict, bundled: bool) -> dict:
    on = _enabled().get(manifest["id"], bundled)
    return {**manifest, "bundled": bundled, "enabled": bool(on)}


def listing() -> list[dict]:
    out = [_item(_clean_manifest(s["manifest"]), True) for s in SAMPLES.values()]
    root = files.addins_dir()
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        try:
            manifest = _clean_manifest(json.loads((folder / "manifest.json").read_text(encoding="utf-8")))
        except (OSError, ValueError, Invalid):
            continue
        if manifest["id"] in SAMPLES or not (folder / manifest["script"]).is_file():
            continue
        out.append(_item(manifest, False))
    return out


def script(ident: str) -> str:
    if ident in SAMPLES:
        return SAMPLES[ident]["script"]
    if not SLUG.match(ident):
        raise Invalid("No add-in has that id.")
    path = files.addins_dir() / ident / "main.js"
    if not path.is_file():
        raise Invalid("No add-in has that id.")
    return path.read_text(encoding="utf-8")[:MAX_SCRIPT]


def set_enabled(ident: str, on: bool) -> None:
    if ident not in {a["id"] for a in listing()}:
        raise Invalid("No add-in has that id.")
    files.update("addins-state.json", _STATE, lambda d: d.setdefault("enabled", {}).__setitem__(ident, bool(on)))


def _from_upload(name: str, data: bytes) -> tuple[dict, str]:
    if name.lower().endswith(".zip") or data[:2] == b"PK":
        try:
            z = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as exc:
            raise Invalid("That file is not a zip archive.") from exc
        names = [n for n in z.namelist() if not n.endswith("/") and ".." not in n]
        man = next((n for n in names if n.split("/")[-1] == "manifest.json"), None)
        if not man:
            raise Invalid("The archive has no manifest.json.")
        if z.getinfo(man).file_size > 1_000_000:
            raise Invalid("That add-in is too large.")
        manifest =_clean_manifest(json.loads(z.read(man).decode("utf-8")))
        raw = json.loads(z.read(man).decode("utf-8"))
        entry = str(raw.get("script") or "main.js")
        base = man[: -len("manifest.json")]
        if base + entry not in names:
            raise Invalid("The archive has no script named " + entry + ".")
        if z.getinfo(base + entry).file_size > MAX_SCRIPT * 4:
            raise Invalid("That script is too long.")
        code =z.read(base + entry).decode("utf-8")
        return manifest, code
    try:
        raw = json.loads(data.decode("utf-8"))
    except ValueError as exc:
        raise Invalid("Choose an add-in .json file (manifest fields plus a script) or a .zip.") from exc
    if not isinstance(raw, dict) or not isinstance(raw.get("script"), str):
        raise Invalid("The add-in file needs manifest fields and a script text.")
    return _clean_manifest(raw), raw["script"]


def install(name: str, b64: str) -> dict:
    try:
        data = base64.b64decode(b64, validate=False)
    except ValueError as exc:
        raise Invalid("The file could not be read.") from exc
    if len(data) > 2_000_000:
        raise Invalid("That add-in is too large.")
    manifest, code = _from_upload(name, data)
    if manifest["id"] in SAMPLES:
        raise Invalid("That id belongs to a bundled add-in.")
    if len(code) > MAX_SCRIPT:
        raise Invalid("That script is too long.")
    folder = files.addins_dir() / manifest["id"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    (folder / "main.js").write_text(code, encoding="utf-8")
    set_enabled(manifest["id"], False)
    return _item(manifest, False)


def remove(ident: str) -> None:
    if ident in SAMPLES or not SLUG.match(ident):
        raise Invalid("Bundled add-ins can be disabled but not removed.")
    folder = files.addins_dir() / ident
    if not folder.is_dir():
        raise Invalid("No add-in has that id.")
    shutil.rmtree(folder)
    files.update("addins-state.json", _STATE, lambda d: d.setdefault("enabled", {}).pop(ident, None))
