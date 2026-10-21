import base64
import html
import re

LINK_OK = re.compile(r"^(https?://|mailto:)", re.I)
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
FAMILY = re.compile(r"[^A-Za-z0-9 _-]")
HEADING = re.compile(r"^Heading([1-6])$")


SERIF = re.compile(r"times|georgia|garamond|serif|cambria|merriweather|lora|palatino|book|minion|baskerville", re.I)


def family(name: object) -> str:
    clean = FAMILY.sub("", str(name))
    return f"font-family:'{clean}',{'serif' if SERIF.search(clean) and 'sans' not in clean.lower() else 'sans-serif'}"


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def _pt(value: object) -> str:
    try:
        return f"{float(value):g}pt"
    except (TypeError, ValueError):
        return "0pt"


def _run_css(run: dict) -> str:
    out = []
    if COLOR.match(str(run.get("color", ""))):
        out.append(f"color:{run['color']}")
    if run.get("font"):
        out.append(family(run["font"]))
    if isinstance(run.get("size"), (int, float)) and run["size"] > 0:
        out.append(f"font-size:{_pt(run['size'])}")
    if run.get("bold"):
        out.append("font-weight:700")
    if run.get("italic"):
        out.append("font-style:italic")
    return ";".join(out)


def _para_css(para: dict) -> str:
    out = []
    if para.get("align") in ("left", "center", "right", "justify"):
        out.append(f"text-align:{para['align']}")
    for key, prop in (("spaceBefore", "margin-top"), ("spaceAfter", "margin-bottom"), ("indentLeft", "margin-left"), ("indent", "margin-left"), ("indentRight", "margin-right")):
        if isinstance(para.get(key), (int, float)):
            out.append(f"{prop}:{_pt(para[key])}")
    if isinstance(para.get("lineSpacing"), (int, float)) and para["lineSpacing"] > 0:
        out.append(f"line-height:{para['lineSpacing']:g}")
    return ";".join(out)


class Renderer:
    def __init__(self, doc: dict, media: dict[str, bytes]) -> None:
        self.doc = doc
        self.media = media
        self.styles = doc.get("styles") or {}
        self.used: set[str] = set()

    def data_uri(self, name: str) -> str:
        data = self.media.get(name)
        if data is None or ".." in name:
            return ""
        meta = (self.doc.get("media") or {}).get(name) or {}
        kind = str(meta.get("type") or "image/png")
        if not re.fullmatch(r"image/[a-z0-9.+-]+", kind):
            kind = "image/png"
        return f"data:{kind};base64,{base64.b64encode(data).decode('ascii')}"

    def resolve(self, style_id: str) -> tuple[dict, dict]:
        run: dict = {}
        para: dict = {}
        chain = []
        seen = set()
        cur = style_id
        while cur and cur in self.styles and cur not in seen:
            seen.add(cur)
            chain.append(self.styles[cur])
            cur = self.styles[cur].get("basedOn")
        for st in reversed(chain):
            run.update(st.get("run") or {})
            para.update(st.get("para") or {})
        return run, para

    def inline(self, runs: list) -> str:
        out = []
        for r in runs or []:
            if not isinstance(r, dict):
                continue
            kind = r.get("type")
            if kind == "text":
                out.append(self.text_run(r))
            elif kind == "break":
                out.append("<br>")
            elif kind == "tab":
                out.append("<span style=\"display:inline-block;width:2em\"></span>")
            elif kind == "image":
                src = self.data_uri(str(r.get("media", "")))
                if src:
                    w, h = r.get("width"), r.get("height")
                    size = f" width=\"{float(w) * 96 / 72:.0f}\" height=\"{float(h) * 96 / 72:.0f}\"" if isinstance(w, (int, float)) and isinstance(h, (int, float)) else ""
                    out.append(f"<img src=\"{src}\" alt=\"{esc(r.get('alt', ''))}\"{size}>")
            elif kind == "math":
                out.append(f"<code>{esc(r.get('latex', ''))}</code>")
            elif kind == "field":
                out.append(esc(r.get("result", "")))
            elif kind == "chip":
                out.append(f"<span class=\"chip\">{esc(r.get('text', ''))}</span>")
            elif kind == "shape":
                text = r.get("text")
                if text:
                    out.append(f"<span class=\"shape\">{esc(text)}</span>")
        return "".join(out)

    def text_run(self, r: dict) -> str:
        marks = r.get("marks") or {}
        body = esc(r.get("text", ""))
        css = []
        if COLOR.match(str(marks.get("color", ""))):
            css.append(f"color:{marks['color']}")
        if COLOR.match(str(marks.get("highlight", ""))):
            css.append(f"background:{marks['highlight']}")
        if marks.get("font"):
            css.append(family(marks["font"]))
        if isinstance(marks.get("size"), (int, float)) and marks["size"] > 0:
            css.append(f"font-size:{_pt(marks['size'])}")
        if marks.get("smallCaps"):
            css.append("font-variant:small-caps")
        if marks.get("allCaps"):
            css.append("text-transform:uppercase")
        if css:
            body = f"<span style=\"{';'.join(css)}\">{body}</span>"
        for key, tag in (("bold", "strong"), ("italic", "em"), ("strike", "s"), ("superscript", "sup"), ("subscript", "sub"), ("code", "code")):
            if marks.get(key):
                body = f"<{tag}>{body}</{tag}>"
        if marks.get("underline"):
            body = f"<u>{body}</u>"
        href = str(marks.get("link") or "")
        if href and LINK_OK.match(href):
            body = f"<a href=\"{esc(href)}\" rel=\"noopener noreferrer\">{body}</a>"
        return body

    def paragraph(self, b: dict) -> str:
        style = str(b.get("style") or "Normal")
        props = b.get("props") or {}
        self.used.add(style)
        m = HEADING.match(style)
        tag = f"h{m.group(1)}" if m else "p"
        css = _para_css(props)
        if props.get("shading") and COLOR.match(str(props["shading"])):
            css += (";" if css else "") + f"background:{props['shading']}"
        cls = " ".join(["s-" + re.sub(r"[^A-Za-z0-9]", "", style)] if style != "Normal" else [])
        attrs = (f" class=\"{cls}\"" if cls else "") + (f" style=\"{css}\"" if css else "")
        inner = self.inline(b.get("content") or []) or "<br>"
        return f"<{tag}{attrs}>{inner}</{tag}>"

    def blocks(self, blocks: list) -> str:
        out = []
        stack: list[tuple[str, int]] = []
        for b in blocks or []:
            if not isinstance(b, dict):
                continue
            lst = b.get("list") if b.get("type") == "paragraph" else None
            if lst:
                kind = "ol" if lst.get("kind") == "number" else "ul"
                level = max(0, min(8, int(lst.get("level") or 0)))
                while stack and (stack[-1][1] > level or (stack[-1][1] == level and stack[-1][0] != kind)):
                    out.append(f"</li></{stack.pop()[0]}>")
                if stack and stack[-1][1] == level:
                    out.append("</li>")
                while not stack or stack[-1][1] < level:
                    nxt = (stack[-1][1] + 1) if stack else 0
                    out.append(f"<{kind}{' class=\"check\"' if lst.get('kind') == 'check' else ''}>")
                    stack.append((kind, nxt))
                    if nxt < level:
                        out.append("<li>")
                box = ""
                if lst.get("kind") == "check":
                    box = "&#9745; " if lst.get("checked") else "&#9744; "
                out.append(f"<li>{box}{self.inline(b.get('content') or [])}")
                continue
            while stack:
                out.append(f"</li></{stack.pop()[0]}>")
            out.append(self.block(b))
        while stack:
            out.append(f"</li></{stack.pop()[0]}>")
        return "\n".join(out)

    def block(self, b: dict) -> str:
        kind = b.get("type")
        if kind == "paragraph":
            return self.paragraph(b)
        if kind == "code":
            return f"<pre>{esc(b.get('text', ''))}</pre>"
        if kind in ("pageBreak", "columnBreak", "sectionBreak"):
            return "<hr>"
        if kind == "table":
            return self.table(b)
        if kind == "mermaid":
            svg = str(b.get("svg") or "")
            if svg.lstrip().startswith("<svg"):
                return f"<figure><img alt=\"{esc(b.get('alt', 'Diagram'))}\" src=\"data:image/svg+xml;base64,{base64.b64encode(svg.encode('utf-8')).decode('ascii')}\"></figure>"
            return f"<pre>{esc(b.get('code', ''))}</pre>"
        if kind == "chart":
            return self.chart(b)
        if kind == "diagram":
            return "<figure class=\"note\">" + self.tree(b.get("items") or []) + "</figure>"
        if kind == "component":
            return f"<div class=\"component\">{self.blocks(b.get('content') or [])}</div>"
        return ""

    def tree(self, items: list) -> str:
        if not items:
            return ""
        return "<ul>" + "".join(f"<li>{esc(i.get('text', ''))}{self.tree(i.get('children') or [])}</li>" for i in items if isinstance(i, dict)) + "</ul>"

    def chart(self, b: dict) -> str:
        data = b.get("data") or {}
        cats = data.get("categories") or []
        head = "".join(f"<th>{esc(c)}</th>" for c in cats)
        rows = "".join(f"<tr><th>{esc(s.get('name', ''))}</th>" + "".join(f"<td>{esc('' if v is None else v)}</td>" for v in (s.get("values") or [])) + "</tr>" for s in data.get("series") or [] if isinstance(s, dict))
        cap = esc(b.get("title") or "Chart")
        return f"<figure class=\"note\"><figcaption>{cap}</figcaption><table><tr><th></th>{head}</tr>{rows}</table></figure>"

    def table(self, b: dict) -> str:
        rows = []
        for r in b.get("rows") or []:
            cells = []
            for c in (r.get("cells") or []) if isinstance(r, dict) else []:
                if not isinstance(c, dict):
                    continue
                tag = "th" if c.get("header") else "td"
                attrs = ""
                if isinstance(c.get("colspan"), int) and c["colspan"] > 1:
                    attrs += f" colspan=\"{c['colspan']}\""
                if isinstance(c.get("rowspan"), int) and c["rowspan"] > 1:
                    attrs += f" rowspan=\"{c['rowspan']}\""
                css = []
                if COLOR.match(str(c.get("shading", ""))):
                    css.append(f"background:{c['shading']}")
                if c.get("valign") in ("middle", "bottom"):
                    css.append(f"vertical-align:{c['valign']}")
                if css:
                    attrs += f" style=\"{';'.join(css)}\""
                cells.append(f"<{tag}{attrs}>{self.blocks(c.get('body') or [])}</{tag}>")
            rows.append("<tr>" + "".join(cells) + "</tr>")
        return "<table class=\"grid\">" + "".join(rows) + "</table>"

    def css(self) -> str:
        out = []
        normal = _run_css({k: v for k, v in self.resolve("Normal")[0].items() if k != "color"})
        if normal:
            out.append(f"main{{{normal}}}")
        for sid in sorted(self.used):
            if sid == "Normal":
                continue
            run, para = self.resolve(sid)
            if COLOR.match(str(run.get("color", ""))) and sum(int(run["color"][i:i + 2], 16) for i in (1, 3, 5)) < 150:
                run = {k: v for k, v in run.items() if k != "color"}
            body = ";".join(x for x in (_run_css(run), _para_css(para)) if x)
            if body:
                out.append(f".s-{re.sub(r'[^A-Za-z0-9]', '', sid)}{{{body}}}")
        return "\n".join(out)


BASE_CSS = """
:root{color-scheme:light dark}
body{margin:0;background:#f3f2ee;color:#1c1b19;font:12pt/1.55 Georgia,'Times New Roman',serif}
main{max-width:46rem;margin:2rem auto;padding:3rem 3.25rem;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.12)}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.2em 0 .4em}
p{margin:0 0 .7em}img{max-width:100%;height:auto}
table{border-collapse:collapse;margin:.6em 0;max-width:100%}
table.grid td,table.grid th,figure.note td,figure.note th{border:1px solid #bdbab2;padding:.3em .55em;vertical-align:top;text-align:left}
td>p:last-child,th>p:last-child{margin-bottom:0}
pre{background:#f1efe9;padding:.7em .9em;overflow:auto;font:10pt/1.4 ui-monospace,Menlo,Consolas,monospace}
figure{margin:1em 0}figcaption{font-weight:700;margin-bottom:.3em}
.chip{background:#ece9e1;border-radius:1em;padding:0 .55em}
.component{border-left:3px solid #d9d5c9;padding-left:.8em;margin:.8em 0}
ul.check{list-style:none;padding-left:1.2em}
hr{border:0;border-top:1px dashed #bdbab2;margin:1.4em 0}
.tabtitle{font:700 .8rem/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#7a766b;margin:2.4rem 0 0}
@media (max-width:640px){main{margin:0;padding:1.25rem}}
@media (prefers-color-scheme:dark){body{background:#151513;color:#e8e6df}main{background:#1d1c1a;box-shadow:none}pre,.chip{background:#2a2926}table.grid td,table.grid th,figure.note td,figure.note th{border-color:#46443e}}
@media print{body{background:#fff}main{box-shadow:none;margin:0;max-width:none}}
"""


def page(doc: dict, media: dict[str, bytes]) -> str:
    r = Renderer(doc, media)
    tabs = doc.get("tabs") or []
    parts = []
    for i, tab in enumerate(tabs):
        if len(tabs) > 1:
            parts.append(f"<p class=\"tabtitle\">{esc(tab.get('title', ''))}</p>")
        parts.append(r.blocks(tab.get("body") or []))
    title = esc(doc.get("title") or "Document")
    lang = esc((doc.get("meta") or {}).get("language") or "en")
    return (
        f"<!doctype html>\n<html lang=\"{lang}\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        f"<meta name=\"referrer\" content=\"no-referrer\"><title>{title}</title><style>{BASE_CSS}\n{r.css()}</style></head><body><main>\n"
        + "\n".join(parts) + "\n</main></body></html>\n"
    )
