# Changelog

Each update the Windows installer delivers has a higher version, so it installs over the old one as an upgrade. Your data in `%LOCALAPPDATA%\Workflow Hub` is kept.

## 0.4.0

- **New Wiring tab in real 3D:** your board and parts on a drawing-board bench, with the real wires from your project as cables in space.
  - **Free camera:** drag to orbit, right-drag to move, scroll or pinch to zoom. Buttons turn the bench by 90°, zoom, and jump to an angled, top or front view.
  - **Click any part** (or its name tag) for a close-up: the camera flies to it, the other parts fade, and every pin is labelled with the board pin it goes to and its signal name. **Back to bench** returns to where you were.
  - **Board view** explains the board with callout cards (USB, chip, pin rows, buttons). Hover any pin to see what it can do and what's wired to it.
  - **Project view** places every part around the board without overlaps. Name tags never cover a part or another tag, at any angle or zoom.
  - **Move a wire:** click it, then click the pin you want; pins.h updates. The pin picker works in the Wires panel and in a part's pin list.
  - **Side panel:** Overview (board facts, warnings, parts, or the selected part's pins), Pinout, Wires and pins.h.
  - **All four boards** and 15 parts have 3D models, kept as data in the board files and handbook chapters. Computers without WebGL get the flat angled drawing instead.
- **I²C pins stay free for I²C parts:** new wires no longer land on SDA/SCL (GPIO 21/22 on the ESP32) unless nothing else is free. A plain signal already on a bus pin gets its own warning that says where to move it; I²C parts sharing the bus are fine.

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
