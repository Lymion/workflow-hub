import { useEffect, useMemo, useState } from "react";
import { api, notifyChanged, useLoad } from "../../lib/api";
import { calm } from "../../lib/router";
import { Icon } from "../../components/Icon";
import { TileGrid, type TileItem } from "../../components/Tiles";
import { Check, Empty, Sk } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { TabProps } from "./tabs";

type Part = { id: number; key: string; qty: number; status: "need" | "ordered" | "have"; title: string; path: string | null; section: string; meta: Record<string, any>; unit_rm: number; cost_rm: number };
type Parts = { parts: Part[]; totals: { total: number; need: number; ordered: number; have: number } };
type Item = { key: string; title: string; section: string; category: string; price_rm: number[] | null; good_for: string; watch_out: string; meta: Record<string, any> };
type Finding = { level: "ok" | "warn" | "bad"; part: string; problem: string; fix: string };
type Preset = { preset: string; name: string; board: string; parts: { key: string; qty: number }[] };
type Setup = { available: boolean; items: { id: string; label: string; ok: boolean | null; fix: string }[]; files: { file: string; exists: boolean; owned: boolean }[] };

const ST: Record<Part["status"], [string, string]> = { need: ["chip-bad", "Need"], ordered: ["chip-warn", "Ordered"], have: ["chip-ok", "In hand"] };
const NEXT: Record<Part["status"], Part["status"]> = { need: "ordered", ordered: "have", have: "need" };
const CAT_TITLES: Record<string, string> = { driver: "Motors and drivers", actuator: "Motors and drivers", sensor: "Sensors", power: "Power", display: "Display and controls", output: "Display and controls", input: "Display and controls", passive: "Wiring and passives" };
const rm = (n: number) => `RM${Math.round(n * 100) / 100}`;

export function PartsTab({ project, reload }: TabProps) {
  const toast = useToast();
  const parts = useLoad(() => api.get<Parts>(`/projects/${project.id}/parts`), [project.id]);
  const catalog = useLoad(() => api.get<Item[]>(`/handbook/items?part=${project.module}&section=parts`), [project.module], { live: false });
  const presets = useLoad(() => api.get<Preset[]>(`/presets?module=${project.module}`), [project.module], { live: false });
  const [sel, setSel] = useState<Map<string, number>>(new Map());
  const [findings, setFindings] = useState<Finding[]>([]);
  const [flash, setFlash] = useState<string[]>([]);
  const rows = parts.data?.parts ?? [];
  const t = parts.data?.totals;

  // live checks for project parts + current selection
  useEffect(() => {
    if (!project.board) return setFindings([]);
    const merged = new Map<string, number>();
    rows.filter((p) => p.section !== "boards").forEach((p) => merged.set(p.key, p.qty));
    sel.forEach((q, k) => merged.set(k, (merged.get(k) ?? 0) + q));
    const h = setTimeout(() => {
      api.post<{ findings: Finding[] }>("/checks", { board: project.board, parts: [...merged].map(([key, qty]) => ({ key, qty })) })
        .then((r) => setFindings(r.findings.filter((f) => sel.size === 0 || f.level !== "ok" || [...sel.keys()].some((k) => f.part.toLowerCase().includes(k.split("-")[0])))))
        .catch(() => setFindings([]));
    }, 150);
    return () => clearTimeout(h);
  }, [rows.map((r) => r.key + r.qty).join(), [...sel].join(), project.board]);

  const groups = useMemo(() => {
    const g = new Map<string, TileItem[]>();
    for (const it of catalog.data ?? []) {
      const title = CAT_TITLES[it.category] ?? "Other";
      const inP = rows.find((r) => r.key === it.key);
      const lo = it.price_rm?.[0];
      if (!g.has(title)) g.set(title, []);
      g.get(title)!.push({ id: it.key, name: it.title, sub: `${it.meta.power?.voltage && it.meta.power.voltage !== "-" ? it.meta.power.voltage : it.category}${lo != null ? ` · RM${lo}` : ""}`, glyph: it.meta.glyph ?? it.title.slice(0, 2).toUpperCase(), color: it.meta.color ?? "#64748B", good: it.good_for, watch: it.watch_out, price: lo != null ? `RM${lo}` : undefined, badge: inP ? `In project ×${inP.qty}` : undefined });
    }
    const order = ["Motors and drivers", "Sensors", "Power", "Display and controls", "Wiring and passives", "Other"];
    return [...g].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [catalog.data, rows]);

  const patch = async (p: Part, body: Partial<Part>) => {
    parts.setData(await api.patch<Parts>(`/project-parts/${p.id}`, body));
    notifyChanged();
  };
  const remove = async (p: Part) => {
    await api.del(`/project-parts/${p.id}`);
    toast(`${p.title} removed from ${project.name}.`);
    parts.reload();
  };
  const addSelection = async () => {
    const items = [...sel].map(([key, qty]) => ({ key, qty }));
    const cost = items.reduce((s, i) => s + ((catalog.data?.find((c) => c.key === i.key)?.price_rm?.[0] ?? 0) * i.qty), 0);
    try {
      parts.setData(await api.post<Parts>(`/projects/${project.id}/parts`, { items }));
      setFlash(items.map((i) => i.key));
      setSel(new Map());
      toast(`Added ${items.length} component${items.length > 1 ? "s" : ""} to ${project.name}. ${rm(cost)} more to buy. pins.h updated.`);
      notifyChanged();
      if (!calm()) document.querySelector(".parts-table")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const applyPreset = async (pr: Preset) => {
    parts.setData(await api.post<Parts>(`/projects/${project.id}/presets/${pr.preset}`));
    toast(`${pr.name} parts added. Wiring and pins.h updated.`);
    notifyChanged();
  };

  if (parts.loading) return <div className="grid gap-4"><Sk h={90} r={16} /><Sk h={200} r={16} /></div>;
  const selTotal = [...sel].reduce((s, [k, q]) => s + (catalog.data?.find((c) => c.key === k)?.price_rm?.[0] ?? 0) * q, 0);

  return (
    <div className="grid gap-4">
      {t && t.total > 0 && (
        <div className="card p-5">
          <div className="cost-row">
            <div><span className="lbl">Estimated total</span><b className="num">{rm(t.total)}</b></div>
            <div><span className="lbl"><i className="dot" style={{ background: "var(--green)" }} />In hand</span><b className="num">{rm(t.have)}</b></div>
            <div><span className="lbl"><i className="dot" style={{ background: "var(--amber)" }} />Ordered</span><b className="num">{rm(t.ordered)}</b></div>
            <div><span className="lbl"><i className="dot" style={{ background: "var(--red)" }} />Still to buy</span><b className="num">{rm(t.need)}</b></div>
          </div>
          <div className="cost-bar" aria-hidden="true"><i style={{ flexGrow: t.have, background: "var(--green)" }} /><i style={{ flexGrow: t.ordered, background: "var(--amber)" }} /><i style={{ flexGrow: t.need, background: "var(--red)" }} /></div>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="card"><Empty icon="bag" title="No parts listed">Tick components below, or start from a preset. Prices and order status show here.</Empty></div>
      ) : (
        <div className="card overflow-hidden parts-table">
          <table className="tbl">
            <thead><tr><th>Part</th><th>Qty</th><th>Status</th><th className="!text-right">Price</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={flash.includes(p.key) ? "row-flash" : ""}>
                  <td>{p.path ? <a href={`#handbook/${p.path}`} className="font-medium hover:text-accent-text">{p.title}</a> : p.title}</td>
                  <td>{p.section === "boards" ? "1" : <span className="qty"><button aria-label={`Fewer ${p.title}`} onClick={() => p.qty > 1 && patch(p, { qty: p.qty - 1 })}>−</button><output>{p.qty}</output><button aria-label={`More ${p.title}`} onClick={() => patch(p, { qty: p.qty + 1 })}>+</button></span>}</td>
                  <td><button className={`chip ${ST[p.status][0]} cursor-pointer`} title="Click to change status" onClick={() => patch(p, { status: NEXT[p.status] })}>{ST[p.status][1]}</button></td>
                  <td className="num text-right">{rm(p.cost_rm)}</td>
                  <td className="text-right">{p.section !== "boards" && <button className="btn btn-ghost btn-sm !px-2" aria-label={`Remove ${p.title}`} onClick={() => remove(p)}><Icon name="x" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-2">
        <div className="flex flex-wrap items-baseline gap-2.5"><h2>Add components</h2><span className="text-xs text-label-2">Tick what you need, then add them to {project.name}. Hover a tile for what it's good for.</span></div>
        {(presets.data ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3"><span className="text-xs text-label-2">Start from</span>{presets.data!.map((pr) => <button key={pr.preset} className="fchip" onClick={() => applyPreset(pr)}>{pr.name}</button>)}</div>
        )}
        <div className="ap-grid">
          <div>
            {catalog.loading ? <Sk h={200} r={12} className="mt-4" /> : groups.map(([title, items]) => (
              <div key={title} className="kgroup">
                <div className="gh"><h3>{title}</h3></div>
                <TileGrid label={title} items={items} selected={new Set(sel.keys())} onToggle={(id) => { const m = new Map(sel); m.has(id) ? m.delete(id) : m.set(id, 1); setSel(m); }} />
              </div>
            ))}
          </div>
          <aside className="sel-win" aria-label="Selected components">
            <div className="flex items-center justify-between"><h3>Selected</h3><span className="chip num">{sel.size}</span></div>
            <div className="sw-list">
              {sel.size === 0 ? <p className="text-xs text-label-2 py-2 leading-relaxed">Nothing selected yet. Tick components on the left and they collect here.</p> : [...sel].map(([k, q]) => {
                const it = catalog.data?.find((c) => c.key === k);
                return (
                  <div key={k} className="sw-item">
                    <span className="g" style={{ background: it?.meta.color ?? "#64748B" }}>{it?.meta.glyph ?? "?"}</span>
                    <span className="flex-1 min-w-0"><b className="block truncate text-[13px]">{it?.title ?? k}</b><span className="text-xs text-label-2 num">{rm((it?.price_rm?.[0] ?? 0) * q)}</span></span>
                    <span className="qty"><button aria-label="Fewer" onClick={() => setSel(new Map(sel).set(k, Math.max(1, q - 1)))}>−</button><output>{q}</output><button aria-label="More" onClick={() => setSel(new Map(sel).set(k, q + 1))}>+</button></span>
                    <button className="btn btn-ghost btn-sm !px-2" aria-label={`Remove ${it?.title} from selection`} onClick={() => { const m = new Map(sel); m.delete(k); setSel(m); }}><Icon name="x" /></button>
                  </div>
                );
              })}
            </div>
            {findings.filter((f) => f.level !== "ok" || sel.size > 0).slice(0, 4).map((f, i) => <Check key={i} level={f.level}><b>{f.part}</b> {f.problem}. {f.fix}</Check>)}
            <div className="sw-foot">
              <div className="flex-1"><span className="text-xs text-label-2">Adds to the total</span><b className="block text-lg num">{rm(selTotal)}</b></div>
              <button className="btn btn-primary" disabled={sel.size === 0} onClick={addSelection}>Add to project</button>
            </div>
          </aside>
        </div>
      </section>
      <SetupCard projectId={project.id} onDone={reload} />
    </div>
  );
}

function SetupCard({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const toast = useToast();
  const s = useLoad(() => api.get<Setup>(`/projects/${projectId}/setup`), [projectId]);
  const [busy, setBusy] = useState(false);
  if (!s.data?.available) return null;
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ files: { file: string; status: string }[]; steps: { step: string; ok: boolean | null; note?: string }[]; tasks_added: string[] }>(`/projects/${projectId}/setup`, { run_pio: true, run_git: true });
      const wrote = r.files.filter((f) => f.status === "wrote").length;
      const skipped = r.files.filter((f) => f.status === "skipped").map((f) => f.file);
      toast(skipped.length ? `${skipped.join(", ")} kept: it's your file (no AUTO-GENERATED header).` : `Project files up to date (${wrote} rewritten). ${r.tasks_added.length ? `${r.tasks_added.length} setup tasks added.` : ""}`);
      s.reload();
      onDone();
      notifyChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card p-5 grid gap-3 mt-2">
      <div className="flex items-center gap-3"><h2 className="flex-1">Project files and tools</h2><button className="btn btn-tinted" disabled={busy} onClick={run}><Icon name="refresh" />{busy ? "Setting up…" : "Run setup again"}</button></div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-md:grid-cols-1 text-[13px]">
        {s.data.files.map((f) => (
          <div key={f.file} className="flex items-center gap-2"><Icon name={f.exists ? "check-c" : "x-c"} style={{ color: f.exists ? "var(--green)" : "var(--label-3)" }} /><span className="font-mono text-[12.5px]">{f.file}</span><span className="text-xs text-label-2">{f.file === "src/main.cpp" ? "yours" : f.owned ? "auto-generated" : f.exists ? "yours (kept)" : "missing"}</span></div>
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
