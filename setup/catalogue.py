from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = f"http://127.0.0.1:{os.environ.get('FORMTXT_ENGINE_PORT', '8210')}/api/commands"
MCP = f"http://127.0.0.1:{os.environ.get('FORMTXT_ENGINE_PORT', '8210')}/mcp"
USAGE = "usage: ./formtxt cli list [text] | describe <id> | run <id> [key=value ...]"


def value(raw: str):
    try:
        return json.loads(raw)
    except ValueError:
        return raw


def get(url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"content-type": "application/json"} if data else {}, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8") or "{}").get("detail", str(exc))
        except ValueError:
            detail = str(exc)
        raise SystemExit(f"[formtxt] {detail}")
    except urllib.error.URLError:
        raise SystemExit("[formtxt] the engine is not running. Start it with ./formtxt, then retry.")
    except ValueError:
        raise SystemExit(f"[formtxt] the reply from {url} is not JSON; check that FORMTXT_ENGINE_PORT names the FormTxt engine.")


def run_command(cid: str, params: dict) -> dict:
    headers = {"content-type": "application/json", "mcp-protocol-version": "2025-11-25"}
    if os.environ.get("FORMTXT_INAPP_TOKEN"):
        headers["x-formtxt-inapp"] = os.environ["FORMTXT_INAPP_TOKEN"]
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "run_command", "arguments": {"id": cid, "params": params}}}
    req = urllib.request.Request(MCP, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            reply = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"[formtxt] {exc}")
    except urllib.error.URLError:
        raise SystemExit("[formtxt] the engine is not running. Start it with ./formtxt, then retry.")
    except ValueError:
        raise SystemExit(f"[formtxt] the reply from {MCP} is not JSON; check that FORMTXT_ENGINE_PORT names the FormTxt engine.")
    if "error" in reply:
        raise SystemExit(f"[formtxt] {reply['error'].get('message', 'the engine refused the request')}")
    return reply.get("result") or {}


def main(argv: list[str]) -> None:
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(USAGE)
        return
    cmd, rest = argv[0], argv[1:]
    if cmd == "list":
        out = get(BASE + "?" + urllib.parse.urlencode({"text": " ".join(rest)}))
        if out.get("hint"):
            print(f"[formtxt] {out['hint']}")
        width = max((len(c["id"]) for c in out["commands"]), default=0)
        for c in out["commands"]:
            print(f"{c['id']:<{width}}  {c.get('group', ''):<10}  {c.get('label', '')}")
        print(f"{out['shown']} of {out['size']} commands")
    elif cmd == "describe" and rest:
        print(json.dumps(get(f"{BASE}/{urllib.parse.quote(rest[0])}"), indent=2))
    elif cmd == "run" and rest:
        params = {k: value(v) for k, _, v in (a.partition("=") for a in rest[1:]) if k}
        out = run_command(rest[0], params)
        if out.get("isError"):
            print(json.dumps({"ok": False, "error": "".join(c.get("text", "") for c in out.get("content", []))}, indent=2))
            raise SystemExit(1)
        found = out.get("structuredContent")
        print(json.dumps(found.get("result") if isinstance(found, dict) and set(found) == {"ok", "result"} else found, indent=2))
    else:
        raise SystemExit(USAGE)


if __name__ == "__main__":
    main(sys.argv[1:])
