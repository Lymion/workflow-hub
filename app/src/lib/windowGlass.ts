/** Frosted glass theme: the app window itself turns to acrylic, so the desktop wallpaper shows through, blurred.
 *  Only the desktop app can do this; in a browser the glass theme falls back to plain smoked glass. */
const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function applyWindowGlass(theme: string) {
  const root = document.documentElement;
  if (!inTauri()) { delete root.dataset.window; return; }
  try {
    const { getCurrentWindow, Effect } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (theme === "glass") {
      await w.setEffects({ effects: [Effect.Acrylic] });
      root.dataset.window = "acrylic"; // CSS lets the window show through only once the effect is on
    } else {
      delete root.dataset.window;
      await w.clearEffects();
    }
  } catch {
    delete root.dataset.window; // older Windows or no permission: smoked glass without the wallpaper
  }
}
