/** Isometric bench for the Wiring tab. Boards and parts are boxes and cylinders in plan millimetres
 *  (x right, y towards the viewer, z up), projected onto an SVG. The models come from the board files
 *  and the parts' handbook chapters (`model:`), so a new board or part needs data, not code. */

export const W = 1000, H = 640;
export const K = 0.82; // how tall a millimetre of height looks
export const BASE_ANGLE = 35;

export type Shape = { kind?: "cyl"; x?: number; y?: number; z?: number; w?: number; d?: number; h: number; r?: number; color: string; top?: string; inner?: string; text?: string; antenna?: boolean };
export type Row = { x: number; y: number; pins: (string | number)[] };
export type Hotspot = { x?: number; y?: number; z?: number; row?: number; title: string; body: string };
export type BoardModel = { size: [number, number, number]; color: string; top?: string; silk?: string; pitch?: number; label?: string; label_at?: [number, number]; prefix?: string; names?: Record<string, string>; rows: Row[]; shapes?: Shape[]; hotspots?: Hotspot[] };
export type PartModel = { tag?: number; shapes: Shape[]; pins: Record<string, [number, number, number]> };
export type Poly = { points: string; fill: string };
export type Pt = [number, number];

export function shade(hex: string, f: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export type View = { P: (x: number, y: number, z: number) => Pt; depth: (x: number, y: number) => number; plane: (z: number) => string; s: number; c: number; sn: number };

export function makeView(angleDeg: number, s: number, focus: Pt, cx = W / 2, cy = H / 2 + 26): View {
  const a = (angleDeg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const [fx, fy] = focus;
  const P = (x: number, y: number, z: number): Pt => { const X = x - fx, Y = y - fy; return [cx + s * (X * c - Y * sn), cy + s * 0.5 * (X * sn + Y * c) - z * s * K]; };
  const depth = (x: number, y: number) => (x - fx) * sn + (y - fy) * c;
  // affine map for drawing flat things (silkscreen, traces) on the plane z, in plan coordinates
  const plane = (z: number) => { const o = P(0, 0, z); return `matrix(${(s * c).toFixed(4)} ${(s * 0.5 * sn).toFixed(4)} ${(-s * sn).toFixed(4)} ${(s * 0.5 * c).toFixed(4)} ${o[0].toFixed(2)} ${o[1].toFixed(2)})`; };
  return { P, depth, plane, s, c, sn };
}

export const pts = (arr: Pt[]) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

/** The visible faces of a box, back to front. */
export function box(v: View, b: Shape): Poly[] {
  const x = b.x ?? 0, y = b.y ?? 0, z = b.z ?? 0, w = b.w ?? 1, d = b.d ?? 1;
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - d / 2, y1 = y + d / 2, z1 = z + b.h;
  const out: Poly[] = [];
  const sides: { n: Pt; q: [Pt, Pt] }[] = [
    { n: [0, -1], q: [[x0, y0], [x1, y0]] }, { n: [1, 0], q: [[x1, y0], [x1, y1]] },
    { n: [0, 1], q: [[x1, y1], [x0, y1]] }, { n: [-1, 0], q: [[x0, y1], [x0, y0]] },
  ];
  for (const sd of sides) {
    if (sd.n[0] * v.sn + sd.n[1] * v.c <= 0.001) continue; // faces away from the viewer
    const f = sd.n[0] * v.c - sd.n[1] * v.sn < 0 ? -0.16 : -0.36; // light from the upper left
    const [p, q] = sd.q;
    out.push({ points: pts([v.P(p[0], p[1], z), v.P(q[0], q[1], z), v.P(q[0], q[1], z1), v.P(p[0], p[1], z1)]), fill: shade(b.color, f) });
  }
  out.push({ points: pts([v.P(x0, y0, z1), v.P(x1, y0, z1), v.P(x1, y1, z1), v.P(x0, y1, z1)]), fill: b.top ?? shade(b.color, 0.05) });
  return out;
}

/** An upright cylinder: its front wall, its lid, and an optional dark centre (a speaker mesh). */
export function cyl(v: View, c: Shape): Poly[] {
  const x = c.x ?? 0, y = c.y ?? 0, z = c.z ?? 0, r = c.r ?? 2, N = 30;
  const ring = (zz: number, k = 1) => Array.from({ length: N }, (_, i) => { const t = (i / N) * Math.PI * 2; return v.P(x + r * k * Math.cos(t), y + r * k * Math.sin(t), zz); });
  const b = ring(z), t = ring(z + c.h);
  let li = 0, ri = 0;
  b.forEach((p, i) => { if (p[0] < b[li][0]) li = i; if (p[0] > b[ri][0]) ri = i; });
  const walk = (dir: number) => { const o: Pt[] = []; for (let i = li; ; i = (i + dir + N) % N) { o.push(b[i]); if (i === ri) break; } return o; };
  const f1 = walk(1), f2 = walk(-1), avg = (a: Pt[]) => a.reduce((s, p) => s + p[1], 0) / a.length;
  const front = avg(f1) > avg(f2) ? f1 : f2, up = c.h * v.s * K;
  const out: Poly[] = [
    { points: pts(front.concat(front.slice().reverse().map((p) => [p[0], p[1] - up] as Pt))), fill: shade(c.color, -0.22) },
    { points: pts(t), fill: c.top ?? shade(c.color, 0.1) },
  ];
  if (c.inner) out.push({ points: pts(ring(z + c.h, 0.68)), fill: c.inner });
  return out;
}

export const shapePolys = (v: View, sh: Shape) => (sh.kind === "cyl" ? cyl(v, sh) : box(v, sh));

/** Soft shadow under an object's footprint. */
export function footprint(v: View, sh: Shape, dx: number, dy: number): string {
  const w = sh.kind === "cyl" ? (sh.r ?? 2) * 2 : sh.w ?? 1, d = sh.kind === "cyl" ? (sh.r ?? 2) * 2 : sh.d ?? 1;
  const x = (sh.x ?? 0) + dx, y = (sh.y ?? 0) + dy, pad = 1.5;
  return pts([[x - w / 2 - pad, y - d / 2 - pad], [x + w / 2 + pad, y - d / 2 - pad], [x + w / 2 + pad, y + d / 2 + pad], [x - w / 2 - pad, y + d / 2 + pad]].map(([a, b]) => { const p = v.P(a, b, 0); return [p[0] + 5, p[1] + 7] as Pt; }));
}

/** A wire as a cable arcing up between two screen points. */
export function cable(a: Pt, b: Pt) {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]), lift = 26 + dist * 0.16;
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)} C${a[0].toFixed(1)} ${(a[1] - lift).toFixed(1)} ${b[0].toFixed(1)} ${(b[1] - lift).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}

/** Board pins with plan positions, from the model's header rows ('' is a gap). */
export function boardPins(m: BoardModel) {
  const pitch = m.pitch ?? 2.54;
  return m.rows.flatMap((row, r) => row.pins.map((id, i) => ({ id: String(id), row: r, i, x: row.x, y: row.y + i * pitch })).filter((p) => p.id !== ""));
}

/** A board drawn from its header alone, for board files without a model. */
export function fallbackBoard(header: { left: string[]; right: string[] } | undefined, color: string): BoardModel {
  const L = header?.left ?? [], R = header?.right ?? [], n = Math.max(L.length, R.length, 8);
  const d = n * 2.54 + 14, y0 = -((n - 1) * 2.54) / 2 + 3;
  return {
    size: [24, d, 1.6], color, pitch: 2.54, rows: [{ x: -9.5, y: y0, pins: L }, { x: 9.5, y: y0, pins: R }],
    shapes: [{ y: -d / 2 + 3, w: 8, d: 5, h: 2.8, color: "#b4bac4", top: "#cfd4db" }, { y: 0, w: 8, d: 8, h: 1.2, color: "#24272e" }],
  };
}

/** A part drawn as a coloured block with its wireable pins on a header, for parts without a model. */
export function fallbackPart(color: string, pinNames: string[]): PartModel {
  const n = Math.max(1, pinNames.length), w = Math.max(22, n * 2.54 + 10);
  return {
    tag: 14,
    shapes: [{ w, d: 16, h: 6, color }, { y: 6.8, w: n * 2.54, d: 2.5, z: 6, h: 2.6, color: "#14171d" }],
    pins: Object.fromEntries(pinNames.map((p, i) => [p, [(i - (n - 1) / 2) * 2.54, 6.8, 9] as [number, number, number]])),
  };
}

export function bounds(polys: { points: string }[]) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of polys) for (const pair of p.points.split(" ")) {
    const [x, y] = pair.split(",").map(Number);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1 };
}

/** Place part instances around the board without overlaps. Each part looks for the free spot nearest its
 *  preferred place (beside the board on the side its wires go to, or behind it), checked in screen space at the
 *  base angle with room for its name tag. Returns plan positions. */
export function layoutParts(items: { id: string; side: "left" | "right" | "back"; shapes: Shape[]; tag: number; tagPx?: number }[], boardShapes: Shape[]): Record<string, Pt> {
  const v = makeView(BASE_ANGLE, 1, [0, 0], 0, 0);
  const ASSUMED_SCALE = 3.2; // name tags are fixed pixel widths; the bench usually draws at 3-4 px/mm
  const rectOf = (shapes: Shape[], tag = 0, tagPx = 0) => {
    const b = bounds(shapes.flatMap((sh) => shapePolys(v, sh)));
    const cx = (b.x0 + b.x1) / 2, half = Math.max((b.x1 - b.x0) / 2, tagPx / ASSUMED_SCALE / 2);
    return { x0: cx - half, x1: cx + half, y0: Math.min(b.y0, -tag * K - 44 / ASSUMED_SCALE), y1: b.y1 };
  };
  const M = 7; // breathing room between things, in mm-ish screen units
  const taken = [rectOf(boardShapes)];
  const brd = taken[0];
  const hit = (r: { x0: number; x1: number; y0: number; y1: number }) => taken.some((t) => r.x0 < t.x1 + M && r.x1 > t.x0 - M && r.y0 < t.y1 + M && r.y1 > t.y0 - M);
  const a = (BASE_ANGLE * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const toPlan = (X: number, Y: number): Pt => { const u = X, w = 2 * Y; return [u * c + w * sn, -u * sn + w * c]; };
  const out: Record<string, Pt> = {};
  // bigger parts first, so small ones fill the gaps
  const order = items.map((it) => ({ ...it, r: rectOf(it.shapes, it.tag, it.tagPx) })).sort((p, q) => (q.r.x1 - q.r.x0) * (q.r.y1 - q.r.y0) - (p.r.x1 - p.r.x0) * (p.r.y1 - p.r.y0));
  for (const it of order) {
    const hw = (it.r.x1 - it.r.x0) / 2, hh = (it.r.y1 - it.r.y0) / 2, cxL = (it.r.x0 + it.r.x1) / 2, cyL = (it.r.y0 + it.r.y1) / 2;
    const sign = it.side === "left" ? -1 : it.side === "right" ? 1 : 0;
    const X0 = sign ? (sign < 0 ? brd.x0 - hw - M * 2 : brd.x1 + hw + M * 2) : 0;
    const Y0 = sign ? (brd.y0 + brd.y1) / 2 : brd.y0 - hh - M * 2;
    let best: { X: number; Y: number; d: number } | null = null;
    for (let X = -320; X <= 320; X += 5) {
      if (sign && Math.sign(X - (brd.x0 + brd.x1) / 2) !== sign) continue;
      for (let Y = -240; Y <= 200; Y += 5) {
        const d = Math.abs(X - X0) + Math.abs(Y - Y0) * 1.3;
        if (best && d >= best.d) continue;
        const r = { x0: X - hw, x1: X + hw, y0: Y - hh, y1: Y + hh };
        if (!hit(r)) best = { X, Y, d };
      }
    }
    const X = best ? best.X : X0, Y = best ? best.Y : Y0;
    taken.push({ x0: X - hw, x1: X + hw, y0: Y - hh, y1: Y + hh });
    out[it.id] = toPlan(X - cxL, Y - cyL);
  }
  return out;
}

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Put each name tag where it covers no part, no other tag and stays inside the safe area of the stage.
 *  Tries above its part first (nearest first), then below, then beside. Returns tag centres. */
export function placeTags(tags: { id: string; w: number; h: number; of: Rect; shortW?: number }[], obstacles: Rect[], safe: Rect, pad = 5): Record<string, { at: Pt; short: boolean }> {
  const placed: Rect[] = [];
  const out: Record<string, { at: Pt; short: boolean }> = {};
  const inSafe = (r: Rect) => r.x0 >= safe.x0 && r.x1 <= safe.x1 && r.y0 >= safe.y0 && r.y1 <= safe.y1;
  // how much a spot covers parts and other labels (0 = free)
  const cover = (r: Rect) => obstacles.concat(placed).reduce((sum, o) => {
    const w = Math.min(r.x1, o.x1 + pad) - Math.max(r.x0, o.x0 - pad), h = Math.min(r.y1, o.y1 + pad) - Math.max(r.y0, o.y0 - pad);
    return sum + (w > 0 && h > 0 ? w * h : 0);
  }, 0);
  const search = (t: { w: number; h: number; of: Rect }) => {
    const cx = (t.of.x0 + t.of.x1) / 2, cy = (t.of.y0 + t.of.y1) / 2, hw = t.w / 2, hh = t.h / 2;
    const cands: Pt[] = [];
    for (let k = 0; k < 10; k++) for (const dx of [0, -0.35, 0.35, -0.7, 0.7, -1.1, 1.1]) cands.push([cx + dx * t.w, t.of.y0 - 10 - hh - k * 12]);
    for (let k = 0; k < 8; k++) for (const dx of [0, -0.35, 0.35, -0.7, 0.7]) cands.push([cx + dx * t.w, t.of.y1 + 10 + hh + k * 12]);
    for (let k = 0; k < 8; k++) for (const sd of [1, -1]) for (const dy of [0, -1, 1, -2, 2]) cands.push([sd > 0 ? t.of.x1 + 10 + hw + k * 12 : t.of.x0 - 10 - hw - k * 12, cy + dy * 16]);
    let best: Pt = [cx, t.of.y0 - 10 - hh], bestCover = Infinity;
    for (const [x, y] of cands) {
      const r = { x0: x - hw, x1: x + hw, y0: y - hh, y1: y + hh };
      if (!inSafe(r)) continue;
      const c = cover(r);
      if (c < bestCover) { best = [x, y]; bestCover = c; if (c === 0) break; } // first free spot wins
    }
    return { best, bestCover };
  };
  for (const t of tags) {
    let res = search(t), short = false, w = t.w;
    if (res.bestCover > 0 && t.shortW) { // no free spot: try the short label
      const alt = search({ ...t, w: t.shortW });
      if (alt.bestCover < res.bestCover) { res = alt; short = true; w = t.shortW; }
    }
    placed.push({ x0: res.best[0] - w / 2, x1: res.best[0] + w / 2, y0: res.best[1] - t.h / 2, y1: res.best[1] + t.h / 2 });
    out[t.id] = { at: res.best, short };
  }
  return out;
}

// ---------------- wire routing ----------------

export type P3 = [number, number, number];
export type Box3D = { id: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

/** A shape's box in plan coordinates (offset by its part's position). */
export function shapeBox(id: string, sh: Shape, dx = 0, dy = 0): Box3D {
  const hw = sh.kind === "cyl" ? sh.r ?? 1 : (sh.w ?? 1) / 2, hd = sh.kind === "cyl" ? sh.r ?? 1 : (sh.d ?? 1) / 2;
  const x = (sh.x ?? 0) + dx, y = (sh.y ?? 0) + dy, z = sh.z ?? 0;
  return { id, x0: x - hw, x1: x + hw, y0: y - hd, y1: y + hd, z0: z, z1: z + sh.h };
}

const inFoot = (b: Box3D, x: number, y: number, m: number) => x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m;

export const PLUG = 6; // length of a jumper's plug housing, mm

/** Route a jumper wire from a part's pin (A) to a board pin (B), the way a real jumper sits:
 *  a plug on each pin (standing straight up on a header, or pointing out of the part's side), then one smooth
 *  arch between the plugs, lifted until it clears every part on the way. Returns [A, plug top, ...arch..., plug top, B]. */
export function routeWire(A: P3, B: P3, own: string, boxes: Box3D[], lane = 0, margin = 1.2, clear = 2.5): P3[] {
  const mine = boxes.filter((b) => b.id === own);
  // the face the pin sits on: a side face of one of the part's blocks (its plug points out), or none (a header
  // pin on top, its plug stands up)
  const eps = 0.35;
  let n: P3 = [0, 0, 1], best = Infinity;
  for (const b of mine) {
    if (A[2] < b.z0 - eps || A[2] > b.z1 + eps) continue;
    const inY = A[1] > b.y0 - eps && A[1] < b.y1 + eps, inX = A[0] > b.x0 - eps && A[0] < b.x1 + eps;
    const faces: [number, P3, boolean][] = [[Math.abs(A[0] - b.x0), [-1, 0, 0], inY], [Math.abs(A[0] - b.x1), [1, 0, 0], inY], [Math.abs(A[1] - b.y0), [0, -1, 0], inX], [Math.abs(A[1] - b.y1), [0, 1, 0], inX]];
    for (const [dd, v, ok] of faces) if (ok && dd < eps && dd < best && A[2] < b.z1 - eps) { best = dd; n = v; }
  }
  const onTop = n[2] === 1;
  const add = (p: P3, v: P3, k: number): P3 => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
  const up: P3 = [0, 0, 1];
  const A1 = add(A, n, PLUG), B1 = add(B, up, PLUG);
  const D = Math.hypot(B1[0] - A1[0], B1[1] - A1[1]);
  const bez = (P0: P3, P1: P3, P2: P3, P3_: P3, t: number): P3 => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * P0[0] + b * P1[0] + c * P2[0] + d * P3_[0], a * P0[1] + b * P1[1] + c * P2[1] + d * P3_[1], a * P0[2] + b * P1[2] + c * P2[2] + d * P3_[2]];
  };
  const steps = Math.max(24, Math.min(90, Math.ceil(D / 1.5)));
  let arch = Math.max(10, Math.min(60, D * 0.32)) + lane;
  let pts: P3[] = [];
  for (let tries = 0; tries < 24; tries++) {
    const P1 = onTop ? add(A1, up, arch) : add(add(A1, n, arch * 0.55), up, arch * 0.45);
    const P2 = add(B1, up, arch);
    pts = Array.from({ length: steps + 1 }, (_, i) => bez(A1, P1, P2, B1, i / steps));
    // anything in the way (the part itself included, past its plug)? lift the arch and try again
    const hit = pts.some((p, i) => i > 1 && i < steps - 1 && boxes.some((b) => inFoot(b, p[0], p[1], margin) && p[2] < b.z1 + clear && p[2] > b.z0 - 1));
    if (!hit) break;
    arch += 5;
  }
  return [A, ...pts, B];
}

