---
name: "ui-elevate"
description: "Elevate an existing UI in focused passes (unslop, hierarchy, delight, style, nav, search) with precise motion rules and a chosen style; works alongside UI UX Pro Max when installed."
---

# UI Elevate

Turn a working-but-generic UI ("AI slop" dashboards, admin panels, desktop apps) into something polished by improving it in **separate, focused passes** instead of one giant rewrite. Each pass has one goal, gets shown to the user, then the next pass builds on it.

## Working with UI UX Pro Max

If the `ui-ux-pro-max` skill is installed (usually in Claude Code), use both:
- **UI UX Pro Max** supplies the design data: style tokens (80 styles), palettes, font pairings, and its accessibility / pre-delivery checklist. In Pass 3, run its style search for the chosen style (e.g. `"glassmorphism dark" --domain style`) and use those tokens instead of the presets below.
- **This skill** supplies what it doesn't have: the pass-by-pass elevation workflow, the delight tricks in Pass 2, the content/nav/search cleanup in Passes 4–6, and the motion rules below.
- **UI UX Pro Max takes priority.** Whenever the two disagree (a number, a rule, a style token, an accessibility check), follow UI UX Pro Max. Use this skill only to fill gaps it doesn't cover, and stay consistent across the app.

If UI UX Pro Max isn't installed, use the style presets in this skill.

## Step 0 — Pick a style

If the user hasn't said, ask once (multiple choice) which style to use. Default to **Clean Light** if they don't care.

| Option | Best for |
|---|---|
| 1. Frosted Glass | Desktop apps, macOS/Windows 11 feel, over a wallpaper or photo |
| 2. Dark Mode | Dev tools, dashboards, night use, media apps |
| 3. Clean Light (warm minimal) | SaaS, finance, productivity — calm and readable |
| 4. Brutalist | Portfolios, indie tools, bold personality |
| 5. Soft / Playful | Consumer apps, learning apps, mascots, kids/teens |

The user can combine (e.g. "Glass + Dark"). Also ask whether they want all passes or just some; default is all, in order.

## The passes

Do them in this order. After each pass, show the result (screenshot or preview) and say in one line what changed.

### Pass 1 — Hierarchy & grouping (best practices)
Start by running the **Unslop checklist** below, then:
- One clear focal point per screen: the most important number/action is the biggest and highest-contrast.
- Group elements **by relationship** (things used together sit together, inside a shared card or section).
- Spacing scale (4/8/12/16/24/32/48) — more space *between* groups than *within* them.
- Type scale with max ~4 sizes; use weight and color (muted secondary text) before size.
- Align to a grid; consistent card radius and padding.
- Remove decoration that carries no information (extra borders, random colors, gradients on everything).

### Pass 2 — Delight (micro-interactions)
- Find the **primary CTA**. On hover, change its label to something that feels like a win (e.g. "Send invoices" → "Collect $6,420") — use real data from the screen.
- Animate its icon with a short looping transition (e.g. paper plane flies off and returns, 600–900 ms, ease-out).
- Subtle hover lift on cards (translateY(-1px), soft shadow), 150–200 ms transitions.
- Number count-up on load for key stats; chart draws in once.
- Always respect `prefers-reduced-motion` — disable loops and count-ups.
- Apply the **Motion rules** section below to every animation added in this pass.

### Pass 3 — Apply the chosen style
Use the style recipe below. Apply to app shell first, then panels, then layered elements (popovers, modals, dropdowns).

### Pass 4 — Clean up content hierarchy
- Fold unimportant or rarely used content into **accordions/collapsible sections** (collapsed by default).
- Order sections by **order of operations** — what the user does first goes on top.
- Cut duplicate info; one place for each fact.

### Pass 5 — Navigation
- If the side nav is overwhelming, fold related items into groups with small uppercase **group labels**.
- Keep icons on every nav item for scannability (one icon set, same stroke width).
- Move rarely used items (Settings, Help) to the bottom.

### Pass 6 — Search
- If the search bar is big and overbearing, shrink it into a small search widget tucked into the top nav.
- Don't add keyboard-shortcut labels or a command palette unless the app already has them or the user asks.

## Unslop checklist

Run in Pass 1 and re-check before finishing. Items marked **(UX Max)** are already covered by UI UX Pro Max — when it's installed, follow its rule; the short note here is the fallback.

**Cut the slop**
1. **Delete filler badges** — "New", "AI", "Beta", "Pro", "✨" pills that don't mean anything real.
2. **Drop redundant labels** — if the value explains itself (an email, a date, a $ amount under a clear heading), remove the label above it.
3. **Unitalicize random words** — no italic or gradient text for emphasis on random words in headlines; emphasis comes from weight or size, and rarely.
4. **Mono only where needed** — monospace only for code, IDs, keys and terminal output, not for labels or headings for "tech vibes".
5. **Remove embellishments** — decorative glows, gradient borders, background blobs, sparkle icons and drop shadows on everything. Keep only what the chosen style needs.

**Make it real**
6. **Show the actual product** — real screenshots, real UI or real data instead of abstract illustrations, stock 3D shapes or placeholder charts.
7. **Make headlines specific** — say what it does for whom ("Send invoices and get paid in 2 days"), not vague hype ("Supercharge your workflow").
8. **Enlarge the main feature** — the thing the product is about gets the most space; secondary features get smaller tiles, not equal-size cards. (Relates to UX Max `visual-hierarchy`.)
9. **Emphasize the CTA** — one clear primary button per screen, everything else secondary. **(UX Max `primary-action`)**

**Visual system**
10. **Use a design system** — tokens for colour, type, spacing, radius; no one-off values. **(UX Max `color-semantic` / `--design-system`)**
11. **Add one accent colour** — a neutral base plus a single accent used for the CTA, active states and key data. Not a rainbow.
12. **Keep icons consistent** — one icon set, same stroke width and size tokens. **(UX Max `icon-style-consistent`)**
13. **Inner radius = outer radius − padding** — a card with 16px radius and 8px padding holds children with 8px radius, so corners look concentric.
14. **Group with spacing** — tighter space within groups, more between them, before reaching for borders or boxes. **(UX Max `whitespace-balance`)**

**Typography & details**
15. **Improve text contrast** — body text ≥ 4.5:1; no light-grey-on-white body copy. **(UX Max `color-contrast`)**
16. **Wrap headlines properly** — `text-wrap: balance` on headings, no single orphan word on the last line. **(UX Max `heading-line-balance`)**
17. **Align by eye, not pixels** — optically adjust things that look off even when mathematically centred: play icons nudged right, icons beside text, round shapes slightly larger than square ones.
18. **Use tabular numbers** — `font-variant-numeric: tabular-nums` for prices, stats, tables and timers. **(UX Max `number-tabular`)**
19. **Add loading states** — skeletons for content, spinner/disabled state on buttons during async work. **(UX Max `loading-buttons`, `progressive-loading`)**
20. **Animate useful feedback** — animation should confirm something happened (saved, copied, sent, error), not decorate. Follow the Motion rules below. **(UX Max `scale-feedback`, tap feedback)**

## Motion rules

Use these for every animation, in any pass. Animate only `transform`, `opacity`, `filter` and `clip-path` (never width/height/top/left).

**Easing & timing**
1. Entrances use **ease-out** (fast start, gentle stop), e.g. `cubic-bezier(0.22, 1, 0.36, 1)`.
2. Elements moving from one spot to another on screen use **ease-in-out**.
3. Dropdowns, menus and popovers: **150–250 ms**.
4. Exits are shorter than the matching entrance: **~60–70% of the entrance duration** (UI UX Pro Max's `exit-faster-than-enter`), e.g. 250 ms in → 160 ms out.
5. **No bounce/overshoot on everyday UI** (menus, modals, buttons, toasts). Save springs with overshoot for rare, playful moments.

**Where things come from**
6. Popovers, dropdowns and modals **enter from their trigger**: set `transform-origin` to the button that opened them.
7. They also **exit back to the trigger** (same origin, reversed).
8. Popovers start at **scale 0.95** + opacity 0 (never from scale 0).

**Press & drag feedback**
9. Buttons/cards **scale to 0.97 on press**, back to 1 on release.
10. **Don't tween while held**: during a drag or press-and-hold, the element follows the pointer 1:1 with no transition; animate only on release.
11. Moving knobs (toggle switches, sliders) **stretch ~12%** in the direction of travel while moving, then settle back.
12. **Rubber-band past bounds**: dragging/scrolling beyond the edge moves with increasing resistance, then springs back on release.

**Lists & sequencing**
13. Stagger list rows by **~30 ms** each (cap the total so long lists don't drag).
14. **Stagger as details settle**: main container first, then its inner content (title → meta → actions) a few ms apart.
15. **Overlap old and new states**: start the new state fading in before the old one has finished leaving — no blank gap between them.

**Specific effects**
16. Objects travelling across the screen (e.g. item flying into a cart) move along an **arc**, not a straight line.
17. **Pulse to confirm success**: a single quick scale pulse (1 → 1.05 → 1) or glow on the element when an action succeeds.
18. Use **masks / clip-path for reveals and colour changes** (wipe a new colour or content in) instead of plain fades when the change should feel physical.
19. **Crossfade icons with blur**: when an icon swaps (copy → check, play → pause), crossfade them with a short blur (~2–4 px) and slight scale on both.
20. **Shared element transitions**: when an element moves between layouts (tab indicator, card → detail view), reuse the same element (Framer Motion `layoutId`, View Transitions API `view-transition-name`, or GSAP Flip) so it morphs instead of jumping.

All of the above switch to instant or a simple fade when `prefers-reduced-motion: reduce` is set.

## Style recipes

### 1. Frosted Glass
Glass only works with something interesting behind it — add a wallpaper, photo, or soft gradient blobs as the app background.
```css
:root { --glass-bg: rgba(255,255,255,0.10); --glass-border: rgba(255,255,255,0.18); --text: #f5f5f7; --muted: rgba(245,245,247,0.65); }
.app { background: url(wallpaper.jpg) center/cover; }
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid var(--glass-border);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 32px rgba(0,0,0,0.25);
  border-radius: 16px;
}
.glass .glass { background: rgba(255,255,255,0.06); backdrop-filter: none; } /* nested: don't double-blur */
@supports not (backdrop-filter: blur(1px)) { .glass { background: rgba(30,30,35,0.85); } }
```
Rules: background should *seep through subtly*, not compete. Check text contrast over the brightest part of the background (≥ 4.5:1); add a dark tint layer if needed. Popovers/modals get stronger blur and a slightly more opaque fill. Light-glass variant: `rgba(255,255,255,0.55)` with dark text.

### 2. Dark Mode
```css
:root { --bg: #0b0b0f; --surface: #15151b; --surface-2: #1d1d25; --border: rgba(255,255,255,0.08); --text: #ededf0; --muted: #9a9aa6; --accent: #7c6cff; }
```
Rules: never pure black + pure white — use near-black and off-white. Show elevation with **lighter surfaces**, not shadows. Desaturate accent colors slightly; keep one accent. Charts use a lighter line + soft glow. Support both via `prefers-color-scheme` and a toggle if the app has light mode too.

### 3. Clean Light (warm minimal)
```css
:root { --bg: #f7f5f0; --surface: #ffffff; --border: #e8e4dc; --text: #1a1a1a; --muted: #77736b; --accent: #e8643c; }
```
Rules: warm off-white page, white cards, hairline borders, almost no shadow. Black primary button, one warm accent for charts and highlights. Generous whitespace.

### 4. Brutalist
```css
:root { --bg: #fffef5; --text: #000; --accent: #ff4d00; --border: 2px solid #000; }
.card { border: var(--border); box-shadow: 4px 4px 0 #000; border-radius: 0; }
```
Rules: thick black borders, hard offset shadows, monospace or grotesk type, big bold numbers, flat bright accent. Hover = shadow shrinks (button "presses").

### 5. Soft / Playful
```css
:root { --bg: #fdf7ff; --surface: #ffffff; --text: #2b2340; --muted: #8a80a3; --accent: #8b5cf6; --accent-2: #fbbf24; }
.card { border-radius: 24px; box-shadow: 0 10px 30px rgba(139,92,246,0.12); }
```
Rules: big radii, pastel tints, rounded font (e.g. Nunito, Quicksand), bouncy springs on interaction (but still respect reduced motion), friendly copy and empty-state illustrations.

## Rules for every pass
- Keep functionality and data exactly the same — only change design.
- Change one thing per pass; don't sneak in later passes early.
- Work in the existing stack (React/Tailwind/plain CSS/Electron/etc.). In Tailwind, put tokens in the theme config instead of hard-coding values.
- Check accessibility at the end: contrast, focus rings visible in every style, keyboard nav for accordions and search.
- Re-check the Unslop checklist on the final result.
- Finish with a short list of what each pass changed.