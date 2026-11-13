import copy
import re

from app.services import store
from app.services.ai import providers, settings, tasks
from app.services.ai.settings import AIError


def _source(content: list) -> str:
    return "".join(str(r.get("text") or "") if r.get("type") == "text" else "\n" if r.get("type") == "break" else "\t" for r in content or [] if r.get("type") in ("text", "break", "tab"))


def _paragraphs(body: list, out: list[dict]) -> None:
    for b in body or []:
        if b.get("type") == "paragraph":
            if _source(b.get("content")).strip():
                out.append(b)
        elif b.get("type") == "table":
            for r in b.get("rows") or []:
                for c in r.get("cells") or []:
                    _paragraphs(c.get("body"), out)


def _apply(par: dict, new: str) -> None:
    runs = par.get("content") or []
    first = next((r for r in runs if r.get("type") == "text"), None)
    marks = dict(first.get("marks") or {}) if first else {}
    pieces: list[dict] = []
    for part in re.split(r"(\n|\t)", new):
        if part in ("\n", "\t"):
            pieces.append({"type": "break" if part == "\n" else "tab"})
        elif part:
            pieces.append({"type": "text", "text": part, **({"marks": dict(marks)} if marks else {})})
    out, placed = [], False
    for r in runs:
        if r.get("type") in ("text", "break", "tab"):
            if not placed:
                out.extend(pieces)
                placed = True
            continue
        out.append(r)
    if not placed:
        out[0:0] = pieces
    par["content"] = out


def document(req: dict) -> dict:
    s = settings.require_enabled()
    lang = str(req.get("language") or "").strip()[:60]
    if not lang:
        raise AIError(400, "Choose a language to translate into.")
    doc = req.get("doc")
    if not isinstance(doc, dict):
        try:
            doc, media = store.load(str(req.get("docId") or ""))
        except store.NotFound:
            raise AIError(404, "That document is not in the library.")
    else:
        try:
            media = store.load(str(doc.get("id")))[1]
        except (store.NotFound, ValueError, OSError):
            media = {}
    doc = copy.deepcopy(doc)
    pars: list[dict] = []
    for tab in doc.get("tabs") or []:
        _paragraphs(tab.get("body"), pars)
    if not pars:
        raise AIError(400, "The document has no text to translate.")
    texts = [_source(p.get("content")).strip() for p in pars]
    model = (req.get("model") or s["model"]).strip()
    effort = req.get("effort") or s["effort"]
    system = (
        f"You translate document paragraphs into {lang}. The paragraphs are given as [[n]] on its own line followed by the paragraph text. "
        "Output every paragraph translated, each as the same [[n]] line followed by the translation. Keep names, numbers and any text that should not change. Plain text, no Markdown, no commentary."
    )
    done = 0
    for group in tasks.batches(texts, 9000, 30):
        chunk = [texts[i] for i in group]
        reply = providers.complete(s, system, [{"role": "user", "content": tasks._numbered(chunk)}], model, effort)
        got = tasks.parse_numbered(reply["text"])
        for n, new in got.items():
            if 1 <= n <= len(group) and new:
                _apply(pars[group[n - 1]], new)
                done += 1
    if not done:
        raise AIError(502, "The model did not return a usable translation.")
    title = f"{doc.get('title') or 'Untitled'} ({lang})"[:200]
    doc.setdefault("meta", {})["language"] = str(req.get("languageCode") or (lang if re.fullmatch(r"[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*", lang) else "") or doc.get("meta", {}).get("language") or "")[:20]
    fresh = store.adopt(doc, media, title)
    return {"id": fresh["id"], "title": fresh["title"], "translated": done, "paragraphs": len(pars)}
