"""Plain-code git for a project folder: status, diff, log, commit, push. No tokens.

Every failure becomes a GitError with one line: what is wrong and how to fix it.
"""
from __future__ import annotations

import fnmatch
import re
import shutil
import subprocess
from pathlib import Path

DIFF_CHAR_CAP = 14_000  # about 4k tokens of diff for the commit-message prompt
SECRET_PATTERNS = (".env", ".env.*", "*.pem", "*.key", "*.p12", "*.keystore", "*.jks", "id_rsa*", "credentials*.json", "*secret*", "google-services.json", "GoogleService-Info.plist")
SAFE_SECRETS = (".env.example", ".env.sample", ".env.template")
NO_GIT = "Git isn't installed. Install it from git-scm.com (Windows: winget install Git.Git), then reopen the hub."


class GitError(Exception):
    pass


def is_secret(path: str) -> bool:
    name = Path(path).name
    if name in SAFE_SECRETS:
        return False
    return any(fnmatch.fnmatch(name, p) for p in SECRET_PATTERNS)


def git(path: Path, *args: str, timeout: int = 60, check: bool = True) -> str:
    exe = shutil.which("git")
    if not exe:
        raise GitError(NO_GIT)
    try:
        r = subprocess.run([exe, *args], cwd=path, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
                           env=None, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired as exc:
        raise GitError(f"git {args[0]} took longer than {timeout}s. Check your connection, then try again.") from exc
    if check and r.returncode != 0:
        raise GitError(explain(args[0], (r.stderr or r.stdout).strip()))
    return r.stdout


def explain(cmd: str, err: str) -> str:
    """Turn git's error text into one line with a fix."""
    low = err.lower()
    if "please tell me who you are" in low or "user.email" in low:
        return 'Git doesn\'t know who you are. Run: git config --global user.name "Your Name" and git config --global user.email you@example.com'
    if "not a git repository" in low:
        return "This folder isn't a git repo yet. Press Start git to set it up."
    if "no configured push destination" in low or "does not appear to be a git repository" in low or "no such remote" in low:
        return "This repo has no GitHub remote yet. Create one with: gh repo create --private --source=. --push"
    if "rejected" in low and ("fetch first" in low or "non-fast-forward" in low):
        return "GitHub has commits you don't have. Run: git pull --rebase, then push again."
    if "could not read username" in low or "authentication failed" in low or "permission denied" in low:
        return "GitHub refused the login. Run: gh auth login (or set up your SSH key), then push again."
    if "could not resolve host" in low or "unable to access" in low:
        return "Can't reach GitHub. Check your internet connection, then push again."
    if "nothing to commit" in low:
        return "Nothing to commit. Change some files first."
    first = err.splitlines()[0] if err else f"git {cmd} failed"
    return f"git {cmd} failed: {first[:200]}"


def is_repo(path: Path) -> bool:
    return (path / ".git").exists()


def init(path: Path) -> None:
    git(path, "init", "-b", "main")


STATUS_NAMES = {"M": "modified", "A": "added", "D": "deleted", "R": "renamed", "C": "copied", "?": "new", "U": "conflict", "T": "modified"}


def status(path: Path) -> dict:
    if not is_repo(path):
        return {"repo": False, "branch": None, "files": [], "ahead": 0, "behind": 0, "remote": None, "upstream": None}
    out = git(path, "status", "--porcelain=v1", "-b", "-uall", "-z")
    entries = out.split("\0")
    head = entries[0][3:] if entries and entries[0].startswith("## ") else ""
    files = []
    i = 1
    while i < len(entries):
        e = entries[i]
        if not e:
            i += 1
            continue
        x, y, name = e[0], e[1], e[3:]
        if x in "RC":
            i += 1  # the original name follows
        code = x if x not in " ?" else y
        files.append({"path": name, "status": STATUS_NAMES.get(code, "modified"), "staged": x not in " ?", "secret": is_secret(name)})
        i += 1
    branch, upstream, ahead, behind = head, None, 0, 0
    m = re.match(r"(?:No commits yet on )?([^.\s]+)(?:\.\.\.(\S+))?(?: \[(.*)\])?", head)
    if m:
        branch, upstream = m.group(1), m.group(2)
        for part in (m.group(3) or "").split(", "):
            if part.startswith("ahead "):
                ahead = int(part[6:])
            if part.startswith("behind "):
                behind = int(part[7:])
    remote = git(path, "remote", check=False).split()
    return {"repo": True, "branch": branch, "upstream": upstream, "ahead": ahead, "behind": behind, "remote": remote[0] if remote else None,
            "files": files, "has_commits": bool(git(path, "rev-parse", "--verify", "-q", "HEAD", check=False).strip())}


def log(path: Path, n: int = 15) -> list[dict]:
    if not is_repo(path):
        return []
    out = git(path, "log", f"-{n}", "--pretty=format:%h%x1f%s%x1f%an%x1f%cr", check=False)
    rows = []
    for line in out.splitlines():
        parts = line.split("\x1f")
        if len(parts) == 4:
            rows.append({"hash": parts[0], "subject": parts[1], "author": parts[2], "when": parts[3]})
    return rows


def _paths_arg(files: list[str] | None) -> list[str]:
    return ["--", *files] if files else []


def diff(path: Path, files: list[str] | None = None, cap: int = DIFF_CHAR_CAP) -> dict:
    """Diff of everything that would be committed (tracked changes + new files), secrets left out.

    Returns {text, truncated, files: [{path, status, added, removed}], skipped_secrets}."""
    st = status(path)
    chosen = [f for f in st["files"] if not files or f["path"] in files]
    secrets = [f["path"] for f in chosen if f["secret"]]
    wanted = [f for f in chosen if not f["secret"]]
    has_head = st.get("has_commits")
    stats = {}
    if has_head:
        for line in git(path, "diff", "HEAD", "--numstat", *_paths_arg([f["path"] for f in wanted]), check=False).splitlines():
            a, r, name = (line.split("\t") + ["", "", ""])[:3]
            stats[name] = (int(a) if a.isdigit() else 0, int(r) if r.isdigit() else 0)
    chunks = []
    for f in wanted:
        if f["status"] == "new" or not has_head:
            p = path / f["path"]
            try:
                body = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                body = "(binary file)"
            lines = body.splitlines()
            stats[f["path"]] = (len(lines), 0)
            chunks.append(f"--- new file: {f['path']}\n" + "\n".join("+" + l for l in lines[:120]) + ("\n+…" if len(lines) > 120 else ""))
        else:
            chunks.append(git(path, "diff", "HEAD", "--unified=2", "--", f["path"], check=False))
    text = "\n".join(c for c in chunks if c.strip())
    truncated = len(text) > cap
    if truncated:
        text = text[:cap] + "\n… (diff cut here; the file list above is complete)"
    return {
        "text": text,
        "truncated": truncated,
        "files": [{"path": f["path"], "status": f["status"], "added": stats.get(f["path"], (0, 0))[0], "removed": stats.get(f["path"], (0, 0))[1]} for f in wanted],
        "skipped_secrets": secrets,
    }


def file_diff(path: Path, file: str) -> str:
    if is_secret(file):
        return "(secret file: contents hidden)"
    st = status(path)
    f = next((x for x in st["files"] if x["path"] == file), None)
    if not f:
        return ""
    if f["status"] == "new" or not st.get("has_commits"):
        try:
            return "\n".join("+" + l for l in (path / file).read_text(encoding="utf-8").splitlines()[:400])
        except (UnicodeDecodeError, OSError):
            return "(binary file)"
    return git(path, "diff", "HEAD", "--unified=3", "--", file, check=False)


def commit(path: Path, message: str, files: list[str] | None = None) -> str:
    st = status(path)
    pick = [f for f in st["files"] if not files or f["path"] in files]
    if not pick:
        raise GitError("Nothing to commit. Change some files first.")
    leaked = [f["path"] for f in pick if f["secret"]]
    if leaked:
        raise GitError(f"{leaked[0]} looks like a secret and won't be committed. Add it to .gitignore, then commit again.")
    git(path, "add", "-A", "--", *[f["path"] for f in pick])
    git(path, "commit", "-m", message, "--", *[f["path"] for f in pick])
    return git(path, "rev-parse", "--short", "HEAD").strip()


def push(path: Path) -> str:
    st = status(path)
    if not st["remote"]:
        raise GitError(explain("push", "no configured push destination"))
    if st["upstream"]:
        git(path, "push", timeout=120)
    else:
        git(path, "push", "-u", st["remote"], st["branch"], timeout=120)
    return st["branch"]


def template_message(files: list[dict]) -> str:
    """The free fallback when Haiku is capped, off or has no key."""
    if not files:
        return "Update project"
    kinds = {f["status"] for f in files}
    names = [Path(f["path"]).name for f in files]
    verb = "Add" if kinds == {"new"} or kinds == {"added"} else "Remove" if kinds == {"deleted"} else "Update"
    shown = ", ".join(names[:3]) + (f" and {len(names) - 3} more" if len(names) > 3 else "")
    return f"{verb} {shown}"
