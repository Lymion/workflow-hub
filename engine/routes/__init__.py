"""Route modules. Each feature adds one file here and one line below."""
from __future__ import annotations

from fastapi import FastAPI


def register(app: FastAPI) -> None:
    from . import launch, projects, snippets

    app.include_router(projects.router)  # session 2
    app.include_router(launch.router)  # session 2
    app.include_router(snippets.router)  # session 3
    snippets.reindex(app.state.hub)
