"""Route modules. Each feature adds one file here and one line below."""
from __future__ import annotations

from fastapi import FastAPI


def register(app: FastAPI) -> None:
    from . import errors, handbook, launch, projects, snippets

    app.include_router(projects.router)  # session 2
    app.include_router(launch.router)  # session 2
    app.include_router(snippets.router)  # session 3
    app.include_router(errors.router)  # session 4
    snippets.AFTER_REINDEX.append(errors.index_snippets)
    snippets.reindex(app.state.hub)
    errors.reindex_errors(app.state.hub)
    app.include_router(handbook.router)  # session 5
    handbook.current(app.state.hub)
