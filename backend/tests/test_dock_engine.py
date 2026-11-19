import json

import pytest

from conftest import ENGINE_PORT
from test_outside_agent_question import LOOPBACK, answer, run_command, window  # noqa: F401


def call(client, name, arguments, headers=None):
    body = {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
    return client.post("/mcp", json=body, headers=headers or {})


@pytest.fixture
def unblocked(client):
    yield
    client.post("/api/settings", json={"agentsBlocked": False, "agentsAllowed": False})


def test_blocked_refuses_outside_agents_and_the_apps_own_tabs_without_asking(client, window, unblocked):
    from app.services import agents

    saved = client.post("/api/settings", json={"agentsBlocked": True}).json()
    assert saved["agentsBlocked"] is True and saved["agentsAllowed"] is False
    token = agents.issue()
    try:
        for headers in ({}, {agents.INAPP_HEADER: token}):
            for name, arguments in (("run_command", {"id": "format.bold"}), ("list_commands", {}), ("describe_command", {"id": "format.bold"})):
                result = call(client, name, arguments, headers).json()["result"]
                assert result["isError"] is True and result["content"][0]["text"] == agents.BLOCKED_REPLY
        report = client.post("/api/reports/run", json={"template": "none", "data": {"records": [{"a": 1}]}}, headers={agents.INAPP_HEADER: token})
        assert report.status_code == 403 and report.json()["detail"] == agents.BLOCKED_REPLY
    finally:
        agents.revoke(token)


def test_blocking_turns_allowed_off_and_allowing_turns_blocked_off(client, unblocked):
    assert client.post("/api/settings", json={"agentsAllowed": True}).json()["agentsAllowed"] is True
    blocked = client.post("/api/settings", json={"agentsBlocked": True}).json()
    assert blocked["agentsBlocked"] is True and blocked["agentsAllowed"] is False
    allowed = client.post("/api/settings", json={"agentsAllowed": True}).json()
    assert allowed["agentsAllowed"] is True and allowed["agentsBlocked"] is False
    both = client.post("/api/settings", json={"agentsAllowed": True, "agentsBlocked": True}).json()
    assert both["agentsBlocked"] is True and both["agentsAllowed"] is False


def test_a_closed_tabs_token_is_refused(client):
    from app.services import agents

    token = agents.issue()
    live = call(client, "list_commands", {}, {agents.INAPP_HEADER: token})
    assert live.status_code == 200 and live.json()["result"]["isError"] is False
    agents.revoke(token)
    dead = call(client, "list_commands", {}, {agents.INAPP_HEADER: token})
    assert dead.status_code == 401 and dead.json()["error"]["message"] == agents.CLOSED_REPLY
    report = client.post("/api/reports/run", json={"template": "none", "data": {"records": [{"a": 1}]}}, headers={agents.INAPP_HEADER: token})
    assert report.status_code == 401 and report.json()["detail"] == agents.CLOSED_REPLY


def test_a_question_waiting_when_the_window_reloads_is_shown_again(client, monkeypatch):
    from app.core import window_key
    from app.routers import commands, mcp
    from app.services import agents, bridge

    monkeypatch.setitem(commands._state, "commands", [{"id": "format.bold", "label": "Bold", "group": "Format"}])
    monkeypatch.setitem(mcp._state, "declined_until", 0.0)
    agents.set_allowed(False)
    with client.websocket_connect("/api/live", headers=LOOPBACK) as first:
        first.send_text(json.dumps({"type": "key", "key": window_key.KEY}))
        for _ in range(50):
            if bridge.connected():
                break
            client.get("/api/health")
        thread, box = run_command(client)
        asked = first.receive_json()
        assert asked["command"] == "__consent__"
    for _ in range(50):
        if not bridge.connected():
            break
        client.get("/api/health")
    assert thread.is_alive()
    with client.websocket_connect("/api/live", headers=LOOPBACK) as second:
        second.send_text(json.dumps({"type": "key", "key": window_key.KEY}))
        again = second.receive_json()
        assert again == asked
        answer(second, again, {"allowed": True, "once": True})
        assert second.receive_json() == {"t": "withdrawn", "id": asked["id"], "command": "__consent__", "reason": "answered"}
        ran = second.receive_json()
        assert ran["t"] == "run" and ran["command"] == "format.bold"
        answer(second, ran, {"done": True})
        thread.join(10)
    assert box["result"]["isError"] is False and agents.allowed() is False
    assert mcp._state["declined_until"] == 0.0


def test_the_engine_names_the_entry_for_its_own_tabs_formtxt_tab():
    from app.services import agent_programs, claude_code

    config = json.loads(claude_code.inapp_mcp_config(ENGINE_PORT))
    assert list(config["mcpServers"]) == ["formtxt_tab"] == [agent_programs.SERVER]
    line = " ".join(claude_code.terminal_argv("claude", ENGINE_PORT, None, None))
    assert "--allowedTools mcp__formtxt_tab " in line and '"formtxt_tab"' in line and '"formtxt"' not in line
