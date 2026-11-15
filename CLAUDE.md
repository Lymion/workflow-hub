# Workflow Hub

Desktop project workshop for makers (robotics + app development). It plans, sets up and remembers everything around the code; the code itself is written in VS Code. Full spec: `docs/spec.md`. Approved screen designs: `scratch/SPEC.md` + `scratch/scratch.html`.

## Core principle

**Big model builds, code runs, Haiku only for small fuzzy steps.**

- Claude Code (on the user's subscription) writes hub features and templates once.
- Day-to-day features run as plain code and cost no tokens: search, templates, wizards, pins.h, handbook, checks, run panel.
- Claude Haiku is used only for small, fuzzy steps: docs answers, commit messages, parts suggestions, weekly review.
- Claude Code comes back only when something breaks or a new feature is needed. A failing test is the signal.

## Hard rules

- **The hub only ever calls `claude-haiku-5-5`.** The model id lives in one line, `engine/config.py` (`HAIKU_MODEL`). There is no setting to pick another model. Never add one.
- **RM10 monthly hard cap.** Before every Haiku call, add the call's worst-case cost to this month's spend; if it would pass RM10, block the call (don't send it) and fall back to the free path. Log every call (feature, tokens in/out, cost) in `llm_calls`. Keep every prompt under 20K tokens. Cache answers. At most one retry per call.
- **The hub never edits the user's own code.** It only writes files it owns (`pins.h`, theme file, `platformio.ini`, templates, `wiring.json`), and every one of them starts with an `AUTO-GENERATED` header. If a file exists without that header, leave it alone and tell the user.
- The API key lives in the OS keychain (or `.env` for development). Never write it into a project folder, a log or the database. Never commit `.env`.
- Claude Code never uses the hub's API key.

## UI work

For any UI work, use UI UX Pro Max (Apple Native Experience style), Emil Kowalski's apple-design and emil-design-eng skills, and ui-elevate. Prototype new screens with the scratch skill first. Keep it simplistic and intuitive.

Don't make it too flat; give it depth where it fits:
- 1 pixel inner highlight on the top
- 2 layers of shadow (a tight contact shadow and a soft ambient one)
- Translucent surfaces with backdrop blur

And make it colourful enough to make the user happy while using the app. Conflicts: UI UX Pro Max wins on tokens and accessibility; Emil's skills win on motion and interaction feel. Use animate/choreograph for animation, review-animations to check it, break-ui for edge cases.

Design rules from the spec: one primary action per screen; calm by default; progressive disclosure behind "More"; same layout everywhere (sidebar, main, optional right panel); Ctrl+K command bar; light and dark mode; every warning says what is wrong and how to fix it, in one line.

Tokens live in `app/tailwind.config.js` (names) and `app/src/styles.css` (values, light + dark).

## Layout

```
engine/            Python FastAPI engine on 127.0.0.1:8765 (python -m engine)
  routes/          one file per feature, registered in routes/__init__.py
  tests/           pytest; run before every commit
modules/           one folder per project type (module.yaml, handbook/, boards/, presets/, checks.py, wizard.py, run.py, release.py, guide.yaml, docs.yaml)
snippets/          snippet library, one folder per snippet
workflows/         automations (YAML; steps tagged code / small-llm / big-llm)
vscode-extension/  VS Code extension (plain JS; talks to the engine only)
packaging/         builds engine.exe for the Windows installer (PyInstaller)
app/               Tauri 2 + React + Tailwind desktop shell
  src/pages/       one file per screen
  src-tauri/       Rust shell; starts the engine if it isn't running
data/              hub.db and downloaded docs (git-ignored)
scratch/           throwaway prototypes (scratch skill)
```

Adding a project type = adding a folder under `modules/`. Never hard-code module ids in engine logic.

## Commands

```bash
python -m venv .venv && .venv/bin/pip install -r engine/requirements-dev.txt   # Windows: .venv\Scripts\pip
python -m engine                 # engine on :8765
python -m pytest                 # engine tests
cd app && npm install && npm run tauri dev    # desktop app (Vite on :1420)
cd app && npm run build          # typecheck + build the UI
```

## Conventions

- Small commits with clear messages. Add tests for what you build.
- Engine errors return one line: what is wrong and how to fix it.
- Keep features to their roadmap session (`docs/spec.md` → Build roadmap).
- Bump the version with every update the user will install: `python packaging/bump_version.py minor` for new features, `patch` for fixes. It updates every version field (a test checks they match), so the Windows installer upgrades cleanly. Add a line to `CHANGELOG.md`.
