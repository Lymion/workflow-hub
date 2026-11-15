---
stack: sqlite
kind: backend
glyph: SQ
color: '#0F80CC'
packages:
- expo-sqlite
env: []
conflicts: []
good_for: Offline-first apps with no account or server. Data stays on the device.
watch_out: No sync between devices. In Next.js it runs on the server only.
docs:
- title: Expo SQLite
  url: https://docs.expo.dev/versions/latest/sdk/sqlite/
---
# Local SQLite

An on-device database. Great for trackers and tools that never need a server.
