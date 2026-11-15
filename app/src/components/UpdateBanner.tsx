/** "A new version is ready" banner with one-click install. Checks once, a few seconds after the app opens. */
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { checkForUpdate, installUpdate, useUpdate } from "../lib/updater";

const retry = async () => {
  await checkForUpdate();
  await installUpdate();
};

let checkedThisSession = false;

export function UpdateBanner() {
  const u = useUpdate();
  const [later, setLater] = useState(false);
  useEffect(() => {
    if (checkedThisSession || u.status !== "idle") return;
    const t = setTimeout(() => {
      if (checkedThisSession) return;
      checkedThisSession = true; // set when the check runs, so a remount can't cancel it
      checkForUpdate();
    }, 3000);
    return () => clearTimeout(t);
  }, [u.status]);

  if (later && u.status === "available") return null;
  if (u.status !== "available" && u.status !== "downloading" && u.status !== "installing" && !(u.status === "error" && u.version)) return null;
  const busy = u.status === "downloading" || u.status === "installing";
  return (
    <div className="update-banner rise" role="status">
      <span className="tile tile-sm update-tile"><Icon name="download" /></span>
      <div className="flex-1 min-w-0">
        <b className="block text-[14px]">
          {u.status === "installing" ? `Installing version ${u.version}… the app will reopen` : u.status === "error" ? u.message : `Version ${u.version} is ready`}
        </b>
        {"notes" in u && u.notes && u.status !== "error" && <span className="block text-xs text-label-2 truncate" title={u.notes}>{u.notes}</span>}
        {u.status === "downloading" && <span className="update-bar" aria-label="Download progress"><span style={{ transform: `scaleX(${u.progress})` }} /></span>}
      </div>
      {!busy && <button className="btn btn-ghost btn-sm" onClick={() => setLater(true)}>Later</button>}
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={u.status === "error" ? retry : installUpdate}>
        {u.status === "downloading" ? `Downloading ${Math.round(u.progress * 100)}%` : u.status === "installing" ? "Installing…" : u.status === "error" ? "Try again" : "Install and restart"}
      </button>
    </div>
  );
}

/** Settings: current version and a manual check. */
export function UpdatesSection({ version }: { version?: string }) {
  const u = useUpdate();
  const line =
    u.status === "unsupported" ? "Updates install from the desktop app." :
    u.status === "checking" ? "Checking…" :
    u.status === "none" ? "You have the latest version." :
    u.status === "available" ? `Version ${u.version} is ready. Use the banner at the top to install it.` :
    u.status === "downloading" || u.status === "installing" ? `Installing version ${u.version}…` :
    u.status === "error" ? u.message : "The app checks for a new version each time it opens.";
  return (
    <section className="card p-5 grid gap-3">
      <div className="flex items-center gap-3">
        <h2 className="flex-1">Updates</h2>
        <button className="btn btn-tinted" disabled={u.status === "unsupported" || u.status === "checking"} onClick={() => checkForUpdate()}><Icon name="refresh" />Check now</button>
      </div>
      <p className="text-[13px] text-label-2">Workflow Hub {version ? `version ${version}` : ""}. {line} Your projects, snippets and settings stay when it updates.</p>
    </section>
  );
}
