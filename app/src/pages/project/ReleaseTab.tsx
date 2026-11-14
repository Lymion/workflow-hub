/** Session 12: release button for apps. Version bump, changelog from commits, icons from one image, build. */
import { useEffect, useRef, useState } from "react";
import { api, ENGINE, notifyChanged, useLoad } from "../../lib/api";
import { go } from "../../lib/router";
import { burst } from "../../lib/celebrate";
import { Icon } from "../../components/Icon";
import { Check, Empty, Sk } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { TabProps } from "./tabs";

type Plan = {
  version: string; versionCode: number; background: string; next: Record<"patch" | "minor" | "major", string>;
  last_tag: string | null; commits: string[]; changelog: string; framework: string | null;
  checks: { level: "ok" | "warn" | "bad"; problem: string; fix: string }[];
  build: { id: string; label: string; available: boolean; fix: string; hint: string } | null; icons: Record<string, boolean>;
};
const BUMPS = [["patch", "Fixes"], ["minor", "New features"], ["major", "Big change"]] as const;

export function ReleaseTab({ project }: TabProps) {
  const toast = useToast();
  const plan = useLoad(() => api.get<Plan>(`/projects/${project.id}/release`), [project.id]);
  const p = plan.data;
  const [bump, setBump] = useState<"patch" | "minor" | "major">("patch");
  const [notes, setNotes] = useState("");
  const [build, setBuild] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bg, setBg] = useState("#ffffff");
  const [stamp, setStamp] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (p) { setNotes(p.changelog); setBg(p.background); } }, [p?.version, p?.changelog]);

  if (plan.loading) return <div className="grid gap-3"><Sk h={120} r={16} /><Sk h={260} r={16} /></div>;
  if (plan.error || !p) return <div className="card"><Empty icon="package" title="No release flow">{plan.error}</Empty></div>;

  const blocked = p.checks.some((c) => c.level === "bad");
  const canBuild = !!p.build?.available;
  const doRelease = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ version: string; tag: string | null; build: unknown }>(`/projects/${project.id}/release`, { bump, notes, build: build && canBuild });
      if (btn.current) burst(btn.current, 14, 38);
      toast(`Released v${r.version}${r.tag ? ` (tagged ${r.tag})` : ""}.${r.build ? " The build is running in the Run tab." : ""}`);
      notifyChanged();
      plan.reload();
      if (r.build) setTimeout(() => go(`#project/${project.id}/run`), 900);
    } catch (e) { toast((e as Error).message, "bad"); } finally { setBusy(false); }
  };
  const upload = async (f: File) => {
    if (f.size > 10_000_000) return toast("That image is over 10 MB. Use a 1024×1024 PNG.", "bad");
    const data = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); });
    try {
      const r = await api.post<{ files: { file: string; status: string }[] }>(`/projects/${project.id}/release/icons`, { image_base64: data, background: bg });
      const skipped = r.files.filter((x) => x.status === "skipped").map((x) => x.file);
      toast(skipped.length ? `Kept your ${skipped.join(", ")} (no AUTO-GENERATED mark). The rest are updated.` : "Icon, adaptive icon, splash and favicon made from your image.");
      setStamp(Date.now());
      plan.reload();
    } catch (e) { toast((e as Error).message, "bad"); }
  };

  return (
    <div className="rel-grid">
      <div className="grid gap-4 min-w-0">
        <section className="card p-5 grid gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-0">
              <span className="lbl">Now</span>
              <div className="rel-ver"><span className="num">v{p.version}</span><Icon name="chev" className="text-label-3" /><span className="num next">v{p.next[bump]}</span></div>
              <span className="text-xs text-label-2">{p.last_tag ? `${p.commits.length} commit${p.commits.length === 1 ? "" : "s"} since ${p.last_tag}` : `${p.commits.length} commit${p.commits.length === 1 ? "" : "s"} so far · first release`} · Android build {p.versionCode + 1}</span>
            </div>
            <div className="seg" role="radiogroup" aria-label="Version bump">
              {BUMPS.map(([k, label]) => <button key={k} role="radio" aria-checked={bump === k} className={bump === k ? "on" : ""} onClick={() => setBump(k)} title={`v${p.next[k]}`}>{label}</button>)}
            </div>
          </div>
          {p.checks.map((c, i) => <Check key={i} level={c.level}><b>{c.problem}.</b> {c.fix}</Check>)}
        </section>
        <section className="card p-5 grid gap-3">
          <label htmlFor="rel-notes" className="flex items-baseline gap-2"><h2 className="flex-1">What's new</h2><span className="text-xs text-label-2">Drafted from your commit messages. Edit freely.</span></label>
          <textarea id="rel-notes" className="input font-mono !text-[13px]" rows={9} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="### Added&#10;- …" />
          <span className="text-xs text-label-2">Goes into CHANGELOG.md (hub file) under v{p.next[bump]}.</span>
        </section>
      </div>
      <aside className="grid gap-4 content-start">
        <section className="card p-5 grid gap-3">
          <h3>App icon and splash</h3>
          <div className="rel-icons">
            {Object.entries(p.icons).map(([name, has]) => (
              <figure key={name} className={`rel-icon ${name.replace(".png", "")}`}>
                <span className="frame" style={{ background: name === "icon.png" ? undefined : bg }}>{has ? <img alt={`${name} preview`} src={`${ENGINE}/projects/${project.id}/release/icon/${name}?t=${stamp || p.versionCode}`} /> : <Icon name="plus" className="text-label-3" />}</span>
                <figcaption>{name.replace(".png", "").replace("-", " ")}</figcaption>
              </figure>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[13px]"><input type="color" value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Icon background colour" className="rel-color" />Background</label>
            <span className="flex-1" />
            <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button className="btn" onClick={() => file.current?.click()}><Icon name="download" />Choose image</button>
          </div>
          <span className="text-xs text-label-2">One square image (1024×1024 is best) makes all four. Saved in assets/hub/{stamp ? " · just updated" : ""}.</span>
        </section>
        <section className="card p-5 grid gap-3">
          <label className="opt">
            <input type="checkbox" checked={build && canBuild} disabled={!canBuild} onChange={(e) => setBuild(e.target.checked)} />
            <span><b>Start {p.build?.label ?? "the build"} after</b><span className="block text-xs text-label-2">{canBuild ? p.build?.hint : p.build?.fix ?? "No build step for this stack."}</span></span>
          </label>
          <button ref={btn} className="btn btn-primary btn-lg" disabled={busy || blocked} onClick={doRelease}><Icon name="package" />{busy ? "Releasing…" : `Release v${p.next[bump]}`}</button>
          <span className="text-xs text-label-2 text-center">Writes release.json and CHANGELOG.md, commits, tags v{p.next[bump]}.</span>
        </section>
      </aside>
    </div>
  );
}
