import json
import os
import sys


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


def _alive(pid: int) -> bool:
    if os.name == "nt":
        import ctypes

        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        code = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
        ctypes.windll.kernel32.CloseHandle(handle)
        return code.value == 259
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def watch_parent() -> None:
    raw = os.environ.get("FORMTXT_PARENT_PID", "")
    if not raw.isdigit():
        return
    import threading
    import time

    pid = int(raw)

    def loop() -> None:
        while _alive(pid):
            time.sleep(2)
        os._exit(0)

    threading.Thread(target=loop, name="parent-watch", daemon=True).start()


def main() -> int:
    if "--selfcheck" in sys.argv:
        return selfcheck()
    watch_parent()
    bundled = os.path.join(resource_dir(), "frontend_dist")
    if os.path.isdir(bundled):
        os.environ.setdefault("FORMTXT_DIST", bundled)
        os.environ.setdefault("FORMTXT_DESKTOP", "1")
    import uvicorn

    from app.main import app

    raw = os.environ.get("FORMTXT_ENGINE_PORT") or os.environ.get("FORMTXT_PORT") or "8199"
    port = int(raw)
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
    return 0


if __name__ == "__main__":
    import multiprocessing

    multiprocessing.freeze_support()
    sys.exit(main())
