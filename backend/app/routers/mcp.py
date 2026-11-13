import json
import time
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.core import config
from app.routers import commands
from app.services import agents, bridge

router = APIRouter()

SUPPORTED = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
WINDOW_ONLY = ("view.terminal", "view.newterminal", "agent.claudecode", "agent.chat", "terminal.", "claudecode.", "chat.")
CONSENT_SECONDS = 180
DECLINE_SECONDS = 600
MAX_BODY = 8 * 1024 * 1024
_state: dict = {"declined_until": 0.0, "client": "", "at": 0.0}

ID_SCHEMA = {"type": "object", "properties": {"id": {"type": "string", "description": "A command id from list_commands, such as format.bold"}}, "required": ["id"]}
TOOLS = [
    {"name": "list_commands",
     "description": "List the commands the FormTxt window can run: id, label, group, description, keys and parameters. Filter with text (words that must all appear) or group. The list comes from the open window; when it is empty, ask the person to open FormTxt (./formtxt).",
     "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}, "group": {"type": "string"}}}},
    {"name": "describe_command", "description": "Describe one command and its parameters.", "inputSchema": ID_SCHEMA},
    {"name": "run_command",
     "description": "Run one command by id with params in the open FormTxt window, on the document the person has open; they see it happen and Undo reverses it. The first run asks the person, in the window, to allow outside agents. The terminal, Claude Code and chat commands are the person's own and are refused.",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}, "params": {"type": "object"}}, "required": ["id"]}},
]


def text_result(value: Any, error: bool = False) -> dict:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    out = {"content": [{"type": "text", "text": text}], "isError": error}
    if isinstance(value, dict) and not error:
        out["structuredContent"] = value
    return out


def window_only(cid: str) -> bool:
    return cid.strip().lower().startswith(WINDOW_ONLY)


async def consent(inapp: bool) -> str | None:
    if inapp or agents.allowed():
        return None
    if time.monotonic() < _state["declined_until"]:
        return "The person chose not to allow outside agents in FormTxt just now. Ask them to turn on Allow outside agents in Preferences, then retry."
    if not bridge.connected():
        return "No FormTxt window is open. Start it with ./formtxt and open the app, then retry."
    answer = await bridge.call("__consent__", {}, CONSENT_SECONDS)
    if answer.get("ok") and isinstance(answer.get("result"), dict) and answer["result"].get("allowed") is True:
        agents.set_allowed(True)
        return None
    _state["declined_until"] = time.monotonic() + DECLINE_SECONDS
    return "The person did not allow outside agents in FormTxt. Ask them to allow it (the question in the FormTxt window, or Allow outside agents in Preferences), then retry."


async def call_tool(name: str, args: dict, inapp: bool) -> dict:
    if name == "list_commands":
        rows = commands.search(str(args.get("group") or ""), str(args.get("text") or ""))
        listing = [{**c, "windowOnly": True} if window_only(str(c.get("id", ""))) else c for c in rows]
        hint = "" if commands._state["commands"] else "The catalogue is empty: ask the person to open the FormTxt window (./formtxt), wait a few seconds, then list again."
        return text_result({"shown": len(listing), "commands": listing, **({"hint": hint} if hint else {})})
    cid = str(args.get("id") or "").strip()
    if not cid:
        return text_result("Give the command id; list_commands names them.", True)
    if name == "describe_command":
        found = commands.find(cid)
        if found is None:
            return text_result(f"No command has the id {cid}. Call list_commands with a word to find it.", True)
        return text_result({**found, **({"windowOnly": True} if window_only(cid) else {})})
    if window_only(cid):
        return text_result(f"{cid} is only available in the FormTxt window, so a person runs it. Do not retry.", True)
    refusal = await consent(inapp)
    if refusal:
        return text_result(refusal, True)
    params = args.get("params")
    out = await commands.execute(cid, params if isinstance(params, dict) else {})
    if out.get("ok"):
        result = out.get("result")
        return text_result(result if isinstance(result, dict) else {"ok": True, "result": result})
    return text_result(str(out.get("error") or "The command failed."), True)


def rpc_error(request_id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


async def dispatch(message: Any, inapp: bool) -> dict | None:
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return rpc_error(None, -32600, "invalid request")
    method = message.get("method")
    request_id = message.get("id")
    params = message.get("params") or {}
    if not isinstance(method, str):
        return rpc_error(request_id, -32600, "invalid request")
    if "id" not in message:
        return None
    if not isinstance(params, dict):
        return rpc_error(request_id, -32602, "params must be an object")
    if method == "initialize":
        asked = params.get("protocolVersion")
        info = params.get("clientInfo") if isinstance(params.get("clientInfo"), dict) else {}
        _state.update(client=agents.INAPP_CLIENT if inapp else str(info.get("name") or "unknown agent")[:80], at=time.time())
        result = {
            "protocolVersion": asked if asked in SUPPORTED else SUPPORTED[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": config.APP_NAME, "title": config.APP_TITLE, "version": config.VERSION},
            "instructions": "FormTxt edits the document open in its window. Find commands with list_commands, read one with describe_command, then run_command. Each run is one Undo step the person sees.",
        }
        return {"jsonrpc": "2.0", "id": request_id, "result": result}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments")
        if name not in {t["name"] for t in TOOLS}:
            return rpc_error(request_id, -32602, f"unknown tool {name}")
        try:
            outcome = await call_tool(str(name), arguments if isinstance(arguments, dict) else {}, inapp)
        except Exception as exc:
            outcome = text_result(f"the tool failed: {exc}", True)
        return {"jsonrpc": "2.0", "id": request_id, "result": outcome}
    return rpc_error(request_id, -32601, f"method not found: {method}")


@router.get("/mcp")
def describe_endpoint(request: Request) -> Response:
    if "text/event-stream" in request.headers.get("accept", ""):
        return Response(status_code=405, headers={"Allow": "POST, DELETE"})
    return JSONResponse({"name": config.APP_NAME, "version": config.VERSION, "transport": "http", "protocolVersions": list(SUPPORTED), "tools": [t["name"] for t in TOOLS]})


@router.delete("/mcp")
def end_session() -> Response:
    return Response(status_code=204)


@router.post("/mcp")
async def rpc(request: Request) -> Response:
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        return JSONResponse(rpc_error(None, -32600, "send the request as application/json"), status_code=415)
    raw = await request.body()
    if len(raw) > MAX_BODY:
        return JSONResponse(rpc_error(None, -32600, "the request is too large"), status_code=413)
    try:
        body = json.loads(raw or b"null")
    except ValueError:
        return JSONResponse(rpc_error(None, -32700, "parse error"), status_code=400)
    inapp = agents.is_inapp(request.headers.get(agents.INAPP_HEADER))
    if isinstance(body, list):
        replies = [reply for reply in [await dispatch(item, inapp) for item in body] if reply is not None]
        return JSONResponse(replies) if replies else Response(status_code=202)
    reply = await dispatch(body, inapp)
    return JSONResponse(reply) if reply is not None else Response(status_code=202)


@router.get("/api/mcp/status")
def status(request: Request) -> dict:
    server = request.scope.get("server")
    port = server[1] if server and server[1] else config.port()
    return {"live": bridge.connected(), "allowed": agents.allowed(), "endpoint": f"http://127.0.0.1:{port}/mcp",
            "tools": len(TOOLS), "lastClient": _state["client"], "lastClientAt": _state["at"]}
