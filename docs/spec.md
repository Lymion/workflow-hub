[Workflow Hub — Spec Sheet.md](https://github.com/user-attachments/files/34855592/Workflow.Hub.Spec.Sheet.md)
# Workflow Hub — Spec Sheet

Nov 13, 2026 · @Syahmie Haykal bin Sadzwarie

## Overview

The Workflow Hub is a desktop project cockpit for app development and robotics: it plans, sets up and remembers everything around the code, while the code itself is written in VS Code.

**Core principle:** big models build, code runs, small models handle the fuzzy bits.

- Claude Code writes the hub's features and templates once.
- Day-to-day features run as plain code and cost no tokens: search, templates, wizards, `pins.h`, the handbook.
- Claude Haiku 5.5 only handles small, fuzzy steps: answering docs questions, commit messages, parts suggestions.
- Claude Code comes back only when something breaks or a new feature is needed.

**Goals**

- Start any new robot or app project in under 5 minutes, fully set up.
- Never wire a pin wrong or retype boilerplate.
- Keep one handbook, one snippet library and one error log across all projects.
- Keep API costs under a hard cap of RM10 a month, using Claude Haiku 5.5 only.

**Non-goals**

- Not an IDE. No code editor, compiler or debugger. VS Code + PlatformIO does that.
- Not a learning app. The guide points you to docs when you are stuck; the focus is shipping projects.

## Workflow

Every project, robot or app, goes through the same ten steps, and what you save at the end feeds the next project.

&#91;embedded content: end-to-end workflow · 10 steps, 2 loops\]

Only step 7 (docs answers) and step 8 (commit messages) call Haiku; every other step is plain code and costs nothing.

## Architecture and tech stack

A Tauri desktop app talks to a local Python engine; everything is stored on your laptop, and only Haiku calls leave the machine.

| Layer | Choice | Job |
| --- | --- | --- |
| Desktop UI | Tauri + React + Tailwind | Home, project pages, handbook, cart, wiring view, panels |
| Engine | Python + FastAPI (local, port 8765) | Wizards, templates, code generation, search, runs CLI tools |
| Storage | SQLite + project folders | Projects, tasks, journal, error log, snippet index, API usage log |
| Search | sentence-transformers `bge-small` + SQLite FTS5 | Local embeddings + keyword search over docs, handbook, snippets, errors |
| Small LLM | Claude Haiku 5.5 via Anthropic API | Docs answers, commit messages, parts suggestions, weekly review |
| Editor bridge | Small VS Code extension | Insert snippet at cursor, "Ask hub" on selected code or error |
| Robotics tools | PlatformIO CLI, arduino-cli | Project init, library install, build, upload, serial monitor |
| App tools | npm / Expo CLI, EAS, git, GitHub CLI (`gh`) | Scaffolding, run, build, release, repo creation |
| Builder (outside the hub) | Claude Code on your subscription | Builds hub features, fixes hub bugs; never uses the hub's API key |

**Rules**

- The hub never edits your own code files. It only writes generated files it owns (`pins.h`, theme file, `platformio.ini`, templates) and marks them `AUTO-GENERATED`.
- The API key lives in the OS keychain, never in a file inside a project.
- Every Haiku call is logged with its tokens and cost. The hub only ever calls claude-haiku-5-5: the model id is fixed in one config line and there is no setting to pick another model.

## Design direction

The hub should feel simple and obvious: every screen has one clear job, and a new feature is found without reading instructions.

**How to build the UI:** every Claude Code session that touches the interface uses the **UI UX Max skill**, **Emil-Kowalski pack skill** and the **ui-elevate skill**. Add this line to the hub's `CLAUDE.md` so it is never forgotten:

```
For any UI work, load and follow the UI UX Max skill and the Apple design skill. Keep it simplistic and intuitive. Don't make it too flat, make the app have depth in suitable part as an example:
- 1 pixel inner highlight on the top
- 2 layer of shadow (a tight-contact shadow and a soft ambient one)
- Translucent surface with backdrop blur
And make it colorful enough to make the user happy while using the app.
```

**Principles**

- One primary action per screen (e.g. New Project, Build, Ask).
- Calm by default: lots of white space, one accent colour, system font, soft corners.
- Progressive disclosure: advanced options hidden behind "More", never shown up front.
- Same layout in every module: left sidebar (Home, Projects, Handbook, Library), main area, optional right panel (guide, cart).
- Keyboard first: `Ctrl+K` command bar to jump to any project, snippet, chapter or action.
- Light and dark mode from day one.
- Every warning says what is wrong and how to fix it, in one line.

**Done when:** someone who has never seen the hub can create a project and open it in VS Code without help.

## Project types (modules)

New Project opens on a type picker, and each type is a self-contained module, so adding a new kind of project later means adding one folder, not rewriting the hub.

**At launch:** two modules, **Robotics** and **App development**. Each one has its own handbook part, cart, wizard, templates, checks, docs set and project-page tabs.

**Shared by every module:** projects, tasks, journal, snippet library, error log, docs guide, run panel, git helper, API cost tracking.

**Module folder**

```
hub/modules/
  robotics/
    module.yaml
    handbook/      (boards, parts)
    templates/
    checks.py      (pin, voltage, current checks)
    wizard.py      (pio init, pins.h, main.cpp)
    docs.yaml      (which docs to download)
    tabs/          (Wiring, Parts)
  app-dev/
    module.yaml
    handbook/      (stacks)
    templates/
    checks.py      (stack conflicts)
    wizard.py      (scaffold, theme, git)
    docs.yaml
    tabs/          (Stack, Design tokens)
```

**module.yaml**

```yaml
id: robotics
name: Robotics
icon: cpu
color: categorical-2
cart_slots: [board, parts]
project_tabs: [wiring, parts]
launch: [vscode, arduino-ide]
run: [build, upload, serial]
```

**How the hub uses it**

- On start, the hub scans `modules/` and shows one card per module in the picker.
- The handbook, cart, wizard, checks and project tabs all load from the chosen module.
- A module can be turned off without deleting it, so the picker stays tidy.

**Possible future modules** (each is one Claude Code session to add, using an existing module as the pattern)

- Game dev: Unreal or Blender projects, asset checklists
- 3D printing / CAD: printer profiles, part files, print log
- ML / computer vision: datasets, training runs, YOLO model versions
- Content and automation: video pipelines like the Shorts channel
- Business: store tasks, product launches, workflow automations

**Done when:** copying the robotics folder, renaming it and editing `module.yaml` makes a new card appear in the picker with no changes to hub code.

## Feature specs

Twelve features, grouped by where you use them; each lists what it does and what counts as done.

### 1. Home and projects

- Home shows today's tasks across projects, the last 5 projects touched, and this month's API spend; projects can be filtered by type (module).
- Each project page has tabs: Tasks (to-do / doing / done, due dates), Journal, Files and links, Parts or Stack, Snippets used, Wiring (robotics), Git status.
- Launch buttons: open in VS Code, open in Arduino IDE, open terminal, open Claude Code in the folder.
- **Done when:** a project can be created, tracked and opened in VS Code in one click.

### 2. Handbook (read mode + guide mode)

- One markdown handbook with three parts: App stacks, Electronics parts, My notes.
- Read mode: table of contents, search, comparison tables, export to PDF.
- Guide mode: a question flow (platform, offline, realtime... / motion, weight, power, wireless...) that jumps to the right chapters.
- Each chapter has a hidden YAML setup block (see Data model) and an **Add to project** button.
- **Done when:** a new chapter file appears in read mode, search and the picker with no code changes.

### 3. Project cart and checks

- Opens beside the handbook on New Project, or from an existing project.
- Lists picked board, parts and stack; saved presets ("2WD obstacle robot", "Expo + Supabase app").
- Checks before build: pin conflicts, voltage mismatch (5V into 3.3V), driver current vs motor stall current, input-only and strapping pins, incompatible stacks.
- **Done when:** every warning names the part, the problem and the fix.

### 4. Robotics project wizard

- One-time setup check: VS Code, PlatformIO extension (`code --install-extension platformio.platformio-ide`), drivers note (CP210x / CH340).
- Runs `pio project init --board <id>`, writes `platformio.ini` with `lib_deps` from the cart.
- Generates `pins.h`, `main.cpp` skeleton (includes, `setupPins()`, `Serial.begin`, non-blocking `millis()` loop), part starter functions.
- `git init`, opens VS Code, adds parts list and setup checklist to the project page.
- **Done when:** a fresh ESP32 project builds and uploads with zero manual edits.

### 5. Wiring view and pins.h

- Board SVG (ESP32 DevKit, Uno, Nano first) with clickable pins; parts from the handbook with typed pins.
- Drag wires, name signals (`leftMotorPWM`); saved as `wiring.json` (Wokwi `diagram.json` import/export later).
- Regenerates `pins.h` on every change; exports a pin table and wiring image to the project page.
- **Done when:** changing a wire updates `pins.h` and the build still passes.

### 6. App project wizard

- Stacks first: Expo / React Native, Next.js, Tauri.
- Scaffold, install, folder structure, ESLint + Prettier, `.env.example`, `CLAUDE.md`, `git init` + `gh repo create`, open VS Code.
- Design tokens editor (colors, fonts, spacing, radius) generates the theme file.
- Data model editor (later): entities and fields generate TypeScript types, Supabase tables and basic CRUD.
- Screen generator: new screen file + navigation entry + chosen snippets.
- **Done when:** a new Expo app runs on the emulator with your theme, from one click.

### 7. Docs guide (Haiku)

- Local docs library: Arduino reference, ESP32 Arduino core, PlatformIO, Ultralytics, OpenCV, Expo, React Native, Supabase, plus the handbook.
- Pipeline: chunk (title, heading, URL) → embed locally → hybrid search → top 5–8 chunks → Haiku.
- Haiku answers as cards: **Read this** (link), **Why** (1–2 lines), **Apply it** (hint for your code). JSON output.
- Hint ladder: 1 point to docs, 2 bigger hint, 3 tiny snippet — you choose to escalate.
- Context: filters by project type; can attach current file or error text.
- Cache: same question + same chunks = saved answer, no call.
- **Done when:** a question returns a correct link card in under 3 seconds and logs its cost.

### 8. Snippet library

- One folder per snippet: code, README (what, dependencies, `// CHANGE:` points), tags, live preview (UI) or test sketch (robotics).
- "Save to library" from anywhere (hotkey quick-capture to an inbox); browse links to Uiverse, React Bits, 21st.dev, Random Nerd Tutorials.
- Insert via VS Code extension at cursor.
- **Done when:** search finds a snippet by tag or words and inserts it in 2 clicks.

### 9. Error log

- Each fix saved as: error text, cause, fix, project, date.
- Same error again → shown first in search and in the docs guide.
- **Done when:** pasting a repeated error shows your old fix.

### 10. Run panel

- Start/stop dev server, emulator, PlatformIO build/upload, serial monitor and plotter in one window, with logs.
- **Done when:** you never need more than one terminal open.

### 11. Git helper and release

- Haiku writes the commit message from the diff (diff capped at about 4k tokens); one-click commit + push.
- Release (apps): version bump, changelog from commits, EAS build, icons and splash from one image.
- **Done when:** an APK build starts from one button.

### 12. Automations and weekly review

- Workflow runner: steps tagged `code` / `small-llm` / `big-llm`, run on triggers (time, file change, button), logged.
- Weekly review: code collects the journal and error log; one Haiku call writes the summary.
- Hub health: if a hub test fails, it opens Claude Code with the error and logs.
- **Done when:** a workflow runs on a schedule and its log shows each step.

## Data model and file formats

Everything the hub builds from lives in plain files, so adding a part or stack means adding one file.

**Hub folder**

```
hub/
  handbook/
    stacks/expo-supabase.md
    parts/hc-sr04.md
    boards/esp32-devkit.md
    notes/
  templates/
    robotics/esp32-arduino/
    apps/expo/
  snippets/
    ui/coverflow/  (code, README.md, tags.json, preview)
    motors/differential-turn/
  docs/            (downloaded docs, chunked)
  hub.db           (SQLite)
```

**Handbook chapter (part)**

```yaml
---
part: hc-sr04
category: sensor
library: none
pins:
  - { name: TRIG, mode: OUTPUT }
  - { name: ECHO, mode: INPUT, voltage: 5V }
power: { voltage: 5V, current_ma: 15 }
snippet: snippets/sensors/hc-sr04-read
warn: "ECHO is 5V, use a voltage divider on ESP32"
price_rm: [5, 10]
---
# HC-SR04 ultrasonic sensor
(readable chapter text)
```

**Handbook chapter (stack)**

```yaml
---
stack: expo-supabase
template: templates/apps/expo
packages: ["@supabase/supabase-js", "expo-router"]
env: [SUPABASE_URL, SUPABASE_ANON_KEY]
conflicts: [tauri]
---
```

**Board file:** pin list with capabilities (digital, PWM, ADC1/ADC2, input-only, strapping, voltage), PlatformIO board id, default `monitor_speed`.

**wiring.json** (per robotics project): board id, parts, and wires as `{part, partPin, boardPin, signalName}`.

**SQLite tables:** `projects`, `tasks`, `journal`, `errors`, `snippets`, `doc_chunks` (+ embeddings), `llm_calls` (feature, tokens in/out, cost, date), `cache`.

**Robotics project layout:** `platformio.ini`, `src/main.cpp`, `include/pins.h` (generated), `wiring.json`, `PARTS.md`, `CLAUDE.md`.

## Build roadmap

Build the parts you will use every day first; each phase only starts once its gate passes. Week counts are estimates for part-time work alongside FENG.

&#91;embedded content: build roadmap · 4 phases, 4 gates\]

**Order of Claude Code sessions** (one feature per session, fresh session each time)

1. Tauri + React shell talking to a FastAPI engine on localhost, with SQLite and the `CLAUDE.md` for the hub.
2. Projects, tasks, journal and launch buttons.
3. Snippet library with tags, search and quick-capture hotkey.
4. Error log, plus hybrid search (FTS5 + `bge-small`) shared by snippets, errors and docs.
5. Handbook loader: markdown + YAML setup blocks, read mode, PDF export.
6. Board files and the pin checker (conflicts, voltage, input-only, strapping).
7. Project cart, presets and the robotics wizard writing `platformio.ini`, `pins.h` and `main.cpp`.
8. Docs downloader and chunker, then the Haiku guide with cards, hint ladder, cache and cost logging.
9. App wizard (Expo first) with the design tokens editor.
10. Run panel and serial monitor/plotter.
11. Git helper with Haiku commit messages.
12. Wiring view, guide mode, release button, automations, VS Code extension.

**Tip:** after each session, ask Claude Code to add tests for what it built. A failing test is the hub's signal to call Claude Code again.

## Monthly API cost estimate

Normal use costs about **US$0.55 (about RM2.40) a month**, heavy use about US$1.75 (about RM7.70), and the hub stops all Haiku calls at a hard cap of **RM10 a month**.

**Pricing used:** Claude Haiku 5.5 at $0.10 per million input tokens and $0.50 per million output tokens, for prompts up to 100K tokens; above 100K every rate is 5× ([source](https://www.implicator.ai/claude-haiku-5-5-matches-gpt-6-luna-pricing/)). Claude Sonnet 5.5 is $2 / $10 and Opus 5.5 is $4 / $20 ([source](https://mixed-news.com/en/?p=35958)).

**Cost per call**

| Feature | Tokens in | Tokens out | Cost per call (USD) |
| --- | --- | --- | --- |
| Docs guide answer | 3,000 | 400 | 0.0005 |
| Commit message | 2,500 | 100 | 0.0003 |
| Parts / stack suggestion | 2,000 | 500 | 0.00045 |
| Weekly review | 15,000 | 1,000 | 0.002 |
| Search, handbook, wizards, wiring, pins.h, snippets, error log, run panel | 0 | 0 | 0 |

**Monthly scenarios (30 days, no cache hits counted)**

| Scenario | Docs questions | Commits | Suggestions | Reviews | Total (USD) |
| --- | --- | --- | --- | --- | --- |
| Light | 10 a day | 5 a day | 4 a month | 4 | 0.21 |
| Normal | 30 a day | 10 a day | 10 a month | 4 | 0.55 |
| Heavy | 100 a day | 25 a day | 30 a month | 4 | 1.75 |

In ringgit (assuming about RM4.4 per US$1) that is roughly RM1 to RM8 a month. Cache hits lower it further.

**Models**

- The hub uses **Claude Haiku 5.5 only**. No Sonnet, Opus or other models are called with your API key.
- Claude Code, used to build and fix the hub, runs on your Claude subscription and is not counted in this budget.

**Hard cap: RM10 a month**

- The hub tracks spend in ringgit: each call's USD cost × an exchange rate you set in Settings (default 4.4, update it now and then).
- Before every call, the hub adds the call's worst-case cost to this month's spend. If that would pass RM10, the call is **blocked**, not sent.
- When blocked: the docs guide still shows search results and your error log (both free), commit messages fall back to a simple template, and suggestions are paused. Everything else in the hub keeps working.
- Warnings on the Home screen at RM7 (70%) and RM9 (90%). The counter resets on the 1st of each month.
- Backup limit in the Claude Console: set the monthly spend limit to about US$2.50, roughly RM11, in case the hub's own counter has a bug.
- Every prompt checked under 20K tokens before sending, far below the 100K price jump.
- Answer cache keyed on question + chunk ids, and at most one retry per call, so a bug cannot loop calls.
