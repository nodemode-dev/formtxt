#!/usr/bin/env python3
"""The sparkle icon ban: exit 1 when the interface or the insertable sets draw a sparkle.

  python3 setup/icon_rules.py

The owner's rule for the whole family: no sparkle icon (a cluster of four-point stars, or a wand trailing them) under
any name, in any form (SVG, glyph, CSS content), in the interface or in what a document can insert. Claude Code,
agents and assistants use the `agent`, `agentChat` and `terminal` icons. Interface: tracked .ts, .py, .rs, .css, .html
and .svg files under frontend/src, frontend/public, frontend/index.html, backend/app and src-tauri/src, outside
frontend/src/data. Insertable: every Tabler icon in frontend/src/data/tabler-icons.json whose name or outline is a
sparkle, a four-point star or a cluster of stars, and every emoji named a sparkle, a magic wand or an eight-pointed star,
must be listed in frontend/src/data/retired-icons.json, which the picker, `insert.icon` and the emoji panel leave out
and the page draws as nothing. The symbol sets are interface code and fall under the first scan.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BANNED = re.compile("\\bsparkles?\\s*:\\s*([`'\"]?\\s*<svg|\\w+\\()|icon\\(\\s*['\"]sparkles?['\"]|"
                    "M12 1\\.5l1\\.5 4\\.5 4\\.5 1\\.5|M7\\.5 5\\.6L10 7 8\\.6 4\\.5|M12 3\\.5l1\\.9 4\\.6 4\\.6 1\\.9|"
                    "[\\u2726\\u2727\\u2728\\u2734\\u2747]|\\b0x(2726|2727|2728|2734|2747|1f496|1fa84)\\b", re.I)
PATH = re.compile(r"""\bd=\\?["']([^"'\\]+)""")
TOKEN = re.compile(r"[MmLlHhVvZzCcSsQqTtAa]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?")
ARGS = {"C": 6, "S": 4, "Q": 4, "T": 2, "A": 7}


def shapes(d: str) -> list[list[tuple[float, float]]]:
    tokens = TOKEN.findall(d)
    out: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    curved = False
    cmd = ""
    x = y = sx = sy = 0.0
    i = 0
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]
            i += 1
            if cmd in "Zz":
                if cur and not curved:
                    out.append(cur)
                cur, curved, x, y = [], False, sx, sy
                continue
        if not cmd or cmd in "Zz":
            i += 1
            continue
        up = cmd.upper()
        need = ARGS.get(up, 1 if up in "HV" else 2)
        if i + need > len(tokens) or any(t.isalpha() for t in tokens[i:i + need]):
            break
        v = [float(t) for t in tokens[i:i + need]]
        i += need
        rel = cmd.islower()
        if up == "M":
            x, y = (x + v[0], y + v[1]) if rel else (v[0], v[1])
            sx, sy, cur, curved = x, y, [(x, y)], False
            cmd = "l" if rel else "L"
            continue
        if up == "H":
            x = x + v[0] if rel else v[0]
        elif up == "V":
            y = y + v[0] if rel else v[0]
        else:
            x, y = (x + v[-2], y + v[-1]) if rel else (v[-2], v[-1])
            curved = curved or up != "L"
        cur.append((x, y))
    return out


def four_point_star(p: list[tuple[float, float]]) -> bool:
    if len(p) > 1 and math.dist(p[0], p[-1]) < 1e-6:
        p = p[:-1]
    if len(p) != 8:
        return False
    cx = sum(a for a, _ in p) / 8
    cy = sum(b for _, b in p) / 8
    r = [math.hypot(a - cx, b - cy) for a, b in p]
    tips, waists = (r[0::2], r[1::2]) if r[0] > r[1] else (r[1::2], r[0::2])
    return max(waists) < 0.7 * min(tips)


def arc_points(x1: float, y1: float, v: list[float], n: int) -> list[tuple[float, float]]:
    rx, ry, phi, fa, fs, x2, y2 = abs(v[0]), abs(v[1]), math.radians(v[2]), int(v[3]), int(v[4]), v[5], v[6]
    if not rx or not ry:
        return [(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(1, n + 1)]
    c, s = math.cos(phi), math.sin(phi)
    xp, yp = c * (x1 - x2) / 2 + s * (y1 - y2) / 2, -s * (x1 - x2) / 2 + c * (y1 - y2) / 2
    grow = math.sqrt(max(1.0, xp * xp / (rx * rx) + yp * yp / (ry * ry)))
    rx, ry = rx * grow, ry * grow
    den = rx * rx * yp * yp + ry * ry * xp * xp
    co = math.sqrt(max(0.0, (rx * rx * ry * ry - den) / den)) if den else 0.0
    co = -co if fa == fs else co
    cxp, cyp = co * rx * yp / ry, -co * ry * xp / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2
    a1 = math.atan2((yp - cyp) / ry, (xp - cxp) / rx)
    da = math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx) - a1
    da += 2 * math.pi if fs and da < 0 else -2 * math.pi if not fs and da > 0 else 0
    return [(cx + rx * math.cos(a1 + da * k / n) * c - ry * math.sin(a1 + da * k / n) * s,
             cy + rx * math.cos(a1 + da * k / n) * s + ry * math.sin(a1 + da * k / n) * c) for k in range(1, n + 1)]


def outlines(d: str, n: int = 12) -> list[list[tuple[float, float]]]:
    tokens = TOKEN.findall(d)
    out: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    cmd = ""
    x = y = sx = sy = 0.0
    ctrl: tuple[float, float] | None = None
    i = 0
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]
            i += 1
            if cmd in "Zz":
                out.append(cur + [(sx, sy)])
                cur, x, y, ctrl = [], sx, sy, None
                continue
        if not cmd or cmd in "Zz":
            i += 1
            continue
        up = cmd.upper()
        need = ARGS.get(up, 1 if up in "HV" else 2)
        if i + need > len(tokens) or any(t.isalpha() for t in tokens[i:i + need]):
            break
        v = [float(t) for t in tokens[i:i + need]]
        i += need
        ox, oy = (x, y) if cmd.islower() else (0.0, 0.0)
        if up == "M":
            out.append(cur)
            x, y = ox + v[0], oy + v[1]
            sx, sy, cur, ctrl = x, y, [(x, y)], None
            cmd = "l" if cmd.islower() else "L"
            continue
        if up in "CS":
            c1 = (ox + v[0], oy + v[1]) if up == "C" else (2 * x - ctrl[0], 2 * y - ctrl[1]) if ctrl else (x, y)
            c2, end = ((ox + v[2], oy + v[3]), (ox + v[4], oy + v[5])) if up == "C" else ((ox + v[0], oy + v[1]), (ox + v[2], oy + v[3]))
            pts = [((1 - t) ** 3 * x + 3 * (1 - t) ** 2 * t * c1[0] + 3 * (1 - t) * t * t * c2[0] + t ** 3 * end[0],
                    (1 - t) ** 3 * y + 3 * (1 - t) ** 2 * t * c1[1] + 3 * (1 - t) * t * t * c2[1] + t ** 3 * end[1]) for t in (k / n for k in range(1, n + 1))]
            ctrl = c2
        elif up == "Q":
            c1, end = (ox + v[0], oy + v[1]), (ox + v[2], oy + v[3])
            pts = [((1 - t) ** 2 * x + 2 * (1 - t) * t * c1[0] + t * t * end[0], (1 - t) ** 2 * y + 2 * (1 - t) * t * c1[1] + t * t * end[1]) for t in (k / n for k in range(1, n + 1))]
            ctrl = None
        else:
            end = (ox + v[5], oy + v[6]) if up == "A" else (x + v[0] if cmd == "h" else v[0], y) if up == "H" else (x, y + v[0] if cmd == "v" else v[0]) if up == "V" else (ox + v[0], oy + v[1])
            pts = arc_points(x, y, v[:5] + list(end), n) if up == "A" else [(x + (end[0] - x) * k / n, y + (end[1] - y) * k / n) for k in range(1, n + 1)]
            ctrl = None
        cur.extend(pts)
        x, y = end
    out.append(cur)
    return [p for p in out if len(p) > 3 and math.dist(p[0], p[-1]) < 0.05]


def hull_area(p: list[tuple[float, float]]) -> float:
    pts = sorted(set(p))
    half: list[list[tuple[float, float]]] = [[], []]
    for side, seq in enumerate((pts, pts[::-1])):
        for q in seq:
            while len(half[side]) >= 2 and (half[side][-1][0] - half[side][-2][0]) * (q[1] - half[side][-2][1]) - (half[side][-1][1] - half[side][-2][1]) * (q[0] - half[side][-2][0]) <= 0:
                half[side].pop()
            half[side].append(q)
    return poly_area(half[0][:-1] + half[1][:-1])


def poly_area(p: list[tuple[float, float]]) -> float:
    return abs(sum(p[i][0] * p[i - 1][1] - p[i - 1][0] * p[i][1] for i in range(len(p)))) / 2


def star_tips(p: list[tuple[float, float]], fat: float) -> list[tuple[float, float]]:
    ha = hull_area(p)
    if ha < 0.5 or poly_area(p) / ha > fat:
        return []
    cx, cy = sum(a for a, _ in p) / len(p), sum(b for _, b in p) / len(p)
    r = [math.hypot(a - cx, b - cy) for a, b in p]
    if min(r) > 0.6 * max(r):
        return []
    high = [v > 0.85 * max(r) for v in r]
    tips = []
    for k in (k for k in range(len(p)) if high[k] and not high[k - 1]):
        run = [j % len(p) for j in range(k, k + len(p)) if all(high[m % len(p)] for m in range(k, j + 1))]
        tips.append(p[max(run, key=lambda j: r[j])])
    return tips


def sparkle_outline(d: str) -> bool:
    stars = 0
    for p in outlines(d):
        tips = star_tips(p, 0.8)
        if len(tips) == 4:
            mid = math.dist(((tips[0][0] + tips[2][0]) / 2, (tips[0][1] + tips[2][1]) / 2), ((tips[1][0] + tips[3][0]) / 2, (tips[1][1] + tips[3][1]) / 2))
            if hull_area(p) < 1.15 * poly_area(tips) and mid < 0.05 * math.dist(tips[0], tips[2]):
                return True
        stars += 5 <= len(star_tips(p, 0.78)) <= 8
    return stars >= 2


def fnv(s: str) -> str:
    h = 0x811C9DC5
    for ch in s:
        h = ((h ^ ord(ch)) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


SPARKLE_NAME = re.compile(r"(^|-)(sparkles?|spark|stars|wand|flare)(-|$)")
SPARKLE_EMOJI = re.compile(r"\bspark(le|les|ling)\b|\bmagic wand\b|\beight-pointed star\b", re.I)


def insertable_problems() -> list[str]:
    retired = json.loads((ROOT / "frontend/src/data/retired-icons.json").read_text(encoding="utf-8"))
    gone = {h for hs in retired["tabler"].values() for h in hs}
    found = []
    for name, _cat, _tags, o, _f in json.loads((ROOT / "frontend/src/data/tabler-icons.json").read_text(encoding="utf-8"))["icons"]:
        if fnv(o) not in gone and (SPARKLE_NAME.search(name) or sparkle_outline(o)):
            found.append(f"frontend/src/data/tabler-icons.json: {name}: a sparkle in the insertable icons; retire it in frontend/src/data/retired-icons.json")
    emoji = ROOT / "frontend/node_modules/emojibase-data/en/compact.json"
    for e in json.loads(emoji.read_text(encoding="utf-8")) if emoji.exists() else []:
        key = "-".join(f"{ord(ch):x}" for ch in e["unicode"] if ch != "️")
        if SPARKLE_EMOJI.search(e["label"]) and key not in retired["emoji"]:
            found.append(f"emojibase-data: {e['label']}: a sparkle in the insertable emoji; retire {key} in frontend/src/data/retired-icons.json")
    return found


def problems() -> list[str]:
    found = []
    files = subprocess.run(["git", "ls-files", "frontend/src", "frontend/public", "frontend/index.html", "backend/app", "src-tauri/src"],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    for rel in files:
        if not rel.endswith((".ts", ".py", ".rs", ".css", ".html", ".svg")) or rel.startswith("frontend/src/data/") or "/i18n/" in rel:
            continue
        for n, line in enumerate((ROOT / rel).read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if BANNED.search(line) or any(four_point_star(s) for d in PATH.findall(line) for s in shapes(d)):
                found.append(f"{rel}:{n}: the sparkle icon is banned app-wide (the owner's rule)")
    return found + insertable_problems()


if __name__ == "__main__":
    bad = problems()
    print("\n".join(bad) or "no sparkle icon")
    sys.exit(1 if bad else 0)
