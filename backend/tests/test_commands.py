import threading

import pytest

from app.routers import commands as commands_router

WINDOW_COMMANDS = [
    {"id": "file.new", "label": "New document", "group": "File", "description": "Start a blank document.", "keys": ["Mod-n"], "params": [], "run": "ignored"},
    {"id": "format.bold", "label": "Bold", "group": "Format", "description": "Toggle bold on the selection.", "keys": ["Mod-b"]},
    {"id": "insert.table", "label": "Table", "group": "Insert", "description": "Insert a table.", "params": [{"name": "rows", "type": "number", "description": "rows"}]},
]
LOOPBACK = {"host": "127.0.0.1:8210"}


@pytest.fixture()
def mirrored(client):
    res = client.post("/api/commands/catalogue", json={"commands": WINDOW_COMMANDS})
    assert res.status_code == 200
    yield res.json()
    client.post("/api/commands/catalogue", json={"commands": []})


def test_the_catalogue_lists_exactly_the_commands_the_window_mirrored(client, mirrored):
    body = client.get("/api/commands").json()
    assert mirrored["size"] == body["size"] == len(WINDOW_COMMANDS)
    assert [c["id"] for c in body["commands"]] == [c["id"] for c in WINDOW_COMMANDS]
    assert body["groups"] == ["File", "Format", "Insert"]


def test_the_catalogue_keeps_the_documented_fields_and_drops_the_rest(client, mirrored):
    first = client.get("/api/commands/file.new").json()
    assert set(first) <= {"id", "label", "group", "description", "keys", "params"}
    assert first["keys"] == ["Mod-n"]


def test_the_catalogue_filters_by_group_and_by_words(client, mirrored):
    assert [c["id"] for c in client.get("/api/commands", params={"group": "format"}).json()["commands"]] == ["format.bold"]
    assert [c["id"] for c in client.get("/api/commands", params={"text": "toggle bold"}).json()["commands"]] == ["format.bold"]
    assert client.get("/api/commands", params={"text": "nothing matches this"}).json()["shown"] == 0


def test_an_unknown_command_is_a_404_with_a_hint(client, mirrored):
    res = client.get("/api/commands/no.such.command")
    assert res.status_code == 404 and "No command has the id" in res.json()["detail"]


def test_the_catalogue_survives_an_engine_restart(client, mirrored):
    commands_router._state.update(size=0, commands=[], at=0.0)
    assert [c["id"] for c in client.get("/api/commands").json()["commands"]] == [c["id"] for c in WINDOW_COMMANDS]


def test_running_a_command_with_no_window_open_says_so(client, mirrored):
    res = client.post("/api/commands/file.new", json={"params": {}}).json()
    assert res["ok"] is False and "No FormTxt window is open" in res["error"]


def test_running_an_id_outside_the_catalogue_is_refused_before_the_window(client, mirrored):
    res = client.post("/api/commands/not.in.catalogue").json()
    assert res["ok"] is False and "No command has the id" in res["error"]


def run_through_window(client, path, payload, answer):
    sent = {}

    def call():
        sent["reply"] = client.post(path, json=payload).json()

    with client.websocket_connect("/api/live", headers=LOOPBACK) as ws:
        worker = threading.Thread(target=call)
        worker.start()
        request = ws.receive_json()
        ws.send_json({"t": "result", "id": request["id"], **answer(request)})
        worker.join(timeout=20)
    assert not worker.is_alive()
    return request, sent["reply"]


def test_a_command_reaches_the_window_and_its_result_comes_back(client, mirrored):
    request, reply = run_through_window(
        client, "/api/commands/insert.table", {"params": {"rows": 3}},
        lambda req: {"ok": True, "result": {"rows": req["params"]["rows"]}})
    assert request["t"] == "run" and request["command"] == "insert.table" and request["params"] == {"rows": 3}
    assert reply == {"ok": True, "result": {"rows": 3}}


def test_a_command_the_window_fails_reports_its_error(client, mirrored):
    _, reply = run_through_window(client, "/api/commands/format.bold", {}, lambda req: {"ok": False, "error": "nothing selected"})
    assert reply == {"ok": False, "error": "nothing selected"}


def test_a_batch_stops_at_the_first_failure(client, mirrored):
    steps = [{"id": "format.bold"}, {"id": "no.such.id"}, {"id": "file.new"}]
    reply = client.post("/api/commands/batch", json={"steps": steps}).json()
    assert reply["ok"] is False
    assert [r["id"] for r in reply["results"]] == ["format.bold"]
    every = client.post("/api/commands/batch", json={"steps": steps, "stopOnError": False}).json()
    assert [r["id"] for r in every["results"]] == ["format.bold", "no.such.id", "file.new"]
