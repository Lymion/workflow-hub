"""App stack checks: conflicts, framework-only extras, and known gotchas. Plain code, no tokens.

run_stack(stack) -> findings, where stack = [{key, title, meta}] (meta = the stack chapter's setup block).
Every finding names the stack item, the problem and the fix.
"""
from __future__ import annotations


def _f(level: str, part: str, problem: str, fix: str) -> dict:
    return {"level": level, "part": part, "problem": problem, "fix": fix, "message": f"{part}: {problem}. {fix}"}


def run_stack(stack: list[dict]) -> list[dict]:
    keys = {s["key"]: s for s in stack}
    frameworks = [s for s in stack if s["meta"].get("kind") == "framework"]
    out: list[dict] = []
    if not frameworks:
        out.append(_f("bad", "Framework", "is missing", "Pick Expo, Next.js or Tauri."))
    if len(frameworks) > 1:
        out.append(_f("bad", " and ".join(f["title"] for f in frameworks), "are both frameworks", "Keep one framework per project."))
    seen = set()
    for s in stack:
        for c in s["meta"].get("conflicts", []) or []:
            pair = tuple(sorted((s["key"], c)))
            if c in keys and pair not in seen:
                seen.add(pair)
                out.append(_f("bad", f"{s['title']} and {keys[c]['title']}", "don't work together", "Remove one of them."))
        only = s["meta"].get("only")
        if only and only not in keys:
            name = only.capitalize()
            out.append(_f("bad", s["title"], f"works with {name} only", f"Remove it, or switch the framework to {name}."))
    fw = frameworks[0]["key"] if frameworks else None
    if fw == "tauri":
        out.append(_f("warn", "Tauri", "needs the Rust toolchain", "Install Rust (winget install Rustlang.Rustup); on Windows also the C++ Build Tools."))
    if fw == "nextjs" and "sqlite" in keys:
        out.append(_f("warn", "Local SQLite", "runs on the server only in Next.js, not in the browser", "Use it from server actions or route handlers."))
    if fw == "expo" and "supabase" in keys:
        out.append(_f("ok", "Supabase", "works in Expo", "Keys go in .env, never in code."))
    if fw == "expo" and "eas" not in keys:
        out.append(_f("ok", "Builds", "run locally", "Tick EAS Build for cloud APKs."))
    if not any(f["level"] != "ok" for f in out):
        out.insert(0, _f("ok", "Stack", "fits together", "Nothing to change."))
    order = {"bad": 0, "warn": 1, "ok": 2}
    return sorted(out, key=lambda f: order[f["level"]])


def run(board, assignments, parts):  # robotics-style entry point, unused for apps
    return []
