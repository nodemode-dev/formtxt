import contextvars
import json
import secrets
import time
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.core import config
from app.routers import commands
from app.services import agents, bridge

router = APIRouter()

SUPPORTED = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
WINDOW_ONLY = ("view.terminal", "view.newterminal", "agent.claudecode", "agent.chat", "terminal.", "claudecode.", "chat.", "cloud.set")
CONSENT_SECONDS = 180
DECLINE_SECONDS = 600
MAX_BODY = 8 * 1024 * 1024
ANSWERS = ("deny", "once", "always")
ALWAYS = "all"
SESSION_HEADER = "Mcp-Session-Id"
SESSIONS_KEPT = 200
_state: dict = {"declined_until": 0.0, "client": "", "at": 0.0}
_sessions: dict[str, str] = {}
_caller: contextvars.ContextVar[str] = contextvars.ContextVar("formtxt_mcp_caller", default="")

ID_SCHEMA = {"type": "object", "properties": {"id": {"type": "string", "description": "A command id from list_commands, such as format.bold"}}, "required": ["id"]}
TOOLS = [
    {"name": "list_commands",
     "description": "List the commands the FormTxt window can run: id, label, group, description, keys and parameters. Filter with text (words that must all appear) or group. The list comes from the open window; when it is empty, ask the person to open FormTxt (./formtxt).",
     "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}, "group": {"type": "string"}}},
     "annotations": {"readOnlyHint": True}},
    {"name": "describe_command", "description": "Describe one command and its parameters.", "inputSchema": ID_SCHEMA,
     "annotations": {"readOnlyHint": True}},
    {"name": "run_command",
     "description": "Run one command by id with params in the open FormTxt window, on the document the person has open; they see it happen and Undo reverses it. The first run asks the person, in the window, to allow outside agents. The terminal, Claude Code and chat commands, and the cloud storage setting, are the person's own and are refused.",
     "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}, "params": {"type": "object"}}, "required": ["id"]},
     "annotations": {"readOnlyHint": False}},
]


def text_result(value: Any, error: bool = False) -> dict:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    out = {"content": [{"type": "text", "text": text}], "isError": error}
    if isinstance(value, dict) and not error:
        out["structuredContent"] = value
    return out


def window_only(cid: str) -> bool:
    return cid.strip().lower().startswith(WINDOW_ONLY)


def remember(client: str) -> str:
    sid = secrets.token_urlsafe(18)
    _sessions[sid] = "" if client in ("unknown agent", agents.INAPP_CLIENT) else client
    for old in list(_sessions)[:-SESSIONS_KEPT]:
        _sessions.pop(old, None)
    return sid


def question(tool: str, what: str, **more: Any) -> dict:
    return {"agent": _caller.get(), "tool": tool, "what": what[:300], **more}


async def consent(inapp: bool, ask: dict | None = None) -> str | None:
    if inapp or agents.allowed():
        return None
    if time.monotonic() < _state["declined_until"]:
        return "The person chose not to allow outside agents in FormTxt just now. Ask them to turn on Allow outside agents in Preferences, then retry."
    if not bridge.connected():
        return "No FormTxt window is open. Start it with ./formtxt and open the app, then retry."
    asked = {"agent": "", "tool": "", "what": "", **(ask or {}), "answers": list(ANSWERS), "always": ALWAYS, "seconds": CONSENT_SECONDS, "expiresAt": round(time.time() + CONSENT_SECONDS, 3)}
    answer = await bridge.call("__consent__", asked, CONSENT_SECONDS, withdraw=True)
    if answer.get("ok") and isinstance(answer.get("result"), dict) and answer["result"].get("allowed") is True:
        if answer["result"].get("once") is not True:
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
    label = str((commands.find(cid) or {}).get("label") or "").strip()
    refusal = await consent(inapp, question("run_command", f"run the command {label[:120]} ({cid[:120]})" if label else f"run the command {cid[:120]}", command=cid[:120]))
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
def end_session(request: Request) -> Response:
    _sessions.pop(request.headers.get(SESSION_HEADER) or "", None)
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
    _caller.set("" if inapp else _sessions.get(request.headers.get(SESSION_HEADER) or "", ""))
    if isinstance(body, list):
        replies = [reply for reply in [await dispatch(item, inapp) for item in body] if reply is not None]
        return JSONResponse(replies) if replies else Response(status_code=202)
    reply = await dispatch(body, inapp)
    if reply is None:
        return Response(status_code=202)
    opened = isinstance(body, dict) and body.get("method") == "initialize" and "result" in reply
    return JSONResponse(reply, headers={SESSION_HEADER: remember(_state["client"])} if opened else None)


@router.get("/api/mcp/status")
def status(request: Request) -> dict:
    server = request.scope.get("server")
    port = server[1] if server and server[1] else config.port()
    return {"live": bridge.connected(), "allowed": agents.allowed(), "endpoint": f"http://127.0.0.1:{port}/mcp",
            "tools": len(TOOLS), "lastClient": _state["client"], "lastClientAt": _state["at"]}
