import json
import os
import socket
import subprocess
import sys
import time
import urllib.request

import pytest

from conftest import BACKEND

pytestmark = pytest.mark.skipif(os.name != "posix", reason="the stand-in programs are POSIX ones")

FROZEN = "import sys\nsys.frozen = True\nsys.executable = {engine!r}\nsys.argv = ['formtxt-engine']\nimport formtxt_engine as e\nsys.exit(e.main())\n"


def stand_in():
    return subprocess.Popen(["sleep", "120"])


def stop(*procs):
    for proc in procs:
        if proc.poll() is None:
            proc.kill()
        proc.wait(timeout=10)


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def engine_env(data, **more):
    env = {k: v for k, v in os.environ.items() if not k.startswith("FORMTXT_")}
    env.update(FORMTXT_DATA_DIR=str(data), PYTHONUNBUFFERED="1", **more)
    return env


def wait_for(check, seconds=20.0):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        if check():
            return True
        time.sleep(0.1)
    return False


def answers(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as reply:
            return reply.status == 200
    except OSError:
        return False


def record(startup, engine, shell):
    return {"pid": engine.pid, "started": int(time.time()), "born": startup.created(engine.pid), "shell": shell.pid, "shellBorn": startup.created(shell.pid)}


def test_a_holder_whose_shell_is_alive_is_respected(tmp_path):
    from app.core import startup

    engine, shell, mine = stand_in(), stand_in(), stand_in()
    try:
        (tmp_path / startup.LOCK_NAME).write_text(json.dumps(record(startup, engine, shell)))
        with pytest.raises(startup.Busy) as refused:
            startup.claim(tmp_path, mine.pid)
        assert f"is already running on {tmp_path} (engine process {engine.pid})" in str(refused.value)
        assert engine.poll() is None
    finally:
        stop(engine, shell, mine)


def test_a_holder_whose_shell_is_gone_is_ended_and_replaced(tmp_path):
    from app.core import startup

    engine, shell, mine = stand_in(), stand_in(), stand_in()
    try:
        (tmp_path / startup.LOCK_NAME).write_text(json.dumps(record(startup, engine, shell)))
        stop(shell)
        path, replaced = startup.claim(tmp_path, mine.pid)
        assert replaced == engine.pid
        assert engine.wait(timeout=10) is not None
        now = json.loads(path.read_text())
        assert now["pid"] == os.getpid() and now["shell"] == mine.pid and now["born"] > 0 and now["shellBorn"] > 0
    finally:
        stop(engine, shell, mine)


def test_a_holder_that_has_ended_and_was_not_collected_counts_as_gone_where_there_is_no_proc(tmp_path, monkeypatch):
    from app.core import startup

    engine, shell, mine = stand_in(), stand_in(), stand_in()
    try:
        held = record(startup, engine, shell)
        stop(shell)
        assert startup.finished(engine.pid) is False
        monkeypatch.setattr(startup, "PROC", str(tmp_path / "no-proc"))
        assert startup.finished(engine.pid) is False
        (tmp_path / startup.LOCK_NAME).write_text(json.dumps(held))
        path, replaced = startup.claim(tmp_path, mine.pid)
        assert replaced == engine.pid
        assert startup.finished(engine.pid) is True
        assert json.loads(path.read_text())["pid"] == os.getpid()
    finally:
        stop(engine, shell, mine)


def test_a_holder_that_recorded_no_shell_is_replaced_only_by_an_engine_with_a_shell(tmp_path):
    from app.core import startup

    engine, mine = stand_in(), stand_in()
    try:
        (tmp_path / startup.LOCK_NAME).write_text(json.dumps({"pid": engine.pid, "started": int(time.time())}))
        with pytest.raises(startup.Busy):
            startup.claim(tmp_path, 0)
        assert engine.poll() is None
        assert startup.claim(tmp_path, mine.pid)[1] == engine.pid
        assert engine.wait(timeout=10) is not None
    finally:
        stop(engine, mine)


@pytest.mark.parametrize("text", ["not json at all", "[1, 2]", '{"pid": "x"}', ""])
def test_a_damaged_lock_is_replaced(tmp_path, text):
    from app.core import startup

    (tmp_path / startup.LOCK_NAME).write_text(text)
    path, replaced = startup.claim(tmp_path, 0)
    assert replaced == 0
    assert json.loads(path.read_text())["pid"] == os.getpid()


def test_a_lock_that_names_a_process_which_is_not_the_engine_is_replaced_and_the_process_is_left_alone(tmp_path):
    from app.core import startup

    other, mine = stand_in(), stand_in()
    try:
        for held in ({"pid": other.pid, "started": int(time.time()) - 86400}, {"pid": other.pid, "started": 5, "born": 12345.5, "shell": 999999, "shellBorn": 5.0}):
            (tmp_path / startup.LOCK_NAME).write_text(json.dumps(held))
            assert startup.claim(tmp_path, mine.pid)[1] == 0
            assert other.poll() is None
        (tmp_path / startup.LOCK_NAME).write_text(json.dumps({"pid": other.pid}))
        with pytest.raises(startup.Busy):
            startup.claim(tmp_path, mine.pid)
        assert other.poll() is None
    finally:
        stop(other, mine)


def test_the_two_ways_of_reading_a_start_time_agree(monkeypatch):
    from app.core import startup

    first = startup.created(os.getpid())
    monkeypatch.setattr(startup, "PROC", "/nonexistent")
    second = startup.created(os.getpid())
    assert first > 0 and abs(first - second) <= startup.SLACK
    assert startup.created(4_000_000) == 0.0


def test_the_engine_serves_and_logs_with_its_three_streams_closed(tmp_path):
    port = free_port()
    proc = subprocess.Popen(["sh", "-c", 'exec "$0" formtxt_engine.py <&- >&- 2>&-', sys.executable], cwd=BACKEND, env=engine_env(tmp_path, FORMTXT_PORT=str(port)))
    log = tmp_path / "Logs" / "formtxt-engine.log"
    try:
        assert wait_for(lambda: answers(port))
        lines = log.read_text().splitlines()
        assert lines[0].endswith(f"engine started, pid {proc.pid}, data folder {tmp_path}")
        assert sum(f"Uvicorn running on http://127.0.0.1:{port}" in line for line in lines) == 1
        assert (tmp_path / "Logs" / "formtxt-engine-errors.log").is_file()
        assert json.loads((tmp_path / "engine.lock").read_text())["pid"] == proc.pid
        proc.terminate()
        assert proc.wait(timeout=10) == 0
        assert not (tmp_path / "engine.lock").exists()
    finally:
        stop(proc)


@pytest.mark.parametrize("variable", ["FORMTXT_SHELL_PID", "FORMTXT_PARENT_PID"])
def test_the_engine_stops_when_the_shell_it_was_given_ends(tmp_path, variable):
    shell, port = stand_in(), free_port()
    proc = subprocess.Popen([sys.executable, "formtxt_engine.py"], cwd=BACKEND, env=engine_env(tmp_path, FORMTXT_PORT=str(port), **{variable: str(shell.pid)}), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        assert wait_for(lambda: answers(port))
        assert json.loads((tmp_path / "engine.lock").read_text())["shell"] == shell.pid
        stop(shell)
        assert proc.wait(timeout=10) == 0
        assert not (tmp_path / "engine.lock").exists()
    finally:
        stop(shell, proc)


def test_a_second_engine_is_refused_while_the_first_ones_shell_lives(tmp_path):
    shell, other, port = stand_in(), stand_in(), free_port()
    first = subprocess.Popen([sys.executable, "formtxt_engine.py"], cwd=BACKEND, env=engine_env(tmp_path, FORMTXT_PORT=str(port), FORMTXT_SHELL_PID=str(shell.pid)), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        assert wait_for(lambda: answers(port))
        second = subprocess.run([sys.executable, "formtxt_engine.py"], cwd=BACKEND, env=engine_env(tmp_path, FORMTXT_PORT=str(free_port()), FORMTXT_SHELL_PID=str(other.pid)), capture_output=True, text=True, timeout=30)
        assert second.returncode == 2
        assert f"formtxt is already running on {tmp_path} (engine process {first.pid})." in second.stderr
        assert "is already running on" in (tmp_path / "Logs" / "formtxt-engine.log").read_text()
        assert answers(port)
    finally:
        stop(shell, other, first)


def test_a_frozen_engine_started_alone_opens_the_app_beside_it_and_serves_nothing(tmp_path):
    install, data, mark = tmp_path / "install", tmp_path / "data", tmp_path / "opened"
    install.mkdir()
    data.mkdir()
    app = install / "formtxt"
    app.write_text(f'#!/bin/sh\nprintf "%s" "$(pwd)" > "{mark}"\n')
    app.chmod(0o755)
    code = FROZEN.format(engine=str(install / "formtxt-engine"))
    done = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=engine_env(data), capture_output=True, text=True, timeout=30)
    assert done.returncode == 0, done.stderr
    assert wait_for(mark.is_file, 10)
    assert mark.read_text() == str(install.resolve())
    assert not (data / "engine.lock").exists() and not (data / "engine.json").exists()
    assert "started without its app" in (data / "Logs" / "formtxt-engine.log").read_text()


def test_a_frozen_engine_started_alone_with_no_app_near_it_says_so_and_serves_nothing(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    code = FROZEN.format(engine=str(tmp_path / "engine" / "formtxt-engine"))
    done = subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=engine_env(data), capture_output=True, text=True, timeout=30)
    assert done.returncode == 4
    assert "serves nothing on its own" in done.stderr
    assert not (data / "engine.lock").exists()
