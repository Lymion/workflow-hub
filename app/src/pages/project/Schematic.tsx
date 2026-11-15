/** Schematic view of the Wiring tab: a clean circuit drawing of the board and parts (schematicLayout.ts).
 *  Click a wire to trace it, click a part to see its pins, drag to move, scroll to zoom. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { fallbackBoard } from "../../lib/iso";
import { benchHeight, type BenchProps } from "./benchData";
import { layoutSchematic, type SPin } from "./schematicLayout";

type VB = { x: number; y: number; w: number; h: number };

export function Schematic(p: BenchProps) {
  const { board, parts, wires } = p;
  const model = board.model ?? fallbackBoard(board.header, board.color ?? "#1F3A5F");
  const silkName = (id: string) => (board.pins.some((x) => x.id === id) ? model.names?.[id] ?? `${/^\d/.test(id) ? model.prefix ?? "" : ""}${id}` : id);
  const pinLabel = (id: string) => board.pins.find((x) => x.id === id)?.label ?? id;
  const s = useMemo(() => layoutSchematic(board, parts, wires), [board, parts.map((x) => `${x.key}:${x.qty}`).join(), wires.map((w) => `${w.part}${w.instance}${w.partPin}${w.boardPin}`).join()]);

  // fill the window, like the 3D bench
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  useEffect(() => {
    const el = host.current!, main = el.closest("main");
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: benchHeight(el) });
    });
    ro.observe(el);
    if (main) ro.observe(main);
    return () => ro.disconnect();
  }, []);

  // camera: a viewBox that fits the drawing, then follows drag and zoom
  const fit = (): VB => {
    const b = s.bounds, pad = 24, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const top = 64, bottom = 76; // keep clear of the top bar and the toolbar
    const scale = Math.min((size.w - pad * 2) / bw, (size.h - top - bottom) / bh, 2.2);
    const w = size.w / scale, h = size.h / scale;
    return { x: (b.x0 + b.x1) / 2 - w / 2, y: (b.y0 + b.y1) / 2 - h / 2 + (bottom - top) / 2 / scale, w, h };
  };
  const [vb, setVb] = useState<VB | null>(null);
  const view = vb ?? fit();
  useEffect(() => setVb(null), [s, size.w, size.h]);
  const zoom = (k: number, cx = 0.5, cy = 0.5) => {
    const v = view, w = Math.min(Math.max(v.w / k, 120), 8000), h = (w * v.h) / v.w;
    setVb({ x: v.x + (v.w - w) * cx, y: v.y + (v.h - h) * cy, w, h });
  };
  const drag = useRef<{ x: number; y: number; v: VB; moved: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => { if (e.button !== 0) return; drag.current = { x: e.clientX, y: e.clientY, v: view, moved: false }; };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); }
    const k = d.v.w / size.w;
    setVb({ ...d.v, x: d.v.x - dx * k, y: d.v.y - dy * k });
  };
  const onUp = () => { setTimeout(() => { drag.current = null; }, 0); };
  const clicked = () => !drag.current?.moved;
  useEffect(() => {
    const el = host.current!;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  // wires to the same board pin are one net: draw them in one colour
  const netColor = (w: { boardPin: string | null }) => { const first = wires.find((x) => String(x.boardPin) === String(w.boardPin)); return first ? p.color[`${first.part}#${first.instance}#${first.partPin}`] : "var(--label)"; };
  const [labels, setLabels] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const lit = hover ?? p.traced;
  const litPart = p.selPart;
  const dimWire = (id: string, part: string) => (lit ? lit !== id : litPart ? litPart !== part : false);

  const power = (pn: SPin, key: string) => {
    const [x, y] = pn.tip;
    if (pn.kind === "ground") return (
      <g key={key} className="sch-sym"><line x1={pn.x} y1={pn.y} x2={x} y2={y} /><path d={`M${x - 10} ${y}H${x + 10}M${x - 6} ${y + 4}H${x + 6}M${x - 2.5} ${y + 8}H${x + 2.5}`} /></g>
    );
    return (
      <g key={key} className="sch-sym"><line x1={pn.x} y1={pn.y} x2={x} y2={y} /><path d={`M${x - 7} ${y + 6}L${x} ${y - 2}L${x + 7} ${y + 6}`} />
        <text x={x} y={y - 8} textAnchor="middle" className="sch-volt">{pn.voltage ?? "V+"}</text></g>
    );
  };

  const hint = p.traced ? `${wires.find((w) => `${w.part}#${w.instance}#${w.partPin}` === p.traced)?.signalName ?? ""}: change its pin in the panel` : "Click a wire or part · drag to move · scroll to zoom";
  const sig = wires.filter((w) => w.boardPin).length;

  return (
    <section className={`bench bench-sch ${p.full ? "bench-full" : ""}`} aria-label={`Schematic of ${board.name}`}>
      <div ref={host} className="sch-host" style={{ height: size.h }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <svg width={size.w} height={size.h} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img" aria-label={`Schematic: ${board.name}, ${s.parts.length} parts, ${sig} signal wires`}
          onClick={() => { if (clicked()) { p.setTraced(null); p.setSelPart(null); } }}>
          <defs>
            <pattern id="sch-g1" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="var(--paper-grid)" strokeWidth={0.6} /></pattern>
            <pattern id="sch-g2" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#sch-g1)" /><path d="M100 0H0V100" fill="none" stroke="var(--paper-grid-2)" /></pattern>
            <filter id="sch-lift" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="0.6" stdDeviation="0.6" floodOpacity=".14" /><feDropShadow dx="0" dy="6" stdDeviation="8" floodOpacity=".10" /></filter>
          </defs>
          <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="url(#sch-g2)" />

          {/* wires under the parts */}
          {s.wires.map((w) => {
            const part = `${w.w.part}#${w.w.instance}`, dim = dimWire(w.id, part), hot = lit === w.id || litPart === part;
            const d = `M${w.pts.map(([x, y]) => `${x} ${y}`).join("L")}`;
            const text = w.w.signalName.length > 15 ? `${w.w.signalName.slice(0, 14)}…` : w.w.signalName;
            return (
              <g key={w.id} className={`sch-wire ${dim ? "dim" : ""} ${hot ? "hot" : ""}`} onPointerEnter={() => setHover(w.id)} onPointerLeave={() => setHover(null)}
                onClick={(e) => { e.stopPropagation(); if (clicked()) p.setTraced(p.traced === w.id ? null : w.id); }}>
                <title>{`${w.w.signalName}: ${parts.find((x) => x.key === w.w.part)?.title ?? w.w.part} ${w.w.partPin} → ${silkName(String(w.w.boardPin))} (${pinLabel(String(w.w.boardPin))})`}</title>
                <path d={d} className="hit" />
                <path d={d} className={`ln ${p.bad(w.w) ? "bad" : ""}`} stroke={netColor(w.w)} />
                {w.junction && <circle cx={w.junction[0]} cy={w.junction[1]} r={3.2} fill={netColor(w.w)} className="sch-dot" />}
                {labels && <text x={w.label[0]} y={w.label[1]} textAnchor={w.side === "left" ? "start" : "end"} className="sch-net">{text}</text>}
              </g>
            );
          })}

          {/* the board */}
          <g className="sch-board" filter="url(#sch-lift)">
            <rect x={s.board.x} y={s.board.y} width={s.board.w} height={s.board.h} rx={8} className="body" />
            <path d={`M${s.board.x} ${s.board.y + 34}V${s.board.y + 8}a8 8 0 0 1 8 -8H${s.board.x + s.board.w - 8}a8 8 0 0 1 8 8V${s.board.y + 34}Z`} fill={s.board.color} />
          </g>
          <text x={s.board.x + s.board.w / 2} y={s.board.y + 22} textAnchor="middle" className="sch-title on-dark">{s.board.name}</text>
          {s.board.pins.map((pn, i) => pn.kind === "signal" ? (
            <g key={`b${i}`} className="sch-pin">
              <line x1={pn.x} y1={pn.y} x2={pn.tip[0]} y2={pn.tip[1]} />
              <text x={pn.side === "left" ? pn.x + 7 : pn.x - 7} y={pn.y + 3.5} textAnchor={pn.side === "left" ? "start" : "end"} className="sch-pinname">{silkName(pn.name)}</text>
              <text x={pn.side === "left" ? pn.tip[0] + 2 : pn.tip[0] - 2} y={pn.y - 3} textAnchor={pn.side === "left" ? "start" : "end"} className="sch-pinno">{pinLabel(pn.name).replace("GPIO ", "IO").replace(/\s*\(.*\)/, "")}</text>
            </g>
          ) : power(pn, `bp${i}`))}

          {/* parts */}
          {s.parts.map((pt) => {
            const on = litPart === pt.id, dim = (litPart && !on) || (lit && !wires.some((w) => `${w.part}#${w.instance}#${w.partPin}` === lit && `${w.part}#${w.instance}` === pt.id));
            const open = (e: React.MouseEvent) => { e.stopPropagation(); if (clicked()) p.setSelPart(on ? null : pt.id); };
            const cx = pt.x + pt.w / 2, cy = pt.y + pt.h / 2;
            const title = pt.title.length > 24 ? `${pt.title.slice(0, 23)}…` : pt.title;
            return (
              <g key={pt.id} className={`sch-part ${on ? "on" : ""} ${dim ? "dim" : ""}`} onClick={open} role="button" tabIndex={0} aria-label={`${pt.title}: show its pins`}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.setSelPart(on ? null : pt.id); } }}>
                {pt.symbol === "block" && <>
                  <g filter="url(#sch-lift)"><rect x={pt.x} y={pt.y} width={pt.w} height={pt.h} rx={6} className="body" /></g>
                  <rect x={pt.x} y={pt.y} width={pt.w} height={pt.h} rx={6} className="body ring" />
                  <path d={`M${pt.x} ${pt.y + 26}V${pt.y + 6}a6 6 0 0 1 6 -6H${pt.x + pt.w - 6}a6 6 0 0 1 6 6V${pt.y + 26}Z`} fill={pt.color} opacity={0.9} />
                  <text x={cx} y={pt.y + 17} textAnchor="middle" className="sch-glyph on-dark">{pt.glyph || pt.key.toUpperCase().slice(0, 4)}</text>
                </>}
                {pt.symbol === "switch" && (() => { const y = cy, x0 = pt.side === "left" ? pt.x : pt.x + pt.w, x1 = pt.side === "left" ? pt.x + pt.w : pt.x, a = pt.side === "left" ? 1 : -1;
                  return <g className="sch-sym">
                    <circle cx={x0 + a * 22} cy={y} r={2.6} /><circle cx={x1 - a * 22} cy={y} r={2.6} />
                    <line x1={x1} y1={y} x2={x1 - a * 19.4} y2={y} /><path d={`M${x0 + a * 22} ${y}V${y + 26}`} />
                    <line x1={x0 + a * 16} y1={y - 12} x2={x1 - a * 16} y2={y - 12} /><line x1={cx} y1={y - 12} x2={cx} y2={y - 22} /><line x1={cx - 8} y1={y - 22} x2={cx + 8} y2={y - 22} />
                    <path d={`M${x0 + a * 22 - 10} ${y + 26}H${x0 + a * 22 + 10}M${x0 + a * 22 - 6} ${y + 30}H${x0 + a * 22 + 6}M${x0 + a * 22 - 2.5} ${y + 34}H${x0 + a * 22 + 2.5}`} />
                    <rect x={pt.x} y={pt.y - 18} width={pt.w} height={pt.h + 50} className="hitbox" />
                  </g>; })()}
                {pt.symbol === "buzzer" && (() => { const y = cy, x1 = pt.side === "left" ? pt.x + pt.w : pt.x, a = pt.side === "left" ? 1 : -1, bx = cx - 8;
                  return <g className="sch-sym">
                    <line x1={x1} y1={y} x2={bx + a * 8} y2={y} />
                    <rect x={bx - 4} y={y - 10} width={8} height={20} className="fillbg" />
                    <path d={`M${bx - a * 4} ${y - 10}L${bx - a * 18} ${y - 20}V${y + 20}L${bx - a * 4} ${y + 10}`} className="fillbg" />
                    <path d={`M${bx} ${y + 10}V${y + 26}M${bx - 10} ${y + 26}H${bx + 10}M${bx - 6} ${y + 30}H${bx + 6}M${bx - 2.5} ${y + 34}H${bx + 2.5}`} />
                    <rect x={pt.x} y={pt.y - 18} width={pt.w} height={pt.h + 50} className="hitbox" />
                  </g>; })()}
                {pt.symbol === "motor" && <g className="sch-sym">
                  <circle cx={cx} cy={cy} r={22} className="fillbg" /><text x={cx} y={cy + 6} textAnchor="middle" className="sch-m">M</text>
                  <line x1={cx} y1={cy - 22} x2={cx} y2={pt.y} /><line x1={cx} y1={cy + 22} x2={cx} y2={pt.y + pt.h} />
                  <rect x={pt.x} y={pt.y - 40} width={pt.w} height={pt.h + 80} className="hitbox" />
                </g>}
                <text x={cx} y={pt.titleY} textAnchor="middle" className="sch-title">{title}</text>
                {pt.pins.map((pn, i) => {
                  if (pn.kind === "power" || pn.kind === "ground") return power(pn, `${pt.id}p${i}`);
                  if (pt.symbol === "motor") return (
                    <g key={`${pt.id}p${i}`} className="sch-pin"><line x1={pn.x} y1={pn.y} x2={pn.tip[0]} y2={pn.tip[1]} />
                      <text x={pn.tip[0] + 6} y={pn.y + (i === 0 ? -6 : 12)} className="sch-pinname">{pn.name}</text>
                      <text x={pn.tip[0]} y={pn.tip[1] + (i === 0 ? -5 : 12)} textAnchor="middle" className="sch-pinno">to driver</text></g>
                  );
                  const inner = pn.side === "left" ? pn.x + 7 : pn.x - 7, anchor = pn.side === "left" ? "start" : "end";
                  return (
                    <g key={`${pt.id}p${i}`} className={`sch-pin ${pn.kind === "signal" && !pn.wired ? "free" : ""}`}>
                      <line x1={pn.x} y1={pn.y} x2={pn.tip[0]} y2={pn.tip[1]} />
                      {pt.symbol === "block" && <text x={inner} y={pn.y + 3.5} textAnchor={anchor} className="sch-pinname">{pn.name}</text>}
                      {pn.kind === "motor" && <text x={pn.tip[0] + (pn.side === "left" ? 2 : -2)} y={pn.y - 3} textAnchor={pn.side === "left" ? "start" : "end"} className="sch-pinno">to motor</text>}
                      {pn.kind === "signal" && !pn.wired && <text x={pn.tip[0] + (pn.side === "left" ? -4 : 4)} y={pn.y + 3.5} textAnchor={pn.side === "left" ? "end" : "start"} className="sch-pinno">not wired</text>}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="bench-top">
        <div className="bench-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={false} onClick={() => { p.setSelPart(null); p.setMode("board"); }}>Board</button>
          <button type="button" aria-pressed={false} onClick={() => p.setMode("project")}>Project</button>
          <button type="button" aria-pressed onClick={() => setVb(null)}>Schematic</button>
        </div>
        <span className="bench-hint">{hint}</span>
      </div>
      <div className="bench-tools" role="toolbar" aria-label="View controls">
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1 / 1.25)}><Icon name="minus" /></button>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)}><Icon name="plus" /></button>
        <button type="button" aria-label="Fit to view" title="Fit to view" onClick={() => { setVb(null); p.setTraced(null); p.setSelPart(null); }}><Icon name="fit" /></button>
        <span className="sep" aria-hidden="true" />
        <button type="button" aria-pressed={labels} aria-label="Signal names" title="Signal names" onClick={() => setLabels(!labels)}><Icon name="tag" /></button>
        <span className="sep" aria-hidden="true" />
        <button type="button" aria-pressed={!!p.full} aria-label={p.full ? "Exit fullscreen" : "Fullscreen"} title={p.full ? "Exit fullscreen (Esc)" : "Fullscreen"} onClick={p.toggleFull}><Icon name={p.full ? "min" : "max"} /></button>
      </div>
    </section>
  );
}
