import json
import threading
import time

import pytest

from conftest import ENGINE_PORT

LOOPBACK = {"host": f"127.0.0.1:{ENGINE_PORT}"}


@pytest.fixture
def window(client, monkeypatch):
    from app.core import window_key
    from app.routers import commands, mcp
    from app.services import agents, bridge

    monkeypatch.setitem(commands._state, "commands", [{"id": "format.bold", "label": "Bold", "group": "Format"}])
    monkeypatch.setitem(mcp._state, "declined_until", 0.0)
    agents.set_allowed(False)
    with client.websocket_connect("/api/live", headers=LOOPBACK) as ws:
        ws.send_text(json.dumps({"type": "key", "key": window_key.KEY}))
        for _ in range(50):
            if bridge.connected():
                break
            client.get("/api/health")
        assert bridge.connected()
        yield ws
    agents.set_allowed(False)
    mcp._state["declined_until"] = 0.0


def run_command(client, cid="format.bold", headers=None):
    box = {}

    def go():
        body = {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "run_command", "arguments": {"id": cid}}}
        box["result"] = client.post("/mcp", json=body, headers=headers or {}).json()["result"]

    thread = threading.Thread(target=go)
    thread.start()
    return thread, box


def answer(ws, request, result):
    ws.send_json({"t": "result", "id": request["id"], "ok": True, "result": result})


def test_the_question_says_who_asks_what_for_and_which_answers_stand(client, window):
    from app.routers import mcp
    from app.services import agents

    opened = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"clientInfo": {"name": "probe-agent"}}})
    session = opened.headers["mcp-session-id"]
    before = time.time()
    thread, box = run_command(client, headers={"mcp-session-id": session})
    asked = window.receive_json()
    assert asked["t"] == "run" and asked["command"] == "__consent__" and asked["id"]
    params = asked["params"]
    assert params["agent"] == "probe-agent" and params["tool"] == "run_command" and params["command"] == "format.bold"
    assert params["what"] == "run the command Bold (format.bold)"
    assert params["answers"] == ["deny", "once", "always"] and params["always"] == "all"
    assert params["seconds"] == mcp.CONSENT_SECONDS and before + 170 < params["expiresAt"] < time.time() + 181
    answer(window, asked, {"allowed": False})
    assert window.receive_json() == {"t": "withdrawn", "id": asked["id"], "command": "__consent__", "reason": "answered"}
    thread.join(10)
    assert box["result"]["isError"] is True and "did not allow" in box["result"]["content"][0]["text"]
    assert agents.allowed() is False


def test_a_caller_that_named_no_session_is_asked_about_without_a_name(client, window):
    thread, box = run_command(client)
    asked = window.receive_json()
    assert asked["params"]["agent"] == ""
    answer(window, asked, {"allowed": False})
    thread.join(10)
    assert box["result"]["isError"] is True


def test_allow_once_runs_that_call_and_the_next_call_asks_again(client, window):
    from app.services import agents

    for _ in range(2):
        thread, box = run_command(client)
        asked = window.receive_json()
        assert asked["command"] == "__consent__"
        answer(window, asked, {"allowed": True, "once": True})
        assert window.receive_json()["t"] == "withdrawn"
        ran = window.receive_json()
        assert ran["t"] == "run" and ran["command"] == "format.bold"
        answer(window, ran, {"done": True})
        thread.join(10)
        assert box["result"]["isError"] is False
        assert agents.allowed() is False


def test_allow_without_once_is_kept_and_later_calls_do_not_ask(client, window):
    from app.services import agents

    thread, box = run_command(client)
    asked = window.receive_json()
    answer(window, asked, {"allowed": True})
    assert window.receive_json()["reason"] == "answered"
    answer(window, window.receive_json(), {"done": True})
    thread.join(10)
    assert box["result"]["isError"] is False and agents.allowed() is True
    thread, box = run_command(client)
    ran = window.receive_json()
    assert ran["command"] == "format.bold"
    answer(window, ran, {"done": True})
    thread.join(10)
    assert box["result"]["isError"] is False


def test_a_question_nobody_answers_is_withdrawn_when_its_time_is_up(client, window, monkeypatch):
    from app.routers import mcp

    monkeypatch.setattr(mcp, "CONSENT_SECONDS", 0.3)
    thread, box = run_command(client)
    asked = window.receive_json()
    assert asked["params"]["seconds"] == 0.3
    assert window.receive_json() == {"t": "withdrawn", "id": asked["id"], "command": "__consent__", "reason": "expired"}
    thread.join(10)
    assert box["result"]["isError"] is True


def test_a_tab_token_is_not_asked_about(client, window):
    from app.services import agents

    token = agents.issue()
    try:
        thread, box = run_command(client, headers={agents.INAPP_HEADER: token})
        ran = window.receive_json()
        assert ran["command"] == "format.bold"
        answer(window, ran, {"done": True})
        thread.join(10)
        assert box["result"]["isError"] is False
    finally:
        agents.revoke(token)


def test_the_report_question_names_the_file_it_would_save(client, window, tmp_path):
    out = tmp_path / "invoice.pdf"
    box = {}

    def go():
        box["reply"] = client.post("/api/reports/run", json={"template": "d_missing", "data": {"records": [{"a": "1"}]}, "out": str(out)})

    thread = threading.Thread(target=go)
    thread.start()
    asked = window.receive_json()
    assert asked["command"] == "__consent__"
    assert asked["params"]["tool"] == "report" and asked["params"]["file"] == str(out) and str(out) in asked["params"]["what"]
    answer(window, asked, {"allowed": False})
    thread.join(10)
    assert box["reply"].status_code == 403 and not out.exists()
