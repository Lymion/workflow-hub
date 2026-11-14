---
stack: nextjs
kind: framework
glyph: NX
color: '#1D1D1F'
template: templates/apps/nextjs
packages:
- next
- react
- react-dom
env: []
conflicts:
- expo
- tauri
good_for: 'Websites and web apps that need fast pages and SEO: dashboards, stores, landing pages.'
watch_out: Not for offline phone apps.
scaffold: npx create-next-app@latest {name} --ts --eslint --app --src-dir --use-npm --yes
---
# Next.js

React framework for the web with server rendering and API routes.
