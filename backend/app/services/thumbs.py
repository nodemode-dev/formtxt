from html import escape

from app.services import model

W, H = 612.0, 792.0
GREY = "#c9c6bf"
DARK = "#4a4740"


def _resolve(doc: dict, sid: str) -> tuple[dict, dict]:
    run: dict = {}
    para: dict = {}
    chain = []
    seen = set()
    while sid and sid in doc.get("styles", {}) and sid not in seen:
        seen.add(sid)
        chain.append(doc["styles"][sid])
        sid = doc["styles"][sid].get("basedOn")
    for style in reversed(chain):
        run.update(style.get("run") or {})
        para.update(style.get("para") or {})
    return run, para


def _text(block: dict) -> str:
    return "".join(str(r.get("text", "")) for r in block.get("content") or [] if isinstance(r, dict))


def render(doc: dict) -> str:
    section = doc["sections"][0]
    page = section["page"]
    scale = min(W / float(page["width"]), H / float(page["height"]))
    m = section["margins"]
    left, right, top = m["left"] * scale, W - m["right"] * scale, m["top"] * scale
    bottom = H - m["bottom"] * scale
    tpl = (doc.get("settings") or {}).get("template") or {}
    layout, accent = tpl.get("layout", "classic"), tpl.get("accent", "#f97316")
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:g} {H:g}" width="{W:g}" height="{H:g}">',
           f'<rect width="{W:g}" height="{H:g}" fill="#ffffff"/>']
    y = top
    if layout == "banded":
        out.append(f'<rect width="{W:g}" height="{top + 70:g}" fill="{escape(accent)}" opacity="0.14"/>')
        out.append(f'<rect width="{W:g}" height="8" fill="{escape(accent)}"/>')
    elif layout == "newsletter":
        out.append(f'<rect x="{left:g}" y="{top - 18:g}" width="{right - left:g}" height="4" fill="{escape(accent)}"/>')
    elif layout == "letterhead":
        out.append(f'<rect x="{left:g}" y="{top - 22:g}" width="{right - left:g}" height="2" fill="{escape(accent)}"/>')
    for block in (doc.get("tabs") or [{}])[0].get("body", []):
        if y > bottom:
            break
        if block.get("type") == "chart":
            cw = min(right - left, float(block.get("width") or 468) * scale)
            ch = float(block.get("height") or 252) * scale * (cw / max(float(block.get("width") or 468) * scale, 0.01))
            cx = left + (right - left - cw) / 2
            series = ((block.get("data") or {}).get("series") or [{}])[0].get("values") or []
            nums = [float(v) for v in series if isinstance(v, (int, float))][:12] or [3, 5, 4, 6]
            top = max(nums) or 1
            bw = cw / (len(nums) * 1.6)
            for i, v in enumerate(nums):
                bh = max(0.0, v) / top * ch * 0.85
                out.append(f'<rect x="{cx + bw * 0.3 + i * bw * 1.6:.1f}" y="{y + ch - bh:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="{escape(accent)}" opacity="0.7"/>')
            out.append(f'<line x1="{cx:.1f}" y1="{y + ch:.1f}" x2="{cx + cw:.1f}" y2="{y + ch:.1f}" stroke="#b9b6ae" stroke-width="0.8"/>')
            y += ch + 10 * scale
            continue
        if block.get("type") == "table":
            rows = block.get("rows") or []
            cols = max((len((r or {}).get("cells") or []) for r in rows), default=1) or 1
            row_h = 11.0 * scale * 1.9
            shown = rows[: max(1, int((bottom - y) / row_h))]
            cell_w = (right - left) / cols
            for i, row in enumerate(shown):
                header = any((c or {}).get("header") for c in (row or {}).get("cells") or [])
                if header:
                    out.append(f'<rect x="{left:.1f}" y="{y:.1f}" width="{right - left:.1f}" height="{row_h:.1f}" fill="#eceae4"/>')
                for c, cell in enumerate((row or {}).get("cells") or []):
                    text = "".join(str(r.get("text", "")) for r in model.iter_runs((cell or {}).get("body") or []) if r.get("type") == "text")
                    if text:
                        frac = min(0.85, 0.2 + len(text) / 40)
                        out.append(f'<rect x="{left + c * cell_w + 4:.1f}" y="{y + row_h * 0.3:.1f}" width="{(cell_w - 8) * frac:.1f}" height="{row_h * 0.38:.1f}" rx="1" fill="{DARK if header else GREY}"/>')
                out.append(f'<line x1="{left:.1f}" y1="{y:.1f}" x2="{right:.1f}" y2="{y:.1f}" stroke="#b9b6ae" stroke-width="0.8"/>')
                y += row_h
            out.append(f'<line x1="{left:.1f}" y1="{y:.1f}" x2="{right:.1f}" y2="{y:.1f}" stroke="#b9b6ae" stroke-width="0.8"/>')
            y += 8 * scale
            continue
        run, para = _resolve(doc, block.get("style") or "Normal")
        for pic in (r for r in block.get("content") or [] if isinstance(r, dict) and r.get("type") == "image" and r.get("wrap", "inline") not in ("behind", "front")):
            pw = min(right - left, float(pic.get("width") or 72) * scale)
            ph = float(pic.get("height") or 72) * scale * (pw / max(float(pic.get("width") or 72) * scale, 0.01))
            px = left if pic.get("side") != "right" else right - pw
            if para.get("align") == "center" or pic.get("wrap") == "topBottom":
                px = left + (right - left - pw) / 2
            out.append(f'<rect x="{px:.1f}" y="{y:.1f}" width="{pw:.1f}" height="{ph:.1f}" rx="2" fill="#dcd9d2"/>')
            y += ph + 4 * scale
        size = float(run.get("size", 11.0)) * scale
        text = _text(block)
        y += float(para.get("spaceBefore", 0.0)) * scale
        sid = block.get("style") or "Normal"
        heading = sid.startswith("Heading") or sid in ("Title", "Subtitle")
        color = escape(str(run.get("color") or DARK)) if heading else GREY
        if sid == "Quote":
            color = GREY
            out.append(f'<rect x="{left:g}" y="{y:g}" width="3" height="{size * 1.3:g}" fill="{escape(accent)}"/>')
        indent = float(para.get("indentLeft", 0.0)) * scale
        x0 = left + indent
        width = right - x0 - float(para.get("indentRight", 0.0)) * scale
        if layout == "sidebar" and sid.startswith("Heading"):
            out.append(f'<rect x="{left - 14:g}" y="{y:g}" width="4" height="{size:g}" fill="{escape(accent)}"/>')
        per_line = max(8, int(width / max(size * 0.5, 1)))
        lines = max(1, -(-max(len(text), 1) // per_line)) if text else 1
        line_h = size * float(para.get("lineSpacing", 1.15)) * 1.2
        for i in range(lines):
            if y > bottom:
                break
            remaining = len(text) - i * per_line
            frac = 1.0 if remaining >= per_line else max(0.15, remaining / per_line)
            if not text:
                frac = 0.0
            bar_w = width * frac * (0.92 if not heading else 0.85)
            x = x0
            if para.get("align") == "center":
                x = x0 + (width - bar_w) / 2
            elif para.get("align") == "right":
                x = x0 + width - bar_w
            if bar_w > 0:
                out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{max(size * 0.62, 1.5):.1f}" rx="1" fill="{color}"/>')
            y += line_h
        y += float(para.get("spaceAfter", 8.0)) * scale
    out.append("</svg>")
    return "".join(out)
