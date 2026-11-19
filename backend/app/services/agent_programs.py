from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import time
from pathlib import Path

from app.services import agents, claude_code, terminal

PROGRAMS = {
    "codex": {"bin": "codex", "title": "Codex", "install": "npm install -g @openai/codex"},
    "cursor": {"bin": "cursor-agent", "title": "Cursor", "install": "curl https://cursor.com/install -fsS | bash"},
}
MCP_URL_VAR = "FORMTXT_MCP_URL"
SERVER = "formtxt_tab"
_cache: dict = {"at": 0.0, "value": None}


def find(kind: str) -> str | None:
    binary = PROGRAMS[kind]["bin"]
    found = shutil.which(binary, path=terminal.base_env().get("PATH"))
    if found or os.name == "nt":
        return found
    try:
        out = subprocess.run(terminal.login_shell() + ["-c", f"command -v {shlex.quote(binary)}"], capture_output=True, text=True, timeout=10,
                             env=claude_code.child_env(), stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    lines = out.stdout.strip().splitlines()[-1:] if out.returncode == 0 else []
    return lines[0] if lines and os.path.isabs(lines[0]) and os.access(lines[0], os.X_OK) else None


def status() -> dict:
    out = {}
    for kind, p in PROGRAMS.items():
        path = find(kind)
        out[kind] = {"installed": path is not None, "path": path, "version": None, "signedIn": None, "install": "" if path else p["install"], "title": p["title"]}
    return out


def version(path: str) -> str | None:
    try:
        out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=10, env=claude_code.child_env(), stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    return next((word for word in out.stdout.split() if word[:1].isdigit()), None)


def report(fresh: bool = False) -> dict:
    if fresh or _cache["value"] is None or time.time() - _cache["at"] >= 60:
        found = {}
        for kind, p in PROGRAMS.items():
            path = find(kind)
            found[kind] = {"installed": path is not None, "path": path, "version": version(path) if path else None, "signedIn": None, "install": p["install"], "title": p["title"]}
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
    if kind not in PROGRAMS:
        raise ValueError(f"No agent program called {kind}")
    path = find(kind)
    if path is None:
        raise LookupError(f"{PROGRAMS[kind]['title']} is not installed on this computer.")
    command = [path] + (codex_args(port) if kind == "codex" else [])
    argv = command if os.name == "nt" else terminal.login_shell() + ["-c", "exec " + shlex.join(command)]
    folder = claude_code.workdir(document_folder)
    if kind == "cursor":
        cursor_config(folder)
    token = agents.issue()
    env = terminal.base_env() | {claude_code.INAPP_VAR: token, MCP_URL_VAR: f"http://127.0.0.1:{port}/mcp"}
    try:
        session = terminal.open_session(folder, cols, rows, PROGRAMS[kind]["title"], argv, env, kind)
    except BaseException:
        agents.revoke(token)
        raise
    session.on_close.append(lambda: agents.revoke(token))
    return session.describe()
