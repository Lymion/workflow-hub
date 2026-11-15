"""Start the engine: `python -m engine` (from the repository root)."""
from __future__ import annotations

import sys

import uvicorn

from .app import create_app
from .bundle import bundle_dir, sync
from .config import HOST, PORT, HubPaths, load_dotenv


def main() -> None:
    paths = HubPaths.from_env()
    bundle = bundle_dir()
    if bundle:  # installed app: bring the bundled modules, workflows and starter snippets into the hub folder
        paths.root.mkdir(parents=True, exist_ok=True)
        sync(bundle, paths.root)
    if sys.stdout is None or sys.stderr is None:  # started without a console: keep a log instead
        paths.data.mkdir(parents=True, exist_ok=True)
        log = open(paths.data / "engine.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stdout or log
        sys.stderr = sys.stderr or log
    load_dotenv(paths.root / ".env")
    print(f"Workflow Hub engine on http://{HOST}:{PORT}  (data: {paths.data})", flush=True)
    uvicorn.run(create_app(paths), host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
