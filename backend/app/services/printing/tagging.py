import io

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (ArrayObject, BooleanObject, DictionaryObject, NameObject, NumberObject,
                           TextStringObject)
from reportlab.platypus import Flowable


class Elem:
    def __init__(self, tag: str, parent: "Elem | None" = None, alt: str = "") -> None:
        self.tag = tag
        self.alt = alt
        self.kids: list[Elem] = []
        self.mcs: list[tuple[int, int]] = []
        self.parent = parent
        if parent is not None:
            parent.kids.append(self)

    def has_content(self) -> bool:
        return bool(self.mcs) or any(k.has_content() for k in self.kids)


class Tagged(Flowable):
    def __init__(self, inner: Flowable, elem: Elem | None, outline: tuple[str, int] | None = None) -> None:
        super().__init__()
        self.inner = inner
        self.elem = elem
        self.outline = outline
        self.hAlign = getattr(inner, "hAlign", "LEFT")
        self.vAlign = getattr(inner, "vAlign", "BOTTOM")

    def wrap(self, aw, ah):
        w, h = self.inner.wrap(aw, ah)
        self.width, self.height = w, h
        return w, h

    space: tuple[float, float] | None = None

    def getSpaceBefore(self):
        return self.space[0] if self.space else self.inner.getSpaceBefore()

    def getSpaceAfter(self):
        return self.space[1] if self.space else self.inner.getSpaceAfter()

    def getKeepWithNext(self):
        return self.inner.getKeepWithNext()

    @property
    def keepWithNext(self):
        return self.inner.getKeepWithNext()

    def split(self, aw, ah):
        parts = self.inner.split(aw, ah)
        return [Tagged(p, self.elem, self.outline if i == 0 else None) for i, p in enumerate(parts)]

    def minWidth(self):
        fn = getattr(self.inner, "minWidth", None)
        return fn() if fn else 0

    def drawOn(self, canv, x, y, _sW=0):
        if self.elem is None:
            self.inner.drawOn(canv, x, y, _sW)
            return
        counters = getattr(canv, "_ft_mcid", None)
        if counters is None:
            counters = canv._ft_mcid = {}
        page = canv.getPageNumber() - 1
        mcid = counters.get(page, 0)
        counters[page] = mcid + 1
        self.elem.mcs.append((page, mcid))
        tag = {"Figure": "Figure"}.get(self.elem.tag, self.elem.tag)
        canv._code.append(f"/{tag} <</MCID {mcid}>> BDC")
        self.inner.drawOn(canv, x, y, _sW)
        canv._code.append("EMC")

    def draw(self):
        self.inner.draw()


def artifact_begin(canv) -> None:
    canv._code.append("/Artifact BMC")


def artifact_end(canv) -> None:
    canv._code.append("EMC")


def write_structure(data: bytes, root: Elem, title: str, lang: str, headings: int) -> tuple[bytes, dict]:
    reader = PdfReader(io.BytesIO(data))
    writer = PdfWriter(clone_from=reader)
    pages = list(writer.pages)
    tree = DictionaryObject({NameObject("/Type"): NameObject("/StructTreeRoot")})
    tree_ref = writer._add_object(tree)
    parents: dict[int, dict[int, object]] = {}
    stats = {"elements": 0}

    def build(elem: Elem, parent_ref) -> object | None:
        if not elem.has_content():
            return None
        node = DictionaryObject({NameObject("/Type"): NameObject("/StructElem"), NameObject("/S"): NameObject(f"/{elem.tag}"), NameObject("/P"): parent_ref})
        if elem.alt:
            node[NameObject("/Alt")] = TextStringObject(elem.alt)
        ref = writer._add_object(node)
        stats["elements"] += 1
        kids = ArrayObject()
        for kid in elem.kids:
            made = build(kid, ref)
            if made is not None:
                kids.append(made)
        for page, mcid in elem.mcs:
            if page >= len(pages):
                continue
            page_ref = pages[page].indirect_reference
            kids.append(DictionaryObject({NameObject("/Type"): NameObject("/MCR"), NameObject("/Pg"): page_ref, NameObject("/MCID"): NumberObject(mcid)}))
            parents.setdefault(page, {})[mcid] = ref
        node[NameObject("/K")] = kids
        return ref

    doc_node = DictionaryObject({NameObject("/Type"): NameObject("/StructElem"), NameObject("/S"): NameObject("/Document"), NameObject("/P"): tree_ref})
    doc_ref = writer._add_object(doc_node)
    kids = ArrayObject()
    for kid in root.kids:
        made = build(kid, doc_ref)
        if made is not None:
            kids.append(made)
    doc_node[NameObject("/K")] = kids
    tree[NameObject("/K")] = doc_ref
    nums = ArrayObject()
    for page in sorted(parents):
        by_mcid = parents[page]
        top = max(by_mcid) + 1
        row = ArrayObject()
        for i in range(top):
            row.append(by_mcid.get(i))
        nums.append(NumberObject(page))
        nums.append(row)
        pages[page][NameObject("/StructParents")] = NumberObject(page)
    for page in pages:
        page[NameObject("/Tabs")] = NameObject("/S")
    tree[NameObject("/ParentTree")] = writer._add_object(DictionaryObject({NameObject("/Nums"): nums}))
    tree[NameObject("/ParentTreeNextKey")] = NumberObject(len(pages))
    catalog = writer._root_object
    catalog[NameObject("/StructTreeRoot")] = tree_ref
    catalog[NameObject("/MarkInfo")] = DictionaryObject({NameObject("/Marked"): BooleanObject(True)})
    catalog[NameObject("/Lang")] = TextStringObject(lang or "en-US")
    catalog[NameObject("/ViewerPreferences")] = DictionaryObject({NameObject("/DisplayDocTitle"): BooleanObject(True)})
    writer.add_metadata({"/Title": title})
    writer.pdf_header = b"%PDF-1.7"
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue(), {"elements": stats["elements"], "headings": headings}
