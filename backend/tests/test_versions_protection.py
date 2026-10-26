import base64
import hashlib
import json
import struct
import zipfile

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core import config
from app.services import package, store, versions, versions_vault as vault
from helpers import paragraph, texts


def new_doc(client, text="first draft"):
    doc = client.post("/api/documents", json={"title": "Guarded"}).json()
    doc["tabs"][0]["body"] = [paragraph(text, "Normal", doc["sections"][0]["id"])]
    assert client.put(f"/api/documents/{doc['id']}", json=doc).status_code == 200
    return doc


def edit(client, doc, text):
    doc["tabs"][0]["body"] = [paragraph(text, "Normal", doc["sections"][0]["id"])]
    assert client.put(f"/api/documents/{doc['id']}", json=doc).status_code == 200


def body_text(client, doc_id):
    return texts(client.get(f"/api/documents/{doc_id}").json()["tabs"][0]["body"])


def test_a_named_version_is_kept_beside_the_library_not_inside_the_package(client):
    doc = new_doc(client)
    row = client.post(f"/api/versions/{doc['id']}/name", json={"name": "Draft one"}).json()
    folder = config.data_dir() / "Versions" / doc["id"]
    assert (folder / "index.json").is_file()
    assert (folder / f"{row['id']}.ftxt").is_file()
    with zipfile.ZipFile(store._path(doc["id"])) as z:
        assert set(z.namelist()) == {"mimetype", "document.json"}
    assert row["name"] == "Draft one" and row["auto"] is False


def test_restoring_a_version_brings_back_its_text_and_keeps_what_was_there(client):
    doc = new_doc(client, "first draft")
    saved = client.post(f"/api/versions/{doc['id']}/name", json={"name": "Before the rewrite"}).json()
    edit(client, doc, "rewritten")
    assert body_text(client, doc["id"]) == ["rewritten"]
    assert client.post(f"/api/versions/{doc['id']}/v/{saved['id']}/restore").status_code == 200
    assert body_text(client, doc["id"]) == ["first draft"]
    names = [v["name"] for v in client.get(f"/api/versions/{doc['id']}").json()["versions"]]
    assert "Before restore" in names
    before = next(v for v in client.get(f"/api/versions/{doc['id']}").json()["versions"] if v["name"] == "Before restore")
    old, _, _ = versions.load_version(doc["id"], before["id"])
    assert texts(old["tabs"][0]["body"]) == ["rewritten"]


def test_version_ids_cannot_climb_out_of_the_versions_folder(client):
    doc = new_doc(client)
    assert client.get(f"/api/versions/{doc['id']}/v/..%2f..%2findex").status_code in (404, 422)
    assert client.post(f"/api/versions/{doc['id']}/v/v_1/restore").status_code == 404


def set_password(client, doc_id, password, current=""):
    return client.post(f"/api/versions/{doc_id}/password", json={"password": password, "current": current})


def test_a_password_seals_the_file_in_the_documented_envelope(client):
    doc = new_doc(client, "secret words")
    assert set_password(client, doc["id"], "correct horse").json()["protected"] is True
    raw = store._path(doc["id"]).read_bytes()
    assert raw[:8] == b"FTXTENC1"
    size = struct.unpack(">I", raw[8:12])[0]
    header_raw = raw[12:12 + size]
    header = json.loads(header_raw)
    assert header["v"] == 1 and header["id"] == doc["id"] and header["title"] == "Guarded"
    assert header["kdf"] == "pbkdf2-sha256" and header["iter"] == 600000
    nonce, body = raw[12 + size:24 + size], raw[24 + size:]
    key = hashlib.pbkdf2_hmac("sha256", b"correct horse", base64.b64decode(header["salt"]), 600000, 32)
    plain = AESGCM(key).decrypt(nonce, body, header_raw)
    assert plain[:4] == b"PK\x03\x04"
    assert package.unpack(plain)[0]["id"] == doc["id"]
    assert b"secret words" not in raw


def test_a_sealed_document_stays_listed_as_locked_with_its_title(client):
    doc = new_doc(client)
    set_password(client, doc["id"], "pw one")
    row = next(r for r in client.get("/api/documents").json()["documents"] if r["id"] == doc["id"])
    assert row["locked"] is True and row["title"] == "Guarded"


def test_a_locked_document_refuses_to_open_until_the_right_password(client):
    doc = new_doc(client, "behind the lock")
    set_password(client, doc["id"], "right one")
    vault.forget(doc["id"])
    assert client.get(f"/api/documents/{doc['id']}").status_code == 423
    assert client.post(f"/api/versions/{doc['id']}/unlock", json={"password": "wrong one"}).status_code == 403
    assert client.post(f"/api/versions/{doc['id']}/unlock", json={"password": ""}).status_code == 403
    assert client.get(f"/api/documents/{doc['id']}").status_code == 423
    assert client.post(f"/api/versions/{doc['id']}/unlock", json={"password": "right one"}).status_code == 200
    assert body_text(client, doc["id"]) == ["behind the lock"]


def test_changing_the_password_needs_the_current_one(client):
    doc = new_doc(client)
    set_password(client, doc["id"], "first pw")
    assert set_password(client, doc["id"], "second pw", current="not it").status_code == 403
    assert set_password(client, doc["id"], "second pw", current="first pw").status_code == 200


def test_removing_the_password_needs_it_and_leaves_a_plain_package(client):
    doc = new_doc(client, "open again")
    set_password(client, doc["id"], "to remove")
    vault.forget(doc["id"])
    assert client.post(f"/api/versions/{doc['id']}/password/remove", json={"password": "nope"}).status_code == 403
    assert client.post(f"/api/versions/{doc['id']}/password/remove", json={"password": "to remove"}).status_code == 200
    assert zipfile.is_zipfile(store._path(doc["id"]))
    assert body_text(client, doc["id"]) == ["open again"]


def test_saved_versions_of_a_protected_document_are_sealed_too(client):
    doc = new_doc(client, "versioned secret")
    client.post(f"/api/versions/{doc['id']}/name", json={"name": "plain one"})
    set_password(client, doc["id"], "seal them")
    folder = config.data_dir() / "Versions" / doc["id"]
    files = list(folder.glob("v_*.ftxt"))
    assert files
    assert all(f.read_bytes()[:8] == b"FTXTENC1" for f in files)


@pytest.mark.parametrize("password", [""])
def test_an_empty_password_is_refused(client, password):
    doc = new_doc(client)
    assert set_password(client, doc["id"], password).status_code == 422
    assert zipfile.is_zipfile(store._path(doc["id"]))
