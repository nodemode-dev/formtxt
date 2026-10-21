from xml.sax.saxutils import escape

from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.opc.part import Part
from docx.oxml import parse_xml
from docx.oxml.ns import qn

from app.core.ids import new_id

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.%s+xml"
SUP = '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'


class DocxNotes:
    def __init__(self, writer, notes: dict) -> None:
        self.w = writer
        self.items: dict[str, list[tuple[int, str]]] = {"footnote": [], "endnote": []}

    def anchor(self, p, block: dict) -> None:
        return None

    def reference(self, p, run: dict) -> None:
        kind = "endnote" if run.get("kind") == "endnote" else "footnote"
        nid = len(self.items[kind]) + 1
        self.items[kind].append((nid, str(run.get("note") or "")))
        el = parse_xml(f'<w:r xmlns:w="{W}">{SUP}<w:{kind}Reference w:id="{nid}"/></w:r>')
        p._p.append(el)

    def finish(self) -> None:
        for kind, rel in (("footnote", RT.FOOTNOTES), ("endnote", RT.ENDNOTES)):
            if not self.items[kind]:
                continue
            body = [
                f'<w:{kind} w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:{kind}>',
                f'<w:{kind} w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:{kind}>',
            ]
            for nid, text in self.items[kind]:
                body.append(
                    f'<w:{kind} w:id="{nid}"><w:p><w:r>{SUP}<w:{kind}Ref/></w:r>'
                    f'<w:r><w:t xml:space="preserve"> {escape(text)}</w:t></w:r></w:p></w:{kind}>')
            xml = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:{kind}s xmlns:w="{W}">{"".join(body)}</w:{kind}s>'
            part = Part(PackURI(f"/word/{kind}s.xml"), CT % f"{kind}s", xml.encode("utf-8"), self.w.d.part.package)
            self.w.d.part.relate_to(part, rel)


def _note_text(reader, kind: str, nid: str) -> str:
    cache = reader.__dict__.setdefault("_note_cache", {})
    if kind not in cache:
        cache[kind] = {}
        rel_type = RT.FOOTNOTES if kind == "footnote" else RT.ENDNOTES
        for rel in reader.d.part.rels.values():
            if rel.reltype == rel_type:
                root = parse_xml(rel.target_part.blob)
                for n in root.findall(qn(f"w:{kind}")):
                    text = "".join(t.text or "" for t in n.iter(qn("w:t")))
                    cache[kind][n.get(qn("w:id"))] = text.strip()
    return cache[kind].get(nid, "")


def read_docx(reader) -> None:
    return None


def reference_run(reader, el) -> dict | None:
    kind = "endnote" if el.tag == qn("w:endnoteReference") else "footnote"
    nid = el.get(qn("w:id"))
    if nid is None:
        return None
    counts = reader.__dict__.setdefault("_note_counts", {"footnote": 0, "endnote": 0})
    counts[kind] += 1
    return {"type": "noteRef", "id": new_id("n_"), "kind": kind, "n": counts[kind], "note": _note_text(reader, kind, nid), "text": str(counts[kind])}
