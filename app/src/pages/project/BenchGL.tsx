/** The Wiring bench in real 3D (WebGL, three.js): orbit, pan and zoom the camera freely, wires are cables in
 *  space, and clicking a part flies the camera to a close-up with every pin labelled. Same props as Bench3D,
 *  which stays as the fallback when WebGL isn't available. */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { calm } from "../../lib/router";
import { Icon } from "../../components/Icon";
import { placeTags, type Rect, type Shape } from "../../lib/iso";
import { CAP, pinRole, useBenchData, wid, type BenchProps, type BenchWire, type Inst } from "./benchData";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, z, y); // plan (x right, y toward you, z up) → three (y up)
const DEG = Math.PI / 180;
const VIEWS = { iso: { az: 35, polar: 52 }, top: { az: 0, polar: 1 }, front: { az: 0, polar: 78 } } as const;
type ViewName = keyof typeof VIEWS;

type GL = {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
  content: THREE.Group; groundMat: THREE.MeshBasicMaterial; gridTex: THREE.CanvasTexture; sun: THREE.DirectionalLight;
  ink: THREE.LineBasicMaterial; flowTex: THREE.Texture; dirty: boolean; tween: number; raf: number;
  parts: Map<string, THREE.Group>; wires: Map<string, { mats: THREE.MeshLambertMaterial[]; flow: THREE.Mesh }>; glow: Map<string, THREE.Mesh[]>;
  pickables: THREE.Object3D[]; board: THREE.Group | null; saved: { pos: THREE.Vector3; target: THREE.Vector3 } | null;
};

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export default function BenchGL(p: BenchProps) {
  const { board, wires, mode } = p;
  const d = useBenchData(board, p.parts, wires);
  const host = useRef<HTMLDivElement>(null);
  const gl = useRef<GL | null>(null);
  const [, setTick] = useState(0);
  const [size, setSize] = useState({ w: 900, h: 576 });
  const [labels, setLabels] = useState(true);
  const [flow, setFlow] = useState(false);
  const [schem, setSchem] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? "light");
  const [ready, setReady] = useState(false);
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const showParts = mode === "project";
  const focus = showParts && p.selPart ? d.insts.find((x) => x.id === p.selPart) ?? null : null;

  // ---------- set up three.js once ----------
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "bench-canvas";
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 16 / 10, 2, 6000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !calm();
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    controls.minPolarAngle = 0.5 * DEG;
    controls.maxPolarAngle = 84 * DEG; // never under the table
    controls.minDistance = 25;
    controls.maxDistance = 1500;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcdbfa8, 2.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 6;
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);
    // paper ground: an exact-colour grid that ignores lighting, plus a shadow catcher on top
    const gridTex = new THREE.CanvasTexture(document.createElement("canvas"));
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(80, 80);
    gridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    gridTex.colorSpace = THREE.SRGBColorSpace;
    const groundMat = new THREE.MeshBasicMaterial({ map: gridTex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), groundMat);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.2 }));
    catcher.position.y = 0.05;
    catcher.receiveShadow = true;
    scene.add(ground, catcher);
    const content = new THREE.Group();
    scene.add(content);
    const flowTex = stripeTexture();
    const g: GL = {
      renderer, scene, camera, controls, content, groundMat, gridTex, sun, ink: new THREE.LineBasicMaterial({ color: 0x1c2333, transparent: true, opacity: 0.85 }),
      flowTex, dirty: true, tween: 0, raf: 0, parts: new Map(), wires: new Map(), glow: new Map(), pickables: [], board: null, saved: null,
    };
    gl.current = g;
    let overlayQueued = false;
    const refreshOverlay = () => { if (overlayQueued) return; overlayQueued = true; requestAnimationFrame(() => { overlayQueued = false; setTick((t) => t + 1); }); };
    controls.addEventListener("change", () => { g.dirty = true; refreshOverlay(); });
    let last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const moved = controls.update();
      if (flowRef.current && !calm()) { flowTex.offset.x -= dt * 1.6; g.dirty = true; }
      if (g.dirty || moved) { renderer.render(scene, camera); g.dirty = false; }
      g.raf = requestAnimationFrame(loop);
    };
    g.raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = Math.round(Math.max(420, Math.min(720, w * 0.64)));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      setSize({ w, h });
      g.dirty = true;
    });
    ro.observe(el);
    const mo = new MutationObserver(() => setTheme(document.documentElement.dataset.theme ?? "light"));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    setReady(true);
    return () => {
      cancelAnimationFrame(g.raf);
      cancelAnimationFrame(g.tween);
      ro.disconnect();
      mo.disconnect();
      controls.dispose();
      disposeTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
      gl.current = null;
    };
  }, []);

  // ---------- theme: paper, grid, ink ----------
  useEffect(() => {
    const g = gl.current;
    if (!g) return;
    const paper = css("--paper", "#F6EFE1");
    g.scene.background = new THREE.Color(paper);
    drawGrid(g.gridTex, paper, css("--paper-grid", "rgba(120,92,52,.10)"), css("--paper-grid-2", "rgba(120,92,52,.16)"));
    g.ink.color.set(css("--ink", "#1C2333"));
    g.dirty = true;
  }, [theme, ready]);

  // ---------- build the bench ----------
  const pinMap = useMemo(() => new Map(d.pins.map((x) => [`${x.row}-${x.i}`, x])), [d.pins]);
  useEffect(() => {
    const g = gl.current;
    if (!g) return;
    disposeTree(g.content);
    g.content.clear();
    g.parts.clear(); g.wires.clear(); g.glow.clear(); g.pickables = [];
    const mats = new Map<string, THREE.MeshLambertMaterial>();
    const mat = (c: string) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); mats.set(c, m); } return m; };

    // the board: its shapes, silkscreen, antenna trace, chip markings, pin targets
    const b = new THREE.Group();
    d.boardShapes.forEach((sh) => b.add(shapeMesh(sh, mat, g.ink)));
    const [bw, bd, bt] = d.model.size;
    const silk = silkPlane(d.model, d.pins, d.silkName);
    silk.position.y = bt + 0.02;
    b.add(silk);
    for (const sh of d.model.shapes ?? []) {
      const top = (sh.z ?? 0) + bt + sh.h + 0.03;
      if (sh.text) { const t = textPlane(sh, sh.color === "#b9c1cc" ? "#5b6472" : "rgba(255,255,255,.6)"); t.position.set(sh.x ?? 0, top, sh.y ?? 0); b.add(t); }
      if (sh.antenna) b.add(antennaLine(sh, top));
    }
    const hitGeo = new THREE.BoxGeometry(2.2, 1.6, 2.2), hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const ringGeo = new THREE.RingGeometry(0.95, 1.45, 28).rotateX(-Math.PI / 2), ringMat = new THREE.MeshBasicMaterial({ color: css("--hot", "#F56300"), side: THREE.DoubleSide });
    for (const pn of d.pins) {
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.copy(V(pn.x, pn.y, d.pinZ - 0.4));
      hit.userData = { pin: pn.id };
      b.add(hit);
      g.pickables.push(hit);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(V(pn.x, pn.y, d.pinZ + 0.15));
      ring.visible = false;
      b.add(ring);
      g.glow.set(pn.id, [...(g.glow.get(pn.id) ?? []), ring]);
    }
    b.userData = { board: true };
    g.content.add(b);
    g.board = b;
    void bw; void bd; void pinMap;

    // parts and wires (Project view)
    if (showParts) {
      for (const it of d.insts) {
        const grp = new THREE.Group();
        grp.position.copy(V(it.at[0], it.at[1], 0));
        it.model.shapes.forEach((sh) => grp.add(shapeMesh(sh, mat, g.ink)));
        grp.traverse((o) => { o.userData.part = it.id; });
        g.content.add(grp);
        g.parts.set(it.id, grp);
        g.pickables.push(...grp.children.filter((c) => (c as THREE.Mesh).isMesh));
      }
      const hitWireMat = new THREE.MeshBasicMaterial({ visible: false });
      for (const w of wires) {
        if (!w.boardPin) continue;
        const it = d.insts.find((x) => x.id === `${w.part}#${w.instance}`), bp = d.pins.find((x) => x.id === String(w.boardPin)), a = it?.model.pins[w.partPin];
        if (!it || !bp || !a) continue;
        const A = V(a[0] + it.at[0], a[1] + it.at[1], a[2]), B = V(bp.x, bp.y, d.pinZ);
        const lift = 8 + A.distanceTo(B) * 0.22;
        const curve = new THREE.CubicBezierCurve3(A, A.clone().add(new THREE.Vector3(0, lift, 0)), B.clone().add(new THREE.Vector3(0, lift, 0)), B);
        const col = p.color[wid(w)] ?? "#ff9f0a";
        const wm = new THREE.MeshLambertMaterial({ color: col, transparent: true });
        if (p.bad(w)) { wm.alphaMap = stripeTexture(10); wm.alphaMap.repeat.set(14, 1); wm.alphaTest = 0.5; }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.45, 8), wm);
        tube.castShadow = true;
        const endM = new THREE.MeshLambertMaterial({ color: col, transparent: true });
        const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), endM), e2 = e1.clone();
        e1.position.copy(A); e2.position.copy(B);
        const fl = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: g.flowTex, transparent: true, depthWrite: false }));
        fl.visible = false;
        const hit = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 1.8, 6), hitWireMat);
        hit.userData = { wire: wid(w) };
        g.content.add(tube, e1, e2, fl, hit);
        g.pickables.push(hit);
        g.wires.set(wid(w), { mats: [wm, endM], flow: fl });
      }
    }
    g.content.traverse((o) => { if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).userData.pin && !(o as THREE.Mesh).userData.wire) { o.castShadow = true; } });
    g.dirty = true;
  }, [ready, d.boardShapes, d.insts, wires, showParts, p.color, theme]);

  // ---------- frame the bench (new data or view) ----------
  const frameKey = `${mode}|${d.insts.map((x) => x.id).join()}|${board.board}`;
  useEffect(() => {
    const g = gl.current;
    if (!g || focus) return;
    frame(g, VIEWS.iso, false, null, mode === "board" ? 0.5 : 0.8); // Board view leaves room for the callouts
    g.saved = null;
  }, [ready, frameKey]);

  // ---------- close-up on a part ----------
  useEffect(() => {
    const g = gl.current;
    if (!g) return;
    if (focus) {
      const grp = g.parts.get(focus.id);
      if (!grp) return;
      if (!g.saved) g.saved = { pos: g.camera.position.clone(), target: g.controls.target.clone() };
      frame(g, { az: 45, polar: 55 }, true, grp);
    } else if (g.saved) {
      fly(g, g.saved.target, g.saved.pos);
      g.saved = null;
    }
  }, [focus?.id, ready]);

  // ---------- highlight: traced wire, selected part, hovered pin, flow ----------
  const tracedWire = wires.find((w) => wid(w) === p.traced) ?? null;
  useEffect(() => {
    const g = gl.current;
    if (!g) return;
    const lit = new Set<string>();
    if (tracedWire?.boardPin) lit.add(String(tracedWire.boardPin));
    if (p.selPart) wires.filter((w) => `${w.part}#${w.instance}` === p.selPart && w.boardPin).forEach((w) => lit.add(String(w.boardPin)));
    if (hover) lit.add(hover);
    if (p.pin) lit.add(p.pin);
    g.glow.forEach((rings, id) => rings.forEach((r) => { r.visible = lit.has(id); }));
    for (const w of wires) {
      const e = g.wires.get(wid(w));
      if (!e) continue;
      const dim = p.traced ? wid(w) !== p.traced : p.selPart ? `${w.part}#${w.instance}` !== p.selPart : false;
      e.mats.forEach((m) => { m.opacity = dim ? 0.12 : 1; m.depthWrite = !dim; });
      e.flow.visible = flow && !dim;
    }
    // close-up: other parts fade back
    g.parts.forEach((grp, id) => fade(grp, !!focus && id !== focus.id));
    g.dirty = true;
  }, [p.traced, p.selPart, hover, p.pin, flow, focus?.id, wires, ready, d.insts]);

  // ---------- picking ----------
  const down = useRef<{ x: number; y: number } | null>(null);
  const pick = (e: React.PointerEvent): THREE.Object3D | null => {
    const g = gl.current;
    if (!g) return null;
    const r = g.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), g.camera);
    const hits = ray.intersectObjects(g.pickables, false);
    const pinHit = hits.find((h) => h.object.userData.pin);
    if (pinHit && (!hits[0] || hits[0].distance > pinHit.distance - 3)) return pinHit.object;
    return hits.find((h) => h.object.userData.wire || (h.object.userData.part && !(focus && h.object.userData.part !== focus.id)))?.object ?? null;
  };
  const onPointerDown = (e: React.PointerEvent) => { down.current = { x: e.clientX, y: e.clientY }; };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons) return;
    const o = pick(e);
    const id = o?.userData.pin ?? null;
    if (id !== hover) setHover(id);
    (e.currentTarget as HTMLElement).style.cursor = o ? "pointer" : "grab";
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = down.current;
    down.current = null;
    if (!s || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 5) return; // that was a drag
    const o = pick(e);
    if (!o) { if (focus) p.setSelPart(null); else { p.setTraced(null); p.setSelPart(null); } setHot(null); return; }
    const u = o.userData;
    if (u.pin) {
      if (tracedWire && d.pinInfo(u.pin) && String(tracedWire.boardPin) !== u.pin) p.onMove(tracedWire, u.pin);
      else p.setPin(p.pin === u.pin ? null : u.pin);
    } else if (u.wire) { p.setTraced(p.traced === u.wire ? null : u.wire); p.setSelPart(null); }
    else if (u.part) { p.setSelPart(u.part); p.setTraced(null); }
  };

  // ---------- camera buttons ----------
  const turn = (deg: number) => { const g = gl.current; if (!g) return; const off = g.camera.position.clone().sub(g.controls.target); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * DEG); fly(g, g.controls.target.clone(), g.controls.target.clone().add(off)); };
  const zoom = (k: number) => { const g = gl.current; if (!g) return; const off = g.camera.position.clone().sub(g.controls.target).multiplyScalar(k); fly(g, g.controls.target.clone(), g.controls.target.clone().add(off)); };
  const view = (v: ViewName) => { const g = gl.current; if (g) frame(g, VIEWS[v], true, focus ? g.parts.get(focus.id) ?? null : null, focus ? undefined : mode === "board" ? 0.5 : 0.8); };

  // ---------- overlay: everything projected from 3D ----------
  const g = gl.current;
  const toScreen = (v: THREE.Vector3) => { if (!g) return { x: 0, y: 0, behind: true }; const q = v.clone().project(g.camera); return { x: ((q.x + 1) / 2) * size.w, y: ((1 - q.y) / 2) * size.h, behind: q.z > 1 }; };
  const rectOf = (o: THREE.Object3D): Rect => {
    const box = new THREE.Box3().setFromObject(o);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
      const s = toScreen(new THREE.Vector3(cx, cy, cz));
      x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
    }
    return { x0, y0, x1, y1 };
  };
  const lines: { x1: number; y1: number; x2: number; y2: number; k: string }[] = [];
  const overlay: JSX.Element[] = [];
  if (g && ready) {
    g.camera.updateMatrixWorld();
    const rects = new Map<string, Rect>();
    g.parts.forEach((grp, id) => rects.set(id, rectOf(grp)));
    const boardRect = g.board ? rectOf(g.board) : null;
    const safe = { x0: 8, y0: 56, x1: size.w - 8, y1: size.h - 76 };

    if (labels && showParts && !focus) {
      const tags = d.insts.filter((it) => rects.has(it.id)).map((it) => {
        const n = wires.filter((w) => `${w.part}#${w.instance}` === it.id && w.boardPin).length;
        const label = `${it.part.title}${it.part.qty > 1 ? ` #${it.inst}` : ""}${n ? ` · ${n} wire${n > 1 ? "s" : ""}` : ""}`.toUpperCase();
        const short = `${it.part.title.split(/[ (]/)[0]}${it.part.qty > 1 ? ` #${it.inst}` : ""}`.toUpperCase();
        return { it, label, short, w: label.length * 7 + 26, shortW: short.length * 7 + 26, of: rects.get(it.id)! };
      });
      const obstacles = [...rects.values(), ...(boardRect ? [boardRect] : [])];
      const at = placeTags(tags.map((t) => ({ id: t.it.id, w: t.w, shortW: t.shortW, h: 24, of: t.of })), obstacles, safe);
      for (const t of tags) {
        const spot = at[t.it.id], [x, y] = spot.at, w = spot.short ? t.shortW : t.w;
        lines.push({ ...leader(t.of, x, y, w, 24), k: `l-${t.it.id}` });
        overlay.push(
          <button key={`tag-${t.it.id}`} type="button" className={`gl-tag ${p.selPart === t.it.id ? "on" : ""}`} style={{ left: x - w / 2, top: y - 12, width: w }}
            onClick={() => { p.setSelPart(t.it.id); p.setTraced(null); }} aria-label={`Close-up of ${t.it.part.title}`}>
            {spot.short ? t.short : t.label}
          </button>,
        );
      }
    }

    if (focus) overlay.push(...pinCallouts(focus, rects.get(focus.id) ?? null, safe, lines));

    if (mode === "board" && labels) {
      const spots = (d.model.hotspots ?? []).map((h, i) => {
        let pt: THREE.Vector3;
        if (h.row !== undefined) { const rp = d.pins.filter((x) => x.row === h.row); const mid = rp[Math.floor(rp.length / 3)] ?? rp[0]; pt = V(mid?.x ?? 0, mid?.y ?? 0, d.pinZ); }
        else pt = V(h.x ?? 0, h.y ?? 0, (h.z ?? 0) + d.model.size[2]);
        return { h, i, s: toScreen(pt) };
      });
      const left = spots.filter((s) => s.s.x < size.w / 2).sort((a, b) => a.s.y - b.s.y), right = spots.filter((s) => s.s.x >= size.w / 2).sort((a, b) => a.s.y - b.s.y);
      const cardW = Math.min(230, Math.max(170, size.w * 0.24));
      const place = (list: typeof spots, x: number) => list.forEach((s, k) => {
        const span = safe.y1 - safe.y0 - 70, top = list.length > 1 ? safe.y0 + 6 + (k * span) / (list.length - 1) : safe.y0 + span / 2;
        const ax = x < size.w / 2 ? x + cardW : x;
        lines.push({ x1: s.s.x, y1: s.s.y, x2: ax, y2: Math.max(top + 14, Math.min(top + 52, s.s.y)), k: `c-${s.i}` });
        overlay.push(<div key={`card-${s.i}`} className="gl-card" style={{ left: x, top, width: cardW }}><b>{s.h.title}</b><span>{s.h.body}</span></div>);
      });
      place(left, 14);
      place(right, size.w - cardW - 14);
      spots.forEach((s) => overlay.push(
        <button key={`hot-${s.i}`} type="button" className="gl-hot" style={{ left: s.s.x, top: s.s.y }} aria-label={s.h.title}
          onMouseEnter={() => setHot(s.i)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(s.i)} onBlur={() => setHot(null)} onClick={() => setHot(hot === s.i ? null : s.i)} />,
      ));
      if (hot !== null && spots[hot]) overlay.push(<div key="hot-tip" className="bench-tip" style={{ left: spots[hot].s.x, top: spots[hot].s.y }}><b>{spots[hot].h.title}</b><div className="to">{spots[hot].h.body}</div></div>);
    }

    // pin tooltip
    const tipPin = hover ?? (mode === "board" ? p.pin : null);
    const pn = tipPin ? d.pins.find((x) => x.id === tipPin) : null;
    if (pn) {
      const s = toScreen(V(pn.x, pn.y, d.pinZ)), info = d.pinInfo(pn.id), on = wires.filter((w) => String(w.boardPin) === pn.id);
      overlay.push(
        <div key="tip" className="bench-tip" style={{ left: s.x, top: s.y }}>
          <b>{d.silkName(pn.id)}</b>{info && <span className="lbl"> {info.label}</span>}
          {info?.caps?.length ? <div className="caps">{info.caps.map((c) => <span key={c} className="cap">{CAP[c] ?? c}</span>)}{info.strapping && <span className="cap warn">Boot pin</span>}{info.reserved && <span className="cap warn">{info.reserved}</span>}</div> : null}
          <div className="to">{info?.note ?? (info ? "" : pinRole(pn.id))}</div>
          {info && <div className="to">{on.length ? on.map((w) => <div key={wid(w)}>Wired to <b>{p.parts.find((x) => x.key === w.part)?.title ?? w.part} {w.partPin}</b> · <span className="font-mono">{w.signalName}</span></div>) : "Free: nothing wired here."}</div>}
          {tracedWire && info && String(tracedWire.boardPin) !== pn.id && <div className="hint">Click to move {tracedWire.signalName} here</div>}
        </div>,
      );
    }
  }

  function pinCallouts(it: Inst, of: Rect | null, safe: Rect, out: typeof lines): JSX.Element[] {
    if (!of || !g) return [];
    const names = Object.keys(it.model.pins);
    const metaPins = it.part.meta.pins ?? [];
    const items = names.map((name) => {
      const a = it.model.pins[name], s = toScreen(V(a[0] + it.at[0], a[1] + it.at[1], a[2]));
      const w = wires.find((x) => x.part === it.part.key && x.instance === it.inst && x.partPin === name);
      const m = metaPins.find((x) => x.name === name), mode = (m?.mode ?? "").toUpperCase();
      const text = w?.boardPin ? `${name} → ${d.silkName(String(w.boardPin))}` : mode === "POWER" ? `${name} · power${m?.voltage ? ` ${m.voltage}` : ""}` : mode === "GROUND" ? `${name} · ground` : mode === "MOTOR" ? `${name} · to the driver` : `${name} · not wired`;
      const sub = w?.boardPin ? w.signalName : "";
      return { name, s, w, text, sub, width: Math.max(text.length * 7 + 26, sub.length * 6.6 + 26) };
    });
    const at = placeTags(items.map((x) => ({ id: x.name, w: x.width, h: x.sub ? 38 : 24, of: { x0: x.s.x - 2, x1: x.s.x + 2, y0: x.s.y - 2, y1: x.s.y + 2 } })), [of], safe, 4);
    return items.map((x) => {
      const spot = at[x.name], [cx, cy] = spot.at, h = x.sub ? 38 : 24;
      out.push({ x1: x.s.x, y1: x.s.y, x2: Math.max(cx - x.width / 2, Math.min(cx + x.width / 2, x.s.x)), y2: cy < x.s.y ? cy + h / 2 : cy - h / 2, k: `p-${x.name}` });
      const col = x.w ? p.color[wid(x.w)] : undefined;
      return (
        <div key={`pc-${x.name}`} className={`gl-pin ${x.w?.boardPin ? "on" : ""}`} style={{ left: cx - x.width / 2, top: cy - h / 2, width: x.width }}>
          <span className="gl-pin-row">{col && <i style={{ background: col }} />}<b>{x.text}</b></span>
          {x.sub && <span className="font-mono">{x.sub}</span>}
        </div>
      );
    });
  }

  const sigWires = wires.filter((w) => w.boardPin);
  const hint = focus ? "Close-up · drag to look around" : mode === "board" ? "Meet the board · hover a pin" : tracedWire ? `${tracedWire.signalName}: click a pin to move it` : "Drag to turn · right-drag to move · scroll to zoom";

  return (
    <section className="bench bench-gl" aria-label={`3D wiring bench for ${board.name}`}>
      <div ref={host} className="gl-host" style={{ height: size.h }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        role="img" aria-label={`${board.name}${showParts ? ` with ${d.insts.length} parts and ${sigWires.length} wires` : ""}. Drag to turn the camera.`}>
        <svg className="gl-lines" width={size.w} height={size.h} aria-hidden="true">
          {lines.map((l) => <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
        </svg>
        <div className="gl-overlay">{overlay}</div>
      </div>
      <div className="bench-top">
        <div className="bench-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={mode === "board"} onClick={() => { p.setSelPart(null); p.setMode("board"); }}>Board</button>
          <button type="button" aria-pressed={mode === "project"} onClick={() => p.setMode("project")}>Project</button>
        </div>
        {focus ? (
          <div className="gl-focus">
            <b>{focus.part.title}{focus.part.qty > 1 ? ` #${focus.inst}` : ""}</b>
            <span>{wires.filter((w) => w.part === focus.part.key && w.instance === focus.inst && w.boardPin).length} of {Object.keys(focus.model.pins).length} pins wired</span>
            <button type="button" className="btn btn-sm" onClick={() => p.setSelPart(null)}><Icon name="left" />Back to bench</button>
          </div>
        ) : <span className="bench-hint">{hint}</span>}
      </div>
      {schem && (
        <div className="bench-schem">
          <h3>Schematic <span>signal wires</span></h3>
          <svg viewBox={`0 0 320 ${Math.max(1, sigWires.length) * 18 + 16}`} role="img" aria-label="Schematic of the signal wires">
            <rect x="4" y="6" width="64" height={Math.max(1, sigWires.length) * 18 + 4} rx="6" fill="none" stroke="var(--label)" strokeWidth="1.3" />
            <text x="36" y={(Math.max(1, sigWires.length) * 18 + 16) / 2 + 3} textAnchor="middle">{board.name.split(" ")[0]}</text>
            {sigWires.map((w, i) => { const y = 18 + i * 18; return (
              <g key={wid(w)}><text x="72" y={y + 3} className="muted">{d.silkName(String(w.boardPin))}</text><line x1="104" y1={y} x2="196" y2={y} stroke={p.color[wid(w)]} strokeWidth="2" /><circle cx="196" cy={y} r="2.4" fill={p.color[wid(w)]} /><text x="202" y={y + 3}>{(p.parts.find((x) => x.key === w.part)?.title ?? w.part).slice(0, 12)} {w.partPin}</text></g>
            ); })}
            {!sigWires.length && <text x="80" y="20" className="muted">No signal wires yet</text>}
          </svg>
        </div>
      )}
      <div className="bench-tools" role="toolbar" aria-label="Camera and view">
        <button type="button" aria-label="Turn left" title="Turn left" onClick={() => turn(-90)}><Icon name="rot-l" /></button>
        <button type="button" aria-label="Turn right" title="Turn right" onClick={() => turn(90)}><Icon name="rot-r" /></button>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.3)}><Icon name="minus" /></button>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1 / 1.3)}><Icon name="plus" /></button>
        <span className="sep" aria-hidden="true" />
        <button type="button" className="txt" aria-label="Angled view" title="Angled view" onClick={() => view("iso")}>3D</button>
        <button type="button" className="txt" aria-label="Top view" title="Top view" onClick={() => view("top")}>Top</button>
        <button type="button" className="txt" aria-label="Front view" title="Front view" onClick={() => view("front")}>Front</button>
        <button type="button" aria-label="Reset view" title="Reset view" onClick={() => { p.setSelPart(null); p.setTraced(null); const gg = gl.current; if (gg) { gg.saved = null; frame(gg, VIEWS.iso, true, null, mode === "board" ? 0.5 : 0.8); } }}><Icon name="fit" /></button>
        <span className="sep" aria-hidden="true" />
        <button type="button" aria-pressed={labels} aria-label="Labels" title="Labels" onClick={() => setLabels(!labels)}><Icon name="tag" /></button>
        <button type="button" aria-pressed={flow} aria-label="Show current flow" title="Show current flow" onClick={() => setFlow(!flow)}><Icon name="pulse" /></button>
        <button type="button" aria-pressed={schem} aria-label="Show schematic" title="Show schematic" onClick={() => setSchem(!schem)}><Icon name="schem" /></button>
      </div>
    </section>
  );
}

// ---------------- helpers ----------------

function sphere(target: THREE.Vector3, dist: number, azDeg: number, polarDeg: number) {
  const ph = polarDeg * DEG, th = azDeg * DEG;
  return new THREE.Vector3(target.x + dist * Math.sin(ph) * Math.sin(th), target.y + dist * Math.cos(ph), target.z + dist * Math.sin(ph) * Math.cos(th));
}

/** Fit the camera to everything on the bench (or one object) from a named direction:
 *  place it, project the box's corners, and adjust the distance until the box fills the view. */
function frame(g: GL, v: { az: number; polar: number }, animate: boolean, only: THREE.Object3D | null = null, fillTo?: number) {
  const box = new THREE.Box3().setFromObject(only ?? g.content);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), r = Math.max(10, box.getSize(new THREE.Vector3()).length() / 2);
  const fill = fillTo ?? (only ? 0.55 : 0.8); // how much of the view the bench should fill
  // fit to each object's own box: the parts sit on a diagonal, so one box around everything has big empty corners
  const pts: THREE.Vector3[] = [];
  for (const o of only ? [only] : g.content.children) {
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) continue;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z));
  }
  const cam = g.camera.clone();
  let dist = r / Math.tan((g.camera.fov * DEG) / 2), aim = c.clone();
  for (let i = 0; i < 5; i++) {
    cam.position.copy(sphere(aim, dist, v.az, v.polar));
    cam.lookAt(aim);
    cam.updateMatrixWorld();
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    for (const p of pts) { const q = p.clone().project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    // recentre on what is actually drawn, then scale to fill
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const halfH = Math.tan((cam.fov * DEG) / 2) * dist, halfW = halfH * cam.aspect;
    aim.add(right.multiplyScalar(((x0 + x1) / 2) * halfW)).add(up.multiplyScalar(((y0 + y1) / 2) * halfH));
    const m = Math.max((x1 - x0) / 2, ((y1 - y0) / 2) * 1.1);
    dist *= Math.max(0.5, Math.min(2, m / fill));
  }
  c.copy(aim);
  const pos = sphere(c, dist, v.az, v.polar);
  if (!only) { // light and shadows follow the whole bench (not a close-up)
    g.sun.position.copy(c).add(new THREE.Vector3(-r * 1.2, r * 2.4, r * 1.4));
    g.sun.target.position.copy(c);
    const sc = g.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -r * 1.6; sc.right = sc.top = r * 1.6; sc.near = 1; sc.far = r * 8;
    sc.updateProjectionMatrix();
  }
  if (animate) fly(g, c, pos);
  else { g.controls.target.copy(c); g.camera.position.copy(pos); g.controls.update(); g.dirty = true; }
}

/** Move the camera smoothly (or at once, with reduced motion). */
function fly(g: GL, target: THREE.Vector3, pos: THREE.Vector3, ms = 650) {
  cancelAnimationFrame(g.tween);
  if (calm()) { g.controls.target.copy(target); g.camera.position.copy(pos); g.controls.update(); g.dirty = true; return; }
  const t0 = performance.now(), fromT = g.controls.target.clone(), fromP = g.camera.position.clone();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    g.controls.target.lerpVectors(fromT, target, e);
    g.camera.position.lerpVectors(fromP, pos, e);
    g.controls.update();
    g.dirty = true;
    g.controls.dispatchEvent({ type: "change" });
    if (k < 1) g.tween = requestAnimationFrame(step);
  };
  g.tween = requestAnimationFrame(step);
}

function shapeMesh(sh: Shape, mat: (c: string) => THREE.MeshLambertMaterial, ink: THREE.LineBasicMaterial) {
  const side = mat(sh.color), top = mat(sh.top ?? shade(sh.color, 0.06));
  let geo: THREE.BufferGeometry, mesh: THREE.Mesh;
  if (sh.kind === "cyl") {
    geo = new THREE.CylinderGeometry(sh.r ?? 2, sh.r ?? 2, sh.h, 36);
    mesh = new THREE.Mesh(geo, [side, top, side]);
    if (sh.inner) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry((sh.r ?? 2) * 0.68, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: sh.inner }));
      disc.position.y = sh.h / 2 + 0.03;
      mesh.add(disc);
    }
  } else {
    geo = new THREE.BoxGeometry(sh.w ?? 1, sh.h, sh.d ?? 1);
    mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
  }
  mesh.position.copy(V(sh.x ?? 0, sh.y ?? 0, (sh.z ?? 0) + sh.h / 2));
  if ((sh.w ?? 9) > 1.2 || sh.kind === "cyl") mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), ink)); // ink outlines (skip the tiny pins)
  return mesh;
}

function fade(grp: THREE.Group, on: boolean) {
  grp.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.LineSegments).isLineSegments) { o.visible = !on; return; }
    if (!m.isMesh) return;
    if (on && !m.userData.solid) { m.userData.solid = m.material; m.material = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => { const c = (x as THREE.MeshLambertMaterial).clone(); c.transparent = true; c.opacity = 0.16; c.depthWrite = false; return c; }); }
    if (!on && m.userData.solid) { (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); m.material = m.userData.solid; delete m.userData.solid; }
  });
}

function shade(hex: string, f: number) {
  const c = new THREE.Color(hex);
  return `#${c.lerp(new THREE.Color(f < 0 ? 0x000000 : 0xffffff), Math.abs(f)).getHexString()}`;
}

function leader(of: Rect, x: number, y: number, w: number, h: number) {
  const ax = Math.max(of.x0, Math.min(of.x1, x)), ay = y < of.y0 ? of.y0 : y > of.y1 ? of.y1 : (of.y0 + of.y1) / 2;
  const bx = Math.max(x - w / 2, Math.min(x + w / 2, ax)), by = ay < y - h / 2 ? y - h / 2 : ay > y + h / 2 ? y + h / 2 : y;
  return { x1: ax, y1: ay, x2: bx, y2: by };
}

function stripeTexture(cells = 8) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 4;
  const x = c.getContext("2d")!;
  x.fillStyle = "#000"; x.fillRect(0, 0, 64, 4);
  x.fillStyle = "#fff";
  for (let i = 0; i < 64; i += 64 / cells) x.fillRect(i, 0, 32 / cells, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 1);
  return t;
}

function drawGrid(tex: THREE.CanvasTexture, paper: string, minor: string, major: string) {
  const c = tex.image as HTMLCanvasElement;
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = paper; x.fillRect(0, 0, 256, 256);
  x.lineWidth = 1;
  x.strokeStyle = minor;
  for (let i = 0; i < 256; i += 25.6) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, 256); x.moveTo(0, i + 0.5); x.lineTo(256, i + 0.5); x.stroke(); }
  x.strokeStyle = major; x.lineWidth = 2;
  x.strokeRect(1, 1, 254, 254);
  tex.needsUpdate = true;
}

/** Silkscreen on the board's top: pin names beside the headers, the board's name, an outline. */
function silkPlane(model: import("../../lib/iso").BoardModel, pins: ReturnType<typeof import("../../lib/iso").boardPins>, name: (id: string) => string) {
  const [bw, bd] = model.size, ppm = 22, c = document.createElement("canvas");
  c.width = Math.round(bw * ppm); c.height = Math.round(bd * ppm);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = () => {
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = x.strokeStyle = model.silk ?? "#e9eef8";
    x.textBaseline = "middle";
    x.font = `600 ${1.05 * ppm}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
    for (const p of pins) {
      x.textAlign = p.x < 0 ? "left" : "right";
      x.fillText(name(p.id), (p.x + bw / 2 + (p.x < 0 ? 1.9 : -1.9)) * ppm, (p.y + bd / 2) * ppm);
    }
    if (model.label) { x.textAlign = "center"; x.font = `600 ${1.7 * ppm}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`; x.fillText(model.label, ((model.label_at?.[0] ?? 0) + bw / 2) * ppm, ((model.label_at?.[1] ?? 0) + bd / 2) * ppm); }
    x.globalAlpha = 0.25; x.lineWidth = 0.25 * ppm;
    x.beginPath(); x.roundRect(0.8 * ppm, 0.8 * ppm, (bw - 1.6) * ppm, (bd - 1.6) * ppm, 1.6 * ppm); x.stroke();
    x.globalAlpha = 1;
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load(`600 20px "Barlow Semi Condensed"`).then(draw).catch(() => {});
  const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  return m;
}

function textPlane(sh: Shape, color: string) {
  const w = sh.w ?? 10, dd = sh.d ?? 4, ppm = 24, c = document.createElement("canvas");
  c.width = Math.round(w * ppm); c.height = Math.round(dd * ppm);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle";
    const size = Math.min(1.9, ((w * 0.9) / Math.max(4, (sh.text ?? "").length)) * 1.7) * ppm;
    x.font = `600 ${size}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
    x.fillText(sh.text ?? "", c.width / 2, c.height / 2);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load(`600 20px "Barlow Semi Condensed"`).then(draw).catch(() => {});
  return new THREE.Mesh(new THREE.PlaneGeometry(w, dd).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}

function antennaLine(sh: Shape, top: number) {
  const x0 = sh.x ?? 0, y0 = (sh.y ?? 0) - (sh.d ?? 0) / 2 + 0.9, w = (sh.w ?? 10) * 0.8, n = 5, pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const xx = x0 - w / 2 + (i * w) / n;
    pts.push(V(xx, i % 2 ? y0 + 2.4 : y0, top), V(xx, i % 2 ? y0 : y0 + 2.4, top));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xd9a93a }));
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    mats.forEach((x) => { const mm = x as THREE.MeshBasicMaterial; mm.map?.dispose(); mm.alphaMap?.dispose(); mm.dispose(); });
  });
}

export type { BenchWire };
