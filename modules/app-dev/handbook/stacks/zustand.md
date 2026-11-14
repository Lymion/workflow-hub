---
stack: zustand
kind: extra
glyph: ZU
color: '#8B5A2B'
packages:
- zustand
env: []
conflicts: []
good_for: Shared app state in a few lines, without Redux boilerplate.
watch_out: Not a data-fetching cache.
---
# Zustand

`const useStore = create((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) }))`
