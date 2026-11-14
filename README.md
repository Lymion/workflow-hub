# Workflow Hub

A token-light desktop project workshop for makers. Start a robot or app project in minutes, never wire a pin wrong, and keep one handbook, snippet library and error log across every project. Code runs locally; only small fuzzy steps call Claude Haiku, with a hard cap of RM10 a month.

- **Desktop app:** Tauri 2 + React + Tailwind (`app/`)
- **Engine:** Python + FastAPI on `127.0.0.1:8765` (`engine/`)
- **Storage:** SQLite (`data/hub.db`) + plain files (`modules/`, `snippets/`)

Spec: [`docs/spec.md`](docs/spec.md) · Screen designs: [`scratch/`](scratch/)

## Set up on Windows 11

Install these once, in this order. Open a **new** PowerShell window after each install so `PATH` updates.

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

Optional: copy `.env.example` to `.env` and paste your Anthropic API key (only needed for docs answers, commit messages and other Haiku features). Never commit `.env`.

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

**Build an installer:** `cd app` then `npm run tauri build`. The `.msi` and `.exe` land in `app\src-tauri\target\release\bundle\`.

## Tests

```powershell
.venv\Scripts\python -m pytest
cd app
npm run build
```

## Add a project type

Copy `modules/robotics` to `modules/<new-type>`, then edit `module.yaml`'s `id` and `name`. A new card appears in **New project**, with no hub code changes. Add `enabled: false` to hide a type without deleting it.
