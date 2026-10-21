import csv
import io
import re
import zipfile
from xml.etree import ElementTree

from app.services import intake

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"
MAX_ROWS = 5000
MAX_COLS = 60


class Unreadable(ValueError):
    pass


def _column(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref or "A").group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def _xlsx(data: bytes, sheet: str = "") -> tuple[list[list[str]], list[str]]:
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise Unreadable("not an .xlsx workbook") from exc
    with z:
        names = set(z.namelist())
        if "xl/workbook.xml" not in names:
            raise Unreadable("not an .xlsx workbook")
        shared: list[str] = []
        if "xl/sharedStrings.xml" in names:
            root = ElementTree.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        book = ElementTree.fromstring(z.read("xl/workbook.xml"))
        rels = {}
        if "xl/_rels/workbook.xml.rels" in names:
            for rel in ElementTree.fromstring(z.read("xl/_rels/workbook.xml.rels")):
                rels[rel.get("Id")] = rel.get("Target", "")
        sheets = [(s.get("name", ""), rels.get(s.get(f"{{{NS['r']}}}id"), "")) for s in book.findall("m:sheets/m:sheet", NS)]
        if not sheets:
            raise Unreadable("the workbook has no sheets")
        pick = next((s for s in sheets if s[0] == sheet), sheets[0])
        target = pick[1].lstrip("/")
        path = target if target.startswith("xl/") else f"xl/{target}"
        if path not in names:
            raise Unreadable(f"sheet {pick[0]} is missing from the workbook")
        root = ElementTree.fromstring(z.read(path))
        rows: list[list[str]] = []
        for row in root.iter(f"{{{NS['m']}}}row"):
            out: list[str] = []
            for c in row.findall("m:c", NS):
                col = _column(c.get("r", ""))
                if col >= MAX_COLS:
                    continue
                kind = c.get("t", "")
                v = c.find("m:v", NS)
                if kind == "s" and v is not None:
                    text = shared[int(v.text or 0)] if int(v.text or 0) < len(shared) else ""
                elif kind == "inlineStr":
                    text = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
                elif kind == "b" and v is not None:
                    text = "TRUE" if v.text == "1" else "FALSE"
                else:
                    text = v.text if v is not None and v.text is not None else ""
                    if re.fullmatch(r"-?\d+\.\d{6,}", text):
                        text = repr(round(float(text), 6))
                while len(out) < col:
                    out.append("")
                out.append(text)
            rows.append(out)
            if len(rows) >= MAX_ROWS:
                break
        return rows, [s[0] for s in sheets]


def parse(name: str, data: bytes, sheet: str = "") -> dict:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext == "xlsx":
        rows, sheets = _xlsx(data, sheet)
    elif ext in ("csv", "tsv", "txt"):
        text = intake.decode(data)
        sample = text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel_tab if "\t" in sample else csv.excel
        rows = [r[:MAX_COLS] for _, r in zip(range(MAX_ROWS), csv.reader(io.StringIO(text), dialect))]
        sheets = []
    else:
        raise Unreadable(f"{name}: charts read .csv, .tsv and .xlsx data")
    rows = [r for r in rows if any(c.strip() for c in r)]
    return {"rows": rows, "sheets": sheets}
