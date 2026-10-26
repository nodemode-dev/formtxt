import io
import json
import re
import zipfile

import pytest

from app.core.ids import is_id
from app.services import model, package, store
from helpers import media_name, paragraph, png_bytes, rich_document

PREFIXES = {"d_": "id", "sec_": "sections", "tab_": "tabs", "p_": "body"}


def make_zip(entries):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in entries:
            z.writestr(name, data)
    return buf.getvalue()


def test_package_layout_follows_the_contract():
    doc, media = rich_document()
    data = package.pack(doc, media)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos = z.infolist()
        assert infos[0].filename == "mimetype"
        assert infos[0].compress_type == zipfile.ZIP_STORED
        assert z.read("mimetype") == b"application/x-formtxt"
        assert z.getinfo("document.json").compress_type == zipfile.ZIP_DEFLATED
        media_infos = [i for i in infos if i.filename.startswith("media/")]
        assert [i.filename for i in media_infos] == [f"media/{n}" for n in media]
        assert all(i.compress_type == zipfile.ZIP_STORED for i in media_infos)
        stored = json.loads(z.read("document.json").decode("utf-8"))
    assert stored == doc


def test_new_document_carries_the_required_keys():
    doc = model.new_document("Contract")
    assert doc["format"] == "ftxt"
    assert doc["formatVersion"] == 1
    for key in ("id", "title", "meta", "settings", "styles", "numbering", "sections", "tabs", "notes", "comments", "media"):
        assert key in doc
    assert len(doc["sections"]) >= 1 and len(doc["tabs"]) >= 1
    assert {"author", "created", "modified", "subject", "keywords", "language"} <= set(doc["meta"])
    assert {"pageless", "defaultTab", "trackChanges"} <= set(doc["settings"])
    assert {"footnotes", "endnotes"} <= set(doc["notes"])


def test_new_document_title_is_capped_at_200_characters():
    assert len(model.new_document("x" * 500)["title"]) == 200


def test_ids_are_a_prefix_plus_four_to_forty_lowercase_letters_or_digits():
    doc = model.new_document("Ids")
    assert is_id(doc["id"], "d_")
    assert is_id(doc["sections"][0]["id"], "sec_")
    assert is_id(doc["tabs"][0]["id"], "tab_")
    assert is_id(doc["tabs"][0]["body"][0]["id"], "p_")
    assert not is_id("d_abc", "d_")
    assert not is_id("d_" + "a" * 41, "d_")
    assert not is_id("d_ABCDEF", "d_")
    assert not is_id("d_ab/../cd", "d_")
    assert not is_id("p_abcdef", "d_")


@pytest.mark.parametrize("size,expected", [("letter", (612.0, 792.0)), ("a4", (595.28, 841.89)), ("legal", (612.0, 1008.0))])
def test_page_sizes_are_in_points(size, expected):
    page = model.default_section(size)["page"]
    assert (page["width"], page["height"]) == expected


def test_landscape_swaps_the_page_sides():
    page = model.default_section("letter", "landscape")["page"]
    assert (page["width"], page["height"]) == (792.0, 612.0)


def test_section_and_margin_keys_match_the_contract():
    section = model.default_section()
    assert {"top", "right", "bottom", "left", "header", "footer", "gutter"} <= set(section["margins"])
    assert {"count", "gap"} <= set(section["columns"])
    assert section["start"] == "nextPage"


def test_unpack_refuses_a_wrong_mimetype():
    doc = model.new_document("x")
    data = make_zip([("mimetype", "application/zip"), ("document.json", json.dumps(doc))])
    with pytest.raises(model.InvalidDocument):
        package.unpack(data)


def test_unpack_refuses_a_package_without_document_json():
    with pytest.raises(model.InvalidDocument):
        package.unpack(make_zip([("mimetype", "application/x-formtxt")]))


def test_unpack_refuses_something_that_is_not_a_zip():
    with pytest.raises(model.InvalidDocument):
        package.unpack(b"plain text, not a package")


def test_unpack_refuses_a_newer_format_version():
    doc = model.new_document("x")
    doc["formatVersion"] = 2
    data = make_zip([("mimetype", "application/x-formtxt"), ("document.json", json.dumps(doc))])
    with pytest.raises(model.InvalidDocument, match="newer"):
        package.unpack(data)


def test_unpack_refuses_a_document_without_a_section_or_a_tab():
    for key in ("sections", "tabs"):
        doc = model.new_document("x")
        doc[key] = []
        data = make_zip([("mimetype", "application/x-formtxt"), ("document.json", json.dumps(doc))])
        with pytest.raises(model.InvalidDocument):
            package.unpack(data)


def test_unpack_drops_media_names_that_climb_out_of_the_package():
    doc = model.new_document("x")
    data = make_zip([("mimetype", "application/x-formtxt"), ("document.json", json.dumps(doc)),
                     ("media/ok.png", b"1"), ("media/../evil.png", b"2"), ("media/a..b.png", b"3")])
    _, media = package.unpack(data)
    assert set(media) == {"ok.png"}


def test_save_then_load_then_save_again_is_stable():
    doc, media = rich_document()
    store.save(doc, media)
    loaded, loaded_media = store.load(doc["id"])
    assert loaded == doc
    assert loaded_media == media
    first = package.pack(loaded, loaded_media)
    again, again_media = package.unpack(first)
    assert again == loaded
    assert package.pack(again, again_media) == first


def test_the_saved_file_is_a_zip_named_by_the_document_id(client):
    doc, media = rich_document()
    store.save(doc, media)
    path = store._path(doc["id"])
    assert path.name == f"{doc['id']}.ftxt"
    assert zipfile.is_zipfile(path)


def test_saving_stamps_modified_and_keeps_created(client):
    doc, media = rich_document()
    doc["meta"]["created"] = 1000.0
    doc["meta"]["modified"] = 1000.0
    store.save(doc, media)
    meta = store.load(doc["id"])[0]["meta"]
    assert meta["created"] == 1000.0
    assert meta["modified"] > 1000.0


def test_put_then_get_returns_the_same_document(client):
    doc = client.post("/api/documents", json={"title": "Via the API"}).json()
    doc["tabs"][0]["body"][0]["content"] = [{"type": "text", "text": "kept"}]
    assert client.put(f"/api/documents/{doc['id']}", json=doc).status_code == 200
    got = client.get(f"/api/documents/{doc['id']}").json()
    got_meta, doc_meta = got.pop("meta"), doc.pop("meta")
    assert got == doc
    assert got_meta["created"] == doc_meta["created"]


def test_put_refuses_a_document_saved_to_another_id(client):
    doc = client.post("/api/documents", json={"title": "x"}).json()
    other = client.post("/api/documents", json={"title": "y"}).json()
    assert client.put(f"/api/documents/{other['id']}", json=doc).status_code == 422


def test_put_refuses_a_newer_format_version(client):
    doc = client.post("/api/documents", json={"title": "x"}).json()
    doc["formatVersion"] = 2
    assert client.put(f"/api/documents/{doc['id']}", json=doc).status_code == 422
    assert client.get(f"/api/documents/{doc['id']}").json()["formatVersion"] == 1


def test_put_keeps_the_stored_media_when_the_body_carries_none(client):
    doc, media = rich_document()
    store.save(doc, media)
    sent = {**doc, "title": "renamed"}
    assert client.put(f"/api/documents/{doc['id']}", json=sent).status_code == 200
    assert store.load(doc["id"])[1] == media


def test_unknown_page_size_is_refused(client):
    assert client.post("/api/documents", json={"size": "poster"}).status_code == 422


def test_download_is_a_valid_package_and_drops_media_no_run_uses(client):
    doc, media = rich_document()
    unused = png_bytes((1, 2, 3), (3, 3))
    used = set(media)
    media = {**media, media_name(unused): unused}
    store.save(doc, media)
    body = client.get(f"/api/documents/{doc['id']}/download")
    assert body.status_code == 200
    assert body.headers["content-disposition"].endswith('.ftxt"')
    got, got_media = package.unpack(body.content)
    assert got["id"] == doc["id"]
    assert set(got_media) == used
    assert media_name(unused) not in got_media
    assert media_name(unused) not in got["media"]


def test_media_upload_is_named_by_the_hash_and_stored_once(client):
    doc = client.post("/api/documents", json={"title": "Pictures"}).json()
    data = png_bytes((9, 9, 9))
    url = f"/api/documents/{doc['id']}/media"
    first = client.post(url, files=[("files", ("a.png", data, "image/png"))]).json()
    second = client.post(url, files=[("files", ("b.png", data, "image/png"))]).json()
    name = media_name(data)
    assert first["media"][0]["name"] == name == second["media"][0]["name"]
    assert re.fullmatch(r"[0-9a-f]{20}\.png", name)
    assert list(store.load(doc["id"])[1]) == [name]
    served = client.get(f"/api/documents/{doc['id']}/media/{name}")
    assert served.content == data
    assert served.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in served.headers["content-security-policy"]


def test_media_upload_refuses_what_is_not_a_picture(client):
    doc = client.post("/api/documents", json={"title": "Pictures"}).json()
    got = client.post(f"/api/documents/{doc['id']}/media", files=[("files", ("a.png", b"not a picture", "image/png"))]).json()
    assert got["media"] == [] and got["errors"]
    assert store.load(doc["id"])[1] == {}


@pytest.mark.parametrize("name", ["..%2f..%2fsecret.png", "a/../b.png", "x.exe", "noextension"])
def test_media_route_refuses_odd_names(client, name):
    doc = client.post("/api/documents", json={"title": "Pictures"}).json()
    assert client.get(f"/api/documents/{doc['id']}/media/{name}").status_code == 404


def test_document_routes_refuse_ids_that_are_not_ids(client):
    assert client.get("/api/documents/not-an-id").status_code == 404
    assert client.get("/api/documents/d_..%2f..%2fx").status_code == 404
