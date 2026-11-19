import json
import subprocess
import sys

from conftest import REPO

from app.routers import mcp


def test_committed_agent_manifest_is_current():
    done = subprocess.run([sys.executable, "-B", "setup/agents.py", "sync", "--check"], cwd=REPO, capture_output=True, text=True)
    assert done.returncode == 0, done.stderr


def test_manifest_lists_what_the_server_lists():
    manifest = json.loads((REPO / "agents" / "manifest.json").read_text(encoding="utf-8"))
    listed = [t["name"] for t in mcp.TOOLS]
    assert manifest["mcp"]["tools"] == listed
    assert manifest["mcp"]["read_only"] == [t["name"] for t in mcp.TOOLS if t.get("annotations", {}).get("readOnlyHint") is True]
    assert manifest["mcp"]["approval_gated"] == ["run_command"]
