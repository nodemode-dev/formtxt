from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

from app.core import config
from app.services import agent_lookup, agents, claude_code, terminal

PROGRAMS = {
    "codex": {"bin": "codex", "title": "Codex", "install": "npm install -g @openai/codex"},
    "cursor": {"bin": "cursor-agent", "title": "Cursor", "install": "curl https://cursor.com/install -fsS | bash"},
    "antigravity": {"bin": "agy", "title": "Antigravity", "install": agent_lookup.install("antigravity")},
}
TABS = ("codex", "cursor", "antigravity")
MCP_URL_VAR = "FORMTXT_MCP_URL"
SERVER = "formtxt_tab"
_cache: dict = {"at": 0.0, "value": None}


def find(kind: str) -> str | None:
    return claude_code.located(kind).path


def tab_folder(kind: str) -> Path:
    folder = config.data_dir() / "agent-tabs" / kind
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _mcp_file(folder: Path) -> Path:
    return folder / ".agents" / "mcp_config.json"


def _servers(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8") or "{}") if path.exists() else {}
    if not isinstance(data, dict) or not isinstance(data.get("mcpServers", {}), dict):
        raise OSError(f"{path} is not an MCP servers file FormTxt can read, so it was left alone")
    return data


def _replace(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(path.name + f".part-{os.getpid()}")
    with os.fdopen(os.open(part, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as fh:
        fh.write(json.dumps(data, indent=2) + "\n")
    os.replace(part, path)


def write_tab_entry(folder: Path, port: int, token: str) -> None:
    path = _mcp_file(folder)
    data = _servers(path)
    data.setdefault("mcpServers", {})[SERVER] = {"serverUrl": f"http://127.0.0.1:{port}/mcp", "headers": {agents.INAPP_HEADER: token}}
    _replace(path, data)


def remove_tab_entry(folder: Path, token: str) -> None:
    path = _mcp_file(folder)
    try:
        data = _servers(path)
        entry = data.get("mcpServers", {}).get(SERVER)
        if not isinstance(entry, dict) or (entry.get("headers") or {}).get(agents.INAPP_HEADER) != token:
            return
        del data["mcpServers"][SERVER]
        _replace(path, data)
    except (OSError, ValueError):
        return


def status(fresh: bool = False) -> dict:
    out = {}
    for kind, p in PROGRAMS.items():
        found = claude_code.located(kind, fresh)
        out[kind] = agent_lookup.answer(found, p["install"], claude_code.OTHERWISE) | {"signedIn": None, "install": "" if found.state == "runs" else p["install"], "title": p["title"]}
    return out


def version(path: str) -> str | None:
    try:
        out = agent_lookup.run([path, "--version"], claude_code.child_env(path), claude_code.CHECK_WAIT)
    except (OSError, subprocess.SubprocessError):
        return None
    return next((word for word in out.stdout.split() if word[:1].isdigit()), None)


def report(fresh: bool = False) -> dict:
    if fresh or _cache["value"] is None or time.time() - _cache["at"] >= 60:
        found = {}
        for kind, p in PROGRAMS.items():
            located = claude_code.located(kind, fresh)
            found[kind] = agent_lookup.answer(located, p["install"], claude_code.OTHERWISE) | {"signedIn": None, "install": p["install"], "title": p["title"]}
        _cache.update(at=time.time(), value=found)
    return {"claude": {**claude_code.info(fresh=fresh), "title": "Claude Code"}, **_cache["value"]}


def codex_args(port: int) -> list[str]:
    return ["-c", f'mcp_servers.{SERVER}.url="http://127.0.0.1:{port}/mcp"',
            "-c", f'mcp_servers.{SERVER}.env_http_headers={{"{agents.INAPP_HEADER}"="{claude_code.INAPP_VAR}"}}']


def cursor_config(folder: str) -> str | None:
    path = Path(folder) / ".cursor" / "mcp.json"
    entry = {"url": "${env:" + MCP_URL_VAR + "}", "headers": {agents.INAPP_HEADER: "${env:" + claude_code.INAPP_VAR + "}"}}
    try:
        current = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    except (OSError, ValueError):
        return None
    servers = current.get("mcpServers", {}) if isinstance(current, dict) else None
    if not isinstance(servers, dict):
        return None
    if servers.get(SERVER) == entry:
        return str(path)
    tmp = path.with_name(path.name + ".tmp")
    try:
        path.parent.mkdir(mode=0o700, exist_ok=True)
        with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as fh:
            json.dump({**current, "mcpServers": {**servers, SERVER: entry}}, fh, indent=2)
        os.replace(tmp, path)
    except OSError:
        return None
    return str(path)


def open_terminal(kind: str, port: int, cols: int, rows: int, document_folder: str | None = None) -> dict:
    if kind not in TABS:
        raise ValueError(f"No agent program called {kind}")
    found = claude_code.usable(kind)
    if found.state != "runs":
        raise LookupError(claude_code.said(found))
    path = found.path
    argv = agent_lookup.start_argv([path] + (codex_args(port) if kind == "codex" else []))
    own = tab_folder(kind) if kind == "antigravity" else None
    folder = str(own) if own else claude_code.workdir(document_folder)
    if kind == "cursor":
        cursor_config(folder)
    token = agents.issue()
    env = claude_code.terminal_env(token, path, {MCP_URL_VAR: f"http://127.0.0.1:{port}/mcp"})
    try:
        if own:
            write_tab_entry(own, port, token)
        session = terminal.open_session(folder, cols, rows, PROGRAMS[kind]["title"], argv, env, kind)
    except BaseException:
        agents.revoke(token)
        if own:
            remove_tab_entry(own, token)
        raise
    session.on_close.append(lambda: agents.revoke(token))
    if own:
        session.on_close.append(lambda: remove_tab_entry(own, token))
    return session.describe()
