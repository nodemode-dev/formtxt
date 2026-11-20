import os
import time

import pytest

from app.core import window_key
from conftest import SYSTEM_PATH, stand_in


@pytest.fixture
def stand_ins(tmp_path, dock_start, monkeypatch):
    folder = tmp_path / "bin"
    for name in ("codex", "cursor-agent"):
        stand_in(folder / name)
    monkeypatch.setenv("PATH", f"{folder}{os.pathsep}{SYSTEM_PATH}")
    return folder


@pytest.fixture
def no_login_shell(dock_start):
    return dock_start


def test_the_status_says_codex_and_cursor_are_missing_with_how_to_get_them(client, no_login_shell):
    agents = client.get("/api/claude-code/status").json()["agents"]
    assert set(agents) == {"codex", "cursor", "antigravity"}
    for kind in ("codex", "cursor", "antigravity"):
        assert agents[kind]["installed"] is False and agents[kind]["path"] is None and agents[kind]["install"]


def test_the_status_finds_programs_on_the_path(client, stand_ins):
    agents = client.get("/api/claude-code/status").json()["agents"]
    assert agents["codex"] == agents["codex"] | {"installed": True, "path": str(stand_ins / "codex"), "install": ""}
    assert agents["cursor"]["path"] == str(stand_ins / "cursor-agent")


@pytest.mark.skipif(os.name == "nt", reason="the stand-ins are shell scripts")
def test_a_program_tab_gets_its_own_token_in_its_environment_never_on_its_command_line(client, stand_ins):
    from app.services import agents, terminal

    res = client.post("/api/terminal/agent", json={"kind": "codex", "cols": 80, "rows": 20})
    assert res.status_code == 200 and res.json()["kind"] == "codex" and res.json()["title"] == "Codex"
    session = terminal.SESSIONS[res.json()["id"]]
    token = session.env["FORMTXT_INAPP_TOKEN"]
    assert agents.is_inapp(token)
    assert all(token not in part for part in session.argv)
    assert session.env["FORMTXT_MCP_URL"].endswith("/mcp")
    assert client.delete(f"/api/terminal/{session.id}").status_code == 200
    time.sleep(0.1)
    assert not agents.is_inapp(token)


def test_a_missing_program_or_an_unknown_kind_is_refused(client, no_login_shell):
    assert client.post("/api/terminal/agent", json={"kind": "codex"}).status_code == 404
    assert client.post("/api/terminal/agent", json={"kind": "vim"}).status_code == 422


def test_starting_a_program_tab_needs_the_window_key(bare, stand_ins):
    res = bare.post("/api/terminal/agent", json={"kind": "codex"})
    assert res.status_code == 403 and res.json() == {"detail": window_key.REFUSED}
