from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

URL = f"http://127.0.0.1:{os.environ.get('FORMTXT_ENGINE_PORT', '8210')}/api/reports/run"
USAGE = ("usage: ./formtxt report run template=<id> db=<path> sql=<select> [out=<file>] [mode=list|pages] [groupBy=<column>]"
         " [format=pdf|docx|ftxt] [overwrite=true] [title=<text>]")
KEYS = {"template", "db", "sql", "out", "mode", "groupBy", "format", "overwrite", "title"}


def full(raw: str) -> str:
    if not raw:
        return ""
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = Path(os.environ.get("FORMTXT_CALLER_DIR") or os.getcwd()) / path
    return str(path)


def main(argv: list[str]) -> None:
    if not argv or argv[0] in ("-h", "--help", "help") or argv[0] != "run":
        raise SystemExit(USAGE)
    args = {k: v for k, _, v in (a.partition("=") for a in argv[1:])}
    unknown = sorted(set(args) - KEYS)
    if unknown:
        raise SystemExit(f"[formtxt] unknown setting {', '.join(unknown)}\n{USAGE}")
    if not args.get("template") or not args.get("db") or not args.get("sql"):
        raise SystemExit(USAGE)
    body = {
        "template": args["template"],
        "data": {"path": full(args["db"]), "sql": args["sql"]},
        "mode": args.get("mode", "list"),
        "groupBy": args.get("groupBy", ""),
        "format": args.get("format", "pdf"),
        "out": full(args.get("out", "")),
        "overwrite": args.get("overwrite", "").lower() in ("1", "true", "yes"),
        "title": args.get("title", ""),
    }
    headers = {"content-type": "application/json"}
    token = os.environ.get("FORMTXT_INAPP_TOKEN", "")
    if token:
        headers["x-formtxt-inapp"] = token
    req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            out = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8") or "{}").get("detail", str(exc))
        except ValueError:
            detail = str(exc)
        raise SystemExit(f"[formtxt] {detail}")
    except urllib.error.URLError:
        raise SystemExit("[formtxt] the engine is not running. Start it with ./formtxt backend, then retry.")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
