#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = os.environ.get("FORMTXT_ENGINE_PORT") or os.environ.get("FORMTXT_PORT") or "8210"
DEFAULT_URL = f"http://127.0.0.1:{PORT}/mcp"
URL = os.environ.get("FORMTXT_MCP_URL", DEFAULT_URL)
session = ""
started = False
found = ""


def read_version():
    try:
        with open(os.path.join(ROOT, "frontend", "src", "version.ts"), encoding="utf-8") as f:
            hit = re.search(r"VERSION = '([^']+)'", f.read())
            if hit:
                return hit.group(1)
    except OSError:
        pass
    return "unknown"


def base():
    return URL.rsplit("/mcp", 1)[0]


def answering():
    try:
        with urllib.request.urlopen(base() + "/api/health", timeout=2) as r:
            return r.status == 200
    except (urllib.error.URLError, OSError):
        return False


def data_dir():
    raw = os.environ.get("FORMTXT_DATA_DIR", "").strip()
    return os.path.expanduser(raw) if raw else os.path.join(os.path.expanduser("~"), "FormTxt")


def find_engine():
    global URL, found
    if URL not in (DEFAULT_URL, found):
        return False
    URL = DEFAULT_URL
    try:
        with open(os.path.join(data_dir(), "engine.json"), encoding="utf-8") as f:
            port = int(json.load(f).get("port", 0))
    except (OSError, ValueError, AttributeError, TypeError):
        return False
    if not 0 < port < 65536:
        return False
    found = URL = f"http://127.0.0.1:{port}/mcp"
    if answering():
        print(f"[formtxt mcp] using the running engine at {URL}", file=sys.stderr, flush=True)
        return True
    URL = DEFAULT_URL
    return False


def start_engine():
    global started
    if started or URL != DEFAULT_URL or os.environ.get("FORMTXT_MCP_AUTOSTART", "1") == "0":
        return False
    started = True
    launcher = os.path.join(ROOT, "formtxt.bat" if os.name == "nt" else "formtxt")
    log = open(os.path.join(tempfile.gettempdir(), "formtxt-engine.log"), "ab")
    print(f"[formtxt mcp] starting the engine; log: {log.name}", file=sys.stderr, flush=True)
    try:
        subprocess.Popen([launcher, "backend"], cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                         start_new_session=(os.name != "nt"), creationflags=(0x208 if os.name == "nt" else 0))
    except OSError as exc:
        print(f"[formtxt mcp] the engine could not start: {exc}", file=sys.stderr, flush=True)
        return False
    for _ in range(120):
        time.sleep(0.5)
        if answering():
            return True
    return False


def error_reply(msg, text):
    if msg.get("id") is None:
        return None
    return json.dumps({"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": -32000, "message": text}})


def forward(line, retry=True):
    global session
    try:
        msg = json.loads(line)
    except ValueError:
        return json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
    if not isinstance(msg, dict):
        return json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Send one JSON-RPC object per line"}})
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if session:
        headers["Mcp-Session-Id"] = session
    req = urllib.request.Request(URL, data=line.encode("utf-8"), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=660) as r:
            body = r.read().decode("utf-8")
            session = r.headers.get("Mcp-Session-Id") or session
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8") or ""
    except (urllib.error.URLError, OSError) as exc:
        print(f"[formtxt mcp] the engine is not answering at {URL}: {exc}", file=sys.stderr, flush=True)
        if retry and (find_engine() or start_engine()):
            return forward(line, False)
        return error_reply(msg, "The FormTxt engine is not running and could not be started: run ./formtxt in the formtxt folder, then retry.")
    if msg.get("id") is None:
        return None
    return body.strip() or None


def main():
    global URL
    for stream in (sys.stdin, sys.stdout):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="formtxt mcp", description="FormTxt over MCP's stdio transport")
    parser.add_argument("--url", help="the engine's /mcp address (default " + DEFAULT_URL + ")")
    parser.add_argument("--where", action="store_true", help="print the launcher, script and URL, then exit")
    parser.add_argument("--version", action="store_true", help="print the version, then exit")
    args = parser.parse_args()
    if args.url:
        URL = args.url
    if args.version:
        print("formtxt " + read_version())
        return
    if args.where:
        launcher = os.path.join(ROOT, "formtxt.bat" if os.name == "nt" else "formtxt")
        print(json.dumps({"launcher": launcher, "script": os.path.abspath(__file__), "url": URL,
                          "claude_desktop": {"mcpServers": {"formtxt": {"command": launcher, "args": ["mcp"]}}}}, indent=2))
        return
    for line in sys.stdin:
        if not line.strip():
            continue
        out = forward(line)
        if out:
            sys.stdout.write(out + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
