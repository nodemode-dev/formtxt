import threading

from app.services.proofing import wordnet

FILES = ("noun", "verb", "adj", "adv")
_lock = threading.Lock()
_cache: dict | None = None


def _counts() -> dict[str, dict[str, int]]:
    base = wordnet._dir()
    out: dict[str, dict[str, int]] = {}
    if base is None:
        return out
    for f in FILES:
        with open(base / f"index.{f}", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if line.startswith(" "):
                    continue
                parts = line.split()
                if len(parts) < 6 or not parts[0].isalpha() or len(parts[0]) < 2:
                    continue
                p_cnt = int(parts[3])
                tagged = int(parts[5 + p_cnt])
                slot = out.setdefault(parts[0], {})
                slot[f] = slot.get(f, 0) + tagged
    return out


def lexicon() -> dict:
    global _cache
    with _lock:
        if _cache is not None:
            return _cache
        counts = _counts()
        verbs: list[str] = []
        nouns: list[str] = []
        adjs: list[str] = []
        attested: list[str] = []
        for word, c in counts.items():
            v = c.get("verb", 0)
            if v > 0:
                attested.append(word)
            n = c.get("noun", 0)
            a = c.get("adj", 0) + c.get("adv", 0)
            top = max(v, n, a)
            if top == 0:
                continue
            if v == top and v > n and v >= a:
                verbs.append(word)
            elif n == top and n > v and n >= a:
                nouns.append(word)
            elif a == top and a > v and a > n:
                adjs.append(word)
        _cache = {"available": bool(counts), "verbs": sorted(verbs), "nouns": sorted(nouns), "adjs": sorted(adjs), "attested": sorted(attested)}
        return _cache
