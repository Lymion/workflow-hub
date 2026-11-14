"""Start the engine: `python -m engine` (from the repository root)."""
from __future__ import annotations

import uvicorn

from .app import create_app
from .config import HOST, PORT, HubPaths, load_dotenv


def main() -> None:
    paths = HubPaths.from_env()
    load_dotenv(paths.root / ".env")
    print(f"Workflow Hub engine on http://{HOST}:{PORT}  (data: {paths.data})", flush=True)
    uvicorn.run(create_app(paths), host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
