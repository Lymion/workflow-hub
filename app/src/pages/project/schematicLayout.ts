/** Schematic layout for the Wiring tab: the board as a chip block in the middle, each part as a symbol or a
 *  block beside it, and every signal wire as straight lines with right-angle bends. Power and ground pins get
 *  the usual symbols instead of wires. Plain functions, no React. */
import { boardPins, fallbackBoard } from "../../lib/iso";
import { WIREABLE, wid, type BenchBoard, type BenchPart, type BenchWire } from "./benchData";

export const PITCH = 20; // distance between pins
const STUB = 20; // pin line length outside a body
const LABEL_RUN = 100; // horizontal run next to a part, room for the signal name
const LANE = 12; // spacing between vertical wire lanes
const GAP = 30; // between stacked parts
const HEAD = 44; // block title band + first pin offset

export type Side = "left" | "right";
/** `side` is the edge of the body the pin sticks out of. */
export type SPin = { name: string; x: number; y: number; tip: [number, number]; side: Side | "top" | "bottom"; kind: "signal" | "power" | "ground" | "motor"; voltage?: string; wired?: string };
export type SPart = {
  id: string; key: string; title: string; color: string; glyph: string; symbol: "block" | "switch" | "buzzer" | "motor";
  side: Side; x: number; y: number; w: number; h: number; titleY: number; pins: SPin[];
};
export type SWire = { id: string; w: BenchWire; pts: [number, number][]; label: [number, number]; side: Side; junction?: [number, number] };
export type SBoard = { x: number; y: number; w: number; h: number; name: string; color: string; pins: SPin[] };
export type Schematic = { board: SBoard; parts: SPart[]; wires: SWire[]; bounds: { x0: number; y0: number; x1: number; y1: number } };

type Draft = { id: string; part: BenchPart; inst: number; ws: BenchWire[] };
const kindOf = (mode?: string): SPin["kind"] => {
  const m = (mode ?? "").toUpperCase();
  return m === "POWER" ? "power" : m === "GROUND" ? "ground" : m === "MOTOR" ? "motor" : "signal";
};
const blank = (): [number, number] => [0, 0];

export function layoutSchematic(board: BenchBoard, parts: BenchPart[], wires: BenchWire[]): Schematic {
  const model = board.model ?? fallbackBoard(board.header, board.color ?? "#1F3A5F");
  const bpins = boardPins(model);
  const physSide = (id: string): Side => ((bpins.find((p) => p.id === id)?.x ?? -1) < 0 ? "left" : "right");
  const orderOfPin = (id: string) => { const p = bpins.find((x) => x.id === id); return p ? p.row * 1000 + p.i : 1e6; };
  const live = wires.filter((w) => w.boardPin);
  const drafts: Draft[] = parts.filter((p) => p.section !== "boards" && (p.meta.pins ?? []).length).flatMap((p) =>
    Array.from({ length: p.qty }, (_, i) => ({ id: `${p.key}#${i + 1}`, part: p, inst: i + 1, ws: live.filter((w) => w.part === p.key && w.instance === i + 1) })));

  // ---- sides. A schematic may draw a board pin on either side of the chip, so the pins follow the parts:
  //      parts that share a board pin (an I2C bus) stay together, and each group goes to the shorter side.
  const parent = new Map(drafts.map((d) => [d.id, d.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  const byPin = new Map<string, string>();
  for (const d of drafts) for (const w of d.ws) {
    const k = String(w.boardPin), o = byPin.get(k);
    if (o) parent.set(find(d.id), find(o)); else byPin.set(k, d.id);
  }
  const groups = new Map<string, Draft[]>();
  for (const d of drafts) groups.set(find(d.id), [...(groups.get(find(d.id)) ?? []), d]);
  const room = (sp: SPart) => sp.h + roomAbove(sp) + roomBelow(sp) + GAP;
  const sideOf = new Map<string, Side>();
  const height = { left: 0, right: 0 };
  const gs = [...groups.values()].map((g) => ({ g, h: g.reduce((t, d) => t + room(build(d, "left", () => 0)), 0), wired: g.some((d) => d.ws.length) }));
  gs.sort((x, y) => Number(y.wired) - Number(x.wired) || y.h - x.h);
  for (const { g, h } of gs) {
    const ws = g.flatMap((d) => d.ws);
    const phys: Side = ws.filter((w) => physSide(String(w.boardPin)) === "left").length * 2 >= ws.length ? "left" : "right";
    const side: Side = Math.abs(height.left - height.right) < 1 ? phys : height.left < height.right ? "left" : "right";
    height[side] += h;
    for (const d of g) sideOf.set(d.id, side);
  }

  // ---- one top-to-bottom order for parts and board pins alike, so wires never cross on their way across:
  //      by group (in board pin order), then by each part's first board pin; unwired parts last
  const firstPin = (ds: Draft[]) => Math.min(1e7, ...ds.flatMap((d) => d.ws.map((w) => orderOfPin(String(w.boardPin)))));
  const groupOf = new Map<string, Draft[]>(); for (const g of groups.values()) for (const d of g) groupOf.set(d.id, g);
  const order = [...drafts].sort((x, y) => firstPin(groupOf.get(x.id)!) - firstPin(groupOf.get(y.id)!) || firstPin([x]) - firstPin([y]));
  const used: Record<Side, string[]> = { left: [], right: [] };
  for (const d of order) {
    const side = sideOf.get(d.id)!;
    for (const id of d.ws.map((w) => String(w.boardPin)).sort((x, y) => orderOfPin(x) - orderOfPin(y)))
      if (!used.left.includes(id) && !used.right.includes(id)) used[side].push(id);
  }
  const BW = 190, top = 56;
  const BH = Math.max(used.left.length, used.right.length, 3) * PITCH + top + 24;
  const bx = -BW / 2, by = -BH / 2;
  const has = (id: string) => bpins.some((p) => p.id === id);
  const bPins: SPin[] = [];
  used.left.forEach((id, k) => { const y = by + top + k * PITCH; bPins.push({ name: id, x: bx, y, tip: [bx - STUB, y], side: "left", kind: "signal" }); });
  used.right.forEach((id, k) => { const y = by + top + k * PITCH; bPins.push({ name: id, x: bx + BW, y, tip: [bx + BW + STUB, y], side: "right", kind: "signal" }); });
  const supplies = ["3V3", "5V", "VIN"].filter(has);
  supplies.forEach((id, k) => { const x = bx + BW / 2 + (k - (supplies.length - 1) / 2) * 50; bPins.push({ name: id, x, y: by, tip: [x, by - STUB], side: "top", kind: "power", voltage: id === "3V3" ? "3.3V" : id === "VIN" ? "VIN" : "5V" }); });
  if (has("GND")) bPins.push({ name: "GND", x: bx + BW / 2, y: by + BH, tip: [bx + BW / 2, by + BH + STUB], side: "bottom", kind: "ground" });
  const boardY = (id: string) => bPins.find((p) => p.kind === "signal" && p.name === id)!.tip[1];
  const boardTip = (id: string) => bPins.find((p) => p.kind === "signal" && p.name === id)!.tip;
  const sb: SBoard = { x: bx, y: by, w: BW, h: BH, name: board.name, color: board.color ?? model.color, pins: bPins };

  // ---- parts in that order, each with its pins in the order of the board pins they go to
  const at = (d: Draft) => (name: string) => { const w = d.ws.find((x) => x.partPin === name); return w ? boardY(String(w.boardPin)) : 1e6; };
  const out = order.map((d) => build(d, sideOf.get(d.id) ?? "left", at(d)));

  // ---- each side: stack the parts, then give every bent wire its own vertical lane
  const wiresOut: SWire[] = [];
  for (const side of ["left", "right"] as Side[]) {
    const mine = out.filter((p) => p.side === side);
    const sideWires = live.filter((w) => mine.some((p) => p.id === `${w.part}#${w.instance}`));
    const nLanes = Math.max(1, new Set(sideWires.map((w) => String(w.boardPin))).size); // wires to one board pin share a lane (a bus)
    const dir = side === "left" ? -1 : 1; // away from the board
    const lane0 = (side === "left" ? bx - STUB : bx + BW + STUB) + dir * 26; // lane nearest the board
    const partTipX = lane0 + dir * ((nLanes - 1) * LANE + LABEL_RUN);

    let cursor = by - 40;
    for (const p of mine) {
      const firstSig = p.pins.find((pn) => pn.kind === "signal");
      const w0 = firstSig && live.find((w) => `${w.part}#${w.instance}` === p.id && w.partPin === firstSig.name);
      const pinOff = p.symbol === "block" ? HEAD - PITCH / 2 + 4 : p.symbol === "motor" ? 0 : p.h / 2;
      const target = w0 ? boardY(String(w0.boardPin)) - pinOff : -Infinity; // line its first pin up with the board pin
      p.y = Math.max(cursor + roomAbove(p), target);
      cursor = p.y + p.h + roomBelow(p) + GAP;
      const bodyEdge = partTipX + dir * STUB; // the body side facing the board
      p.x = side === "left" ? bodyEdge - p.w : bodyEdge;
      placePins(p, side);
    }

    // lanes: wires heading up take lanes from the far side in order of their board pin; same for wires heading down
    const ends = sideWires.map((w) => {
      const p = mine.find((x) => x.id === `${w.part}#${w.instance}`)!;
      const pin = p.pins.find((pn) => pn.kind === "signal" && pn.name === w.partPin);
      return { w, a: pin ? pin.tip : ([partTipX, p.y] as [number, number]), b: boardTip(String(w.boardPin)) };
    });
    // lanes, one per board pin: pins whose wires head up take lanes from the far side in board pin order, then the rest
    const pinsOnSide = [...new Set(ends.map((e) => String(e.w.boardPin)))];
    const span = (id: string) => ends.filter((e) => String(e.w.boardPin) === id);
    const bent = (id: string) => span(id).some((e) => Math.abs(e.b[1] - e.a[1]) > 0.5);
    const up = pinsOnSide.filter((id) => bent(id) && span(id).some((e) => e.a[1] > e.b[1])).sort((x, y) => boardY(x) - boardY(y));
    const down = pinsOnSide.filter((id) => bent(id) && !up.includes(id)).sort((x, y) => boardY(y) - boardY(x));
    const laneOf = new Map<string, number>();
    [...up, ...down].forEach((id, k) => laneOf.set(id, nLanes - 1 - k));
    for (const id of pinsOnSide) {
      const es = span(id), k = laneOf.get(id), lx = lane0 + dir * (k ?? 0) * LANE;
      const far = es.reduce((m, e) => (Math.abs(e.a[1] - e.b[1]) > Math.abs(m.a[1] - m.b[1]) ? e : m), es[0]);
      for (const e of es) {
        const pts: [number, number][] = k === undefined ? [e.a, e.b] : [e.a, [lx, e.a[1]], [lx, e.b[1]], e.b];
        // where a wire joins a shared line, mark the joint with a dot
        const junction: [number, number] | undefined = es.length > 1 && k !== undefined && e !== far ? [lx, e.a[1]] : undefined;
        wiresOut.push({ id: wid(e.w), w: e.w, pts, side, label: [e.a[0] - dir * 6, e.a[1] - 5], junction });
      }
    }
  }

  // ---- bounds of everything drawn
  const xs: number[] = [bx - STUB - 30, bx + BW + STUB + 30], ys: number[] = [by - STUB - 40, by + BH + STUB + 30];
  for (const p of out) { xs.push(p.x - 40, p.x + p.w + 40); ys.push(p.y - roomAbove(p), p.y + p.h + roomBelow(p)); }
  for (const w of wiresOut) for (const [x, y] of w.pts) { xs.push(x); ys.push(y); }
  return { board: sb, parts: out, wires: wiresOut, bounds: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}

/** A part's symbol and pins, not yet placed. `at` orders the signal pins (by the board pin each goes to). */
function build(d: Draft, side: Side, at: (name: string) => number): SPart {
  const meta = d.part.meta as BenchPart["meta"] & { glyph?: string; symbol?: string };
  const pins = meta.pins ?? [];
  const sig = pins.filter((pn) => WIREABLE.has((pn.mode ?? "").toUpperCase())).sort((a, b) => at(a.name) - at(b.name));
  const symbol: SPart["symbol"] = (["switch", "buzzer", "motor"] as const).find((s) => s === meta.symbol) ?? "block";
  const facing: Side = side === "left" ? "right" : "left"; // the edge that faces the board
  const pin = (name: string, kind: SPin["kind"], edge: SPin["side"], extra: Partial<SPin> = {}): SPin => ({ name, x: 0, y: 0, tip: blank(), side: edge, kind, ...extra });
  const wired = (name: string) => d.ws.find((x) => x.partPin === name)?.signalName;
  const base = { id: d.id, key: d.part.key, title: `${d.part.title}${d.part.qty > 1 ? ` #${d.inst}` : ""}`, color: meta.color ?? "#64748B", glyph: meta.glyph ?? "", symbol, side, x: 0, y: 0, titleY: 0 };
  if (symbol === "switch" || symbol === "buzzer") {
    // two terminals: the signal pin faces the board, the other one goes to ground
    const s = sig[0] ?? pins[0];
    return { ...base, w: 84, h: 56, pins: s ? [pin(s.name, "signal", facing, { wired: wired(s.name) })] : [] };
  }
  if (symbol === "motor") return { ...base, w: 70, h: 90, pins: pins.map((pn, i) => pin(pn.name, "motor", i === 0 ? "top" : "bottom")) };
  const motor = pins.filter((pn) => kindOf(pn.mode) === "motor");
  const rows = Math.max(sig.length, motor.length, 1);
  return {
    ...base, w: 150, h: rows * PITCH + HEAD,
    pins: [
      ...sig.map((pn) => pin(pn.name, "signal", facing, { wired: wired(pn.name) })),
      ...motor.map((pn) => pin(pn.name, "motor", side)),
      ...pins.filter((pn) => kindOf(pn.mode) === "power").map((pn) => pin(pn.name, "power", "top", { voltage: (pn as { voltage?: string }).voltage })),
      ...pins.filter((pn) => kindOf(pn.mode) === "ground").map((pn) => pin(pn.name, "ground", "bottom")),
    ],
  };
}

const hasPower = (p: SPart) => p.pins.some((pn) => pn.kind === "power");
/** Space above a part for its title and power symbols, and below it for ground symbols. */
function roomAbove(p: SPart) { return p.symbol === "motor" ? 60 : p.symbol === "block" ? (hasPower(p) ? 58 : 22) : 30; }
function roomBelow(p: SPart) { return p.symbol === "motor" ? 34 : p.symbol === "block" ? (p.pins.some((pn) => pn.kind === "ground") ? 36 : 4) : 34; }

/** Put a placed part's pins on its outline, and its title above it. */
function placePins(p: SPart, side: Side) {
  const toBoard = side === "left" ? p.x + p.w : p.x, away = side === "left" ? p.x : p.x + p.w, dir = side === "left" ? 1 : -1;
  p.titleY = p.symbol === "block" ? p.y - (hasPower(p) ? 44 : 8) : p.symbol === "motor" ? p.y - 48 : p.y - 16;
  if (p.symbol === "switch" || p.symbol === "buzzer") {
    const y = p.y + p.h / 2;
    for (const pn of p.pins) { pn.x = toBoard; pn.y = y; pn.tip = [toBoard + dir * STUB, y]; }
    return;
  }
  if (p.symbol === "motor") {
    const cx = p.x + p.w / 2;
    p.pins.forEach((pn, i) => { const y = i === 0 ? p.y : p.y + p.h; pn.x = cx; pn.y = y; pn.tip = [cx, y + (i === 0 ? -STUB : STUB)]; });
    return;
  }
  let s = 0, m = 0;
  const pw = p.pins.filter((x) => x.kind === "power"), gd = p.pins.filter((x) => x.kind === "ground");
  const rowY = (k: number) => p.y + HEAD + k * PITCH - PITCH / 2 + 4;
  for (const pn of p.pins) {
    if (pn.kind === "signal") { const y = rowY(s++); pn.x = toBoard; pn.y = y; pn.tip = [toBoard + dir * STUB, y]; }
    else if (pn.kind === "motor") { const y = rowY(m++); pn.x = away; pn.y = y; pn.tip = [away - dir * STUB, y]; }
    else if (pn.kind === "power") { const x = p.x + p.w / 2 + (pw.indexOf(pn) - (pw.length - 1) / 2) * 44; pn.x = x; pn.y = p.y; pn.tip = [x, p.y - STUB]; }
    else { const x = p.x + p.w / 2 + (gd.indexOf(pn) - (gd.length - 1) / 2) * 44; pn.x = x; pn.y = p.y + p.h; pn.tip = [x, p.y + p.h + STUB]; }
  }
}
