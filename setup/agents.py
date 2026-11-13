#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, ".claude", "skills")
MIRROR = os.path.join(ROOT, ".agents", "skills")
SKIP_DIRS = {"__pycache__", "node_modules", ".git"}
SKIP_FILES = {".DS_Store"}
RESERVED = ("anthropic", "claude")
TAG = re.compile(r"</?[A-Za-z][^>]*>")
LAUNCHER = "formtxt"
USE_SKILLS = ("formtxt-driving",)
LAUNCH = os.path.join(ROOT, LAUNCHER)
ARGS = ["mcp"]
if os.name == "nt":
    LAUNCH, ARGS = sys.executable, [os.path.join(ROOT, "setup", "mcp_stdio.py")]


def files_under(base):
    found = {}
    if not os.path.isdir(base):
        return found
    for folder, dirs, names in os.walk(base):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(names):
            if name in SKIP_FILES or name.endswith(".pyc"):
                continue
            full = os.path.join(folder, name)
            found[os.path.relpath(full, base).replace(os.sep, "/")] = full
    return found


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def is_bad_char(cp):
    return cp == 0x2014 or 0x1F000 <= cp <= 0x1FAFF or 0x2600 <= cp <= 0x27BF or cp == 0xFE0F


def frontmatter(text):
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None
    values = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return values
        found = re.match(r"^([A-Za-z_-]+):\s*(.*)$", line)
        if found:
            value = found.group(2).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[found.group(1)] = value
    return None


def sync():
    if not os.path.isdir(SOURCE):
        print("[agents] .claude/skills is missing", file=sys.stderr)
        return 1
    source = files_under(SOURCE)
    mirror = files_under(MIRROR)
    changed = 0
    for rel in sorted(mirror):
        if rel not in source:
            os.remove(mirror[rel])
            print(f"[agents] removed {rel}")
            changed += 1
    for rel in sorted(source):
        target = os.path.join(MIRROR, rel)
        if rel in mirror and read_bytes(mirror[rel]) == read_bytes(source[rel]):
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copyfile(source[rel], target)
        print(f"[agents] wrote {rel}")
        changed += 1
    for folder, dirs, names in os.walk(MIRROR, topdown=False):
        if folder != MIRROR and not os.listdir(folder):
            os.rmdir(folder)
    print(f"[agents] .agents/skills mirrors .claude/skills ({len(source)} files, {changed} changed)")
    return 0


def check_drift(problems):
    source = files_under(SOURCE)
    mirror = files_under(MIRROR)
    for rel in sorted(set(source) | set(mirror)):
        if rel not in mirror:
            problems.append(f".agents/skills/{rel} is missing; run ./{LAUNCHER} agents sync")
        elif rel not in source:
            problems.append(f".agents/skills/{rel} is stale; run ./{LAUNCHER} agents sync")
        elif read_bytes(source[rel]) != read_bytes(mirror[rel]):
            problems.append(f".agents/skills/{rel} differs from .claude/skills; run ./{LAUNCHER} agents sync")


def check_skill_format(problems):
    if not os.path.isdir(SOURCE):
        problems.append(".claude/skills is missing")
        return
    skills = sorted(d for d in os.listdir(SOURCE) if os.path.isdir(os.path.join(SOURCE, d)))
    if not skills:
        problems.append(".claude/skills holds no skill folder")
    for skill in skills:
        path = os.path.join(SOURCE, skill, "SKILL.md")
        label = f".claude/skills/{skill}/SKILL.md"
        if not os.path.isfile(path):
            problems.append(f"{label} is missing")
            continue
        text = read_bytes(path).decode("utf-8", errors="replace")
        if len(text.split("\n")) - (1 if text.endswith("\n") else 0) >= 500:
            problems.append(f"{label} has 500 lines or more")
        meta = frontmatter(text)
        if meta is None:
            problems.append(f"{label} has no frontmatter")
            continue
        name = meta.get("name", "")
        description = meta.get("description", "")
        if not name:
            problems.append(f"{label} has no name")
        else:
            if len(name) > 64:
                problems.append(f"{label} name is longer than 64 characters")
            if name != skill:
                problems.append(f"{label} name '{name}' does not match its folder '{skill}'")
            if any(word in name.lower() for word in RESERVED):
                problems.append(f"{label} name holds a reserved word")
            if TAG.search(name):
                problems.append(f"{label} name holds an XML tag")
        if not description:
            problems.append(f"{label} has no description")
        else:
            if len(description) > 1024:
                problems.append(f"{label} description is longer than 1024 characters")
            if TAG.search(description):
                problems.append(f"{label} description holds an XML tag")
    for rel, full in sorted(files_under(SOURCE).items()):
        try:
            text = read_bytes(full).decode("utf-8")
        except UnicodeDecodeError:
            continue
        for ch in text:
            if is_bad_char(ord(ch)):
                problems.append(f".claude/skills/{rel} holds U+{ord(ch):04X}")
                break


def load_json(rel, problems):
    path = os.path.join(ROOT, rel)
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        problems.append(f"{rel} is missing")
    except ValueError as exc:
        problems.append(f"{rel} is not valid JSON: {exc}")
    return None


def check_server(rel, server, problems):
    if not isinstance(server, dict):
        problems.append(f"{rel} has no {LAUNCHER} server")
        return
    command = server.get("command")
    args = server.get("args") or []
    if not isinstance(command, str) or not isinstance(args, list):
        problems.append(f"{rel} server needs a command and an args list")
        return
    if command == "sh":
        joined = " ".join(str(a) for a in args)
        if LAUNCHER not in joined or not joined.rstrip().endswith("mcp"):
            problems.append(f"{rel} must run the {LAUNCHER} launcher with mcp")
        return
    if os.path.basename(command) != LAUNCHER or args != ["mcp"]:
        problems.append(f"{rel} must name the {LAUNCHER} launcher with the argument mcp")


def check_agent_files(problems):
    import tomllib

    config = load_json(".mcp.json", problems)
    if config is not None:
        check_server(".mcp.json", (config.get("mcpServers") or {}).get(LAUNCHER), problems)
    config = load_json(".cursor/mcp.json", problems)
    if config is not None:
        check_server(".cursor/mcp.json", (config.get("mcpServers") or {}).get(LAUNCHER), problems)
    try:
        with open(os.path.join(ROOT, ".codex", "config.toml"), "rb") as f:
            toml = tomllib.load(f)
        check_server(".codex/config.toml", (toml.get("mcp_servers") or {}).get(LAUNCHER), problems)
    except OSError:
        problems.append(".codex/config.toml is missing")
    except tomllib.TOMLDecodeError as exc:
        problems.append(f".codex/config.toml is not valid TOML: {exc}")
    plugin = load_json(".claude-plugin/plugin.json", problems)
    if plugin is not None:
        skills = plugin.get("skills")
        if not isinstance(skills, list) or not skills:
            problems.append(".claude-plugin/plugin.json lists no skills")
        else:
            for entry in skills:
                target = os.path.normpath(os.path.join(ROOT, str(entry)))
                if not os.path.isfile(os.path.join(target, "SKILL.md")):
                    problems.append(f".claude-plugin/plugin.json skills path {entry} has no SKILL.md")
        check_server(".claude-plugin/plugin.json", (plugin.get("mcpServers") or {}).get(LAUNCHER), problems)
    settings = load_json(".claude/settings.json", problems)
    if settings is not None:
        mark = settings.get("attribution") or {}
        if mark.get("commit") != "" or mark.get("pr") != "" or mark.get("sessionUrl") is not False:
            problems.append(".claude/settings.json must keep attribution off (commit and pr empty, sessionUrl false)")


def check():
    problems = []
    check_drift(problems)
    check_skill_format(problems)
    check_agent_files(problems)
    if problems:
        for line in problems:
            print(f"[agents] {line}", file=sys.stderr)
        print(f"[agents] {len(problems)} problem(s)", file=sys.stderr)
        return 1
    print("[agents] clean: mirror matches, skills pass the format gate, MCP configs name the launcher")
    return 0


def backup(path, dry):
    if path.exists() and not dry:
        shutil.copy2(path, path.with_name(path.name + f".bak-{time.strftime('%Y%m%d-%H%M%S')}"))


def copy_skills(root, dry, said):
    for name in USE_SKILLS:
        source = Path(SOURCE) / name
        to = root / name
        if to.exists() and files_under(str(to)).keys() == files_under(str(source)).keys() and all(
                read_bytes(p) == read_bytes(str(to / rel)) for rel, p in files_under(str(source)).items()):
            said.append(f"  skill already at {to}")
            continue
        said.append(f"  skill -> {to}")
        if not dry:
            shutil.rmtree(to, ignore_errors=True)
            to.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, to)


def install_claude(home, dry, said):
    said.append("Claude Code:")
    claude = shutil.which("claude")
    line = subprocess.list2cmdline([LAUNCH, *ARGS])
    if claude:
        have = subprocess.run([claude, "mcp", "get", LAUNCHER], capture_output=True, text=True)
        if have.returncode == 0 and LAUNCH in have.stdout:
            said.append(f"  MCP server {LAUNCHER} already set (user scope)")
        else:
            said.append(f"  claude mcp add --scope user {LAUNCHER} -- {line}")
            if not dry:
                if have.returncode == 0:
                    subprocess.run([claude, "mcp", "remove", LAUNCHER, "--scope", "user"], capture_output=True)
                subprocess.run([claude, "mcp", "add", "--scope", "user", LAUNCHER, "--", LAUNCH, *ARGS], check=True, capture_output=True)
    else:
        said.append(f"  the claude command is not installed here; once it is, run: claude mcp add --scope user {LAUNCHER} -- {line}")
    copy_skills(home / ".claude" / "skills", dry, said)


def install_codex(home, dry, said):
    said.append("Codex:")
    cfg = Path(os.environ.get("CODEX_HOME", home / ".codex")) / "config.toml"
    block = f'[mcp_servers.{LAUNCHER}]\ncommand = {json.dumps(LAUNCH, ensure_ascii=False)}\nargs = {json.dumps(ARGS, ensure_ascii=False)}\nstartup_timeout_sec = 90\ntool_timeout_sec = 600\n'
    text = cfg.read_text(encoding="utf-8") if cfg.exists() else ""
    found = re.search(rf"(?ms)^\[mcp_servers\.{LAUNCHER}\]\n.*?(?=^\[|\Z)", text)
    if found and found.group(0).strip() == block.strip():
        said.append(f"  MCP server {LAUNCHER} already in {cfg}")
    else:
        said.append(f"  MCP server {LAUNCHER} -> {cfg}")
        if not dry:
            backup(cfg, dry)
            cfg.parent.mkdir(parents=True, exist_ok=True)
            new = text[:found.start()] + block + "\n" + text[found.end():] if found else (text.rstrip("\n") + "\n\n" if text.strip() else "") + block
            cfg.write_text(new, encoding="utf-8")
    copy_skills(home / ".agents" / "skills", dry, said)


def install_cursor(home, dry, said):
    said.append("Cursor:")
    cfg = home / ".cursor" / "mcp.json"
    raw = cfg.read_text(encoding="utf-8") if cfg.exists() else ""
    try:
        data = json.loads(raw) if raw.strip() else {}
    except ValueError:
        said.append(f"  {cfg} is not valid JSON; fix it, then run this again")
        return
    entry = {"command": LAUNCH, "args": ARGS}
    if (data.get("mcpServers") or {}).get(LAUNCHER) == entry:
        said.append(f"  MCP server {LAUNCHER} already in {cfg}")
    else:
        said.append(f"  MCP server {LAUNCHER} -> {cfg}")
        if not dry:
            backup(cfg, dry)
            data.setdefault("mcpServers", {})[LAUNCHER] = entry
            cfg.parent.mkdir(parents=True, exist_ok=True)
            cfg.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    copy_skills(home / ".agents" / "skills", dry, said)


def install(clients, dry):
    home = Path(os.environ.get("HOME", str(Path.home())))
    said = []
    for client in clients or ["claude", "codex", "cursor"]:
        {"claude": install_claude, "codex": install_codex, "cursor": install_cursor}[client](home, dry, said)
    print(("Would do (dry run):\n" if dry else "") + "\n".join(said))
    if not dry:
        print("\nRestart the clients. The first command an agent runs asks you once, in the FormTxt window, to allow outside agents.")
    return 0


def main():
    parser = argparse.ArgumentParser(prog=f"{LAUNCHER} agents", description="the agents kit")
    sub = parser.add_subparsers(dest="action", required=True)
    sync_parser = sub.add_parser("sync", help="mirror .claude/skills into .agents/skills")
    sync_parser.add_argument("--check", action="store_true", help="only check, as agents check does")
    sub.add_parser("check", help="check the mirror, the skills and the MCP configs")
    inst = sub.add_parser("install", help="register FormTxt's MCP server and skill with Claude Code, Codex and Cursor for this user")
    inst.add_argument("clients", nargs="*", choices=["claude", "codex", "cursor"], help="which clients (default all three)")
    inst.add_argument("--dry-run", action="store_true", help="say what would change and change nothing")
    args = parser.parse_args()
    if args.action == "install":
        return install(args.clients, args.dry_run)
    if args.action == "sync" and not args.check:
        return sync()
    return check()


if __name__ == "__main__":
    sys.exit(main())
