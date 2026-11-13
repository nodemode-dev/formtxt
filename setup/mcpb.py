#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "setup", "mcpb", "manifest.json")
SERVER_SOURCE = os.path.join(ROOT, "setup", "mcp_stdio.py")
VERSION_FILE = os.path.join(ROOT, "frontend", "src", "version.ts")
ENGINE_TOOLS = os.path.join(ROOT, "backend", "app", "routers", "mcp.py")
REQUIRED = ("manifest_version", "name", "version", "description", "author", "server")
STAMP = (1980, 1, 1, 0, 0, 0)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def app_version():
    try:
        with open(VERSION_FILE, encoding="utf-8") as f:
            hit = re.search(r"VERSION = '([^']+)'", f.read())
    except OSError:
        return None
    return hit.group(1) if hit else None


def engine_tools():
    try:
        with open(ENGINE_TOOLS, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None
    return sorted(set(re.findall(r'\{"name": "([a-z_]+)"', text)))


def problems_found():
    problems = []
    try:
        manifest = load(MANIFEST)
    except (OSError, ValueError) as exc:
        return [f"setup/mcpb/manifest.json cannot be read: {exc}"]
    for key in REQUIRED:
        if key not in manifest or manifest[key] in ("", None, {}):
            problems.append(f"manifest needs {key}")
    if manifest.get("manifest_version") != "0.2":
        problems.append("manifest_version must be 0.2")
    name = manifest.get("name")
    if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name or ""):
        problems.append("manifest name must be lower-case letters, digits and hyphens")
    if not app_version():
        problems.append("frontend/src/version.ts has no VERSION to stamp into the bundle")
    author = manifest.get("author")
    if not isinstance(author, dict) or not author.get("name"):
        problems.append("manifest author needs a name")
    server = manifest.get("server")
    if not isinstance(server, dict):
        problems.append("manifest server must be an object")
    else:
        if server.get("type") != "python":
            problems.append("server type must be python")
        entry = server.get("entry_point")
        if not isinstance(entry, str) or not entry.startswith("server/"):
            problems.append("server entry_point must be a file under server/")
        elif not os.path.isfile(os.path.join(ROOT, "setup", entry[len("server/"):])):
            problems.append(f"entry point {entry} has no source in setup/")
        config = server.get("mcp_config")
        if not isinstance(config, dict) or not config.get("command") or not isinstance(config.get("args"), list):
            problems.append("server mcp_config needs a command and args")
    listed = sorted(t.get("name") for t in manifest.get("tools") or [] if isinstance(t, dict))
    actual = engine_tools()
    if actual is not None and listed != actual:
        problems.append(f"manifest tools {listed} differ from the engine's {actual} (backend/app/routers/mcp.py)")
    return problems


def report(problems):
    for line in problems:
        print(f"[mcpb] {line}", file=sys.stderr)
    return 1


def check():
    problems = problems_found()
    if problems:
        return report(problems)
    print(f"[mcpb] manifest is valid; a build stamps version {app_version()}")
    return 0


def build(folder):
    problems = problems_found()
    if problems:
        return report(problems)
    data = load(MANIFEST)
    data["version"] = app_version()
    with open(SERVER_SOURCE, "rb") as f:
        server = f.read()
    os.makedirs(folder, exist_ok=True)
    target = os.path.join(folder, f"formtxt-{data['version']}.mcpb")
    entries = sorted([("manifest.json", (json.dumps(data, indent=2) + "\n").encode("utf-8")), (data["server"]["entry_point"], server)])
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, blob in entries:
            info = zipfile.ZipInfo(name, STAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o644 << 16
            z.writestr(info, blob, compresslevel=9)
    print(f"[mcpb] wrote {target}")
    return 0


def main():
    parser = argparse.ArgumentParser(prog="formtxt mcpb", description="the Claude Desktop extension")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="validate the manifest")
    group.add_argument("--build", metavar="DIR", help="write formtxt-<version>.mcpb into DIR")
    args = parser.parse_args()
    return check() if args.check else build(os.path.join(os.environ.get("FORMTXT_CALLER_DIR") or os.getcwd(), args.build))


if __name__ == "__main__":
    sys.exit(main())
