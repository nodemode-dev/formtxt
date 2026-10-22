from xml.sax.saxutils import escape, quoteattr

from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.opc.part import Part
from docx.oxml import parse_xml
from docx.oxml.ns import qn

from app.core.ids import new_id
from app.services.exchange import docx_rev

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W14 = "http://schemas.microsoft.com/office/word/2010/wordml"
W15 = "http://schemas.microsoft.com/office/word/2012/wordml"
MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
CT_COMMENTS = "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"
CT_EXT = "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"
RT_EXT = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended"


def initials(author: str) -> str:
    parts = [p for p in str(author or "").replace("@", " ").split() if p]
    return "".join(p[0].upper() for p in parts[:3]) or "U"


def paragraphs(text: str, first_ref: bool, pid: str) -> str:
    lines = str(text or "").split("\n") or [""]
    out = []
    for i, line in enumerate(lines):
        attr = f' w14:paraId="{pid}"' if i == len(lines) - 1 else ""
        ref = "<w:r><w:annotationRef/></w:r>" if i == 0 and first_ref else ""
        body = f'<w:r><w:t xml:space="preserve">{escape(line)}</w:t></w:r>' if line else ""
        out.append(f"<w:p{attr}>{ref}{body}</w:p>")
    return "".join(out)


def write(writer) -> None:
    order = writer.cm_order
    if not order:
        return
    comments = writer.src.get("comments") or {}
    items: list[str] = []
    ext: list[str] = []
    para = 0x10000000

    def one(num: int, c: dict, parent_pid: str | None, done: bool) -> str:
        nonlocal para
        para += 1
        pid = f"{para:08X}"
        author = str(c.get("author") or "Unknown")
        items.append(f'<w:comment w:id="{num}" w:author={quoteattr(author)} w:date="{docx_rev.iso(c.get("time"))}" w:initials={quoteattr(initials(author))}>'
                     f'{paragraphs(c.get("text") or "", True, pid)}</w:comment>')
        attrs = f'w15:paraId="{pid}" w15:done="{1 if done else 0}"'
        if parent_pid:
            attrs += f' w15:paraIdParent="{parent_pid}"'
        ext.append(f"<w15:commentEx {attrs}/>")
        return pid

    for fid in order:
        c = comments.get(fid) or {}
        info = writer.cm_map[fid]
        pid = one(info["id"], c, None, bool(c.get("resolved")))
        for num, reply in zip(info["replies"], c.get("replies") or []):
            one(num, reply, pid, bool(c.get("resolved")))
    head = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    root = f'xmlns:w="{W}" xmlns:w14="{W14}" xmlns:mc="{MC}" mc:Ignorable="w14"'
    package = writer.d.part.package
    main = Part(PackURI("/word/comments.xml"), CT_COMMENTS, f'{head}<w:comments {root}>{"".join(items)}</w:comments>'.encode("utf-8"), package)
    writer.d.part.relate_to(main, RT.COMMENTS)
    extra = Part(PackURI("/word/commentsExtended.xml"), CT_EXT,
                 f'{head}<w15:commentsEx xmlns:w15="{W15}" xmlns:mc="{MC}" mc:Ignorable="w15">{"".join(ext)}</w15:commentsEx>'.encode("utf-8"), package)
    writer.d.part.relate_to(extra, RT_EXT)


def text_of(el) -> str:
    lines = []
    for p in el.findall(qn("w:p")):
        lines.append("".join(t.text or "" for t in p.iter(qn("w:t"))))
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines)


def read(reader) -> None:
    reader.cm_map = {}
    reader.cm_active = []
    reader.cm_quote = {}
    main = ext = None
    for rel in reader.d.part.rels.values():
        if rel.is_external:
            continue
        if rel.reltype == RT.COMMENTS:
            main = rel.target_part
        elif rel.reltype == RT_EXT:
            ext = rel.target_part
    if main is None:
        return
    try:
        root = parse_xml(main.blob)
    except Exception:
        return
    state: dict[str, dict] = {}
    if ext is not None:
        try:
            for ce in parse_xml(ext.blob):
                pid = ce.get("{%s}paraId" % W15)
                if pid:
                    state[pid] = {"parent": ce.get("{%s}paraIdParent" % W15), "done": ce.get("{%s}done" % W15) in ("1", "true")}
        except Exception:
            state = {}
    last_para: dict[str, str] = {}
    rows: list[tuple[str, dict, str | None]] = []
    for c in root.findall(qn("w:comment")):
        cid = c.get(qn("w:id"))
        ps = c.findall(qn("w:p"))
        pid = ps[-1].get("{%s}paraId" % W14) if ps else None
        if cid is None:
            continue
        if pid:
            last_para[pid] = cid
        rows.append((cid, {"author": (c.get(qn("w:author")) or "Unknown")[:200], "time": docx_rev.parse_iso(c.get(qn("w:date"))), "text": text_of(c)[:8000]}, pid))
    out = reader.doc.setdefault("comments", {})
    roots: dict[str, str] = {}
    pending = []
    for cid, data, pid in rows:
        parent_pid = (state.get(pid or "") or {}).get("parent")
        parent_cid = last_para.get(parent_pid or "")
        if parent_cid is not None and parent_cid != cid:
            pending.append((cid, data, parent_cid))
            continue
        fid = new_id("c_")
        roots[cid] = fid
        reader.cm_map[cid] = fid
        out[fid] = {"id": fid, "author": data["author"], "time": data["time"], "text": data["text"], "quote": "", "resolved": bool((state.get(pid or "") or {}).get("done")),
                    "assignee": "", "mentions": [], "reactions": {}, "replies": []}
    for cid, data, parent_cid in pending:
        top = parent_cid
        guard = 0
        while top not in roots and guard < 8:
            nxt = next((p for c2, d2, p in pending if c2 == top), None)
            if nxt is None:
                break
            top = nxt
            guard += 1
        fid = roots.get(top)
        if fid is None:
            fid = new_id("c_")
            roots[cid] = fid
            reader.cm_map[cid] = fid
            out[fid] = {"id": fid, "author": data["author"], "time": data["time"], "text": data["text"], "quote": "", "resolved": False,
                        "assignee": "", "mentions": [], "reactions": {}, "replies": []}
            continue
        reader.cm_map[cid] = fid
        out[fid]["replies"].append({"id": new_id("r_"), "author": data["author"], "time": data["time"], "text": data["text"], "reactions": {}})
