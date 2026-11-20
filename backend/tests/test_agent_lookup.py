import os
import time

import pytest

from conftest import SYSTEM_PATH, stand_in

pytestmark = pytest.mark.skipif(os.name == "nt", reason="the stand-ins are shell scripts")
NODE_STYLE = '#!/usr/bin/env node\nif [ "$1" = "--version" ]; then echo "7.7.7 (node-style stand-in)"; exit 0; fi\necho "first on PATH: ${PATH%%:*}"\nread line\n'
STAND_IN_NODE = '#!/bin/sh\nscript="$1"; shift; exec /bin/sh "$script" "$@"\n'
SIGNED_IN = '#!/bin/sh\nif [ "$1" = "auth" ]; then echo \'{"loggedIn": true}\'; exit 0; fi\necho "2.9.9 (stand-in)"\n'
BROKEN = "#!/usr/bin/env node-that-is-not-here\n"


def test_started_from_the_dock_the_status_reports_four_programs_with_how_each_was_found_and_where_it_looked(client, dock_start):
    stand_in(dock_start / ".local/bin/claude", SIGNED_IN)
    stand_in(dock_start / ".nvm/versions/node/v22.3.0/bin/codex")
    stand_in(dock_start / "odd tools" / "cursor-agent")
    (dock_start / ".shell-path").write_text(str(dock_start / "odd tools"))
    status = client.get("/api/agents/status?fresh=true").json()
    assert set(status) == {"claude", "codex", "cursor", "antigravity"}
    assert status["claude"] == status["claude"] | {"installed": True, "finding": "runs", "how": "folder", "version": "2.9.9", "signedIn": True, "path": str(dock_start / ".local/bin/claude")}
    assert status["codex"] == status["codex"] | {"installed": True, "finding": "runs", "how": "folder", "version": "9.9.9", "signedIn": None}
    assert status["cursor"] == status["cursor"] | {"installed": True, "finding": "runs", "how": "shell", "path": str(dock_start / "odd tools" / "cursor-agent")}
    assert status["cursor"]["said"] == f"Cursor is at {dock_start / 'odd tools' / 'cursor-agent'} (your shell's PATH)."
    missing = status["antigravity"]
    assert missing == missing | {"installed": False, "finding": "missing", "path": None, "version": None, "signedIn": None, "title": "Antigravity", "how": ""}
    assert missing["looked"][0] == f"PATH ({SYSTEM_PATH})" and "~/.local/bin, ~/.npm-global/bin" in missing["looked"][1] and missing["looked"][-1] == "your shell (zsh, login and interactive)"
    assert missing["said"].startswith(f"Antigravity was not found. Looked in: PATH ({SYSTEM_PATH}); ~/.local/bin, ") and missing["said"].endswith(f"Install it with: {missing['install']}.")
    window = client.get("/api/claude-code/status?fresh=true").json()
    assert (window["finding"], window["how"], window["installed"]) == ("runs", "folder", True)
    assert {kind: (entry["finding"], entry["install"] == "") for kind, entry in window["agents"].items()} == {"codex": ("runs", True), "cursor": ("runs", True), "antigravity": ("missing", False)}
    chat = client.get("/api/agent/claude/status").json()
    assert (chat["finding"], chat["how"], chat["running"]) == ("runs", "folder", False) and "state" in chat


def test_a_program_that_is_found_but_does_not_start_is_not_installed_and_says_why(client, dock_start):
    place = stand_in(dock_start / ".local/bin/codex", BROKEN)
    codex = client.get("/api/agents/status?fresh=true").json()["codex"]
    assert (codex["installed"], codex["finding"], codex["path"], codex["version"]) == (False, "broken", str(place), None)
    assert "node-that-is-not-here" in codex["error"] and codex["said"].startswith(f"Codex was found at {place} (a known install folder) but does not start: ")


def test_a_tab_starts_a_node_style_program_with_its_own_folder_first_on_the_path(client, dock_start):
    from app.services import claude_code, terminal

    place = stand_in(dock_start / ".nvm/versions/node/v22.3.0/bin/codex", NODE_STYLE)
    stand_in(place.parent / "node", STAND_IN_NODE)
    res = client.post("/api/terminal/agent", json={"kind": "codex", "cols": 80, "rows": 20})
    assert res.status_code == 200
    session = terminal.SESSIONS[res.json()["id"]]
    try:
        assert session.env["PATH"].split(os.pathsep)[0] == str(place.parent) and session.argv[:2] == [os.environ["SHELL"], "-l"]
        for _ in range(50):
            if "first on PATH" in session.scrollback():
                break
            time.sleep(0.1)
        assert f"first on PATH: {place.parent}" in session.scrollback()
    finally:
        assert client.delete(f"/api/terminal/{session.id}").status_code == 200
    assert claude_code.child_env(str(place))["PATH"].split(os.pathsep)[0] == str(place.parent)


def test_a_claude_code_tab_starts_the_program_found_in_a_known_folder(client, dock_start):
    from app.services import terminal

    place = stand_in(dock_start / ".local/bin/claude", NODE_STYLE)
    stand_in(place.parent / "node", STAND_IN_NODE)
    res = client.post("/api/terminal/claude", json={"fresh": True, "cols": 80, "rows": 20})
    assert res.status_code == 200 and res.json()["kind"] == "claude"
    session = terminal.SESSIONS[res.json()["id"]]
    try:
        assert session.env["PATH"].split(os.pathsep)[0] == str(place.parent) and session.env["FORMTXT_INAPP_TOKEN"]
        for _ in range(50):
            if "first on PATH" in session.scrollback():
                break
            time.sleep(0.1)
        assert f"first on PATH: {place.parent}" in session.scrollback()
    finally:
        assert client.delete(f"/api/terminal/{session.id}").status_code == 200


def test_opening_a_tab_or_chat_for_a_missing_or_broken_program_answers_with_the_finders_sentence(client, dock_start):
    from app.services import agent_programs

    res = client.post("/api/terminal/agent", json={"kind": "codex"})
    assert res.status_code == 404 and res.json()["detail"].startswith(f"Codex was not found. Looked in: PATH ({SYSTEM_PATH}); ")
    res = client.post("/api/terminal/claude", json={"fresh": True})
    assert res.status_code == 404 and res.json()["detail"].startswith("Claude Code was not found. Looked in: ")
    stand_in(dock_start / ".local/bin/claude", BROKEN)
    res = client.post("/api/terminal/claude", json={"fresh": True})
    assert res.status_code == 404 and " but does not start: " in res.json()["detail"]
    res = client.post("/api/agent/claude/start", json={"mode": "ask"})
    assert res.status_code == 409 and res.json()["detail"].startswith("Claude Code was found at ")
    assert client.post("/api/terminal/agent", json={"kind": "antigravity"}).status_code == 422
    assert set(agent_programs.PROGRAMS) == {"codex", "cursor", "antigravity"} and agent_programs.TABS == ("codex", "cursor")
