import sqlite3

import pytest


def orders_db(folder):
    path = folder / "orders.db"
    con = sqlite3.connect(path)
    con.executescript(
        "create table orders(id integer primary key, customer text, placed text);"
        "create table order_items(id integer primary key, order_id int, item text, qty int, price real);"
        "insert into orders values(1001,'Ada','2026-11-01'),(1002,'Lin','2026-11-02'),(1003,'Sam','2026-11-03');"
        "insert into order_items values(1,1001,'Lamp',2,40),(2,1001,'Desk',1,220),(3,1002,'Chair',4,65);"
    )
    con.commit()
    con.close()
    return path


def count(path, table="orders"):
    con = sqlite3.connect(path)
    try:
        return con.execute(f"select count(*) from {table}").fetchone()[0]
    finally:
        con.close()


def text_of(blocks):
    return "".join(run.get("text", "") for block in blocks for run in block.get("content") or [])


def cell(*runs, header=False):
    out = {"body": [{"type": "paragraph", "id": "p_cell", "style": "Normal", "content": list(runs)}]}
    if header:
        out["header"] = True
    return out


def field(name, agg=None):
    run = {"type": "mergefield", "name": name}
    if agg:
        run["agg"] = agg
    return run


def invoice(client, repeat=True, closing=None):
    doc = client.post("/api/documents", json={"title": "Invoice"}).json()
    sid = doc["sections"][0]["id"]
    row = {"cells": [cell(field("item")), cell(field("qty")), cell(field("amount"))]}
    if repeat:
        row["repeat"] = True
    doc["tabs"][0]["body"] = [
        {"type": "paragraph", "id": "p_head", "style": "Normal", "section": sid, "content": [{"type": "text", "text": "Order "}, field("order_id")]},
        {"type": "table", "id": "t_items", "look": "grid", "columns": [200, 80, 100], "rows": [
            {"cells": [cell({"type": "text", "text": "Item"}, header=True), cell({"type": "text", "text": "Qty"}, header=True), cell({"type": "text", "text": "Amount"}, header=True)]}, row]},
        {"type": "paragraph", "id": "p_foot", "style": "Normal", "section": sid, "content": closing or [{"type": "text", "text": "Thank you"}]},
    ]
    assert client.put(f"/api/documents/{doc['id']}", json=doc).status_code == 200
    return doc


ITEMS = [
    {"order_id": "1001", "item": "Lamp", "qty": "2", "amount": "80"},
    {"order_id": "1001", "item": "Desk", "qty": "1", "amount": "220"},
    {"order_id": "1002", "item": "Chair", "qty": "4", "amount": "260"},
]


def merged(client, doc, **extra):
    r = client.post("/api/versions/merge", json={"source": doc["id"], "doc": doc, "records": ITEMS, **extra})
    assert r.status_code == 200, r.text
    return client.get(f"/api/documents/{r.json()['id']}").json()["tabs"][0]["body"]


def row_texts(table):
    return [[text_of(c["body"]) for c in row["cells"]] for row in table["rows"]]


def test_a_list_merge_repeats_the_marked_row_once_per_record_on_one_page(client):
    body = merged(client, invoice(client), mode="list")
    assert [b["type"] for b in body] == ["paragraph", "table", "paragraph"]
    assert row_texts(body[1]) == [["Item", "Qty", "Amount"], ["Lamp", "2", "80"], ["Desk", "1", "220"], ["Chair", "4", "260"]]
    assert not any(row.get("repeat") for row in body[1]["rows"])
    assert text_of([body[0]]) == "Order 1001"
    assert text_of([body[2]]) == "Thank you"


def test_a_list_merge_needs_a_repeating_row(client):
    doc = invoice(client, repeat=False)
    r = client.post("/api/versions/merge", json={"source": doc["id"], "doc": doc, "records": ITEMS, "mode": "list"})
    assert r.status_code == 422
    assert "merge.repeatRow" in r.json()["detail"]


def test_without_a_mode_each_record_gets_its_own_copy(client):
    body = merged(client, invoice(client))
    assert [b["type"] for b in body].count("pageBreak") == 2
    assert [b["type"] for b in body].count("table") == 3


def test_an_unknown_mode_is_refused(client):
    doc = invoice(client)
    r = client.post("/api/versions/merge", json={"source": doc["id"], "doc": doc, "records": ITEMS, "mode": "cards"})
    assert r.status_code == 422


def test_grouping_gives_a_page_per_order_with_its_own_rows_and_total(client):
    doc = invoice(client, closing=[{"type": "text", "text": "Total "}, field("amount", "sum"), {"type": "text", "text": " in "}, field("item", "count")])
    body = merged(client, doc, mode="list", groupBy="order_id")
    assert [b["type"] for b in body] == ["paragraph", "table", "paragraph", "pageBreak", "paragraph", "table", "paragraph"]
    assert text_of([body[0]]) == "Order 1001" and text_of([body[4]]) == "Order 1002"
    assert row_texts(body[1])[1:] == [["Lamp", "2", "80"], ["Desk", "1", "220"]]
    assert row_texts(body[5])[1:] == [["Chair", "4", "260"]]
    assert text_of([body[2]]) == "Total 300 in 2"
    assert text_of([body[6]]) == "Total 260 in 1"


@pytest.mark.parametrize("agg,expected", [("avg", "150"), ("min", "80"), ("max", "220"), ("count", "2")])
def test_each_total_kind_over_a_group(client, agg, expected):
    doc = invoice(client, closing=[field("amount", agg)])
    body = merged(client, doc, mode="list", groupBy="order_id")
    assert text_of([body[2]]) == expected


def test_the_grouped_sum_matches_the_database(client, tmp_path):
    db = orders_db(tmp_path)
    data = client.post("/api/data/sqlite", json={"path": str(db), "sql": "select order_id, item, qty, qty * price as amount from order_items"}).json()["rows"]
    records = [dict(zip(data[0], row)) for row in data[1:]]
    doc = invoice(client, closing=[field("amount", "sum")])
    r = client.post("/api/versions/merge", json={"source": doc["id"], "doc": doc, "records": records, "mode": "list", "groupBy": "order_id"})
    body = client.get(f"/api/documents/{r.json()['id']}").json()["tabs"][0]["body"]
    con = sqlite3.connect(db)
    want = con.execute("select sum(qty * price) from order_items where order_id = 1001").fetchone()[0]
    con.close()
    assert text_of([body[2]]) == str(int(want))


def test_grouping_needs_a_known_column_and_list_mode(client):
    doc = invoice(client)
    missing = client.post("/api/versions/merge", json={"source": doc["id"], "doc": doc, "records": ITEMS, "mode": "list", "groupBy": "region"})
    assert missing.status_code == 422 and "order_id" in missing.json()["detail"]
    pages = client.post("/api/versions/merge", json={"source": doc["id"], "doc": doc, "records": ITEMS, "groupBy": "order_id"})
    assert pages.status_code == 422


def test_a_total_in_a_page_merge_covers_every_record(client):
    doc = invoice(client, closing=[field("amount", "sum")])
    body = merged(client, doc)
    assert [text_of([b]) for b in body if b["type"] == "paragraph"][1::2] == ["560", "560", "560"]


@pytest.fixture
def allowed():
    from app.services import agents

    agents.set_allowed(True)
    yield
    agents.set_allowed(False)


def report(client, doc, db, out, **extra):
    body = {"template": doc["id"], "data": {"path": str(db), "sql": "select order_id, item, qty, qty * price as amount from order_items"}, "out": str(out), **extra}
    return client.post("/api/reports/run", json=body)


def test_a_report_needs_the_persons_consent_when_no_window_can_ask(client, tmp_path):
    db = orders_db(tmp_path)
    r = report(client, invoice(client), db, tmp_path / "invoice.pdf")
    assert r.status_code == 403
    assert "window" in r.json()["detail"]
    assert not (tmp_path / "invoice.pdf").exists()


def test_the_in_app_token_runs_a_report_without_asking(client, tmp_path):
    from app.services import agents

    db = orders_db(tmp_path)
    r = client.post("/api/reports/run", headers={agents.INAPP_HEADER: agents.issue()},
                    json={"template": invoice(client)["id"], "data": {"path": str(db), "sql": "select * from order_items"}, "out": str(tmp_path / "a.pdf")})
    assert r.status_code == 200, r.text
    assert (tmp_path / "a.pdf").read_bytes()[:4] == b"%PDF"


def test_an_allowed_report_writes_a_pdf_and_keeps_the_document(client, tmp_path, allowed):
    db = orders_db(tmp_path)
    out = tmp_path / "invoice-1001.pdf"
    r = report(client, invoice(client, closing=[field("amount", "sum")]), db, out, groupBy="order_id")
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["records"] == 3 and got["file"] == str(out)
    data = out.read_bytes()
    assert data[:4] == b"%PDF" and len(data) > 1024
    body = client.get(f"/api/documents/{got['id']}").json()["tabs"][0]["body"]
    assert text_of([body[2]]) == "300"


@pytest.mark.parametrize("fmt,magic", [("docx", b"PK"), ("ftxt", b"PK")])
def test_other_formats_write_their_packages(client, tmp_path, allowed, fmt, magic):
    db = orders_db(tmp_path)
    out = tmp_path / f"invoice.{fmt}"
    assert report(client, invoice(client), db, out, format=fmt).status_code == 200
    assert out.read_bytes()[:2] == magic


def test_an_existing_file_is_kept_unless_overwrite_is_sent(client, tmp_path, allowed):
    db = orders_db(tmp_path)
    out = tmp_path / "invoice.pdf"
    out.write_bytes(b"keep me")
    doc = invoice(client)
    r = report(client, doc, db, out)
    assert r.status_code == 409 and "overwrite" in r.json()["detail"]
    assert out.read_bytes() == b"keep me"
    assert report(client, doc, db, out, overwrite=True).status_code == 200
    assert out.read_bytes()[:4] == b"%PDF"


def test_a_link_or_folder_at_out_is_never_written(client, tmp_path, allowed):
    db = orders_db(tmp_path)
    kept = tmp_path / "kept.pdf"
    kept.write_bytes(b"kept")
    link = tmp_path / "link.pdf"
    link.symlink_to(kept)
    folder = tmp_path / "folder.pdf"
    folder.mkdir()
    doc = invoice(client)
    assert report(client, doc, db, link, overwrite=True).status_code == 409
    assert report(client, doc, db, folder, overwrite=True).status_code == 409
    assert kept.read_bytes() == b"kept"


def test_bad_out_paths_and_inputs_are_refused(client, tmp_path, allowed):
    db = orders_db(tmp_path)
    doc = invoice(client)
    assert report(client, doc, db, "invoice.pdf").status_code == 422
    assert report(client, doc, db, tmp_path / "invoice.txt").status_code == 422
    assert report(client, doc, db, tmp_path / "missing" / "invoice.pdf").status_code == 422
    assert client.post("/api/reports/run", json={"template": "d_missing", "data": {"path": str(db), "sql": "select 1"}}).status_code == 404
    assert client.post("/api/reports/run", json={"template": doc["id"], "data": {"path": str(db), "sql": "delete from orders"}}).status_code == 422
    both = {"template": doc["id"], "data": {"path": str(db), "sql": "select 1", "records": ITEMS}}
    assert client.post("/api/reports/run", json=both).status_code == 422
    assert count(db) == 3
    assert sorted(p.name for p in tmp_path.iterdir()) == ["orders.db"]


def test_records_can_stand_in_for_a_query(client, tmp_path, allowed):
    r = client.post("/api/reports/run", json={"template": invoice(client)["id"], "data": {"records": ITEMS}})
    assert r.status_code == 200
    assert r.json()["records"] == 3 and r.json()["file"] == ""


def test_a_select_reads_like_a_data_file_with_the_tables_listed(client, tmp_path):
    db = orders_db(tmp_path)
    out = client.post("/api/data/sqlite", json={"path": str(db), "sql": "select * from orders;"}).json()
    assert out["rows"][0] == ["id", "customer", "placed"]
    assert out["rows"][1:] == [["1001", "Ada", "2026-11-01"], ["1002", "Lin", "2026-11-02"], ["1003", "Sam", "2026-11-03"]]
    assert out["sheets"] == ["order_items", "orders"]


def test_a_path_alone_lists_the_tables(client, tmp_path):
    db = orders_db(tmp_path)
    out = client.post("/api/data/sqlite", json={"path": str(db)}).json()
    assert out == {"rows": [], "sheets": ["order_items", "orders"]}


def test_whole_reals_drop_the_point_and_null_reads_empty(client, tmp_path):
    db = orders_db(tmp_path)
    out = client.post("/api/data/sqlite", json={"path": str(db), "sql": "select price, null as note, 2.5 as half from order_items where id = 1"}).json()
    assert out["rows"] == [["price", "note", "half"], ["40", "", "2.5"]]


@pytest.mark.parametrize("sql", ["DROP TABLE orders", "delete from orders", "select 1; delete from orders", "with x as (select 1) delete from orders", "pragma query_only = off"])
def test_anything_but_one_select_is_refused_and_the_file_keeps_its_rows(client, tmp_path, sql):
    db = orders_db(tmp_path)
    r = client.post("/api/data/sqlite", json={"path": str(db), "sql": sql})
    assert r.status_code == 422
    assert count(db) == 3


def test_relative_missing_and_non_database_paths_are_refused(client, tmp_path):
    other = tmp_path / "notes.txt"
    other.write_text("hello", encoding="utf-8")
    for path in ("orders.db", str(tmp_path / "missing.db"), str(other)):
        r = client.post("/api/data/sqlite", json={"path": path, "sql": "select 1"})
        assert r.status_code == 422, path
    assert not (tmp_path / "missing.db").exists()


def test_the_reply_stops_at_2000_records_and_60_columns(client, tmp_path):
    db = orders_db(tmp_path)
    cols = ", ".join(f"x as c{i}" for i in range(70))
    sql = f"with recursive n(x) as (select 1 union all select x + 1 from n where x < 2500) select {cols} from n"
    out = client.post("/api/data/sqlite", json={"path": str(db), "sql": sql}).json()
    assert len(out["rows"]) == 2001
    assert all(len(row) == 60 for row in out["rows"])
