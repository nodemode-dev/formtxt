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
