/** Open documentation: hub pages by hash, web pages in a hub window (desktop app) or a new tab (browser). */
import { api } from "./api";

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Read a doc page inside the hub. The docs window shows the live site; it gets no access to the hub itself. */
export async function openDoc(url: string, title = "Docs") {
  if (url.startsWith("#")) {
    location.hash = url;
    return;
  }
  if (!inTauri()) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const old = await WebviewWindow.getByLabel("docs");
  if (old) await old.close();
  new WebviewWindow("docs", { url, title: `${title} · Workflow Hub docs`, width: 1100, height: 820, minWidth: 600, minHeight: 400, focus: true });
}

/** Open a web page in the default browser. */
export async function openInBrowser(url: string) {
  if (!inTauri()) {
    window.open(url, "_blank", "noopener");
    return;
  }
  await api.post("/open-url", { url });
}

export const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
