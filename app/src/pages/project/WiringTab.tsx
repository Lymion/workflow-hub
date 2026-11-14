/** Session 12: wiring view. Board + parts drawn with Wokwi Elements (MIT) or from their files, drag wires,
 *  grouped pin picker, rename signals. Every change saves wiring.json and regenerates pins.h. */
import "@wokwi/elements";
import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, notifyChanged, useLoad } from "../../lib/api";
import { calm } from "../../lib/router";
import { Icon } from "../../components/Icon";
import { Empty, Sk } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { TabProps } from "./tabs";

type Wire = { part: string; instance: number; partPin: string; boardPin: string | null; signalName: string; mode: string; divider: boolean };
type Board = { board: string; name: string; color: string; glyph: string; header?: { left: string[]; right: string[] }; pins: { id: string; label: string }[]; wokwi?: { element: string; prefix?: string; pins?: Record<string, string> } };
type WiringRes = { wiring: { wires?: Wire[] }; pins_h: string; board: Board | null };
type Part = { key: string; qty: number; title: string; section: string; meta: { glyph?: string; color?: string; pins?: { name: string; mode?: string }[]; wokwi?: { element: string; pins?: Record<string, string> } } };
type Finding = { level: "ok" | "warn" | "bad"; part: string; problem: string; fix: string; signal?: string; gpio?: string };
type Option = { id: string; label: string; level: "ok" | "warn" | "bad"; note: string; used_by: string | null; current: boolean };
type Pt = { x: number; y: number; nx: number; ny: number };

const COLORS = ["#FF9F0A", "#0A84FF", "#FFD60A", "#64D2FF", "#BF5AF2", "#30D158", "#5E5CE6", "#FF375F", "#FF453A", "#AC8E68", "#66D4CF", "#FF6482"];
const GPIO_MODES = new Set(["OUTPUT", "INPUT", "INPUT_PULLUP", "PWM", "ANALOG", "I2C"]);
const rank = { ok: 0, warn: 1, bad: 2 } as const;
const wid = (w: Wire) => `${w.part}#${w.instance}#${w.partPin}`;

export function WiringTab({ project }: TabProps) {
  const toast = useToast();
  const res = useLoad(() => api.get<WiringRes>(`/projects/${project.id}/wiring`), [project.id]);
  const partsRes = useLoad(() => api.get<{ parts: Part[] }>(`/projects/${project.id}/parts`), [project.id]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [pinsH, setPinsH] = useState("");
  const [changed, setChanged] = useState<string | null>(null);
  const [traced, setTraced] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ w: Wire; el: HTMLElement; key: boolean } | null>(null);

  useEffect(() => {
    if (!res.data) return;
    setWires(res.data.wiring.wires ?? []);
    setPinsH(res.data.pins_h);
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
  const move = (w: Wire, pin: string) => {
    if (String(w.boardPin) === pin) return;
    save(wires.map((x) => (wid(x) === wid(w) ? { ...x, boardPin: pin } : x)), w.signalName, `${w.signalName} moved to ${board?.pins.find((p) => p.id === pin)?.label ?? pin}. pins.h updated.`);
  };
  const rename = (w: Wire, name: string) => {
    if (!name || name === w.signalName) return;
    save(wires.map((x) => (wid(x) === wid(w) ? { ...x, signalName: name } : x)), name, `Renamed to ${name}. pins.h updated.`);
  };

  if (res.loading || partsRes.loading) return <div className="grid gap-3"><Sk h={340} r={16} /><Sk h={160} r={16} /></div>;
  if (!board) return <div className="card"><Empty icon="cpu" title="No board yet" action={<a className="btn btn-primary" href={`#project/${project.id}/parts`}>Open Parts</a>}>Pick a board in the Parts tab, then wire it up here.</Empty></div>;
  if (!wires.length) return <div className="card"><Empty icon="cpu" title="No wires yet" action={<a className="btn btn-primary" href={`#project/${project.id}/parts`}>Add parts</a>}>Add sensors, drivers or servos in the Parts tab. Their pins get wired to good GPIOs automatically, and you can move them here.</Empty></div>;

  const badCount = wires.filter((w) => verdict(w)?.level === "bad").length;
  return (
    <div className="wire-grid">
      <div className="grid gap-4 min-w-0">
        <Diagram board={board} parts={parts} wires={wires} color={color} verdict={verdict} traced={traced} setTraced={setTraced} onDrop={move} />
        <section className="card overflow-hidden">
          <table className="tbl pin-tbl">
            <thead><tr><th>Signal</th><th>Part pin</th><th>Board pin</th><th>Check</th></tr></thead>
            <tbody>
              {wires.map((w) => {
                const f = verdict(w);
                const lvl = f?.level ?? "ok";
                const title = parts.find((p) => p.key === w.part)?.title ?? w.part;
                const qty = parts.find((p) => p.key === w.part)?.qty ?? 1;
                return (
                  <tr key={wid(w)} className={`pin-row ${lvl} ${traced === wid(w) ? "hot" : ""}`} onClick={() => setTraced(traced === wid(w) ? null : wid(w))}>
                    <td><span className="wdot" style={{ background: color[wid(w)] }} /><SignalName w={w} onRename={rename} /></td>
                    <td className="text-[13px]">{title}{qty > 1 ? ` #${w.instance}` : ""} <span className="font-mono text-label-2">{w.partPin}</span></td>
                    <td><button className="pin-sel" aria-haspopup="listbox" aria-expanded={picker?.w === w} onClick={(e) => { e.stopPropagation(); setPicker(picker && wid(picker.w) === wid(w) ? null : { w, el: e.currentTarget, key: e.detail === 0 }); }}>
                      {w.boardPin ? board.pins.find((p) => p.id === String(w.boardPin))?.label ?? w.boardPin : "Pick a pin"}<Icon name="down" /></button></td>
                    <td><span className={`pin-msg ${lvl}`}>{lvl === "ok" ? <Icon name="check-c" /> : <span className="bang" aria-hidden="true">!</span>}<span>{f ? `${f.problem[0].toUpperCase()}${f.problem.slice(1)}. ${f.fix}` : w.divider ? "OK, through the 1k/2k divider." : "OK"}</span></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs text-label-2">
            <span className="flex-1">{badCount ? `${badCount} wire${badCount > 1 ? "s" : ""} need${badCount > 1 ? "" : "s"} a different pin.` : "Every wire is on a good pin."} Drag a wire's end onto a board pin, or pick one here.</span>
            <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(pinTable(wires, board, parts)); toast("Pin table copied as Markdown."); }}><Icon name="copy" />Copy pin table</button>
          </div>
        </section>
      </div>
      <aside className="code-card wire-code">
        <div className="code-head"><Icon name="code" className="text-label-2" /><b className="flex-1 font-mono text-[12.5px]">include/pins.h</b><span className="chip">{changed ? "updated just now" : "auto-generated"}</span></div>
        <pre className="code max-h-[70vh] overflow-auto">{pinsH.split("\n").map((l, i) => {
          const hot = changed && l.includes(changed.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase());
          return <span key={i} className={`ln ${hot ? "flash" : ""} ${l.includes("// !") ? "chg" : ""}`}><span className="no">{i + 1}</span>{l || " "}{"\n"}</span>;
        })}</pre>
      </aside>
      {picker && <PinPicker projectId={project.id} wire={picker.w} anchor={picker.el} viaKey={picker.key} onPick={(pin) => { setPicker(null); move(picker.w, pin); }} onClose={() => setPicker(null)} />}
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

// ---------------- diagram ----------------

function Diagram({ board, parts, wires, color, verdict, traced, setTraced, onDrop }: {
  board: Board; parts: Part[]; wires: Wire[]; color: Record<string, string>; verdict: (w: Wire) => Finding | undefined;
  traced: string | null; setTraced: (s: string | null) => void; onDrop: (w: Wire, pin: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [geo, setGeo] = useState<{ board: Record<string, Pt>; parts: Record<string, Pt>; w: number; h: number; cx: number } | null>(null);
  const [drag, setDrag] = useState<{ w: Wire; x: number; y: number; hover: string | null } | null>(null);
  const [failed, setFailed] = useState(false);

  // which side of the board each part sits on: the side most of its wires go to
  const leftSet = new Set(board.header?.left ?? []);
  const instances = parts.flatMap((p) => Array.from({ length: p.qty }, (_, i) => ({ p, inst: i + 1 })));
  const side = (key: string, inst: number) => {
    const ws = wires.filter((w) => w.part === key && w.instance === inst && w.boardPin);
    const l = ws.filter((w) => leftSet.has(String(w.boardPin))).length;
    return l * 2 >= ws.length ? "left" : "right";
  };
  const left = instances.filter((x) => side(x.p.key, x.inst) === "left");
  const right = instances.filter((x) => side(x.p.key, x.inst) === "right");
  const layoutKey = instances.map((x) => `${x.p.key}${x.inst}${side(x.p.key, x.inst)}`).join() + board.board;

  const measure = useCallback(() => {
    const st = stage.current;
    if (!st) return;
    const sr = st.getBoundingClientRect();
    const k = sr.width / st.offsetWidth || 1;
    const toStage = (r: DOMRect, x: number, y: number) => ({ x: (r.left - sr.left) / k + x, y: (r.top - sr.top) / k + y });
    const normal = (x: number, y: number, w: number, h: number) => {
      const d = [[x, -1, 0], [w - x, 1, 0], [y, 0, -1], [h - y, 0, 1]].sort((a, b) => a[0] - b[0])[0];
      return { nx: d[1], ny: d[2] };
    };
    const out: Record<string, Pt> = {};
    const bout: Record<string, Pt> = {};
    st.querySelectorAll<HTMLElement>("[data-part]").forEach((el) => {
      const key = el.dataset.part!, inst = el.dataset.inst!;
      const r = el.getBoundingClientRect();
      const w = r.width / k, h = r.height / k;
      const info = (el as unknown as { pinInfo?: { name: string; x: number; y: number }[] }).pinInfo;
      const alias = parts.find((p) => p.key === key)?.meta.wokwi?.pins ?? {};
      if (info) {
        for (const pin of parts.find((p) => p.key === key)?.meta.pins ?? []) {
          const pi = info.find((i) => i.name === (alias[pin.name] ?? pin.name));
          if (pi) out[`${key}#${inst}#${pin.name}`] = { ...toStage(r, pi.x, pi.y), ...normal(pi.x, pi.y, w, h) };
        }
      }
      el.querySelectorAll<SVGElement>("[data-pin]").forEach((d) => {
        const pr = d.getBoundingClientRect();
        const c = toStage(pr, pr.width / k / 2, pr.height / k / 2);
        out[`${key}#${inst}#${d.dataset.pin}`] = { ...c, nx: Number(d.dataset.nx), ny: 0 };
      });
    });
    const bel = st.querySelector<HTMLElement>("[data-board]");
    let cx = 0;
    if (bel) {
      const r = bel.getBoundingClientRect();
      const w = r.width / k, h = r.height / k;
      cx = (r.left - sr.left) / k + w / 2;
      const info = (bel as unknown as { pinInfo?: { name: string; x: number; y: number }[] }).pinInfo;
      const es = bel.offsetWidth ? w / bel.offsetWidth : 1; // the board drawing is scaled up
      if (info && board.wokwi) {
        for (const p of board.pins) {
          const name = board.wokwi.pins?.[p.id] ?? `${board.wokwi.prefix ?? ""}${p.id}`;
          const pi = info.find((i) => i.name === name);
          if (pi) bout[p.id] = { ...toStage(r, pi.x * es, pi.y * es), ...normal(pi.x * es, pi.y * es, w, h) };
        }
      }
      bel.querySelectorAll<SVGElement>("[data-gpio]").forEach((d) => {
        const pr = d.getBoundingClientRect();
        bout[d.dataset.gpio!] = { ...toStage(pr, pr.width / k / 2, pr.height / k / 2), nx: Number(d.dataset.nx), ny: 0 };
      });
    }
    setGeo({ board: bout, parts: out, w: st.offsetWidth, h: st.offsetHeight, cx });
  }, [layoutKey]);

  // wait for the Wokwi drawings, then measure; re-fit on resize
  useLayoutEffect(() => {
    let alive = true;
    const tags = [board.wokwi?.element, ...parts.map((p) => p.meta.wokwi?.element)].filter(Boolean) as string[];
    Promise.race([Promise.all(tags.map((t) => customElements.whenDefined(t))), new Promise((_, r) => setTimeout(r, 6000))])
      .then(async () => {
        await Promise.all([...(stage.current?.querySelectorAll("*") ?? [])].map((e) => (e as unknown as { updateComplete?: Promise<unknown> }).updateComplete).filter(Boolean));
        if (alive) requestAnimationFrame(measure);
      })
      .catch(() => { if (alive) { setFailed(true); measure(); } });
    return () => { alive = false; };
  }, [layoutKey, measure]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => { const s = stage.current; if (s) setScale(Math.min(1.25, el.clientWidth / s.offsetWidth)); };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // the stage changes size as drawings load: re-measure pin positions then
    const ro2 = new ResizeObserver(() => { fit(); requestAnimationFrame(measure); });
    if (stage.current) ro2.observe(stage.current);
    fit();
    return () => { ro.disconnect(); ro2.disconnect(); };
  }, [layoutKey, measure]);

  // follow the pointer anywhere while dragging a wire end; drop on the nearest board pin
  const dragging = !!drag;
  const dragRef = useRef(drag);
  dragRef.current = drag;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => { const d = dragRef.current; if (!d) return; const s = toStage(e); setDrag({ ...d, ...s, hover: nearest(s.x, s.y) }); };
    const up = () => { const d = dragRef.current; if (d?.hover) onDrop(d.w, d.hover); setDrag(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setDrag(null); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("keydown", esc); };
  }, [dragging]);

  const path = (a: Pt, b: Pt) => {
    const d = Math.max(36, Math.abs(a.x - b.x) * 0.45);
    return `M${a.x} ${a.y} C${a.x + a.nx * d} ${a.y + a.ny * d} ${b.x + b.nx * d} ${b.y + b.ny * d} ${b.x} ${b.y}`;
  };
  const toStage = (e: { clientX: number; clientY: number }) => {
    const sr = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - sr.left) / scale, y: (e.clientY - sr.top) / scale };
  };
  const nearest = (x: number, y: number) => {
    let best: string | null = null, bd = 18 * 18;
    for (const [id, p] of Object.entries(geo?.board ?? {})) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = id; } }
    return best;
  };

  return (
    <section className={`card diagram ${traced ? "focus" : ""}`} aria-label={`Wiring diagram for ${board.name}`}>
      <div ref={wrap} className="stage-wrap" style={{ height: geo ? geo.h * scale : 360 }}>
        <div ref={stage} className="stage" style={{ transform: `scale(${scale})` }}>
          <div className="col">{left.map(({ p, inst }) => <PartView key={p.key + inst} part={p} inst={inst} side="left" />)}</div>
          <div className="col board-col">{board.wokwi ? <ScaledBoard tag={board.wokwi.element} id={board.board} onReady={measure} /> : <GenericBoard board={board} />}</div>
          <div className="col">{right.map(({ p, inst }) => <PartView key={p.key + inst} part={p} inst={inst} side="right" />)}</div>
          {geo && (
            <svg className={`wires ${drag ? "dragging" : ""}`} width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`}>
              {drag && Object.entries(geo.board).map(([id, p]) => <circle key={id} className={`pin-hit ${drag.hover === id ? "on" : ""}`} cx={p.x} cy={p.y} r={drag.hover === id ? 6 : 4} />)}
              {wires.map((w) => {
                const a = geo.parts[wid(w)], b = w.boardPin ? geo.board[String(w.boardPin)] : undefined;
                if (!a) return null;
                const lvl = verdict(w)?.level ?? "ok";
                const hot = traced === wid(w);
                const isDragged = drag && wid(drag.w) === wid(w);
                const end = isDragged ? { x: drag!.x, y: drag!.y, nx: 0, ny: 0 } : b;
                return (
                  <g key={wid(w)} className={hot ? "hot" : ""} onClick={() => setTraced(hot ? null : wid(w))}>
                    {end && <path className="wire-sh" d={path(a, end)} />}
                    {end && <path className={`wire ${lvl === "bad" ? "dash" : ""}`} d={path(a, end)} stroke={color[wid(w)]} />}
                    {end && <circle className="wire-end" cx={end.x} cy={end.y} r={3.2} fill={color[wid(w)]} />}
                    <circle className="wire-grab" cx={a.x} cy={a.y} r={isDragged ? 6 : 4.5} fill={color[wid(w)]}
                      onPointerDown={(e) => { e.preventDefault(); setDrag({ w, ...toStage(e), hover: null }); }}>
                      <title>Drag to a board pin to move {w.signalName}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      <p className="text-xs text-label-2 px-4 pb-3">{failed ? "Couldn't draw some parts. The pin table and pins.h still work. " : ""}Dashed wires need attention. Click a wire or row to trace it. Parts drawn with Wokwi Elements (MIT).</p>
    </section>
  );
}

const BOARD_SCALE = 1.6;

/** A Wokwi board drawn larger: the wrapper takes the scaled size so the columns lay out around it. */
function ScaledBoard({ tag, id, onReady }: { tag: string; id: string; onReady: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    let alive = true;
    customElements.whenDefined(tag).then(async () => {
      const el = ref.current?.firstElementChild as (HTMLElement & { updateComplete?: Promise<unknown> }) | null;
      await el?.updateComplete;
      if (alive && el) setSize({ w: el.offsetWidth * BOARD_SCALE, h: el.offsetHeight * BOARD_SCALE });
    });
    return () => { alive = false; };
  }, [tag]);
  useEffect(() => { if (size) requestAnimationFrame(onReady); }, [size]);
  return (
    <div ref={ref} style={size ? { width: size.w, height: size.h } : undefined}>
      {createElement(tag, { "data-board": id, class: "wk-board", style: { transform: `scale(${BOARD_SCALE})` } })}
    </div>
  );
}

function PartView({ part, inst, side }: { part: Part; inst: number; side: "left" | "right" }) {
  const label = `${part.title}${part.qty > 1 ? ` #${inst}` : ""}`;
  if (part.meta.wokwi) {
    return (
      <figure className="part">
        {createElement(part.meta.wokwi.element, { "data-part": part.key, "data-inst": String(inst), class: "wk-part", ...(part.meta.wokwi.element === "wokwi-servo" ? { angle: "90" } : {}) })}
        <figcaption>{label}</figcaption>
      </figure>
    );
  }
  const pins = (part.meta.pins ?? []).filter((p) => GPIO_MODES.has((p.mode ?? "").toUpperCase()));
  const h = 34 + Math.max(1, pins.length) * 18;
  const w = 128;
  const px = side === "left" ? w - 6 : 6;
  return (
    <figure className="part">
      <svg data-part={part.key} data-inst={inst} width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="gen-part">
        <defs><linearGradient id={`g-${part.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#000" stopOpacity=".12" /></linearGradient></defs>
        <rect x="1" y="1" width={w - 2} height={h - 2} rx="8" fill={part.meta.color ?? "#475569"} />
        <rect x="1" y="1" width={w - 2} height={h - 2} rx="8" fill={`url(#g-${part.key})`} stroke="rgba(0,0,0,.35)" />
        <text x={side === "left" ? 12 : w - 12} y="21" textAnchor={side === "left" ? "start" : "end"} fill="#fff" fontSize="12" fontWeight="700" fontFamily="system-ui, sans-serif">{part.meta.glyph ?? part.title.slice(0, 3)}</text>
        {pins.map((p, i) => (
          <g key={p.name}>
            <text x={side === "left" ? w - 16 : 16} y={44 + i * 18} textAnchor={side === "left" ? "end" : "start"} fill="rgba(255,255,255,.9)" fontSize="9.5" fontFamily="ui-monospace, monospace">{p.name}</text>
            <rect data-pin={p.name} data-nx={side === "left" ? 1 : -1} x={px - 4} y={36 + i * 18} width="8" height="8" rx="1.5" fill="#D4AF37" stroke="rgba(0,0,0,.4)" />
          </g>
        ))}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function GenericBoard({ board }: { board: Board }) {
  const L = board.header?.left ?? [], R = board.header?.right ?? [];
  const rows = Math.max(L.length, R.length, 6);
  const w = 150, h = 60 + rows * 16;
  const label = (id: string) => board.pins.find((p) => p.id === id)?.label ?? id;
  return (
    <svg data-board={board.board} width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="gen-board">
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="8" fill={board.color ?? "#1F3A5F"} stroke="rgba(0,0,0,.4)" />
      <rect x={w / 2 - 22} y="6" width="44" height="18" rx="3" fill="#C0C6CC" />
      <rect x={w / 2 - 26} y={h / 2 - 26} width="52" height="52" rx="4" fill="#1C1C1E" />
      <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif">{board.glyph}</text>
      {L.map((id, i) => <g key={id}><rect data-gpio={id} data-nx="-1" x="6" y={40 + i * 16} width="8" height="8" rx="1.5" fill="#D4AF37" /><text x="18" y={47 + i * 16} fontSize="8.5" fill="rgba(255,255,255,.85)" fontFamily="ui-monospace, monospace">{label(id)}</text></g>)}
      {R.map((id, i) => <g key={id}><rect data-gpio={id} data-nx="1" x={w - 14} y={40 + i * 16} width="8" height="8" rx="1.5" fill="#D4AF37" /><text x={w - 18} y={47 + i * 16} textAnchor="end" fontSize="8.5" fill="rgba(255,255,255,.85)" fontFamily="ui-monospace, monospace">{label(id)}</text></g>)}
    </svg>
  );
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
