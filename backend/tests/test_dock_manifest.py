import hashlib
import importlib.util
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
const old = m.jsonLegacy(['formtxt.terminal'], true);
const first = m.moveLegacy(store, 'formtxt.dock', old, d);
const second = m.moveLegacy(store, 'formtxt.dock', old, d);
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
    assert out["moved"] == {"open": True, "side": "bottom", "h": 300, "w": 440, "tab": "", "seen": True}
    assert out["right"] == {"open": True, "side": "right", "h": 300, "w": 520, "tab": ""}


LOOKUP = "backend/app/services/agent_lookup.py"


def _agents(root):
    spec = importlib.util.spec_from_file_location("checked_agents", root / "setup" / "agents.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_shared_finder_matches_the_hash_recorded_for_its_version():
    module = _agents(REPO)
    version = re.search(r'^VERSION = "([^"]+)"$', (REPO / LOOKUP).read_text(encoding="utf-8"), re.M).group(1)
    assert module.LOOKUP_HASHES[version] == hashlib.sha256((REPO / LOOKUP).read_bytes()).hexdigest()
    assert module.lookup_problems() == []


def test_the_check_names_the_shared_finder_edited_in_place_or_missing(tmp_path):
    copy = tmp_path / "repo"
    (copy / "backend" / "app" / "services").mkdir(parents=True)
    shutil.copytree(REPO / "setup", copy / "setup", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(REPO / LOOKUP, copy / LOOKUP)
    module = _agents(copy)
    assert module.lookup_problems() == []
    with open(copy / LOOKUP, "a", encoding="utf-8") as f:
        f.write("\n")
    version = re.search(r'^VERSION = "([^"]+)"$', (REPO / LOOKUP).read_text(encoding="utf-8"), re.M).group(1)
    changed = f"{LOOKUP}: does not match the hash recorded for version {version} (the shared finder changes only as a whole new version)"
    assert module.lookup_problems() == [changed]
    for action in (["check"], ["sync", "--check"]):
        done = subprocess.run([sys.executable, "-B", "setup/agents.py", *action], cwd=copy, capture_output=True, text=True)
        assert done.returncode == 1 and changed in done.stderr
    (copy / LOOKUP).unlink()
    assert module.lookup_problems() == [f"{LOOKUP}: missing (the shared finder for the agent programs)"]


def test_the_shared_finder_imports_nothing_from_the_app():
    imports = set(re.findall(r"^\s*(?:from|import)\s+([\w.]+)", (REPO / LOOKUP).read_text(encoding="utf-8"), re.M))
    assert imports == {"__future__", "dataclasses", "os", "pathlib", "re", "shutil", "signal", "subprocess", "sys", "threading", "time", "winreg"}
