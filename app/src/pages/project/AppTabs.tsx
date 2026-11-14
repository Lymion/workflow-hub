/** Session 9: app stack picker (New project), Stack tab (setup, packages, screens), Design tokens tab. */
import { useEffect, useMemo, useState } from "react";
import { api, notifyChanged, useLoad } from "../../lib/api";
import { Icon } from "../../components/Icon";
import { TileGrid, type TileItem } from "../../components/Tiles";
import { Check, Empty, Sk } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { PickerProps } from "../NewProject";
import type { TabProps } from "./tabs";

export type StackItem = { key: string; title: string; path: string; category: string; good_for: string; watch_out: string; meta: Record<string, any> };
type Finding = { level: "ok" | "warn" | "bad"; part: string; problem: string; fix: string };
type Preset = { preset: string; name: string; stack?: string[] };
type Job = { state: "running" | "done" | "failed"; log: string[]; result: { steps: { step: string; ok: boolean; note?: string }[] } | null; error: string };
type Setup = { available: boolean; items: { id: string; label: string; ok: boolean | null; fix: string }[]; files: { file: string; exists: boolean; owned: boolean }[]; job: Job | null };

const GROUPS: { kind: string; title: string; hint: string; single: boolean }[] = [
  { kind: "framework", title: "Framework", hint: "Pick one. Expo for phone apps, Next.js for web, Tauri for desktop.", single: true },
  { kind: "backend", title: "Data", hint: "Optional. Where the app keeps its data.", single: true },
  { kind: "extra", title: "Extras", hint: "Optional. Add as many as you like.", single: false },
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function useStackItems(module: string) {
  return useLoad(() => api.get<StackItem[]>(`/handbook/items?part=${module}&section=stacks`), [module], { live: false });
}

function tile(it: StackItem, fw: string | undefined): TileItem {
  const only = it.meta.only as string | undefined;
  return {
    id: it.key, name: it.title, sub: it.good_for.split(".")[0], glyph: it.meta.glyph ?? it.title.slice(0, 2).toUpperCase(),
    color: it.meta.color ?? "#64748B", good: it.good_for, watch: it.watch_out,
    disabled: only && fw && only !== fw ? `Works with ${cap(only)} only. Switch the framework to use it.` : undefined,
  };
}

/** Live stack checks: one line per finding, what is wrong and how to fix it. */
function useStackChecks(module: string, stack: string[]) {
  const [findings, setFindings] = useState<Finding[]>([]);
  useEffect(() => {
    if (!stack.length) return setFindings([]);
    const h = setTimeout(() => {
      api.post<{ findings: Finding[] }>(`/modules/${module}/checks/stack`, { stack }).then((r) => setFindings(r.findings)).catch(() => setFindings([]));
    }, 120);
    return () => clearTimeout(h);
  }, [module, stack.join()]);
  return findings;
}

export function StackPicker({ module, value, onChange }: PickerProps) {
  const items = useStackItems(module.id);
  const presets = useLoad(() => api.get<Preset[]>(`/presets?module=${module.id}`), [module.id], { live: false });
  const stack = (value.stack as string[]) ?? [];
  const list = items.data ?? [];
  const fw = list.find((i) => stack.includes(i.key) && i.meta.kind === "framework")?.key;
  const findings = useStackChecks(module.id, stack);

  const set = (next: string[]) => onChange({ ...value, stack: next, stackTitles: next.map((k) => list.find((i) => i.key === k)?.title ?? k) });
  const toggle = (kind: string, single: boolean, id: string) => {
    const inKind = new Set(list.filter((i) => i.meta.kind === kind).map((i) => i.key));
    let next = stack.includes(id) ? stack.filter((k) => k !== id) : single ? [...stack.filter((k) => !inKind.has(k)), id] : [...stack, id];
    if (kind === "framework") {
      // drop extras that only work with another framework
      const newFw = next.find((k) => inKind.has(k));
      next = next.filter((k) => { const o = list.find((i) => i.key === k)?.meta.only; return !o || o === newFw; });
    }
    set(next);
  };

  if (items.loading) return <div className="ktiles mt-6"><Sk h={60} r={12} /><Sk h={60} r={12} /><Sk h={60} r={12} /></div>;
  if (!list.length) return null;
  return (
    <div className="rise">
      {(presets.data ?? []).some((p) => p.stack) && (
        <div className="flex flex-wrap items-center gap-2 mt-6">
          <span className="text-xs text-label-2">Start from</span>
          {presets.data!.filter((p) => p.stack).map((p) => <button key={p.preset} className="fchip" onClick={() => set(p.stack!)}>{p.name}</button>)}
        </div>
      )}
      {GROUPS.map((g) => {
        const group = list.filter((i) => i.meta.kind === g.kind);
        if (!group.length) return null;
        return (
          <section key={g.kind} className="kgroup">
            <div className="gh"><h3>{g.title}</h3><span>{g.hint}</span></div>
            <TileGrid label={g.title} single={g.single} items={group.map((i) => tile(i, fw))} selected={new Set(stack)} onToggle={(id) => toggle(g.kind, g.single, id)} />
          </section>
        );
      })}
      {findings.length > 0 && (
        <div className="mt-6 grid gap-2 max-w-[640px]" aria-live="polite">
          {findings.filter((f) => f.level !== "ok" || f.part === "Stack").slice(0, 4).map((f, i) => <Check key={i} level={f.level}><b>{f.part}</b> {f.problem}. {f.fix}</Check>)}
        </div>
      )}
    </div>
  );
}

export const STACK_PICKER = {
  Picker: StackPicker,
  ready: (v: Record<string, unknown>) => (((v.stack as string[]) ?? []).length ? "" : "Pick a framework to continue."),
  summary: (v: Record<string, unknown>): [string, string] => {
    const t = (v.stackTitles as string[]) ?? [];
    return [t[0] ?? "No framework", t.length > 1 ? `with ${t.slice(1).join(", ")}` : "Starter files now; scaffold and installs from the Stack tab"];
  },
};

// ---------------- Stack tab ----------------

export function StackTab({ project, reload }: TabProps) {
  const toast = useToast();
  const items = useStackItems(project.module);
  const list = items.data ?? [];
  const chosen = project.stack.map((k) => list.find((i) => i.key === k)).filter(Boolean) as StackItem[];
  const findings = useStackChecks(project.module, project.stack);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({ stack: project.stack });
  useEffect(() => setDraft({ stack: project.stack }), [project.stack.join()]);

  const packages = [...new Set(chosen.filter((c) => c.meta.kind !== "framework").flatMap((c) => (c.meta.packages as string[]) ?? []))];
  const env = [...new Set(chosen.flatMap((c) => (c.meta.env as string[]) ?? []))];

  const saveStack = async () => {
    try {
      await api.patch(`/projects/${project.id}`, { stack: draft.stack });
      toast("Stack saved. .env.example and the theme file are up to date.");
      setEditing(false);
      reload();
      notifyChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  return (
    <div className="grid gap-4">
      <section className="card p-5 grid gap-4">
        <div className="flex items-center gap-3">
          <h2 className="flex-1">Stack</h2>
          {editing ? (
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!((draft.stack as string[]) ?? []).length} onClick={saveStack}>Save stack</button>
            </>
          ) : (
            <button className="btn btn-tinted" onClick={() => setEditing(true)}>Change</button>
          )}
        </div>
        {items.loading ? <Sk h={44} r={10} /> : editing ? (
          <StackPicker module={{ id: project.module } as PickerProps["module"]} value={draft} onChange={setDraft} />
        ) : chosen.length === 0 ? (
          <Empty icon="layers" title="No stack yet" action={<button className="btn btn-primary" onClick={() => setEditing(true)}>Pick a stack</button>}>Pick a framework and extras. The hub writes the theme file and .env.example for you.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {chosen.map((c) => (
                <a key={c.key} href={`#handbook/${c.path}`} className="stack-chip" title={c.good_for}>
                  <span className="g" style={{ background: c.meta.color ?? "#64748B" }}>{c.meta.glyph}</span>{c.title}
                </a>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 text-[13px]">
              <div><span className="lbl">Packages</span><p className="font-mono text-[12.5px] mt-1 leading-relaxed">{packages.length ? packages.join("  ") : "Framework defaults only"}</p></div>
              <div><span className="lbl">Keys in .env</span><p className="font-mono text-[12.5px] mt-1 leading-relaxed">{env.length ? env.join("  ") : "None needed"}</p></div>
            </div>
            {findings.filter((f) => f.level !== "ok").map((f, i) => <Check key={i} level={f.level}><b>{f.part}</b> {f.problem}. {f.fix}</Check>)}
          </>
        )}
      </section>
      <AppSetupCard projectId={project.id} onDone={reload} />
      <ScreenCard projectId={project.id} />
    </div>
  );
}

function AppSetupCard({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const toast = useToast();
  const s = useLoad(() => api.get<Setup>(`/projects/${projectId}/setup`), [projectId]);
  const [opts, setOpts] = useState({ run_scaffold: true, run_install: true, run_git: true, run_github: false });
  const job = s.data?.job;
  const running = job?.state === "running";
  const scaffolded = s.data?.files.find((f) => f.file === "package.json")?.exists;

  // poll while the background job runs
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => s.reload(), 1000);
    return () => clearInterval(t);
  }, [running]);
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (running) setWasRunning(true);
    else if (wasRunning && job) {
      setWasRunning(false);
      const failed = job.result?.steps.filter((x) => !x.ok) ?? [];
      toast(job.state === "failed" ? `Setup stopped: ${job.error}` : failed.length ? `${failed[0].step} didn't finish. ${failed[0].note ?? ""}` : "App is set up. Open it in VS Code.", job.state === "failed" || failed.length ? "bad" : undefined);
      onDone();
      notifyChanged();
    }
  }, [running]);

  if (!s.data?.available) return null;
  const run = async () => {
    try {
      await api.post(`/projects/${projectId}/setup`, { ...opts, run_scaffold: opts.run_scaffold && !scaffolded, add_tasks: true });
      s.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const Opt = ({ k, label, hint }: { k: keyof typeof opts; label: string; hint: string }) => (
    <label className="opt">
      <input type="checkbox" checked={opts[k]} disabled={running} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
      <span><b>{label}</b><span className="block text-xs text-label-2">{hint}</span></span>
    </label>
  );
  return (
    <section className="card p-5 grid gap-4">
      <div className="flex items-center gap-3">
        <h2 className="flex-1">Set up the app</h2>
        <button className="btn btn-tinted" disabled={running} onClick={run}><Icon name={running ? "refresh" : "play"} className={running ? "spin" : ""} />{running ? "Working…" : scaffolded ? "Run setup again" : "Set up app"}</button>
      </div>
      <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
        {!scaffolded && <Opt k="run_scaffold" label="Create the app" hint="Runs the framework's create command. Takes a few minutes." />}
        <Opt k="run_install" label="Install stack packages" hint="npm install for your data and extras." />
        <Opt k="run_git" label="Git" hint="git init and a first commit, if there's no repo yet." />
        <Opt k="run_github" label="Push to GitHub" hint="Private repo with gh. Needs gh auth login first." />
      </div>
      {job && (job.log.length > 0 || job.error) && (
        <pre className="job-log" aria-live="polite">{[...job.log, job.error && `error: ${job.error}`].filter(Boolean).join("\n")}</pre>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-md:grid-cols-1 text-[13px]">
        {s.data.files.map((f) => (
          <div key={f.file} className="flex items-center gap-2"><Icon name={f.exists ? "check-c" : "x-c"} style={{ color: f.exists ? "var(--green)" : "var(--label-3)" }} /><span className="font-mono text-[12.5px]">{f.file}</span><span className="text-xs text-label-2">{f.owned ? "auto-generated" : f.exists ? "yours" : "not yet"}</span></div>
        ))}
      </div>
      <div className="grid gap-1.5">
        {s.data.items.map((i) => (
          <div key={i.id} className="flex items-start gap-2 text-[13px]">
            <Icon name={i.ok ? "check-c" : i.ok === false ? "alert" : "spark"} style={{ color: i.ok ? "var(--green)" : i.ok === false ? "var(--amber)" : "var(--label-2)", marginTop: 2 }} />
            <span><b>{i.label}</b>{i.fix && <span className="text-label-2"> · {i.fix}</span>}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScreenCard({ projectId }: { projectId: number }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const add = async () => {
    try {
      const r = await api.post<{ file: string }>(`/projects/${projectId}/screens`, { name });
      toast(`${r.file} created. It uses your theme tokens.`);
      setName("");
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <section className="card p-5 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[220px] grid gap-1.5">
        <label className="lbl" htmlFor="screen-name">New screen</label>
        <input id="screen-name" className="input" placeholder="e.g. Expense detail" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add()} />
        <span className="text-xs text-label-2">A new file in your routes folder, styled with the theme tokens. Existing files are never changed.</span>
      </div>
      <button className="btn" disabled={!name.trim()} onClick={add}><Icon name="plus" />Add screen</button>
    </section>
  );
}

// ---------------- Design tokens tab ----------------

type Tokens = { colors: { light: Record<string, string>; dark: Record<string, string> }; fonts: Record<string, string>; spacing: number[]; radius: Record<string, number> };
type TokensRes = { tokens: Tokens; defaults: Tokens; theme_file: string; theme: string };
const FONTS = ["System", "Inter", "SF Pro", "Roboto", "Poppins", "Nunito", "Menlo", "JetBrains Mono"];
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function TokensTab({ project }: TabProps) {
  const toast = useToast();
  const res = useLoad(() => api.get<TokensRes>(`/projects/${project.id}/tokens`), [project.id], { live: false });
  const [t, setT] = useState<Tokens | null>(null);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { if (res.data) setT(structuredClone(res.data.tokens)); }, [res.data]);
  const dirty = useMemo(() => !!t && !!res.data && JSON.stringify(t) !== JSON.stringify(res.data.tokens), [t, res.data]);
  const bad = t ? Object.entries(t.colors[mode]).filter(([, v]) => !HEX.test(v)).map(([k]) => k) : [];

  if (res.loading || (!t && !res.error)) return <div className="grid gap-3"><Sk h={260} r={16} /></div>;
  if (res.error || !t) return <div className="card"><Empty icon="alert" title="No design tokens">{res.error ?? "This project type has no theme file."}</Empty></div>;

  const setColor = (k: string, v: string) => setT({ ...t, colors: { ...t.colors, [mode]: { ...t.colors[mode], [k]: v } } });
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put<{ theme_file: string }>(`/projects/${project.id}/tokens`, t);
      toast(`Saved. ${r.theme_file} regenerated.`);
      res.reload();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setSaving(false);
    }
  };
  const c = t.colors[mode];

  return (
    <div className="tok-grid">
      <div className="grid gap-4 min-w-0">
        <section className="card p-5 grid gap-3">
          <div className="flex items-center gap-3">
            <h2 className="flex-1">Colours</h2>
            <div className="seg" role="tablist" aria-label="Colour mode">
              {(["light", "dark"] as const).map((m) => <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{cap(m)}</button>)}
            </div>
          </div>
          <div className="tok-colors">
            {Object.entries(c).map(([k, v]) => (
              <label key={k} className={`tok-color ${HEX.test(v) ? "" : "bad"}`}>
                <input type="color" value={HEX.test(v) ? v : "#000000"} onChange={(e) => setColor(k, e.target.value.toUpperCase())} aria-label={`${k} colour picker`} />
                <span className="min-w-0 flex-1"><b className="block text-[13px]">{cap(k)}</b>
                  <input className="hex" value={v} spellCheck={false} onChange={(e) => setColor(k, e.target.value.trim())} aria-label={`${k} hex value`} />
                </span>
              </label>
            ))}
          </div>
          {bad.length > 0 && <Check level="bad"><b>{bad.join(", ")}</b> isn't a colour. Use a hex value like #0071E3.</Check>}
        </section>
        <section className="card p-5 grid gap-4">
          <h2>Type, spacing and corners</h2>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            {Object.entries(t.fonts).map(([k, v]) => (
              <label key={k} className="grid gap-1.5"><span className="lbl">{cap(k)} font</span>
                <select className="input" value={v} onChange={(e) => setT({ ...t, fonts: { ...t.fonts, [k]: e.target.value } })}>
                  {[...new Set([v, ...FONTS])].map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="grid gap-1.5">
            <span className="lbl">Spacing scale (px)</span>
            <div className="flex flex-wrap gap-1.5">
              {t.spacing.map((s, i) => (
                <input key={i} className="input tok-num" type="number" min={0} max={256} value={s} aria-label={`Spacing step ${i}`}
                  onChange={(e) => setT({ ...t, spacing: t.spacing.map((x, j) => (j === i ? Math.max(0, Math.min(256, Number(e.target.value) || 0)) : x)) })} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            {Object.entries(t.radius).map(([k, v]) => (
              <label key={k} className="grid gap-1.5"><span className="lbl">Radius {k} · <span className="num">{v}px</span></span>
                <input type="range" min={0} max={32} value={v} onChange={(e) => setT({ ...t, radius: { ...t.radius, [k]: Number(e.target.value) } })} />
              </label>
            ))}
          </div>
        </section>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={() => setMore(!more)} aria-expanded={more}><Icon name={more ? "down" : "chev"} />{more ? "Hide" : "More"}: generated file</button>
          <span className="flex-1" />
          <button className="btn btn-ghost" onClick={() => setT(structuredClone(res.data!.defaults))}>Reset to defaults</button>
        </div>
        {more && (
          <div className="code-card">
            <div className="code-head"><Icon name="code" className="text-label-2" /><b className="flex-1 font-mono text-[12.5px]">{res.data!.theme_file}</b><span className="chip">auto-generated</span></div>
            <pre className="code max-h-[320px] overflow-auto">{res.data!.theme}</pre>
          </div>
        )}
      </div>
      <aside className="tok-side">
        <PhonePreview t={t} mode={mode} name={project.name} />
        <div className="np-bar !static">
          <div className="flex-1 min-w-0"><b className="block">{dirty ? "Unsaved changes" : "Saved"}</b><span className="text-xs text-label-2 truncate block">{res.data!.theme_file}</span></div>
          <button className="btn btn-primary" disabled={!dirty || saving || bad.length > 0} onClick={save}>{saving ? "Saving…" : "Save tokens"}</button>
        </div>
      </aside>
    </div>
  );
}

function PhonePreview({ t, mode, name }: { t: Tokens; mode: "light" | "dark"; name: string }) {
  const c = t.colors[mode];
  const sp = (i: number) => t.spacing[Math.min(i, t.spacing.length - 1)] ?? 0;
  const font = (f: string) => (f === "System" ? "system-ui, -apple-system, sans-serif" : `"${f}", system-ui, sans-serif`);
  const rows = [["Groceries", "RM42.10"], ["Petrol", "RM60.00"], ["Coffee", "RM9.50"]];
  return (
    <div className="phone" aria-label="Live preview" style={{ background: c.background, color: c.text, fontFamily: font(t.fonts.body) }}>
      <div className="phone-notch" />
      <div style={{ padding: sp(4) }}>
        <div style={{ fontSize: 12, color: c.muted }}>Today</div>
        <div style={{ fontFamily: font(t.fonts.heading), fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", marginBottom: sp(4) }}>{name}</div>
        <div style={{ background: c.surface, borderRadius: t.radius.lg, padding: sp(4), marginBottom: sp(3) }}>
          <div style={{ fontSize: 12, color: c.muted }}>Spent this week</div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: font(t.fonts.heading) }}>RM111.60</div>
          <div style={{ display: "flex", gap: sp(2), marginTop: sp(2) }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: c.success }}>▲ Under budget</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: c.warning }}>2 bills due</span>
          </div>
        </div>
        <div style={{ background: c.surface, borderRadius: t.radius.md, overflow: "hidden", marginBottom: sp(4) }}>
          {rows.map(([a, b], i) => (
            <div key={a} style={{ display: "flex", padding: `${sp(3)}px ${sp(4)}px`, fontSize: 14, borderTop: i ? `1px solid ${c.muted}22` : "none" }}>
              <span style={{ flex: 1 }}>{a}</span><span style={{ fontFamily: font(t.fonts.mono), color: c.muted }}>{b}</span>
            </div>
          ))}
        </div>
        <div style={{ background: c.primary, color: "#fff", borderRadius: t.radius.md, padding: sp(3), textAlign: "center", fontWeight: 600, fontSize: 15 }}>Add expense</div>
        <div style={{ color: c.danger, textAlign: "center", fontSize: 13, marginTop: sp(3), fontWeight: 500 }}>Delete account</div>
      </div>
    </div>
  );
}
