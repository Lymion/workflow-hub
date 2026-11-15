/** The Wiring tab's bench: the board and the project's parts drawn at an angle, with the real wires.
 *  Board view explains the board (callouts); Project view shows every part and wire. */
import { useEffect, useMemo, useRef, useState } from "react";
import { calm } from "../../lib/router";
import { Icon } from "../../components/Icon";
import {
  BASE_ANGLE, H, W, bounds, boardPins, cable, fallbackBoard, fallbackPart, footprint, layoutParts, makeView, shapePolys,
  type BoardModel, type PartModel, type Pt, type Shape, type View,
} from "../../lib/iso";

export type BenchWire = { part: string; instance: number; partPin: string; boardPin: string | null; signalName: string; mode: string; divider: boolean };
export type BenchPin = { id: string; label: string; caps?: string[]; note?: string; strapping?: string; reserved?: string };
export type BenchBoard = { board: string; name: string; color: string; header?: { left: string[]; right: string[] }; pins: BenchPin[]; model?: BoardModel };
export type BenchPart = { key: string; qty: number; title: string; section: string; meta: { color?: string; category?: string; pins?: { name: string; mode?: string }[]; model?: PartModel } };
export type Mode = "board" | "project";

const WIREABLE = new Set(["OUTPUT", "INPUT", "INPUT_PULLUP", "PWM", "ANALOG", "I2C"]);
export const wid = (w: BenchWire) => `${w.part}#${w.instance}#${w.partPin}`;

type Props = {
  board: BenchBoard; parts: BenchPart[]; wires: BenchWire[]; color: Record<string, string>; bad: (w: BenchWire) => boolean;
  mode: Mode; setMode: (m: Mode) => void; traced: string | null; setTraced: (id: string | null) => void;
  selPart: string | null; setSelPart: (id: string | null) => void; pin: string | null; setPin: (id: string | null) => void;
  onMove: (w: BenchWire, pin: string) => void;
};

type Inst = { id: string; part: BenchPart; inst: number; model: PartModel; at: Pt };

export function Bench3D(p: Props) {
  const { board, wires, mode } = p;
  const [angle, setAngle] = useState(BASE_ANGLE);
  const [zoom, setZoom] = useState(1);
  const [labels, setLabels] = useState(true);
  const [flow, setFlow] = useState(false);
  const [schem, setSchem] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const target = useRef({ angle: BASE_ANGLE, zoom: 1 });
  const raf = useRef<Record<string, number>>({});

  const model = useMemo(() => board.model ?? fallbackBoard(board.header, board.color ?? "#1F3A5F"), [board]);
  const pins = useMemo(() => boardPins(model), [model]);
  const pinInfo = (id: string) => board.pins.find((x) => x.id === id);
  const silkName = (id: string) => (pinInfo(id) ? model.names?.[id] ?? `${model.prefix ?? ""}${id}` : id);
  const pinZ = model.size[2] + 3.2;

  // shapes per object in plan coordinates (board shapes sit on the board's top)
  const boardShapes = useMemo<Shape[]>(() => {
    const [bw, bd, bt] = model.size;
    const out: Shape[] = [{ w: bw, d: bd, h: bt, color: model.color, top: model.top }];
    for (const sh of model.shapes ?? []) out.push({ ...sh, z: (sh.z ?? 0) + bt });
    const pitch = model.pitch ?? 2.54;
    model.rows.forEach((row) => {
      let start = -1;
      row.pins.forEach((id, i) => {
        const end = i === row.pins.length - 1;
        if (id !== "" && start < 0) start = i;
        if (start >= 0 && (id === "" || end)) {
          const last = id === "" ? i - 1 : i, n = last - start + 1;
          out.push({ x: row.x, y: row.y + ((start + last) / 2) * pitch, w: 2.5, d: n * pitch, z: bt, h: 2.6, color: "#14171d", top: "#1d2129" });
          start = -1;
        }
      });
    });
    for (const pn of pins) out.push({ x: pn.x, y: pn.y, w: 0.9, d: 0.9, z: bt + 2.6, h: 0.7, color: "#c99a2e", top: "#f2c75c" });
    return out;
  }, [model, pins]);

  // part instances placed around the board
  const insts = useMemo<Inst[]>(() => {
    const rowOf = new Map(pins.map((x) => [x.id, x.row]));
    const items = p.parts.filter((pt) => pt.section !== "boards").flatMap((pt) => {
      const wireable = (pt.meta.pins ?? []).filter((x) => WIREABLE.has((x.mode ?? "").toUpperCase())).map((x) => x.name);
      if (!pt.meta.model && !(pt.meta.pins ?? []).length) return [];
      const m = pt.meta.model ?? fallbackPart(pt.meta.color ?? "#475569", wireable);
      return Array.from({ length: pt.qty }, (_, i) => ({ pt, inst: i + 1, m }));
    });
    const sized = items.map(({ pt, inst, m }) => {
      const ws = wires.filter((w) => w.part === pt.key && w.instance === inst && w.boardPin);
      const left = ws.filter((w) => rowOf.get(String(w.boardPin)) === 0).length;
      const side: "left" | "right" | "back" = !ws.length ? "back" : left * 2 >= ws.length ? "left" : "right";
      const label = `${pt.title}${pt.qty > 1 ? ` #${inst}` : ""} · ${ws.length} wires`;
      return { id: `${pt.key}#${inst}`, side, shapes: m.shapes, tag: m.tag ?? 20, tagPx: label.length * 6.3 + 24, pt, inst, m };
    });
    const at = layoutParts(sized, boardShapes);
    return sized.map((x) => ({ id: x.id, part: x.pt, inst: x.inst, model: x.m, at: at[x.id] }));
  }, [p.parts, wires.map((w) => `${wid(w)}${w.boardPin}`).join(), boardShapes, pins]);
  const showParts = mode === "project";

  // fit: turn around the middle of the bench, and scale so it fills the stage at the base angle
  const fit = useMemo(() => {
    const all: Shape[] = boardShapes.slice();
    if (showParts) for (const it of insts) for (const sh of it.model.shapes) all.push({ ...sh, x: (sh.x ?? 0) + it.at[0], y: (sh.y ?? 0) + it.at[1] });
    let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity;
    for (const sh of all) {
      const hw = sh.kind === "cyl" ? sh.r ?? 1 : (sh.w ?? 1) / 2, hd = sh.kind === "cyl" ? sh.r ?? 1 : (sh.d ?? 1) / 2;
      px0 = Math.min(px0, (sh.x ?? 0) - hw); px1 = Math.max(px1, (sh.x ?? 0) + hw); py0 = Math.min(py0, (sh.y ?? 0) - hd); py1 = Math.max(py1, (sh.y ?? 0) + hd);
    }
    const focus: Pt = [(px0 + px1) / 2, (py0 + py1) / 2];
    const b = bounds(all.flatMap((sh) => shapePolys(makeView(BASE_ANGLE, 1, focus, 0, 0), sh)));
    const s = Math.max(2.2, Math.min(12, Math.min((W - (showParts ? 200 : 540)) / (b.x1 - b.x0), (H - (showParts ? 230 : 230)) / (b.y1 - b.y0))));
    return { s, focus, cx: W / 2 - (s * (b.x0 + b.x1)) / 2, cy: H / 2 + (showParts ? 0 : 6) - (s * (b.y0 + b.y1)) / 2 };
  }, [boardShapes, insts, showParts]);

  const v = makeView(angle, fit.s * zoom, fit.focus, W / 2 + (fit.cx - W / 2) * zoom, H / 2 + 6 + (fit.cy - H / 2 - 6) * zoom);

  // ---------- motion ----------
  const tween = (key: "angle" | "zoom", to: number) => {
    target.current[key] = to;
    const set = key === "angle" ? setAngle : setZoom;
    if (calm()) { set(to); return; }
    cancelAnimationFrame(raf.current[key]);
    const from = key === "angle" ? angle : zoom, t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 460), e = 1 - Math.pow(1 - k, 3); set(from + (to - from) * e); if (k < 1) raf.current[key] = requestAnimationFrame(step); };
    raf.current[key] = requestAnimationFrame(step);
  };
  useEffect(() => () => Object.values(raf.current).forEach(cancelAnimationFrame), []);
  useEffect(() => { setZoom(1); target.current.zoom = 1; setHot(null); }, [mode]);

  // drag on empty paper to turn the bench
  const drag = useRef<{ x: number; a: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-hit]")) return;
    drag.current = { x: e.clientX, a: angle };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMoveP = (e: React.PointerEvent) => { if (drag.current) { const a = drag.current.a + (e.clientX - drag.current.x) * 0.4; setAngle(a); target.current.angle = a; } };
  const onUp = () => { if (!drag.current) return; drag.current = null; tween("angle", Math.round((angle - BASE_ANGLE) / 90) * 90 + BASE_ANGLE); };

  // ---------- what to highlight ----------
  const tracedWire = wires.find((w) => wid(w) === p.traced) ?? null;
  const lit = new Set<string>();
  if (tracedWire?.boardPin) lit.add(String(tracedWire.boardPin));
  if (p.selPart) wires.filter((w) => `${w.part}#${w.instance}` === p.selPart && w.boardPin).forEach((w) => lit.add(String(w.boardPin)));
  if (hover) lit.add(hover);
  if (p.pin) lit.add(p.pin);
  const dimWire = (w: BenchWire) => (p.traced ? wid(w) !== p.traced : p.selPart ? `${w.part}#${w.instance}` !== p.selPart : false);

  // ---------- draw ----------
  const objects = [
    { id: "board", x: 0, y: 0, shapes: boardShapes, isBoard: true },
    ...(showParts ? insts.map((it) => ({ id: it.id, x: it.at[0], y: it.at[1], shapes: it.model.shapes.map((sh) => ({ ...sh, x: (sh.x ?? 0) + it.at[0], y: (sh.y ?? 0) + it.at[1] })), isBoard: false })) : []),
  ].sort((a, b) => v.depth(a.x, a.y) - v.depth(b.x, b.y));

  const scene: JSX.Element[] = [];
  for (const o of objects) scene.push(<polygon key={`sh-${o.id}`} points={footprint(v, o.shapes[0], 0, 0)} fill="var(--bench-shadow)" filter="url(#bench-soft)" />);
  for (const o of objects) {
    const order = o.shapes.map((sh, i) => ({ sh, i })).sort((a, b) => (a.sh.z ?? 0) - (b.sh.z ?? 0) || v.depth(a.sh.x ?? 0, a.sh.y ?? 0) - v.depth(b.sh.x ?? 0, b.sh.y ?? 0));
    for (const { sh, i } of order) {
      shapePolys(v, sh).forEach((poly, j) => scene.push(<polygon key={`${o.id}-${i}-${j}`} className="bench-poly" points={poly.points} fill={poly.fill} />));
      if (o.isBoard && i === 0) scene.push(<Silk key="silk" v={v} model={model} pins={pins} name={silkName} />);
      if (sh.antenna) scene.push(<g key={`ant-${i}`} transform={v.plane((sh.z ?? 0) + sh.h + 0.01)}><polyline points={antenna(sh)} fill="none" stroke="#d9a93a" strokeWidth={0.55} /></g>);
      if (sh.text) scene.push(<g key={`txt-${i}`} transform={v.plane((sh.z ?? 0) + sh.h + 0.01)}><text x={sh.x ?? 0} y={(sh.y ?? 0) + 0.6} fontSize={Math.min(1.9, ((sh.w ?? 10) * 0.9) / Math.max(4, sh.text.length) * 1.7)} textAnchor="middle" fill={o.isBoard && (sh.color === "#b9c1cc") ? "#5b6472" : "rgba(255,255,255,.55)"} className="bench-silk">{sh.text}</text></g>);
    }
  }

  // wires: part pin → board pin
  const wireEls: JSX.Element[] = [];
  if (showParts) {
    for (const w of wires) {
      if (!w.boardPin) continue;
      const it = insts.find((x) => x.id === `${w.part}#${w.instance}`), bp = pins.find((x) => x.id === String(w.boardPin));
      const anchor = it?.model.pins[w.partPin];
      if (!it || !bp || !anchor) continue;
      const a = v.P(anchor[0] + it.at[0], anchor[1] + it.at[1], anchor[2]), b = v.P(bp.x, bp.y, pinZ), d = cable(a, b);
      const dim = dimWire(w), col = p.color[wid(w)];
      wireEls.push(
        <g key={wid(w)} className={`bench-wire-g ${dim ? "dim" : ""} ${p.traced === wid(w) ? "hot" : ""}`}>
          <path className="bench-case" d={d} />
          <path className={`bench-wire ${p.bad(w) ? "bad" : ""}`} d={d} stroke={col} />
          {flow && !dim && <path className="bench-flow" d={d} />}
          <circle className="bench-end" cx={a[0]} cy={a[1]} r={2.6} fill={col} />
          <circle className="bench-end" cx={b[0]} cy={b[1]} r={2.6} fill={col} />
          <path className="bench-hit" d={d} data-hit="" data-wire={wid(w)}><title>{w.signalName}: {it.part.title} {w.partPin} → {silkName(String(w.boardPin))}</title></path>
        </g>,
      );
    }
  }

  // pins: glow + hit targets
  const r = Math.max(4, v.s * 1.15);
  const pinEls = pins.map((pn) => {
    const q = v.P(pn.x, pn.y, pinZ);
    return (
      <g key={`pin-${pn.row}-${pn.i}`}>
        {lit.has(pn.id) && <circle className="bench-glow" cx={q[0]} cy={q[1]} r={r * 0.9} />}
        {tracedWire && pinInfo(pn.id) && !lit.has(pn.id) && <circle className="bench-target" cx={q[0]} cy={q[1]} r={r * 0.55} />}
        <circle className="bench-pin" cx={q[0]} cy={q[1]} r={r} data-hit="" data-pin={pn.id} />
      </g>
    );
  });

  // callouts (board view) and name tags (project view)
  const overlay: JSX.Element[] = [];
  const spots = mode === "board" ? (model.hotspots ?? []).map((h) => ({ h, q: hotPoint(v, h, model, pins, pinZ) })) : [];
  if (labels && mode === "board") {
    const left = spots.filter((s) => s.q[0] < W / 2).sort((a, b) => a.q[1] - b.q[1]), right = spots.filter((s) => s.q[0] >= W / 2).sort((a, b) => a.q[1] - b.q[1]);
    const place = (list: typeof spots, x: number) => list.forEach((s, i) => {
      const top = 92 + (i * (H - 260)) / Math.max(1, list.length - 1 || 1) * (list.length > 1 ? 1 : 0) + (list.length === 1 ? (H - 260) / 2 : 0);
      const cw = 236, ch = 66, ax = x < W / 2 ? x + cw : x, ay = Math.max(top + 14, Math.min(top + ch - 14, s.q[1]));
      const [l1, l2] = wrap2(s.h.body, 34);
      overlay.push(
        <g key={`co-${s.h.title}`}>
          <path className="bench-leader" d={`M${s.q[0].toFixed(1)} ${s.q[1].toFixed(1)} L${(ax + (x < W / 2 ? 18 : -18)).toFixed(1)} ${ay.toFixed(1)} L${ax} ${ay.toFixed(1)}`} />
          <g className="bench-card" filter="url(#bench-card)"><rect x={x} y={top} width={cw} height={ch} rx={12} /><text className="t" x={x + 16} y={top + 24}>{s.h.title}</text><text className="b" x={x + 16} y={top + 43}>{l1}</text><text className="b" x={x + 16} y={top + 58}>{l2}</text></g>
        </g>,
      );
    });
    place(left, 22);
    place(right, W - 258);
  }
  spots.forEach((s, i) => overlay.push(
    <g key={`hot-${i}`}>
      <circle className="bench-ring" cx={s.q[0]} cy={s.q[1]} r={8} /><circle className="bench-dot" cx={s.q[0]} cy={s.q[1]} r={5} />
      <circle className="bench-pin" cx={s.q[0]} cy={s.q[1]} r={13} data-hit="" data-hot={i} />
    </g>,
  ));
  if (labels && showParts) {
    for (const it of insts) {
      const q = v.P(it.at[0], it.at[1], it.model.tag ?? 20), n = wires.filter((w) => `${w.part}#${w.instance}` === it.id && w.boardPin).length;
      const label = `${it.part.title}${it.part.qty > 1 ? ` #${it.inst}` : ""}${n ? ` · ${n} wire${n > 1 ? "s" : ""}` : ""}`.toUpperCase(), tw = label.length * 6.3 + 24;
      overlay.push(
        <g key={`tag-${it.id}`} className={`bench-tag ${p.selPart === it.id ? "on" : ""}`} data-hit="" data-part={it.id} role="button" tabIndex={0} aria-label={`Show ${it.part.title}'s wires`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.setSelPart(p.selPart === it.id ? null : it.id); p.setTraced(null); } }}>
          <line x1={q[0]} y1={q[1] - 6} x2={q[0]} y2={q[1] - 18} className="bench-tagline" />
          <rect x={q[0] - tw / 2} y={q[1] - 42} width={tw} height={24} rx={12} filter="url(#bench-card)" data-part={it.id} data-hit="" />
          <text x={q[0]} y={q[1] - 26} textAnchor="middle" data-part={it.id} data-hit="">{label}</text>
        </g>,
      );
    }
  }

  // ---------- events ----------
  const onClick = (e: React.MouseEvent) => {
    const t = (e.target as Element).closest("[data-wire],[data-part],[data-pin],[data-hot]") as HTMLElement | null;
    if (!t) { p.setTraced(null); p.setSelPart(null); setHot(null); return; }
    const d = t.dataset;
    if (d.hot !== undefined) { setHot(hot === Number(d.hot) ? null : Number(d.hot)); return; }
    if (d.wire) { p.setTraced(p.traced === d.wire ? null : d.wire); p.setSelPart(null); return; }
    if (d.part) { p.setSelPart(p.selPart === d.part ? null : d.part); p.setTraced(null); return; }
    if (d.pin) {
      if (tracedWire && pinInfo(d.pin) && String(tracedWire.boardPin) !== d.pin) p.onMove(tracedWire, d.pin);
      else p.setPin(p.pin === d.pin ? null : d.pin);
    }
  };
  const onOver = (e: React.MouseEvent) => {
    const d = (e.target as HTMLElement).dataset ?? {};
    if (d.pin && d.pin !== hover) setHover(d.pin);
    else if (d.hot !== undefined && Number(d.hot) !== hot) setHot(Number(d.hot));
  };
  const onOut = (e: React.MouseEvent) => {
    const d = (e.target as HTMLElement).dataset ?? {};
    if (d.pin) setHover(null);
    if (d.hot !== undefined) setHot(null);
  };

  // ---------- tooltip ----------
  const tipPin = hover ?? (mode === "board" ? p.pin : null);
  let tip: JSX.Element | null = null;
  if (hot !== null && spots[hot]) {
    const s = spots[hot];
    tip = <div className="bench-tip" style={{ left: `${(s.q[0] / W) * 100}%`, top: `${(s.q[1] / H) * 100}%` }}><b>{s.h.title}</b><div className="to">{s.h.body}</div></div>;
  } else if (tipPin) {
    const pn = pins.find((x) => x.id === tipPin);
    if (pn) {
      const q = v.P(pn.x, pn.y, pinZ), info = pinInfo(pn.id), on = wires.filter((w) => String(w.boardPin) === pn.id);
      tip = (
        <div className="bench-tip" style={{ left: `${(q[0] / W) * 100}%`, top: `${(q[1] / H) * 100}%` }}>
          <b>{silkName(pn.id)}</b>{info && <span className="lbl"> {info.label}</span>}
          {info?.caps?.length ? <div className="caps">{info.caps.map((c) => <span key={c} className="cap">{CAP[c] ?? c}</span>)}{info.strapping && <span className="cap warn">Boot pin</span>}{info.reserved && <span className="cap warn">{info.reserved}</span>}</div> : null}
          <div className="to">{info?.note ?? (info ? "" : pinRole(pn.id))}</div>
          {info && <div className="to">{on.length ? on.map((w) => <div key={wid(w)}>Wired to <b>{p.parts.find((x) => x.key === w.part)?.title ?? w.part} {w.partPin}</b> · <span className="font-mono">{w.signalName}</span></div>) : "Free: nothing wired here."}</div>}
          {tracedWire && info && String(tracedWire.boardPin) !== pn.id && <div className="hint">Click to move {tracedWire.signalName} here</div>}
        </div>
      );
    }
  }

  const sigWires = wires.filter((w) => w.boardPin);
  const hint = mode === "board" ? "Meet the board · hover a pin" : tracedWire ? `${tracedWire.signalName}: click a pin to move it` : p.selPart ? `${insts.find((x) => x.id === p.selPart)?.part.title ?? ""}: its wires are lit` : "Hover a pin · click a wire";

  return (
    <section className="bench" aria-label={`Wiring bench for ${board.name}`}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${board.name}${showParts ? ` with ${insts.length} parts and ${sigWires.length} wires` : ""}`}
        onClick={onClick} onMouseOver={onOver} onMouseOut={onOut} onPointerDown={onDown} onPointerMove={onMoveP} onPointerUp={onUp}>
        <defs>
          <pattern id="bench-g1" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--paper-grid)" /></pattern>
          <pattern id="bench-g2" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#bench-g1)" /><path d="M100 0H0V100" fill="none" stroke="var(--paper-grid-2)" /></pattern>
          <filter id="bench-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
          <filter id="bench-card" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation=".8" floodOpacity=".12" /><feDropShadow dx="0" dy="8" stdDeviation="10" floodOpacity=".10" /></filter>
        </defs>
        <rect width={W} height={H} fill="url(#bench-g2)" />
        <g className="bench-traces" aria-hidden="true">
          <path d="M0 560 H120 L160 600 H260" /><circle cx="264" cy="600" r="4" /><path d="M0 590 H90 L110 610 V640" />
          <path d="M1000 90 H880 L850 60 H760" /><circle cx="756" cy="60" r="4" /><path d="M1000 120 H900 L880 140 V180" /><circle cx="880" cy="184" r="4" />
        </g>
        {scene}
        {wireEls}
        {pinEls}
        {overlay}
      </svg>
      <div className="bench-top">
        <div className="bench-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={mode === "board"} onClick={() => p.setMode("board")}>Board</button>
          <button type="button" aria-pressed={mode === "project"} onClick={() => p.setMode("project")}>Project</button>
        </div>
        <span className="bench-hint">{hint}</span>
      </div>
      {tip}
      {schem && (
        <div className="bench-schem">
          <h3>Schematic <span>signal wires</span></h3>
          <svg viewBox={`0 0 320 ${Math.max(1, sigWires.length) * 18 + 16}`} role="img" aria-label="Schematic of the signal wires">
            <rect x="4" y="6" width="64" height={Math.max(1, sigWires.length) * 18 + 4} rx="6" fill="none" stroke="var(--label)" strokeWidth="1.3" />
            <text x="36" y={(Math.max(1, sigWires.length) * 18 + 16) / 2 + 3} textAnchor="middle">{board.name.split(" ")[0]}</text>
            {sigWires.map((w, i) => { const y = 18 + i * 18; return (
              <g key={wid(w)}><text x="72" y={y + 3} className="muted">{silkName(String(w.boardPin))}</text><line x1="104" y1={y} x2="196" y2={y} stroke={p.color[wid(w)]} strokeWidth="2" /><circle cx="196" cy={y} r="2.4" fill={p.color[wid(w)]} /><text x="202" y={y + 3}>{(p.parts.find((x) => x.key === w.part)?.title ?? w.part).slice(0, 12)} {w.partPin}</text></g>
            ); })}
            {!sigWires.length && <text x="80" y="20" className="muted">No signal wires yet</text>}
          </svg>
        </div>
      )}
      <div className="bench-tools" role="toolbar" aria-label="View controls">
        <button type="button" aria-label="Turn left" title="Turn left" onClick={() => tween("angle", target.current.angle - 90)}><Icon name="rot-l" /></button>
        <button type="button" aria-label="Turn right" title="Turn right" onClick={() => tween("angle", target.current.angle + 90)}><Icon name="rot-r" /></button>
        <span className="sep" aria-hidden="true" />
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => tween("zoom", Math.max(0.6, target.current.zoom / 1.25))}><Icon name="minus" /></button>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => tween("zoom", Math.min(2.4, target.current.zoom * 1.25))}><Icon name="plus" /></button>
        <button type="button" aria-label="Reset view" title="Reset view" onClick={() => { tween("angle", BASE_ANGLE); tween("zoom", 1); p.setTraced(null); p.setSelPart(null); }}><Icon name="fit" /></button>
        <span className="sep" aria-hidden="true" />
        <button type="button" aria-pressed={labels} aria-label="Labels" title="Labels" onClick={() => setLabels(!labels)}><Icon name="tag" /></button>
        <button type="button" aria-pressed={flow} aria-label="Show current flow" title="Show current flow" onClick={() => setFlow(!flow)}><Icon name="pulse" /></button>
        <button type="button" aria-pressed={schem} aria-label="Show schematic" title="Show schematic" onClick={() => setSchem(!schem)}><Icon name="schem" /></button>
      </div>
    </section>
  );
}

const CAP: Record<string, string> = { digital: "Digital", output: "Output", input: "Input", pwm: "PWM", adc: "Analog", adc1: "ADC1", adc2: "ADC2", touch: "Touch", dac: "DAC", i2c: "I²C", spi: "SPI", uart: "UART", analog: "Analog" };
const pinRole = (id: string) => ({ GND: "Ground. Join every ground together.", VIN: "Power in (5 V from USB, or 5–12 V here).", "5V": "5 V out.", "3V3": "3.3 V out.", EN: "Reset: pull low to restart.", RST: "Reset.", AREF: "Analog reference voltage.", IOREF: "Logic voltage reference." } as Record<string, string>)[id] ?? "Not a GPIO pin.";

function wrap2(text: string, n: number): [string, string] {
  if (text.length <= n) return [text, ""];
  const cut = text.lastIndexOf(" ", n);
  const a = text.slice(0, cut > 0 ? cut : n), b = text.slice(a.length).trim();
  return [a, b.length > n ? `${b.slice(0, n - 1)}…` : b];
}

function antenna(sh: Shape) {
  const x = sh.x ?? 0, y0 = (sh.y ?? 0) - (sh.d ?? 0) / 2 + 0.9, w = (sh.w ?? 10) * 0.8, n = 5;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const xx = x - w / 2 + (i * w) / n;
    pts.push(`${xx.toFixed(2)},${(i % 2 ? y0 + 2.4 : y0).toFixed(2)}`, `${xx.toFixed(2)},${(i % 2 ? y0 : y0 + 2.4).toFixed(2)}`);
  }
  return pts.join(" ");
}

function hotPoint(v: View, h: { x?: number; y?: number; z?: number; row?: number }, m: BoardModel, pins: ReturnType<typeof boardPins>, pinZ: number): Pt {
  if (h.row !== undefined) {
    const rp = pins.filter((p) => p.row === h.row);
    const mid = rp[Math.floor(rp.length / 3)] ?? rp[0];
    return mid ? v.P(mid.x, mid.y, pinZ - 0.4) : v.P(0, 0, m.size[2]);
  }
  return v.P(h.x ?? 0, h.y ?? 0, (h.z ?? 0) + m.size[2]);
}

function Silk({ v, model, pins, name }: { v: View; model: BoardModel; pins: ReturnType<typeof boardPins>; name: (id: string) => string }) {
  const [bw, bd, bt] = model.size, fill = model.silk ?? "#e9eef8";
  return (
    <g transform={v.plane(bt + 0.01)} className="bench-silk">
      {pins.map((p) => (
        <text key={`${p.row}-${p.i}`} x={p.x < 0 ? p.x + 1.9 : p.x - 1.9} y={p.y + 0.4} fontSize={1.05} fill={fill} textAnchor={p.x < 0 ? "start" : "end"}>{name(p.id)}</text>
      ))}
      {model.label && <text x={model.label_at?.[0] ?? 0} y={model.label_at?.[1] ?? 0} fontSize={1.7} fill={fill} textAnchor="middle">{model.label}</text>}
      <rect x={-bw / 2 + 0.8} y={-bd / 2 + 0.8} width={bw - 1.6} height={bd - 1.6} rx={1.6} fill="none" stroke={fill} strokeOpacity={0.25} strokeWidth={0.25} />
    </g>
  );
}
