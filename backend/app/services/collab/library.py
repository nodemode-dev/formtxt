import json
import re
import time

from app.core.ids import new_id
from app.services.collab import files

_COMPONENTS = {"items": {}}
_MACROS = {"items": {}}
_KEYS = re.compile(r"^(?:(?:Ctrl|Alt|Shift|Meta|Mod)\+)+[A-Za-z0-9]$|^F(?:[1-9]|1[0-2])$")


class Invalid(ValueError):
    pass


def _norm(blocks: object) -> str:
    def strip(v: object) -> object:
        if isinstance(v, dict):
            return {k: strip(x) for k, x in v.items() if k != "id"}
        if isinstance(v, list):
            return [strip(x) for x in v]
        return v

    return json.dumps(strip(blocks), sort_keys=True, ensure_ascii=False)


def _blocks(value: object) -> list:
    if not isinstance(value, list) or not value or len(value) > 500 or not all(isinstance(b, dict) and isinstance(b.get("type"), str) for b in value):
        raise Invalid("A component needs a list of blocks.")
    if len(json.dumps(value)) > 4_000_000:
        raise Invalid("That component is too large.")
    return value


def components() -> list[dict]:
    items = files.read("components.json", _COMPONENTS).get("items", {})
    return sorted(({k: v for k, v in c.items() if k != "blocks"} | {"blocks": len(c.get("blocks", []))} for c in items.values()), key=lambda c: c.get("modified", 0), reverse=True)


def component(cid: str) -> dict | None:
    c = files.read("components.json", _COMPONENTS).get("items", {}).get(cid)
    return c if isinstance(c, dict) else None


def create_component(name: str, blocks: object, source: str = "") -> dict:
    blocks = _blocks(blocks)
    now = time.time()
    item = {"id": new_id("cmp_"), "name": (name or "Component").strip()[:80], "rev": 1, "blocks": blocks, "source": source[:60], "created": now, "modified": now}
    files.update("components.json", _COMPONENTS, lambda d: d.setdefault("items", {}).__setitem__(item["id"], item))
    return item


def update_component(cid: str, name: str | None, blocks: object | None, source: str = "") -> tuple[dict, bool]:
    out: dict = {}
    changed = {"v": False}

    def change(d: dict) -> None:
        item = d.setdefault("items", {}).get(cid)
        if not isinstance(item, dict):
            raise Invalid("No component has that id.")
        if blocks is not None and _norm(_blocks(blocks)) != _norm(item.get("blocks")):
            item["blocks"] = blocks
            item["source"] = source[:60]
            changed["v"] = True
        if name and name.strip()[:80] != item.get("name"):
            item["name"] = name.strip()[:80]
            changed["v"] = True
        if changed["v"]:
            item["rev"] = int(item.get("rev", 1)) + 1
            item["modified"] = time.time()
        out.update(item)

    files.update("components.json", _COMPONENTS, change)
    return out, changed["v"]


def delete_component(cid: str) -> bool:
    found = {"v": False}

    def change(d: dict) -> None:
        found["v"] = d.setdefault("items", {}).pop(cid, None) is not None

    files.update("components.json", _COMPONENTS, change)
    return found["v"]


def _steps(value: object) -> list:
    if not isinstance(value, list) or len(value) > 500:
        raise Invalid("Steps are a list of up to 500 commands.")
    out = []
    for s in value:
        if not isinstance(s, dict) or not isinstance(s.get("cmd"), str) or not s["cmd"] or len(s["cmd"]) > 120:
            raise Invalid("Each step needs a command id.")
        params = s.get("params") if isinstance(s.get("params"), dict) else {}
        if len(json.dumps(params)) > 20000:
            raise Invalid("A step has too many parameters.")
        out.append({"cmd": s["cmd"], "params": params})
    return out


def macros() -> list[dict]:
    return sorted(files.read("macros.json", _MACROS).get("items", {}).values(), key=lambda m: m.get("name", "").lower())


def _clean_macro(data: dict, base: dict) -> dict:
    kind = data.get("kind", base.get("kind", "steps"))
    if kind not in ("steps", "script"):
        raise Invalid("A macro is steps or a script.")
    name = str(data.get("name", base.get("name", ""))).strip()[:80]
    if not name:
        raise Invalid("A macro needs a name.")
    keys = str(data.get("keys", base.get("keys", ""))).strip()
    if keys and not _KEYS.match(keys):
        raise Invalid("A shortcut is modifiers plus one key, such as Ctrl+Alt+1.")
    code = str(data.get("code", base.get("code", "")))
    if len(code) > 200_000:
        raise Invalid("That script is too long.")
    steps = _steps(data["steps"]) if "steps" in data else base.get("steps", [])
    return {"id": base.get("id") or new_id("mac_"), "name": name, "kind": kind, "steps": steps, "code": code, "keys": keys, "modified": time.time()}


def save_macro(data: dict, mid: str | None = None) -> dict:
    out: dict = {}

    def change(d: dict) -> None:
        items = d.setdefault("items", {})
        base = items.get(mid, {}) if mid else {}
        if mid and not base:
            raise Invalid("No macro has that id.")
        item = _clean_macro(data, base)
        if item["keys"] and any(m["keys"] == item["keys"] and m["id"] != item["id"] for m in items.values()):
            raise Invalid("Another macro already uses that shortcut.")
        items[item["id"]] = item
        out.update(item)

    files.update("macros.json", _MACROS, change)
    return out


def delete_macro(mid: str) -> bool:
    found = {"v": False}

    def change(d: dict) -> None:
        found["v"] = d.setdefault("items", {}).pop(mid, None) is not None

    files.update("macros.json", _MACROS, change)
    return found["v"]
