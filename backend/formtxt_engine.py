import json
import os
import sys

if sys.stdin is None:
    sys.stdin = open(os.devnull, encoding="utf-8")
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")


def resource_dir() -> str:
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def selfcheck() -> int:
    info = {"python": sys.version.split()[0]}
    for name in ("fastapi", "uvicorn", "docx", "lxml", "reportlab", "pypdf", "PIL"):
        try:
            module = __import__(name)
            info[name.lower()] = getattr(module, "__version__", "ok")
        except Exception as exc:
            info[name.lower()] = f"missing: {exc}"
    from app import __version__

    info["formtxt"] = __version__
    info["dist_bundled"] = os.path.isdir(os.path.join(resource_dir(), "frontend_dist"))
    try:
        import app.main  # noqa: F401

        info["app"] = "ok"
    except Exception as exc:
        info["app"] = f"failed: {exc!r}"
        print(json.dumps(info))
        return 1
    print(json.dumps(info))
    return 0 if all(not str(v).startswith("missing") for v in info.values()) else 1


def started_by() -> int:
    from app.core import startup

    shell = startup.shell_pid()
    if shell:
        return shell
    raw = os.environ.get("FORMTXT_PARENT_PID", "").strip()
    return int(raw) if raw.isascii() and raw.isdigit() else 0


def watch_shell(data, shell: int) -> None:
    if shell <= 1:
        return
    import logging

    from app.core import runtime, startup

    def leave() -> None:
        logging.getLogger("formtxt").info("the app that started this engine is gone (process %s), stopping", shell)
        runtime.release(data)
        os._exit(0)

    startup.watch(shell, leave)


def serve() -> int:
    import logging
    from pathlib import Path

    from app.core import config, runtime, startup

    try:
        data = config.data_dir()
        logs = runtime.start_logging(data).parent
    except OSError as err:
        print(f"formtxt cannot use its data folder: {err}", file=sys.stderr)
        return 5
    startup.keep_errors(logs)
    log = logging.getLogger("formtxt")
    shell = started_by()
    if not shell and startup.alone():
        beside = startup.app_beside(Path(sys.executable))
        if beside is not None and startup.open_app(beside):
            log.info("started without its app, so it opened %s and stopped", beside)
            return 0
        log.error("started without its app, and no app program was found near %s", sys.executable)
        print("formtxt-engine is a part of FormTxt and serves nothing on its own. Open FormTxt instead.", file=sys.stderr)
        return 4
    try:
        runtime.claim(data, shell)
    except startup.Busy as err:
        log.error("%s", err)
        print(err, file=sys.stderr)
        return 2
    watch_shell(data, shell)
    bundled = os.path.join(resource_dir(), "frontend_dist")
    if os.path.isdir(bundled):
        os.environ.setdefault("FORMTXT_DIST", bundled)
        os.environ.setdefault("FORMTXT_DESKTOP", "1")
    import uvicorn

    from app.main import app

    raw = os.environ.get("FORMTXT_ENGINE_PORT") or os.environ.get("FORMTXT_PORT") or "8210"
    port = int(raw)
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    if port == 0:
        import socket

        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
    os.environ["FORMTXT_ENGINE_PORT"] = str(port)
    from app.core import window_key

    if window_key.stdout_mode():
        print(window_key.LINE + window_key.KEY, flush=True)
    import signal

    def leave(_signum, _frame) -> None:
        runtime.release(data)
        os._exit(0)

    signal.signal(signal.SIGTERM, leave)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="info"))
    runtime.start_logging(data)
    try:
        server.run()
    finally:
        runtime.release(data)
    return 0 if server.started else 3


def main() -> int:
    if "--selfcheck" in sys.argv:
        return selfcheck()
    try:
        return serve()
    except Exception:
        import logging

        logging.getLogger("formtxt").exception("the engine stopped on an error")
        raise


if __name__ == "__main__":
    import multiprocessing

    multiprocessing.freeze_support()
    sys.exit(main())
