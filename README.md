# Workflow Hub

A token-light desktop project workshop for makers. Start a robot or app project in minutes, never wire a pin wrong, and keep one handbook, snippet library and error log across every project. Code runs locally; only small fuzzy steps call Claude Haiku, with a hard cap of RM10 a month.

- **Desktop app:** Tauri 2 + React + Tailwind (`app/`)
- **Engine:** Python + FastAPI on `127.0.0.1:8765` (`engine/`)
- **Storage:** SQLite (`data/hub.db`) + plain files (`modules/`, `snippets/`)

Spec: [`docs/spec.md`](docs/spec.md) · Screen designs: [`scratch/`](scratch/)

## What it does

| Where | What | Costs tokens? |
| --- | --- | --- |
| Home | Today's tasks across projects, recent projects, this week's review, Haiku spend in the sidebar | No |
| New project | Name, type, then a board (robots) or a stack (apps); presets, live checks, and the docs for what you picked | No |
| Project | A collapsible **Docs** bar with the docs for its board, parts and stack (updates as you add parts). Tabs: Tasks, Journal, Snippets used, **Parts** (cart, costs, checks), **Wiring** (drag wires, pin picker, `pins.h`), **Stack**, **Design tokens**, **Release** (apps), **Run** (build, upload, dev server, serial monitor + plotter), **Git** | Only the commit message |
| Handbook | Parts, boards and stacks with comparison specs; **Guide me** question flow; your own notes | No |
| Library | Snippets (quick capture: `Ctrl+Shift+S`) and the error log, one search for both | No |
| Docs | Official doc sites (Arduino, ESP32, PlatformIO, Expo, React Native, Supabase, Next.js, Tauri) read live in a hub window; **Find pages** searches them online and Haiku picks the best 3-5; save any page for Ask docs | Find pages: one small Haiku call (about RM0.003), cached |
| Ask docs | Docs guide with cards and a hint ladder, from downloaded docs + the handbook | One small Haiku call, cached |
| Automations | Weekly review, nightly hub health, your own workflows in `workflows/` | Weekly review: one Haiku call |
| VS Code | Insert snippet, Ask hub, save selection, log error ([`vscode-extension/`](vscode-extension/)) | Ask hub only |

Every Haiku call goes through one guard: the model is fixed (`engine/config.py`), the month is capped at RM10 (checked before sending), each call is logged and cached, and each feature has a free fallback when the cap is reached or no key is set.

**The hub never edits your code.** It only writes files with an `AUTO-GENERATED` header at the top (`pins.h`, `platformio.ini`, `wiring.json`, `PARTS.md`, theme tokens, `.env.example`, `release.json`, `CHANGELOG.md`, icons in `assets/hub/`). Starter files (`main.cpp`, `CLAUDE.md`, `.gitignore`, `app.config.js`, new screens) are written once if missing and are yours from then on. If a file the hub wants to write exists without the header, it leaves it alone and tells you.

## Install on Windows 11 (no coding tools needed)

1. Open the repository on GitHub → **Actions** → **Windows installer** → the latest green run. Under **Artifacts**, download **Workflow-Hub-Windows-installer** and unzip it. (When a version is tagged, the installer is also on the **Releases** page.)
2. Run `Workflow Hub_<version>_x64-setup.exe`. It installs for your user only, so it doesn't need admin rights. Windows SmartScreen may say "Windows protected your PC" because the installer isn't signed: click **More info** → **Run anyway**.
3. Open **Workflow Hub** from the Start menu. It starts its own engine; nothing else to run.

Your data lives in `%LOCALAPPDATA%\Workflow Hub` (database, your snippets, handbook notes, `data\engine.log`). Uninstalling the app keeps it. To update, close the app and run the newer installer over the old one (no uninstall). Each update has a higher version number, so it installs as an upgrade; what changed is in [CHANGELOG.md](CHANGELOG.md).

Install the tools for your projects (table in step 5 below) so Build, Upload, Git and app setup work. The engine runs while the app window is open, so scheduled automations run only then.

## Set up for development on Windows 11

Only needed to change the hub itself. Install these once, in this order. Open a **new** PowerShell window after each install so `PATH` updates.

### 1. Rust

1. Install **Microsoft C++ Build Tools**: download from <https://visualstudio.microsoft.com/visual-cpp-build-tools/>, run it, tick **Desktop development with C++**, install.
2. WebView2 is already part of Windows 11. Nothing to do.
3. Install Rust:
   ```powershell
   winget install --id Rustlang.Rustup -e
   ```
   Then in a new window:
   ```powershell
   rustup default stable-msvc
   rustc --version
   ```

### 2. Node.js

```powershell
winget install --id OpenJS.NodeJS.LTS -e
node -v
```

### 3. Python

```powershell
winget install --id Python.Python.3.12 -e
py --version
```

### 4. Get the code and install dependencies

```powershell
git clone https://github.com/Lymion/workflow-hub.git
cd workflow-hub
py -m venv .venv
.venv\Scripts\pip install -r engine\requirements-dev.txt
cd app
npm install
cd ..
```

Optional: add your Anthropic API key in the app's **Settings** (it goes into the Windows Credential Manager), or copy `.env.example` to `.env` for development. It's only needed for docs answers, commit messages and the weekly review. Never commit `.env`.

### 5. Tools for your projects (install what you use)

| For | Install | Used by |
| --- | --- | --- |
| Robots | `pip install platformio` (or the PlatformIO VS Code extension), USB driver for your board (CP210x or CH340) | Build, Upload, Serial monitor |
| Apps | Node.js (above); Expo Go on your phone; `npx eas-cli login` once for APK builds | Set up app, Dev server, Release |
| Desktop apps | Rust (above) | Tauri dev and build |
| Git | `winget install --id Git.Git -e`, then `git config --global user.name "Your Name"` and `user.email` | Git tab, Release |
| GitHub | `winget install --id GitHub.cli -e`, then `gh auth login` | Push to GitHub on setup |
| Editor | VS Code with `code` on PATH, plus the [hub extension](vscode-extension/README.md) | Open in VS Code, Insert snippet |

The hub checks for each tool and shows a one-line fix when one is missing.

## Run it

**Engine** (in the repo folder):

```powershell
.venv\Scripts\python -m engine
```

You should see `Workflow Hub engine on http://127.0.0.1:8765`. Check it at <http://127.0.0.1:8765/health>.

**App** (in a second window):

```powershell
cd app
npm run tauri dev
```

The first run compiles the Rust shell and takes a few minutes. The app starts the engine by itself if it isn't already running. If the sidebar says **Engine offline**, start it as above and press **Retry**.

**Build an installer yourself:** the GitHub workflow `.github/workflows/windows-installer.yml` does this on every push. Locally:

```powershell
.venv\Scripts\pip install pyinstaller
.venv\Scripts\python packaging\build_engine.py
cd app
npx tauri build --bundles nsis
```

The first command packs the engine into `app\src-tauri\engine-dist\` (so the installed app needs no Python); the setup `.exe` lands in `app\src-tauri\target\release\bundle\nsis\`.

## Tests

```powershell
.venv\Scripts\python -m pytest
cd app
npm run build
cd ..\vscode-extension
node --test test/lib.test.js
```

The nightly **Hub health** automation runs the same tests; if one fails it saves the output to `data\health\last-failure.md` and opens Claude Code in the hub folder.

## Add doc links

Each handbook chapter (part, board or stack) can list official pages in its setup block:

```yaml
docs:
- title: "Arduino · Servo library"
  url: https://docs.arduino.cc/libraries/servo/
```

Library (`lib_dep`) and npm (`packages`) pages are added automatically. Doc sites for the Docs page live in each module's `docs.yaml` under `sites:`. The **Docs links** GitHub workflow checks every link weekly.

## Add a project type

Copy `modules/robotics` to `modules/<new-type>`, then edit `module.yaml`'s `id` and `name`. A new card appears in **New project**, with no hub code changes. Add `enabled: false` to hide a type without deleting it.

A module folder can hold: `module.yaml`, `handbook/` (markdown chapters with a YAML setup block), `boards/`, `presets/`, `checks.py`, `wizard.py`, `run.py` (run panel targets), `release.py`, `guide.yaml` (Guide me questions) and `docs.yaml` (docs to download).

## Add an automation

Add a YAML file to `workflows/`. Steps are tagged `code`, `small-llm` or `big-llm` and run on `schedule` (`daily 20:30`, `weekly sun 20:00`, `every 30m`), `file_change` (a glob in your project folders) or the **Run now** button. See `workflows/weekly-review.yaml`.
