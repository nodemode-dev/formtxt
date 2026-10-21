import json

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

from app.core import config
from app.core.ids import is_id
from app.services import store
from app.services.collab import addins, hub, library, links, publish

router = APIRouter(tags=["collab"])
LOCAL = ("127.0.0.1", "::1", "localhost", "testclient")
CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"


def _doc_exists(doc_id: str) -> bool:
    return is_id(doc_id, "d_") and (config.documents_dir() / f"{doc_id}{store.EXT}").is_file()


def _missing(doc_id: str) -> HTTPException:
    return HTTPException(404, f"No document has the id {doc_id}. List documents with GET /api/documents.")


@router.websocket("/collab/components/live")
async def components_live(ws: WebSocket) -> None:
    if (ws.client.host if ws.client else "") not in LOCAL:
        await ws.close(code=4403)
        return
    await ws.accept()
    await hub.component_attach(ws)
    try:
        while True:
            await ws.receive_text()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.component_detach(ws)


@router.websocket("/collab/{doc_id}")
async def collab_socket(ws: WebSocket, doc_id: str) -> None:
    local = (ws.client.host if ws.client else "") in LOCAL
    token = ws.query_params.get("token", "")
    link = links.resolve(token) if token else None
    if not _doc_exists(doc_id) or (token and (not link or link.get("doc") != doc_id)):
        await ws.close(code=4404)
        return
    if link:
        if not local and not links.settings()["network"]:
            await ws.close(code=4403)
            return
        access = str(link["mode"])
    elif local:
        access = "edit"
    else:
        await ws.close(code=4403)
        return
    await ws.accept()
    q = ws.query_params
    peer = await hub.attach(doc_id, ws, q.get("cid", ""), q.get("name", ""), "#" + q.get("color", "2563eb"), access)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if isinstance(msg, dict):
                await hub.handle(peer, msg)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        await hub.drop(peer)


@router.get("/collab/info")
def info() -> dict:
    return {"settings": links.settings(), "network": links.network_info()}


class SettingsPatch(BaseModel):
    network: bool | None = None
    voice: bool | None = None


@router.post("/collab/settings")
def set_settings(patch: SettingsPatch) -> dict:
    links.set_settings(patch.model_dump(exclude_none=True))
    return info()


class NewLink(BaseModel):
    doc: str
    mode: str = "view"
    label: str = ""


@router.get("/collab/links")
def list_links(doc: str = "") -> dict:
    return {"links": links.listing(doc or None), "network": links.network_info()}


@router.post("/collab/links")
def create_link(body: NewLink) -> dict:
    if not _doc_exists(body.doc):
        raise _missing(body.doc)
    try:
        return links.create(body.doc, body.mode, body.label)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.get("/collab/links/resolve/{token}")
def resolve_link(token: str) -> dict:
    link = links.resolve(token)
    if not link or not _doc_exists(str(link.get("doc"))):
        raise HTTPException(404, "That link is not valid. It may have been revoked.")
    return {"doc": link["doc"], "mode": link["mode"], "title": link.get("title", ""), "token": token}


@router.delete("/collab/links/{token}")
def revoke_link(token: str) -> dict:
    if not links.revoke(token):
        raise HTTPException(404, "No link has that token.")
    return {"ok": True}


@router.get("/collab/people/{doc_id}")
def people(doc_id: str) -> dict:
    return {"people": hub.people(doc_id)}


class ComponentBody(BaseModel):
    name: str = ""
    blocks: list | None = None
    source: str = ""


@router.get("/collab/components")
def list_components() -> dict:
    return {"components": library.components()}


@router.post("/collab/components")
def create_component(body: ComponentBody) -> dict:
    try:
        return library.create_component(body.name, body.blocks, body.source)
    except library.Invalid as exc:
        raise HTTPException(422, str(exc))


@router.get("/collab/components/{cid}")
def get_component(cid: str) -> dict:
    item = library.component(cid)
    if not item:
        raise HTTPException(404, "No component has that id.")
    return item


@router.put("/collab/components/{cid}")
async def put_component(cid: str, body: ComponentBody) -> dict:
    try:
        item, changed = library.update_component(cid, body.name, body.blocks, body.source)
    except library.Invalid as exc:
        raise HTTPException(404 if "No component" in str(exc) else 422, str(exc))
    if changed:
        await hub.component_broadcast({"t": "component", "id": cid, "rev": item["rev"], "name": item["name"], "source": item.get("source", ""), "blocks": item["blocks"]})
    return {k: v for k, v in item.items() if k != "blocks"} | {"changed": changed}


@router.delete("/collab/components/{cid}")
async def delete_component(cid: str) -> dict:
    if not library.delete_component(cid):
        raise HTTPException(404, "No component has that id.")
    await hub.component_broadcast({"t": "component-gone", "id": cid})
    return {"ok": True}


class MacroBody(BaseModel):
    name: str | None = None
    kind: str | None = None
    steps: list | None = None
    code: str | None = None
    keys: str | None = None


@router.get("/collab/macros")
def list_macros() -> dict:
    return {"macros": library.macros()}


@router.post("/collab/macros")
def create_macro(body: MacroBody) -> dict:
    try:
        return library.save_macro(body.model_dump(exclude_none=True))
    except library.Invalid as exc:
        raise HTTPException(422, str(exc))


@router.put("/collab/macros/{mid}")
def update_macro(mid: str, body: MacroBody) -> dict:
    try:
        return library.save_macro(body.model_dump(exclude_none=True), mid)
    except library.Invalid as exc:
        raise HTTPException(404 if "No macro" in str(exc) else 422, str(exc))


@router.delete("/collab/macros/{mid}")
def delete_macro(mid: str) -> dict:
    if not library.delete_macro(mid):
        raise HTTPException(404, "No macro has that id.")
    return {"ok": True}


class Upload(BaseModel):
    filename: str = "add-in.json"
    data: str


class Toggle(BaseModel):
    enabled: bool


@router.get("/collab/addins")
def list_addins() -> dict:
    return {"addins": addins.listing(), "permissions": addins.PERMISSIONS, "folder": str(addins.files.addins_dir())}


@router.get("/collab/addins/{ident}/script")
def addin_script(ident: str) -> Response:
    try:
        return Response(addins.script(ident), media_type="text/plain; charset=utf-8")
    except addins.Invalid as exc:
        raise HTTPException(404, str(exc))


@router.post("/collab/addins/install")
def install_addin(body: Upload) -> dict:
    try:
        return addins.install(body.filename, body.data)
    except (addins.Invalid, ValueError) as exc:
        raise HTTPException(422, str(exc))


@router.post("/collab/addins/{ident}/enabled")
def enable_addin(ident: str, body: Toggle) -> dict:
    try:
        addins.set_enabled(ident, body.enabled)
    except addins.Invalid as exc:
        raise HTTPException(404, str(exc))
    return {"ok": True}


@router.delete("/collab/addins/{ident}")
def remove_addin(ident: str) -> dict:
    try:
        addins.remove(ident)
    except addins.Invalid as exc:
        raise HTTPException(422, str(exc))
    return {"ok": True}


@router.get("/collab/publish/{doc_id}")
def publish_status(doc_id: str) -> dict:
    return {"published": publish.status(doc_id)}


@router.post("/collab/publish/{doc_id}")
def publish_now(doc_id: str) -> dict:
    if not _doc_exists(doc_id):
        raise _missing(doc_id)
    return {"published": publish.publish(doc_id)}


@router.delete("/collab/publish/{doc_id}")
def unpublish(doc_id: str) -> dict:
    return {"removed": publish.unpublish(doc_id)}


@router.get("/collab/export/{doc_id}")
def export_html(doc_id: str) -> Response:
    if not _doc_exists(doc_id):
        raise _missing(doc_id)
    page, title = publish.export_html(doc_id)
    name = "".join(c for c in title if c.isalnum() or c in " -_").strip() or "document"
    return Response(page, media_type="text/html; charset=utf-8", headers={"content-disposition": f'attachment; filename="{name}.html"'})


@router.get("/published/{token}")
def published(token: str) -> HTMLResponse:
    page = publish.html_for(token)
    if page is None:
        raise HTTPException(404, "That page is not published.")
    return HTMLResponse(page, headers={"content-security-policy": CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer"})
