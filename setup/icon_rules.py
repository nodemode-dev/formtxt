#!/usr/bin/env python3
"""The sparkle icon ban: exit 1 when any interface code draws a sparkle.

  python3 setup/icon_rules.py

The owner's rule for the whole family: no sparkle icon (a cluster of four-point stars, or a wand trailing them) under
any name, in any form (SVG, glyph, CSS content). Claude Code, agents and assistants use the `agent`, `agentChat` and
`terminal` icons. Scanned: tracked .ts, .py, .rs, .css, .html and .svg files under frontend/src, frontend/public,
frontend/index.html, backend/app and src-tauri/src. Not scanned: frontend/src/data (the insertable Tabler library is
document content, not interface).
"""

from __future__ import annotations

import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BANNED = re.compile("\\bsparkles?\\s*:\\s*([`'\"]?\\s*<svg|\\w+\\()|icon\\(\\s*['\"]sparkles?['\"]|"
                    "M12 1\\.5l1\\.5 4\\.5 4\\.5 1\\.5|M7\\.5 5\\.6L10 7 8\\.6 4\\.5|M12 3\\.5l1\\.9 4\\.6 4\\.6 1\\.9|"
                    "[\\u2726\\u2727\\u2728\\u2734\\u2747]")
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
    return found


if __name__ == "__main__":
    bad = problems()
    print("\n".join(bad) or "no sparkle icon")
    sys.exit(1 if bad else 0)
