---
stack: expo
kind: framework
glyph: EX
color: '#4F46E5'
template: templates/apps/expo
packages:
- expo
- expo-router
env: []
conflicts:
- nextjs
- tauri
good_for: Phone apps for Android and iOS from one codebase. Test instantly on your phone with Expo Go.
watch_out: Custom native modules need a dev build.
scaffold: npx create-expo-app@latest {name} --template default
docs:
- title: Expo docs
  url: https://docs.expo.dev/
- title: "Expo · Tutorial"
  url: https://docs.expo.dev/tutorial/introduction/
---
# Expo (React Native)

React Native with batteries included: routing, OTA updates, EAS builds.

## Start
`npx create-expo-app@latest` then `npx expo start` and scan the QR code with Expo Go.
