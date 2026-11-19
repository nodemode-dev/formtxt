import json
import re

import pytest
from starlette.websockets import WebSocketDisconnect

from conftest import ENGINE_PORT

READS = {"GET", "HEAD", "OPTIONS"}
OPEN = {("POST", "/mcp"), ("DELETE", "/mcp"), ("POST", "/api/window/key"), ("POST", "/api/reports/run")}
REFUSED = {"detail": "Only the FormTxt window can do this"}
LOOPBACK = {"host": f"127.0.0.1:{ENGINE_PORT}"}


def write_operations(app):
    return [(m.upper(), path) for path, item in app.openapi()["paths"].items() for m in item if m.upper() not in READS]


def test_the_open_list_is_short_and_named():
    from app.core import window_key

    assert set(window_key.OPEN) == {"/mcp", "/api/window/key", "/api/reports/run"}


def test_every_write_route_needs_the_window_key(app, bare):
    ops = write_operations(app)
    assert len(ops) > 60
    answered = []
    for method, path in ops:
        if (method, path) in OPEN:
            continue
        url = re.sub(r"\{[^}]+\}", "x", path)
        for headers in ({}, {"x-formtxt-window-key": "x" * 43}):
            r = bare.request(method, url, json={}, headers=headers)
            if r.status_code != 403 or r.json() != REFUSED:
                answered.append(f"{method} {path} {r.status_code}")
    assert not answered, "write routes that answer without the window key (add the key, or name the route in window_key.OPEN with its caller): " + ", ".join(answered)


def test_the_share_link_list_needs_the_key(bare, client):
    assert bare.get("/api/collab/links").status_code == 403
    assert client.get("/api/collab/links").status_code == 200


def test_a_report_run_without_the_key_meets_consent_not_the_key(bare):
    r = bare.post("/api/reports/run", json={"template": "d_missing", "data": {"records": [{"a": 1}]}})
    assert r.status_code == 403 and r.json() != REFUSED


def test_a_live_client_without_the_key_is_not_a_window(bare):
    from app.services import bridge

    with pytest.raises(WebSocketDisconnect) as closed:
        with bare.websocket_connect("/api/live", headers=LOOPBACK) as ws:
            ws.send_text(json.dumps({"type": "key", "key": "x" * 43}))
            ws.receive_text()
    assert closed.value.code == 4403
    assert not bridge.connected()


def test_a_live_client_with_the_key_is_a_window(bare):
    from app.core import window_key
    from app.services import bridge

    with bare.websocket_connect("/api/live", headers=LOOPBACK) as ws:
        ws.send_text(json.dumps({"type": "key", "key": window_key.KEY}))
        for _ in range(50):
            if bridge.connected():
                break
            bare.get("/api/health")
        assert bridge.connected()


def test_the_bootstrap_answers_once(bare, monkeypatch):
    from app.core import window_key

    monkeypatch.setitem(window_key.STATE, "claimed", False)
    monkeypatch.setitem(window_key.STATE, "secondClaim", False)
    first = bare.post("/api/window/key")
    assert first.status_code == 200 and first.json()["key"] == window_key.KEY
    assert bare.post("/api/window/key").status_code == 409
    assert bare.get("/api/settings").json()["secondWindowClaim"] is True
    monkeypatch.setenv(window_key.STDOUT_ENV, "1")
    assert bare.post("/api/window/key").status_code == 404


def test_in_app_tokens_are_issued_one_by_one_and_die_when_revoked():
    from app.services import agents

    one, two = agents.issue(), agents.issue()
    assert one != two and agents.is_inapp(one) and agents.is_inapp(two)
    agents.revoke(one)
    assert not agents.is_inapp(one) and agents.is_inapp(two)
    agents.revoke(two)
    assert not agents.is_inapp("") and not agents.is_inapp(None)


def test_cloud_storage_is_a_window_only_command():
    from app.routers import mcp

    assert mcp.window_only("cloud.set") and not mcp.window_only("cloud.get")
