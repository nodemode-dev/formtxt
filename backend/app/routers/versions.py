import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.services import store, thumbs, versions, versions_docs as docs, versions_vault as vault

router = APIRouter(prefix="/versions", tags=["versions"])


class Name(BaseModel):
    name: str = ""


class Secret(BaseModel):
    password: str = Field("", max_length=200)
    current: str = Field("", max_length=200)


class Cloud(BaseModel):
    folder: str = ""
    user: str = Field("", max_length=200)
    password: str = Field("", max_length=400)


class Envelope(BaseModel):
    size: str = "dl"
    delivery: str = ""
    sender: str = ""
    fontSize: float = 12.0


class Labels(BaseModel):
    sheet: str = "5160"
    template: str = ""
    records: list[dict] | None = None
    count: int = 0
    fontSize: float = 10.0
    skip: int = 0


class Merge(BaseModel):
    source: str
    doc: dict
    tab: str = ""
    records: list[dict]
    title: str = ""


def _data(doc_id: str) -> bytes:
    try:
        return store._path(doc_id).read_bytes()
    except (store.NotFound, OSError):
        raise HTTPException(404, f"No document has the id {doc_id}. List documents with GET /api/documents.")


def _version(doc_id: str, vid: str):
    _data(doc_id)
    try:
        return versions.load_version(doc_id, vid)
    except (LookupError, OSError):
        raise HTTPException(404, f"No version {vid} exists for document {doc_id}.")


@router.get("/cloud")
def cloud_get() -> dict:
    return {"folder": versions.cloud_folder()}


@router.post("/cloud")
def cloud_set(body: Cloud) -> dict:
    try:
        return {"folder": versions.set_cloud_folder(body.folder, body.user, body.password)}
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.get("/cloud/files")
def cloud_files() -> dict:
    try:
        return {"files": versions.dav_list()}
    except (ValueError, OSError) as exc:
        raise HTTPException(422, str(exc))


@router.post("/cloud/open")
def cloud_open(body: Name) -> dict:
    try:
        data = versions.dav_fetch(body.name)
        doc, media = vault.unpack(data)
    except (ValueError, OSError) as exc:
        raise HTTPException(422, str(exc))
    try:
        mine, _ = store.load(str(doc.get("id", "")))
        if versions.content_hash(mine) == versions.content_hash(doc):
            return {"id": mine["id"], "copy": False}
    except (store.NotFound, ValueError, KeyError):
        pass
    fresh = store.adopt(doc, media)
    return {"id": fresh["id"], "copy": True}


@router.post("/merge")
def merge(body: Merge) -> dict:
    try:
        return docs.merge(body.source, body.doc, body.tab, body.records, body.title or f"{body.doc.get('title', 'Document')} (merged)")
    except (ValueError, store.NotFound) as exc:
        raise HTTPException(422, str(exc))


@router.post("/envelope")
def envelope(body: Envelope) -> dict:
    try:
        return docs.envelope(body.size, body.delivery, body.sender, body.fontSize)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.post("/labels")
def labels(body: Labels) -> dict:
    try:
        return docs.labels(body.sheet, body.template, body.records, body.count, body.fontSize, body.skip)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.get("/{doc_id}")
def listing(doc_id: str) -> dict:
    _data(doc_id)
    return {"versions": versions.listing(doc_id)}


@router.get("/{doc_id}/editors")
def editors(doc_id: str, ids: str = "") -> dict:
    _data(doc_id)
    wanted = [i for i in ids.split(",") if i][:500]
    return {"editors": versions.editors(doc_id, wanted)}


@router.post("/{doc_id}/open")
def opened(doc_id: str) -> dict:
    _data(doc_id)
    return versions.on_open(doc_id)


@router.post("/{doc_id}/name")
def name_current(doc_id: str, body: Name) -> dict:
    _data(doc_id)
    row = versions.name_current(doc_id, body.name.strip())
    return {k: v for k, v in row.items() if k not in ("doc", "hash")}


@router.get("/{doc_id}/activity")
def activity(doc_id: str) -> dict:
    _data(doc_id)
    return {"events": versions.activity(doc_id)}


@router.get("/{doc_id}/status")
def status(doc_id: str) -> dict:
    data = _data(doc_id)
    return {"protected": vault.is_sealed(data), "unlocked": vault.has_key(doc_id)}


@router.post("/{doc_id}/unlock")
def unlock(doc_id: str, body: Secret) -> dict:
    data = _data(doc_id)
    if not vault.is_sealed(data):
        return {"ok": True}
    if not body.password or not vault.try_password(data, body.password):
        raise HTTPException(403, "That password is not right.")
    versions.log(doc_id, "unlock")
    return {"ok": True}


@router.post("/{doc_id}/password")
def set_password(doc_id: str, body: Secret) -> dict:
    data = _data(doc_id)
    if len(body.password) < 1:
        raise HTTPException(422, "Type a password.")
    if vault.is_sealed(data) and not vault.try_password(data, body.current):
        raise HTTPException(403, "The current password is not right.")
    doc, media = vault.unpack(data)
    key = vault.make_key(body.password)
    versions.reseal_versions(doc_id, key)
    vault.adopt_key(doc_id, *key)
    store.save(doc, media)
    versions.log(doc_id, "password", doc=doc, detail="Password set")
    return {"ok": True, "protected": True}


@router.post("/{doc_id}/password/remove")
def remove_password(doc_id: str, body: Secret) -> dict:
    data = _data(doc_id)
    if not vault.is_sealed(data):
        return {"ok": True, "protected": False}
    if not vault.try_password(data, body.password):
        raise HTTPException(403, "That password is not right.")
    doc, media = vault.unpack(data)
    versions.reseal_versions(doc_id, None)
    vault.forget(doc_id)
    store.save(doc, media)
    versions.log(doc_id, "password", doc=doc, detail="Password removed")
    return {"ok": True, "protected": False}


@router.get("/{doc_id}/v/{vid}")
def read_version(doc_id: str, vid: str) -> dict:
    old, _, row = _version(doc_id, vid)
    try:
        cur = vault.unpack(_data(doc_id))[0]
    except vault.Locked:
        cur = old
    return {"version": {k: v for k, v in row.items() if k not in ("doc", "hash")}, "title": old.get("title", ""), "outline": versions.outline(old, 400), "diff": versions.diff(old, cur)}


@router.get("/{doc_id}/v/{vid}/thumb.svg")
def version_thumb(doc_id: str, vid: str) -> Response:
    old, _, _ = _version(doc_id, vid)
    return Response(thumbs.render(old), media_type="image/svg+xml", headers={"cache-control": "private, max-age=3600"})


@router.post("/{doc_id}/v/{vid}/name")
def rename_version(doc_id: str, vid: str, body: Name) -> dict:
    _version(doc_id, vid)
    row = versions.rename(doc_id, vid, body.name)
    return {k: v for k, v in row.items() if k not in ("doc", "hash")}


@router.delete("/{doc_id}/v/{vid}")
def delete_version(doc_id: str, vid: str) -> dict:
    _version(doc_id, vid)
    versions.remove(doc_id, vid)
    return {"ok": True}


@router.post("/{doc_id}/v/{vid}/restore")
def restore_version(doc_id: str, vid: str) -> dict:
    _version(doc_id, vid)
    return {"ok": True, "document": versions.restore(doc_id, vid)}


@router.post("/{doc_id}/sign")
def sign(doc_id: str) -> dict:
    _data(doc_id)
    return docs.sign_handoff(doc_id)
