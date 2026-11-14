# Workflow Hub — core screens
Goal: desktop project workshop for makers; plan, set up and remember everything around the code (code itself lives in VS Code).
Screens/routes: #home, #new, #handbook (cart panel open), #project (Rover-01: Tasks, Wiring, Parts tabs)
States: empty | loading | error | full

Layout (every screen)
- sidebar: translucent; search/Ctrl+K, nav (Home, Projects, Handbook, Library), recent projects, engine status, monthly spend mini-meter, theme toggle
- main: toolbar (title + ONE primary action), content
- right panel (optional): Project cart on #handbook

Components
- #home: greeting/date, primary "New project"; today-tasks (cross-project, checkable, completion celebration + progress bar); recent-projects (last 5, filter by module)
- sidebar spend meter: segmented by feature; hover/focus shows breakdown (RM this month vs RM10 cap, per-feature, cache savings)
- #new (one page): project name + folder preview; type toggle (App development / Robotics, one per module); preset chips; tick tiles grouped per module (App: Framework, Backend, Extras — Expo-only extras disable for other frameworks; Robotics: Board, Motion, Sensors, Power and display); hover/focus tooltip per tile (Good for / Watch out / price); live checks; sticky bar with summary + RM estimate + primary "Create project" (disabled with a one-line reason)
- #handbook: toc (App stacks / Electronics parts / My notes, search); chapter (HC-SR04: facts chips, 5V warning callout, pins table, "Add to project"); cart panel (preset, board slot, parts with qty, checks with one-line fixes, total RM, primary "Create project")
- #project: header (icon, name, board, folder, git), primary "Open in VS Code", More menu (Arduino IDE, terminal, Claude Code); segmented tabs: Tasks (To do / Doing / Done board), Wiring (board diagram + pin table + AUTO-GENERATED pins.h preview), Parts (table, status, total RM)
- global: Ctrl+K command bar, toasts

States
- empty: first launch, no projects / no modules / empty cart / no tasks — each with one clear next step
- loading: skeletons ("Reading modules/…")
- error: one-line "what's wrong + how to fix" (engine offline on :8765, bad module.yaml, bad chapter YAML, project folder missing)
- full: sample data below

Data (sample)
- Projects: Rover-01 (Robotics, ESP32 DevKit V1, 6/14 tasks, 12 min ago); Kedai (App, Expo + Supabase, 9/22, 2 h ago); Plant monitor (Robotics, ESP32-C3, 3/8, yesterday); Habit streaks (App, Expo, 11/12, 3 days ago); Line follower (Robotics, Nano, 7/7, last week)
- Today: "Add 1k/2k divider on ECHO" (Rover-01), "Calibrate HC-SR04 offset" (Rover-01), "Wire Supabase auth into login" (Kedai), "Fix splash flicker on Android" (Kedai, overdue), "Water-level reading drifts" (Plant monitor)
- Spend (Nov): RM1.71 of RM10 — docs answers 612 calls RM1.35, commit messages 241 RM0.32, suggestions 9 RM0.02, weekly review 2 RM0.02; cache saved 188 calls
- Rover-01 wiring: L298N ENA/IN1/IN2 → GPIO 25/26/27, ENB/IN3/IN4 → GPIO 14/32/33, HC-SR04 TRIG/ECHO → GPIO 19/18 (ECHO 5V warning), SG90 → GPIO 12 (strapping pin error; fix → GPIO 13)
- Rover-01 parts: ESP32 DevKit V1 RM25, L298N RM9, 2× TT motor RM12, HC-SR04 RM6, SG90 RM7, 18650 2S holder + BMS RM14, 1k/2k resistors RM1 → RM74

Actions
- New project → #new; pick type → enables Continue → #handbook
- Task checkbox → done (strike, count updates)
- Filter chips → filter recent projects by module
- Add to project → part added to cart + toast
- Check "Fix" → moves servo to GPIO 13, check turns green, Create enabled
- Open in VS Code → toast (fake); More → popover
- Ctrl+K → command bar; Esc closes
- Retry / Reload → toast (fake)

Style source: no app yet → UI UX Pro Max "Apple Native Experience" style row (system font, semantic adaptive colours, 8pt spacing, 10–16px radii, 150–300ms motion, reduced-motion fallbacks); Emil curves (--ease-out .23,1,.32,1; --ease-drawer .32,.72,0,1). Spec depth rules: 1px top inner highlight, two-layer shadow (contact + ambient), translucent surfaces with backdrop blur. One accent (#0071E3) + per-module colours (Robotics orange, App dev indigo) for cheerfulness. Light + dark from day one.
Decisions (simplest option): system font over the generator's Plus Jakarta Sans (spec says system font); desktop targets ≥32px (pointer UI), primary buttons 36px.
Open questions: none blocking. Library route is a stub (session 3).
