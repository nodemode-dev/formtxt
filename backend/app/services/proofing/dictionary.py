import re
import threading
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"

LANGUAGES: dict[str, str] = {
    "en-US": "English (United States)",
    "en-GB": "English (United Kingdom)",
    "en-AU": "English (Australia)",
    "en-CA": "English (Canada)",
}

LETTERS = "abcdefghijklmnopqrstuvwxyz'"
_lock = threading.Lock()
_loaded: dict[str, "Dictionary"] = {}


def normalise(word: str) -> str:
    return word.replace("\u2019", "'").replace("\u02bc", "'").replace("\u00ad", "")


class Rule:
    __slots__ = ("strip", "add", "cond", "cross")

    def __init__(self, strip: str, add: str, cond: str, cross: bool) -> None:
        self.strip = strip
        self.add = add
        self.cond = cond
        self.cross = cross


def _compile(kind: str, cond: str) -> re.Pattern[str]:
    if cond == ".":
        return re.compile(r"")
    return re.compile(("^" + cond) if kind == "PFX" else (cond + "$"))


def _parse_aff(path: Path) -> tuple[dict[str, list[tuple[Rule, re.Pattern[str]]]], dict[str, list[tuple[Rule, re.Pattern[str]]]], list[tuple[str, str]], str, str]:
    pfx: dict[str, list[tuple[Rule, re.Pattern[str]]]] = {}
    sfx: dict[str, list[tuple[Rule, re.Pattern[str]]]] = {}
    reps: list[tuple[str, str]] = []
    nosuggest = ""
    onlycompound = ""
    cross: dict[tuple[str, str], bool] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        key = parts[0]
        if key in ("PFX", "SFX") and len(parts) >= 4:
            if len(parts) == 4 and parts[3].isdigit():
                cross[(key, parts[1])] = parts[2] == "Y"
                continue
            if len(parts) >= 5:
                strip = "" if parts[2] == "0" else parts[2]
                add = "" if parts[3] == "0" else parts[3].split("/", 1)[0]
                cond = parts[4]
                rule = Rule(strip, add, cond, cross.get((key, parts[1]), False))
                target = pfx if key == "PFX" else sfx
                target.setdefault(parts[1], []).append((rule, _compile(key, cond)))
        elif key == "REP" and len(parts) == 3:
            reps.append((parts[1], parts[2]))
        elif key == "NOSUGGEST" and len(parts) > 1:
            nosuggest = parts[1]
        elif key == "ONLYINCOMPOUND" and len(parts) > 1:
            onlycompound = parts[1]
    return pfx, sfx, reps, nosuggest, onlycompound


def _apply_suffix(word: str, entry: tuple[Rule, re.Pattern[str]]) -> str | None:
    rule, rx = entry
    if not rx.search(word):
        return None
    if rule.strip:
        if not word.endswith(rule.strip):
            return None
        word = word[: -len(rule.strip)]
    return word + rule.add


def _apply_prefix(word: str, entry: tuple[Rule, re.Pattern[str]]) -> str | None:
    rule, rx = entry
    if not rx.search(word):
        return None
    if rule.strip:
        if not word.startswith(rule.strip):
            return None
        word = word[len(rule.strip):]
    return rule.add + word


class Dictionary:
    def __init__(self, code: str) -> None:
        stem = code.replace("-", "_")
        pfx, sfx, reps, nosuggest, onlycompound = _parse_aff(DATA / f"{stem}.aff")
        self.code = code
        self.reps = reps
        self.words: set[str] = set()
        self.lower: set[str] = set()
        self.hidden: set[str] = set()
        lines = (DATA / f"{stem}.dic").read_text(encoding="utf-8").splitlines()
        for raw in lines[1:]:
            raw = raw.strip()
            if not raw or raw.startswith("#"):
                continue
            stem_word, _, flags = raw.partition("/")
            stem_word = stem_word.split()[0] if stem_word.split() else ""
            if not stem_word:
                continue
            if onlycompound and onlycompound in flags:
                continue
            forms = {stem_word}
            sfx_forms: list[tuple[str, bool]] = []
            for flag in flags:
                for entry in sfx.get(flag, ()):
                    out = _apply_suffix(stem_word, entry)
                    if out:
                        forms.add(out)
                        sfx_forms.append((out, entry[0].cross))
            for flag in flags:
                for entry in pfx.get(flag, ()):
                    out = _apply_prefix(stem_word, entry)
                    if out:
                        forms.add(out)
                        if entry[0].cross:
                            for form, cross in sfx_forms:
                                if cross:
                                    both = _apply_prefix(form, entry)
                                    if both:
                                        forms.add(both)
            hide = bool(nosuggest and nosuggest in flags)
            for f in forms:
                self.words.add(f)
                if hide:
                    self.hidden.add(f)
        for w in self.words:
            if w not in self.hidden:
                self.lower.add(w.lower())

    def known(self, word: str) -> bool:
        w = normalise(word)
        if w in self.words:
            return True
        low = w.lower()
        if w == low:
            return False
        if w.isupper() or (w[:1].isupper() and w[1:] == low[1:]):
            return low in self.words or w.capitalize() in self.words
        return False

    def _edits1(self, word: str) -> set[str]:
        splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
        deletes = {a + b[1:] for a, b in splits if b}
        swaps = {a + b[1] + b[0] + b[2:] for a, b in splits if len(b) > 1}
        replaces = {a + c + b[1:] for a, b in splits if b for c in LETTERS}
        inserts = {a + c + b for a, b in splits for c in LETTERS}
        return deletes | swaps | replaces | inserts

    def _rep_candidates(self, word: str) -> set[str]:
        out: set[str] = set()
        for src, dst in self.reps:
            start = word.find(src)
            while start >= 0:
                out.add(word[:start] + dst.replace("_", " ") + word[start + len(src):])
                start = word.find(src, start + 1)
        return out

    def suggest(self, word: str, limit: int = 8) -> list[str]:
        w = normalise(word)
        low = w.lower()
        if not low or len(low) > 40:
            return []
        scored: dict[str, float] = {}

        def add(candidate: str, cost: float) -> None:
            if candidate and candidate != low and cost < scored.get(candidate, 99):
                scored[candidate] = cost

        for cand in self._rep_candidates(low):
            if " " in cand:
                if all(p in self.lower for p in cand.split()):
                    add(cand, 1.2)
            elif cand in self.lower:
                add(cand, 0.9)
        e1 = self._edits1(low)
        for cand in e1:
            if cand in self.lower:
                swapped = len(cand) == len(low) and sorted(cand) == sorted(low)
                add(cand, 0.5 if swapped else 1.0)
        for i in range(1, len(low)):
            a, b = low[:i], low[i:]
            if a in self.lower and b in self.lower and (len(a) > 1 or a in ("a", "i")) and len(b) > 1:
                add(f"{a} {b}", 0.8 if a in ("a", "i") else 1.6)
        if len(scored) < limit and 3 <= len(low) <= 12:
            budget = 0
            for cand in e1:
                for cand2 in self._edits1(cand):
                    if cand2 in self.lower:
                        add(cand2, 2.0)
                budget += 1
                if budget > 400:
                    break

        def overlap(cand: str) -> int:
            pre = 0
            while pre < min(len(cand), len(low)) and cand[pre] == low[pre]:
                pre += 1
            suf = 0
            while suf < min(len(cand), len(low)) - pre and cand[-1 - suf] == low[-1 - suf]:
                suf += 1
            return pre + suf

        def rank(item: tuple[str, float]) -> tuple[float, int, int, str]:
            cand, cost = item
            same_first = 0 if cand[:1] == low[:1] else 1
            return (cost + 0.3 * same_first, -overlap(cand), abs(len(cand) - len(low)), cand)

        ordered = [c for c, _ in sorted(scored.items(), key=rank)][:limit]
        return [self._match_case(w, c) for c in ordered]

    def _match_case(self, original: str, cand: str) -> str:
        if original.isupper() and len(original) > 1:
            return cand.upper()
        if original[:1].isupper():
            return cand[:1].upper() + cand[1:]
        if cand in self.words or cand.lower() in self.words:
            return cand
        return cand


def get(code: str) -> Dictionary | None:
    key = resolve(code)
    if not key:
        return None
    with _lock:
        if key not in _loaded:
            _loaded[key] = Dictionary(key)
        return _loaded[key]


def resolve(code: str) -> str:
    c = (code or "en-US").replace("_", "-")
    for known in LANGUAGES:
        if known.lower() == c.lower():
            return known
    if c.lower().startswith("en"):
        return "en-US"
    return ""
