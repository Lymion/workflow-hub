/** Design tokens. Source of truth: scratch/SPEC.md + scratch/scratch.html
 *  (UI UX Pro Max "Apple Native Experience" base, Emil Kowalski motion curves).
 *  Colours are CSS variables (see src/styles.css) so light and dark mode switch together. */
const v = (name) => `var(--${name})`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        sidebar: v("sidebar"),
        surface: { DEFAULT: v("surface"), solid: v("surface-solid") },
        fill: { DEFAULT: v("fill"), strong: v("fill-strong") },
        label: { DEFAULT: v("label"), 2: v("label-2"), 3: v("label-3") },
        sep: v("sep"),
        accent: { DEFAULT: v("accent"), hover: v("accent-hover"), text: v("accent-text"), tint: v("accent-tint"), on: v("on-accent") },
        robotics: { DEFAULT: v("robotics"), text: v("robotics-text"), tint: v("robotics-tint") },
        appdev: { DEFAULT: v("appdev"), text: v("appdev-text"), tint: v("appdev-tint") },
        good: { DEFAULT: v("green"), text: v("green-text"), tint: v("green-tint") },
        warn: { DEFAULT: v("amber"), text: v("amber-text"), tint: v("amber-tint") },
        bad: { DEFAULT: v("red"), text: v("red-text"), tint: v("red-tint") },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "BlinkMacSystemFont", '"Segoe UI Variable Text"', '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ["ui-monospace", '"SF Mono"', '"Cascadia Code"', "Consolas", "monospace"],
      },
      fontSize: { base: ["14px", "1.45"] },
      borderRadius: { s: "8px", md: "12px", lg: "16px" },
      boxShadow: {
        hl: v("hl"),
        card: "var(--hl), var(--shadow-1)",
        pop: "var(--hl), var(--shadow-2)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(.23,1,.32,1)",
        drawer: "cubic-bezier(.32,.72,0,1)",
      },
      backdropBlur: { glass: "24px" },
    },
  },
  plugins: [],
};
