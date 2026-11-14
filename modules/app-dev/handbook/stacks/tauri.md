---
stack: tauri
kind: framework
glyph: TA
color: '#E8A33D'
template: templates/apps/tauri
packages:
- '@tauri-apps/api'
env: []
conflicts:
- expo
- nextjs
good_for: Small, fast desktop apps for Windows, macOS and Linux, with a web UI and a Rust core.
watch_out: Needs the Rust toolchain installed.
scaffold: npm create tauri-app@latest {name} -- --template react-ts --manager npm --yes
---
# Tauri

Desktop apps with a web front end and a Rust back end; installers are a few MB.
