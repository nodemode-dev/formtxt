import json
import re
import threading

from app.core import config

_lock = threading.Lock()

RULES = ("list", "smartQuotes", "dashes", "symbols", "arrows", "fractions", "capitalize", "ellipsis")
GRAMMAR_RULES = ("repeated", "article", "capital", "spaces", "punctuation", "long", "passive", "wordy", "confusion", "formal", "inclusive", "vocabulary", "agreement", "pronoun", "modal", "negation", "fewer", "comparison", "fragment", "splice")

DEFAULTS: dict = {
    "dictionary": [],
    "spelling": True,
    "grammar": True,
    "grammarRules": {k: k != "formal" for k in GRAMMAR_RULES},
    "autocorrect": {
        "enabled": True,
        "rules": {k: (k != "capitalize") for k in RULES},
        "entries": {},
        "removed": [],
        "disabled": [],
    },
}


def _path():
    return config.data_dir() / "proofing.json"


def _clean_word(w: object) -> str:
    return re.sub(r"\s+", "", str(w or ""))[:60]


def read() -> dict:
    try:
        raw = json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raw = {}
    return merge(DEFAULTS, raw)


def merge(base: dict, patch: dict) -> dict:
    out = json.loads(json.dumps(base))
    if not isinstance(patch, dict):
        return out
    if isinstance(patch.get("dictionary"), list):
        seen: list[str] = []
        for w in patch["dictionary"]:
            w = _clean_word(w)
            if w and w not in seen:
                seen.append(w)
        out["dictionary"] = sorted(seen, key=str.lower)[:20000]
    for key in ("spelling", "grammar"):
        if key in patch:
            out[key] = bool(patch[key])
    if isinstance(patch.get("grammarRules"), dict):
        for k in GRAMMAR_RULES:
            if k in patch["grammarRules"]:
                out["grammarRules"][k] = bool(patch["grammarRules"][k])
    ac = patch.get("autocorrect")
    if isinstance(ac, dict):
        if "enabled" in ac:
            out["autocorrect"]["enabled"] = bool(ac["enabled"])
        if isinstance(ac.get("rules"), dict):
            for k in RULES:
                if k in ac["rules"]:
                    out["autocorrect"]["rules"][k] = bool(ac["rules"][k])
        if isinstance(ac.get("entries"), dict):
            entries = {}
            for k, v in list(ac["entries"].items())[:5000]:
                k = str(k).strip()[:60]
                if k and not re.search(r"\s", k) and isinstance(v, str):
                    entries[k] = v[:200]
            out["autocorrect"]["entries"] = entries
        for key in ("removed", "disabled"):
            if isinstance(ac.get(key), list):
                out["autocorrect"][key] = sorted({str(x)[:60] for x in ac[key]})[:5000]
    return out


def write(patch: dict) -> dict:
    with _lock:
        merged = merge(read(), patch)
        tmp = _path().with_suffix(".tmp")
        tmp.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(_path())
        return merged


def personal_words() -> set[str]:
    return {w for w in read()["dictionary"]}
