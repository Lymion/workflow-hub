# Changelog

Each update the Windows installer delivers has a higher version, so it installs over the old one as an upgrade. Your data in `%LOCALAPPDATA%\Workflow Hub` is kept.

## 0.4.0

- **New Wiring tab:** your board and parts drawn at an angle on a drawing-board bench, with the real wires from your project.
  - **Board view** explains the board with callout cards (USB, chip, pin rows, buttons). Hover any pin to see what it can do and what's wired to it.
  - **Project view** places every part around the board, with no overlaps, and shows its wires and name tags.
  - **Move a wire:** click it, then click the pin you want; pins.h updates. The grouped pin picker still works in the Wires panel.
  - **Controls:** turn (buttons or drag), zoom, labels, animated current flow, and a schematic of the signal wires.
  - **Side panel:** Overview (board facts, warnings, parts), Pinout, Wires (rename signals, pick pins, checks, copy pin table) and pins.h.
  - **All four boards** (ESP32 DevKit V1, ESP32-C3 Super Mini, Arduino Uno, Arduino Nano) and 15 parts have 3D models. They live in the board files and handbook chapters, so new ones need data, not code.

## 0.3.0

- **Automatic updates:** when a new version is out, a banner offers **Install and restart**; one click downloads it, checks its signature, installs and reopens the app. **Settings → Updates** shows your version and checks on demand.
- This is the last version you install by hand.

## 0.2.0

- **Docs page:** official doc sites (Arduino, ESP32 Arduino core, PlatformIO, Expo, React Native, Supabase, Next.js, Tauri) read live in a hub window. **Find pages** searches them online for free and one small Haiku call picks the best 3-5 pages. Save any page for Ask docs.
- **New project** shows the docs for the board or stack you pick.
- **Docs bar** on every project: the docs for its board, parts and stack, updated as you add parts.
- The Supabase starter snippet now ships with the app.

## 0.1.0

- First Windows installer: roadmap sessions 1-12, Start menu app with a bundled engine (no Python needed).
