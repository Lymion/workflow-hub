"""FastAPI application factory. Routes live in engine/routes/*.py."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import VERSION, HubPaths
from .hub import Hub
from .modules import load_modules

# Origins the desktop shell uses (Tauri on Windows/macOS/Linux) plus the Vite dev server.
ALLOWED_ORIGINS = [
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
]


def create_app(paths: HubPaths | None = None) -> FastAPI:
    paths = paths or HubPaths.from_env()
    hub = Hub(paths)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        hub.close()

    app = FastAPI(title="Workflow Hub engine", version=VERSION, lifespan=lifespan)
    app.state.hub = hub
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health(request: Request) -> dict:
        h: Hub = request.app.state.hub
        modules, errors = load_modules(h.paths.modules)
        tables = db.table_names(h.conn)
        missing = [t for t in db.CORE_TABLES if t not in tables]
        return {
            "status": "ok" if not missing else "degraded",
            "version": VERSION,
            "db": "ok" if not missing else f"missing tables: {', '.join(missing)}",
            "modules": len([m for m in modules if m.enabled]),
            "module_errors": len(errors),
        }

    @app.get("/modules")
    def modules(request: Request) -> dict:
        h: Hub = request.app.state.hub
        mods, errors = load_modules(h.paths.modules)
        return {
            "modules": [m.to_dict() for m in mods if m.enabled],
            "disabled": [m.id for m in mods if not m.enabled],
            "errors": [e.to_dict() for e in errors],
        }

    from .routes import register

    register(app)
    return app
