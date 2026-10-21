import os
import re
import threading
from pathlib import Path

from app.core import config

POS = {"n": ("noun", "noun"), "v": ("verb", "verb"), "a": ("adj", "adjective"), "s": ("adj", "adjective"), "r": ("adv", "adverb")}
FILES = ("noun", "verb", "adj", "adv")
_lock = threading.Lock()
_index: dict[str, dict[str, list[int]]] | None = None
_handles: dict[str, object] = {}


def _dir() -> Path | None:
    for root in (os.environ.get("FORMTXT_WORDNET_DIR"), config.REPO_DIR / "frontend" / "node_modules" / "wordnet-db" / "dict", config.BACKEND_DIR / "wordnet"):
        if root and (Path(root) / "index.noun").is_file():
            return Path(root)
    return None


def available() -> bool:
    return _dir() is not None


def _load() -> dict[str, dict[str, list[int]]]:
    global _index
    with _lock:
        if _index is not None:
            return _index
        base = _dir()
        out: dict[str, dict[str, list[int]]] = {f: {} for f in FILES}
        if base is not None:
            for f in FILES:
                with open(base / f"index.{f}", encoding="utf-8", errors="replace") as fh:
                    for line in fh:
                        if line.startswith(" "):
                            continue
                        parts = line.split()
                        if len(parts) < 6:
                            continue
                        p_cnt = int(parts[3])
                        sense_cnt = int(parts[4 + p_cnt])
                        offsets = [int(x) for x in parts[6 + p_cnt:6 + p_cnt + sense_cnt]]
                        out[f][parts[0]] = offsets
        _index = out
        return out


def _synset(f: str, offset: int) -> dict | None:
    base = _dir()
    if base is None:
        return None
    with _lock:
        fh = _handles.get(f)
        if fh is None:
            fh = open(base / f"data.{f}", "rb")
            _handles[f] = fh
        fh.seek(offset)
        raw = fh.readline().decode("utf-8", "replace")
    head, _, gloss = raw.partition("|")
    parts = head.split()
    if len(parts) < 4:
        return None
    ss_type = parts[2]
    w_cnt = int(parts[3], 16)
    words = [parts[4 + 2 * i].replace("_", " ") for i in range(w_cnt)]
    words = [re.sub(r"\([a-z]+\)$", "", w) for w in words]
    i = 4 + 2 * w_cnt
    p_cnt = int(parts[i])
    pointers = []
    for k in range(p_cnt):
        sym, off, pos, st = parts[i + 1 + 4 * k:i + 5 + 4 * k]
        pointers.append((sym, int(off), pos, st))
    gloss = gloss.strip()
    definition, _, rest = gloss.partition(";")
    examples = re.findall(r'"([^"]+)"', gloss)
    return {"pos": POS.get(ss_type, ("", ""))[1], "words": words, "definition": definition.strip().strip('"'), "examples": examples[:2], "pointers": pointers}


def _base_forms(word: str) -> list[str]:
    w = word.lower().strip().replace(" ", "_")
    forms = [w]
    for suffix, repl in (("ies", "y"), ("es", ""), ("s", ""), ("ing", ""), ("ing", "e"), ("ed", ""), ("ed", "e"), ("er", ""), ("est", ""), ("ly", "")):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            forms.append(w[: len(w) - len(suffix)] + repl)
    return forms


def lookup(word: str, limit: int = 12) -> dict:
    if not available():
        return {"word": word, "available": False, "senses": []}
    index = _load()
    senses = []
    seen = set()
    used = word
    for form in _base_forms(word):
        for f in FILES:
            for offset in index[f].get(form, []):
                if (f, offset) in seen:
                    continue
                seen.add((f, offset))
                s = _synset(f, offset)
                if not s:
                    continue
                antonyms = []
                similar = []
                broader = []
                for sym, off, pos, _st in s["pointers"]:
                    if sym in ("!", "&", "@") and len(similar) < 12:
                        target = _synset({"n": "noun", "v": "verb", "a": "adj", "s": "adj", "r": "adv"}[pos], off)
                        if not target:
                            continue
                        if sym == "!":
                            antonyms.extend(target["words"][:2])
                        elif sym == "&":
                            similar.extend(target["words"][:3])
                        else:
                            broader.extend(target["words"][:2])
                synonyms = [w for w in s["words"] + similar if w.lower() != form.replace("_", " ")]
                synonyms = [w for i, w in enumerate(synonyms) if w not in synonyms[:i]]
                senses.append({"pos": s["pos"], "definition": s["definition"], "examples": s["examples"], "synonyms": synonyms[:12], "antonyms": antonyms[:6], "broader": broader[:4]})
                used = form.replace("_", " ")
                if len(senses) >= limit:
                    return {"word": word, "lemma": used, "available": True, "senses": senses}
        if senses:
            break
    return {"word": word, "lemma": used, "available": True, "senses": senses}
