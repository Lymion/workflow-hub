"""Session 12: release button. Version bump, changelog from commits, icons + splash from one image, build.

Generic: the steps come from modules/<type>/release.py; projects without one have no Release tab.
"""
from __future__ import annotations

import base64
import binascii
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import generated, gitops
from ..boards import load_module_file
from .cart import context
from .projects import get_project, hub_of
from .run import describe, start as run_start, targets_for, StartIn

router = APIRouter()
HUB_FILES = ("release.json", "CHANGELOG.md", "app.config.js")


def _ctx(request: Request, project_id: int):
    hub = hub_of(request)
    project = get_project(hub, project_id)
    path = Path(project["path"])
    if not path.is_dir():
        raise HTTPException(409, f"Folder {project['path']} not found. It was moved or renamed.")
    rel = load_module_file(hub.paths.root, project["module"], "release.py")
    ctx = context(hub, project)
    if not rel or not ctx:
        raise HTTPException(404, "This project type has no release flow. Releases are for app projects.")
    return hub, project, path, rel, ctx


def _git(path: Path, *args: str) -> str:
    try:
        return gitops.git(path, *args, check=False)
    except gitops.GitError:
        return ""


def user_changes(path: Path) -> list[str]:
    """Changed files that aren't the hub's own (those would sneak into the release commit)."""
    try:
        st = gitops.status(path)
    except gitops.GitError:
        return []
    out = []
    for f in st["files"]:
        p = path / f["path"]
        owned = f["path"].startswith("assets/hub/") or f["path"] in HUB_FILES or (p.is_file() and generated.is_owned(p))
        if not owned:
            out.append(f["path"])
    return out


@router.get("/projects/{project_id}/release")
def plan(request: Request, project_id: int) -> dict:
    hub, project, path, rel, ctx = _ctx(request, project_id)
    current = rel.read_release(path)
    repo = gitops.is_repo(path)
    tag = _git(path, "describe", "--tags", "--abbrev=0", "--match", "v*").strip() if repo else ""
    subjects = [s for s in _git(path, "log", f"{tag}..HEAD" if tag else "HEAD", "-50", "--pretty=%s").splitlines() if s.strip()] if repo else []
    checks = []
    if not repo:
        checks.append({"level": "warn", "problem": "This folder isn't a git repo, so there's no changelog or tag", "fix": "Open the Git tab and press Start git."})
    dirty = user_changes(path) if repo else []
    if dirty:
        checks.append({"level": "bad", "problem": f"{len(dirty)} changed file{'s' if len(dirty) > 1 else ''} not committed ({', '.join(dirty[:3])})", "fix": "Commit them in the Git tab first, so the release is exactly what you tested."})
    fw = rel.framework(ctx)
    if fw == "expo" and not (path / "app.config.js").exists() and not (path / "app.config.ts").exists():
        checks.append({"level": "ok", "problem": "The hub adds app.config.js once", "fix": "It passes the version and icons to Expo. After that it's your file."})
    ts, _ = targets_for(hub, project)
    build = next((describe(t, project_id) for t in ts if t["id"] == "build"), None)
    if build and not build["available"]:
        checks.append({"level": "warn", "problem": f"{build['label']} can't run yet", "fix": build["fix"]})
    icons = {name: (path / "assets" / "hub" / name).is_file() for name in rel.ICONS}
    return {
        "version": current["version"], "versionCode": current["versionCode"], "background": current["background"],
        "next": {k: rel.bump(current["version"], k) for k in ("patch", "minor", "major")},
        "last_tag": tag or None, "commits": subjects, "changelog": rel.changelog_draft(subjects),
        "checks": checks, "build": build, "icons": icons, "framework": fw,
    }


class IconsIn(BaseModel):
    image_base64: str = Field(max_length=14_000_000)
    background: str = Field(default="#ffffff", pattern=r"^#[0-9A-Fa-f]{6}$")


@router.post("/projects/{project_id}/release/icons")
def icons(request: Request, project_id: int, body: IconsIn) -> dict:
    hub, project, path, rel, ctx = _ctx(request, project_id)
    raw = body.image_base64.split(",", 1)[-1]
    try:
        data = base64.b64decode(raw, validate=True)
        pngs = rel.make_icons(data, body.background)
    except (binascii.Error, ValueError, OSError) as exc:
        raise HTTPException(422, "That file isn't an image the hub can read. Use a PNG or JPG, ideally 1024×1024.") from exc
    folder = path / "assets" / "hub"
    folder.mkdir(parents=True, exist_ok=True)
    out = []
    for name, png in pngs.items():
        f = folder / name
        if not rel.png_is_owned(f):
            out.append({"file": f"assets/hub/{name}", "status": "skipped"})
            continue
        f.write_bytes(png)
        out.append({"file": f"assets/hub/{name}", "status": "wrote"})
    current = rel.read_release(path)
    generated.write_owned(path / "release.json", rel.render_release_json({**current, "background": body.background}))
    return {"files": out}


class ReleaseIn(BaseModel):
    bump: str = Field(default="patch", pattern="^(patch|minor|major)$")
    notes: str = Field(default="", max_length=20_000)
    build: bool = False


@router.post("/projects/{project_id}/release")
def release(request: Request, project_id: int, body: ReleaseIn) -> dict:
    hub, project, path, rel, ctx = _ctx(request, project_id)
    repo = gitops.is_repo(path)
    dirty = user_changes(path) if repo else []
    if dirty:
        raise HTTPException(409, f"Commit your changes first ({', '.join(dirty[:3])}) in the Git tab, then release.")
    current = rel.read_release(path)
    version = rel.bump(current["version"], body.bump)
    new = {"version": version, "versionCode": current["versionCode"] + 1, "background": current["background"]}
    files = []
    status = generated.write_owned(path / "release.json", rel.render_release_json(new))
    files.append({"file": "release.json", "status": status})
    log = path / "CHANGELOG.md"
    status = generated.write_owned(log, rel.render_changelog(log.read_text(encoding="utf-8") if log.is_file() else "", version, body.notes))
    files.append({"file": "CHANGELOG.md", "status": status})
    if any(f["status"] == "skipped" for f in files):
        names = ", ".join(f["file"] for f in files if f["status"] == "skipped")
        raise HTTPException(409, f"{names} in the project isn't the hub's file (no AUTO-GENERATED header). Rename it to let the hub manage releases.")
    if rel.framework(ctx) == "expo" and not (path / "app.config.ts").exists():
        files.append({"file": "app.config.js", "status": ctx["write_once"](path / "app.config.js", rel.APP_CONFIG)})
    tag = None
    if repo:
        paths = [f["file"] for f in files] + (["assets/hub"] if (path / "assets" / "hub").is_dir() else [])
        try:
            gitops.git(path, "add", "--", *paths)
            gitops.git(path, "commit", "-m", f"Release v{version}", "--", *paths)
            gitops.git(path, "tag", f"v{version}")
            tag = f"v{version}"
        except gitops.GitError as exc:
            raise HTTPException(409, str(exc)) from exc
    build = run_start(request, project_id, "build", StartIn()) if body.build else None
    return {"version": version, "versionCode": new["versionCode"], "files": files, "tag": tag, "build": build}


@router.get("/projects/{project_id}/release/icon/{name}")
def icon_file(request: Request, project_id: int, name: str) -> FileResponse:
    hub, project, path, rel, ctx = _ctx(request, project_id)
    f = path / "assets" / "hub" / name
    if name not in rel.ICONS or not f.is_file():
        raise HTTPException(404, f"No {name} yet. Choose an image in the Release tab.")
    return FileResponse(f, media_type="image/png", headers={"Cache-Control": "no-store"})
