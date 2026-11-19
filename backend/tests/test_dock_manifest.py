import hashlib
import json
import re
import shutil
import subprocess
import sys

import pytest

from conftest import REPO

DOCK = REPO / "frontend" / "src" / "dock"


def test_the_shared_dock_matches_its_manifest():
    kept = json.loads((DOCK / "MANIFEST.json").read_text(encoding="utf-8"))
    now = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in DOCK.iterdir() if p.is_file() and p.name != "MANIFEST.json"}
    assert kept["module"] == "dock" and kept["files"] == now


def test_the_check_names_a_file_changed_inside_the_shared_dock(tmp_path):
    copy = tmp_path / "repo"
    (copy / "frontend" / "src").mkdir(parents=True)
    shutil.copytree(REPO / "setup", copy / "setup")
    shutil.copytree(DOCK, copy / "frontend" / "src" / "dock")
    for rel in (".claude", ".agents", "agents", ".mcp.json", ".cursor", ".codex", ".claude-plugin"):
        src = REPO / rel
        if src.is_dir():
            shutil.copytree(src, copy / rel)
        elif src.is_file():
            shutil.copy2(src, copy / rel)
    (copy / "backend" / "app" / "routers").mkdir(parents=True)
    shutil.copy2(REPO / "backend" / "app" / "routers" / "mcp.py", copy / "backend" / "app" / "routers" / "mcp.py")
    shutil.copy2(REPO / "formtxt", copy / "formtxt")
    clean = subprocess.run([sys.executable, "-B", "setup/agents.py", "check"], cwd=copy, capture_output=True, text=True)
    assert "frontend/src/dock" not in clean.stderr
    with open(copy / "frontend" / "src" / "dock" / "dock.css", "a", encoding="utf-8") as f:
        f.write(".x {}\n")
    done = subprocess.run([sys.executable, "-B", "setup/agents.py", "sync", "--check"], cwd=copy, capture_output=True, text=True)
    assert done.returncode == 1
    assert "frontend/src/dock/dock.css: does not match MANIFEST.json" in done.stderr


def test_the_shared_dock_imports_only_itself_and_xterm():
    found = set()
    for path in DOCK.glob("*.ts"):
        found |= set(re.findall(r"(?:from|import) '([^']+)'", path.read_text(encoding="utf-8")))
    assert {f for f in found if not f.startswith("./") and not f.startswith("@xterm/")} == set()


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node to load the module's state.ts")
def test_the_old_dock_key_is_moved_once_and_sizes_stay_apart():
    script = """
const m = await import(process.argv[1]);
const s = new Map([['formtxt.terminal', JSON.stringify({ open: true, h: 300 })]]);
const store = { getItem: (k) => (s.has(k) ? s.get(k) : null), setItem: (k, v) => s.set(k, v), removeItem: (k) => s.delete(k) };
const d = { h: 280, w: 440 };
const first = m.moveLegacy(store, 'formtxt.dock', ['formtxt.terminal'], d);
const second = m.moveLegacy(store, 'formtxt.dock', ['formtxt.terminal'], d);
const right = m.readState({ getItem: () => JSON.stringify({ open: true, side: 'right', h: 300, w: 520 }) }, 'formtxt.dock', [], d);
console.log(JSON.stringify({ first, second, keys: [...s.keys()], moved: JSON.parse(s.get('formtxt.dock')), right }));
"""
    done = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script, (DOCK / "state.ts").as_uri()],
                          capture_output=True, text=True, timeout=60)
    if done.returncode != 0 and "strip-types" in done.stderr:
        pytest.skip("this node cannot load TypeScript")
    assert done.returncode == 0, done.stderr
    out = json.loads(done.stdout)
    assert out["first"] is True and out["second"] is False
    assert out["keys"] == ["formtxt.dock"]
    assert out["moved"] == {"open": True, "side": "bottom", "h": 300, "w": 440, "tab": ""}
    assert out["right"] == {"open": True, "side": "right", "h": 300, "w": 520, "tab": ""}
