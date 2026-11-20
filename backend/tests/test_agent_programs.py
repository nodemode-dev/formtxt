import importlib.util
import json
import os
import time

import pytest

from app.core import window_key
from conftest import REPO, SYSTEM_PATH, stand_in


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


@pytest.mark.skipif(os.name == "nt", reason="the stand-ins are shell scripts")
def test_an_antigravity_tab_gets_its_entry_in_its_own_folder_and_loses_it_when_it_closes(client, stand_ins):
    from app.services import agent_programs, agents, terminal

    stand_in(stand_ins / "agy")
    folder = agent_programs.tab_folder("antigravity")
    path = folder / ".agents" / "mcp_config.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    seeded = {"mcpServers": {"other": {"command": "other"}}, "theme": "kept"}
    path.write_text(json.dumps(seeded))
    res = client.post("/api/terminal/agent", json={"kind": "antigravity", "cols": 80, "rows": 20})
    assert res.status_code == 200 and res.json()["kind"] == "antigravity" and res.json()["title"] == "Antigravity"
    assert res.json()["cwd"] == str(folder)
    session = terminal.SESSIONS[res.json()["id"]]
    token = session.env["FORMTXT_INAPP_TOKEN"]
    kept = json.loads(path.read_text())
    assert kept["theme"] == "kept" and kept["mcpServers"]["other"] == {"command": "other"}
    assert kept["mcpServers"]["formtxt_tab"]["headers"] == {"x-formtxt-inapp": token} and kept["mcpServers"]["formtxt_tab"]["serverUrl"].endswith("/mcp")
    assert path.stat().st_mode & 0o777 == 0o600
    assert agents.is_inapp(token) and all(token not in part for part in session.argv)
    assert client.delete(f"/api/terminal/{session.id}").status_code == 200
    time.sleep(0.1)
    assert json.loads(path.read_text()) == seeded
    assert not agents.is_inapp(token)


def test_a_tab_entry_that_is_not_this_tabs_is_left_alone(tmp_path):
    from app.services import agent_programs

    agent_programs.write_tab_entry(tmp_path, 8210, "first")
    agent_programs.write_tab_entry(tmp_path, 8210, "second")
    agent_programs.remove_tab_entry(tmp_path, "first")
    path = tmp_path / ".agents" / "mcp_config.json"
    assert json.loads(path.read_text())["mcpServers"]["formtxt_tab"]["headers"] == {"x-formtxt-inapp": "second"}
    agent_programs.remove_tab_entry(tmp_path, "second")
    assert json.loads(path.read_text()) == {"mcpServers": {}}


def _kit():
    spec = importlib.util.spec_from_file_location("installed_agents", REPO / "setup" / "agents.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_agents_install_adds_formtxt_to_antigravity_and_keeps_the_rest(tmp_path):
    kit = _kit()
    cfg = tmp_path / ".gemini" / "config" / "mcp_config.json"
    said = []
    kit.install_antigravity(tmp_path, True, said)
    assert not cfg.exists() and said[-1] == f"  MCP server formtxt -> {cfg}"
    cfg.parent.mkdir(parents=True)
    cfg.write_text(json.dumps({"mcpServers": {"other": {"command": "x"}}, "theme": "kept"}))
    kit.install_antigravity(tmp_path, False, said)
    now = json.loads(cfg.read_text())
    assert now == {"mcpServers": {"other": {"command": "x"}, "formtxt": {"command": kit.LAUNCH, "args": kit.ARGS}}, "theme": "kept"}
    before = cfg.read_bytes()
    kit.install_antigravity(tmp_path, False, said)
    assert said[-1] == f"  MCP server formtxt already in {cfg}" and cfg.read_bytes() == before


def test_agents_install_leaves_alone_what_it_did_not_write_for_antigravity(tmp_path):
    kit = _kit()
    cfg = tmp_path / ".gemini" / "config" / "mcp_config.json"
    older = tmp_path / ".gemini" / "antigravity-cli" / "mcp_config.json"
    older.parent.mkdir(parents=True)
    older.write_text("{}")
    said = []
    kit.install_antigravity(tmp_path, True, said)
    assert said[1] == f"  an older file was seen at {older} and left alone; the documented file is {cfg}" and older.read_text() == "{}"
    cfg.parent.mkdir(parents=True)
    foreign = json.dumps({"mcpServers": {"formtxt": {"command": "/elsewhere/other", "args": ["serve"]}}})
    cfg.write_text(foreign)
    kit.install_antigravity(tmp_path, False, said)
    assert said[-1] == f"  {cfg} has a server named formtxt that FormTxt did not write; left alone" and cfg.read_text() == foreign
    cfg.write_text("nope")
    kit.install_antigravity(tmp_path, False, said)
    assert said[-1] == f"  {cfg} is not an MCP servers file FormTxt can read; left alone" and cfg.read_text() == "nope"
