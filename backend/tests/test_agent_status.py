import json
import os
import stat

import pytest

from conftest import SYSTEM_PATH, stand_in


@pytest.fixture
def programs(tmp_path, dock_start, monkeypatch):
    folder = tmp_path / "bin"
    lines = {"claude": "9.9.9 (Claude Code)", "codex": "codex-cli 0.99.1", "cursor-agent": "2026.11.01-abc123"}
    for name, line in lines.items():
        stand_in(folder / name, f'#!/bin/sh\ncase "$1" in --version) echo "{line}"; exit 0;; auth) echo \'{{"loggedIn": true}}\'; exit 0;; esac\nread line\n')
    monkeypatch.setenv("PATH", f"{folder}{os.pathsep}{SYSTEM_PATH}")
    monkeypatch.setenv("FORMTXT_CLAUDE_BIN", str(folder / "claude"))
    return folder


@pytest.mark.skipif(os.name == "nt", reason="the stand-ins are shell scripts")
def test_one_call_reports_the_three_agent_programs(client, programs):
    status = client.get("/api/agents/status?fresh=true").json()
    assert set(status) == {"claude", "codex", "cursor", "antigravity"}
    assert status["antigravity"] == status["antigravity"] | {"installed": False, "finding": "missing", "path": None, "signedIn": None, "title": "Antigravity"}
    assert status["claude"] == status["claude"] | {"installed": True, "version": "9.9.9", "signedIn": True, "how": "override"}
    assert status["codex"] == status["codex"] | {"installed": True, "version": "0.99.1", "signedIn": None, "install": "npm install -g @openai/codex"}
    assert status["cursor"] == status["cursor"] | {"installed": True, "version": "2026.11.01-abc123", "path": str(programs / "cursor-agent")}
    assert all(entry["install"] for entry in status.values())


@pytest.mark.skipif(os.name == "nt", reason="the stand-ins are shell scripts")
def test_a_codex_tab_is_told_where_the_engine_is_and_which_variable_holds_its_token(client, programs):
    from app.services import terminal

    res = client.post("/api/terminal/agent", json={"kind": "codex", "cols": 80, "rows": 20})
    session = terminal.SESSIONS[res.json()["id"]]
    try:
        line = session.argv[-1]
        assert "mcp_servers.formtxt_tab.url=" in line and "/mcp" in line
        assert '"x-formtxt-inapp"="FORMTXT_INAPP_TOKEN"' in line
        assert session.env["FORMTXT_INAPP_TOKEN"] not in line
    finally:
        client.delete(f"/api/terminal/{session.id}")


@pytest.mark.skipif(os.name == "nt", reason="the stand-ins are shell scripts")
def test_a_cursor_tab_gets_a_private_config_that_names_variables_not_the_token(client, programs):
    from app.services import terminal

    res = client.post("/api/terminal/agent", json={"kind": "cursor", "cols": 80, "rows": 20})
    session = terminal.SESSIONS[res.json()["id"]]
    path = os.path.join(session.cwd, ".cursor", "mcp.json")
    try:
        assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
        text = open(path, encoding="utf-8").read()
        assert json.loads(text)["mcpServers"]["formtxt_tab"] == {"url": "${env:FORMTXT_MCP_URL}", "headers": {"x-formtxt-inapp": "${env:FORMTXT_INAPP_TOKEN}"}}
        assert session.env["FORMTXT_INAPP_TOKEN"] not in text
    finally:
        client.delete(f"/api/terminal/{session.id}")
        os.remove(path)
        os.rmdir(os.path.dirname(path))


def test_the_cursor_config_keeps_what_was_already_in_the_file(tmp_path):
    from app.services import agent_programs

    folder = tmp_path / ".cursor"
    folder.mkdir()
    (folder / "mcp.json").write_text(json.dumps({"mcpServers": {"other": {"command": "x"}}, "keep": 1}))
    assert agent_programs.cursor_config(str(tmp_path)) == str(folder / "mcp.json")
    saved = json.loads((folder / "mcp.json").read_text())
    assert saved["keep"] == 1 and saved["mcpServers"]["other"] == {"command": "x"} and "formtxt_tab" in saved["mcpServers"]
    (folder / "mcp.json").write_text("not json")
    assert agent_programs.cursor_config(str(tmp_path)) is None
    assert (folder / "mcp.json").read_text() == "not json"
