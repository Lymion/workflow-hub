"""Route modules. Each feature adds one file here and one line below."""
from __future__ import annotations

from fastapi import FastAPI


def register(app: FastAPI) -> None:
    from . import launch, projects

    app.include_router(projects.router)  # session 2
    app.include_router(launch.router)  # session 2
