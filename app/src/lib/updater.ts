/** App updates: check GitHub Releases once per session, download, stop the engine, install, restart. Desktop app only. */
import { useSyncExternalStore } from "react";

export type UpdateState =
  | { status: "idle" | "checking" | "none" | "unsupported" }
  | { status: "available"; version: string; notes: string }
  | { status: "downloading"; version: string; notes: string; progress: number }
  | { status: "installing"; version: string; notes: string }
  | { status: "error"; message: string; version?: string; notes?: string };

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let state: UpdateState = { status: inTauri() ? "idle" : "unsupported" };
let pending: { download: (cb: (e: DownloadEvent) => void) => Promise<void>; install: () => Promise<void>; version: string; body?: string } | null = null;
type DownloadEvent = { event: "Started"; data: { contentLength?: number } } | { event: "Progress"; data: { chunkLength: number } } | { event: "Finished" };
const listeners = new Set<() => void>();
const set = (s: UpdateState) => {
  state = s;
  listeners.forEach((l) => l());
};

export const useUpdate = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);

/** Release notes from the changelog: first lines, without markdown. */
export const shortNotes = (body = "") =>
  body.split("\n").map((l) => l.replace(/^[-*#\s]+/, "").replace(/\*\*/g, "").trim()).filter(Boolean).slice(0, 3).join(" · ");

export async function checkForUpdate(): Promise<UpdateState> {
  if (!inTauri()) return state;
  if (state.status === "checking" || state.status === "downloading" || state.status === "installing") return state;
  set({ status: "checking" });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const u = await check();
    if (!u) {
      set({ status: "none" });
    } else {
      pending = u as unknown as typeof pending;
      set({ status: "available", version: u.version, notes: shortNotes(u.body) });
    }
  } catch {
    set({ status: "error", message: "Couldn't check for updates. Check your internet connection; the app works as is." });
  }
  return state;
}

export async function installUpdate() {
  if (!pending || state.status !== "available") return;
  const { version, notes } = state;
  let total = 0;
  let got = 0;
  set({ status: "downloading", version, notes, progress: 0 });
  try {
    await pending.download((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      if (e.event === "Progress") {
        got += e.data.chunkLength;
        set({ status: "downloading", version, notes, progress: total ? Math.min(1, got / total) : 0 });
      }
    });
    set({ status: "installing", version, notes });
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_engine"); // so the installer can replace engine.exe
    await pending.install(); // on Windows the app closes here and the installer reopens it
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    set({ status: "error", version, notes, message: "The update didn't install. Try again, or download the installer from the Releases page on GitHub." });
  }
}
