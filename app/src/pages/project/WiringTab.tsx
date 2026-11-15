/** Wiring tab: the board and parts on an angled bench (Bench3D), with a side panel for the board, its pins,
 *  the wires and pins.h. Moving a wire (click it, then click a pin, or use the pin picker) saves wiring.json
 *  and regenerates pins.h. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, notifyChanged, useLoad } from "../../lib/api";
import { calm } from "../../lib/router";
import { Icon } from "../../components/Icon";
import { Empty, Sk } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { TabProps } from "./tabs";
import { Bench3D, wid, type BenchBoard, type BenchPart, type BenchWire, type Mode } from "./Bench3D";

type Wire = BenchWire;
type Board = BenchBoard & { logic_voltage?: number; max_pin_ma?: number; wireless?: string[]; good_for?: string; watch_out?: string };
type WiringRes = { wiring: { wires?: Wire[] }; pins_h: string; board: Board | null };
type Part = BenchPart;
type Finding = { level: "ok" | "warn" | "bad"; part: string; problem: string; fix: string; signal?: string; gpio?: string };
type Option = { id: string; label: string; level: "ok" | "warn" | "bad"; note: string; used_by: string | null; current: boolean };
type Tab = "overview" | "pinout" | "wires" | "code";

const COLORS = ["#FF9F0A", "#0A84FF", "#FFD60A", "#64D2FF", "#BF5AF2", "#30D158", "#5E5CE6", "#FF375F", "#FF453A", "#AC8E68", "#66D4CF", "#FF6482"];
const rank = { ok: 0, warn: 1, bad: 2 } as const;
const TABS: [Tab, string][] = [["overview", "Overview"], ["pinout", "Pinout"], ["wires", "Wires"], ["code", "pins.h"]];

export function WiringTab({ project }: TabProps) {
  const toast = useToast();
  const res = useLoad(() => api.get<WiringRes>(`/projects/${project.id}/wiring`), [project.id]);
  const partsRes = useLoad(() => api.get<{ parts: Part[] }>(`/projects/${project.id}/parts`), [project.id]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [pinsH, setPinsH] = useState("");
  const [changed, setChanged] = useState<string | null>(null);
  const [traced, setTraced] = useState<string | null>(null);
  const [selPart, setSelPart] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [mode, setMode] = useState<Mode | null>(null);
  const [picker, setPicker] = useState<{ w: Wire; el: HTMLElement; key: boolean } | null>(null);

  useEffect(() => {
    if (!res.data) return;
    setWires(res.data.wiring.wires ?? []);
    setPinsH(res.data.pins_h);
    setMode((m) => m ?? ((res.data!.wiring.wires ?? []).length ? "project" : "board"));
  }, [res.data]);
  const loadChecks = useCallback(() => api.get<{ findings: Finding[] }>(`/projects/${project.id}/checks`).then((r) => setFindings(r.findings)).catch(() => {}), [project.id]);
  useEffect(() => { loadChecks(); }, [loadChecks, res.data]);

  const board = res.data?.board ?? null;
  const parts = (partsRes.data?.parts ?? []).filter((p) => p.section !== "boards");
  const color = useMemo(() => Object.fromEntries(wires.map((w, i) => [wid(w), COLORS[i % COLORS.length]])), [wires.map(wid).join()]);
  const verdict = (w: Wire): Finding | undefined => findings.filter((f) => f.signal === w.signalName || (f.gpio && f.gpio === String(w.boardPin) && f.problem.startsWith("share"))).sort((a, b) => rank[b.level] - rank[a.level])[0];

  const save = async (next: Wire[], changedSig: string, msg: string) => {
    const prev = wires;
    setWires(next);
    try {
      const r = await api.put<WiringRes & { findings: Finding[] }>(`/projects/${project.id}/wiring`, { wires: next });
      setWires(r.wiring.wires ?? next);
      setPinsH(r.pins_h);
      setFindings(r.findings);
      setChanged(changedSig);
      setTimeout(() => setChanged(null), 1200);
      const bad = r.findings.find((f) => f.signal === changedSig && f.level === "bad");
      toast(bad ? `${changedSig}: ${bad.problem}. ${bad.fix}` : msg, bad ? "bad" : undefined);
      notifyChanged();
    } catch (e) {
      setWires(prev);
      toast((e as Error).message, "bad");
    }
  };
  const pinLabel = (id: string | null) => (id ? board?.pins.find((p) => p.id === String(id))?.label ?? id : "no pin");
  const move = (w: Wire, to: string) => {
    if (String(w.boardPin) === to) return;
    save(wires.map((x) => (wid(x) === wid(w) ? { ...x, boardPin: to } : x)), w.signalName, `${w.signalName} moved to ${pinLabel(to)}. pins.h updated.`);
  };
  const rename = (w: Wire, name: string) => {
    if (!name || name === w.signalName) return;
    save(wires.map((x) => (wid(x) === wid(w) ? { ...x, signalName: name } : x)), name, `Renamed to ${name}. pins.h updated.`);
  };
  const trace = (id: string | null) => { setTraced(id); if (id) { setTab("wires"); setSelPart(null); } };
  const pickPart = (id: string | null) => { setSelPart(id); if (id) { setTab("overview"); setTraced(null); } };
  const pickPin = (id: string | null) => { setPin(id); if (id) setTab("pinout"); };

  if (res.loading || partsRes.loading) return <div className="grid gap-3"><Sk h={420} r={20} /></div>;
  if (!board) return <div className="card"><Empty icon="cpu" title="No board yet" action={<a className="btn btn-primary" href={`#project/${project.id}/parts`}>Open Parts</a>}>Pick a board in the Parts tab, then wire it up here.</Empty></div>;

  const badCount = wires.filter((w) => verdict(w)?.level === "bad").length;
  const titleOf = (key: string) => parts.find((p) => p.key === key)?.title ?? key;
  const watch = findings.filter((f) => f.level !== "ok");

  return (
    <div className="wire-layout">
      <Bench3D board={board} parts={parts} wires={wires} color={color} bad={(w) => verdict(w)?.level === "bad"} mode={mode ?? "board"} setMode={setMode}
        traced={traced} setTraced={trace} selPart={selPart} setSelPart={pickPart} pin={pin} setPin={pickPin} onMove={move} />
      <aside className="wire-panel" aria-label="Wiring details">
        <div className="wp-tabs" role="tablist" aria-label="Wiring details">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}{id === "wires" && badCount ? <span className="wp-bad">{badCount}</span> : null}</button>)}
        </div>
        {tab === "overview" && (
          <div className="wp-body">
            <h2 className="wp-h">{board.name}</h2>
            {board.good_for && <p className="wp-p">{board.good_for}</p>}
            <div className="wp-facts">
              {board.logic_voltage ? <div className="wp-fact"><span className="fi"><Icon name="zap" /></span><span><b>{board.logic_voltage} V logic</b><span>{board.logic_voltage < 5 ? "Never feed 5 V into a pin; use a divider." : "5 V parts plug straight in."}</span></span></div> : null}
              {board.wireless?.length ? <div className="wp-fact"><span className="fi"><Icon name="globe" /></span><span><b>{board.wireless.map((x) => (x === "ble" ? "Bluetooth" : x === "wifi" ? "Wi-Fi" : x)).join(" + ")}</b><span>Built in, no extra parts.</span></span></div> : null}
              {board.max_pin_ma ? <div className="wp-fact"><span className="fi"><Icon name="cpu" /></span><span><b>{board.max_pin_ma} mA per pin</b><span>Drive motors and servos through a driver.</span></span></div> : null}
            </div>
            {watch.slice(0, 3).map((f, i) => <div key={i} className={`wp-watch ${f.level}`}><b>{f.part}</b> {f.problem}. {f.fix}</div>)}
            {!watch.length && board.watch_out && <div className="wp-watch warn"><b>Watch out</b> {board.watch_out}</div>}
            {parts.length > 0 && <h3 className="wp-sub">In this project</h3>}
            {parts.map((p) => {
              const n = wires.filter((w) => w.part === p.key && w.boardPin).length;
              const id = `${p.key}#1`;
              return (
                <button key={p.key} className={`wp-row ${selPart?.startsWith(`${p.key}#`) ? "sel" : ""}`} onClick={() => { setMode("project"); pickPart(selPart === id ? null : id); }}>
                  <span className="kd" style={{ background: p.meta.color ?? "#64748b" }} />
                  <span className="flex-1 min-w-0"><b className="block truncate">{p.title}{p.qty > 1 ? ` ×${p.qty}` : ""}</b></span>
                  <span className="text-xs text-label-2">{n ? `${n} wire${n > 1 ? "s" : ""}` : "no wires"}</span>
                </button>
              );
            })}
            {!parts.length && <p className="wp-p">No parts yet. <a className="text-accent-text font-medium" href={`#project/${project.id}/parts`}>Add parts</a> and they appear on the bench, wired to good pins.</p>}
          </div>
        )}
        {tab === "pinout" && (
          <div className="wp-body wp-scroll">
            <table className="wp-pins">
              <thead><tr><th>Pin</th><th>Can do</th><th>Wired to</th></tr></thead>
              <tbody>
                {board.pins.map((p) => {
                  const ws = wires.filter((w) => String(w.boardPin) === p.id);
                  return (
                    <tr key={p.id} className={pin === p.id ? "sel" : ""}>
                      <td><button onClick={() => pickPin(pin === p.id ? null : p.id)}>{p.label}</button></td>
                      <td>{(p.caps ?? []).filter((c) => c !== "digital").join(", ")}{p.strapping ? <span className="cap warn">boot</span> : null}{p.reserved ? <span className="cap warn">{p.reserved}</span> : null}</td>
                      <td>{ws.length ? ws.map((w) => <span key={wid(w)} className="block"><span className="kd" style={{ background: color[wid(w)] }} />{w.signalName}</span>) : <span className="text-label-3">free</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {tab === "wires" && (
          <div className="wp-body">
            {!wires.length && <p className="wp-p">No wires yet. Add sensors, drivers or servos in the <a className="text-accent-text font-medium" href={`#project/${project.id}/parts`}>Parts tab</a>; their pins get wired to good GPIOs automatically.</p>}
            {wires.map((w) => {
              const f = verdict(w), lvl = f?.level ?? "ok", qty = parts.find((p) => p.key === w.part)?.qty ?? 1;
              return (
                <div key={wid(w)} className={`wp-wire pin-row ${lvl} ${traced === wid(w) ? "hot" : ""}`} onClick={() => trace(traced === wid(w) ? null : wid(w))}>
                  <div className="flex items-center gap-2">
                    <span className="wdot" style={{ background: color[wid(w)] }} />
                    <SignalName w={w} onRename={rename} />
                  </div>
                  <div className="wp-wire-sub flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate">{titleOf(w.part)}{qty > 1 ? ` #${w.instance}` : ""} <span className="font-mono">{w.partPin}</span></span>
                    <button className="pin-sel" aria-haspopup="listbox" aria-expanded={picker?.w === w} onClick={(e) => { e.stopPropagation(); setPicker(picker && wid(picker.w) === wid(w) ? null : { w, el: e.currentTarget, key: e.detail === 0 }); }}>
                      {w.boardPin ? pinLabel(w.boardPin) : "Pick a pin"}<Icon name="down" />
                    </button>
                  </div>
                  <span className={`pin-msg ${lvl}`}>{lvl === "ok" ? <Icon name="check-c" /> : <span className="bang" aria-hidden="true">!</span>}<span>{f ? `${f.problem[0].toUpperCase()}${f.problem.slice(1)}. ${f.fix}` : w.divider ? "OK, through the 1k/2k divider." : "OK"}</span></span>
                </div>
              );
            })}
            {wires.length > 0 && (
              <div className="wp-foot">
                <span>{badCount ? `${badCount} wire${badCount > 1 ? "s" : ""} need${badCount > 1 ? "" : "s"} a different pin.` : "Every wire is on a good pin."} Click a wire, then a pin, to move it.</span>
                <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(pinTable(wires, board, parts)).then(() => toast("Pin table copied as Markdown."), () => toast("Couldn't copy. Select the table in the Wires list instead.", "bad")); }}><Icon name="copy" />Copy pin table</button>
              </div>
            )}
          </div>
        )}
        {tab === "code" && (
          <div className="wp-body">
            <div className="code-head !px-0"><Icon name="code" className="text-label-2" /><b className="flex-1 font-mono text-[12.5px]">include/pins.h</b><span className="chip">{changed ? "updated just now" : "auto-generated"}</span></div>
            <pre className="code wp-code">{pinsH ? pinsH.split("\n").map((l, i) => {
              const hot = changed && l.includes(changed.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase());
              return <span key={i} className={`ln ${hot ? "flash" : ""} ${l.includes("// !") ? "chg" : ""}`}><span className="no">{i + 1}</span>{l || " "}{"\n"}</span>;
            }) : "// pins.h appears once the project is set up."}</pre>
          </div>
        )}
      </aside>
      {picker && <PinPicker projectId={project.id} wire={picker.w} anchor={picker.el} viaKey={picker.key} onPick={(p) => { setPicker(null); move(picker.w, p); }} onClose={() => setPicker(null)} />}
    </div>
  );
}

function SignalName({ w, onRename }: { w: Wire; onRename: (w: Wire, n: string) => void }) {
  const [v, setV] = useState(w.signalName);
  useEffect(() => setV(w.signalName), [w.signalName]);
  return (
    <input className="sig-in" value={v} spellCheck={false} aria-label={`Signal name for ${w.part} ${w.partPin}`} onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value.replace(/\s/g, ""))} onBlur={() => onRename(w, v)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(w.signalName); (e.target as HTMLInputElement).blur(); } }} />
  );
}

function pinTable(wires: Wire[], board: Board, parts: Part[]) {
  const rows = wires.map((w) => `| ${w.signalName} | ${parts.find((p) => p.key === w.part)?.title ?? w.part} ${w.partPin} | ${board.pins.find((p) => p.id === String(w.boardPin))?.label ?? "-"} |`);
  return [`Pins for ${board.name}`, "", "| Signal | Part pin | Board pin |", "| --- | --- | --- |", ...rows].join("\n");
}


// ---------------- pin picker ----------------

function PinPicker({ projectId, wire, anchor, viaKey, onPick, onClose }: { projectId: number; wire: Wire; anchor: HTMLElement; viaKey: boolean; onPick: (pin: string) => void; onClose: () => void }) {
  const [opts, setOpts] = useState<Option[] | null>(null);
  const [foot, setFoot] = useState<Option | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean; ox: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api.get<{ options: Option[] }>(`/projects/${projectId}/wiring/options?signal=${encodeURIComponent(wire.signalName)}`).then((r) => { setOpts(r.options); setFoot(r.options.find((o) => o.current) ?? null); }).catch(onClose);
  }, [wire.signalName]);
  useLayoutEffect(() => {
    if (!opts || !ref.current) return;
    const r = anchor.getBoundingClientRect(), w = ref.current.offsetWidth, h = ref.current.offsetHeight;
    const x = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    let y = r.bottom + 6;
    const up = y + h > innerHeight - 8;
    if (up) y = Math.max(8, r.top - h - 6);
    setPos({ x, y, up, ox: r.left + r.width / 2 - x });
    (ref.current.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? ref.current.querySelector<HTMLButtonElement>(".pp-opt"))?.focus({ preventScroll: true });
  }, [opts]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && e.target !== anchor) onClose(); };
    const scroll = () => onClose();
    document.addEventListener("mousedown", away);
    document.querySelector("main")?.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    return () => { document.removeEventListener("mousedown", away); document.querySelector("main")?.removeEventListener("scroll", scroll); window.removeEventListener("resize", scroll); };
  }, []);
  const groups: [string, Option[]][] = opts ? [
    [`Recommended for ${wire.partPin}`, opts.filter((o) => !o.used_by && o.level === "ok")],
    ["Might not work", opts.filter((o) => !o.used_by && o.level !== "ok")],
    ["In use", opts.filter((o) => o.used_by)],
  ] : [];
  const keys = (e: React.KeyboardEvent) => {
    const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>(".pp-opt") ?? [])];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const mv = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 } as Record<string, number>)[e.key];
    if (mv !== undefined) { e.preventDefault(); all[Math.max(0, Math.min(all.length - 1, i + mv))]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); anchor.focus(); }
    else if (e.key === "Tab") onClose();
  };
  return createPortal(
    <div ref={ref} id="pinPop" role="listbox" aria-label={`Pin for ${wire.signalName}`} onKeyDown={keys}
      className={`${pos ? "open" : ""} ${viaKey || calm() ? "instant" : ""}`}
      style={pos ? { left: pos.x, top: pos.y, transformOrigin: `${pos.ox}px ${pos.up ? "100%" : "0"}` } : { left: -9999, top: 0 }}>
      <div className="pp-title">Pin for <b>{wire.signalName}</b></div>
      {!opts ? <div className="p-3"><Sk h={80} r={8} /></div> : groups.map(([h, list]) => list.length ? (
        <div key={h}>
          <div className="pp-h">{h}</div>
          <div className="pp-grid">
            {list.map((o) => (
              <button key={o.id} role="option" aria-selected={o.current} className={`pp-opt ${o.used_by ? "used" : o.level}`} title={o.note}
                onMouseEnter={() => setFoot(o)} onFocus={() => setFoot(o)} onClick={() => onPick(o.id)}>
                {o.id}{(o.level !== "ok" || o.used_by) && <span className="d" />}
              </button>
            ))}
          </div>
        </div>
      ) : null)}
      {foot && <div className="pp-foot"><b>{foot.label}</b> · {foot.note}</div>}
    </div>,
    document.body,
  );
}
