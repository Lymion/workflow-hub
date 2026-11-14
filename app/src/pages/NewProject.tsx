import { useEffect, useRef, useState } from "react";
import { api, notifyChanged, useLoad } from "../lib/api";
import { go } from "../lib/router";

import { TileGrid, type TileItem } from "../components/Tiles";
import { Check } from "../components/ui";

export type Board = { board: string; name: string; glyph: string; color: string; price_rm: number; logic_voltage: number; wireless: string[]; good_for: string; watch_out: string; module: string; pio_board: string };
export const boardTile = (b: Board): TileItem => ({ id: b.board, name: b.name, sub: `${b.wireless.length ? "Wi-Fi + BLE" : "No wireless"} · ${b.logic_voltage}V · RM${b.price_rm}`, glyph: b.glyph, color: b.color, good: b.good_for, watch: b.watch_out, price: `RM${b.price_rm}` });

/** Module-specific pickers below the type toggle. Session 9 adds the app stack picker. */
export type PickerProps = { module: Module; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void };
export const PICKERS: Record<string, { Picker: (p: PickerProps) => JSX.Element | null; ready: (v: Record<string, unknown>) => string; summary: (v: Record<string, unknown>) => [string, string] }> = {};

function BoardPicker({ module, value, onChange }: PickerProps) {
  const boards = useLoad(() => api.get<Board[]>("/boards"), [], { live: false });
  const list = (boards.data ?? []).filter((b) => b.module === module.id);
  if (boards.loading) return <div className="ktiles mt-6"><Sk h={60} r={12} /><Sk h={60} r={12} /></div>;
  if (!list.length) return null;
  return (
    <section className="kgroup rise">
      <div className="gh"><h3>Board</h3><span>Pick one. Add motors, sensors and power later in the project's Parts tab.</span></div>
      <TileGrid label="Board" single items={list.map(boardTile)} selected={new Set(value.board ? [String(value.board)] : [])} onToggle={(id) => onChange({ ...value, board: id, boardInfo: list.find((b) => b.board === id) })} />
    </section>
  );
}
PICKERS.board = {
  Picker: BoardPicker,
  ready: (v) => (v.board ? "" : "Pick a board to continue."),
  summary: (v) => { const b = v.boardInfo as Board | undefined; return [b ? b.name : "No board", b ? `RM${b.price_rm} board · add parts after creating` : ""]; },
};
import { Icon, ModuleTile } from "../components/Icon";
import { Banner, Empty, PageHead, Sk, slugify } from "../components/ui";
import { useToast } from "../components/Toast";

export type Module = { id: string; name: string; icon: string; color: string; tagline: string; cart_slots: string[]; project_tabs: string[]; launch: string[]; run: string[] };
export type ModulesResponse = { modules: Module[]; disabled: string[]; errors: { folder: string; file: string; message: string }[] };

/** Segmented control with a sliding pill (transform only). */
export function TypeToggle({ modules, value, onChange }: { modules: Module[]; value: string; onChange: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-id="${value}"]`);
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, modules]);
  return (
    <div
      ref={ref}
      className="kind"
      role="radiogroup"
      aria-label="Project type"
      onKeyDown={(e) => {
        if (!/Arrow(Left|Right)/.test(e.key)) return;
        e.preventDefault();
        const i = modules.findIndex((m) => m.id === value);
        const n = modules[(i + (e.key === "ArrowRight" ? 1 : modules.length - 1)) % modules.length];
        onChange(n.id);
        ref.current?.querySelector<HTMLButtonElement>(`[data-id="${n.id}"]`)?.focus();
      }}
    >
      <span className="kpill" aria-hidden="true" style={{ width: pill.w, transform: `translateX(${pill.x}px)` }} />
      {modules.map((m) => (
        <button key={m.id} role="radio" aria-checked={m.id === value} data-id={m.id} tabIndex={m.id === value ? 0 : -1} onClick={() => onChange(m.id)}>
          <ModuleTile module={m} size="sm" />
          {m.name}
        </button>
      ))}
    </div>
  );
}

export function NewProject() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api.get<ModulesResponse>("/modules"), [], { live: false });
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const modules = data?.modules ?? [];
  useEffect(() => {
    if (!kind && modules.length) setKind(modules.find((m) => m.id === "robotics")?.id ?? modules[0].id);
  }, [modules, kind]);
  const mod = modules.find((m) => m.id === kind);
  const [creating, setCreating] = useState(false);
  const [picks, setPicks] = useState<Record<string, unknown>>({});
  useEffect(() => setPicks({}), [kind]);
  const slots = (mod?.cart_slots ?? []).filter((s) => PICKERS[s]);
  const why = !name.trim() ? "Add a project name." : slots.map((s) => PICKERS[s].ready(picks)).find(Boolean) ?? "";
  const summary = slots.length ? PICKERS[slots[0]].summary(picks) : [mod?.name ?? "", ""];
  const extraPayload = () => ({ board: picks.board ?? null, stack: (picks.stack as string[]) ?? [] });
  const create = async () => {
    if (!name.trim() || !mod) return;
    setCreating(true);
    try {
      const p = await api.post<{ id: number; name: string; path: string }>("/projects", { name, module: mod.id, ...extraPayload() });
      toast(`${p.name} created in ${p.path}.`);
      notifyChanged();
      go(`#project/${p.id}`);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow={
          <a href="#home" className="inline-flex items-center gap-0.5">
            <Icon name="left" className="!w-3.5 !h-3.5" />
            Home
          </a>
        }
        title="New project"
      />
      {data?.errors.map((e) => (
        <div key={e.file} className="mb-[18px]">
          <Banner action={<button className="btn btn-sm" onClick={reload}><Icon name="refresh" />Reload</button>}>{e.message}</Banner>
        </div>
      ))}
      {loading && (
        <div className="grid gap-3">
          <Sk w={90} h={12} />
          <Sk h={46} r={10} />
          <p className="text-label-2 text-xs">Reading modules/…</p>
        </div>
      )}
      {!loading && error && <p className="text-label-2">Project types load from the engine.</p>}
      {!loading && !error && modules.length === 0 && (
        <div className="card">
          <Empty icon="package" title="No project types yet" action={<button className="btn" onClick={reload}><Icon name="refresh" />Reload</button>}>
            Add a folder with a <span className="font-mono">module.yaml</span> inside <span className="font-mono">modules/</span>, then reload.
          </Empty>
        </div>
      )}
      {modules.length > 0 && (
        <div className="np-top rise" style={{ ["--d" as string]: "30ms" }}>
          <div className="flex flex-col gap-1.5">
            <label className="lbl" htmlFor="pname">Project name</label>
            <input id="pname" className="input input-lg" placeholder="e.g. Rover-02" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            <div className="text-[12.5px] text-label-2">
              Saved to <span className="font-mono">~/projects/{slugify(name || "untitled")}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="lbl">Type</span>
            <TypeToggle modules={modules} value={kind} onChange={setKind} />
            {mod?.tagline && <span className="text-xs text-label-2 max-w-[420px]">{mod.tagline}</span>}
          </div>
        </div>
      )}
      {mod && slots.map((s) => { const P = PICKERS[s].Picker; return <P key={s + mod.id} module={mod} value={picks} onChange={setPicks} />; })}
      {mod && slots.includes("board") && picks.board ? (
        <div className="mt-6 max-w-[640px]"><Check level="ok"><b>Parts</b> come next: add motors, sensors and power in the project's Parts tab, with checks and costs.</Check></div>
      ) : null}
      {modules.length > 0 && (
        <div className="np-bar mt-8">
          <div className="flex-1 min-w-0">
            <b className="block truncate">{name.trim() ? `${name.trim()} · ${summary[0]}` : "Name your project"}</b>
            <span className={`text-xs ${why ? "text-bad-text font-medium" : "text-label-2"}`}>{why || summary[1]}</span>
          </div>
          <button className="btn btn-primary" disabled={!!why || creating} onClick={create}>
            {creating ? "Creating…" : "Create project"}
          </button>
        </div>
      )}
    </>
  );
}
