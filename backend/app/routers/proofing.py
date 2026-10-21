from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.proofing import dictionary, prefs

router = APIRouter()


class SpellBody(BaseModel):
    lang: str = "en-US"
    words: list[str] = Field(default_factory=list, max_length=4000)


class SuggestBody(BaseModel):
    lang: str = "en-US"
    word: str
    limit: int = Field(default=8, ge=1, le=20)


class WordBody(BaseModel):
    word: str
    remove: bool = False


@router.get("/proofing/languages")
def languages() -> list[dict]:
    return [{"code": code, "label": label, "dictionary": True} for code, label in dictionary.LANGUAGES.items()]


@router.get("/proofing/prefs")
def get_prefs() -> dict:
    return prefs.read()


@router.put("/proofing/prefs")
def put_prefs(patch: dict) -> dict:
    return prefs.write(patch)


@router.post("/proofing/spell")
def spell(body: SpellBody) -> dict:
    d = dictionary.get(body.lang)
    if d is None:
        return {"checked": False, "language": body.lang, "unknown": []}
    personal = {w.lower() for w in prefs.personal_words()}
    unknown = []
    for word in dict.fromkeys(body.words):
        if len(word) > 60 or word.lower() in personal:
            continue
        if not d.known(word):
            unknown.append(word)
    return {"checked": True, "language": d.code, "unknown": unknown}


@router.post("/proofing/suggest")
def suggest(body: SuggestBody) -> dict:
    d = dictionary.get(body.lang)
    if d is None:
        return {"suggestions": []}
    return {"suggestions": d.suggest(body.word, body.limit)}


@router.post("/proofing/dictionary")
def personal(body: WordBody) -> dict:
    word = body.word.strip()
    if not word or len(word) > 60 or any(ch.isspace() for ch in word):
        raise HTTPException(status_code=422, detail="Give one word without spaces.")
    current = prefs.read()["dictionary"]
    if body.remove:
        current = [w for w in current if w != word]
    elif word not in current:
        current = [*current, word]
    return {"dictionary": prefs.write({"dictionary": current})["dictionary"]}
