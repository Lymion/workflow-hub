"""Route modules. Each feature adds one file here and one line below."""
from __future__ import annotations

from fastapi import FastAPI


def register(app: FastAPI) -> None:
    from . import boards, cart, design, errors, githelper, guide, guidemode, handbook, launch, projects, release, run, snippets

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
    if cart.after_update not in projects.AFTER_UPDATE:
        projects.AFTER_UPDATE.append(cart.after_update)
    app.include_router(design.router)  # session 9
    app.include_router(run.router)  # session 10
    app.include_router(githelper.router)  # session 11
    app.include_router(guidemode.router)  # session 12
    app.include_router(release.router)  # session 12
