import os
import sys

import uvicorn

from app.main import app


def main() -> None:
    port = int(os.environ.get("FORMTXT_ENGINE_PORT") or os.environ.get("FORMTXT_PORT") or 8199)
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
