import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = f"http://127.0.0.1:{os.environ.get('FORMTXT_ENGINE_PORT', '8199')}/api/commands"
USAGE = "usage: ./formtxt cli list [text] | describe <id>"


def get(url: str) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = json.loads(exc.read().decode("utf-8") or "{}").get("detail", str(exc))
        raise SystemExit(f"[formtxt] {detail}")
    except urllib.error.URLError:
        raise SystemExit("[formtxt] the engine is not running. Start it with ./formtxt, then retry.")


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
    else:
        raise SystemExit(USAGE)


if __name__ == "__main__":
    main(sys.argv[1:])
