import io
import zipfile

import docx
import pytest
from docx.enum.section import WD_ORIENT

from app.services import store
from helpers import png_bytes, rich_document, texts


def exported(client, doc_id, fmt):
    res = client.get(f"/api/documents/{doc_id}/export", params={"format": fmt})
    assert res.status_code == 200, res.text
    return res.content


@pytest.fixture(scope="module")
def saved(client):
    doc, media = rich_document("Exchange")
    store.save(doc, media)
    return doc, media


def test_docx_export_opens_in_python_docx_with_styles_lists_tables_and_pictures(client, saved):
    doc, _ = saved
    out = docx.Document(io.BytesIO(exported(client, doc["id"], "docx")))
    styles = {p.text: p.style.name for p in out.paragraphs}
    assert styles["Chapter"] == "Heading 1"
    assert styles["Landscape"] == "Heading 2"
    bold = next(p for p in out.paragraphs if p.text == "plain bold")
    assert bold.runs[0].bold is True
    numbered = {p.text: p._p.pPr.numPr for p in out.paragraphs if p.text in ("first", "second", "nested")}
    assert all(n is not None for n in numbered.values())
    assert numbered["nested"].ilvl.val == 1
    assert numbered["first"].numId.val != numbered["second"].numId.val
    assert len(out.tables) == 1
    assert [c.text for c in out.tables[0].rows[1].cells] == ["left", "right"]
    assert out.tables[0].rows[0].cells[0]._tc.grid_span == 2
    assert len(out.inline_shapes) == 1


def test_docx_export_keeps_each_sections_page_setup(client, saved):
    doc, _ = saved
    out = docx.Document(io.BytesIO(exported(client, doc["id"], "docx")))
    assert len(out.sections) == 2
    assert out.sections[0].orientation == WD_ORIENT.PORTRAIT
    assert out.sections[1].orientation == WD_ORIENT.LANDSCAPE
    assert round(out.sections[0].page_width.pt) == 612
    assert round(out.sections[1].page_width.pt) == 842


def test_docx_round_trip_keeps_text_styles_lists_tables_pictures_and_sections(client, saved):
    doc, media = saved
    data = exported(client, doc["id"], "docx")
    made = client.post("/api/exchange/import", files=[("files", ("Exchange.docx", data, "application/octet-stream"))])
    assert made.status_code == 200, made.text
    back, back_media = store.load(made.json()["documents"][0]["id"])
    body = back["tabs"][0]["body"]
    paragraphs = [b for b in body if b["type"] == "paragraph"]
    by_text = {texts([b])[0]: b for b in paragraphs if texts([b])[0]}
    assert by_text["Chapter"]["style"] == "Heading1"
    assert by_text["Landscape"]["style"] == "Heading2"
    assert by_text["plain bold"]["content"][0]["marks"]["bold"] is True
    assert by_text["first"]["list"]["kind"] == "bullet"
    assert by_text["second"]["list"]["kind"] == "number" and by_text["second"]["list"]["level"] == 0
    assert by_text["nested"]["list"]["level"] == 1
    table = next(b for b in body if b["type"] == "table")
    assert texts([table]) == ["merged", "left", "right"]
    assert table["rows"][0]["cells"][0]["colspan"] == 2
    images = [r for b in paragraphs for r in b.get("content", []) if r.get("type") == "image"]
    assert len(images) == 1 and images[0]["media"] in back_media
    assert back_media[images[0]["media"]] == next(iter(media.values()))
    assert any(b["type"] == "sectionBreak" for b in body)
    assert len(back["sections"]) == 2
    assert back["sections"][1]["page"]["orientation"] == "landscape"


def test_a_docx_made_by_another_program_opens_with_its_headings_and_table(client):
    src = docx.Document()
    src.add_heading("From elsewhere", level=1)
    src.add_paragraph("body text")
    src.add_paragraph("item one", style="List Bullet")
    table = src.add_table(rows=2, cols=2)
    for i, cell in enumerate(table.rows[0].cells):
        cell.text = f"h{i}"
    for i, cell in enumerate(table.rows[1].cells):
        cell.text = f"v{i}"
    src.add_picture(io.BytesIO(png_bytes()))
    buf = io.BytesIO()
    src.save(buf)
    made = client.post("/api/exchange/import", files=[("files", ("elsewhere.docx", buf.getvalue(), "application/octet-stream"))])
    assert made.status_code == 200, made.text
    doc, media = store.load(made.json()["documents"][0]["id"])
    body = doc["tabs"][0]["body"]
    first = body[0]
    assert first["style"] == "Heading1" and texts([first]) == ["From elsewhere"]
    assert any(b.get("list", {}).get("kind") == "bullet" for b in body if b["type"] == "paragraph")
    assert texts([next(b for b in body if b["type"] == "table")]) == ["h0", "h1", "v0", "v1"]
    assert media


def test_export_formats_each_open_as_their_kind(client, saved):
    doc, _ = saved
    odt = zipfile.ZipFile(io.BytesIO(exported(client, doc["id"], "odt")))
    assert odt.read("mimetype") == b"application/vnd.oasis.opendocument.text"
    epub = zipfile.ZipFile(io.BytesIO(exported(client, doc["id"], "epub")))
    assert epub.read("mimetype") == b"application/epub+zip"
    assert exported(client, doc["id"], "rtf").startswith(b"{\\rtf")
    html = exported(client, doc["id"], "html").decode("utf-8")
    assert "Chapter" in html and "<table" in html
    md = exported(client, doc["id"], "md").decode("utf-8")
    assert "Chapter" in md and "left" in md
    assert "Chapter" in exported(client, doc["id"], "txt").decode("utf-8")
    dotx = zipfile.ZipFile(io.BytesIO(exported(client, doc["id"], "dotx")))
    assert "template.main+xml" in dotx.read("[Content_Types].xml").decode("utf-8")


def test_unknown_export_format_and_unknown_import_type_are_refused(client, saved):
    doc, _ = saved
    assert client.get(f"/api/documents/{doc['id']}/export", params={"format": "exe"}).status_code == 415
    res = client.post("/api/exchange/import", files=[("files", ("x.xyz", b"data", "application/octet-stream"))])
    assert res.status_code == 415


def test_a_corrupt_docx_is_refused_without_adding_a_document(client):
    before = len(client.get("/api/documents").json()["documents"])
    res = client.post("/api/exchange/import", files=[("files", ("broken.docx", b"PK not really a docx", "application/octet-stream"))])
    assert res.status_code < 500
    assert len(client.get("/api/documents").json()["documents"]) == before


def test_exporting_the_open_document_uses_the_body_not_the_saved_file(client, saved):
    doc, _ = saved
    live = {**doc, "title": "Unsaved edit"}
    live["tabs"] = [{**doc["tabs"][0], "body": doc["tabs"][0]["body"][:1]}]
    res = client.post(f"/api/documents/{doc['id']}/export", params={"format": "txt"}, json=live)
    assert res.status_code == 200
    assert "Chapter" in res.text and "left" not in res.text
