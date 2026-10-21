import re

from app.services.ai import providers, settings, text
from app.services.ai.settings import AIError

STYLE_RULES = (
    "Write the answer as Markdown: '#' headings, '-' bullets, '1.' numbered items, **bold**, *italic*, and pipe tables when a table helps. "
    "Reply with the answer only: no greeting, no preface, no closing remark, and no code fence around the whole answer."
)
BASE = "You are the writing assistant inside FormTxt, a document editor. " + STYLE_RULES
REWRITE = {
    "shorter": "Rewrite the text so it is clearly shorter while keeping every key point.",
    "longer": "Rewrite the text so it is longer and fuller, adding useful detail without inventing facts.",
    "formal": "Rewrite the text in a more formal, professional tone.",
    "casual": "Rewrite the text in a more casual, friendly tone.",
    "simpler": "Rewrite the text in simpler words and shorter sentences that a general reader understands.",
}
TASKS = ("chat", "draft", "create", "rewrite", "summarize", "revise", "style", "define", "thesaurus", "translate", "overview", "research")


def _sources(ids: list[str], inline: list[dict]) -> tuple[str, list[dict]]:
    found: list[dict] = []
    blocks: list[str] = []
    used = 0
    for i in ids[:12]:
        try:
            title, body = text.library_doc(str(i))
        except LookupError:
            continue
        found.append({"id": str(i), "title": title, "kind": "library"})
        room = max(0, text.CAP_ALL - used)
        blocks.append(f"[{len(found)}] {title}\n{body[:room]}")
        used += min(len(body), room)
    for d in inline[:8]:
        title = str(d.get("title") or "Attached file")[:120]
        body = str(d.get("text") or "")[:text.CAP_DOC]
        found.append({"id": "", "title": title, "kind": "file"})
        room = max(0, text.CAP_ALL - used)
        blocks.append(f"[{len(found)}] {title}\n{body[:room]}")
        used += min(len(body), room)
    return "\n\n".join(blocks), found


def _cited(answer: str, n: int) -> list[int]:
    return sorted({int(m) for m in re.findall(r"\[(\d{1,2})\]", answer) if 1 <= int(m) <= n})


def run(req: dict) -> dict:
    s = settings.require_enabled()
    task = req.get("task")
    if task not in TASKS:
        raise AIError(400, f"The task must be one of: {', '.join(TASKS)}.")
    effort = req.get("effort") or s["effort"]
    if effort not in providers.EFFORT:
        raise AIError(400, "The effort must be fast, balanced or thorough.")
    model = (req.get("model") or s["model"]).strip()
    instruction = str(req.get("instruction") or "").strip()
    body = str(req.get("text") or "")
    lang = str(req.get("language") or "").strip()[:60]
    src_text, found = _sources(list(req.get("sources") or []), list(req.get("files") or []))
    system = BASE
    user = ""
    if found:
        system += " Source documents are supplied below. Ground the answer in them, and cite a source you used by its number in square brackets, such as [1]. Do not cite sources you did not use."
    if task == "chat":
        system += " Answer questions about the person's document and sources. Be accurate and concise; say so if the document does not contain the answer."
        user = instruction
    elif task == "draft":
        system += " Write text the person will insert into their document at the cursor. Match the language of the request."
        user = f"Request: {instruction}"
        if body:
            user = f"Text before the cursor, for context:\n{body[-3000:]}\n\n{user}"
    elif task == "create":
        system += " Write a complete first draft of a document with a clear structure: a title as a single '#' heading, '##' section headings, and well-formed paragraphs and lists."
        user = f"Create a document for this request: {instruction}"
    elif task == "rewrite":
        how = REWRITE.get(str(req.get("mode") or ""), "")
        if not how:
            if not instruction:
                raise AIError(400, "Say how to rewrite the text.")
            how = f"Rewrite the text as follows: {instruction}"
        system += " You rewrite text. Keep the meaning and the language unless told otherwise. Keep the same Markdown structure (headings, lists) when the text has it."
        user = f"{how}\n\nText:\n{body}"
    elif task == "summarize":
        system += " You write faithful summaries that add nothing that is not in the text."
        user = f"{instruction or 'Summarize the document in a short paragraph followed by up to five bullet points with the key points.'}\n\nDocument:\n{body}"
    elif task == "overview":
        system += " You write a spoken audio overview script: plain sentences, no Markdown, no lists, no headings, no symbols, as if a friendly host talks the listener through the document in about two minutes."
        user = f"Document:\n{body}"
    elif task == "style":
        system += " You rewrite text to match the voice, tone, rhythm and vocabulary of a sample, without changing the facts."
        user = f"Sample of the target style:\n{instruction}\n\nRewrite this text to match that style:\n{body}"
    elif task == "define":
        system = "You are a dictionary. Reply with Markdown only: one short definition in one sentence."
        user = f"Word: {body}\nContext: {instruction}"
    elif task == "thesaurus":
        system = "You are a thesaurus and dictionary. Reply with one JSON object only and nothing else, in this shape: {\"definition\": \"short definition, one sentence\", \"partOfSpeech\": \"noun\", \"synonyms\": [\"up to 10 synonyms that fit the context, best first\"]}."
        user = f"Word: {body}\nSentence it appears in: {instruction}"
    elif task == "translate":
        if not lang:
            raise AIError(400, "Choose a language to translate into.")
        system += f" You translate into {lang}. Keep the Markdown structure, names and numbers. Output only the translation."
        user = body
    elif task == "research":
        system += " Answer the question using only the supplied sources, quoting short passages where useful, and cite each source by number."
        user = instruction
    elif task == "revise":
        raise AIError(400, "Use the revise endpoint for document-wide edits.")
    if not user.strip():
        raise AIError(400, "Type what you want first.")
    msgs: list[dict] = []
    if task == "chat":
        for m in list(req.get("history") or [])[-12:]:
            msgs.append({"role": m.get("role"), "content": str(m.get("content") or "")[:6000]})
        ctx = []
        if body:
            ctx.append(f"The person's {'selected text' if req.get('selection') else 'document'}:\n{body[:text.CAP_ALL]}")
        if src_text:
            ctx.append("Sources:\n" + src_text)
        user = ("\n\n".join(ctx) + "\n\nQuestion: " + user) if ctx else user
        msgs.append({"role": "user", "content": user})
    else:
        if src_text:
            user = "Sources:\n" + src_text + "\n\n" + user
        msgs.append({"role": "user", "content": user})
    reply = providers.complete(s, system, msgs, model, effort)
    reply["task"] = task
    reply["effort"] = effort
    cited = _cited(reply["text"], len(found))
    reply["sources"] = [{**f, "n": i + 1, "cited": (i + 1) in cited} for i, f in enumerate(found)]
    return reply


def _numbered(items: list[str]) -> str:
    return "\n".join(f"[[{i + 1}]]\n{t}" for i, t in enumerate(items))


def parse_numbered(answer: str) -> dict[int, str]:
    parts = re.split(r"^\s*\[\[(\d+)\]\]\s*$", answer, flags=re.M)
    out: dict[int, str] = {}
    for i in range(1, len(parts) - 1, 2):
        out[int(parts[i])] = parts[i + 1].strip()
    return out


def batches(items: list[str], size: int = 14000, count: int = 40) -> list[list[int]]:
    out: list[list[int]] = []
    cur: list[int] = []
    used = 0
    for i, t in enumerate(items):
        if cur and (used + len(t) > size or len(cur) >= count):
            out.append(cur)
            cur, used = [], 0
        cur.append(i)
        used += len(t)
    if cur:
        out.append(cur)
    return out


def revise(req: dict) -> dict:
    s = settings.require_enabled()
    instruction = str(req.get("instruction") or "").strip()
    if not instruction:
        raise AIError(400, "Say what to change in the document.")
    paras = [str(p) for p in req.get("paragraphs") or []][:600]
    if not paras:
        raise AIError(400, "The document has no text to revise.")
    effort = req.get("effort") or s["effort"]
    model = (req.get("model") or s["model"]).strip()
    system = (
        "You revise a document paragraph by paragraph. The paragraphs are given as [[n]] on its own line followed by the paragraph text. "
        "Apply the instruction. Output only the paragraphs that must change, each as the same [[n]] line followed by the full new text of that paragraph. "
        "Leave out paragraphs that need no change. Do not merge, split or reorder paragraphs. Keep headings short. Plain text, no Markdown."
    )
    changes = []
    last = None
    for group in batches(paras):
        chunk = [paras[i] for i in group]
        user = f"Instruction: {instruction}\n\nParagraphs:\n{_numbered(chunk)}"
        last = providers.complete(s, system, [{"role": "user", "content": user}], model, effort)
        for n, new in parse_numbered(last["text"]).items():
            if 1 <= n <= len(group):
                idx = group[n - 1]
                if new and new != paras[idx].strip():
                    changes.append({"n": idx, "text": new})
    return {"changes": sorted(changes, key=lambda c: c["n"]), "model": (last or {}).get("model", model), "usage": (last or {}).get("usage")}
