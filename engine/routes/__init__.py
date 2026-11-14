"""Route modules. Each feature adds one file here and one line below."""
from __future__ import annotations

from fastapi import FastAPI


def register(app: FastAPI) -> None:
    from . import boards, cart, errors, guide, handbook, launch, projects, snippets

    app.include_router(projects.router)  # session 2
    app.include_router(launch.router)  # session 2
    app.include_router(snippets.router)  # session 3
    app.include_router(errors.router)  # session 4
    if errors.index_snippets not in snippets.AFTER_REINDEX:
        snippets.AFTER_REINDEX.append(errors.index_snippets)
    snippets.reindex(app.state.hub)
    errors.reindex_errors(app.state.hub)
    app.include_router(handbook.router)  # session 5
    handbook.current(app.state.hub)
    app.include_router(boards.router)  # session 6
    app.include_router(cart.router)  # session 7
    app.include_router(guide.router)  # session 8
    if cart.after_create not in projects.AFTER_CREATE:
        projects.AFTER_CREATE.append(cart.after_create)
