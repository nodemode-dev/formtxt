import zipfile

import pytest

from app.services import store
from helpers import rich_document, texts


def test_a_new_document_is_listed_and_is_a_file_in_the_library(client):
    doc = client.post("/api/documents", json={"title": "Listed"}).json()
    ids = [r["id"] for r in client.get("/api/documents").json()["documents"]]
    assert doc["id"] in ids
    assert zipfile.is_zipfile(store._path(doc["id"]))


def test_trash_restore_and_purge_never_lose_the_file_early(client):
    doc = client.post("/api/documents", json={"title": "Trashed"}).json()
    assert client.delete(f"/api/documents/{doc['id']}").status_code == 200
    assert doc["id"] not in [r["id"] for r in client.get("/api/documents").json()["documents"]]
    assert doc["id"] in [r["id"] for r in client.get("/api/documents/trash").json()["documents"]]
    assert client.get(f"/api/documents/{doc['id']}").status_code == 404
    assert client.post(f"/api/documents/{doc['id']}/restore").status_code == 200
    assert client.get(f"/api/documents/{doc['id']}").json()["title"] == "Trashed"
    client.delete(f"/api/documents/{doc['id']}")
    assert client.delete(f"/api/documents/trash/{doc['id']}").status_code == 200
    assert client.post(f"/api/documents/{doc['id']}/restore").status_code == 404


def test_duplicate_is_a_new_document_with_the_same_content_and_pictures(client):
    doc, media = rich_document("Original")
    store.save(doc, media)
    copy = client.post(f"/api/documents/{doc['id']}/duplicate").json()
    assert copy["id"] != doc["id"]
    got, got_media = store.load(copy["id"])
    assert got["title"] == "Original (copy)"
    assert texts(got["tabs"][0]["body"]) == texts(doc["tabs"][0]["body"])
    assert got_media == media


def test_a_ftxt_download_imports_as_the_same_text(client):
    doc, media = rich_document("Carried")
    store.save(doc, media)
    data = client.get(f"/api/documents/{doc['id']}/download").content
    made = client.post("/api/documents/import", files=[("files", ("Carried.ftxt", data, "application/x-formtxt"))])
    assert made.status_code == 200, made.text
    new_id = made.json()["documents"][0]["id"]
    assert new_id != doc["id"]
    got, got_media = store.load(new_id)
    assert texts(got["tabs"][0]["body"]) == texts(doc["tabs"][0]["body"])
    assert got_media == media


def test_the_exchange_route_opens_a_ftxt_download_too(client):
    doc, media = rich_document("Sent as a copy")
    store.save(doc, media)
    data = client.get(f"/api/documents/{doc['id']}/download").content
    made = client.post("/api/exchange/import", files=[("files", ("copy.ftxt", data, "application/x-formtxt"))])
    assert made.status_code == 200, made.text
    assert made.json()["documents"][0]["title"] == "Sent as a copy"


@pytest.mark.parametrize("route", ["/api/documents/import", "/api/exchange/import"])
def test_a_broken_ftxt_is_refused_and_adds_nothing(client, route):
    before = len(client.get("/api/documents").json()["documents"])
    made = client.post(route, files=[("files", ("bad.ftxt", b"not a package", "application/x-formtxt"))])
    assert made.status_code == 415
    assert len(client.get("/api/documents").json()["documents"]) == before


def test_a_failed_write_leaves_the_saved_file_intact(client, monkeypatch):
    doc, media = rich_document("Safe")
    store.save(doc, media)
    path = store._path(doc["id"])
    before = path.read_bytes()
    monkeypatch.setattr(store.package, "pack", lambda *a, **k: (_ for _ in ()).throw(OSError("disk full")))
    try:
        store.save(doc, media)
    except OSError:
        pass
    assert path.read_bytes() == before
